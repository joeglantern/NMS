import 'dotenv/config';
import { Role, AgencyType } from '../src/generated/prisma/index.js';
import { createPrismaClient } from '../src/lib/prisma.js';
import bcrypt from 'bcrypt';

const prisma = createPrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ── 1. NMS Internal Agency ──────────────────────────────────────────────────
  const nmsAgency = await prisma.agency.upsert({
    where: { id: 'nms-internal-agency' },
    update: {},
    create: {
      id: 'nms-internal-agency',
      name: 'NMS Emergency Operations Centre',
      type: AgencyType.INTERNAL,
      location: 'Nairobi, Kenya',
      contactInfo: {
        phone: '+254700000000',
        email: 'eoc@nms.go.ke',
      },
      isActive: true,
    },
  });
  console.log(`✅ Agency: ${nmsAgency.name}`);

  // ── 2. Super Admin User ─────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin@123!', 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@nms.go.ke' },
    update: {},
    create: {
      email: 'admin@nms.go.ke',
      passwordHash,
      name: 'System Administrator',
      phone: '+254700000001',
      role: Role.SUPER_ADMIN,
      agencyId: nmsAgency.id,
      isActive: true,
    },
  });
  console.log(`✅ Super Admin: ${superAdmin.email}`);

  // ── 3. Sample Facilities (KEPH levels 4–6) ──────────────────────────────────
  const facilities = [
    {
      id: 'facility-knh',
      name: 'Kenyatta National Hospital',
      type: 'Referral Hospital',
      kephLevel: 6,
      subCounty: 'Dagoretti North',
      lat: -1.3009,
      lng: 36.8062,
    },
    {
      id: 'facility-pumwani',
      name: 'Pumwani Maternity Hospital',
      type: 'Hospital',
      kephLevel: 5,
      subCounty: 'Kamukunji',
      lat: -1.2746,
      lng: 36.8395,
    },
    {
      id: 'facility-mbagathi',
      name: 'Mbagathi District Hospital',
      type: 'District Hospital',
      kephLevel: 4,
      subCounty: 'Dagoretti South',
      lat: -1.3223,
      lng: 36.7636,
    },
    {
      id: 'facility-mathare',
      name: 'Mathare Hospital',
      type: 'Hospital',
      kephLevel: 4,
      subCounty: 'Mathare',
      lat: -1.2612,
      lng: 36.8619,
    },
    {
      id: 'facility-ruaraka',
      name: 'Ruaraka Health Centre',
      type: 'Health Centre',
      kephLevel: 3,
      subCounty: 'Ruaraka',
      lat: -1.2480,
      lng: 36.8813,
    },
  ];

  for (const facility of facilities) {
    await prisma.facility.upsert({
      where: { id: facility.id },
      update: {},
      create: facility,
    });
    console.log(`✅ Facility: ${facility.name} (KEPH ${facility.kephLevel})`);
  }

  console.log('\n🎉 Seed complete!');
  console.log('─────────────────────────────────────');
  console.log('Super Admin credentials:');
  console.log('  Email:    admin@nms.go.ke');
  console.log('  Password: Admin@123!');
  console.log('─────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
