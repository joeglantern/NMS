import { FastifyInstance } from 'fastify';
import { TaskStatus, IncidentStatus, Role } from '../../shared/types/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';

export class TaskService {
  constructor(private app: FastifyInstance) {}

  /**
   * Creates a new task (dispatching a vehicle and crew to an incident).
   */
  async createTask(
    user: { userId: string; role: Role },
    data: {
      incidentId: string;
      vehicleId: string;
      driverId: string;
      emtId: string;
      nurseId: string;
    }
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('Only dispatchers and admins can create tasks');
    }

    const incident = await this.app.prisma.incident.findUnique({
      where: { id: data.incidentId },
    });

    if (!incident) throw new NotFoundError('Incident not found');

    // Create the task and update incident status in a transaction
    const [task] = await this.app.prisma.$transaction([
      this.app.prisma.task.create({
        data: {
          status: TaskStatus.PENDING,
          incidentId: data.incidentId,
          vehicleId: data.vehicleId,
          driverId: data.driverId,
          emtId: data.emtId,
          nurseId: data.nurseId,
        },
      }),
      this.app.prisma.incident.update({
        where: { id: data.incidentId },
        data: { status: IncidentStatus.DISPATCHED },
      }),
    ]);

    return task;
  }

  /**
   * Updates a task's status and records the lifecycle timestamp.
   */
  async updateTaskStatus(
    taskId: string,
    user: { userId: string; role: Role },
    newStatus: TaskStatus,
    reason?: string
  ) {
    const task = await this.app.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task not found');

    // Basic authorization: user must be part of the task or be dispatcher/admin
    const isCrew = [task.driverId, task.emtId, task.nurseId].includes(user.userId);
    const isDispatch = (<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role);

    if (!isCrew && !isDispatch) {
      throw new ForbiddenError('You do not have permission to update this task');
    }

    const updateData: any = { status: newStatus };
    const now = new Date();

    // Map status to timestamp field
    switch (newStatus) {
      case TaskStatus.ACCEPTED:
        updateData.acceptedAt = now;
        break;
      case TaskStatus.EN_ROUTE:
        // Assume they accepted it if they jump straight to en_route
        if (!task.acceptedAt) updateData.acceptedAt = now;
        break;
      case TaskStatus.AT_SCENE:
        updateData.sceneArrivalAt = now;
        break;
      case TaskStatus.PATIENT_PICKED:
        updateData.patientPickAt = now;
        break;
      case TaskStatus.AT_HOSPITAL:
        updateData.facilityArrivalAt = now;
        break;
      case TaskStatus.COMPLETED:
        updateData.completedAt = now;
        break;

      case TaskStatus.CANCELLED:
        if (!isDispatch) throw new ForbiddenError('Only dispatchers can cancel tasks');
        updateData.cancelledAt = now;
        updateData.cancelReason = reason;
        break;
    }

    const updatedTask = await this.app.prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    // If task is completed or cancelled, update incident if all tasks are resolved
    if (newStatus === TaskStatus.COMPLETED) {
      await this.app.prisma.incident.update({
        where: { id: task.incidentId },
        data: { status: IncidentStatus.RESOLVED },
      });
    }

    return updatedTask;
  }
}
