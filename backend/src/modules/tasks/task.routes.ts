import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { TaskService } from './task.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { TaskStatus, Role } from '../../shared/types/index.js';

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
      driverId: string;
      emtId: string;
      nurseId: string;
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
