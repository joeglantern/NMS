import { FastifyInstance } from 'fastify';
import { Prisma } from '../../generated/prisma/index.js';
import { Coordinates, Role } from '../../shared/types/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';

const crewInclude = {
  currentDriver: { select: { id: true, name: true, phone: true } },
  currentEmt: { select: { id: true, name: true, phone: true } },
  currentNurse: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.VehicleInclude;

export class FleetService {
  constructor(private app: FastifyInstance) {}

  /**
   * Updates a vehicle's real-time location in Redis.
   * Format: `vehicle:{imei}:location` -> JSON string
   */
  async updateVehicleLocation(imei: string, lat: number, lng: number) {
    // 1. Verify the vehicle exists in DB before caching its location
    // We could add an in-memory cache here to avoid hitting DB every second
    const vehicle = await this.app.prisma.vehicle.findUnique({
      where: { imei },
      select: { id: true, isActive: true, agencyId: true, registrationNumber: true },
    });

    if (!vehicle) {
      throw new NotFoundError(`Vehicle with IMEI ${imei} not found`);
    }

    const cacheKey = `vehicle:${imei}:location`;
    const payload = {
      lat,
      lng,
      timestamp: new Date().toISOString(),
      vehicleId: vehicle.id,
      registration: vehicle.registrationNumber,
      agencyId: vehicle.agencyId,
      isActive: vehicle.isActive,
    };

    if (this.app.redis) {
      await this.app.redis.set(cacheKey, JSON.stringify(payload), 'EX', 300);
    }

    return payload;
  }

  async getVehicleLocation(imei: string): Promise<(Coordinates & { timestamp: string }) | null> {
    if (!this.app.redis) return null;
    const cacheKey = `vehicle:${imei}:location`;
    const data = await this.app.redis.get(cacheKey);
    if (!data) return null;
    return JSON.parse(data);
  }

  async getAllActiveVehicleLocations() {
    if (!this.app.redis) return [];
    const keys = await this.app.redis.keys('vehicle:*:location');
    if (keys.length === 0) return [];
    const rawData = await this.app.redis.mget(keys);
    return rawData
      .filter((data): data is string => data !== null)
      .map(data => JSON.parse(data));
  }

  private crewField(role: Role): 'currentDriverId' | 'currentEmtId' | 'currentNurseId' {
    if (role === Role.DRIVER) return 'currentDriverId';
    if (role === Role.EMT) return 'currentEmtId';
    if (role === Role.NURSE) return 'currentNurseId';
    throw new BadRequestError('Role cannot check in to a vehicle');
  }

  /**
   * Crew member (driver/EMT/nurse) checks in to a vehicle at shift start.
   * Clears any previous assignment for this user on other vehicles.
   */
  async checkInToCrew(vehicleId: string, userId: string, role: Role) {
    const field = this.crewField(role);

    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle not found');

    // Clear user from any vehicle they were previously checked into
    await this.app.prisma.vehicle.updateMany({
      where: { [field]: userId },
      data: { [field]: null },
    });

    return this.app.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { [field]: userId },
      include: crewInclude,
    });
  }

  /**
   * Crew member checks out of a vehicle (on logout or end of shift).
   */
  async checkOutFromCrew(vehicleId: string, userId: string, role: Role) {
    const field = this.crewField(role);
    return this.app.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { [field]: null },
      include: crewInclude,
    });
  }

  /**
   * Active vehicles for the responder's agency (for shift check-in picker).
   */
  async listAgencyVehicles(agencyId: string) {
    return this.app.prisma.vehicle.findMany({
      where: { agencyId, isActive: true },
      orderBy: { registrationNumber: 'asc' },
      include: crewInclude,
    });
  }

  /**
   * Vehicle the current user is checked in to, if any.
   */
  async getMyCheckIn(userId: string, role: Role) {
    const field = this.crewField(role);
    return this.app.prisma.vehicle.findFirst({
      where: { [field]: userId, isActive: true },
      include: crewInclude,
    });
  }
}
