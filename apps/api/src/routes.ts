import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import type { ActionType, Approval, Prisma } from '@prisma/client';
import { loginSchema } from '@swiftcat/shared';
import { prisma } from './prisma.js';
import {
  executeOutboundSwiftSend,
  getApprovalPolicy,
  isApprovalSatisfied,
  logAgentStep,
  logMessageAction,
  requestedByFromRole
} from './approvalWorkflow.js';

function canApproveAsMaker(role: string) {
  return role === 'Maker';
}

function canApproveAsChecker(role: string) {
  return role === 'Checker' || role === 'Compliance';
}

export async function registerRoutes(app: FastifyInstance) {
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

  app.post('/work-items/propose', {
    preHandler: [app.verifyJwt],
    schema: {
      tags: ['work-items'],
      summary: 'Propose gated action and create approval request when needed',
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    if (!request.authUser) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    const body = request.body as {
      actionType: ActionType;
      payload: Prisma.JsonObject;
      isHighRisk?: boolean;
    };

    const requestedBy = requestedByFromRole(request.authUser.role);
    const policy = getApprovalPolicy(body.actionType, body.isHighRisk ?? false);

    const workItem = await prisma.workItem.create({
      data: {
        actionType: body.actionType,
        payload: body.payload,
        state: policy.requireMaker || policy.requireChecker ? 'WAITING_APPROVAL' : 'APPROVED',
        requestedBy,
        createdById: request.authUser.id
      }
    });

    await logAgentStep({
      workItemId: workItem.id,
      stepType: 'ACTION_PROPOSED',
      details: `Proposed ${body.actionType} with policy maker=${policy.requireMaker} checker=${policy.requireChecker}`,
      performedBy: request.authUser.id
    });

    await logMessageAction({
      action: 'WORK_ITEM_PROPOSED',
      entityType: 'work_item',
      entityId: String(workItem.id),
      details: JSON.stringify(body.payload),
      performedBy: request.authUser.id
    });

    let approval: Approval | null = null;
    if (policy.requireMaker || policy.requireChecker) {
      approval = await prisma.approval.create({
        data: {
          workItemId: workItem.id,
          requestedBy,
          actionType: body.actionType,
          payload: body.payload,
          state: 'PENDING'
        }
      });

      await logAgentStep({
        workItemId: workItem.id,
        stepType: 'WAITING_APPROVAL',
        details: 'Approval request created and queued.',
        performedBy: request.authUser.id
      });
    }

    return { data: { workItem, approval, policy } };
  });

  app.get('/work-items', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['work-items'], summary: 'List work items with approvals', security: [{ bearerAuth: [] }] }
  }, async () => {
    const workItems = await prisma.workItem.findMany({
      include: {
        approvals: true
      },
      orderBy: { id: 'desc' }
    });
    return { data: workItems };
  });

  app.get('/approvals/inbox', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['approvals'], summary: 'Maker/checker approval inbox', security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    if (!request.authUser) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    const approvals = await prisma.approval.findMany({
      where: { state: 'PENDING' },
      include: { workItem: true },
      orderBy: { createdAt: 'asc' }
    });

    const role = request.authUser.role;
    const filtered = approvals.filter((approval) => {
      const policy = getApprovalPolicy(approval.actionType, false);
      if (canApproveAsMaker(role) && policy.requireMaker && !approval.makerUserId) {
        return true;
      }
      if (canApproveAsChecker(role) && policy.requireChecker && !approval.checkerUserId) {
        return true;
      }
      return false;
    });

    return { data: filtered };
  });

  app.post('/approvals/:id/decision', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['approvals'], summary: 'Approve or reject approval request', security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    if (!request.authUser) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    const params = request.params as { id: string };
    const body = request.body as { decision: Approval['state'] };
    const approvalId = Number(params.id);

    const existing = await prisma.approval.findUnique({ where: { id: approvalId }, include: { workItem: true } });
    if (!existing) {
      return reply.code(404).send({ message: 'Approval not found' });
    }
    if (existing.state !== 'PENDING') {
      return reply.code(400).send({ message: 'Approval already decided' });
    }

    const policy = getApprovalPolicy(existing.actionType, false);
    const role = request.authUser.role;
    const updates: Prisma.ApprovalUpdateInput = {};

    if (body.decision === 'REJECTED') {
      updates.state = 'REJECTED';
      updates.decidedAt = new Date();
      if (canApproveAsMaker(role) && !existing.makerUserId) {
        updates.makerUser = { connect: { id: request.authUser.id } };
      } else if (canApproveAsChecker(role) && !existing.checkerUserId) {
        updates.checkerUser = { connect: { id: request.authUser.id } };
      } else {
        return reply.code(403).send({ message: 'Role cannot decide this approval' });
      }
    } else {
      if (canApproveAsMaker(role) && policy.requireMaker && !existing.makerUserId) {
        updates.makerUser = { connect: { id: request.authUser.id } };
      } else if (canApproveAsChecker(role) && policy.requireChecker && !existing.checkerUserId) {
        if (existing.makerUserId === request.authUser.id) {
          return reply.code(400).send({ message: 'Maker and checker must be different users' });
        }
        updates.checkerUser = { connect: { id: request.authUser.id } };
      } else {
        return reply.code(403).send({ message: 'Role cannot approve at this stage' });
      }
    }

    const updated = await prisma.approval.update({
      where: { id: approvalId },
      data: updates
    });

    const satisfied = body.decision === 'APPROVED' && isApprovalSatisfied(updated, policy);
    const approvalState: Approval['state'] = body.decision === 'REJECTED'
      ? 'REJECTED'
      : satisfied
        ? 'APPROVED'
        : 'PENDING';

    const finalApproval = await prisma.approval.update({
      where: { id: approvalId },
      data: {
        state: approvalState,
        decidedAt: approvalState === 'PENDING' ? null : new Date()
      },
      include: { workItem: true }
    });

    await logMessageAction({
      action: `APPROVAL_${body.decision}`,
      entityType: 'approval',
      entityId: String(finalApproval.id),
      details: `maker=${finalApproval.makerUserId ?? 'none'} checker=${finalApproval.checkerUserId ?? 'none'} state=${finalApproval.state}`,
      performedBy: request.authUser.id
    });
    await logAgentStep({
      workItemId: finalApproval.workItemId,
      stepType: `APPROVAL_${body.decision}`,
      details: `Decision by ${request.authUser.username} (${role})`,
      performedBy: request.authUser.id
    });

    if (approvalState === 'REJECTED') {
      await prisma.workItem.update({ where: { id: finalApproval.workItemId }, data: { state: 'REJECTED' } });
    }

    if (approvalState === 'APPROVED') {
      const workItem = await prisma.workItem.update({
        where: { id: finalApproval.workItemId },
        data: { state: 'APPROVED' }
      });

      if (workItem.actionType === 'OUTBOUND_SWIFT_SEND') {
        await executeOutboundSwiftSend(workItem, { id: request.authUser.id });
        await prisma.workItem.update({ where: { id: workItem.id }, data: { state: 'EXECUTED' } });
      }
    }

    return { data: finalApproval };
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
}
