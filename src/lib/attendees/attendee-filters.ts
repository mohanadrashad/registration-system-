import { FieldType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseFormFieldOptions,
  resolveOtherLabel,
  OTHER_VALUE,
} from "@/lib/form-builder/options-parse";
import { FILTER_NONE_VALUE } from "@/lib/attendees/filter-constants";

export { FILTER_NONE_VALUE };

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

// Custom Attendee Group dimensions ride the SAME filter machinery as form
// fields: a group entry is namespaced `group:<groupId>` so it can't collide
// with a form field name, carries the sentinel type "GROUP", and lists its
// values as options. The shared fieldFilters map / URL param / chips on the
// client then work for groups with no extra plumbing; only buildContactWhere
// routes a group key to a groupAssignments predicate instead of formData.
export const GROUP_FILTER_PREFIX = "group:";
export type FilterableType = FieldType | "GROUP";

export interface FilterableField {
  name: string;
  label: string;
  labelAr: string | null;
  type: FilterableType;
  source: "form" | "group";
  // SELECT/RADIO/MULTISELECT and GROUP carry their options. COUNTRY and
  // CHECKBOX send an empty list — the client renders countries / Yes-No
  // locally.
  options: FilterableFieldOption[];
}

export async function getFilterableFields(
  eventId: string
): Promise<FilterableField[]> {
  const [fields, groups] = await Promise.all([
    prisma.formField.findMany({
      where: {
        eventId,
        isActive: true,
        type: { in: FILTERABLE_FIELD_TYPES },
        step: { phase: { type: "REGISTRATION" } },
      },
      orderBy: { order: "asc" },
      select: { name: true, label: true, labelAr: true, type: true, options: true },
    }),
    prisma.attendeeGroup.findMany({
      where: { eventId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        values: {
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: { id: true, label: true },
        },
      },
    }),
  ]);

  const formFilters: FilterableField[] = fields.map((f) => {
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
      source: "form" as const,
      options,
    };
  });

  // Only groups with at least one value make usable filters.
  const groupFilters: FilterableField[] = groups
    .filter((g) => g.values.length > 0)
    .map((g) => ({
      name: `${GROUP_FILTER_PREFIX}${g.id}`,
      label: g.name,
      labelAr: null,
      type: "GROUP" as const,
      source: "group" as const,
      options: g.values.map((v) => ({
        value: v.id,
        label: v.label,
        labelAr: null,
      })),
    }));

  return [...formFilters, ...groupFilters];
}

/**
 * Parse the `fieldFilters` query param — a JSON object of
 * { fieldName: value | value[] } — keeping only keys that are real
 * filterable fields on this event. Each filter holds a LIST of selected
 * values (OR within the filter); a bare string is accepted for backward
 * compatibility with older single-value links. Unknown keys are dropped
 * so the client can't probe arbitrary formData paths.
 */
export function parseFieldFilters(
  raw: string | null,
  fields: FilterableField[]
): Record<string, string[]> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const known = new Set(fields.map((f) => f.name));
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!known.has(key)) continue;
    const arr = Array.isArray(value) ? value : [value];
    const vals = [
      ...new Set(arr.filter((v): v is string => typeof v === "string" && v !== "")),
    ];
    if (vals.length > 0) out[key] = vals;
  }
  return out;
}

// Categories arrive as a JSON array in `categories` (multi-select). An
// older single `category` param is still honored for shared links.
function parseCategories(searchParams: URLSearchParams): string[] {
  const raw = searchParams.get("categories");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return [
          ...new Set(
            parsed.filter((c): c is string => typeof c === "string" && c !== "")
          ),
        ];
      }
    } catch {
      // fall through to legacy single param
    }
  }
  const single = searchParams.get("category");
  return single ? [single] : [];
}

export interface AttendeeFilterParams {
  search: string;
  categories: string[];
  status: string;
  badgeEmail: string;
  phaseId: string;
  phaseStatus: string; // submitted | notSubmitted
  optionId: string;
  fieldFilters: Record<string, string[]>;
}

export function readAttendeeFilterParams(
  searchParams: URLSearchParams,
  fields: FilterableField[]
): AttendeeFilterParams {
  return {
    search: searchParams.get("search") || "",
    categories: parseCategories(searchParams),
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

  // Category: any selected real category, OR "Uncategorized" (the
  // FILTER_NONE_VALUE sentinel → category is null or empty string).
  if (p.categories.length > 0) {
    const wantsUncat = p.categories.includes(FILTER_NONE_VALUE);
    const realCats = p.categories.filter((c) => c !== FILTER_NONE_VALUE);
    const catOr: Record<string, unknown>[] = [];
    if (realCats.length > 0) catOr.push({ category: { in: realCats } });
    if (wantsUncat) catOr.push({ category: null }, { category: "" });
    if (catOr.length > 0) {
      andConditions.push(catOr.length === 1 ? catOr[0] : { OR: catOr });
    }
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

  // Dynamic filters — each filter holds a LIST of values OR'd together
  // (e.g. City = Riyadh OR Jeddah); different filters AND together.
  // Routed by the field's source:
  //   • form answers → Registration.formData JSON paths (nested under
  //     registration, so a contact without a registration is excluded)
  //   • group values → ContactGroupAssignment rows directly on the contact
  //     (works for non-registered contacts too)
  const byName = new Map(fields.map((f) => [f.name, f]));
  for (const [name, values] of Object.entries(p.fieldFilters)) {
    const field = byName.get(name);
    if (!field || values.length === 0) continue;

    // Split off the "no value" sentinel from the real selected values; each
    // filter ORs its real values with the absence case when both are picked.
    const wantsNone = values.includes(FILTER_NONE_VALUE);
    const realVals = values.filter((v) => v !== FILTER_NONE_VALUE);

    if (field.source === "group") {
      const groupId = name.slice(GROUP_FILTER_PREFIX.length);
      const groupOr: Record<string, unknown>[] = [];
      if (realVals.length > 0) {
        groupOr.push({
          groupAssignments: { some: { groupId, valueId: { in: realVals } } },
        });
      }
      // "Not in this group" — no assignment row for this group at all.
      if (wantsNone) {
        groupOr.push({ groupAssignments: { none: { groupId } } });
      }
      if (groupOr.length > 0) {
        andConditions.push(groupOr.length === 1 ? groupOr[0] : { OR: groupOr });
      }
      continue;
    }

    // Form-answer field (SELECT / RADIO / COUNTRY / MULTISELECT / CHECKBOX).
    const fieldOr: Record<string, unknown>[] = [];
    if (realVals.length > 0) {
      let valueConds: Record<string, unknown>[];
      if (field.type === FieldType.MULTISELECT) {
        valueConds = realVals.map((v) => ({
          formData: { path: [name], array_contains: v },
        }));
      } else if (field.type === FieldType.CHECKBOX) {
        valueConds = realVals.map((v) => ({
          formData: { path: [name], equals: v === "true" },
        }));
      } else {
        valueConds = realVals.map((v) => ({
          formData: { path: [name], equals: v },
        }));
      }
      fieldOr.push({ registration: { is: { OR: valueConds } } });
    }
    // "No answer" — never registered, or the field was left blank. Forms
    // submit "" for empty scalars and [] for empty multi-selects.
    if (wantsNone) {
      const emptyVal = field.type === FieldType.MULTISELECT ? [] : "";
      fieldOr.push({ registration: null });
      fieldOr.push({
        registration: { is: { formData: { path: [name], equals: emptyVal } } },
      });
    }
    if (fieldOr.length > 0) {
      andConditions.push(fieldOr.length === 1 ? fieldOr[0] : { OR: fieldOr });
    }
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}
