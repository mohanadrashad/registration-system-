import { NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { approvalService } from "@/lib/services/approval.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get pending approvals, waitlist, and capacity info
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    // Read-only endpoint: any event member can fetch the approvals
    // panel data. "authenticated" is the lowest RoleRequirement and
    // maps to canViewEvent (passes when eventRole !== null OR
    // SUPER_ADMIN). Closes the asymmetric posture where Stage 2's
    // POST migration would gate writes per-event but reads would
    // remain open to any logged-in user.
    const ctx = await authorizeEvent(eventId, { role: "authenticated" });
    if (ctx instanceof NextResponse) return ctx;

    const [capacityInfo, pendingApprovals, waitlist, recent] =
      await Promise.all([
        approvalService.getCapacityInfo(eventId),
        approvalService.getPendingApprovals(eventId),
        approvalService.getWaitlist(eventId),
        // Stage 4 of ADMIN_EDIT_FIX_SPEC: recent approval/rejection
        // decisions for the new "Recent Decisions" tab. Capped at
        // 100; totalRecent surfaces the full count so the UI can
        // render the "Showing 100 most recent" footer only when
        // truncated.
        approvalService.getRecentDecisions(eventId),
      ]);

    return NextResponse.json({
      capacity: capacityInfo,
      pendingApprovals,
      waitlist,
      recentDecisions: recent.decisions,
      totalRecentDecisions: recent.totalRecent,
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
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor" });
    if (ctx instanceof NextResponse) return ctx;

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
