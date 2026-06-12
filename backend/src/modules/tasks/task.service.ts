import { FastifyInstance } from 'fastify';
import { TaskStatus, IncidentStatus, Role, VehicleStatus } from '../../shared/types/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';



export class TaskService {
  constructor(private app: FastifyInstance) {}

  /**
   * Creates a new task by dispatching a vehicle to an incident.
   * Crew (driver/EMT/nurse) is pulled from whoever is checked in to the vehicle.
   */
  async createTask(
    user: { userId: string; role: Role },
    data: {
      incidentId: string;
      vehicleId: string;
      dispatcherComments?: string;
    }
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('Only dispatchers and admins can create tasks');
    }

    const [incident, vehicle] = await Promise.all([
      this.app.prisma.incident.findUnique({ where: { id: data.incidentId } }),
      this.app.prisma.vehicle.findUnique({
        where: { id: data.vehicleId },
        include: {
          currentDriver: { select: { id: true, name: true } },
          currentEmt:    { select: { id: true, name: true } },
          currentNurse:  { select: { id: true, name: true } },
        },
      }),
    ]);

    if (!incident) throw new NotFoundError('Incident not found');
    if (!vehicle) throw new NotFoundError('Vehicle not found');
    if (!vehicle.currentDriverId) throw new BadRequestError('No driver is checked in to this vehicle');
    if (!vehicle.currentEmtId) throw new BadRequestError('No EMT is checked in to this vehicle');

    const [task] = await this.app.prisma.$transaction([
      this.app.prisma.task.create({
        data: {
          status: TaskStatus.PENDING,
          incidentId: data.incidentId,
          vehicleId: data.vehicleId,
          driverId: vehicle.currentDriverId,
          emtId: vehicle.currentEmtId,
          nurseId: vehicle.currentNurseId ?? undefined,
        },
      }),
      this.app.prisma.incident.update({
        where: { id: data.incidentId },
        data: {
          status: IncidentStatus.DISPATCHED,
          ...(data.dispatcherComments ? { dispatcherComments: data.dispatcherComments } : {}),
        },
      }),
      this.app.prisma.vehicle.update({
        where: { id: data.vehicleId },
        data: { status: VehicleStatus.BUSY },
      }),
    ]);

    // Notify crew via socket
    let room = this.app.io
      .to(`user:${vehicle.currentDriverId}`)
      .to(`user:${vehicle.currentEmtId}`);
    if (vehicle.currentNurseId) room = room.to(`user:${vehicle.currentNurseId}`);
    room.emit('task:assigned', task);

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

    // Release the vehicle when the task ends
    if (newStatus === TaskStatus.COMPLETED || newStatus === TaskStatus.CANCELLED) {
      await this.app.prisma.vehicle.update({
        where: { id: task.vehicleId },
        data: { status: VehicleStatus.READY },
      });
    }

    if (newStatus === TaskStatus.COMPLETED) {
      await this.app.prisma.incident.update({
        where: { id: task.incidentId },
        data: { status: IncidentStatus.RESOLVED },
      });
    }

    // Broadcast update to the crew and dispatchers
    let updateRoom = this.app.io
      .to(`user:${task.driverId}`)
      .to(`user:${task.emtId}`)
      .to(`role:${Role.DISPATCHER}`);
    if (task.nurseId) updateRoom = updateRoom.to(`user:${task.nurseId}`);
    updateRoom.emit('task:updated', updatedTask);

    return updatedTask;
  }

  /**
   * Returns the active (non-completed, non-cancelled) task for the current responder.
   */
  async getActiveTask(userId: string) {
    const task = await this.app.prisma.task.findFirst({
      where: {
        OR: [{ driverId: userId }, { emtId: userId }, { nurseId: userId }],
        status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
      },
      include: {
        incident: true,
        vehicle: { select: { id: true, registrationNumber: true, imei: true } },
        driver: { select: { id: true, name: true, phone: true } },
        emt: { select: { id: true, name: true, phone: true } },
        nurse: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { receivedAt: 'desc' },
    });

    return task;
  }

  /**
   * Logs patient vitals and pre-hospital management notes for a task.
   */
  async updatePatientData(
    taskId: string,
    userId: string,
    data: { preHospitalManagement: string; dispatcherChallenges?: string }
  ) {
    const task = await this.app.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundError('Task');

    const isCrew = [task.driverId, task.emtId, task.nurseId].includes(userId);
    if (!isCrew) throw new ForbiddenError('You are not assigned to this task');

    // Store clinical notes on the incident
    const updatedIncident = await this.app.prisma.incident.update({
      where: { id: task.incidentId },
      data: {
        preHospitalManagement: data.preHospitalManagement,
        dispatcherChallenges: data.dispatcherChallenges,
      },
    });

    this.app.io.to(`incident:${task.incidentId}`).emit('incident:update', updatedIncident);

    return updatedIncident;
  }
}
