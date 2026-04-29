import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { FleetService } from './fleet.service.js';
import { requireRole } from '../../shared/guards/requireRole.js';
import { Role } from '../../shared/types/index.js';

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
};
