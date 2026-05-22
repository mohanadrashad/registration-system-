import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { authorizeEvent } from "@/lib/api-auth";
import {
  updateContactSchema,
  validateCategoryForEvent,
} from "@/lib/validations/contact";
import { isJsonEqual } from "@/lib/json-equal";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, contactId } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      registration: { select: { id: true, status: true, registeredAt: true, confirmationCode: true, badgeEmailSent: true, badgeGenerated: true } },
      emailLogs: { select: { id: true, status: true, sentAt: true, subject: true }, orderBy: { sentAt: "desc" } },
      event: { select: { slug: true, name: true, categories: true } },
    },
  });

  if (!contact || contact.eventId !== eventId) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Scope the "Attendee Information" panel to fields from the
  // REGISTRATION phase only. Post-registration phase fields live on
  // their own submissions and shouldn't bleed into the attendee
  // overview (otherwise stale or unrelated rows like leftover test
  // fields on a Flight Info phase pollute every attendee row).
  const formFields = await prisma.formField.findMany({
    where: {
      eventId,
      isActive: true,
      step: { phase: { type: "REGISTRATION" } },
    },
    orderBy: { order: "asc" },
    select: { name: true, label: true, labelAr: true, type: true, options: true, isSystem: true, required: true },
  });

  return NextResponse.json({ ...contact, formFields });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const { eventId, contactId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;
  // EventAuthContext.session.user.id is typed as required string —
  // Stage 1's defensive null check is no longer needed here.
  const userId = ctx.session.user.id;

  // Cross-event isolation. authorizeEvent verifies the CALLER's
  // membership on this event, but the contactId in the URL could
  // belong to another event entirely. Without this, an editor on
  // event A could pass /events/A/contacts/<id-from-event-B> and
  // silently update event B's contact. 404 (not 403) matches the
  // GET handler's pattern at L30 and avoids leaking that the
  // contact exists elsewhere.
  const existing = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { eventId: true },
  });
  if (!existing || existing.eventId !== eventId) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const body = await req.json();
  const result = updateContactSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  // ctx.event is loaded by authorizeEvent — reuse it for the category
  // check rather than re-fetching. Saves a round trip on every PUT.
  const categoryCheck = validateCategoryForEvent(
    result.data.category,
    ctx.event.categories
  );
  if (!categoryCheck.ok) {
    return NextResponse.json({ error: categoryCheck.error }, { status: 400 });
  }

  const { metadata, formData, category, ...rest } = result.data;
  const hasFormData =
    formData !== undefined && Object.keys(formData).length > 0;

  try {
    const contact = await prisma.$transaction(async (tx) => {
      // When formData is being merged, we need the current metadata as
      // the base. Otherwise we can skip the read entirely.
      const currentContact = hasFormData
        ? await tx.contact.findUnique({
            where: { id: contactId },
            select: { metadata: true },
          })
        : null;

      const data: Prisma.ContactUpdateInput = { ...rest };
      // Only write category when the field was present in the payload;
      // an omitted field must not clear an existing category.
      if (category !== undefined) {
        data.category = categoryCheck.value ?? null;
      }
      // metadata + formData precedence:
      //   - Only metadata sent (legacy clients)  → write as-is.
      //   - Only formData sent (new admin save)  → merge into existing.
      //   - Both sent                            → metadata is the base,
      //     formData merges on top. Won't happen with the post-Stage-1
      //     dashboard but kept defensively in case a caller missed by
      //     the audit sends both.
      //   - Neither                              → metadata untouched.
      if (hasFormData) {
        const base =
          metadata !== undefined && metadata !== null
            ? (metadata as Record<string, unknown>)
            : ((currentContact?.metadata as Record<string, unknown> | null) ??
              {});
        data.metadata = { ...base, ...formData } as Prisma.InputJsonValue;
      } else if (metadata !== undefined) {
        data.metadata =
          metadata === null
            ? Prisma.DbNull
            : (metadata as Prisma.InputJsonValue);
      }
      // Stamp the actor on every admin-initiated write — every PUT is
      // an edit by definition. Visitor self-edits go through the portal
      // route, which intentionally leaves this null. Prisma's checked
      // input type expects the relation form, not the raw FK column.
      data.updater = { connect: { id: userId } };

      const updated = await tx.contact.update({
        where: { id: contactId },
        data,
      });

      // Mirror formData into Registration.formData so the CSV export,
      // badge renderer, and email variable resolver — all of which read
      // formData and not Contact.metadata — see admin corrections. Only
      // fires when a Registration exists; pre-registration contacts
      // (IMPORTED / INVITED) update Contact.metadata only.
      //
      // Secondary gate: the dashboard sends the FULL non-column field
      // set on every save (not just changed keys), so hasFormData is
      // true even for Contact-column-only edits. Skip the Registration
      // write when no submitted formData value actually differs from
      // what's already stored — otherwise Registration.updatedAt would
      // bump and Registration.updatedBy would be stamped on every PUT,
      // not just real formData edits.
      //
      // Side effect (intentional): if Contact.metadata has drifted
      // from Registration.formData historically (the pre-fix CSV-drift
      // residue), the diff sees that and the merge heals it on the
      // next admin save. No separate cleanup project needed.
      if (hasFormData) {
        const registration = await tx.registration.findUnique({
          where: { contactId },
          select: { id: true, formData: true },
        });
        if (registration) {
          const base =
            (registration.formData as Record<string, unknown> | null) ?? {};
          const changed = Object.keys(formData).some(
            (k) => !isJsonEqual(base[k], formData[k])
          );
          if (changed) {
            await tx.registration.update({
              where: { id: registration.id },
              data: {
                formData: { ...base, ...formData } as Prisma.InputJsonValue,
                updater: { connect: { id: userId } },
              },
            });
          }
        }
      }

      return updated;
    });

    return NextResponse.json(contact);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Most likely the @@unique([eventId, email]) constraint.
      return NextResponse.json(
        {
          error:
            "That email is already used by another attendee on this event.",
        },
        { status: 409 }
      );
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const { eventId, contactId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "manager" });
  if (ctx instanceof NextResponse) return ctx;

  // Cross-event guard — same reasoning as PUT.
  const existing = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { eventId: true },
  });
  if (!existing || existing.eventId !== eventId) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  try {
    await prisma.$transaction([
      prisma.emailLog.deleteMany({ where: { contactId } }),
      prisma.registration.deleteMany({ where: { contactId } }),
      prisma.contact.delete({ where: { id: contactId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete attendee" }, { status: 500 });
  }
}
