/**
 * FileFieldMetadata — the FormField.metadata shape for type=FILE.
 *
 * FormField.metadata is a free-form Json column shared across field
 * types. For FILE fields it carries the two per-field upload
 * constraints — max size and allowed MIME types — that the admin
 * configures in the form-builder (Stage 2). Stage 1 reads metadata
 * but admins can't write it yet, so every field falls back to
 * DEFAULT_FILE_METADATA via parseFileFieldMetadata().
 *
 * The Stage 1 hard cap on max size is 25 MB. Vercel Blob supports
 * larger uploads, but registration use cases (IDs, CRs, certificates)
 * rarely exceed 10 MB. The 25 MB ceiling prevents abuse without
 * blocking real needs; revisit per the spec's open question #5.
 */

import { z } from "zod";

/**
 * Allowed MIME types the admin can configure for a FILE field. Adding
 * more is a one-line change here plus a corresponding checkbox row in
 * the admin UI (file-field-settings.tsx). JPEG / PNG / PDF cover ~95%
 * of registration use cases; .docx / .xlsx are available but unchecked
 * by default.
 */
export const ALLOWED_FILE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type AllowedFileMimeType = (typeof ALLOWED_FILE_MIME_TYPES)[number];

/**
 * Display metadata for each allowed MIME type. The admin UI iterates
 * this list to render checkbox rows; the upload-control hint text and
 * Stage 3 admin display can also reuse the friendly labels.
 *
 * `shortLabel` is the user-facing extension list shown in checkbox
 * rows ("JPEG image (.jpg, .jpeg)"). `acceptExt` is the comma-joined
 * extension form for client-side `<input accept>`.
 */
export const FILE_MIME_OPTIONS: ReadonlyArray<{
  mime: AllowedFileMimeType;
  shortLabel: string;
  acceptExt: string;
}> = [
  { mime: "image/jpeg", shortLabel: "JPEG image (.jpg, .jpeg)", acceptExt: ".jpg,.jpeg" },
  { mime: "image/png", shortLabel: "PNG image (.png)", acceptExt: ".png" },
  { mime: "application/pdf", shortLabel: "PDF document (.pdf)", acceptExt: ".pdf" },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    shortLabel: "Word document (.docx)",
    acceptExt: ".docx",
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    shortLabel: "Excel spreadsheet (.xlsx)",
    acceptExt: ".xlsx",
  },
];

export const MIN_FILE_MAX_SIZE_MB = 1;
export const MAX_FILE_MAX_SIZE_MB = 25;

/**
 * The persisted shape inside FormField.metadata.{maxSizeMB,
 * allowedMimeTypes}. Other field types may use other keys on
 * metadata; FILE-specific code only reads/writes these two.
 */
export const fileFieldMetadataSchema = z.object({
  maxSizeMB: z
    .number()
    .int()
    .min(MIN_FILE_MAX_SIZE_MB)
    .max(MAX_FILE_MAX_SIZE_MB),
  allowedMimeTypes: z
    .array(z.enum(ALLOWED_FILE_MIME_TYPES))
    .min(1, "At least one allowed file type is required."),
});

export type FileFieldMetadata = z.infer<typeof fileFieldMetadataSchema>;

export const DEFAULT_FILE_METADATA: FileFieldMetadata = {
  maxSizeMB: 10,
  allowedMimeTypes: ["image/jpeg", "image/png", "application/pdf"],
};

/**
 * Permissive read of FormField.metadata for a FILE field. Returns the
 * defaults when:
 *   - metadata is null/undefined (the common Stage 1 case),
 *   - metadata is set but the FILE keys are absent (other field types'
 *     keys live on the same column),
 *   - metadata is malformed (string, wrong type, out of range — admin
 *     UI shouldn't allow this but a hand-edited row could).
 *
 * Used both at upload-token mint (to set allowedContentTypes /
 * maximumSizeInBytes on the SDK) and inside onUploadCompleted (to
 * re-validate the actually-uploaded bytes against the same limits).
 */
export function parseFileFieldMetadata(raw: unknown): FileFieldMetadata {
  if (!raw || typeof raw !== "object") return DEFAULT_FILE_METADATA;
  // Extract just the FILE-specific keys; ignore unknown keys other
  // field types might be using on the same column.
  const obj = raw as Record<string, unknown>;
  const candidate = {
    maxSizeMB: obj.maxSizeMB,
    allowedMimeTypes: obj.allowedMimeTypes,
  };
  const parsed = fileFieldMetadataSchema.safeParse(candidate);
  return parsed.success ? parsed.data : DEFAULT_FILE_METADATA;
}

/** Convenience: maxSizeMB → bytes. The Vercel Blob SDK takes bytes. */
export function maxSizeMBToBytes(maxSizeMB: number): number {
  return maxSizeMB * 1024 * 1024;
}

/**
 * Strict validation for the FormField write path (POST + PATCH).
 *
 * Returns `{ ok: true, value }` when the payload is a valid FileFieldMetadata,
 * or `{ ok: false, message }` when it isn't. Callers should reject the
 * request with HTTP 400 and the returned message.
 *
 * The route layer should only invoke this when the effective field type
 * is FILE — for other types, `FormField.metadata` stays a free-form
 * `Json?` with no per-type schema, leaving room for future field types
 * to claim their own keys. The route also passes `null` through
 * untouched as "clear the column", which is the correct behavior on
 * type-change-away-from-FILE.
 */
export function validateFileFieldMetadataInput(
  raw: unknown
): { ok: true; value: FileFieldMetadata } | { ok: false; message: string } {
  const parsed = fileFieldMetadataSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };

  // Surface a short, actionable message rather than the full Zod issue
  // tree — the admin UI already prevents most bad inputs at the source.
  const first = parsed.error.issues[0];
  const path = first?.path.join(".") || "metadata";
  const message =
    first?.message
      ? `Invalid FILE field metadata (${path}): ${first.message}`
      : "Invalid FILE field metadata";
  return { ok: false, message };
}
