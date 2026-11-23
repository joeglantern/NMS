import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';

/**
 * Options an admin has added to the form dropdowns (origin of alert, alert
 * mode and so on). The built-in options live in the frontend; this table only
 * holds the extra ones, so removing a row can never take away a built-in.
 */
export const DROPDOWN_FIELDS = [
  'alertMode',
  'originOfAlert',
  'patientSex',
  'modeOfDelivery',
  'newbornSex',
  'facilityType',
] as const;

const addSchema = z.object({
  field: z.enum(DROPDOWN_FIELDS),
  label: z.string().trim().min(1, 'Type the new option first').max(60, 'Keep the option under 60 characters'),
});

const adminRoles = [Role.ADMIN, Role.SUPER_ADMIN];

export const optionsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // The project has no migration step on deploy, so the table is created here
  // if it is missing. The SQL matches what Prisma would generate for the model.
  let tableReady = false;
  async function ensureTable() {
    if (tableReady) return;
    await app.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "dropdown_options" (
         "id" TEXT NOT NULL,
         "field" TEXT NOT NULL,
         "label" TEXT NOT NULL,
         "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "dropdown_options_pkey" PRIMARY KEY ("id")
       )`,
    );
    await app.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "dropdown_options_field_label_key" ON "dropdown_options"("field", "label")`,
    );
    tableReady = true;
  }
  ensureTable().catch(err => app.log.error({ err }, 'Could not prepare dropdown_options table'));

  app.addHook('preValidation', app.authenticate);

  // Every signed-in role reads the list: the forms need it.
  app.get('/dropdowns', async (_request, reply) => {
    try {
      await ensureTable();
      const rows = await app.prisma.dropdownOption.findMany({ orderBy: [{ field: 'asc' }, { label: 'asc' }] });
      return reply.send({ ok: true, data: rows });
    } catch (err) {
      // A form must still open with its built-in options if this read fails.
      app.log.error({ err }, 'Could not read dropdown options');
      return reply.send({ ok: true, data: [] });
    }
  });

  app.post('/dropdowns', { preValidation: requireRole(adminRoles) }, async (request, reply) => {
    const parsed = addSchema.safeParse(request.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);
    const { field } = parsed.data;
    const label = parsed.data.label.replace(/\s+/g, ' ');

    await ensureTable();
    const clash = await app.prisma.dropdownOption.findFirst({
      where: { field, label: { equals: label, mode: 'insensitive' } },
    });
    if (clash) throw new ConflictError(`"${clash.label}" is already in this list`);

    const option = await app.prisma.dropdownOption.create({ data: { field, label } });
    await app.prisma.auditLog.create({
      data: {
        action: 'CREATE',
        subjectType: 'DROPDOWN_OPTION',
        subjectId: option.id,
        newValues: { field, label },
        userId: request.user.userId,
      },
    });
    return reply.status(201).send({ ok: true, data: option });
  });

  app.delete<{ Params: { id: string } }>(
    '/dropdowns/:id',
    { preValidation: requireRole(adminRoles) },
    async (request, reply) => {
      await ensureTable();
      const option = await app.prisma.dropdownOption.findUnique({ where: { id: request.params.id } });
      if (!option) throw new NotFoundError('Option');
      await app.prisma.dropdownOption.delete({ where: { id: option.id } });
      await app.prisma.auditLog.create({
        data: {
          action: 'DELETE',
          subjectType: 'DROPDOWN_OPTION',
          subjectId: option.id,
          oldValues: { field: option.field, label: option.label },
          userId: request.user.userId,
        },
      });
      return reply.send({ ok: true });
    },
  );
};
