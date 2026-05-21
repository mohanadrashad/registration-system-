"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Inline FILE viewer used on the attendee detail page's view-mode
 * rendering of the Registration answers card. Renders the
 * denormalized formData FILE ref as a one-liner:
 *
 *   📄 filename.pdf  ·  482 KB  ·  PDF   [↗ View]
 *
 * The View button opens the stream-through endpoint at
 * /api/events/[eventId]/files/[fileId]/stream in a new tab. The
 * server-side route re-validates authorizeEvent on every request —
 * see src/app/api/events/[eventId]/files/[fileId]/stream/route.ts.
 *
 * Edit mode is not handled here. The Stage 2 FieldEditInput already
 * renders a read-only FILE label with the "Visitor-uploaded — admin
 * replace/remove arrives in v2." note; replacing that with a View
 * button there would muddy the "edit mode is for changing things"
 * UX. The Stage 3 spec is explicit that admin Replace/Remove are
 * v2 non-goals.
 */
export function FileViewerInline({
  file,
  eventId,
}: {
  file: {
    fileId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  };
  eventId: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span aria-hidden="true">📄</span>
      <span className="font-medium break-all">{file.filename}</span>
      <span className="text-muted-foreground">
        · {formatBytes(file.sizeBytes)}
      </span>
      <span className="text-muted-foreground">
        · {mimeShortLabel(file.mimeType)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 ml-1"
        asChild
      >
        <a
          href={`/api/events/${eventId}/files/${file.fileId}/stream`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink className="mr-1 h-3 w-3" />
          View
        </a>
      </Button>
    </span>
  );
}

/**
 * Guards the inline-detection branch on the caller side. Returns true
 * iff `raw` looks like a denormalized FILE ref the renderer can
 * consume (matches what registration POST writes into formData).
 * Caller falls back to formatFieldValue's filename-only stub when
 * this returns false — covers orphan-cleanup edge cases and any
 * malformed legacy data without throwing.
 */
export function isFileRef(
  raw: unknown
): raw is {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
} {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  const r = raw as Record<string, unknown>;
  return (
    typeof r.fileId === "string" &&
    typeof r.filename === "string" &&
    typeof r.mimeType === "string" &&
    typeof r.sizeBytes === "number"
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeShortLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime === "image/jpeg") return "JPEG";
  if (mime === "image/png") return "PNG";
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "DOCX";
  }
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "XLSX";
  }
  return mime;
}
