import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AuthService } from './auth.service.js';
import { Role } from '../../shared/types/index.js';

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const authService = new AuthService(app);

  app.post<{
    Body: {
      email: string;
      passwordRaw: string;
      name: string;
      role: Role;
      agencyId: string;
      phone?: string;
    };
  }>('/register', async (request, reply) => {
    // Basic validation could be added here or via JSON schema
    const user = await authService.register(request.body);
    return reply.status(201).send({ ok: true, data: user });
  });

  app.post<{
    Body: {
      email: string;
      passwordRaw: string;
    };
  }>('/login', async (request, reply) => {
    const result = await authService.login(request.body);
    return reply.send({ ok: true, data: result });
  });

  // Example of a protected route to verify token
  app.get('/me', { preValidation: [app.authenticate] }, async (request, reply) => {
    // request.user is populated by app.authenticate (fastify-jwt)
    return reply.send({ ok: true, data: request.user });
  });
};
