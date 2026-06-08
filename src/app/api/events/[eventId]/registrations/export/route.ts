import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { FieldType, FieldMapping } from "@prisma/client";
import {
  parseFormFieldOptions,
  resolveOtherLabel,
  OTHER_VALUE,
  OTHER_SUFFIX,
} from "@/lib/form-builder/options-parse";
import { isSyntheticEmail } from "@/lib/contact/synthetic-email";

// FormField names that are also Contact columns — already emitted in the
// fixed columns above the dynamic block, so we don't duplicate them.
const CONTACT_COLUMN_NAMES = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "organization",
  "designation",
  "category",
]);

// Field types that produce no usable value in a CSV row.
const SKIP_TYPES = new Set<string>(["HEADING", "DIVIDER", "PARAGRAPH", "HIDDEN"]);

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

function formatCell(
  field: { type: FieldType; options: unknown },
  value: unknown,
  formData: Record<string, unknown>
): string {
  if (value === undefined || value === null || value === "") return "";
  const parsed = parseFormFieldOptions(field.options);
  const otherLabel = parsed.other ? resolveOtherLabel(parsed.other, "en") : "Other";
  // The CSV emits a SEPARATE _other column for the custom text, so the
  // value cell shows just the literal label "Other" — no concatenation.
  const renderOther = () => otherLabel;

  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v === OTHER_VALUE) return renderOther();
        const opt = parsed.options.find((o) => o.value === v);
        return opt?.label ?? String(v);
      })
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  // FILE field stub (Stage 2). The cell emits just the original
  // filename; Stage 3 adds size/mime columns if anyone needs them.
  // Without this branch a FILE column would serialize as
  // "[object Object]" in the downloaded CSV.
  if (
    field.type === FieldType.FILE &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { filename?: unknown }).filename === "string"
  ) {
    return (value as { filename: string }).filename;
  }
  if (value === OTHER_VALUE) return renderOther();
  if (parsed.options.length > 0) {
    const opt = parsed.options.find((o) => o.value === value);
    if (opt) return opt.label;
  }
  return String(value);
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

  const registrations = await prisma.registration.findMany({
    where: { eventId },
    include: { contact: true },
    orderBy: { registeredAt: "asc" },
  });

  // FormFields that warrant a CSV column — exclude layout-only types
  // and Contact-column duplicates that already appear in the fixed
  // header block.
  const dynamicFields = formFields.filter(
    (f) => !SKIP_TYPES.has(f.type) && !CONTACT_COLUMN_NAMES.has(f.name)
  );

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
      row[field.label] = formatCell(field, formData[field.name], formData);

      // Other-enabled fields get a sibling column with the custom text.
      const parsed = parseFormFieldOptions(field.options);
      if (parsed.other) {
        const sibling = formData[`${field.name}${OTHER_SUFFIX}`];
        row[`${field.label} (Other)`] =
          typeof sibling === "string" ? sibling : "";
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
