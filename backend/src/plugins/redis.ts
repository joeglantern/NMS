import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import fastifyRedis from '@fastify/redis';
import Redis from 'ioredis';

/**
 * Fastify Redis Plugin.
 * Connects to Redis and decorates the fastify instance with `app.redis`.
 * Also exports the raw ioredis instance if needed outside Fastify context.
 */
const redisPlugin = fp(async (app: FastifyInstance) => {
  await app.register(fastifyRedis, {
    url: app.config.REDIS_URL,
  });

  app.log.info('✅ Redis connected');
});

export default redisPlugin;

// @fastify/redis automatically decorates FastifyInstance with `redis` of type `FastifyRedis`
