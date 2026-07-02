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
      ambulanceUsed?: string;
      targetFacilityId?: string;
      surveillanceNote?: string;
      isGbvCase?: boolean;
      vitals?: {
        temperature?: string;
        pulseRate?: string;
        respirationRate?: string;
        bp?: string;
        spo2?: string;
        fh?: string;
      };
      maternityVitals?: Record<string, any>;
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
        ambulanceUsed: data.ambulanceUsed,
        targetFacilityId: data.targetFacilityId,
        surveillanceNote: data.surveillanceNote,
        isGbvCase: data.isGbvCase ?? false,
        vitals: data.vitals ?? undefined,
        maternityVitals: data.maternityVitals ?? undefined,
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

  async getIncidents(filters: { status?: IncidentStatus; watcherId?: string; caseNumber?: string; page?: number; limit?: number }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const whereClause: any = {};
    if (filters.status) whereClause.status = filters.status;
    if (filters.watcherId) whereClause.watcherId = filters.watcherId;
    if (filters.caseNumber) whereClause.caseNumber = { contains: filters.caseNumber, mode: 'insensitive' };

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
            emt:    { select: { name: true, phone: true } },
            nurse:  { select: { name: true, phone: true } },
          },
          orderBy: { receivedAt: 'desc' },
        },
        forwardingLogs: {
          include: {
            fromAgency: { select: { id: true, name: true } },
            toAgency: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
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
      partnerNotes?: string;
      vitals?: Record<string, unknown>;
      maternityVitals?: Record<string, unknown>;
      pcrUrl?: string;
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
      'preHospitalManagement', 'partnerNotes', 'pcrUrl', 'vitals', 'maternityVitals',
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

  async getIncidentTat(id: string) {
    const incident = await this.app.prisma.incident.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { receivedAt: 'asc' },
          select: {
            receivedAt: true,
            acceptedAt: true,
            sceneArrivalAt: true,
            patientPickAt: true,
            facilityArrivalAt: true,
            completedAt: true,
            cancelledAt: true,
            status: true,
          },
        },
      },
    });

    if (!incident) throw new NotFoundError('Incident not found');

    const auditLog = await this.app.prisma.auditLog.findMany({
      where: { subjectType: 'INCIDENT', subjectId: id },
      orderBy: { createdAt: 'asc' },
    });

    const getStatusTs = (status: string): Date | null => {
      const entry = auditLog.find(
        a => a.action === 'STATUS_CHANGE' && (a.newValues as Record<string, unknown>)?.status === status
      );
      return entry ? entry.createdAt : null;
    };

    const task = incident.tasks[0] ?? null;

    type TatStep = {
      key: string;
      label: string;
      timestamp: Date | null;
      durationFromPreviousMs: number | null;
    };

    const rawSteps: { key: string; label: string; timestamp: Date | null }[] = [
      { key: 'alert_received',      label: 'Alert Received',        timestamp: incident.alertAt ?? null },
      { key: 'submitted',           label: 'Incident Submitted',     timestamp: incident.createdAt },
      { key: 'dispatch_handling',   label: 'Dispatcher Picked Up',   timestamp: getStatusTs('DISPATCH_HANDLING') },
      { key: 'dispatched',          label: 'Vehicle Dispatched',     timestamp: task?.receivedAt ?? null },
      { key: 'crew_accepted',       label: 'Crew Accepted',         timestamp: task?.acceptedAt ?? null },
      { key: 'at_scene',            label: 'Arrived at Scene',      timestamp: task?.sceneArrivalAt ?? null },
      { key: 'patient_picked',      label: 'Patient On Board',      timestamp: task?.patientPickAt ?? null },
      { key: 'at_hospital',         label: 'Arrived at Facility',   timestamp: task?.facilityArrivalAt ?? null },
      { key: 'task_completed',      label: 'Task Completed',        timestamp: task?.completedAt ?? task?.cancelledAt ?? null },
      { key: 'case_closed',         label: 'Case Closed',           timestamp: getStatusTs('RESOLVED') ?? (auditLog.find(a => a.action === 'CLOSE')?.createdAt ?? null) },
    ];

    // Drop the alert_received step if it's the same as submitted (no separate alertAt)
    const steps: TatStep[] = [];
    let prevTs: Date | null = null;
    for (const s of rawSteps) {
      if (s.key === 'alert_received' && !incident.alertAt) continue;
      const durationFromPreviousMs =
        s.timestamp && prevTs ? s.timestamp.getTime() - prevTs.getTime() : null;
      steps.push({ ...s, durationFromPreviousMs });
      if (s.timestamp) prevTs = s.timestamp;
    }

    const completed = steps.filter(s => s.timestamp !== null);
    const first = completed[0]?.timestamp ?? null;
    const last = completed[completed.length - 1]?.timestamp ?? null;
    const totalMs = first && last ? last.getTime() - first.getTime() : null;

    return { steps, totalMs };
  }

  async escalateIncident(
    id: string,
    user: { userId: string; role: Role },
    massCasualtyCount: number,
    notes?: string
  ) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('Only dispatchers and admins can escalate incidents');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');

    const updated = await this.app.prisma.incident.update({
      where: { id },
      data: {
        massCasualty: true,
        massCasualtyCount,
        ...(notes ? { dispatcherComments: notes } : {}),
      },
    });

    await this.writeAudit({
      userId: user.userId,
      action: 'ESCALATE',
      subjectId: id,
      oldValues: { massCasualty: incident.massCasualty, massCasualtyCount: incident.massCasualtyCount },
      newValues: { massCasualty: true, massCasualtyCount, ...(notes ? { notes } : {}) },
    });

    this.app.io
      .to(`role:${Role.DISPATCHER}`)
      .to(`role:${Role.ADMIN}`)
      .to(`role:${Role.SUPER_ADMIN}`)
      .emit('incident:escalated', {
        id,
        caseNumber: incident.caseNumber,
        locationName: incident.locationName,
        massCasualtyCount,
      });

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);

    return updated;
  }

  async deescalateIncident(id: string, user: { userId: string; role: Role }) {
    if (!(<Role[]>[Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN]).includes(user.role)) {
      throw new ForbiddenError('Only dispatchers and admins can de-escalate incidents');
    }

    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');

    const updated = await this.app.prisma.incident.update({
      where: { id },
      data: { massCasualty: false, massCasualtyCount: null },
    });

    await this.writeAudit({
      userId: user.userId,
      action: 'DEESCALATE',
      subjectId: id,
      oldValues: { massCasualty: true, massCasualtyCount: incident.massCasualtyCount },
      newValues: { massCasualty: false },
    });

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

  async closeIncident(id: string, user: { userId: string; role: Role }, reason: string) {
    const incident = await this.app.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundError('Incident not found');
    if (incident.status === IncidentStatus.RESOLVED) {
      throw new BadRequestError('This incident is already closed');
    }

    const updated = await this.app.prisma.incident.update({
      where: { id },
      data: {
        status: IncidentStatus.RESOLVED,
        closureReason: reason,
        closedById: user.userId,
      },
    });

    await this.writeAudit({
      userId: user.userId,
      action: 'CLOSE',
      subjectId: id,
      oldValues: { status: incident.status },
      newValues: { status: IncidentStatus.RESOLVED, closureReason: reason },
    });

    this.app.io.to(`incident:${id}`).emit('incident:update', updated);
    this.app.io
      .to(`role:${Role.DISPATCHER}`)
      .to(`role:${Role.ADMIN}`)
      .to(`role:${Role.SUPER_ADMIN}`)
      .emit('incident:closed', { id, caseNumber: incident.caseNumber, reason, closedBy: user.role });

    return updated;
  }

  // ── Nature options (user-extensible taxonomy) ─────────────────────────────

  private readonly SEED_NATURES: Array<{ nature: string; details: string[] }> = [
    { nature: 'Trauma',      details: ['Road Traffic Accident', 'Fall', 'Assault/Violence', 'Industrial Accident', 'Sports Injury', 'Other'] },
    { nature: 'Medical',     details: ['Cardiac Arrest', 'Stroke', 'Seizure', 'Respiratory Distress', 'Diabetic Emergency', 'Other'] },
    { nature: 'Obstetric',   details: ['Labour', 'Post-partum Haemorrhage', 'Eclampsia', 'Miscarriage', 'Other'] },
    { nature: 'Pediatric',   details: ['Febrile Convulsion', 'Neonatal Emergency', 'Respiratory Distress', 'Trauma', 'Other'] },
    { nature: 'Psychiatric', details: ['Attempted Suicide', 'Acute Psychosis', 'Aggression', 'Other'] },
    { nature: 'Burns',       details: ['Chemical', 'Electrical', 'Thermal', 'Other'] },
    { nature: 'Poisoning',   details: ['Drug Overdose', 'Chemical Ingestion', 'Snake Bite', 'Other'] },
    { nature: 'Other',       details: ['Other'] },
  ];

  async getNatureOptions(): Promise<Array<{ nature: string; details: string[] }>> {
    const rows = await this.app.prisma.incidentNatureOption.findMany({
      orderBy: [{ nature: 'asc' }, { detail: 'asc' }],
    });

    // Auto-seed defaults on first use
    if (rows.length === 0) {
      const seeds = this.SEED_NATURES.flatMap(({ nature, details }) => [
        { nature, detail: null },
        ...details.map(detail => ({ nature, detail })),
      ]);
      await this.app.prisma.incidentNatureOption.createMany({ data: seeds, skipDuplicates: true });
      return this.SEED_NATURES;
    }

    // Group into { nature, details[] }
    const map = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.detail) {
        if (!map.has(row.nature)) map.set(row.nature, []);
      } else {
        if (!map.has(row.nature)) map.set(row.nature, []);
        map.get(row.nature)!.push(row.detail);
      }
    }
    return Array.from(map.entries()).map(([nature, details]) => ({ nature, details }));
  }

  async createNatureOption(nature: string, detail?: string): Promise<void> {
    // upsert can't match NULL in a unique index (NULL != NULL in Postgres),
    // so use findFirst + create for the top-level nature row
    const topExists = await this.app.prisma.incidentNatureOption.findFirst({
      where: { nature, detail: null },
    });
    if (!topExists) {
      await this.app.prisma.incidentNatureOption.create({ data: { nature, detail: null } });
    }
    if (detail) {
      const detailExists = await this.app.prisma.incidentNatureOption.findFirst({
        where: { nature, detail },
      });
      if (!detailExists) {
        await this.app.prisma.incidentNatureOption.create({ data: { nature, detail } });
      }
    }
  }
}