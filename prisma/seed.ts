import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

function readAdminCredentials() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!email) {
    throw new Error(
      "SEED_ADMIN_EMAIL is required. Set it in .env before running `npm run db:seed`."
    );
  }

  if (!password) {
    // If caller hasn't provided a password, fail loudly rather than silently
    // creating a backdoor with a known credential. Suggest a random one.
    const suggested = randomBytes(16).toString("base64url");
    throw new Error(
      `SEED_ADMIN_PASSWORD is required. Set one in .env (suggested: ${suggested}).`
    );
  }

  if (password.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters.");
  }

  return { email, password, name };
}

async function main() {
  const { email, password, name } = readAdminCredentials();
  const hashedPassword = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      password: hashedPassword,
      role: "SUPER_ADMIN",
    },
  });

  console.log("Seeded admin user:", admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
