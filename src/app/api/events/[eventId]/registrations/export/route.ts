import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { FieldType } from "@prisma/client";
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

// The fixed columns emitted before the dynamic FormField block, in order.
// Both the CSV (via Papa, which derives columns from row keys) and the
// xlsx path (which needs an explicit header order to compute cell
// addresses for hyperlinks) rely on this matching the row keys built below.
const BASE_COLUMNS = [
  "First Name",
  "Last Name",
  "Email",
  "Phone",
  "Organization",
  "Designation",
  "Category",
  "Status",
  "Registered At",
  "Confirmation Code",
] as const;

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

  const data = registrations.map((r) => {
    const formData = (r.formData as Record<string, unknown> | null) ?? {};
    const row: Record<string, string> = {
      "First Name": r.contact.firstName,
      "Last Name": r.contact.lastName,
      Email: isSyntheticEmail(r.contact.email) ? "" : r.contact.email,
      Phone: r.contact.phone || "",
      Organization: r.contact.organization || "",
      Designation: r.contact.designation || "",
      Category: r.contact.category || "",
      Status: r.status,
      "Registered At": r.registeredAt?.toISOString() || "",
      "Confirmation Code": r.confirmationCode,
    };

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
    // hyperlinks. Mirrors the row keys built above (base block, then each
    // dynamic field, with its Other sibling immediately after).
    const columns: string[] = [...BASE_COLUMNS];
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
