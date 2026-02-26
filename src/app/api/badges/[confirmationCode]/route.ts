import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateQRCode, generateBadgeHtml } from "@/lib/badge-generator";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ confirmationCode: string }> }
) {
  const { confirmationCode } = await params;

  const registration = await prisma.registration.findUnique({
    where: { confirmationCode },
    include: {
      contact: true,
      event: true,
    },
  });

  if (!registration) {
    return NextResponse.json({ error: "Badge not found" }, { status: 404 });
  }

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const qrCodeDataUrl = await generateQRCode(
    `${appUrl}/badge/${confirmationCode}`
  );

  const html = generateBadgeHtml({
    firstName: registration.contact.firstName,
    lastName: registration.contact.lastName,
    email: registration.contact.email,
    organization: registration.contact.organization || undefined,
    designation: registration.contact.designation || undefined,
    category: registration.contact.category || undefined,
    eventName: registration.event.name,
    confirmationCode,
    qrCodeDataUrl,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
