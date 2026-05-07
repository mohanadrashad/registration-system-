import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import {
  deleteOption,
  OptionConcurrencyError,
  OptionInUseError,
  OptionNotFoundError,
  reorderOption,
  updateOption,
} from "@/lib/services/selection.service";
import {
  reorderOptionSchema,
  updateOptionSchema,
} from "@/lib/validations/selection";

async function requireOptionOnPhaseAndEvent(
  eventId: string,
  phaseId: string,
  optionId: string
) {
  const option = await prisma.phaseOption.findUnique({
    where: { id: optionId },
    select: {
      phaseId: true,
      phase: { select: { eventId: true } },
    },
  });
  if (!option) return null;
  if (option.phaseId !== phaseId) return null;
  if (option.phase.eventId !== eventId) return null;
  return option;
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ eventId: string; phaseId: string; optionId: string }>;
  }
) {
  const { eventId, phaseId, optionId } = await params;
  const auth = await authorizeEvent(eventId, {
    role: "editor",
    module: "postRegPhases",
  });
  if (auth instanceof NextResponse) return auth;

  if (!(await requireOptionOnPhaseAndEvent(eventId, phaseId, optionId))) {
    return apiError("Option not found on this phase", 404);
  }

  const body = await req.json();

  // Reorder shares the route surface with edits, same pattern as steps/phases.
  if (body && typeof body === "object" && "direction" in body) {
    const parsed = reorderOptionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(JSON.stringify(parsed.error.flatten()), 400);
    }
    try {
      await reorderOption(phaseId, optionId, parsed.data.direction);
      return NextResponse.json({ success: true });
    } catch (e) {
      if (e instanceof OptionNotFoundError) return apiError(e.message, 404);
      throw e;
    }
  }

  const parsed = updateOptionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(JSON.stringify(parsed.error.flatten()), 400);
  }

  try {
    // Strip expectedUpdatedAt from the patch — it's a control field, not a
    // column write. The service compares it inside a transaction.
    const { expectedUpdatedAt, ...patch } = parsed.data;
    const updated = await updateOption(
      optionId,
      patch,
      expectedUpdatedAt ? new Date(expectedUpdatedAt) : null
    );
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof OptionConcurrencyError) {
      return NextResponse.json(
        {
          error: e.message,
          code: e.code,
          currentUpdatedAt: e.currentUpdatedAt.toISOString(),
        },
        { status: 409 }
      );
    }
    if (e instanceof OptionNotFoundError) {
      return apiError(e.message, 404, e.code);
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ eventId: string; phaseId: string; optionId: string }>;
  }
) {
  const { eventId, phaseId, optionId } = await params;
  const auth = await authorizeEvent(eventId, {
    role: "editor",
    module: "postRegPhases",
  });
  if (auth instanceof NextResponse) return auth;

  if (!(await requireOptionOnPhaseAndEvent(eventId, phaseId, optionId))) {
    return apiError("Option not found on this phase", 404);
  }

  try {
    await deleteOption(optionId);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof OptionInUseError) {
      return NextResponse.json(
        {
          error: e.message,
          code: e.code,
          selectionCount: e.selectionCount,
        },
        { status: 409 }
      );
    }
    if (e instanceof OptionNotFoundError) {
      return apiError(e.message, 404, e.code);
    }
    throw e;
  }
}
