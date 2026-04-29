import { FastifyInstance } from 'fastify';
import { haversineDistance } from '../../shared/utils/haversine.js';
import { FleetService } from '../fleet/fleet.service.js';

export class DispatchService {
  private fleetService: FleetService;

  constructor(private app: FastifyInstance) {
    this.fleetService = new FleetService(app);
  }

  /**
   * Finds the nearest active vehicles to a given incident coordinate.
   * 
   * @param lat Incident latitude
   * @param lng Incident longitude
   * @param agencyId (Optional) filter vehicles by agency
   * @param limit Maximum number of vehicles to return
   */
  async findNearestVehicles(lat: number, lng: number, agencyId?: string, limit: number = 5) {
    // 1. Fetch all active vehicle locations from Redis
    const allLocations = await this.fleetService.getAllActiveVehicleLocations();

    // 2. Filter by agency if needed, and ensure they are ACTIVE
    const availableVehicles = allLocations.filter(v => {
      const isAvailable = v.status === 'ACTIVE'; // Assume 'ACTIVE' means ready for dispatch
      const matchesAgency = agencyId ? v.agencyId === agencyId : true;
      return isAvailable && matchesAgency;
    });

    // 3. Calculate distance for each vehicle
    const vehiclesWithDistance = availableVehicles.map(v => {
      const distanceKm = haversineDistance(lat, lng, v.lat, v.lng);
      return { ...v, distanceKm };
    });

    // 4. Sort by nearest first
    vehiclesWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    // 5. Return top N vehicles
    return vehiclesWithDistance.slice(0, limit);
  }
}
