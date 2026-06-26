import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { approvalService } from "@/lib/services/approval.service";
import { sanitizeCss } from "@/lib/security/sanitize-css";
import { isFieldRequiredByCondition } from "@/lib/form-conditional";
import {
  parseFormFieldOptions,
  OTHER_VALUE,
  OTHER_SUFFIX,
} from "@/lib/form-builder/options-parse";
import { FieldType } from "@prisma/client";
import {
  getOrCreateUploadSessionId,
  readUploadSessionId,
} from "@/lib/registration/upload-session";
import { getRegistrationFileById } from "@/lib/services/registration-file.service";
import { generateSyntheticEmail } from "@/lib/contact/synthetic-email";
import { resolveContactColumns } from "@/lib/services/field-mapping.service";
import { FIELD_MAPPING_LEGACY_KEYS } from "@/lib/form-builder/field-mapping-labels";
import { allocateContactSerial } from "@/lib/attendees/serial";

// GET: Look up contact by invite token to pre-fill the registration form
// Also returns event details and branding for the registration page
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventSlug: string }> }
) {
  const { eventSlug } = await params;
  const token = req.nextUrl.searchParams.get("token");

  // Pull only the REGISTRATION phase, with its steps and active fields.
  // Post-registration phase fields are deliberately excluded — they're
  // collected later through the portal, not in this form.
  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    include: {
      branding: true,
      phases: {
        where: { type: "REGISTRATION" },
        orderBy: { order: "asc" },
        take: 1,
        include: {
          steps: {
            orderBy: { order: "asc" },
            include: {
              fields: {
                where: { isActive: true },
                orderBy: { order: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!event || !event.isActive) {
    return NextResponse.json({ error: "Event not found or not active" }, { status: 404 });
  }

  const registrationPhase = event.phases[0] ?? null;

  const steps = (registrationPhase?.steps ?? []).map((step) => ({
    id: step.id,
    title: step.title,
    titleAr: step.titleAr,
    description: step.description,
    descriptionAr: step.descriptionAr,
    order: step.order,
    fields: step.fields.map((field) => ({
      id: field.id,
      name: field.name,
      label: field.label,
      labelAr: field.labelAr,
      type: field.type,
      placeholder: field.placeholder,
      placeholderAr: field.placeholderAr,
      helpText: field.helpText,
      helpTextAr: field.helpTextAr,
      required: field.required,
      validation: field.validation,
      options: field.options,
      order: field.order,
      width: field.width,
      optionColumns: field.optionColumns,
      section: field.section,
      conditional: field.conditional,
      isSystem: field.isSystem,
      defaultValue: field.defaultValue,
      // FILE fields need `{ maxSizeMB, allowedMimeTypes }` client-side to
      // render the upload control with the configured limits. Other
      // field types ignore this. parseFileFieldMetadata handles the
      // null/legacy case transparently.
      metadata: field.metadata,
    })),
  }));

  const response: Record<string, unknown> = {
    eventName: event.name,
    eventDescription: event.description,
    venue: event.venue,
    startDate: event.startDate,
    endDate: event.endDate,
    branding: event.branding ? {
      primaryColor: event.branding.primaryColor,
      secondaryColor: event.branding.secondaryColor,
      backgroundColor: event.branding.backgroundColor,
      textColor: event.branding.textColor,
      logoUrl: event.branding.logoUrl,
      logoWhiteUrl: event.branding.logoWhiteUrl,
      headerImageUrl: event.branding.headerImageUrl,
      headerColor: event.branding.headerColor,
      headerShowLogo: event.branding.headerShowLogo,
      logoHeight: event.branding.logoHeight,
      welcomeTitle: event.branding.welcomeTitle,
      welcomeTitleAr: event.branding.welcomeTitleAr,
      welcomeMessage: event.branding.welcomeMessage,
      welcomeMessageAr: event.branding.welcomeMessageAr,
      footerText: event.branding.footerText,
      footerTextAr: event.branding.footerTextAr,
      customCss: sanitizeCss(event.branding.customCss),
    } : null,
    steps,
  };

  // If token provided, look up the contact
  if (token) {
    const contact = await prisma.contact.findUnique({
      where: { inviteToken: token },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        organization: true,
        designation: true,
        metadata: true,
      },
    });

    if (contact) {
      response.contact = contact;
    }
  }

  // Attach the visitor's reg_upload_session cookie before returning.
  // Establishing it on the first GET means FILE-field upload tokens
  // can be minted as soon as the visitor selects a file — no separate
  // "open a session" round-trip. The cookie value (signed UUID) is
  // never echoed into the response JSON, only set as an HttpOnly
  // Set-Cookie header.
  const res = NextResponse.json(response);
  getOrCreateUploadSessionId(req, res);
  return res;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventSlug: string }> }
) {
  const { eventSlug } = await params;
  const token = req.nextUrl.searchParams.get("token");

  // Validate against fields belonging to the REGISTRATION phase only.
  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    include: {
      phases: {
        where: { type: "REGISTRATION" },
        take: 1,
        include: {
          steps: {
            include: {
              fields: { where: { isActive: true } },
            },
          },
        },
      },
      modules: { select: { selfServicePortal: true } },
    },
  });

  if (!event || !event.isActive) {
    return NextResponse.json({ error: "Event not found or not active" }, { status: 404 });
  }

  const registrationFields = (event.phases[0]?.steps ?? []).flatMap(
    (step) => step.fields
  );

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Drop keys that don't correspond to a field on this form (or a known
  // companion/legacy key). Everything left in `body` is persisted verbatim
  // into Registration.formData and Contact.metadata below — without this
  // filter, arbitrary extra JSON keys a client sends are stored forever.
  const knownKeys = new Set<string>([
    "fullName",
    ...Object.values(FIELD_MAPPING_LEGACY_KEYS),
  ]);
  for (const field of registrationFields) {
    knownKeys.add(field.name);
    knownKeys.add(`${field.name}${OTHER_SUFFIX}`);
  }
  for (const key of Object.keys(body)) {
    if (!knownKeys.has(key)) delete body[key];
  }

  // additionalFields = body minus the legacy literal-key Contact column
  // names. Captured BEFORE the FILE-claim block below mutates body in
  // place — preserves the current behavior where Contact.metadata stores
  // client-submitted FILE refs and Registration.formData stores
  // server-canonical ones (a known latent inconsistency, out of scope
  // for Stage 2).
  //
  // The legacy literal keys themselves are consumed via
  // resolveContactColumns() below; we no longer destructure them as
  // locals since the resolver reads them straight from formData.
  //
  // `fullName` is filtered out in addition to the six FIELD_MAPPING_LEGACY_KEYS
  // values: it's the source for the resolver's final-rung splitter (formerly
  // the inline block at route.ts:430-441), so it's a legacy Contact-column
  // source — not "additional form data" worth storing in metadata. This
  // diverges from the pre-Stage-2 destructure which let fullName fall through
  // into additionalFields/Contact.metadata.
  const LEGACY_KEYS = new Set<string>([
    ...Object.values(FIELD_MAPPING_LEGACY_KEYS),
    "fullName",
  ]);
  const additionalFields = Object.fromEntries(
    Object.entries(body).filter(([k]) => !LEGACY_KEYS.has(k))
  );

  // Validate required fields. Skip a field if it has a `conditional.showIf`
  // that evaluates false against the submitted body — hidden fields aren't
  // required.
  for (const field of registrationFields) {
    if (!field.required) continue;
    if (!isFieldRequiredByCondition(field.conditional, body)) continue;
    const value = body[field.name];
    // FILE fields carry their value as { fileId, ... } when present and
    // null when absent. The plain-empty check below covers null; we add
    // a defensive shape check so a malformed object (missing fileId)
    // also rejects rather than slipping through and failing on link.
    if (field.type === FieldType.FILE) {
      const isUploaded =
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof (value as { fileId?: unknown }).fileId === "string";
      if (!isUploaded) {
        return NextResponse.json(
          { error: `${field.label} is required` },
          { status: 400 }
        );
      }
      continue;
    }
    // A required CHECKBOX must be actually checked — `false` is "empty".
    // A required MULTISELECT must have at least one selection.
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      (field.type === FieldType.CHECKBOX && value !== true) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return NextResponse.json({
        error: `${field.label} is required`
      }, { status: 400 });
    }
  }

  // FILE-field claim check: every submitted file ref must point at a row
  // we (a) own through the reg_upload_session cookie, (b) uploaded for
  // this specific FormField, and (c) haven't already linked to another
  // registration. Files survive across submission attempts inside the
  // 24h cookie window, but each row can only be linked once.
  //
  // We collect the validated rows here and replay them inside the
  // transaction so a successful registration atomically claims every
  // file. Cleaner than doing the lookup twice.
  type ClaimedFile = {
    field: (typeof registrationFields)[number];
    fileId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  };
  const claimedFiles: ClaimedFile[] = [];
  const uploadSessionForClaim = readUploadSessionId(req);

  for (const field of registrationFields) {
    if (field.type !== FieldType.FILE) continue;
    const raw = body[field.name];
    if (raw === undefined || raw === null) continue;

    if (
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      typeof (raw as { fileId?: unknown }).fileId !== "string"
    ) {
      return NextResponse.json(
        { error: `${field.label}: invalid file value` },
        { status: 400 }
      );
    }
    if (!uploadSessionForClaim) {
      // Cookie missing — the visitor would have been unable to upload
      // in the first place. Most likely a stale form left open across
      // a cookie expiry.
      return NextResponse.json(
        { error: "Upload session expired. Please reload and re-upload." },
        { status: 401 }
      );
    }
    const fileId = (raw as { fileId: string }).fileId;
    const file = await getRegistrationFileById(fileId);
    if (
      !file ||
      file.uploadSessionId !== uploadSessionForClaim ||
      file.formFieldId !== field.id ||
      file.registrationId !== null
    ) {
      // Any of: row gone, session mismatch (probe), wrong field
      // (replaced and pointing at the old id), or already claimed.
      return NextResponse.json(
        {
          error: `${field.label}: file no longer available; please re-upload`,
        },
        { status: 400 }
      );
    }
    claimedFiles.push({
      field,
      fileId: file.id,
      filename: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });
  }

  // Replace each FILE field's body value with the server-canonical
  // denormalized ref so Registration.formData carries the
  // DB-authoritative filename/size, not whatever the client claimed.
  // Drops the uploadedAt the client sends — formData is a per-row cache,
  // not a copy of the RegistrationFile timestamps.
  for (const claim of claimedFiles) {
    body[claim.field.name] = {
      fileId: claim.fileId,
      filename: claim.filename,
      mimeType: claim.mimeType,
      sizeBytes: claim.sizeBytes,
    };
  }

  // Option-aware validation for SELECT/RADIO/MULTISELECT: every submitted
  // value must either be a real option value or the reserved __other (only
  // if the field has Other enabled); MULTISELECT respects maxSelections;
  // Other-on-required-with-empty-text fails.
  for (const field of registrationFields) {
    const isOption =
      field.type === FieldType.SELECT ||
      field.type === FieldType.RADIO ||
      field.type === FieldType.MULTISELECT;
    if (!isOption) continue;

    const value = body[field.name];
    if (value === undefined || value === null || value === "") continue;

    const parsed = parseFormFieldOptions(field.options);
    const allowed = new Set(parsed.options.map((o) => o.value));
    if (parsed.other) allowed.add(OTHER_VALUE);

    const submitted: string[] = Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string")
      : typeof value === "string"
      ? [value]
      : [];

    for (const v of submitted) {
      if (!allowed.has(v)) {
        return NextResponse.json(
          { error: `${field.label}: invalid choice "${v}"` },
          { status: 400 }
        );
      }
    }

    if (
      field.type === FieldType.MULTISELECT &&
      typeof parsed.maxSelections === "number" &&
      parsed.maxSelections > 0 &&
      Array.isArray(value) &&
      value.length > parsed.maxSelections
    ) {
      return NextResponse.json(
        {
          error: `${field.label}: maximum ${parsed.maxSelections} selections allowed`,
        },
        { status: 400 }
      );
    }

    if (
      parsed.other &&
      submitted.includes(OTHER_VALUE) &&
      field.required &&
      isFieldRequiredByCondition(field.conditional, body)
    ) {
      const sibling = body[`${field.name}${OTHER_SUFFIX}`];
      const text = typeof sibling === "string" ? sibling.trim() : "";
      if (!text) {
        // Stable code so the client can render the localized message
        // even when the server-side validation fires (e.g., multi-step
        // form where the broken field is on an earlier step and the
        // current-step client validation didn't catch it).
        return NextResponse.json(
          {
            error: `${field.label}: please specify your answer`,
            code: "OTHER_TEXT_REQUIRED",
            fieldLabel: field.label,
          },
          { status: 400 }
        );
      }
    }
  }

  // Trim whitespace on any __other sibling text so empty-after-trim is
  // not persisted; if visitor unselected Other in another field but a
  // stale sibling remained, drop it entirely.
  for (const field of registrationFields) {
    const siblingKey = `${field.name}${OTHER_SUFFIX}`;
    if (typeof body[siblingKey] !== "string") continue;
    const trimmed = (body[siblingKey] as string).trim();
    const value = body[field.name];
    const stillSelected =
      value === OTHER_VALUE ||
      (Array.isArray(value) && value.includes(OTHER_VALUE));
    if (!stillSelected || !trimmed) {
      delete body[siblingKey];
    } else {
      body[siblingKey] = trimmed;
    }
  }

  // Stage 2 of FIELD_MAPPING_SPEC: resolve Contact column values via
  // per-FormField mapsTo tags, with legacy literal-key + body.fullName
  // fallback rungs preserved. Replaces the old destructure at line 188
  // and the legacy fullName splitter block previously inline below.
  const resolved = resolveContactColumns(
    registrationFields,
    body,
    body.fullName
  );

  const metadata = Object.keys(additionalFields).length > 0 ? additionalFields : null;
  const hasEmail = resolved.email !== null;
  // Portal module on means OTP login depends on a real email — synthesizing
  // would create an unloggable account. Reject explicitly so the visitor
  // (or the form-builder, which should have prevented this client-side)
  // gets a typed error rather than a silent fake email.
  if (!hasEmail && event.modules?.selfServicePortal) {
    return NextResponse.json(
      {
        error: "Email is required for this event",
        code: "EMAIL_REQUIRED",
      },
      { status: 400 }
    );
  }
  const normalizedEmail =
    resolved.email !== null
      ? resolved.email.toLowerCase()
      : generateSyntheticEmail();

  try {
    const { created: registration, registrationStatus } = await prisma.$transaction(async (tx) => {
      // Take the per-event capacity lock BEFORE deciding CONFIRMED vs
      // WAITLISTED/PENDING_APPROVAL. Without it, two concurrent submits
      // both read "one spot left" and both confirm past capacity. The
      // lock serializes this decision with concurrent registrations,
      // approvals, and waitlist promotions for the same event.
      await approvalService.lockEventRow(tx, event.id);
      const registrationStatus = await approvalService.determineRegistrationStatus(
        event.id,
        tx
      );
      const isConfirmed = registrationStatus === "CONFIRMED";

      // Look up contact by token first, fall back to email (only if real email provided)
      let contact = token
        ? await tx.contact.findUnique({
            where: { inviteToken: token },
            include: { registration: true },
          })
        : null;

      if (!contact && hasEmail) {
        contact = await tx.contact.findUnique({
          where: { eventId_email: { eventId: event.id, email: normalizedEmail } },
          include: { registration: true },
        });
      }

      // Already registered — surface as a typed error so the outer handler can 409
      if (contact?.status === "REGISTERED" && contact.registration) {
        throw new AlreadyRegisteredError(contact.registration.confirmationCode);
      }

      // Clean up any stale registration (e.g. admin reset contact status)
      if (contact?.registration) {
        await tx.registration.delete({ where: { id: contact.registration.id } });
      }

      const upsertedContact = contact
        ? await tx.contact.update({
            where: { id: contact.id },
            data: {
              firstName: resolved.firstName || contact.firstName,
              lastName: resolved.lastName || contact.lastName,
              email: hasEmail ? normalizedEmail : contact.email,
              phone: resolved.phone || contact.phone,
              organization: resolved.organization || contact.organization,
              designation: resolved.designation || contact.designation,
              // Cast follows the existing convention at
              // src/app/api/events/[eventId]/contacts/[contactId]/route.ts
              // and registration-file.service.ts: the value can be null
              // at runtime (when no extras are submitted AND existing
              // contact.metadata is null), and Prisma accepts that for a
              // nullable Json column. The InputJsonValue type strictly
              // excludes null, so the cast acknowledges the gap. Pre-
              // Stage-2 this worked because the rest-of-any destructure
              // typed additionalFields as `any`.
              metadata: (metadata || contact.metadata) as Prisma.InputJsonValue,
            },
          })
        : await tx.contact.create({
            data: {
              eventId: event.id,
              firstName: resolved.firstName ?? "",
              lastName: resolved.lastName ?? "",
              email: normalizedEmail,
              phone: resolved.phone,
              organization: resolved.organization,
              designation: resolved.designation,
              metadata: metadata as Prisma.InputJsonValue,
              inviteToken: randomBytes(16).toString("hex"),
              // Per-event attendee number. We already hold the event-row lock
              // (lockEventRow above), so this allocation is race-safe. Only
              // NEW contacts get a number here; the update branch keeps the
              // existing contact's number (stable across re-registration).
              serialNumber: await allocateContactSerial(tx, event.id),
            },
          });

      const created = await tx.registration.create({
        data: {
          contactId: upsertedContact.id,
          eventId: event.id,
          status: registrationStatus,
          registeredAt: isConfirmed ? new Date() : null,
          formData: body,
        },
      });

      // Claim each uploaded file by linking its row to the new
      // registration. The where clause includes `registrationId: null`
      // so a concurrent submission can't double-claim — if the count is
      // anything other than 1 we throw and the tx rolls back.
      for (const claim of claimedFiles) {
        const linkRes = await tx.registrationFile.updateMany({
          where: {
            id: claim.fileId,
            uploadSessionId: uploadSessionForClaim ?? "",
            formFieldId: claim.field.id,
            registrationId: null,
          },
          data: {
            registrationId: created.id,
            uploadedBy: `registration:${created.id}`,
          },
        });
        if (linkRes.count !== 1) {
          // Race: another submission or orphan cleanup beat us between
          // the pre-tx validation and the update. Roll back so neither
          // the registration nor partial file links survive.
          throw new FileClaimRaceError(claim.field.label);
        }
      }

      await tx.contact.update({
        where: { id: upsertedContact.id },
        data: { status: isConfirmed ? "REGISTERED" : "INVITED" },
      });

      return { created, registrationStatus };
    });

    let message = "Registration successful!";
    if (registrationStatus === "PENDING_APPROVAL") {
      message = "Registration submitted! Your request is pending approval.";
    } else if (registrationStatus === "WAITLISTED") {
      message = "You have been added to the waitlist. We will notify you when a spot becomes available.";
    }

    return NextResponse.json({
      success: true,
      confirmationCode: registration.confirmationCode,
      status: registrationStatus,
      message,
    }, { status: 201 });
  } catch (err) {
    if (err instanceof AlreadyRegisteredError) {
      return NextResponse.json(
        { error: "You are already registered for this event", confirmationCode: err.confirmationCode },
        { status: 409 }
      );
    }

    if (err instanceof FileClaimRaceError) {
      return NextResponse.json(
        {
          error: `${err.fieldLabel}: file no longer available; please re-upload`,
        },
        { status: 409 }
      );
    }

    // Concurrent submit raced us on the unique (contactId) or (eventId, email) constraint
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A registration is already in progress for this email. Please try again." },
        { status: 409 }
      );
    }

    throw err;
  }
}

class AlreadyRegisteredError extends Error {
  constructor(public readonly confirmationCode: string) {
    super("ALREADY_REGISTERED");
    this.name = "AlreadyRegisteredError";
  }
}

class FileClaimRaceError extends Error {
  constructor(public readonly fieldLabel: string) {
    super("FILE_CLAIM_RACE");
    this.name = "FileClaimRaceError";
  }
}
