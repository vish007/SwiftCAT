import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { loginSchema } from '@swiftcat/shared';
import { prisma } from './prisma.js';
import { runPipeline } from './pipeline.js';

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

  app.post('/work-items/ingest', {
    preHandler: [app.verifyJwt],
    schema: {
      tags: ['work-items'],
      summary: 'Ingest message and execute classify/screen/policy pipeline',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['messageType', 'rawMessage'],
        properties: {
          messageType: { type: 'string' },
          rawMessage: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const body = request.body as { messageType: string; rawMessage: string };
    const incomingQueue = await prisma.queue.upsert({
      where: { name: 'incoming-swift' },
      update: {},
      create: { name: 'incoming-swift' }
    });

    const created = await prisma.workItem.create({
      data: {
        messageType: body.messageType,
        rawMessage: body.rawMessage,
        queueId: incomingQueue.id
      }
    });

    const processed = await runPipeline(prisma, created.id);
    return { data: processed };
  });

  app.get('/work-items', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['work-items'], summary: 'List work items', security: [{ bearerAuth: [] }] }
  }, async () => {
    const items = await prisma.workItem.findMany({
      include: {
        queue: true,
        policyDecisions: { orderBy: { createdAt: 'desc' }, take: 1 },
        screeningResult: true
      },
      orderBy: { createdAt: 'desc' }
    });
    return { data: items };
  });

  app.get('/work-items/:id', {
    preHandler: [app.verifyJwt],
    schema: { tags: ['work-items'], summary: 'Work item detail', security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const item = await prisma.workItem.findUnique({
      where: { id },
      include: {
        queue: true,
        screeningResult: true,
        policyDecisions: { orderBy: { createdAt: 'desc' } },
        agentSteps: { orderBy: { createdAt: 'asc' } },
        stateTransitions: { orderBy: { createdAt: 'asc' } }
      }
    });
    if (!item) {
      return reply.code(404).send({ message: 'Work item not found' });
    }
    return { data: item };
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
