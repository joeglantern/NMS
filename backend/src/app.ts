import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { registerEnv } from './config/env.js';
import prismaPlugin from './plugins/prisma.js';
import jwtPlugin from './plugins/jwt.js';
import redisPlugin from './plugins/redis.js';
import socketPlugin from './plugins/socketio.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { incidentRoutes } from './modules/incidents/incident.routes.js';
import { fleetRoutes } from './modules/fleet/fleet.routes.js';
import { taskRoutes } from './modules/tasks/task.routes.js';
import { dispatchRoutes } from './modules/dispatch/dispatch.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { partnerRoutes } from './modules/partner/partner.routes.js';
import { TrackingService } from './modules/tracking/tracking.service.js';
import { AppError } from './shared/errors/AppError.js';

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

  // ── Environment validation — MUST be registered first ─────────────────────
  // This will throw and refuse to start if required vars are missing/invalid.
  await registerEnv(app);

  // ── Database & Cache ───────────────────────────────────────────────────────
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(socketPlugin);

  // ── Security ──────────────────────────────────────────────────────────────
  await app.register(helmet, {
    // Allow Swagger UI to function in development
    contentSecurityPolicy: app.config.NODE_ENV === 'production',
  });

  await app.register(jwtPlugin);

  await app.register(cors, {
    origin: app.config.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // ── Global error handler ──────────────────────────────────────────────────
  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        ok: false,
        message: error.message,
      });
    }

    if (error instanceof Error && 'statusCode' in error && (error as any).statusCode === 400) {
      return reply.status(400).send({
        ok: false,
        message: error.message,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      ok: false,
      message: 'Internal server error',
    });
  });

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/', async (_request, reply) => {
    return reply.send({ ok: true, service: 'NMS-EOC API', version: '1.0.0' });
  });

  app.get('/health', async (_request, reply) => {
    return reply.send({ ok: true, status: 'healthy' });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.register(authRoutes, { prefix: '/auth' });
  app.register(incidentRoutes, { prefix: '/incidents' });
  app.register(dispatchRoutes, { prefix: '/dispatch' });
  app.register(fleetRoutes, { prefix: '/fleet' });
  app.register(taskRoutes, { prefix: '/tasks' });
  app.register(adminRoutes, { prefix: '/admin' });
  app.register(partnerRoutes, { prefix: '/partner' });

  // ── GPS Tracking Worker ───────────────────────────────────────────────────
  const trackingService = new TrackingService(app);
  app.addHook('onReady', async () => trackingService.start());
  app.addHook('onClose', async () => trackingService.stop());

  app.get('/health/tracking', async (_request, reply) => {
    const status = trackingService.healthStatus();
    return reply.send({ ok: status.isRunning, ...status });
  });

  return app;
}

