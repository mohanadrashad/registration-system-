import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import Papa from "papaparse";
import { FieldType } from "@prisma/client";
import {
  parseFormFieldOptions,
  resolveOtherLabel,
  OTHER_VALUE,
  OTHER_SUFFIX,
} from "@/lib/form-builder/options-parse";

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
  if (value === OTHER_VALUE) return renderOther();
  if (parsed.options.length > 0) {
    const opt = parsed.options.find((o) => o.value === value);
    if (opt) return opt.label;
  }
  return String(value);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;

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
      Email: r.contact.email,
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

  const csv = Papa.unparse(data);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="registrations-${eventId}.csv"`,
    },
  });
}
