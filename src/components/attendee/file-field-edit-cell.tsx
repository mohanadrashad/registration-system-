"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  ExternalLink,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isFileRef } from "./file-viewer-inline";
import type { FormFieldDef } from "./field-display";

/**
 * Edit-dialog FILE cell. Used by FieldEditInput's FILE branch when
 * eventId/contactId/onFileChanged are available; falls back to a
 * read-only label otherwise.
 *
 * Owns three concerns the rest of FieldEditInput doesn't have:
 *   - Async provenance fetch (lazy on mount) from /meta endpoint
 *   - Confirm dialogs + hidden file picker for Replace
 *   - Confirm dialog for Remove
 *   - On success, calls onFileChanged() so the parent refetches the
 *     contact and the cell re-renders with the new file (or empty
 *     state for Remove).
 *
 * Stage 3 of ADMIN_EDIT_FIX_SPEC. Pairs with the replace + remove +
 * meta endpoints landed in Chunks 2-4.
 */

interface FileRef {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

interface ProvenanceMeta {
  uploadedBy: "visitor" | "admin";
  uploadedByName: string | null;
  uploadedAt: string;
  wasReplaced: boolean;
}

type Pending = "replace" | "remove" | null;
type Confirm = "replace" | "remove" | null;

export function FileFieldEditCell({
  field,
  value,
  eventId,
  contactId,
  onFileChanged,
}: {
  field: FormFieldDef;
  value: unknown;
  eventId: string;
  contactId: string;
  onFileChanged: () => void | Promise<void>;
}) {
  const file = isFileRef(value) ? (value as FileRef) : null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [meta, setMeta] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "loaded"; data: ProvenanceMeta }
    | { state: "error" }
  >({ state: file ? "loading" : "idle" });
  const [pending, setPending] = useState<Pending>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  // Lazy provenance fetch. Re-fires when fileId changes (after Replace
  // the parent refetches and we get a new file with a new id).
  useEffect(() => {
    if (!file) {
      setMeta({ state: "idle" });
      return;
    }
    let cancelled = false;
    setMeta({ state: "loading" });
    (async () => {
      try {
        const res = await fetch(
          `/api/events/${eventId}/files/${file.fileId}/meta`
        );
        if (!res.ok) {
          if (!cancelled) setMeta({ state: "error" });
          return;
        }
        const data = (await res.json()) as ProvenanceMeta;
        if (!cancelled) setMeta({ state: "loaded", data });
      } catch {
        if (!cancelled) setMeta({ state: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, file?.fileId]); // eslint-disable-line react-hooks/exhaustive-deps -- file ref is stable on fileId

  // Empty state — no file ever uploaded (or after Remove). Per Mockup
  // 2b: no Replace/Remove buttons in this state because admin-side new
  // uploads are out of scope. Required-field warning at the top of the
  // page covers the missing-required-data case.
  if (!file) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground italic">
          No file uploaded
        </p>
      </div>
    );
  }

  async function handleReplaceConfirm() {
    // Two-step (Mockup 3a): the confirm dialog stays open until the
    // admin picks a file (or cancels). Clicking "Pick file…" triggers
    // the hidden <input type="file"> below.
    fileInputRef.current?.click();
  }

  async function handleReplaceFilePicked(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const picked = e.target.files?.[0];
    // Reset the input so picking the same file twice still fires onChange.
    e.target.value = "";
    if (!picked || !file) return;

    setConfirm(null);
    setPending("replace");
    try {
      await upload(picked.name, picked, {
        // Matches the visitor-side file-upload-control: store is Private
        // at the Vercel project level, the SDK literal is "private".
        access: "private",
        handleUploadUrl: `/api/events/${eventId}/contacts/${contactId}/files/${file.fileId}/replace`,
        contentType: picked.type,
      });
      toast.success("File replaced");
      await onFileChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Replace failed";
      toast.error(msg);
    } finally {
      setPending(null);
    }
  }

  async function handleRemoveConfirm() {
    if (!file) return;
    setPending("remove");
    try {
      const res = await fetch(
        `/api/events/${eventId}/contacts/${contactId}/files/${file.fileId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Remove failed");
        return;
      }
      toast.success("File removed");
      setConfirm(null);
      await onFileChanged();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-2">
      <FileMetaLine file={file} />
      <ProvenanceLine meta={meta} pending={pending} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          disabled={pending !== null}
          onClick={() => setConfirm("replace")}
        >
          {pending === "replace" ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="mr-1 h-3 w-3" />
          )}
          {pending === "replace" ? "Replacing…" : "Replace"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-destructive hover:text-destructive"
          disabled={pending !== null}
          onClick={() => setConfirm("remove")}
        >
          {pending === "remove" ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="mr-1 h-3 w-3" />
          )}
          Remove
        </Button>
      </div>

      {/* Hidden picker — opens via fileInputRef.current.click() from
          the Replace confirm "Pick file…" button. */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleReplaceFilePicked}
      />

      {/* Replace confirm dialog (Mockup 3a) — Option A two-step flow:
          confirm first, then file picker opens. Admin can back out
          before the picker steals focus. */}
      <Dialog
        open={confirm === "replace"}
        onOpenChange={(open) => !open && pending === null && setConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace this file?</DialogTitle>
            <DialogDescription>
              Replace the visitor&apos;s uploaded file? The original file will
              be deleted.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Current: {file.filename} ({formatBytes(file.sizeBytes)})
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirm(null)}
              disabled={pending !== null}
            >
              Keep as is
            </Button>
            <Button onClick={handleReplaceConfirm} disabled={pending !== null}>
              Pick file…
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm dialog (Mockup 3b). */}
      <Dialog
        open={confirm === "remove"}
        onOpenChange={(open) => !open && pending === null && setConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this file?</DialogTitle>
            <DialogDescription>
              Remove the visitor&apos;s uploaded file? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Will remove: {file.filename} ({formatBytes(file.sizeBytes)})
          </p>
          {field.required && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              ⚠ This field is required. The registration will be flagged as
              missing required data until a new file is uploaded.
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirm(null)}
              disabled={pending !== null}
            >
              Keep as is
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveConfirm}
              disabled={pending !== null}
            >
              {pending === "remove" && (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              )}
              Remove file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FileMetaLine({ file }: { file: FileRef }) {
  return (
    <p className="text-sm">
      <span aria-hidden="true">📄</span>{" "}
      <span className="font-medium break-words">{file.filename}</span>
      <span className="text-muted-foreground">
        {" · "}
        {formatBytes(file.sizeBytes)}
      </span>
      <span className="text-muted-foreground">
        {" · "}
        {mimeLabel(file.mimeType)}
      </span>
    </p>
  );
}

function ProvenanceLine({
  meta,
  pending,
}: {
  meta:
    | { state: "idle" }
    | { state: "loading" }
    | { state: "loaded"; data: ProvenanceMeta }
    | { state: "error" };
  pending: Pending;
}) {
  if (pending === "replace") {
    return (
      <p className="text-xs text-muted-foreground italic flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Uploading new file…
      </p>
    );
  }
  if (pending === "remove") {
    return (
      <p className="text-xs text-muted-foreground italic flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Removing…
      </p>
    );
  }
  if (meta.state === "loading") {
    return (
      <p className="text-xs text-muted-foreground italic">
        Loading provenance…
      </p>
    );
  }
  if (meta.state === "error") {
    return (
      <p className="text-xs text-muted-foreground italic">
        Could not load provenance.
      </p>
    );
  }
  if (meta.state === "idle") return null;

  const { data } = meta;
  const dateStr = formatDate(data.uploadedAt);
  if (data.uploadedBy === "visitor") {
    return (
      <p className="text-xs text-muted-foreground">
        Uploaded by visitor on {dateStr}
      </p>
    );
  }
  // admin
  const name = data.uploadedByName ?? "a former admin";
  return (
    <p className="text-xs text-muted-foreground">
      Uploaded by {name} on {dateStr} (replaced visitor upload)
    </p>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeLabel(mime: string | undefined): string {
  if (!mime) return "";
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

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
  } catch {
    return iso;
  }
}
