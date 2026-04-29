import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IncidentService } from './incident.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { IncidentStatus, Role } from '../../shared/types/index.js';

export const incidentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const incidentService = new IncidentService(app);

  // Apply authentication to all routes in this plugin
  app.addHook('preValidation', app.authenticate);

  /**
   * POST /incidents
   * Create a new incident
   */
  app.post<{
    Body: {
      chiefComplaint: string;
      locationName: string;
      subCounty: string;
      lat?: number;
      lng?: number;
      patientName?: string;
      patientContact?: string;
    };
  }>(
    '/',
    { preValidation: [requireRole([Role.WATCHER, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const incident = await incidentService.createIncident(
        { userId: request.user.userId, agencyId: request.user.agencyId, role: request.user.role },
        request.body
      );
      return reply.status(201).send({ ok: true, data: incident });
    }
  );

  /**
   * GET /incidents
   * List incidents with pagination and filtering
   */
  app.get<{
    Querystring: {
      status?: IncidentStatus;
      page?: string;
      limit?: string;
    };
  }>(
    '/',
    // Most authenticated users can list incidents, maybe restrict to specific roles later
    async (request, reply) => {
      const page = request.query.page ? parseInt(request.query.page, 10) : 1;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
      
      const result = await incidentService.getIncidents({
        status: request.query.status,
        page,
        limit,
      });
      return reply.send({ ok: true, ...result });
    }
  );

  /**
   * GET /incidents/:id
   * Get single incident details
   */
  app.get<{
    Params: { id: string };
  }>(
    '/:id',
    async (request, reply) => {
      const incident = await incidentService.getIncidentById(request.params.id);
      return reply.send({ ok: true, data: incident });
    }
  );

  /**
   * PATCH /incidents/:id/status
   * Update incident status
   */
  app.patch<{
    Params: { id: string };
    Body: {
      status: IncidentStatus;
      comments?: string;
    };
  }>(
    '/:id/status',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const updated = await incidentService.updateIncidentStatus(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        request.body.status,
        request.body.comments
      );
      return reply.send({ ok: true, data: updated });
    }
  );
};
