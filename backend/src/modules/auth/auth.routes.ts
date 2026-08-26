import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  passwordRaw: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.nativeEnum(Role),
  agencyId: z.string().min(1, 'Agency ID is required'),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  passwordRaw: z.string().min(1, 'Password is required'),
});

const otpRequestSchema = z.object({
  phone: z.string().min(9, 'Enter a valid phone number'),
});

const otpVerifySchema = z.object({
  phone: z.string().min(9, 'Enter a valid phone number'),
  code: z.string().length(6, 'Code must be 6 digits'),
});

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const authService = new AuthService(app);

  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const user = await authService.register(parsed.data);
    return reply.status(201).send({ ok: true, data: user });
  });

  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const result = await authService.login(parsed.data);
    return reply.send({ ok: true, data: result });
  });

  app.get('/me', { preValidation: [app.authenticate] }, async (request, reply) => {
    return reply.send({ ok: true, data: request.user });
  });

  // Mobile login for DRIVER and EMT: phone number + SMS code instead of a password.
  app.post('/otp/request', async (request, reply) => {
    const parsed = otpRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const result = await authService.requestOtp(parsed.data.phone);
    return reply.send({ ok: true, data: result });
  });

  app.post('/otp/verify', async (request, reply) => {
    const parsed = otpVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0].message);
    }

    const result = await authService.verifyOtp(parsed.data.phone, parsed.data.code);
    return reply.send({ ok: true, data: result });
  });
};
