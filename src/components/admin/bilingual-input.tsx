"use client";

/**
 * <BilingualInput>
 *
 * Renders the existing English + Arabic input pair plus a single "Translate"
 * button anchored in the header row between the two sub-labels. Click to
 * auto-translate the populated side into the empty side via /api/translate.
 *
 * Layout (matches the Option A mockup approved for the PhaseOption editor):
 *
 *     Label (English)        [⇄ Translate →]        Label (Arabic)
 *     [EN input]                                    [AR input dir=rtl]
 *     ⚠ Auto-translated, low confidence — please review     ← when applicable
 *
 * Behavior rules:
 *   - Button enabled iff exactly one side has content. Both empty or both
 *     filled → disabled (no ambiguity to resolve, no risk of overwriting
 *     existing translations).
 *   - Direction inferred from which side has content. Arrow icon flips
 *     accordingly; text stays "Translate".
 *   - Spinner replaces the icon during the API call; both fields stay
 *     editable while waiting.
 *   - Low-confidence and error results show a hint below the grid that
 *     auto-dismisses after 5 seconds or when either field is edited.
 *
 * The AR field is NOT gated on the multiLanguage module flag inside this
 * component — that's the caller's call (see receipt fields in the
 * PhaseOption editor, which switch to a plain <Input> when the module is
 * off). Keeps the primitive reusable across surfaces with different gates.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowRightLeft, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { TranslateResult } from "@/lib/services/translation.service";

type Direction = "en-to-ar" | "ar-to-en" | "none";

export interface BilingualInputProps {
  /** Caption for the field, e.g. "Label" or "Description". Sub-labels are
   *  rendered as "{label} (English)" and "{label} (Arabic)". */
  label: string;
  valueEn: string;
  valueAr: string;
  onChangeEn: (next: string) => void;
  onChangeAr: (next: string) => void;
  /** Optional commit callbacks fired onBlur, after the local value has
   *  settled. Useful for the PhaseOption editor's optimistic-patch pattern,
   *  which commits on blur rather than on every keystroke. */
  onBlurEn?: () => void;
  onBlurAr?: () => void;
  placeholderEn?: string;
  placeholderAr?: string;
  /** Render <Textarea> instead of <Input> for both sides. */
  multiline?: boolean;
  /** Forwarded to <Textarea> when multiline. */
  rows?: number;
  disabled?: boolean;
  /** Optional id prefix for the inputs (a11y); rendered as "<idPrefix>-en"
   *  and "<idPrefix>-ar". Falls back to a generated id if omitted. */
  idPrefix?: string;
}

interface HintState {
  kind: "low_confidence" | "error";
  message: string;
  /** Which side just got filled — used so an edit to that side dismisses
   *  the hint, but an edit to the other side does not. */
  filledSide: "en" | "ar";
}

const HINT_AUTO_DISMISS_MS = 5_000;

export function BilingualInput({
  label,
  valueEn,
  valueAr,
  onChangeEn,
  onChangeAr,
  onBlurEn,
  onBlurAr,
  placeholderEn,
  placeholderAr,
  multiline = false,
  rows = 2,
  disabled = false,
  idPrefix,
}: BilingualInputProps) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [hint, setHint] = useState<HintState | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enFilled = valueEn.trim().length > 0;
  const arFilled = valueAr.trim().length > 0;
  const direction: Direction =
    enFilled && !arFilled
      ? "en-to-ar"
      : !enFilled && arFilled
      ? "ar-to-en"
      : "none";

  const canTranslate = direction !== "none" && !disabled && !isTranslating;

  const clearHintTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  // Hint auto-dismiss: 5 seconds after it appears.
  useEffect(() => {
    if (!hint) return;
    clearHintTimer();
    dismissTimerRef.current = setTimeout(
      () => setHint(null),
      HINT_AUTO_DISMISS_MS
    );
    return clearHintTimer;
  }, [hint, clearHintTimer]);

  // Cleanup on unmount.
  useEffect(() => clearHintTimer, [clearHintTimer]);

  const handleTranslate = useCallback(async () => {
    if (direction === "none") return;

    const from = direction === "en-to-ar" ? "en" : "ar";
    const to = direction === "en-to-ar" ? "ar" : "en";
    const source = direction === "en-to-ar" ? valueEn : valueAr;
    const filledSide: "en" | "ar" = direction === "en-to-ar" ? "ar" : "en";

    setIsTranslating(true);
    setHint(null);

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strings: [source], from, to }),
      });

      if (!res.ok) {
        let message = `Translation failed (HTTP ${res.status})`;
        if (res.status === 429) {
          message =
            "Too many translation requests. Please wait a moment and try again.";
        } else {
          try {
            const body = (await res.json()) as { error?: string };
            if (body?.error) message = body.error;
          } catch {
            // ignore parse failure; use the default message
          }
        }
        setHint({
          kind: "error",
          message: `Translation failed: ${message}. Please fill manually.`,
          filledSide,
        });
        return;
      }

      const data = (await res.json()) as { results?: TranslateResult[] };
      const result = data.results?.[0];
      if (!result) {
        setHint({
          kind: "error",
          message: "Translation failed: empty response. Please fill manually.",
          filledSide,
        });
        return;
      }

      if (result.status === "error") {
        setHint({
          kind: "error",
          message: `Translation failed: ${result.error}. Please fill manually.`,
          filledSide,
        });
        return;
      }

      // Both `ok` and `low_confidence` deliver a translatedText; the only
      // difference is whether we show the warning hint.
      const translated = result.translatedText;
      if (filledSide === "ar") onChangeAr(translated);
      else onChangeEn(translated);

      if (result.status === "low_confidence") {
        setHint({
          kind: "low_confidence",
          message: "Auto-translated, low confidence — please review.",
          filledSide,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setHint({
        kind: "error",
        message: `Translation failed: ${message}. Please fill manually.`,
        filledSide,
      });
    } finally {
      setIsTranslating(false);
    }
  }, [direction, valueEn, valueAr, onChangeEn, onChangeAr]);

  // Dismiss the hint when the user edits the side that was auto-filled. An
  // edit to the other side (the source) doesn't dismiss — they may still
  // want to see the warning about the translation that just landed.
  const handleChangeEn = useCallback(
    (next: string) => {
      onChangeEn(next);
      if (hint && hint.filledSide === "en") setHint(null);
    },
    [onChangeEn, hint]
  );
  const handleChangeAr = useCallback(
    (next: string) => {
      onChangeAr(next);
      if (hint && hint.filledSide === "ar") setHint(null);
    },
    [onChangeAr, hint]
  );

  const arrowIcon =
    direction === "en-to-ar" ? (
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    ) : direction === "ar-to-en" ? (
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
    ) : (
      <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
    );

  const generatedId = useId();
  const baseId = idPrefix ?? generatedId;
  const enId = `${baseId}-en`;
  const arId = `${baseId}-ar`;

  return (
    <div className="space-y-2">
      {/* Header row: three columns at sm+, stacks vertically on narrower
          screens. Sub-labels left/right, Translate button centered. */}
      <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <Label htmlFor={enId} className="text-sm font-medium">
          {label} (English)
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs justify-self-center"
          onClick={handleTranslate}
          disabled={!canTranslate}
          aria-label={
            direction === "en-to-ar"
              ? "Translate English to Arabic"
              : direction === "ar-to-en"
              ? "Translate Arabic to English"
              : "Translate (fill one side first)"
          }
          title={
            direction === "none"
              ? enFilled && arFilled
                ? "Both sides filled — clear one to retranslate"
                : "Fill one side first"
              : undefined
          }
        >
          {isTranslating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            arrowIcon
          )}
          <span className="ml-1">Translate</span>
        </Button>
        <Label
          htmlFor={arId}
          className="text-sm font-medium sm:justify-self-end"
        >
          {label} (Arabic)
        </Label>
      </div>

      {/* Inputs row: existing two-column grid, EN left, AR right. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          {multiline ? (
            <Textarea
              id={enId}
              rows={rows}
              value={valueEn}
              onChange={(e) => handleChangeEn(e.target.value)}
              onBlur={onBlurEn}
              placeholder={placeholderEn}
              disabled={disabled}
            />
          ) : (
            <Input
              id={enId}
              value={valueEn}
              onChange={(e) => handleChangeEn(e.target.value)}
              onBlur={onBlurEn}
              placeholder={placeholderEn}
              disabled={disabled}
            />
          )}
        </div>
        <div>
          {multiline ? (
            <Textarea
              id={arId}
              dir="rtl"
              rows={rows}
              value={valueAr}
              onChange={(e) => handleChangeAr(e.target.value)}
              onBlur={onBlurAr}
              placeholder={placeholderAr}
              disabled={disabled}
            />
          ) : (
            <Input
              id={arId}
              dir="rtl"
              value={valueAr}
              onChange={(e) => handleChangeAr(e.target.value)}
              onBlur={onBlurAr}
              placeholder={placeholderAr}
              disabled={disabled}
            />
          )}
        </div>
      </div>

      {hint && (
        <p
          className={
            hint.kind === "error"
              ? "text-xs text-destructive"
              : "text-xs text-amber-600 dark:text-amber-500"
          }
          role="status"
        >
          {hint.kind === "low_confidence" ? "⚠ " : ""}
          {hint.message}
        </p>
      )}
    </div>
  );
}

