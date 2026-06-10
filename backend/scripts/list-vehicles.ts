import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';

const prisma = createPrismaClient();

async function main() {
  const vehicles = await prisma.vehicle.findMany({
    select: { id: true, registrationNumber: true, status: true, isActive: true, agencyId: true },
  });
  console.log(`Total vehicles: ${vehicles.length}`);
  vehicles.forEach(v =>
    console.log(`  ${v.registrationNumber} | ${v.status} | active=${v.isActive} | agency=${v.agencyId}`)
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
