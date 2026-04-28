import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '../generated/prisma/index.js';

/**
 * Prisma Fastify Plugin.
 *
 * Attaches a single shared PrismaClient instance to the Fastify app.
 * Using fastify-plugin ensures the decorator is visible across the
 * entire app (not scoped to just the plugin's encapsulation context).
 *
 * Usage in routes/services:
 *   const user = await app.prisma.user.findUnique({ where: { id } })
 */
const prismaPlugin = fp(async (app: FastifyInstance) => {
  const prisma = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
  });

  await prisma.$connect();
  app.log.info('Prisma connected to the database');

  // Decorate the Fastify instance so all routes can access `app.prisma`
  app.decorate('prisma', prisma);

  // Gracefully disconnect when the server shuts down
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    app.log.info('Prisma disconnected');
  });
});

export default prismaPlugin;

// TypeScript declaration merging — makes app.prisma fully typed everywhere
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
