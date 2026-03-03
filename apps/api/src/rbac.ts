import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: {
      id: number;
      username: string;
      role: string;
    };
  }
}

export const authPlugin = fp(async (fastify) => {
  fastify.decorate('verifyJwt', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await request.jwtVerify<{ sub: string; username: string; role: string }>();
      request.authUser = {
        id: Number(payload.sub),
        username: payload.username,
        role: payload.role
      };
    } catch {
      return reply.code(401).send({ message: 'Unauthorized' });
    }
  });

  fastify.decorate('authorize', (roles: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.authUser) {
        return reply.code(401).send({ message: 'Unauthorized' });
      }
      if (!roles.includes(request.authUser.role)) {
        return reply.code(403).send({ message: 'Forbidden' });
      }
    };
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    verifyJwt: (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | void>;
    authorize: (roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | void>;
  }
}
