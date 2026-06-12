import { FieldType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseFormFieldOptions,
  resolveOtherLabel,
  OTHER_VALUE,
} from "@/lib/form-builder/options-parse";

/**
 * Dynamic attendee filtering on registration form answers.
 *
 * Every event defines its own form (Phase → Step → FormField), so "filter
 * by city / gender / nationality" cannot be hardcoded columns — the filter
 * set is derived from the event's own option-bearing REGISTRATION-phase
 * fields, and the predicate runs against Registration.formData JSON paths.
 *
 * Shared by the attendees list route AND the registrations export route so
 * "what you see is what you export" stays true by construction.
 */

// Option-bearing types where a dropdown filter makes sense. TEXT-like
// fields are covered by the existing free-text search; DATE ranges and
// PHONE_COUNTRY are out of scope until someone needs them.
export const FILTERABLE_FIELD_TYPES: FieldType[] = [
  FieldType.SELECT,
  FieldType.RADIO,
  FieldType.MULTISELECT,
  FieldType.COUNTRY,
  FieldType.CHECKBOX,
];

export interface FilterableFieldOption {
  value: string;
  label: string;
  labelAr: string | null;
}

export interface FilterableField {
  name: string;
  label: string;
  labelAr: string | null;
  type: FieldType;
  // SELECT/RADIO/MULTISELECT carry their parsed options (plus the reserved
  // __other entry when enabled). COUNTRY and CHECKBOX send an empty list —
  // the client renders the countries list / Yes-No locally.
  options: FilterableFieldOption[];
}

export async function getFilterableFields(
  eventId: string
): Promise<FilterableField[]> {
  const fields = await prisma.formField.findMany({
    where: {
      eventId,
      isActive: true,
      type: { in: FILTERABLE_FIELD_TYPES },
      step: { phase: { type: "REGISTRATION" } },
    },
    orderBy: { order: "asc" },
    select: { name: true, label: true, labelAr: true, type: true, options: true },
  });

  return fields.map((f) => {
    let options: FilterableFieldOption[] = [];
    if (
      f.type === FieldType.SELECT ||
      f.type === FieldType.RADIO ||
      f.type === FieldType.MULTISELECT
    ) {
      const parsed = parseFormFieldOptions(f.options);
      options = parsed.options.map((o) => ({
        value: o.value,
        label: o.label,
        labelAr: o.labelAr ?? null,
      }));
      if (parsed.other) {
        options.push({
          value: OTHER_VALUE,
          label: resolveOtherLabel(parsed.other, "en"),
          labelAr: resolveOtherLabel(parsed.other, "ar"),
        });
      }
    }
    return {
      name: f.name,
      label: f.label,
      labelAr: f.labelAr,
      type: f.type,
      options,
    };
  });
}

/**
 * Parse the `fieldFilters` query param — a JSON object of
 * { fieldName: value } — keeping only keys that are real filterable
 * fields on this event. Unknown keys are dropped so the client can't
 * probe arbitrary formData paths.
 */
export function parseFieldFilters(
  raw: string | null,
  fields: FilterableField[]
): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const known = new Set(fields.map((f) => f.name));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || value === "") continue;
    if (!known.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Registration-side predicates for the active field filters, against
 * formData JSON paths. MULTISELECT answers are arrays → containment;
 * CHECKBOX answers are booleans; everything else is a string equals.
 */
export function buildFormDataConditions(
  fieldFilters: Record<string, string>,
  fields: FilterableField[]
): Record<string, unknown>[] {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const conditions: Record<string, unknown>[] = [];
  for (const [name, value] of Object.entries(fieldFilters)) {
    const field = byName.get(name);
    if (!field) continue;
    if (field.type === FieldType.MULTISELECT) {
      conditions.push({ formData: { path: [name], array_contains: value } });
    } else if (field.type === FieldType.CHECKBOX) {
      conditions.push({ formData: { path: [name], equals: value === "true" } });
    } else {
      conditions.push({ formData: { path: [name], equals: value } });
    }
  }
  return conditions;
}

export interface AttendeeFilterParams {
  search: string;
  category: string;
  status: string;
  badgeEmail: string;
  phaseId: string;
  phaseStatus: string; // submitted | notSubmitted
  optionId: string;
  fieldFilters: Record<string, string>;
}

export function readAttendeeFilterParams(
  searchParams: URLSearchParams,
  fields: FilterableField[]
): AttendeeFilterParams {
  return {
    search: searchParams.get("search") || "",
    category: searchParams.get("category") || "",
    status: searchParams.get("status") || "",
    badgeEmail: searchParams.get("badgeEmail") || "",
    phaseId: searchParams.get("phase") || "",
    phaseStatus: searchParams.get("phaseStatus") || "",
    optionId: searchParams.get("option") || "",
    fieldFilters: parseFieldFilters(searchParams.get("fieldFilters"), fields),
  };
}

/**
 * Contact-level where clause for the attendee list. The export route
 * reuses it as `{ eventId, contact: { is: <this> } }` so both surfaces
 * filter identically.
 */
export function buildContactWhere(
  eventId: string,
  p: AttendeeFilterParams,
  fields: FilterableField[]
): Record<string, unknown> {
  const where: Record<string, unknown> = { eventId };
  const andConditions: Record<string, unknown>[] = [];

  if (p.search) {
    andConditions.push({
      OR: [
        { firstName: { contains: p.search, mode: "insensitive" } },
        { lastName: { contains: p.search, mode: "insensitive" } },
        { email: { contains: p.search, mode: "insensitive" } },
        { organization: { contains: p.search, mode: "insensitive" } },
      ],
    });
  }

  if (p.category) {
    where.category = p.category;
  }

  if (p.status) {
    where.status = p.status;
  }

  if (p.badgeEmail === "sent") {
    where.registration = { badgeEmailSent: true };
  } else if (p.badgeEmail === "not_sent") {
    andConditions.push({
      OR: [
        { registration: null },
        { registration: { badgeEmailSent: false } },
      ],
    });
  }

  // Phase status filter: only meaningful for attendees who have a
  // registration (a Contact without one can't submit a phase). For
  // "submitted" we require a matching PhaseSubmission row; for
  // "notSubmitted" we require either no registration or a registration
  // with no submission for that phase yet.
  if (p.phaseId && p.phaseStatus === "submitted") {
    andConditions.push({
      registration: {
        is: { phaseSubmissions: { some: { phaseId: p.phaseId } } },
      },
    });
  } else if (p.phaseId && p.phaseStatus === "notSubmitted") {
    andConditions.push({
      registration: {
        is: { phaseSubmissions: { none: { phaseId: p.phaseId } } },
      },
    });
  }

  // Option filter — independent of phase-status above. Filters to
  // contacts whose registration has a selection on (phaseId, optionId).
  if (p.phaseId && p.optionId) {
    andConditions.push({
      registration: {
        is: {
          selections: { some: { phaseId: p.phaseId, optionId: p.optionId } },
        },
      },
    });
  }

  // Dynamic form-answer filters. Nested under registration — a contact
  // without a registration has no answers and is correctly excluded.
  for (const cond of buildFormDataConditions(p.fieldFilters, fields)) {
    andConditions.push({ registration: { is: cond } });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}
