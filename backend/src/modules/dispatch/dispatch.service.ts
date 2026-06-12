import { FastifyInstance } from 'fastify';
import { haversineDistance } from '../../shared/utils/haversine.js';
import { FleetService } from '../fleet/fleet.service.js';
import { IncidentStatus, Role } from '../../shared/types/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';

export class DispatchService {
  private fleetService: FleetService;

  constructor(private app: FastifyInstance) {
    this.fleetService = new FleetService(app);
  }

  /**
   * Returns all incidents awaiting dispatch (status: SUBMITTED).
   */
  async getQueue() {
    return this.app.prisma.incident.findMany({
      where: { status: IncidentStatus.SUBMITTED },
      orderBy: { createdAt: 'asc' },
      include: {
        watcher: { select: { id: true, name: true, phone: true } },
        assignedAgency: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Dispatcher claims an incident — moves it to DISPATCH_HANDLING.
   */
  async assignDispatcher(incidentId: string, user: { userId: string; role: Role }) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('Only dispatchers can claim incidents');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundError('Incident not found');

    if (incident.status !== IncidentStatus.SUBMITTED) {
      throw new BadRequestError(`Incident is already ${incident.status} — cannot claim`);
    }

    const updated = await this.app.prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: IncidentStatus.DISPATCH_HANDLING,
        dispatcherId: user.userId,
      },
      include: {
        watcher: { select: { id: true, name: true } },
        dispatcher: { select: { id: true, name: true } },
      },
    });

    this.app.io.to(`incident:${incidentId}`).emit('incident:update', updated);
    this.app.io.to(`role:${Role.WATCHER}`).emit('incident:update', updated);

    return updated;
  }

  /**
   * Forwards an incident to a partner agency.
   */
  async handoffToPartner(
    incidentId: string,
    user: { userId: string; role: Role; agencyId: string },
    data: { toAgencyId: string; reason: string }
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('Only dispatchers can forward incidents');
    }

    const [incident, toAgency] = await Promise.all([
      this.app.prisma.incident.findUnique({ where: { id: incidentId } }),
      this.app.prisma.agency.findUnique({ where: { id: data.toAgencyId } }),
    ]);

    if (!incident) throw new NotFoundError('Incident not found');
    if (!toAgency) throw new NotFoundError('Partner agency not found');

    const [updatedIncident, log] = await this.app.prisma.$transaction([
      this.app.prisma.incident.update({
        where: { id: incidentId },
        data: { assignedAgencyId: data.toAgencyId },
      }),
      this.app.prisma.forwardingLog.create({
        data: {
          incidentId,
          fromAgencyId: user.agencyId,
          toAgencyId: data.toAgencyId,
          reason: data.reason,
        },
      }),
    ]);

    this.app.io.to(`agency:${data.toAgencyId}`).emit('incident:forwarded', {
      incident: updatedIncident,
      log,
    });

    return { incident: updatedIncident, log };
  }

  /**
   * Finds the nearest active vehicles to a given incident coordinate.
   */
  async findNearestVehicles(lat: number, lng: number, agencyId?: string, limit: number = 5) {
    const allLocations = await this.fleetService.getAllActiveVehicleLocations();

    const availableVehicles = allLocations.filter(v => {
      const isAvailable = v.isActive === true;
      const matchesAgency = agencyId ? v.agencyId === agencyId : true;
      return isAvailable && matchesAgency;
    });

    const vehiclesWithDistance = availableVehicles.map(v => ({
      // Normalize Redis payload to match the DB Vehicle shape the frontend expects
      id: v.vehicleId,
      registrationNumber: v.registration,
      agencyId: v.agencyId,
      isActive: v.isActive,
      lastLat: v.lat,
      lastLng: v.lng,
      lastLocationAt: v.timestamp,
      // Extra field for UI distance display
      distanceKm: haversineDistance(lat, lng, v.lat, v.lng),
    }));

    vehiclesWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    return vehiclesWithDistance.slice(0, limit);
  }
}
