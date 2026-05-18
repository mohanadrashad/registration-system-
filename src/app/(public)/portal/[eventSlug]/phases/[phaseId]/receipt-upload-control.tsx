"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  AlertCircle,
  Check,
  Eye,
  Loader2,
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
import {
  localeTag,
  pickText as _pickText,
  type PortalLang,
} from "@/lib/portal/i18n";
// We only need the language type for the strings table; pickText is used
// elsewhere on this page but not in this component.
void _pickText;

// Mirror of receipt.service constants so the client enforces the same
// thresholds before bytes leave the browser. Duplicated deliberately —
// the server still validates, but a client-side check is a much better
// UX than waiting for a 400 after the user has already started.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const STRINGS = {
  en: {
    uploadCta: "Upload receipt",
    tryAgain: "Try again",
    replaceCta: "Replace",
    viewCta: "View",
    deleteCta: "Delete",
    uploadingProgress: (pct: number) => `Uploading… ${pct}%`,
    uploading: "Uploading…",
    finalising: "Finalising…",
    finaliseTimeout:
      "Upload taking longer than expected. Refresh in a moment to see the latest.",
    cancel: "Cancel",
    acceptedNote: "Accepted: JPG, PNG, PDF · Max 10 MB",
    receiptRequiredWarn: "Receipt required to complete this phase",
    receiptUploadedOk: "Receipt uploaded",
    uploadFailed: "Upload failed",
    connectionLost: "Connection lost during transfer. Please try again.",
    wrongType: "Only JPG, PNG, or PDF files are accepted.",
    tooLarge: (mb: number) =>
      `Selected file is ${mb.toFixed(1)} MB. Max size is 10 MB.`,
    tooLargeServer: "File too large for the server. Try a smaller file.",
    cantAuthorize:
      "Couldn't authorise the upload. Please refresh and try again.",
    serverError: "The server hit an error. Please try again in a moment.",
    notAvailable:
      "Receipt upload isn't available right now. Please contact your organizer.",
    replaceConfirmTitle: "Replace receipt?",
    replaceConfirmBody: (name: string) =>
      `"${name}" will be deleted and replaced with the new file. This can't be undone.`,
    replaceConfirmYes: "Replace",
    replaceConfirmNo: "Keep current",
    deleteConfirmTitle: "Delete receipt?",
    deleteConfirmBody: (name: string) =>
      `"${name}" will be deleted. You can upload a new one later.`,
    deleteConfirmYes: "Delete",
    deleteConfirmNo: "Keep",
    deleting: "Deleting…",
    deletedJustNow: "Receipt deleted.",
    deleteFailed: "Couldn't delete the receipt. Please try again.",
    deleteNotAllowed:
      "This phase doesn't allow changes once submitted. Contact your organizer.",
    bytes: (n: number) => {
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    },
  },
  ar: {
    uploadCta: "رفع الإيصال",
    tryAgain: "حاول مرة أخرى",
    replaceCta: "استبدال",
    viewCta: "عرض",
    deleteCta: "حذف",
    uploadingProgress: (pct: number) => `جارٍ الرفع… ${pct}%`,
    uploading: "جارٍ الرفع…",
    finalising: "جارٍ الإنهاء…",
    finaliseTimeout:
      "الرفع يستغرق وقتًا أطول من المعتاد. حدّث الصفحة بعد لحظات لرؤية أحدث حالة.",
    cancel: "إلغاء",
    acceptedNote: "الصيغ المقبولة: JPG, PNG, PDF · الحد الأقصى 10 ميجابايت",
    receiptRequiredWarn: "يلزم رفع الإيصال لإكمال هذه المرحلة",
    receiptUploadedOk: "تم رفع الإيصال",
    uploadFailed: "فشل الرفع",
    connectionLost: "انقطع الاتصال أثناء النقل. حاول مرة أخرى.",
    wrongType: "يُقبل فقط ملفات JPG وPNG وPDF.",
    tooLarge: (mb: number) =>
      `حجم الملف ${mb.toFixed(1)} ميجابايت. الحد الأقصى 10 ميجابايت.`,
    tooLargeServer: "الملف أكبر مما يستوعبه الخادم. جرّب ملفًا أصغر.",
    cantAuthorize:
      "تعذّر تفويض الرفع. يُرجى تحديث الصفحة والمحاولة مرة أخرى.",
    serverError:
      "حدث خطأ في الخادم. يُرجى المحاولة مرة أخرى بعد لحظات.",
    notAvailable:
      "رفع الإيصال غير متاح حالياً. يُرجى التواصل مع منظم الفعالية.",
    replaceConfirmTitle: "استبدال الإيصال؟",
    replaceConfirmBody: (name: string) =>
      `سيتم حذف "${name}" واستبداله بالملف الجديد. لا يمكن التراجع.`,
    replaceConfirmYes: "استبدال",
    replaceConfirmNo: "إبقاء الحالي",
    deleteConfirmTitle: "حذف الإيصال؟",
    deleteConfirmBody: (name: string) =>
      `سيتم حذف "${name}". يمكنك رفع إيصال جديد لاحقًا.`,
    deleteConfirmYes: "حذف",
    deleteConfirmNo: "إبقاء",
    deleting: "جارٍ الحذف…",
    deletedJustNow: "تم حذف الإيصال.",
    deleteFailed: "تعذّر حذف الإيصال. حاول مرة أخرى.",
    deleteNotAllowed:
      "لا تسمح هذه المرحلة بالتعديل بعد الإرسال. تواصل مع منظم الفعالية.",
    bytes: (n: number) => {
      if (n < 1024) return `${n} ب`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
      return `${(n / (1024 * 1024)).toFixed(1)} م.ب`;
    },
  },
} as const;

export interface PortalReceipt {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface ReceiptUploadControlProps {
  eventSlug: string;
  phaseId: string;
  optionId: string;
  /** Existing linked receipt, if any. Drives whether we show the "uploaded" state. */
  existingReceipt: PortalReceipt | null;
  /** When true, Replace and Delete buttons render. Maps to phase.allowChangeAfterSubmit. */
  allowReplace: boolean;
  /** Whether the option / phase requires a receipt — drives the warning banner. */
  required: boolean;
  lang: PortalLang;
  /** Called after a successful upload completes (post finalising). Parent should refetch. */
  onUploaded: () => Promise<void> | void;
  /** Called after a successful delete. Parent should refetch. */
  onDeleted: () => Promise<void> | void;
}

/**
 * Self-contained file picker + upload + progress + error UI for one
 * receipt slot. Used in two places: the SubmittedSelectionCard
 * (per-selection row) and the ExternalBookingCard (paired with an
 * option dropdown). Both pass the same prop shape — this component
 * doesn't know which mode it's serving.
 *
 * Upload flow:
 *   1. User clicks "Upload receipt" → file picker opens.
 *   2. Client-side type + size check (10 MB / JPG/PNG/PDF). Bad files
 *      get a friendly message; no bytes leave the browser.
 *   3. SDK `upload()` posts a token request to our handleUploadUrl,
 *      then uploads bytes directly to Vercel Blob.
 *   4. SDK resolves when the bytes hit blob (BEFORE our webhook fires).
 *   5. Component transitions to "finalising" and calls onUploaded so
 *      the parent refetches phase data. The webhook usually fires
 *      within ~1s; by the time the parent's refetch returns, the new
 *      receipt is in the DB.
 *   6. If the webhook is delayed and the receipt isn't in the parent's
 *      refetch, the parent decides whether to retry. This component
 *      just hands off and waits.
 */
export function ReceiptUploadControl({
  eventSlug,
  phaseId,
  optionId,
  existingReceipt,
  allowReplace,
  required,
  lang,
  onUploaded,
  onDeleted,
}: ReceiptUploadControlProps) {
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

  // When polling for the new receipt to appear after upload, we read the
  // latest `existingReceipt` prop via a ref. The async polling loop sits
  // inside a closure that captured the prop at startUpload time; without
  // a ref we'd never see the updated value the parent re-renders us with.
  const existingReceiptRef = useRef(existingReceipt);
  useEffect(() => {
    existingReceiptRef.current = existingReceipt;
  }, [existingReceipt]);

  // After a finalise timeout we show a soft "refresh in a moment" banner
  // instead of staying in "finalising" forever. The user can keep working
  // around the timeout case — refresh resolves it cleanly. The banner
  // auto-clears when the parent eventually surfaces a newer receipt id
  // (handles "webhook fired late but did fire").
  const [finaliseTimedOut, setFinaliseTimedOut] = useState(false);
  useEffect(() => {
    setFinaliseTimedOut(false);
  }, [existingReceipt?.id]);

  // The dialog state for both replace-confirmation and delete-
  // confirmation. Kept as a single discriminated value so only one
  // dialog can be open at a time.
  type DialogState =
    | { kind: "none" }
    | { kind: "replaceConfirm"; pendingFile: File }
    | { kind: "deleteConfirm" };
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [deleting, setDeleting] = useState(false);

  function openFilePicker() {
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }

  // Validate before bytes leave the browser. Returns null on success;
  // returns the localised error message on failure.
  function validateClientSide(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type)) return t.wrongType;
    if (file.size > MAX_SIZE_BYTES)
      return t.tooLarge(file.size / (1024 * 1024));
    return null;
  }

  /**
   * The Vercel Blob webhook fires server-to-server AFTER the SDK's
   * `upload()` resolves, so a single refetch right after upload can
   * easily race ahead of the DB write — the parent ends up showing the
   * pre-upload receipt state and "View" points at a receipt the
   * webhook has just deleted (the original Stage-4 bug report).
   *
   * To fix this we poll: ask the parent to refetch, then re-read the
   * `existingReceipt` prop via the ref (set above in a useEffect) and
   * check whether the receipt id is now different from what we had
   * before the upload. If yes — the webhook fired, parent has fresh
   * state, we're done. If no — wait and retry, up to ~10 seconds.
   *
   * Three cases the predicate covers, with `oldReceiptId` set just
   * before the upload:
   *
   *   - Fresh upload (no previous receipt):   oldReceiptId === null
   *     → wait until current is non-null
   *   - Replace upload (had a previous one):  oldReceiptId === OLD_ID
   *     → wait until current.id !== OLD_ID
   *   - Upload after a delete:                oldReceiptId === null
   *     → same as fresh
   */
  async function waitForReceiptUpdate(oldReceiptId: string | null) {
    const MAX_ATTEMPTS = 12; // ~10s budget at ~800ms intervals
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await onUploaded(); // parent refetches; will re-render us
      // Yield long enough for React to commit + run our prop-sync
      // effect that updates existingReceiptRef. 50ms is generous;
      // refetch is the dominant cost.
      await new Promise((r) => setTimeout(r, 50));

      const current = existingReceiptRef.current;
      if (current && current.id !== oldReceiptId) return true;

      if (i < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    return false; // timed out — webhook never fired (or fired late)
  }

  async function startUpload(
    file: File,
    replacePreviousReceiptId: string | null
  ) {
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

    // Snapshot the receipt id BEFORE the upload starts. The polling
    // loop uses this as the threshold to detect that the new receipt
    // has materialised in the DB.
    const oldReceiptId = existingReceiptRef.current?.id ?? null;

    try {
      await upload(file.name, file, {
        access: "private",
        handleUploadUrl: `/api/portal/${eventSlug}/phases/${phaseId}/receipts/upload`,
        contentType: file.type,
        clientPayload: JSON.stringify({
          optionId,
          replacePreviousReceiptId,
        }),
        abortSignal: controller.signal,
        onUploadProgress: (event) => {
          setState((cur) => {
            if (cur.kind !== "uploading") return cur;
            return { ...cur, pct: Math.min(99, Math.round(event.percentage)) };
          });
        },
      });

      // SDK resolved — bytes are in blob. Vercel's webhook fires next
      // (server-to-server, retried up to 5 times for non-200). Poll
      // the parent until the new receipt appears, then transition to
      // idle — at which point the existingReceipt prop on the next
      // render is the freshly-uploaded one.
      setState({ kind: "finalising", fileName: file.name });
      try {
        const updated = await waitForReceiptUpdate(oldReceiptId);
        if (!updated) {
          // Webhook didn't fire within the budget. Surface a soft
          // banner rather than blocking the UI forever — a manual
          // refresh recovers cleanly. The next interaction (Replace
          // / Delete / refresh) re-fetches automatically.
          setFinaliseTimedOut(true);
        }
      } finally {
        abortRef.current = null;
        setState({ kind: "idle" });
      }
    } catch (e) {
      abortRef.current = null;
      // Aborted by the user — silent reset, no error banner.
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

    // Replace confirmation: if there's an existing receipt, ask first.
    // The actual upload kicks off only after the user confirms.
    if (existingReceipt) {
      setDialog({ kind: "replaceConfirm", pendingFile: file });
      return;
    }
    void startUpload(file, null);
  }

  function cancelUpload() {
    abortRef.current?.abort();
  }

  async function performDelete() {
    if (!existingReceipt) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/portal/${eventSlug}/receipts/${existingReceipt.id}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.code === "RECEIPT_DELETE_NOT_ALLOWED") {
          setState({
            kind: "error",
            message: t.deleteNotAllowed,
            fileName: existingReceipt.originalName,
          });
        } else {
          setState({
            kind: "error",
            message: t.deleteFailed,
            fileName: existingReceipt.originalName,
          });
        }
        return;
      }
      await onDeleted();
    } catch {
      setState({
        kind: "error",
        message: t.deleteFailed,
        fileName: existingReceipt.originalName,
      });
    } finally {
      setDeleting(false);
      setDialog({ kind: "none" });
    }
  }

  // ── Render ──

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        className="hidden"
        onChange={handleFilePicked}
      />

      {/* Soft timeout banner — shown when the post-upload polling
          gave up. Auto-clears the moment the parent surfaces a newer
          receipt id (see the useEffect on existingReceipt?.id). */}
      {finaliseTimedOut && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1">{t.finaliseTimeout}</p>
        </div>
      )}

      {/* State A — no existing receipt, no upload in flight: prompt + button */}
      {!existingReceipt && state.kind === "idle" && (
        <div className="space-y-2">
          {required && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{t.receiptRequiredWarn}</p>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openFilePicker}
          >
            <Upload className="mr-2 h-4 w-4" /> {t.uploadCta}
          </Button>
          <p className="text-xs text-muted-foreground">{t.acceptedNote}</p>
        </div>
      )}

      {/* State B — uploading in progress: filename + progress + cancel */}
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

      {/* State C — finalising (waiting for server-side webhook + refetch) */}
      {state.kind === "finalising" && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="truncate font-medium">{state.fileName}</span>
          <span className="text-muted-foreground">· {t.finalising}</span>
        </div>
      )}

      {/* State D — error: show friendly message + retry */}
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

      {/* State E — existing receipt + idle: success view with view/replace/delete */}
      {existingReceipt && state.kind === "idle" && (
        <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3">
          <div className="flex items-start gap-2 text-sm text-emerald-900">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{t.receiptUploadedOk}</p>
              <p className="text-muted-foreground">
                <span className="font-medium">
                  {existingReceipt.originalName}
                </span>
                {" · "}
                {t.bytes(existingReceipt.sizeBytes)}
                {" · "}
                {new Date(existingReceipt.uploadedAt).toLocaleString(tag)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
            >
              <a
                href={`/api/portal/${eventSlug}/receipts/${existingReceipt.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Eye className="mr-2 h-4 w-4" /> {t.viewCta}
              </a>
            </Button>
            {allowReplace && (
              <>
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
                  onClick={() => setDialog({ kind: "deleteConfirm" })}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> {t.deleteCta}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Replace-confirmation dialog */}
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
            {dialog.kind === "replaceConfirm" && existingReceipt
              ? t.replaceConfirmBody(existingReceipt.originalName)
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
                if (
                  dialog.kind === "replaceConfirm" &&
                  existingReceipt
                ) {
                  const file = dialog.pendingFile;
                  setDialog({ kind: "none" });
                  void startUpload(file, existingReceipt.id);
                }
              }}
            >
              {t.replaceConfirmYes}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete-confirmation dialog */}
      <Dialog
        open={dialog.kind === "deleteConfirm"}
        onOpenChange={(open) => {
          if (!open && !deleting) setDialog({ kind: "none" });
        }}
      >
        <DialogContent dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{t.deleteConfirmTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {existingReceipt ? t.deleteConfirmBody(existingReceipt.originalName) : ""}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialog({ kind: "none" })}
              disabled={deleting}
            >
              {t.deleteConfirmNo}
            </Button>
            <Button
              variant="destructive"
              onClick={performDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? t.deleting : t.deleteConfirmYes}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Translate SDK / fetch errors into localised messages. The
 * @vercel/blob client throws `BlobAccessError` (token issues),
 * `BlobError` (size/type rejection at the platform level), and the
 * standard fetch failures. Anything we don't recognise falls back to
 * a generic message.
 */
function describeUploadError(
  e: unknown,
  t: (typeof STRINGS)[PortalLang]
): string {
  if (e instanceof TypeError) {
    // Network-level failure (offline, DNS, connection reset).
    return t.connectionLost;
  }
  if (typeof e === "object" && e !== null) {
    // We pattern-match by shape rather than instanceof so we don't have
    // to import the entire @vercel/blob class hierarchy on the client.
    const err = e as {
      name?: string;
      message?: string;
      status?: number;
    };
    if (err.status === 413) return t.tooLargeServer;
    if (err.status === 401 || err.status === 403)
      return t.cantAuthorize;
    if (err.status && err.status >= 500) return t.serverError;
    if (err.status === 400 && err.message) {
      // BLOB_READ_WRITE_TOKEN missing surfaces as a "Vercel Blob: No
      // token found" or similar. Detect and rewrite to a user-friendly
      // message so we don't leak env-var details to attendees.
      if (/token/i.test(err.message)) return t.notAvailable;
      return err.message;
    }
  }
  return t.connectionLost;
}
