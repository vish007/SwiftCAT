import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { loginSchema } from '@swiftcat/shared';
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
  }, async () => {
    const queues = await prisma.queue.findMany({ orderBy: { id: 'asc' } });
    return { data: queues };
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
