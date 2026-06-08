import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; templateId: string }> }
) {
  const { eventId, templateId } = await params;
  const ctx = await authorizeEvent(eventId);
  if (ctx instanceof NextResponse) return ctx;

  // Row-level cross-event scoping: a template belonging to another event
  // returns 404 (same as missing) so existence doesn't leak across events.
  const template = await prisma.emailTemplate.findFirst({
    where: { id: templateId, eventId },
  });

  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ eventId: string; templateId: string }> }
) {
  const { eventId, templateId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();

  // Cross-event guard: confirm the template belongs to this event before
  // updating. update()'s `where` is unique-by-id and can't carry eventId;
  // a template's eventId never changes, so this pre-check has no TOCTOU
  // window. 404 (not 403) on mismatch so existence doesn't leak.
  const existing = await prisma.emailTemplate.findFirst({
    where: { id: templateId, eventId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const template = await prisma.emailTemplate.update({
    where: { id: templateId },
    data: {
      name: body.name,
      type: body.type,
      subject: body.subject,
      bodyHtml: body.bodyHtml,
      bodyJson: body.bodyJson,
      headerHtml: body.headerHtml,
      footerHtml: body.footerHtml,
      variables: body.variables || [],
    },
  });

  return NextResponse.json(template);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; templateId: string }> }
) {
  const { eventId, templateId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  // Scoped delete: deleteMany with eventId so a template belonging to
  // another event can't be deleted by id. count === 0 → 404 (the PR #36
  // cross-event-isolation pattern; single round-trip, no read-then-write
  // race window).
  const result = await prisma.emailTemplate.deleteMany({
    where: { id: templateId, eventId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
