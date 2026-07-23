import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { SmsService } from './sms.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

const smsRoles = [Role.ADMIN, Role.SUPER_ADMIN];

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestError(result.error.issues[0].message);
  return result.data;
}

const sendSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  numbers: z.array(z.string()).optional(),
  contactGroups: z.array(z.string()).optional(),
  userRoles: z.array(z.nativeEnum(Role)).optional(),
  partnerNiche: z.string().optional(), // 'ALL' or a niche tag
});

const contactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  group: z.string().min(1),
});

const contactUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(6).optional(),
  group: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const templateUpdateSchema = z.object({ body: z.string().min(1) });

export const smsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const sms = new SmsService(app);

  app.addHook('preValidation', app.authenticate);
  app.addHook('preValidation', requireRole(smsRoles));

  /** POST /sms/send — bulk or individual manual send. */
  app.post('/send', async (request, reply) => {
    const data = parse(sendSchema, request.body);
    if (!data.numbers?.length && !data.contactGroups?.length && !data.userRoles?.length && !data.partnerNiche) {
      throw new BadRequestError('Select at least one recipient (group, role, partner scope, or number)');
    }
    const result = await sms.send(
      {
        numbers: data.numbers,
        contactGroups: data.contactGroups,
        userRoles: data.userRoles,
        partnerNiche: data.partnerNiche,
      },
      data.message,
      { category: 'MANUAL', sentById: request.user.userId },
    );
    return reply.send({ ok: true, data: result });
  });

  /** GET /sms/logs — the SMS audit log. */
  app.get<{ Querystring: { limit?: string; category?: string; incidentId?: string } }>(
    '/logs',
    async (request, reply) => {
      const logs = await sms.listLogs({
        limit: request.query.limit ? parseInt(request.query.limit, 10) : undefined,
        category: request.query.category,
        incidentId: request.query.incidentId,
      });
      return reply.send({ ok: true, data: logs });
    },
  );

  /** GET /sms/balance — provider credit balance. */
  app.get('/balance', async (_request, reply) => {
    return reply.send({ ok: true, data: await sms.getBalance() });
  });

  // ── Managed recipient contacts ─────────────────────────────────────────────
  app.get('/contacts', async (_request, reply) => {
    return reply.send({ ok: true, data: await sms.listContacts() });
  });

  app.post('/contacts', async (request, reply) => {
    const data = parse(contactSchema, request.body);
    return reply.status(201).send({ ok: true, data: await sms.createContact(data) });
  });

  app.patch<{ Params: { id: string } }>('/contacts/:id', async (request, reply) => {
    const data = parse(contactUpdateSchema, request.body);
    return reply.send({ ok: true, data: await sms.updateContact(request.params.id, data) });
  });

  app.delete<{ Params: { id: string } }>('/contacts/:id', async (request, reply) => {
    await sms.deleteContact(request.params.id);
    return reply.send({ ok: true });
  });

  // ── Editable message templates ─────────────────────────────────────────────
  app.get('/templates', async (_request, reply) => {
    return reply.send({ ok: true, data: await sms.getTemplates() });
  });

  app.patch<{ Params: { key: string } }>('/templates/:key', async (request, reply) => {
    const data = parse(templateUpdateSchema, request.body);
    return reply.send({ ok: true, data: await sms.updateTemplate(request.params.key, data.body) });
  });
};
