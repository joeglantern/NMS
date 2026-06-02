import { FastifyInstance } from 'fastify';
import { IncidentStatus, Role } from '../../shared/types/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';

export class IncidentService {
  constructor(private app: FastifyInstance) {}

  private generateCaseNumber(): string {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `EOC-INC-${yyyy}${mm}${dd}-${random}`;
  }

  private async writeAudit(opts: {
    userId: string;
    action: string;
    subjectId: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
  }) {
    await this.app.prisma.auditLog.create({
      data: {
        action: opts.action,
        subjectType: 'INCIDENT',
        subjectId: opts.subjectId,
        oldValues: (opts.oldValues ?? null) as any,
        newValues: (opts.newValues ?? null) as any,
        userId: opts.userId,
      },
    });
  }

  async createIncident(
    user: { userId: string; agencyId: string; role: Role },
    data: {
      chiefComplaint: string;
      locationName: string;
      subCounty: string;
      lat?: number;
      lng?: number;
      alertMode?: string;
      alertAt?: string;
      notifierDetails?: Record<string, string>[];
      patientName?: string;
      patientAge?: string;
      patientGender?: string;
      patientNhif?: string;
      patientContact?: string;
      nextOfKin?: string;
      nextOfKinPhone?: string;
      massCasualty?: boolean;
      massCasualtyCount?: number;
      watcherComments?: string;
      preHospitalManagement?: string;
      alertNature?: string;
      alertNatureDetail?: string;
      originOfAlert?: string;
      placeOfReferral?: string;
    }
  ) {
    const caseNumber = this.generateCaseNumber();

    const initialStatus = user.role === Role.WATCHER
      ? IncidentStatus.DRAFT
      : IncidentStatus.SUBMITTED;

    const incident = await this.app.prisma.incident.create({
      data: {
        caseNumber,
        status: initialStatus,
        chiefComplaint: data.chiefComplaint,
        locationName: data.locationName,
        subCounty: data.subCounty,
        lat: data.lat,
        lng: data.lng,
        alertMode: data.alertMode,
        alertAt: data.alertAt ? new Date(data.alertAt) : undefined,
        notifierDetails: data.notifierDetails ?? undefined,
        patientName: data.patientName,
        patientAge: data.patientAge,
        patientGender: data.patientGender,
        patientNhif: data.patientNhif,
        patientContact: data.patientContact,
        nextOfKin: data.nextOfKin,
        nextOfKinPhone: data.nextOfKinPhone,
        massCasualty: data.massCasualty ?? false,
        massCasualtyCount: data.massCasualtyCount,
        watcherComments: data.watcherComments,
        preHospitalManagement: data.preHospitalManagement,
        alertNature: data.alertNature,
        alertNatureDetail: data.alertNatureDetail,
        originOfAlert: data.originOfAlert,
        placeOfReferral: data.placeOfReferral,
        assignedAgencyId: user.agencyId,
        watcherId: user.userId,
      },
    });

    await this.writeAudit({
      userId: user.userId,
      action: 'CREATE',
      subjectId: incident.id,
      newValues: { status: initialStatus, caseNumber },
    });

    this.app.io.to(`role:${Role.DISPATCHER}`).emit('incident:new', incident);

    return incident;
  }

  async getIncidents(filters: { status?: IncidentStatus; watcherId?: string; page?: number; limit?: number }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {};
    if (filters.status) whereClause.status = filters.status;
    if (filters.watcherId) whereClause.watcherId = filters.watcherId;

    const [incidents, total] = await Promise.all([
      this.app.prisma.incident.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          watcher: { select: { id: true, name: true } },
          dispatcher: { select: { id: true, name: true } },
        },
      }),
      this.app.prisma.incident.count({ where: whereClause }),
    ]);

    return {
      data: incidents,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getIncidentById(id: string) {
    const incident = await this.app.prisma.incident.findUnique({
      where: { id },
      include: {
        watcher: { select: { id: true, name: true, phone: true } },
        dispatcher: { select: { id: true, name: true, phone: true } },
        tasks: {
          include: {
            vehicle: true,
            driver: { select: { name: true, phone: true } },
          },
        },
      },
    });

    if (!incident) throw new NotFoundError('Incident not found');

    return incident;
  }

  async getIncidentAuditLog(id: string) {
    return this.app.prisma.auditLog.findMany({
      where: { subjectType: 'INCIDENT', subjectId: id },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateIncident(
    id: string,
    user: { userId: string; role: Role },
    data: {
      chiefComplaint?: string;
      locationName?: string;
      subCounty?: string;
      massCasualty?: boolean;
      massCasualtyCount?: number;
      watcherComments?: string;
      dispatcherComments?: string;
      dispatcherChallenges?: string;
      patientName?: string;
      patientAge?: string;
      patientGender?: string;
      patientContact?: string;
      nextOfKin?: string;
      nextOfKinPhone?: string;
      alertNature?: string;
      alertNatureDetail?: string;
      placeOfReferral?: string;
      hospitalLevelRequired?: number;
      preHospitalManagement?: string;
    }
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('You do not have permission to update this incident');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');

    // Build a diff of only the fields that are actually changing
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    const updateData: Record<string, unknown> = {};

    const editableFields = [
      'chiefComplaint', 'locationName', 'subCounty', 'massCasualty',
      'massCasualtyCount', 'watcherComments', 'dispatcherComments',
      'dispatcherChallenges', 'patientName', 'patientAge', 'patientGender',
      'patientContact', 'nextOfKin', 'nextOfKinPhone', 'alertNature',
      'alertNatureDetail', 'placeOfReferral', 'hospitalLevelRequired',
      'preHospitalManagement',
    ] as const;

    for (const field of editableFields) {
      const value = (data as Record<string, unknown>)[field];
      if (value === undefined) continue;
      if ((incident as Record<string, unknown>)[field] !== value) {
        oldValues[field] = (incident as Record<string, unknown>)[field];
        newValues[field] = value;
      }
      updateData[field] = value;
    }

    const updated = await this.app.prisma.incident.update({
      where: { id },
      data: updateData,
    });

    if (Object.keys(newValues).length > 0) {
      await this.writeAudit({
        userId: user.userId,
        action: 'UPDATE',
        subjectId: id,
        oldValues,
        newValues,
      });
    }

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);

    return updated;
  }

  async getPartnerAgencies() {
    return this.app.prisma.agency.findMany({
      where: { type: 'PARTNER', isActive: true },
      select: { id: true, name: true, location: true },
      orderBy: { name: 'asc' },
    });
  }

  async assignToPartner(
    id: string,
    user: { userId: string; role: Role },
    partnerAgencyId: string,
    reason: string
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('You do not have permission to assign this incident');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');

    const partnerAgency = await this.app.prisma.agency.findUnique({ where: { id: partnerAgencyId } });
    if (!partnerAgency || partnerAgency.type !== 'PARTNER') {
      throw new BadRequestError('Invalid partner agency');
    }

    const [updated] = await this.app.prisma.$transaction([
      this.app.prisma.incident.update({
        where: { id },
        data: { assignedAgencyId: partnerAgencyId },
      }),
      this.app.prisma.forwardingLog.create({
        data: {
          incidentId: id,
          fromAgencyId: incident.assignedAgencyId,
          toAgencyId: partnerAgencyId,
          reason,
        },
      }),
    ]);

    await this.writeAudit({
      userId: user.userId,
      action: 'ASSIGN_PARTNER',
      subjectId: id,
      oldValues: { assignedAgencyId: incident.assignedAgencyId },
      newValues: { assignedAgencyId: partnerAgencyId, partnerName: partnerAgency.name, reason },
    });

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);
    this.app.io.to(`role:${Role.PARTNER}`).emit('incident:new', updated);

    return updated;
  }

  async updateIncidentStatus(
    id: string,
    user: { userId: string; role: Role },
    status: IncidentStatus,
    comments?: string
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('You do not have permission to change incident status');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');

    let dispatcherId = incident.dispatcherId;
    if (!dispatcherId && status === IncidentStatus.DISPATCH_HANDLING && user.role === Role.DISPATCHER) {
      dispatcherId = user.userId;
    }

    const updated = await this.app.prisma.incident.update({
      where: { id },
      data: {
        status,
        dispatcherId,
        dispatcherComments: comments ? comments : undefined,
      },
    });

    await this.writeAudit({
      userId: user.userId,
      action: 'STATUS_CHANGE',
      subjectId: id,
      oldValues: { status: incident.status },
      newValues: { status, ...(comments ? { comments } : {}) },
    });

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);

    return updated;
  }
}
