import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

/**
 * Builds and returns the configured Fastify application instance.
 * Separating app creation from server startup allows for clean testing.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // Pino logger — structured, high-performance (built into Fastify)
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // ── Security ──────────────────────────────────────────────────────────────
  await app.register(helmet, {
    // Allow Swagger UI to function in development
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/', async (_request, reply) => {
    return reply.send({ ok: true, service: 'NMS-EOC API', version: '1.0.0' });
  });

  return app;
}
