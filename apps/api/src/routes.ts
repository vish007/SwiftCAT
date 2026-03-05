import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AgentRunStatus, AgentStepStatus, type Prisma } from '@prisma/client';
import { loginSchema } from '@swiftcat/shared';
import { defaultStepStatus, runAgentForWorkItem } from './agent-runtime.js';
import { prisma } from './prisma.js';
import { ToolRuntime } from './tools.js';

export async function registerRoutes(app: FastifyInstance) {
  const toolRuntime = new ToolRuntime(prisma);

  app.get('/health', {
    schema: { tags: ['system'], summary: 'Health check' }
  }, async () => ({ ok: true }));

  app.post('/auth/login', {
    schema: {
      tags: ['auth'],
      summary: 'Login with username/password',
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const payload = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { username: payload.username }, include: { role: true } });
    if (!user) {
      return reply.code(401).send({ message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(payload.password, user.passwordHash);
    if (!isValid) {
      return reply.code(401).send({ message: 'Invalid credentials' });
    }

    const accessToken = await reply.jwtSign(
      { username: user.username, role: user.role.name },
      { expiresIn: '15m', sub: String(user.id) }
    );

    const refreshToken = await reply.jwtSign(
      { username: user.username, role: user.role.name, tokenType: 'refresh' },
      { expiresIn: '7d', sub: String(user.id), secret: process.env.JWT_REFRESH_SECRET ?? 'refresh-secret' }
    );

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, role: user.role.name }
    };
  });

  app.post('/auth/refresh', {
    schema: {
      tags: ['auth'],
      summary: 'Refresh access token',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };
    let payload: { sub: string; username: string; role: string; tokenType: string };

    try {
      payload = await app.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET ?? 'refresh-secret' });
    } catch {
      return reply.code(401).send({ message: 'Invalid refresh token' });
    }

    if (payload.tokenType !== 'refresh') {
      return reply.code(401).send({ message: 'Invalid refresh token type' });
    }

    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) }, include: { role: true } });
    if (!user || user.refreshToken !== refreshToken) {
      return reply.code(401).send({ message: 'Refresh token mismatch' });
    }

    const accessToken = await reply.jwtSign(
      { username: user.username, role: user.role.name },
      { expiresIn: '15m', sub: String(user.id) }
    );

    return { accessToken };
  });

  app.get('/auth/me', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['auth'], summary: 'Get current user', security: [{ bearerAuth: [] }] }
  }, async (request) => {
    return { user: request.authUser };
  });

  app.get('/queues', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['queues'], summary: 'List queues', security: [{ bearerAuth: [] }] }
  }, async (request) => {
    const query = request.query as { page?: string; pageSize?: string };
    const page = Number(query.page ?? '1');
    const pageSize = Number(query.pageSize ?? '10');
    const boundedPage = Number.isFinite(page) && page > 0 ? page : 1;
    const boundedPageSize = Number.isFinite(pageSize) ? Math.min(Math.max(pageSize, 1), 100) : 10;
    const skip = (boundedPage - 1) * boundedPageSize;

    const [queues, total] = await Promise.all([
      prisma.queue.findMany({ orderBy: { id: 'asc' }, skip, take: boundedPageSize }),
      prisma.queue.count()
    ]);

    return { data: queues, page: boundedPage, pageSize: boundedPageSize, total };
  });

  app.get('/demo/scenarios', {
    schema: { tags: ['demo'], summary: 'List banker demo scenarios with timeline' }
  }, async (request, reply) => {
    const correlationId = resolveCorrelationId(request.headers);
    reply.header('x-correlation-id', correlationId);

    const query = request.query as { page?: string; pageSize?: string };
    const page = Number(query.page ?? '1');
    const pageSize = Number(query.pageSize ?? '10');

    const paged = paginateScenarios(listScenarios(), page, pageSize);

    return {
      ...paged,
      correlationId
    };
  });

  app.get('/demo/scenarios/:id', {
    schema: { tags: ['demo'], summary: 'Get one demo scenario' }
  }, async (request, reply) => {
    const correlationId = resolveCorrelationId(request.headers);
    reply.header('x-correlation-id', correlationId);

    const params = request.params as { id: string };
    const scenario = getScenarioById(params.id);

    if (!scenario) {
      return reply.code(404).send({ message: 'Scenario not found', correlationId });
    }

    return { data: scenario, correlationId };
  });

  app.get('/work-items', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['work-items'], summary: 'List work items', security: [{ bearerAuth: [] }] }
  }, async () => {
    const workItems = await prisma.workItem.findMany({ orderBy: { id: 'asc' } });
    return { data: workItems };
  });

  app.get('/work-items/:id', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['work-items'], summary: 'Get work item detail', security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const workItem = await prisma.workItem.findUnique({ where: { id: Number(id) } });
    if (!workItem) {
      return reply.code(404).send({ message: 'Work item not found' });
    }
    return { data: workItem };
  });

  app.post('/agent/run/:workItemId', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['agent'], summary: 'Run agent runtime for a work item', security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    const { workItemId } = request.params as { workItemId: string };
    const id = Number(workItemId);
    if (!Number.isInteger(id)) {
      return reply.code(400).send({ message: 'Invalid work item id' });
    }

    const workItem = await prisma.workItem.findUnique({ where: { id } });
    if (!workItem) {
      return reply.code(404).send({ message: 'Work item not found' });
    }

    const starter = await prisma.user.findUnique({ where: { username: 'swiftcat_ai' } });
    if (!starter) {
      return reply.code(500).send({ message: 'swiftcat_ai user is missing' });
    }

    const result = await runAgentForWorkItem({
      workItemId: id,
      startedByUserId: starter.id,
      store: {
        createRun: ({ workItemId: inputWorkItemId, startedByUserId }) => prisma.agentRun.create({
          data: { workItemId: inputWorkItemId, startedByUserId, status: AgentRunStatus.RUNNING },
          select: { id: true }
        }),
        markRunSucceeded: (runId) => prisma.agentRun.update({
          where: { id: runId },
          data: { status: AgentRunStatus.SUCCEEDED, finishedAt: new Date(), error: null }
        }).then(() => undefined),
        markRunFailed: (runId, error) => prisma.agentRun.update({
          where: { id: runId },
          data: { status: AgentRunStatus.FAILED, finishedAt: new Date(), error: error as Prisma.JsonObject }
        }).then(() => undefined),
        createStep: ({ runId, stepName, stepType, input, rationale }) => prisma.agentStep.create({
          data: {
            agentRunId: runId,
            stepName,
            stepType,
            input: (input ?? null) as Prisma.JsonObject | null,
            rationale,
            status: defaultStepStatus
          },
          select: { id: true }
        }),
        markStepSucceeded: (stepId, output) => prisma.agentStep.update({
          where: { id: stepId },
          data: {
            status: AgentStepStatus.SUCCEEDED,
            output: (output ?? null) as Prisma.JsonObject | null,
            finishedAt: new Date()
          }
        }).then(() => undefined),
        markStepFailed: (stepId, error) => prisma.agentStep.update({
          where: { id: stepId },
          data: {
            status: AgentStepStatus.FAILED,
            output: error as Prisma.JsonObject,
            finishedAt: new Date()
          }
        }).then(() => undefined),
        updateWorkItemState: (workItemIdToUpdate, nextState) => prisma.workItem.update({
          where: { id: workItemIdToUpdate },
          data: { status: nextState }
        }).then(() => undefined)
      }
    });

    return { data: result };
  });

  app.get('/agent/runs', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['agent'], summary: 'List agent runs by work item', security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    const { workItemId } = request.query as { workItemId?: string };
    if (!workItemId) {
      return reply.code(400).send({ message: 'workItemId query parameter is required' });
    }
    const id = Number(workItemId);
    if (!Number.isInteger(id)) {
      return reply.code(400).send({ message: 'Invalid workItemId' });
    }
    const runs = await prisma.agentRun.findMany({ where: { workItemId: id }, orderBy: { startedAt: 'desc' } });
    return { data: runs };
  });

  app.get('/agent/runs/:id/steps', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['agent'], summary: 'List steps for an agent run', security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const runId = Number(id);
    if (!Number.isInteger(runId)) {
      return reply.code(400).send({ message: 'Invalid run id' });
    }

    const run = await prisma.agentRun.findUnique({ where: { id: runId } });
    if (!run) {
      return reply.code(404).send({ message: 'Run not found' });
    }

    const steps = await prisma.agentStep.findMany({ where: { agentRunId: runId }, orderBy: { startedAt: 'asc' } });
    return { data: steps };
  });

  app.post('/actions/audit', {
    preHandler: [app.verifyJwt],
    schema: {
      tags: ['audit'],
      summary: 'Write audit log action',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['action', 'entityType', 'entityId'],
        properties: {
          action: { type: 'string' }, entityType: { type: 'string' }, entityId: { type: 'string' }, details: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const body = request.body as { action: string; entityType: string; entityId: string; details?: string };
    if (!request.authUser) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }
    const action = await prisma.messageAction.create({
      data: {
        action: body.action,
        entityType: body.entityType,
        entityId: body.entityId,
        details: body.details,
        performedBy: request.authUser.id
      }
    });
    return { data: action };
  });

  app.get('/admin/compliance', {
    preHandler: [app.verifyJwt, app.authorize(['Compliance'])],
    schema: { tags: ['admin'], summary: 'Compliance-only route', security: [{ bearerAuth: [] }] }
  }, async () => ({ message: 'Compliance access granted' }));

  app.get('/tools', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['tools'], summary: 'List registered tools', security: [{ bearerAuth: [] }] }
  }, async () => {
    const tools = await prisma.toolRegistry.findMany({ orderBy: { toolName: 'asc' } });
    return { data: tools };
  });

  app.post('/agent/runs/tool-call', {
    preHandler: [app.verifyJwt],
    schema: {
      tags: ['agent'],
      summary: 'Create an agent run with a TOOL_CALL step',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['toolName', 'request', 'idempotencyKey'],
        properties: {
          toolName: { type: 'string' },
          request: { type: 'object', additionalProperties: true },
          idempotencyKey: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const body = request.body as {
      toolName: string;
      request: Record<string, unknown>;
      idempotencyKey: string;
    };

    const tool = await prisma.toolRegistry.findUnique({ where: { toolName: body.toolName } });
    if (!tool) {
      return reply.code(404).send({ message: `Tool ${body.toolName} not found` });
    }

    const run = await prisma.agentRun.create({ data: { status: 'IN_PROGRESS' } });
    const step = await prisma.agentStep.create({
      data: { runId: run.id, stepType: 'TOOL_CALL', status: 'IN_PROGRESS' }
    });

    const invocation = await toolRuntime.invokeTool({
      agentStepId: step.id,
      toolName: body.toolName,
      idempotencyKey: body.idempotencyKey,
      request: body.request
    });

    await prisma.agentStep.update({
      where: { id: step.id },
      data: { status: invocation.status === 'SUCCESS' ? 'COMPLETED' : 'FAILED' }
    });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: invocation.status === 'SUCCESS' ? 'COMPLETED' : 'FAILED' }
    });

    return {
      data: {
        runId: run.id,
        stepId: step.id,
        invocation
      }
    };
  });
}
