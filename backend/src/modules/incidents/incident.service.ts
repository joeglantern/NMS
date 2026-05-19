import { FastifyInstance } from 'fastify';
import { IncidentStatus, Role } from '../../shared/types/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors/AppError.js';

export class IncidentService {
  constructor(private app: FastifyInstance) {}

  /**
   * Generates a unique case number: NMS-INC-YYYYMMDD-XXXX
   */
  private generateCaseNumber(): string {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
    return `NMS-INC-${yyyy}${mm}${dd}-${random}`;
  }

  /**
   * Creates a new incident.
   */
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

    // Broadcast to all dispatchers
    this.app.io.to(`role:${Role.DISPATCHER}`).emit('incident:new', incident);

    return incident;
  }

  /**
   * Retrieves a paginated list of incidents.
   */
  async getIncidents(filters: { status?: IncidentStatus; watcherId?: string; page?: number; limit?: number }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {};
    if (filters.status) {
      whereClause.status = filters.status;
    }
    if (filters.watcherId) {
      whereClause.watcherId = filters.watcherId;
    }

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
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves a single incident by ID.
   */
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

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    return incident;
  }

  /**
   * Updates editable fields on an incident (chiefComplaint, locationName, massCasualty, etc).
   */
  async updateIncident(
    id: string,
    user: { userId: string; role: Role },
    data: {
      chiefComplaint?: string;
      locationName?: string;
      massCasualty?: boolean;
      watcherComments?: string;
      dispatcherComments?: string;
    }
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('You do not have permission to update this incident');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');

    const updated = await this.app.prisma.incident.update({
      where: { id },
      data: {
        ...(data.chiefComplaint !== undefined && { chiefComplaint: data.chiefComplaint }),
        ...(data.locationName !== undefined && { locationName: data.locationName }),
        ...(data.massCasualty !== undefined && { massCasualty: data.massCasualty }),
        ...(data.watcherComments !== undefined && { watcherComments: data.watcherComments }),
        ...(data.dispatcherComments !== undefined && { dispatcherComments: data.dispatcherComments }),
      },
    });

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);

    return updated;
  }

  /**
   * Updates an incident's status.
   */
  async updateIncidentStatus(
    id: string,
    user: { userId: string; role: Role },
    status: IncidentStatus,
    comments?: string
  ) {
    // Only DISPATCHER, ADMIN, SUPER_ADMIN can update status usually
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('You do not have permission to change incident status');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    // Assign dispatcher if it's the first time being picked up
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

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);

    return updated;
  }
}
