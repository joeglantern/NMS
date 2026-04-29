import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { JwtPayload } from '../shared/types/index.js';
import { UnauthorizedError } from '../shared/errors/AppError.js';

/**
 * JWT Plugin using @fastify/jwt.
 * Registers JWT utilities and a decorator for route protection.
 */
const jwtPlugin = fp(async (app: FastifyInstance) => {
  await app.register(fastifyJwt, {
    secret: app.config.JWT_SECRET,
    sign: {
      expiresIn: app.config.JWT_EXPIRES_IN,
    },
  });

  // Decorate the fastify instance with an authenticate method to be used as a preHandler hook
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      // Throwing our custom UnauthorizedError ensures consistent error formatting
      throw new UnauthorizedError('Invalid or missing token');
    }
  });
});

export default jwtPlugin;

// TypeScript declaration merging for FastifyInstance and FastifyRequest
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload; // Defines the structure of the decoded token
    user: JwtPayload;    // request.user will have the type JwtPayload
  }
}
