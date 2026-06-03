/**
 * POST /api/events/[eventId]/branding/upload
 *
 * Admin logo/favicon upload (Feature A4, REGISTRATION_CUSTOMIZATION_SPEC).
 *
 * Unlike the visitor FILE flow (which uses the @vercel/blob client-token
 * `handleUpload` dance because visitors are unauthenticated), the admin is
 * authenticated here — so this is a plain authenticated server route that
 * streams the file straight to a PUBLIC Blob store and returns the CDN URL.
 *
 * Branding assets go to a SEPARATE public store (the main store is private),
 * so we pass that store's token explicitly. The returned URL is stored by the
 * client into the existing logoUrl / logoWhiteUrl / faviconUrl column via the
 * normal branding save — this route never writes to the DB.
 */

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { authorizeEvent } from "@/lib/api-auth";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — logos/favicons are small.

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

// Which branding slot this upload targets — only used to name the blob path.
const KINDS = new Set(["logo", "logoWhite", "favicon"]);

function extFromType(type: string): string {
  switch (type) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/svg+xml":
      return ".svg";
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return ".ico";
    default:
      return "";
  }
}

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { eventId } = await params;

  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  const token = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN;
  if (!token) {
    // Misconfiguration, not a client error — the public store env var is
    // missing on this deployment.
    console.error("[branding/upload] BLOB_PUBLIC_READ_WRITE_TOKEN is not set");
    return NextResponse.json(
      { error: "Image uploads are not configured on this environment." },
      { status: 500 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "logo");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: "Invalid upload kind" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${file.type || "unknown"}` },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image is too large (max 5 MB)." },
      { status: 400 }
    );
  }

  // Path is organizational only; the public store URL is public by design and
  // addRandomSuffix guarantees uniqueness across re-uploads.
  const pathname = `branding/${eventId}/${kind}${extFromType(file.type)}`;

  try {
    const blob = await put(pathname, file, {
      access: "public",
      token,
      contentType: file.type,
      addRandomSuffix: true,
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error("[branding/upload] put failed:", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
