"use client";

import { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

interface BrandingImageFieldProps {
  eventId: string;
  /** Branding slot — names the blob path on the server. */
  kind: "logo" | "logoWhite" | "favicon";
  label: string;
  value: string;
  onChange: (url: string) => void;
  helpText?: string;
  /** Accept filter for the file picker. */
  accept?: string;
}

/**
 * A branding image input with two ways to set the value: paste a URL (the
 * escape hatch) or upload a file (the primary path). Upload posts to the
 * authenticated branding/upload route, which writes to the public Blob store
 * and returns a CDN URL; we set that URL as the field value. The value is
 * persisted by the page's existing Save button — same as a pasted URL.
 */
export function BrandingImageField({
  eventId,
  kind,
  label,
  value,
  onChange,
  helpText,
  accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml",
}: BrandingImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);

      const res = await fetch(`/api/events/${eventId}/branding/upload`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;

      if (!res.ok || !data?.url) {
        toast.error(data?.error || "Upload failed");
        return;
      }

      onChange(data.url);
      toast.success(`${label} uploaded — remember to Save.`);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      // Reset the picker so re-selecting the same file fires onChange again.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`${kind}-url`}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={`${kind}-url`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste a URL or upload →"
          disabled={uploading}
        />
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          <span className="ml-1.5 hidden sm:inline">
            {uploading ? "Uploading…" : "Upload"}
          </span>
        </Button>
      </div>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {value && (
        <div className="rounded-md border bg-muted/30 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={`${label} preview`}
            className="max-h-16 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
    </div>
  );
}
