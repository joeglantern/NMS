import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { IncidentService } from './incident.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { IncidentStatus, Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

const createIncidentSchema = z.object({
  chiefComplaint: z.string().min(3, 'Chief complaint is required'),
  locationName: z.string().min(2, 'Location name is required'),
  subCounty: z.string().min(2, 'Sub-county is required'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  alertMode: z.string().optional(),
  alertAt: z.string().optional(),
  notifierDetails: z.array(z.record(z.string(), z.string())).optional(),
  patientName: z.string().optional(),
  patientAge: z.string().optional(),
  patientGender: z.string().optional(),
  patientNhif: z.string().optional(),
  patientContact: z.string().optional(),
  nextOfKin: z.string().optional(),
  nextOfKinPhone: z.string().optional(),
  massCasualty: z.boolean().optional(),
  massCasualtyCount: z.number().int().positive().optional(),
  watcherComments: z.string().optional(),
  preHospitalManagement: z.string().optional(),
  alertNature: z.string().optional(),
  alertNatureDetail: z.string().optional(),
  originOfAlert: z.string().optional(),
  placeOfReferral: z.string().optional(),
});

const updateIncidentSchema = z.object({
  chiefComplaint: z.string().min(3).optional(),
  locationName: z.string().min(2).optional(),
  subCounty: z.string().optional(),
  massCasualty: z.boolean().optional(),
  massCasualtyCount: z.number().int().positive().optional(),
  watcherComments: z.string().optional(),
  dispatcherComments: z.string().optional(),
  dispatcherChallenges: z.string().optional(),
  patientName: z.string().optional(),
  patientAge: z.string().optional(),
  patientGender: z.string().optional(),
  patientContact: z.string().optional(),
  nextOfKin: z.string().optional(),
  nextOfKinPhone: z.string().optional(),
  alertNature: z.string().optional(),
  alertNatureDetail: z.string().optional(),
  placeOfReferral: z.string().optional(),
  hospitalLevelRequired: z.number().int().min(1).max(6).optional(),
  preHospitalManagement: z.string().optional(),
});

const updateStatusSchema = z
  .object({
    status: z.nativeEnum(IncidentStatus),
    comments: z.string().optional(),
  })
  .refine(
    (d) => d.status !== IncidentStatus.RESOLVED || (d.comments && d.comments.trim().length >= 5),
    { message: 'A resolution reason (minimum 5 characters) is required when resolving an incident', path: ['comments'] }
  );

export const incidentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const incidentService = new IncidentService(app);

  app.addHook('preValidation', app.authenticate);

  /**
   * POST /incidents
   */
  app.post(
    '/',
    { preValidation: [requireRole([Role.WATCHER, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const parsed = createIncidentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.issues[0].message);
      }

      const incident = await incidentService.createIncident(
        { userId: request.user.userId, agencyId: request.user.agencyId, role: request.user.role },
        parsed.data
      );
      return reply.status(201).send({ ok: true, data: incident });
    }
  );

  /**
   * GET /incidents
   */
  app.get<{ Querystring: { status?: IncidentStatus; watcherId?: string; page?: string; limit?: string } }>(
    '/',
    async (request, reply) => {
      const page = request.query.page ? parseInt(request.query.page, 10) : 1;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;

      const result = await incidentService.getIncidents({
        status: request.query.status,
        watcherId: request.query.watcherId,
        page,
        limit,
      });
      return reply.send({ ok: true, ...result });
    }
  );

  /**
   * GET /incidents/:id
   */
  app.get<{ Params: { id: string } }>(
    '/:id',
    async (request, reply) => {
      const incident = await incidentService.getIncidentById(request.params.id);
      return reply.send({ ok: true, data: incident });
    }
  );

  /**
   * GET /incidents/partner-agencies
   * Returns active partner agencies — used by dispatchers to populate the "Assign to Partner" dropdown.
   */
  app.get(
    '/partner-agencies',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (_request, reply) => {
      const agencies = await incidentService.getPartnerAgencies();
      return reply.send({ ok: true, data: agencies });
    }
  );

  /**
   * POST /incidents/:id/assign-partner
   */
  const assignPartnerSchema = z.object({
    partnerAgencyId: z.string().uuid(),
    reason: z.string().min(5, 'Please provide a reason for the assignment'),
  });

  app.post<{ Params: { id: string } }>(
    '/:id/assign-partner',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const parsed = assignPartnerSchema.safeParse(request.body);
      if (!parsed.success) throw new BadRequestError(parsed.error.issues[0].message);

      const updated = await incidentService.assignToPartner(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        parsed.data.partnerAgencyId,
        parsed.data.reason
      );
      return reply.send({ ok: true, data: updated });
    }
  );

  /**
   * GET /incidents/:id/audit-log
   */
  app.get<{ Params: { id: string } }>(
    '/:id/audit-log',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const entries = await incidentService.getIncidentAuditLog(request.params.id);
      return reply.send({ ok: true, data: entries });
    }
  );

  /**
   * PATCH /incidents/:id
   */
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const parsed = updateIncidentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.issues[0].message);
      }

      const updated = await incidentService.updateIncident(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        parsed.data
      );
      return reply.send({ ok: true, data: updated });
    }
  );

  /**
   * PATCH /incidents/:id/status
   */
  app.patch<{ Params: { id: string } }>(
    '/:id/status',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const parsed = updateStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.issues[0].message);
      }

      const updated = await incidentService.updateIncidentStatus(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        parsed.data.status,
        parsed.data.comments
      );
      return reply.send({ ok: true, data: updated });
    }
  );
};
