import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Lightweight template resolver for the public registration container: which
// curated template should render this event. Kept separate from the full
// register GET so the container can dispatch to the right component without
// pulling the whole form payload. Public (the registration page is
// unauthenticated); returns only the template name.
//
// Stage 1b folds this into the single data fetch the container's hook will own
// — at which point this route can go away.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventSlug: string }> }
) {
  const { eventSlug } = await params;
  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    select: { isActive: true, template: true },
  });

  // Mirror the register GET's gate. On not-found / inactive we still return a
  // template (CLASSIC) so the container renders the normal "event not found"
  // state via ClassicTemplate rather than nothing.
  if (!event || !event.isActive) {
    return NextResponse.json({ template: "CLASSIC" }, { status: 200 });
  }
  return NextResponse.json({ template: event.template });
}
