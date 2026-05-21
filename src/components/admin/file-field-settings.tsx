"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_FILE_METADATA,
  FILE_MIME_OPTIONS,
  MAX_FILE_MAX_SIZE_MB,
  MIN_FILE_MAX_SIZE_MB,
  type AllowedFileMimeType,
  type FileFieldMetadata,
} from "@/lib/validations/file-field-metadata";

interface FileFieldSettingsProps {
  /** Current FormField.metadata for a FILE field. May be partial / undefined for legacy rows. */
  value: FileFieldMetadata;
  onChange: (next: FileFieldMetadata) => void;
}

/**
 * Admin-side editor for the FILE field's per-field upload settings.
 * Slots into the form-builder Add and Edit dialogs between the
 * ConditionalEditor and the Options block, rendered only when
 * `field.type === "FILE"`.
 *
 * Persisted into FormField.metadata as `{ maxSizeMB, allowedMimeTypes }`.
 * Zod-validated server-side on the form-field POST/PATCH (Chunk 2);
 * client-side this component is the only writer.
 *
 * Two interactive guards:
 *   - max-size input clamped to [1, 25]; out-of-range values mark the
 *     input border-destructive and (handled upstream by the Save handler)
 *     would block submit.
 *   - the last checked MIME type can't be unchecked. Attempting to do so
 *     ignores the click and surfaces a transient `text-destructive`
 *     message that auto-dismisses after ~3s — matches shadcn form-error
 *     styling used elsewhere in the codebase.
 */
export function FileFieldSettings({ value, onChange }: FileFieldSettingsProps) {
  const maxSize = value.maxSizeMB;
  const allowed = value.allowedMimeTypes;
  const outOfRange =
    !Number.isFinite(maxSize) ||
    maxSize < MIN_FILE_MAX_SIZE_MB ||
    maxSize > MAX_FILE_MAX_SIZE_MB;

  // Transient "you can't uncheck the last one" message. Set on a
  // rejected click; cleared after 3 seconds or on the next state change.
  const [lastCheckboxMsg, setLastCheckboxMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!lastCheckboxMsg) return;
    const t = window.setTimeout(() => setLastCheckboxMsg(null), 3000);
    return () => window.clearTimeout(t);
  }, [lastCheckboxMsg]);

  function handleSizeChange(raw: string) {
    if (raw === "") {
      // Allow the field to be temporarily empty while typing; the
      // outOfRange guard above flags the invalid state.
      onChange({ ...value, maxSizeMB: Number.NaN });
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    onChange({ ...value, maxSizeMB: parsed });
  }

  function toggleMime(mime: AllowedFileMimeType, checked: boolean) {
    const isCurrentlyChecked = allowed.includes(mime);
    if (checked && !isCurrentlyChecked) {
      onChange({ ...value, allowedMimeTypes: [...allowed, mime] });
      setLastCheckboxMsg(null);
      return;
    }
    if (!checked && isCurrentlyChecked) {
      if (allowed.length === 1) {
        // Last-checkbox guard: ignore the click and surface the message.
        setLastCheckboxMsg("At least one file type must be selected.");
        return;
      }
      onChange({
        ...value,
        allowedMimeTypes: allowed.filter((m) => m !== mime),
      });
      setLastCheckboxMsg(null);
    }
  }

  return (
    <div className="space-y-4 border rounded-lg p-3 bg-muted/30">
      <Label className="text-sm font-medium">File upload settings</Label>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground" htmlFor="file-max-size">
          Maximum file size
        </Label>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Input
              id="file-max-size"
              type="number"
              min={MIN_FILE_MAX_SIZE_MB}
              max={MAX_FILE_MAX_SIZE_MB}
              step={1}
              value={Number.isFinite(maxSize) ? maxSize : ""}
              onChange={(e) => handleSizeChange(e.target.value)}
              className={
                "w-20 " + (outOfRange ? "border-destructive" : "")
              }
              aria-invalid={outOfRange || undefined}
            />
            <span className="text-sm text-muted-foreground">MB</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Allowed range: {MIN_FILE_MAX_SIZE_MB}–{MAX_FILE_MAX_SIZE_MB} MB
          </span>
        </div>
        {outOfRange && (
          <p className="text-xs text-destructive">
            Enter a value between {MIN_FILE_MAX_SIZE_MB} and{" "}
            {MAX_FILE_MAX_SIZE_MB}.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          Allowed file types
        </Label>
        <div className="space-y-2">
          {FILE_MIME_OPTIONS.map((opt) => {
            const checked = allowed.includes(opt.mime);
            const id = `file-mime-${opt.mime}`;
            return (
              <div key={opt.mime} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={(c) => toggleMime(opt.mime, c === true)}
                />
                <Label
                  htmlFor={id}
                  className="text-sm font-normal cursor-pointer"
                >
                  {opt.shortLabel}
                </Label>
              </div>
            );
          })}
        </div>
        {lastCheckboxMsg && (
          <p className="text-xs text-destructive" role="status">
            {lastCheckboxMsg}
          </p>
        )}
      </div>
    </div>
  );
}

/** Convenience: returns the editor's initial value for a freshly-created FILE field. */
export function defaultFileFieldMetadata(): FileFieldMetadata {
  return {
    maxSizeMB: DEFAULT_FILE_METADATA.maxSizeMB,
    allowedMimeTypes: [...DEFAULT_FILE_METADATA.allowedMimeTypes],
  };
}
