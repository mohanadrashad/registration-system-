import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { nanoid } from "nanoid";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;

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

  const importBatch = nanoid(10);
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const firstName = row[mappings.firstName || "firstName"] || row["First Name"] || row["first_name"] || "";
    const lastName = row[mappings.lastName || "lastName"] || row["Last Name"] || row["last_name"] || "";
    const email = row[mappings.email || "email"] || row["Email"] || row["email"] || "";
    const phone = row[mappings.phone || "phone"] || row["Phone"] || row["phone"] || "";
    const organization = row[mappings.organization || "organization"] || row["Organization"] || row["Company"] || "";
    const designation = row[mappings.designation || "designation"] || row["Designation"] || row["Title"] || "";
    const category = defaultCategory || row[mappings.category || "category"] || row["Category"] || row["Type"] || "";

    if (!email || !firstName) {
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
          category: category?.trim() || null,
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
