import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma.js';
import { normalizeMsisdn } from '../src/modules/sms/sms.service.js';

/**
 * One-time fix for OTP login returning "not found" for real driver/EMT
 * accounts. User.phone used to be stored exactly as an admin typed it
 * (e.g. "0712345678"), but OTP login looks it up by the normalized
 * 254XXXXXXXXX form. This rewrites every existing User.phone to that form
 * so accounts set up before the write-path fix start working immediately,
 * without needing an admin to re-enter every number by hand.
 *
 * Usage:  npx tsx scripts/normalize-user-phones.ts
 */
const prisma = createPrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, name: true, role: true, phone: true },
  });

  let updated = 0;
  let unchanged = 0;
  let unparseable = 0;

  for (const u of users) {
    const normalized = normalizeMsisdn(u.phone!);
    if (!normalized) {
      console.log(`⚠️  ${u.name} (${u.role}): "${u.phone}" is not a valid Kenyan number, left as is`);
      unparseable++;
      continue;
    }
    if (normalized === u.phone) {
      unchanged++;
      continue;
    }

    // Two users could end up sharing a phone once normalized even if their
    // raw values looked different. Skip and flag rather than silently
    // creating a duplicate, since OTP login treats duplicates as an error.
    const clash = await prisma.user.findFirst({
      where: { phone: normalized, id: { not: u.id } },
      select: { id: true, name: true },
    });
    if (clash) {
      console.log(`⚠️  ${u.name} (${u.role}): "${u.phone}" normalizes to ${normalized}, which ${clash.name} already has. Skipped, needs manual review.`);
      continue;
    }

    await prisma.user.update({ where: { id: u.id }, data: { phone: normalized } });
    console.log(`✔ ${u.name} (${u.role}): "${u.phone}" -> ${normalized}`);
    updated++;
  }

  console.log(`\n✅ Done. ${updated} updated, ${unchanged} already normalized, ${unparseable} could not be parsed.`);
}

main()
  .catch((err) => {
    console.error('Normalize failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
