"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  AlertCircle,
  Check,
  Loader2,
  Paperclip,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localeTag, type PortalLang } from "@/lib/portal/i18n";
import {
  FILE_MIME_OPTIONS,
  type AllowedFileMimeType,
  type FileFieldMetadata,
} from "@/lib/validations/file-field-metadata";

// ─── Strings ─────────────────────────────────────────────────────────
//
// Structural clone of receipt-upload-control's STRINGS shape, adapted
// to FILE-field copy. Receipt-specific phrasing ("Receipt uploaded",
// "Upload receipt") replaced with field-generic phrasing ("File
// uploaded", "Choose file"). Size + type hints are parameterised on
// the per-field metadata so the helper text matches the admin's
// per-FILE-field configuration.

const STRINGS = {
  en: {
    uploadCta: "Choose file",
    tryAgain: "Try again",
    replaceCta: "Replace",
    removeCta: "Remove",
    uploadingProgress: (pct: number) => `Uploading… ${pct}%`,
    uploading: "Uploading…",
    finalising: "Finalising…",
    finaliseTimeout:
      "Upload taking longer than expected. Refresh in a moment to see the latest.",
    cancel: "Cancel",
    acceptedNote: (exts: string, sizeMB: number) =>
      `${exts}, up to ${sizeMB} MB`,
    fileRequiredWarn: "A file is required for this field.",
    fileUploadedOk: "File uploaded",
    uploadFailed: "Upload failed",
    connectionLost: "Connection lost during transfer. Please try again.",
    wrongType: (selected: string, allowed: string) =>
      `${allowed} only. You selected ${selected}.`,
    tooLarge: (mb: number, maxMB: number) =>
      `File is ${mb.toFixed(1)} MB. Maximum allowed is ${maxMB} MB.`,
    tooLargeServer: "File too large for the server. Try a smaller file.",
    cantAuthorize:
      "Couldn't authorise the upload. Please refresh and try again.",
    serverError: "The server hit an error. Please try again in a moment.",
    notAvailable:
      "Upload temporarily unavailable. Please refresh or try again later.",
    replaceConfirmTitle: "Replace file?",
    replaceConfirmBody: (name: string) =>
      `"${name}" will be deleted and replaced with the new file. This can't be undone.`,
    replaceConfirmYes: "Replace",
    replaceConfirmNo: "Keep current",
    removeConfirmTitle: "Remove file?",
    removeConfirmBody: (name: string) =>
      `"${name}" will be deleted. You can upload a new one later.`,
    removeConfirmYes: "Remove",
    removeConfirmNo: "Keep",
    removing: "Removing…",
    removedJustNow: "File removed.",
    removeFailed: "Couldn't remove the file. Please try again.",
    bytes: (n: number) => {
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    },
  },
  ar: {
    uploadCta: "اختر ملفًا",
    tryAgain: "حاول مرة أخرى",
    replaceCta: "استبدال",
    removeCta: "حذف",
    uploadingProgress: (pct: number) => `جارٍ الرفع… ${pct}%`,
    uploading: "جارٍ الرفع…",
    finalising: "جارٍ الإنهاء…",
    finaliseTimeout:
      "الرفع يستغرق وقتًا أطول من المعتاد. حدّث الصفحة بعد لحظات لرؤية أحدث حالة.",
    cancel: "إلغاء",
    acceptedNote: (exts: string, sizeMB: number) =>
      `${exts}، حتى ${sizeMB} ميجابايت`,
    fileRequiredWarn: "يلزم رفع ملف لهذا الحقل.",
    fileUploadedOk: "تم رفع الملف",
    uploadFailed: "فشل الرفع",
    connectionLost: "انقطع الاتصال أثناء النقل. حاول مرة أخرى.",
    wrongType: (selected: string, allowed: string) =>
      `يُقبل ${allowed} فقط. اخترت ${selected}.`,
    tooLarge: (mb: number, maxMB: number) =>
      `حجم الملف ${mb.toFixed(1)} ميجابايت. الحد الأقصى ${maxMB} ميجابايت.`,
    tooLargeServer: "الملف أكبر مما يستوعبه الخادم. جرّب ملفًا أصغر.",
    cantAuthorize:
      "تعذّر تفويض الرفع. يُرجى تحديث الصفحة والمحاولة مرة أخرى.",
    serverError:
      "حدث خطأ في الخادم. يُرجى المحاولة مرة أخرى بعد لحظات.",
    notAvailable:
      "الرفع غير متاح مؤقتًا. يُرجى تحديث الصفحة أو المحاولة لاحقًا.",
    replaceConfirmTitle: "استبدال الملف؟",
    replaceConfirmBody: (name: string) =>
      `سيتم حذف "${name}" واستبداله بالملف الجديد. لا يمكن التراجع.`,
    replaceConfirmYes: "استبدال",
    replaceConfirmNo: "إبقاء الحالي",
    removeConfirmTitle: "حذف الملف؟",
    removeConfirmBody: (name: string) =>
      `سيتم حذف "${name}". يمكنك رفع ملف جديد لاحقًا.`,
    removeConfirmYes: "حذف",
    removeConfirmNo: "إبقاء",
    removing: "جارٍ الحذف…",
    removedJustNow: "تم حذف الملف.",
    removeFailed: "تعذّر حذف الملف. حاول مرة أخرى.",
    bytes: (n: number) => {
      if (n < 1024) return `${n} ب`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
      return `${(n / (1024 * 1024)).toFixed(1)} م.ب`;
    },
  },
} as const;

// ─── Public types ────────────────────────────────────────────────────

export interface UploadedFileRef {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface FileUploadControlProps {
  eventSlug: string;
  formFieldId: string;
  /** Per-field upload limits from FormField.metadata. */
  metadata: FileFieldMetadata;
  /** Whether the parent form treats this field as required. */
  required: boolean;
  lang: PortalLang;
  /**
   * Current value from the parent's form state. null = no file
   * uploaded. When non-null, the control renders the success state
   * with View / Replace / Remove actions.
   */
  value: UploadedFileRef | null;
  /**
   * Emitted on every change to the file: after a successful upload, a
   * delete, or a replace. The parent stores this in its form state and
   * sends it as `formData[fieldName]` on submission.
   */
  onChange: (next: UploadedFileRef | null) => void;
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * Self-contained file picker + upload + progress + error UI for one
 * FILE FormField on the public registration page.
 *
 * Structural clone of receipt-upload-control.tsx (portal Phase-Receipt
 * upload). Locked-in decisions from Stage 1 prep:
 *   - Clone rather than import — different auth, different config
 *     source, different lifecycle.
 *   - Stream-through reads only — Stage 3 builds the admin view route.
 *
 * Upload flow:
 *   1. Visitor clicks "Choose file" → file picker opens.
 *   2. Client-side type + size check against the per-field metadata.
 *      Bad files surface inline error, no bytes leave the browser.
 *   3. SDK `upload()` posts a token request to /upload, then uploads
 *      bytes directly to Vercel Blob.
 *   4. SDK resolves when bytes hit blob (BEFORE our webhook fires).
 *   5. Control polls GET /files?formFieldId=… until the row appears
 *      (webhook fired), then transitions to success state and emits
 *      the new UploadedFileRef to the parent via onChange.
 *
 * Replace flow differs from receipt-upload-control: receipts use an
 * inline replace-id passed to upload(); FILE field calls DELETE first,
 * waits for the row to disappear, then starts a fresh upload.
 */
export function FileUploadControl({
  eventSlug,
  formFieldId,
  metadata,
  required,
  lang,
  value,
  onChange,
}: FileUploadControlProps) {
  const t = STRINGS[lang];
  const tag = localeTag(lang);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  type UploadState =
    | { kind: "idle" }
    | { kind: "uploading"; fileName: string; sizeBytes: number; pct: number }
    | { kind: "finalising"; fileName: string }
    | { kind: "error"; message: string; fileName: string | null };
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  // Mirrors receipt-upload-control: the async poll loop captures `value`
  // by closure at startUpload time, so we keep a ref of the latest prop
  // for the loop to inspect.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const [finaliseTimedOut, setFinaliseTimedOut] = useState(false);
  useEffect(() => {
    setFinaliseTimedOut(false);
  }, [value?.fileId]);

  type DialogState =
    | { kind: "none" }
    | { kind: "replaceConfirm"; pendingFile: File }
    | { kind: "removeConfirm" };
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [removing, setRemoving] = useState(false);

  // Pre-compute the accept-attribute and the "JPG, PNG, PDF" hint text
  // from the configured MIME types. Order follows FILE_MIME_OPTIONS so
  // the same field across visitors sees a consistent order.
  const enabledMimeOpts = FILE_MIME_OPTIONS.filter((o) =>
    (metadata.allowedMimeTypes as readonly string[]).includes(o.mime)
  );
  const acceptAttr = enabledMimeOpts.map((o) => o.acceptExt).join(",");
  const shortExtsLabel = enabledMimeOpts
    .map((o) => o.acceptExt.split(",")[0].replace(".", "").toUpperCase())
    .join(", ");
  const maxSizeBytes = metadata.maxSizeMB * 1024 * 1024;

  function openFilePicker() {
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }

  // Client-side validation. Returns null on success; otherwise the
  // localised error string the empty-state error banner will show.
  function validateClientSide(file: File): string | null {
    if (
      !(metadata.allowedMimeTypes as readonly string[]).includes(file.type)
    ) {
      const selectedExt =
        file.name.split(".").pop()?.toUpperCase() || file.type || "?";
      return t.wrongType(selectedExt, shortExtsLabel);
    }
    if (file.size > maxSizeBytes) {
      return t.tooLarge(file.size / (1024 * 1024), metadata.maxSizeMB);
    }
    return null;
  }

  /**
   * After the SDK's upload() resolves we have to wait for Vercel's
   * webhook to fire and our onUploadCompleted handler to write the
   * RegistrationFile row before we know the new fileId. The pattern
   * mirrors waitForReceiptUpdate but reads from a dedicated GET
   * endpoint rather than a parent-supplied prop.
   */
  async function waitForUploadedFile(
    oldFileId: string | null
  ): Promise<UploadedFileRef | null> {
    const MAX_ATTEMPTS = 12; // ~10s at ~800ms intervals
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        const res = await fetch(
          `/api/register/${eventSlug}/files?formFieldId=${encodeURIComponent(
            formFieldId
          )}`,
          { credentials: "same-origin" }
        );
        if (res.ok) {
          const body = (await res.json()) as {
            file: {
              id: string;
              originalName: string;
              mimeType: string;
              sizeBytes: number;
              uploadedAt: string;
            } | null;
          };
          if (body.file && body.file.id !== oldFileId) {
            return {
              fileId: body.file.id,
              filename: body.file.originalName,
              mimeType: body.file.mimeType,
              sizeBytes: body.file.sizeBytes,
              uploadedAt: body.file.uploadedAt,
            };
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

  async function startUpload(file: File) {
    const localError = validateClientSide(file);
    if (localError) {
      setState({ kind: "error", message: localError, fileName: file.name });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setFinaliseTimedOut(false);
    setState({
      kind: "uploading",
      fileName: file.name,
      sizeBytes: file.size,
      pct: 0,
    });

    const oldFileId = valueRef.current?.fileId ?? null;

    try {
      await upload(file.name, file, {
        // Mirrors receipt-upload-control. The Vercel Blob store is
        // configured Private at the project level; this literal pairs
        // with that store configuration.
        access: "private",
        handleUploadUrl: `/api/register/${eventSlug}/upload`,
        contentType: file.type,
        clientPayload: JSON.stringify({ formFieldId }),
        abortSignal: controller.signal,
        onUploadProgress: (event) => {
          setState((cur) => {
            if (cur.kind !== "uploading") return cur;
            return { ...cur, pct: Math.min(99, Math.round(event.percentage)) };
          });
        },
      });

      setState({ kind: "finalising", fileName: file.name });
      try {
        const next = await waitForUploadedFile(oldFileId);
        if (next) {
          onChange(next);
        } else {
          // Webhook didn't fire within the budget. Show a soft banner;
          // visitor can refresh to recover. Don't block submission —
          // the parent's required-field validation will still flag
          // missing fileId at submit time.
          setFinaliseTimedOut(true);
        }
      } finally {
        abortRef.current = null;
        setState({ kind: "idle" });
      }
    } catch (e) {
      abortRef.current = null;
      if (e instanceof DOMException && e.name === "AbortError") {
        setState({ kind: "idle" });
        return;
      }
      const message = describeUploadError(e, t);
      setState({ kind: "error", message, fileName: file.name });
    }
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Replace-confirm: if there's already a file, gate the upload on
    // the replace dialog. Replace = DELETE existing, then upload new.
    if (value) {
      setDialog({ kind: "replaceConfirm", pendingFile: file });
      return;
    }
    void startUpload(file);
  }

  function cancelUpload() {
    abortRef.current?.abort();
  }

  async function performDelete() {
    if (!value) return;
    setRemoving(true);
    try {
      const res = await fetch(
        `/api/register/${eventSlug}/files/${value.fileId}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      if (!res.ok && res.status !== 404) {
        // 404 means already gone — treat as success since the result
        // (no file linked) is the same. Any other status is a real
        // failure.
        setState({
          kind: "error",
          message: t.removeFailed,
          fileName: value.filename,
        });
        return;
      }
      onChange(null);
    } catch {
      setState({
        kind: "error",
        message: t.removeFailed,
        fileName: value.filename,
      });
    } finally {
      setRemoving(false);
      setDialog({ kind: "none" });
    }
  }

  /**
   * Replace = DELETE the existing file, then start a fresh upload with
   * the pending file. We do these sequentially: a failed DELETE leaves
   * the existing file in place and surfaces an error; a successful
   * DELETE clears `value` and triggers a fresh startUpload.
   */
  async function performReplace(pendingFile: File) {
    if (!value) {
      void startUpload(pendingFile);
      return;
    }
    try {
      const res = await fetch(
        `/api/register/${eventSlug}/files/${value.fileId}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      if (!res.ok && res.status !== 404) {
        setState({
          kind: "error",
          message: t.removeFailed,
          fileName: value.filename,
        });
        return;
      }
      onChange(null);
    } catch {
      setState({
        kind: "error",
        message: t.removeFailed,
        fileName: value.filename,
      });
      return;
    }
    void startUpload(pendingFile);
  }

  // ── Render ──

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        className="hidden"
        onChange={handleFilePicked}
      />

      {finaliseTimedOut && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1">{t.finaliseTimeout}</p>
        </div>
      )}

      {/* State A — no file uploaded, no upload in flight */}
      {!value && state.kind === "idle" && (
        <div className="space-y-2">
          {required && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{t.fileRequiredWarn}</p>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openFilePicker}
          >
            <Paperclip className="mr-2 h-4 w-4" /> {t.uploadCta}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t.acceptedNote(shortExtsLabel, metadata.maxSizeMB)}
          </p>
        </div>
      )}

      {/* State B — uploading */}
      {state.kind === "uploading" && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="truncate font-medium">{state.fileName}</span>
            <span className="text-muted-foreground">
              · {t.bytes(state.sizeBytes)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${state.pct}%` }}
              role="progressbar"
              aria-valuenow={state.pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t.uploadingProgress(state.pct)}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={cancelUpload}
            >
              {t.cancel}
            </Button>
          </div>
        </div>
      )}

      {/* State C — finalising */}
      {state.kind === "finalising" && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="truncate font-medium">{state.fileName}</span>
          <span className="text-muted-foreground">· {t.finalising}</span>
        </div>
      )}

      {/* State D — error */}
      {state.kind === "error" && (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex items-start gap-2 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="font-medium">{t.uploadFailed}</p>
              <p className="text-muted-foreground">{state.message}</p>
              {state.fileName && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {state.fileName}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openFilePicker}
            >
              <Upload className="mr-2 h-4 w-4" /> {t.tryAgain}
            </Button>
          </div>
        </div>
      )}

      {/* State E — uploaded + idle */}
      {value && state.kind === "idle" && (
        <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3">
          <div className="flex items-start gap-2 text-sm text-emerald-900">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{t.fileUploadedOk}</p>
              <p className="text-muted-foreground">
                <span className="font-medium">{value.filename}</span>
                {" · "}
                {t.bytes(value.sizeBytes)}
                {" · "}
                {new Date(value.uploadedAt).toLocaleString(tag)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openFilePicker}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> {t.replaceCta}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDialog({ kind: "removeConfirm" })}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" /> {t.removeCta}
            </Button>
          </div>
        </div>
      )}

      {/* Replace dialog */}
      <Dialog
        open={dialog.kind === "replaceConfirm"}
        onOpenChange={(open) => {
          if (!open) setDialog({ kind: "none" });
        }}
      >
        <DialogContent dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{t.replaceConfirmTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {dialog.kind === "replaceConfirm" && value
              ? t.replaceConfirmBody(value.filename)
              : ""}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialog({ kind: "none" })}
            >
              {t.replaceConfirmNo}
            </Button>
            <Button
              onClick={() => {
                if (dialog.kind === "replaceConfirm") {
                  const file = dialog.pendingFile;
                  setDialog({ kind: "none" });
                  void performReplace(file);
                }
              }}
            >
              {t.replaceConfirmYes}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove dialog */}
      <Dialog
        open={dialog.kind === "removeConfirm"}
        onOpenChange={(open) => {
          if (!open && !removing) setDialog({ kind: "none" });
        }}
      >
        <DialogContent dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{t.removeConfirmTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {value ? t.removeConfirmBody(value.filename) : ""}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialog({ kind: "none" })}
              disabled={removing}
            >
              {t.removeConfirmNo}
            </Button>
            <Button
              variant="destructive"
              onClick={performDelete}
              disabled={removing}
            >
              {removing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {removing ? t.removing : t.removeConfirmYes}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * SDK / fetch error → localised message. Structural clone of
 * receipt-upload-control's describeUploadError — pattern-matches on
 * status + shape rather than instanceof so we don't have to import the
 * @vercel/blob class hierarchy.
 */
function describeUploadError(
  e: unknown,
  t: (typeof STRINGS)[PortalLang]
): string {
  if (e instanceof TypeError) return t.connectionLost;
  if (typeof e === "object" && e !== null) {
    const err = e as { name?: string; message?: string; status?: number };
    if (err.status === 413) return t.tooLargeServer;
    if (err.status === 401 || err.status === 403) return t.cantAuthorize;
    if (err.status && err.status >= 500) return t.serverError;
    if (err.status === 400 && err.message) {
      if (/token/i.test(err.message)) return t.notAvailable;
      return err.message;
    }
  }
  return t.connectionLost;
}

// Re-export for caller convenience; spec's denormalized formData shape
// expects exactly these four fields plus uploadedAt.
export type { AllowedFileMimeType };
