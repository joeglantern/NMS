import { FastifyInstance } from 'fastify';
import { AgencyType, Role } from '../../shared/types/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import { hashPassword } from '../../shared/utils/hash.js';
import { normalizeMsisdn } from '../sms/sms.service.js';

export class AdminService {
  constructor(private app: FastifyInstance) {}

  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(filters: { role?: Role; agencyId?: string; page: number; limit: number }) {
    const { role, agencyId, page, limit } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (role) where.role = role;
    if (agencyId) where.agencyId = agencyId;

    const [users, total] = await Promise.all([
      this.app.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, phone: true, role: true,
          isActive: true, agencyId: true, createdAt: true,
          agency: { select: { id: true, name: true } },
        },
      }),
      this.app.prisma.user.count({ where }),
    ]);

    return { data: users, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getUserById(id: string) {
    const user = await this.app.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        isActive: true, agencyId: true, createdAt: true,
        agency: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundError('User');
    return user;
  }

  async createUser(data: {
    email: string; passwordRaw: string; name: string; role: Role;
    agencyId: string; phone?: string;
  }) {
    const existing = await this.app.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictError('A user with this email already exists');

    const agency = await this.app.prisma.agency.findUnique({ where: { id: data.agencyId } });
    if (!agency) throw new BadRequestError('Invalid agency ID');

    const passwordHash = await hashPassword(data.passwordRaw);
    // Normalize to 254XXXXXXXXX so OTP login (exact-match lookup) finds this
    // user regardless of the format the admin typed the number in.
    const phone = data.phone ? normalizeMsisdn(data.phone) ?? data.phone : data.phone;
    return this.app.prisma.user.create({
      data: { email: data.email, passwordHash, name: data.name, role: data.role, agencyId: data.agencyId, phone },
      select: { id: true, name: true, email: true, role: true, agencyId: true, createdAt: true },
    });
  }

  async updateUser(
    id: string,
    data: { name?: string; email?: string; password?: string; phone?: string; role?: Role; isActive?: boolean; agencyId?: string }
  ) {
    const user = await this.app.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User');
    if (data.agencyId) {
      const agency = await this.app.prisma.agency.findUnique({ where: { id: data.agencyId } });
      if (!agency) throw new BadRequestError('Invalid agency ID');
    }
    if (data.email && data.email !== user.email) {
      const existing = await this.app.prisma.user.findUnique({ where: { email: data.email } });
      if (existing) throw new ConflictError('A user with this email already exists');
    }

    const { password, phone, ...rest } = data;
    return this.app.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        // Normalize to 254XXXXXXXXX so OTP login (exact-match lookup) finds
        // this user regardless of the format the admin typed the number in.
        ...(phone !== undefined ? { phone: normalizeMsisdn(phone) ?? phone } : {}),
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, agencyId: true },
    });
  }

  // ── Vehicles ───────────────────────────────────────────────────────────────

  async listVehicles(filters: { agencyId?: string; page: number; limit: number }) {
    const { agencyId, page, limit } = filters;
    const skip = (page - 1) * limit;
    const where: any = agencyId ? { agencyId } : {};

    const [vehicles, total] = await Promise.all([
      this.app.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { agency: { select: { id: true, name: true } } },
      }),
      this.app.prisma.vehicle.count({ where }),
    ]);

    return { data: vehicles, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async createVehicle(data: { registrationNumber: string; imei: string; agencyId: string }) {
    const [existingReg, existingImei] = await Promise.all([
      this.app.prisma.vehicle.findUnique({ where: { registrationNumber: data.registrationNumber } }),
      this.app.prisma.vehicle.findUnique({ where: { imei: data.imei } }),
    ]);
    if (existingReg) throw new ConflictError('A vehicle with this registration already exists');
    if (existingImei) throw new ConflictError('A vehicle with this IMEI already exists');

    const agency = await this.app.prisma.agency.findUnique({ where: { id: data.agencyId } });
    if (!agency) throw new BadRequestError('Invalid agency ID');

    return this.app.prisma.vehicle.create({ data });
  }

  async updateVehicle(id: string, data: { registrationNumber?: string; imei?: string; isActive?: boolean }) {
    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundError('Vehicle');
    return this.app.prisma.vehicle.update({ where: { id }, data });
  }

  // ── Agencies ───────────────────────────────────────────────────────────────

  async listAgencies(type?: AgencyType) {
    return this.app.prisma.agency.findMany({
      where: type ? { type } : {},
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true, vehicles: true } } },
    });
  }

  async createAgency(data: { name: string; type: AgencyType; location?: string; contactInfo?: object }) {
    return this.app.prisma.agency.create({ data });
  }

  async updateAgency(id: string, data: { name?: string; location?: string; contactInfo?: object; isActive?: boolean }) {
    const agency = await this.app.prisma.agency.findUnique({ where: { id } });
    if (!agency) throw new NotFoundError('Agency');
    return this.app.prisma.agency.update({ where: { id }, data });
  }

  // ── Facilities ─────────────────────────────────────────────────────────────

  async listFacilities(filters: { subCounty?: string; kephLevel?: number }) {
    const where: any = {};
    if (filters.subCounty) where.subCounty = filters.subCounty;
    if (filters.kephLevel) where.kephLevel = filters.kephLevel;
    return this.app.prisma.facility.findMany({ where, orderBy: { name: 'asc' } });
  }

  async createFacility(data: {
    name: string; type: string; kephLevel: number;
    subCounty: string; lat: number; lng: number;
  }) {
    return this.app.prisma.facility.create({ data });
  }

  async updateFacility(id: string, data: { name?: string; type?: string; kephLevel?: number; isActive?: boolean }) {
    const facility = await this.app.prisma.facility.findUnique({ where: { id } });
    if (!facility) throw new NotFoundError('Facility');
    return this.app.prisma.facility.update({ where: { id }, data });
  }
}
