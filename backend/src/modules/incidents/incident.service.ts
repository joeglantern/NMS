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
      patientName?: string;
      patientContact?: string;
    }
  ) {
    const caseNumber = this.generateCaseNumber();

    // Default status: If a watcher creates it, it's DRAFT. If dispatcher, maybe SUBMITTED.
    // For simplicity, let's use SUBMITTED to bypass DRAFT for now, as it's ready for dispatch.
    const initialStatus = IncidentStatus.SUBMITTED;

    const incident = await this.app.prisma.incident.create({
      data: {
        caseNumber,
        status: initialStatus,
        chiefComplaint: data.chiefComplaint,
        locationName: data.locationName,
        subCounty: data.subCounty,
        lat: data.lat,
        lng: data.lng,
        patientName: data.patientName,
        patientContact: data.patientContact,
        assignedAgencyId: user.agencyId,
        watcherId: user.userId,
      },
    });

    return incident;
  }

  /**
   * Retrieves a paginated list of incidents.
   */
  async getIncidents(filters: { status?: IncidentStatus; page?: number; limit?: number }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {};
    if (filters.status) {
      whereClause.status = filters.status;
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

    return updated;
  }
}
