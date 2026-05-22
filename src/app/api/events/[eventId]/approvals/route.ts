import { NextResponse } from "next/server";
import { authorize } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { approvalService } from "@/lib/services/approval.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get pending approvals, waitlist, and capacity info
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const ctx = await authorize();
    if (ctx instanceof NextResponse) return ctx;

    const { eventId } = await params;

    // Check if event exists and has approval module enabled
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { modules: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const [capacityInfo, pendingApprovals, waitlist] = await Promise.all([
      approvalService.getCapacityInfo(eventId),
      approvalService.getPendingApprovals(eventId),
      approvalService.getWaitlist(eventId),
    ]);

    return NextResponse.json({
      capacity: capacityInfo,
      pendingApprovals,
      waitlist,
    });
  } catch (error) {
    console.error("Error getting approvals:", error);
    return NextResponse.json(
      { error: "Failed to get approvals" },
      { status: 500 }
    );
  }
}

// POST - Approve or reject a registration
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const ctx = await authorize("editor");
    if (ctx instanceof NextResponse) return ctx;

    const { eventId } = await params;
    const body = await request.json();

    const { action, registrationId, reason } = body;

    if (!registrationId) {
      return NextResponse.json(
        { error: "registrationId is required" },
        { status: 400 }
      );
    }

    // Verify registration belongs to event
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
    });

    if (!registration || registration.eventId !== eventId) {
      return NextResponse.json(
        { error: "Registration not found" },
        { status: 404 }
      );
    }

    let result;

    switch (action) {
      case "approve":
        result = await approvalService.approve(registrationId, ctx.session.user.id);
        break;

      case "reject":
        result = await approvalService.reject(
          registrationId,
          reason,
          ctx.session.user.id
        );
        break;

      case "promote":
        result = await approvalService.promoteFromWaitlist(
          eventId,
          ctx.session.user.id
        );
        break;

      case "cancel":
        result = await approvalService.cancelAndPromote(
          registrationId,
          ctx.session.user.id
        );
        break;

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: approve, reject, promote, or cancel" },
          { status: 400 }
        );
    }

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  } catch (error) {
    console.error("Error processing approval action:", error);
    return NextResponse.json(
      { error: "Failed to process action" },
      { status: 500 }
    );
  }
}
