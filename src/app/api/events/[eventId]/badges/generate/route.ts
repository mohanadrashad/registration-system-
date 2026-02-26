import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateQRCode, generateBadgeHtml } from "@/lib/badge-generator";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const body = await req.json();
  const { registrationIds } = body;

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const badgeTemplate = await prisma.badgeTemplate.findUnique({
    where: { eventId },
  });

  if (!badgeTemplate) {
    // Auto-create a default template
    await prisma.badgeTemplate.create({
      data: {
        eventId,
        name: "Default Badge",
        designJson: { theme: "default" },
      },
    });
  }

  const template = badgeTemplate || await prisma.badgeTemplate.findUnique({ where: { eventId } });

  const where: Record<string, unknown> = { eventId, status: "CONFIRMED" };
  if (registrationIds?.length) {
    where.id = { in: registrationIds };
  }

  const registrations = await prisma.registration.findMany({
    where,
    include: { contact: true },
  });

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let generated = 0;

  for (const reg of registrations) {
    const qrCodeDataUrl = await generateQRCode(
      `${appUrl}/badge/${reg.confirmationCode}`
    );

    const badgeHtml = generateBadgeHtml({
      firstName: reg.contact.firstName,
      lastName: reg.contact.lastName,
      email: reg.contact.email,
      organization: reg.contact.organization || undefined,
      designation: reg.contact.designation || undefined,
      category: reg.contact.category || undefined,
      eventName: event.name,
      confirmationCode: reg.confirmationCode,
      qrCodeDataUrl,
    });

    // Store badge record
    await prisma.badge.upsert({
      where: { registrationId: reg.id },
      update: {
        qrCodeData: `${appUrl}/badge/${reg.confirmationCode}`,
      },
      create: {
        registrationId: reg.id,
        templateId: template!.id,
        qrCodeData: `${appUrl}/badge/${reg.confirmationCode}`,
      },
    });

    await prisma.registration.update({
      where: { id: reg.id },
      data: { badgeGenerated: true },
    });

    generated++;
  }

  return NextResponse.json({
    success: true,
    generated,
    total: registrations.length,
  });
}
