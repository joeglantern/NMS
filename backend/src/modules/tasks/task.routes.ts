import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { TaskService } from './task.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { TaskStatus, Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

export const taskRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const taskService = new TaskService(app);

  app.addHook('preValidation', app.authenticate);

  /**
   * POST /tasks
   * Dispatch a vehicle to an incident.
   */
  app.post<{
    Body: {
      incidentId: string;
      vehicleId: string;
      dispatcherComments?: string;
    };
  }>(
    '/',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const task = await taskService.createTask(
        { userId: request.user.userId, role: request.user.role },
        request.body
      );
      return reply.status(201).send({ ok: true, data: task });
    }
  );

  /**
   * GET /tasks/active
   * Returns the current responder's active task (non-completed/cancelled).
   */
  app.get(
    '/active',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE])] },
    async (request, reply) => {
      const task = await taskService.getActiveTask(request.user.userId);
      return reply.send({ ok: true, data: task });
    }
  );

  /**
   * POST /tasks/:id/patient-data
   * Crew logs patient vitals and pre-hospital management notes.
   */
  app.post<{ Params: { id: string }; Body: { preHospitalManagement: string; dispatcherChallenges?: string } }>(
    '/:id/patient-data',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE])] },
    async (request, reply) => {
      const { preHospitalManagement, dispatcherChallenges } = request.body;
      if (!preHospitalManagement) throw new BadRequestError('preHospitalManagement is required');

      const result = await taskService.updatePatientData(
        request.params.id,
        request.user.userId,
        { preHospitalManagement, dispatcherChallenges }
      );
      return reply.send({ ok: true, data: result });
    }
  );

  /**
   * PATCH /tasks/:id/status
   * Update the status of a task (e.g. EN_ROUTE, AT_SCENE).
   */
  app.patch<{
    Params: { id: string };
    Body: {
      status: TaskStatus;
      reason?: string;
    };
  }>(
    '/:id/status',
    // Allowed for crew and dispatchers
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const updated = await taskService.updateTaskStatus(
        request.params.id,
        { userId: request.user.userId, role: request.user.role },
        request.body.status,
        request.body.reason
      );
      return reply.send({ ok: true, data: updated });
    }
  );
};
