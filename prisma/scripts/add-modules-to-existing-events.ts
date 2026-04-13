/**
 * Migration script to add EventModules to existing events
 *
 * Run with: npx tsx prisma/scripts/add-modules-to-existing-events.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting migration: Add modules to existing events...\n");

  // Find all events without modules
  const eventsWithoutModules = await prisma.event.findMany({
    where: {
      modules: null,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (eventsWithoutModules.length === 0) {
    console.log("All events already have modules. Nothing to do.");
    return;
  }

  console.log(`Found ${eventsWithoutModules.length} events without modules:\n`);

  for (const event of eventsWithoutModules) {
    console.log(`  - ${event.name} (${event.id})`);
  }

  console.log("\nCreating modules...\n");

  let created = 0;
  let failed = 0;

  for (const event of eventsWithoutModules) {
    try {
      await prisma.eventModules.create({
        data: {
          eventId: event.id,
        },
      });
      console.log(`  [OK] Created modules for: ${event.name}`);
      created++;
    } catch (error) {
      console.error(`  [ERROR] Failed for: ${event.name}`, error);
      failed++;
    }
  }

  console.log("\n--- Migration Complete ---");
  console.log(`  Created: ${created}`);
  console.log(`  Failed: ${failed}`);
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
