import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/api-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; templateId: string }> }
) {
  const ctx = await authorize();
  if (ctx instanceof NextResponse) return ctx;

  const { templateId } = await params;
  const template = await prisma.emailTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ eventId: string; templateId: string }> }
) {
  const ctx = await authorize("editor");
  if (ctx instanceof NextResponse) return ctx;

  const { templateId } = await params;
  const body = await req.json();

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
  const ctx = await authorize("editor");
  if (ctx instanceof NextResponse) return ctx;

  const { templateId } = await params;
  await prisma.emailTemplate.delete({ where: { id: templateId } });
  return NextResponse.json({ success: true });
}
