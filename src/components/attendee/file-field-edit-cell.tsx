"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  ExternalLink,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
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
 * Edit-dialog FILE cell — admin View / Replace / Remove + provenance.
 * Used by FieldEditInput's FILE branch when the caller supplies
 * eventId / contactId / onFileChanged (the attendee detail page).
 *
 * Stage 3 of ADMIN_EDIT_FIX_SPEC. Backend endpoints (replace POST,
 * remove DELETE, meta GET) shipped in PR #23; this is the UI revival
 * that the original Stage 3 reverted after a Radix commit-phase race.
 *
 * ── Stability contract (the whole reason the first attempt failed) ──
 * Every conditional placement here is ALWAYS-MOUNTED and toggled with a
 * `hidden` className — NOT a `{cond ? <A/> : <B/>}` swap and NOT a
 * `{cond && <Node/>}` mount. After a successful Replace/Remove the
 * parent refetches the contact, which flips this cell's `value` from a
 * file ref to null (Remove) or to a new ref (Replace). If any subtree
 * unmounted on that transition it would race React's commit phase
 * against the closing confirm Dialog's Radix Presence exit + the sonner
 * toast portal mount, surfacing as
 * `DOMException: Node.removeChild ... is not a child of this node`
 * (commitDeletionEffectsOnFiber). Keeping the DOM stable removes the
 * sibling teardown, so the only Radix Presence exit left has nothing to
 * race against. See [[radix-dialog-post-refetch-race]].
 *
 * Consequence of stable mounting: the file subtree renders even when
 * `file` is null (just `hidden`), so EVERY file deref below is
 * null-guarded. Never assume `file` is non-null inside the render tree.
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

type MetaState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "loaded"; data: ProvenanceMeta }
  | { state: "error" };

type Pending = "replace" | "remove" | "upload" | null;
type Confirm = "replace" | "remove" | null;

export function FileFieldEditCell({
  field,
  value,
  eventId,
  contactId,
  onFileChanged,
  hasRegistration,
}: {
  field: FormFieldDef;
  value: unknown;
  eventId: string;
  contactId: string;
  onFileChanged: () => void | Promise<void>;
  // v1 of admin-upload-into-empty: Upload writes into Registration.formData,
  // so it only makes sense when the contact has a registration. When false
  // the Upload affordance is hidden (the field still shows "No file
  // uploaded"). Registration-less contacts are a v2 (auto-create) non-goal.
  hasRegistration: boolean;
}) {
  const file = isFileRef(value) ? (value as FileRef) : null;
  const hasFile = !!file;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [meta, setMeta] = useState<MetaState>({ state: "idle" });
  const [pending, setPending] = useState<Pending>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  // Set when an Upload/Replace's post-upload poll exhausts its ~10s window
  // without the webhook landing. Surfaces a persistent "refresh to check"
  // line so a lost race never reads as success (empty for Upload, stale
  // for Replace). Cleared at the start of the next file action.
  const [timedOut, setTimedOut] = useState(false);

  // Lazy provenance fetch. Re-fires when fileId changes (after a Replace
  // the parent refetch hands us a new file id). Cancellation guards
  // against a late response clobbering a newer state.
  useEffect(() => {
    if (!file) {
      setMeta({ state: "idle" });
      return;
    }
    const fileId = file.fileId;
    let cancelled = false;
    setMeta({ state: "loading" });
    (async () => {
      try {
        const res = await fetch(
          `/api/events/${eventId}/files/${fileId}/meta`
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
  }, [eventId, file?.fileId]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the stable fileId

  function handlePickFile() {
    // Two-step (Mockup 3a): confirm first, then open the hidden picker.
    fileInputRef.current?.click();
  }

  /**
   * Polls the read-back endpoint after an Upload/Replace until the field
   * reflects the new file, then resolves with it. Returns null if the
   * ~10s window elapses without the webhook landing.
   *
   * The @vercel/blob `upload()` resolves when bytes hit storage, BEFORE
   * the onUploadCompleted webhook writes the RegistrationFile row — so a
   * single immediate refetch races the webhook. Mirrors the visitor-side
   * waitForUploadedFile loop (file-upload-control.tsx): 12 attempts at
   * 800ms ≈ 10s. For Upload pass oldFileId=null (any ref is new); for
   * Replace pass the old fileId (wait until a DIFFERENT row appears, since
   * the webhook swaps old→new atomically).
   */
  async function waitForFieldFile(
    oldFileId: string | null
  ): Promise<FileRef | null> {
    const MAX_ATTEMPTS = 12; // ~10s at 800ms intervals
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        const res = await fetch(
          `/api/events/${eventId}/contacts/${contactId}/fields/${field.id}/file`
        );
        if (res.ok) {
          const body = (await res.json()) as { file: FileRef | null };
          if (body.file && body.file.fileId !== oldFileId) {
            return body.file;
          }
        }
      } catch {
        // network blip — keep polling
      }
      if (i < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    return null;
  }

  async function handleReplaceFilePicked(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const picked = e.target.files?.[0];
    // Reset so re-picking the same file still fires onChange.
    e.target.value = "";
    if (!picked || !file) return;

    const targetFileId = file.fileId;
    setConfirm(null);
    setTimedOut(false);
    setPending("replace");
    try {
      await upload(picked.name, picked, {
        // Project-level store is Private; the SDK literal is "private".
        access: "private",
        handleUploadUrl: `/api/events/${eventId}/contacts/${contactId}/files/${targetFileId}/replace`,
        contentType: picked.type,
      });
      // Wait for the webhook to swap old→new before refetching — a single
      // immediate refetch would read the OLD ref (the most dangerous race:
      // a stale file that looks like success). Poll until a DIFFERENT
      // fileId appears.
      const ready = await waitForFieldFile(targetFileId);
      if (ready) {
        toast.success("File replaced");
        await onFileChanged();
      } else {
        toast.error(
          "Replace is taking longer than expected. Refresh the page to check."
        );
        setTimedOut(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Replace failed";
      toast.error(msg);
    } finally {
      setPending(null);
    }
  }

  async function handleUploadPicked(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const picked = e.target.files?.[0];
    // Reset so re-picking the same file still fires onChange.
    e.target.value = "";
    if (!picked) return;

    // No confirm dialog — uploading into an EMPTY field is non-
    // destructive (nothing to lose), unlike Replace/Remove. So there is
    // no Radix Presence in this path at all; the only commit-phase event
    // is the null→object value flip (refetch) toggling the two always-
    // mounted blocks' `hidden` + the toast portal. Phase-2 shape, fully
    // CSS-hidden, no new mounts.
    setTimedOut(false);
    setPending("upload");
    try {
      await upload(picked.name, picked, {
        access: "private",
        handleUploadUrl: `/api/events/${eventId}/contacts/${contactId}/fields/${field.id}/upload`,
        contentType: picked.type,
      });
      // Wait for the webhook to write the row before refetching — a single
      // immediate refetch would read the still-empty field and render
      // "No file uploaded" until a manual refresh. Poll until any ref
      // appears (oldFileId=null).
      const ready = await waitForFieldFile(null);
      if (ready) {
        toast.success("File uploaded");
        await onFileChanged();
      } else {
        toast.error(
          "Upload is taking longer than expected. Refresh the page to check."
        );
        setTimedOut(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setPending(null);
    }
  }

  async function handleRemoveConfirm() {
    if (!file) return;
    const targetFileId = file.fileId;
    setPending("remove");
    try {
      const res = await fetch(
        `/api/events/${eventId}/contacts/${contactId}/files/${targetFileId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Remove failed");
        return;
      }
      toast.success("File removed");
      // Close the dialog and refetch immediately — NO setTimeout buffer.
      // The discredited Stage-3 attempt #2 added a 250ms delay to dodge
      // the Radix race; it didn't work because the race was a sibling
      // SUBTREE teardown, not a timing gap. With every placement here
      // CSS-hidden, the refetch's value→null transition unmounts
      // nothing; the dialog's Presence exit (driven by `open` flipping
      // false) has no concurrent deletion to race. Stable DOM is the
      // antidote, not a delay.
      setConfirm(null);
      await onFileChanged();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  // ── Derived, null-safe display values (subtree stays mounted when
  //    file is null, so nothing below may deref `file` directly). ──
  const streamHref = file
    ? `/api/events/${eventId}/files/${file.fileId}/stream`
    : "#";
  const prov = computeProvenanceLine(meta, pending);

  return (
    <div className="space-y-2">
      {/* Poll-timeout notice — ALWAYS mounted, CSS-hidden unless an
          Upload/Replace poll exhausted its window. Shows above both the
          file and no-file blocks so a lost race is never silent: Upload
          would otherwise look empty, Replace would show the stale old
          file. Stable-DOM: className toggle only, no mount/unmount. */}
      <p
        className={`text-xs text-amber-600 dark:text-amber-500 ${
          timedOut ? "" : "hidden"
        }`}
      >
        ⏳ Your file was sent but is taking longer than usual to appear.
        Refresh the page to check.
      </p>

      {/* File present view — ALWAYS mounted, CSS-hidden when no file.
          Every deref is null-guarded so the hidden tree never throws. */}
      <div className={hasFile ? "space-y-2" : "hidden"}>
        <p className="text-sm">
          <span aria-hidden="true">📄</span>{" "}
          <span className="font-medium break-words">
            {file?.filename ?? ""}
          </span>
          <span className="text-muted-foreground">
            {" · "}
            {file ? formatBytes(file.sizeBytes) : ""}
          </span>
          <span className="text-muted-foreground">
            {" · "}
            {file ? mimeLabel(file.mimeType) : ""}
          </span>
        </p>

        {/* Provenance — ONE always-mounted <p>; spinner + text driven by
            state, never a {data && <line>} mount. Hidden only when there
            is nothing at all to say (idle with no file). */}
        <p
          className={`text-xs italic flex items-center gap-1 ${
            prov.text ? "text-muted-foreground" : "hidden"
          }`}
        >
          <Loader2
            className={`h-3 w-3 animate-spin ${
              prov.spinner ? "" : "hidden"
            }`}
          />
          <span>{prov.text}</span>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/* View — plain link, no portal, never races. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            asChild
          >
            <a href={streamHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-3 w-3" />
              View
            </a>
          </Button>

          {/* Replace — Loader2 + icon both always mounted, CSS-toggled. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={pending !== null || !hasFile}
            onClick={() => setConfirm("replace")}
          >
            <Loader2
              className={`mr-1 h-3 w-3 animate-spin ${
                pending === "replace" ? "" : "hidden"
              }`}
            />
            <RotateCcw
              className={`mr-1 h-3 w-3 ${
                pending === "replace" ? "hidden" : ""
              }`}
            />
            <span>{pending === "replace" ? "Replacing…" : "Replace"}</span>
          </Button>

          {/* Remove — same always-mounted icon pair. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-destructive hover:text-destructive"
            disabled={pending !== null || !hasFile}
            onClick={() => setConfirm("remove")}
          >
            <Loader2
              className={`mr-1 h-3 w-3 animate-spin ${
                pending === "remove" ? "" : "hidden"
              }`}
            />
            <Trash2
              className={`mr-1 h-3 w-3 ${
                pending === "remove" ? "hidden" : ""
              }`}
            />
            <span>Remove</span>
          </Button>
        </div>
      </div>

      {/* No-file state — ALWAYS mounted, CSS-hidden when a file exists.
          The Upload button adds a NEW file into the empty field. Always
          mounted (the null→object transition after a successful upload is
          just className flips between this block and the file block — no
          mount/unmount, no Dialog, Phase-2 shape). The button is hidden
          when the contact has no registration (v1 non-goal — formData
          lives on Registration). */}
      <div className={`space-y-2 ${hasFile ? "hidden" : ""}`}>
        <p className="text-sm text-muted-foreground italic">No file uploaded</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`h-7 ${hasRegistration ? "" : "hidden"}`}
          disabled={pending !== null}
          onClick={() => uploadInputRef.current?.click()}
        >
          <Loader2
            className={`mr-1 h-3 w-3 animate-spin ${
              pending === "upload" ? "" : "hidden"
            }`}
          />
          <Upload
            className={`mr-1 h-3 w-3 ${pending === "upload" ? "hidden" : ""}`}
          />
          <span>{pending === "upload" ? "Uploading…" : "Upload file"}</span>
        </Button>
      </div>

      {/* Hidden picker — opened via fileInputRef from the Replace
          confirm "Pick file…" button. */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleReplaceFilePicked}
      />

      {/* Hidden picker for upload-into-empty — opened from the Upload
          button. Separate input/handler from Replace so the two flows'
          endpoints + payloads stay distinct. Always mounted (display:none,
          zero layout cost). */}
      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        onChange={handleUploadPicked}
      />

      {/* Replace confirm dialog (Mockup 3a). The <Dialog> wrapper is
          always mounted; only `open` flips. Gated on hasFile so a
          value→null refetch auto-closes it. All content is null-guarded
          for the exit frame. */}
      <Dialog
        open={hasFile && confirm === "replace"}
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
          <p className={`text-sm text-muted-foreground ${file ? "" : "hidden"}`}>
            Current: {file?.filename ?? ""} (
            {file ? formatBytes(file.sizeBytes) : ""})
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirm(null)}
              disabled={pending !== null}
            >
              Keep as is
            </Button>
            <Button onClick={handlePickFile} disabled={pending !== null}>
              Pick file…
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm dialog (Mockup 3b). Same always-mounted wrapper +
          hasFile-gated open. The in-button Loader2 is always mounted and
          CSS-hidden so it never unmounts inside the Dialog as Presence
          exits (the #10 race from the approvals fix). */}
      <Dialog
        open={hasFile && confirm === "remove"}
        onOpenChange={(open) => !open && pending === null && setConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this file?</DialogTitle>
            <DialogDescription>
              Remove the visitor&apos;s uploaded file? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <p className={`text-sm text-muted-foreground ${file ? "" : "hidden"}`}>
            Will remove: {file?.filename ?? ""} (
            {file ? formatBytes(file.sizeBytes) : ""})
          </p>
          <p
            className={`text-xs text-amber-600 dark:text-amber-500 ${
              field.required ? "" : "hidden"
            }`}
          >
            ⚠ This field is required. The registration will be flagged as
            missing required data until a new file is uploaded.
          </p>
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
              <Loader2
                className={`mr-2 h-3.5 w-3.5 animate-spin ${
                  pending === "remove" ? "" : "hidden"
                }`}
              />
              <span>Remove file</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Collapses (pending, meta) into a single { text, spinner } for the
 * always-mounted provenance line. Returning a value object — never JSX —
 * keeps the element identity stable at the call site.
 */
function computeProvenanceLine(
  meta: MetaState,
  pending: Pending
): { text: string; spinner: boolean } {
  if (pending === "replace") {
    return { text: "Uploading new file…", spinner: true };
  }
  if (pending === "remove") {
    return { text: "Removing…", spinner: true };
  }
  if (meta.state === "loading") {
    return { text: "Loading provenance…", spinner: false };
  }
  if (meta.state === "error") {
    return { text: "Could not load provenance.", spinner: false };
  }
  if (meta.state === "idle") {
    return { text: "", spinner: false };
  }
  const { data } = meta;
  const dateStr = formatDate(data.uploadedAt);
  if (data.uploadedBy === "visitor") {
    return { text: `Uploaded by visitor on ${dateStr}`, spinner: false };
  }
  // Admin upload. wasReplaced distinguishes a replace (there WAS a prior
  // visitor file — sentinel "admin:<id>") from an upload-into-empty
  // (no prior file — sentinel "admin-new:<id>"). Only the former gets
  // the "(replaced visitor upload)" clause.
  const name = data.uploadedByName ?? "a former admin";
  if (data.wasReplaced) {
    return {
      text: `Uploaded by ${name} on ${dateStr} (replaced visitor upload)`,
      spinner: false,
    };
  }
  return {
    text: `Uploaded by ${name} on ${dateStr}`,
    spinner: false,
  };
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
