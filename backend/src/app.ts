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
import { pbxRoutes } from './modules/pbx/pbx.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { dispatchRoutes } from './modules/dispatch/dispatch.routes.js';
import { partnerRoutes } from './modules/partner/partner.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { TrackingService } from './modules/tracking/tracking.service.js';

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

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/', async (_request, reply) => {
    return reply.send({ ok: true, service: 'NMS-EOC API', version: '1.0.0' });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.register(authRoutes, { prefix: '/auth' });
  app.register(incidentRoutes, { prefix: '/incidents' });
  app.register(fleetRoutes, { prefix: '/fleet' });
  app.register(taskRoutes, { prefix: '/tasks' });
  app.register(pbxRoutes, { prefix: '/pbx' });
  app.register(adminRoutes, { prefix: '/admin' });
  app.register(dispatchRoutes, { prefix: '/dispatch' });
  app.register(partnerRoutes, { prefix: '/partner' });
  app.register(analyticsRoutes, { prefix: '/analytics' });

  // ── GPS Tracking (Uffizio/Kimii) ──────────────────────────────────────────
  const trackingService = new TrackingService(app);
  app.addHook('onReady', async () => { trackingService.start(); });
  app.addHook('onClose', async () => { trackingService.stop(); });

  return app;
}
