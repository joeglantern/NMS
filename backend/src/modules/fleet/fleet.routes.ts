import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { FleetService } from './fleet.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';
import { BadRequestError } from '../../shared/errors/AppError.js';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';

export const fleetRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const fleetService = new FleetService(app);

  app.addHook('preValidation', app.authenticate);

  /**
   * POST /fleet/location
   * Updates a vehicle's location. Typically called by the tablet/MDT in the ambulance
   * via an automated polling interval.
   */
  app.post<{
    Body: {
      imei: string;
      lat: number;
      lng: number;
    };
  }>(
    '/location',
    // In reality, this might be a specific DEVICE role or DRIVER, but we'll allow DRIVER/DISPATCHER/ADMIN here
    { preValidation: [requireRole([Role.DRIVER, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const { imei, lat, lng } = request.body;
      const result = await fleetService.updateVehicleLocation(imei, lat, lng);
      return reply.send({ ok: true, data: result });
    }
  );

  /**
   * GET /fleet/locations
   * Gets all active vehicle locations (for the Dispatch map).
   */
  app.get(
    '/locations',
    { preValidation: [requireRole([Role.WATCHER, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const locations = await fleetService.getAllActiveVehicleLocations();
      return reply.send({ ok: true, data: locations });
    }
  );

  /**
   * GET /fleet/vehicles
   * Agency vehicles available for crew check-in (mobile responder app).
   */
  app.get(
    '/vehicles',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE])] },
    async (request, reply) => {
      const vehicles = await fleetService.listAgencyVehicles(request.user.agencyId);
      return reply.send({ ok: true, data: vehicles });
    }
  );

  /**
   * GET /fleet/my-checkin
   * Returns the vehicle this responder is currently checked in to.
   */
  app.get(
    '/my-checkin',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE])] },
    async (request, reply) => {
      const vehicle = await fleetService.getMyCheckIn(request.user.userId, request.user.role);
      return reply.send({ ok: true, data: vehicle });
    }
  );

  /**
   * POST /fleet/:vehicleId/checkin
   * Driver/EMT/Nurse checks in to a vehicle at shift start.
   * Auto-clears any previous vehicle assignment for this user.
   *
   * Expects multipart/form-data (send the text fields BEFORE the file part):
   * - lat:  string/number — GPS latitude at check-in  (required)
   * - lng:  string/number — GPS longitude at check-in (required)
   * - file: image/*       — accountability selfie      (required)
   */
  app.post<{ Params: { vehicleId: string } }>(
    '/:vehicleId/checkin',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE])] },
    async (request, reply) => {
      const file = await (request as any).file?.();
      if (!file) throw new BadRequestError('A check-in selfie image (field "file") is required');
      if (!file.mimetype?.startsWith('image/')) {
        throw new BadRequestError('The check-in selfie must be an image');
      }

      const lat = Number(file.fields?.lat?.value);
      const lng = Number(file.fields?.lng?.value);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new BadRequestError('Valid "lat" and "lng" fields are required (send them before the file part)');
      }

      const vehicle = await fleetService.checkInToCrew(
        request.params.vehicleId,
        request.user.userId,
        request.user.role,
        { lat, lng },
        { filename: file.filename, mimetype: file.mimetype, file: file.file },
      );
      return reply.send({ ok: true, data: vehicle });
    }
  );

  // ── Standby deployments (fleet standby reporting) ────────────────────────────

  /** GET /fleet/standby?active=true|false&vehicleId=&from=&to= — standby report. */
  app.get<{ Querystring: { active?: string; vehicleId?: string; from?: string; to?: string } }>(
    '/standby',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const active = request.query.active === 'true' ? true : request.query.active === 'false' ? false : undefined;
      const data = await fleetService.listStandby({
        active,
        vehicleId: request.query.vehicleId,
        from: request.query.from,
        to: request.query.to,
      });
      return reply.send({ ok: true, data });
    }
  );

  /** POST /fleet/standby — place a vehicle on standby. */
  app.post<{ Body: { vehicleId: string; title: string; location?: string; lat?: number; lng?: number; notes?: string; startedAt?: string } }>(
    '/standby',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      if (!request.body?.vehicleId) throw new BadRequestError('vehicleId is required');
      if (!request.body?.title?.trim()) throw new BadRequestError('A standby title/reason is required');
      const data = await fleetService.startStandby(request.user.userId, request.body);
      return reply.status(201).send({ ok: true, data });
    }
  );

  /** PATCH /fleet/standby/:id/end — end an active standby. */
  app.patch<{ Params: { id: string }; Body: { endedAt?: string } }>(
    '/standby/:id/end',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const data = await fleetService.endStandby(request.params.id, request.body?.endedAt);
      return reply.send({ ok: true, data });
    }
  );

  /**
   * GET /fleet/partner-ambulances
   * Active partner ambulances (Red Cross, Fire Brigade, etc.) as reference capacity
   * for dispatchers. These have no trackers, so this is contact/vehicle info only.
   */
  app.get(
    '/partner-ambulances',
    { preValidation: [requireRole([Role.WATCHER, Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (_request, reply) => {
      const data = await fleetService.listPartnerAmbulances();
      return reply.send({ ok: true, data });
    }
  );

  /**
   * GET /fleet/crew-members
   * EMT / nurse users in the driver's agency, for the crew-assignment picker.
   */
  app.get(
    '/crew-members',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const crew = await fleetService.listAssignableCrew(request.user.agencyId);
      return reply.send({ ok: true, data: crew });
    }
  );

  /**
   * POST /fleet/:vehicleId/crew
   * Driver assigns/clears the EMT and/or nurse on their vehicle.
   * Body: { emtId?: string | null; nurseId?: string | null } (omit a key to leave unchanged)
   */
  app.post<{ Params: { vehicleId: string }; Body: { emtId?: string | null; nurseId?: string | null } }>(
    '/:vehicleId/crew',
    { preValidation: [requireRole([Role.DRIVER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const vehicle = await fleetService.assignCrew(
        request.params.vehicleId,
        { userId: request.user.userId, role: request.user.role },
        request.body ?? {},
      );
      return reply.send({ ok: true, data: vehicle });
    }
  );

  /**
   * GET /fleet/checkins?vehicleId=&limit=
   * Recent check-in events (selfie + location) for dispatcher/admin accountability.
   */
  app.get<{ Querystring: { vehicleId?: string; limit?: string } }>(
    '/checkins',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const checkIns = await fleetService.listCheckIns({
        vehicleId: request.query.vehicleId,
        limit: request.query.limit ? parseInt(request.query.limit, 10) : undefined,
      });
      return reply.send({ ok: true, data: checkIns });
    }
  );

  /**
   * GET /fleet/checkins/:id/selfie
   * Streams the check-in selfie image (requires auth via Bearer header).
   */
  app.get<{ Params: { id: string } }>(
    '/checkins/:id/selfie',
    { preValidation: [requireRole([Role.DISPATCHER, Role.ADMIN, Role.SUPER_ADMIN])] },
    async (request, reply) => {
      const checkIn = await fleetService.getCheckIn(request.params.id);
      const filePath = fleetService.checkinSelfieAbsolutePath(checkIn.selfiePath);
      if (!existsSync(filePath)) throw new BadRequestError('Selfie file not found on server');

      const ext = path.extname(filePath).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
      return reply.send(createReadStream(filePath));
    }
  );

  /**
   * DELETE /fleet/:vehicleId/checkin
   * Crew member checks out of a vehicle (end of shift / logout).
   */
  app.delete<{ Params: { vehicleId: string } }>(
    '/:vehicleId/checkin',
    { preValidation: [requireRole([Role.DRIVER, Role.EMT, Role.NURSE])] },
    async (request, reply) => {
      const vehicle = await fleetService.checkOutFromCrew(
        request.params.vehicleId,
        request.user.userId,
        request.user.role,
      );
      return reply.send({ ok: true, data: vehicle });
    }
  );
};
