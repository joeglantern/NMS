import { FastifyInstance } from 'fastify';
import { Prisma } from '../../generated/prisma/index.js';
import { Coordinates, Role } from '../../shared/types/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';
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

  /**
   * Driver assigns (or clears) the EMT / nurse on their vehicle. Passing an id sets
   * that crew member; passing null clears it; omitting the key leaves it unchanged.
   * Only the driver currently checked in to the vehicle (or an admin) may do this.
   */
  // ── Standby deployments (fleet standby reporting, #11) ───────────────────────

  /** Put a vehicle on standby for an event/location. */
  startStandby(
    userId: string,
    data: { vehicleId: string; title: string; location?: string; lat?: number; lng?: number; notes?: string; startedAt?: string },
  ) {
    return this.app.prisma.standbyDeployment.create({
      data: {
        vehicleId: data.vehicleId,
        title: data.title,
        location: data.location,
        lat: data.lat,
        lng: data.lng,
        notes: data.notes,
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        createdById: userId,
      },
      include: { vehicle: { select: { id: true, registrationNumber: true } } },
    });
  }

  /** End an active standby (sets endedAt to now, or a provided time). */
  async endStandby(id: string, endedAt?: string) {
    const row = await this.app.prisma.standbyDeployment.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Standby deployment');
    return this.app.prisma.standbyDeployment.update({
      where: { id },
      data: { endedAt: endedAt ? new Date(endedAt) : new Date() },
      include: { vehicle: { select: { id: true, registrationNumber: true } } },
    });
  }

  /** Standby report: filter by active state, vehicle, and date range (by startedAt). */
  listStandby(filter: { active?: boolean; vehicleId?: string; from?: string; to?: string }) {
    const where: Record<string, unknown> = {};
    if (filter.active === true) where.endedAt = null;
    if (filter.active === false) where.endedAt = { not: null };
    if (filter.vehicleId) where.vehicleId = filter.vehicleId;
    if (filter.from || filter.to) {
      where.startedAt = {
        ...(filter.from ? { gte: new Date(filter.from) } : {}),
        ...(filter.to ? { lte: new Date(filter.to) } : {}),
      };
    }
    return this.app.prisma.standbyDeployment.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: { vehicle: { select: { id: true, registrationNumber: true } } },
    });
  }

  /** Active partner ambulances (reference info for dispatchers; not GPS-tracked). */
  listPartnerAmbulances() {
    return this.app.prisma.partnerAmbulance.findMany({
      where: { isActive: true },
      orderBy: [{ agencyId: 'asc' }, { registrationNumber: 'asc' }],
      include: { agency: { select: { id: true, name: true } } },
    });
  }

  /** EMT / nurse users in an agency that a driver can pick from when assigning crew. */
  listAssignableCrew(agencyId: string) {
    return this.app.prisma.user.findMany({
      where: { agencyId, isActive: true, role: { in: [Role.EMT, Role.NURSE] } },
      select: { id: true, name: true, phone: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  async assignCrew(
    vehicleId: string,
    actor: { userId: string; role: Role },
    crew: { emtId?: string | null; nurseId?: string | null },
  ) {
    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundError('Vehicle');

    const isAdmin = (<Role[]>[Role.ADMIN, Role.SUPER_ADMIN]).includes(actor.role);
    const isVehicleDriver = vehicle.currentDriverId === actor.userId;
    if (!isAdmin && !isVehicleDriver) {
      throw new ForbiddenError('Only the checked-in driver can assign crew for this vehicle');
    }

    const data: Record<string, string | null> = {};
    if (crew.emtId !== undefined) data.currentEmtId = crew.emtId;
    if (crew.nurseId !== undefined) data.currentNurseId = crew.nurseId;

    return this.app.prisma.vehicle.update({
      where: { id: vehicleId },
      data,
      include: crewInclude,
    });
  }
}
