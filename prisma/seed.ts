import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("admin123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Admin User",
      password: hashedPassword,
      role: "SUPER_ADMIN",
    },
  });

  console.log("Seeded admin user:", admin.email);

  const event = await prisma.event.upsert({
    where: { slug: "tech-conference-2026" },
    update: {},
    create: {
      name: "Tech Conference 2026",
      slug: "tech-conference-2026",
      description: "Annual technology conference",
      venue: "Convention Center",
      startDate: new Date("2026-06-15"),
      endDate: new Date("2026-06-17"),
      isActive: true,
    },
  });

  console.log("Seeded event:", event.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
