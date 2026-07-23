import { FastifyInstance } from 'fastify';
import { Prisma } from '../../generated/prisma/index.js';
import { Coordinates, Role } from '../../shared/types/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError.js';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';

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

  private checkinDir() {
    return path.resolve(process.cwd(), 'uploads', 'checkins');
  }

  private async ensureCheckinDir() {
    await fs.mkdir(this.checkinDir(), { recursive: true });
  }

  /** Absolute path to a stored check-in selfie (for streaming back to the web app). */
  async getCheckIn(id: string) {
    const checkIn = await this.app.prisma.checkIn.findUnique({ where: { id } });
    if (!checkIn) throw new NotFoundError('Check-in not found');
    return checkIn;
  }

  checkinSelfieAbsolutePath(selfiePath: string) {
    return path.resolve(this.checkinDir(), path.basename(selfiePath));
  }

  /** Recent check-in events, for dispatcher/admin accountability views. */
  async listCheckIns(filter: { vehicleId?: string; limit?: number }) {
    return this.app.prisma.checkIn.findMany({
      where: filter.vehicleId ? { vehicleId: filter.vehicleId } : {},
      orderBy: { checkedInAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
      include: {
        user: { select: { id: true, name: true, phone: true, role: true } },
        vehicle: { select: { id: true, registrationNumber: true } },
      },
    });
  }

  /**
   * Crew member (driver/EMT/nurse) checks in to a vehicle at shift start.
   * Clears any previous assignment for this user on other vehicles.
   */
  async checkInToCrew(
    vehicleId: string,
    userId: string,
    role: Role,
    location: { lat: number; lng: number },
    selfie: { filename: string; mimetype: string; file: NodeJS.ReadableStream }
  ) {
    const field = this.crewField(role);

    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle not found');

    // 1. Persist the accountability selfie to disk
    await this.ensureCheckinDir();
    const ext = path.extname(selfie.filename) || '.jpg';
    const safeExt = ext.length <= 10 ? ext : '.jpg';
    const storedName = `${userId}-${Date.now()}${safeExt}`;
    const storedPath = path.join(this.checkinDir(), storedName);

    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(storedPath);
      selfie.file.pipe(out);
      out.on('finish', () => resolve());
      out.on('error', reject);
      selfie.file.on('error', reject);
    });

    // 2. Clear user from any vehicle they were previously checked into
    await this.app.prisma.vehicle.updateMany({
      where: { [field]: userId },
      data: { [field]: null },
    });

    // 3. Record the check-in event (selfie + GPS at shift start)
    await this.app.prisma.checkIn.create({
      data: {
        vehicleId,
        userId,
        role,
        lat: location.lat,
        lng: location.lng,
        selfiePath: storedName,
      },
    });

    // 4. Set the crew FK on the vehicle (unchanged live-assignment behaviour)
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
