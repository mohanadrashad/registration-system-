import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { validateCategoryForEvent } from "@/lib/validations/contact";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { nanoid } from "nanoid";
import { randomBytes } from "crypto";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const mappings = JSON.parse(formData.get("mappings") as string || "{}");
  const defaultCategory = (formData.get("category") as string) || "";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  let rows: Record<string, string>[] = [];
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".csv")) {
    const text = await file.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    rows = parsed.data as Record<string, string>[];
  } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  } else {
    return NextResponse.json({ error: "Unsupported file format. Use CSV or Excel." }, { status: 400 });
  }

  // Reuse ctx.event (loaded by authorizeEvent) instead of re-fetching.
  const event = ctx.event;

  const importBatch = nanoid(10);
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Resolve every cell up front so the category pre-validation pass and
  // the create pass agree on exactly the same values.
  const resolved = rows.map((row) => ({
    row,
    firstName: row[mappings.firstName || "firstName"] || row["First Name"] || row["first_name"] || "",
    lastName: row[mappings.lastName || "lastName"] || row["Last Name"] || row["last_name"] || "",
    email: row[mappings.email || "email"] || row["Email"] || row["email"] || "",
    phone: row[mappings.phone || "phone"] || row["Phone"] || row["phone"] || "",
    organization: row[mappings.organization || "organization"] || row["Organization"] || row["Company"] || "",
    designation: row[mappings.designation || "designation"] || row["Designation"] || row["Title"] || "",
    rawCategory: defaultCategory || row[mappings.category || "category"] || row["Category"] || row["Type"] || "",
  }));

  // ── Pass 1: category pre-validation. Whole-file failure on ANY
  // invalid category — nothing is written. Empty string coerces to
  // null (consistent with the create/update paths and the spec's
  // Behavior section); only a non-empty value absent from
  // Event.categories is an error. Soft-skip conditions (missing
  // email/name, duplicates) are NOT evaluated here — they stay
  // per-row in pass 2 exactly as before.
  const categoryErrors: string[] = [];
  const normalizedCategories: (string | null)[] = [];
  resolved.forEach((r, i) => {
    const check = validateCategoryForEvent(r.rawCategory, event.categories);
    if (!check.ok) {
      // 1-based data-row number (excludes the header line).
      categoryErrors.push(
        `Row ${i + 1}: category '${r.rawCategory.trim()}' not in event categories.`
      );
      normalizedCategories.push(null);
    } else {
      normalizedCategories.push(check.value ?? null);
    }
  });

  if (categoryErrors.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Import aborted — fix the category values below and re-upload. Nothing was imported.",
        errors: categoryErrors,
      },
      { status: 400 }
    );
  }

  // ── Pass 2: create loop. Unchanged soft-skip behaviour — missing
  // email/first name and duplicate emails skip the row and the rest
  // still commit.
  for (let i = 0; i < resolved.length; i++) {
    const { row, firstName, lastName, email, phone, organization, designation } =
      resolved[i];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !firstName || !emailRegex.test(email.trim())) {
      skipped++;
      continue;
    }

    try {
      await prisma.contact.create({
        data: {
          eventId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone?.trim() || null,
          organization: organization?.trim() || null,
          designation: designation?.trim() || null,
          category: normalizedCategories[i],
          inviteToken: randomBytes(16).toString("hex"),
          importBatch,
          metadata: row,
        },
      });
      created++;
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === "P2002") {
        skipped++;
      } else {
        errors.push(`Row with email ${email}: ${(error as Error).message}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    importBatch,
    summary: {
      total: rows.length,
      created,
      skipped,
      errors: errors.length,
    },
    errors: errors.slice(0, 10),
  });
}
