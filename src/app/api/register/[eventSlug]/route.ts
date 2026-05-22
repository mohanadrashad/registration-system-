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
      headerImageUrl: event.branding.headerImageUrl,
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
    },
  });

  if (!event || !event.isActive) {
    return NextResponse.json({ error: "Event not found or not active" }, { status: 404 });
  }

  const registrationFields = (event.phases[0]?.steps ?? []).flatMap(
    (step) => step.fields
  );

  const body = await req.json();

  // Extract core contact fields and additional form data
  const { firstName, lastName, email, phone, organization, designation, ...additionalFields } = body;

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
    if (value === undefined || value === null || value === "") {
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

  // Determine registration status based on event settings (reads only; safe outside tx)
  const registrationStatus = await approvalService.determineRegistrationStatus(event.id);
  const isConfirmed = registrationStatus === "CONFIRMED";

  const metadata = Object.keys(additionalFields).length > 0 ? additionalFields : null;
  const hasEmail = typeof email === "string" && email.trim() !== "";
  const normalizedEmail = hasEmail
    ? email.toLowerCase()
    : generateSyntheticEmail();
  // fullName fallback. Some events (notably system-protected forms
  // configured before firstName/lastName were standardized) submit a
  // single `fullName` field instead of split first/last. When both
  // explicit columns are absent or empty AND fullName is present, split
  // on the first whitespace: head → firstName, remainder → lastName.
  // Explicit firstName/lastName from the body always win.
  const firstEmpty =
    typeof firstName !== "string" || firstName.trim() === "";
  const lastEmpty =
    typeof lastName !== "string" || lastName.trim() === "";
  let safeFirstName = typeof firstName === "string" ? firstName : "";
  let safeLastName = typeof lastName === "string" ? lastName : "";
  if (firstEmpty && lastEmpty && typeof body.fullName === "string") {
    const trimmed = body.fullName.trim();
    if (trimmed) {
      const idx = trimmed.search(/\s/);
      if (idx === -1) {
        safeFirstName = trimmed;
        safeLastName = "";
      } else {
        safeFirstName = trimmed.slice(0, idx);
        safeLastName = trimmed.slice(idx + 1).trim();
      }
    }
  }

  try {
    const registration = await prisma.$transaction(async (tx) => {
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
              firstName: safeFirstName || contact.firstName,
              lastName: safeLastName || contact.lastName,
              email: hasEmail ? normalizedEmail : contact.email,
              phone: phone || contact.phone,
              organization: organization || contact.organization,
              designation: designation || contact.designation,
              metadata: metadata || contact.metadata,
            },
          })
        : await tx.contact.create({
            data: {
              eventId: event.id,
              firstName: safeFirstName,
              lastName: safeLastName,
              email: normalizedEmail,
              phone: phone || null,
              organization: organization || null,
              designation: designation || null,
              metadata,
              inviteToken: randomBytes(16).toString("hex"),
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

      return created;
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
