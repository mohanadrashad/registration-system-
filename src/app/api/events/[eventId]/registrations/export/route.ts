import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { FieldType, FieldMapping } from "@prisma/client";
import {
  parseFormFieldOptions,
  OTHER_SUFFIX,
} from "@/lib/form-builder/options-parse";
import { isSyntheticEmail } from "@/lib/contact/synthetic-email";
import {
  formatFormFieldValue,
  isDynamicFormField,
} from "@/lib/form-builder/format-form-value";
import {
  getFilterableFields,
  readAttendeeFilterParams,
  buildContactWhere,
} from "@/lib/attendees/attendee-filters";

// Optional contact-column base columns and the FieldMapping role that
// populates each. A column appears only when the form DEFINES it (a field
// tagged with that role, or a legacy field literally named the column) —
// not "drop if empty in this batch". firstName/lastName are NOT here: they
// are always pinned (the identifying column must never vanish, even on an
// edge-case no-name form). Category/Status/Registered At/Confirmation Code
// are admin-set/system and also always present.
const GATED_BASE_COLUMN_ROLE: Record<string, FieldMapping> = {
  email: FieldMapping.EMAIL,
  phone: FieldMapping.PHONE,
  organization: FieldMapping.ORGANIZATION,
  designation: FieldMapping.DESIGNATION,
};

// A denormalized FILE ref in formData carries at least fileId + filename.
function isFileRefWithId(
  v: unknown
): v is { fileId: string; filename: string } {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    typeof (v as { fileId?: unknown }).fileId === "string" &&
    typeof (v as { filename?: unknown }).filename === "string"
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;

  const format = new URL(req.url).searchParams.get("format");

  // Pull FormFields once, ordered by their form-builder position so the
  // CSV column order matches the form's logical layout.
  const formFields = await prisma.formField.findMany({
    where: { eventId, isActive: true },
    orderBy: { order: "asc" },
    select: {
      name: true,
      label: true,
      type: true,
      options: true,
      mapsTo: true,
    },
  });

  // Honor the same filter params the attendees page sends (status,
  // category, search, badge, phase, dynamic form-answer filters) so an
  // admin who filters the list and hits Export gets exactly the rows on
  // screen. With no params this is a no-op `{ eventId }` and the export
  // stays a full dump, as before.
  const filterableFields = await getFilterableFields(eventId);
  const filterParams = readAttendeeFilterParams(
    new URL(req.url).searchParams,
    filterableFields
  );
  const contactWhere = buildContactWhere(eventId, filterParams, filterableFields);

  // Custom Attendee Groups → one column each (admin classifications like
  // Ranking/Region). Headers ordered like the management screen.
  const groups = await prisma.attendeeGroup.findMany({
    where: { eventId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });

  const registrations = await prisma.registration.findMany({
    where: { eventId, contact: { is: contactWhere } },
    include: {
      contact: {
        include: {
          groupAssignments: {
            select: { groupId: true, value: { select: { label: true } } },
          },
        },
      },
    },
    orderBy: { registeredAt: "asc" },
  });

  // FormFields that warrant a CSV column — exclude layout-only types
  // and Contact-column duplicates that already appear in the fixed
  // header block.
  const dynamicFields = formFields.filter((f) => isDynamicFormField(f));

  // A gated base column is "defined" when the form has an active field
  // tagged with its mapping role OR a legacy field literally named the
  // column. FULL_NAME feeds firstName/lastName, which are pinned anyway.
  const formDefinesColumn = (col: string): boolean =>
    formFields.some(
      (f) => f.mapsTo === GATED_BASE_COLUMN_ROLE[col] || f.name === col
    );

  type Reg = (typeof registrations)[number];
  // Ordered base columns with their value accessor. `include:false` drops
  // both the header (xlsx) AND the row key (CSV), so the column SET is
  // identical across formats. First/Last + Category/Status/system pinned;
  // Email/Phone/Organization/Designation gated on form definition.
  const baseColumns = (
    [
      { header: "First Name", include: true, value: (r: Reg) => r.contact.firstName },
      { header: "Last Name", include: true, value: (r: Reg) => r.contact.lastName },
      {
        header: "Email",
        include: formDefinesColumn("email"),
        value: (r: Reg) => (isSyntheticEmail(r.contact.email) ? "" : r.contact.email),
      },
      { header: "Phone", include: formDefinesColumn("phone"), value: (r: Reg) => r.contact.phone || "" },
      {
        header: "Organization",
        include: formDefinesColumn("organization"),
        value: (r: Reg) => r.contact.organization || "",
      },
      {
        header: "Designation",
        include: formDefinesColumn("designation"),
        value: (r: Reg) => r.contact.designation || "",
      },
      { header: "Category", include: true, value: (r: Reg) => r.contact.category || "" },
      { header: "Status", include: true, value: (r: Reg) => r.status },
      { header: "Registered At", include: true, value: (r: Reg) => r.registeredAt?.toISOString() || "" },
      { header: "Confirmation Code", include: true, value: (r: Reg) => r.confirmationCode },
    ] as const
  ).filter((c) => c.include);

  const data = registrations.map((r) => {
    const formData = (r.formData as Record<string, unknown> | null) ?? {};
    const row: Record<string, string> = {};
    for (const col of baseColumns) row[col.header] = col.value(r);

    for (const field of dynamicFields) {
      row[field.label] = formatFormFieldValue(field, formData[field.name]);

      // Other-enabled fields get a sibling column with the custom text.
      const parsed = parseFormFieldOptions(field.options);
      if (parsed.other) {
        const sibling = formData[`${field.name}${OTHER_SUFFIX}`];
        row[`${field.label} (Other)`] =
          typeof sibling === "string" ? sibling : "";
      }
    }

    // Group columns: the attendee's value label(s) per group, joined.
    if (groups.length > 0) {
      const labelsByGroup = new Map<string, string[]>();
      for (const a of r.contact.groupAssignments) {
        const list = labelsByGroup.get(a.groupId) ?? [];
        list.push(a.value.label);
        labelsByGroup.set(a.groupId, list);
      }
      for (const g of groups) {
        row[g.name] = (labelsByGroup.get(g.id) ?? []).join(", ");
      }
    }

    return row;
  });

  // ── xlsx branch: identical rows, but FILE cells become clickable links
  //    to the admin-auth-gated stream route. The CSV path below is
  //    unchanged (plain filename text). ──
  if (format === "xlsx") {
    // Explicit column order so FILE cells can be addressed by index for
    // hyperlinks. Mirrors the row keys built above (the form-aware base
    // block, then each dynamic field with its Other sibling after).
    const columns: string[] = baseColumns.map((c) => c.header);
    for (const field of dynamicFields) {
      columns.push(field.label);
      const parsed = parseFormFieldOptions(field.options);
      if (parsed.other) columns.push(`${field.label} (Other)`);
    }
    for (const g of groups) columns.push(g.name);

    const ws = XLSX.utils.json_to_sheet(data, { header: columns });

    // Each FILE field gets its own column (one per dynamic FILE field —
    // never merged); precompute each FILE column's index once.
    const fileFields = dynamicFields
      .filter((f) => f.type === FieldType.FILE)
      .map((f) => ({ name: f.name, colIndex: columns.indexOf(f.label) }))
      .filter((f) => f.colIndex >= 0);

    // Attach a hyperlink to each FILE cell that actually has a file. The
    // cell text stays the filename; Target is an ABSOLUTE URL built from
    // the request origin so it points back to this same authenticated
    // dashboard origin. The stream route 401s for anyone without a live
    // admin session — no public exposure of the private blob.
    const origin = new URL(req.url).origin;
    registrations.forEach((r, i) => {
      const formData = (r.formData as Record<string, unknown> | null) ?? {};
      for (const f of fileFields) {
        const ref = formData[f.name];
        if (!isFileRefWithId(ref)) continue;
        // Row i sits at sheet row i+1 (row 0 is the header).
        const addr = XLSX.utils.encode_cell({ r: i + 1, c: f.colIndex });
        const cell = ws[addr];
        if (cell) {
          cell.l = {
            Target: `${origin}/api/events/${eventId}/files/${ref.fileId}/stream`,
            Tooltip: "Open file (admin login required)",
          };
        }
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registrations");
    // type:"array" → Uint8Array at runtime, a valid Response body. Wrap in
    // a Blob so the body type is unambiguous (a bare typed array trips the
    // strict BodyInit generic under this TS lib config).
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    return new NextResponse(new Blob([buf]), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="registrations-${eventId}.xlsx"`,
      },
    });
  }

  const csv = Papa.unparse(data);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="registrations-${eventId}.csv"`,
    },
  });
}
