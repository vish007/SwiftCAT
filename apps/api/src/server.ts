import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from './env.js';
import { authPlugin } from './rbac.js';
import { registerRoutes } from './routes.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: env.corsOrigin, credentials: true });
await app.register(jwt, { secret: env.jwtAccessSecret });
await app.register(swagger, {
  openapi: {
    info: {
      title: 'SwiftCat API',
      version: '1.0.0'
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  }
});
await app.register(swaggerUi, { routePrefix: '/docs' });
await app.register(authPlugin);
await registerRoutes(app);

app.listen({ host: '0.0.0.0', port: env.port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
