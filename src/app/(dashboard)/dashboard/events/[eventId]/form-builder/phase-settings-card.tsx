"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PhaseOptionsPanel } from "./phase-options-panel";
import type { EmailTemplateOption, Phase } from "./types";

function toDateTimeLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // datetime-local needs YYYY-MM-DDTHH:MM in local time, no timezone.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Settings card for a POST_REGISTRATION phase: bilingual title/description,
// open/close window, required flag, reminder template, per-category
// visibility, and the selectable-options panel.
export function PhaseSettingsCard({
  phase,
  eventId,
  eventCategories,
  multiLanguageEnabled,
  emailTemplates,
  onUpdate,
  onRefetch,
}: {
  phase: Phase;
  eventId: string;
  eventCategories: string[];
  multiLanguageEnabled: boolean;
  emailTemplates: EmailTemplateOption[];
  onUpdate: (patch: Partial<Phase>) => void;
  onRefetch: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState(phase.title);
  const [titleAr, setTitleAr] = useState(phase.titleAr ?? "");
  const [description, setDescription] = useState(phase.description ?? "");
  const [descriptionAr, setDescriptionAr] = useState(
    phase.descriptionAr ?? ""
  );
  const [opensAt, setOpensAt] = useState(toDateTimeLocal(phase.opensAt));
  const [closesAt, setClosesAt] = useState(toDateTimeLocal(phase.closesAt));
  const [isRequired, setIsRequired] = useState(phase.isRequired);
  const [reminderTemplateId, setReminderTemplateId] = useState(
    phase.reminderTemplateId ?? "__none__"
  );
  const [appliesTo, setAppliesTo] = useState<string[]>(
    phase.appliesToCategories ?? []
  );
  const appliesToKey = (phase.appliesToCategories ?? []).join("");

  // Reset local state when the selected phase changes.
  useEffect(() => {
    setTitle(phase.title);
    setTitleAr(phase.titleAr ?? "");
    setDescription(phase.description ?? "");
    setDescriptionAr(phase.descriptionAr ?? "");
    setOpensAt(toDateTimeLocal(phase.opensAt));
    setClosesAt(toDateTimeLocal(phase.closesAt));
    setIsRequired(phase.isRequired);
    setReminderTemplateId(phase.reminderTemplateId ?? "__none__");
    setAppliesTo(phase.appliesToCategories ?? []);
  }, [phase.id, phase.title, phase.titleAr, phase.description, phase.descriptionAr, phase.opensAt, phase.closesAt, phase.isRequired, phase.reminderTemplateId, appliesToKey]);

  // Commit a new applies-to set: optimistic local update + PATCH.
  function commitAppliesTo(next: string[]) {
    setAppliesTo(next);
    onUpdate({ appliesToCategories: next });
  }
  const noCategoriesDefined = eventCategories.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Phase settings · {phase.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stage 2: per-category visibility. Own full-width row at the
            top of the card (kept off the Title row so it never collides
            with the bilingual Title EN/AR 2-col grid). */}
        <div className="space-y-2">
          <Label>Applies to</Label>
          {noCategoriesDefined ? (
            <div className="rounded-md border border-dashed p-3">
              <p className="text-sm text-muted-foreground">
                Define categories in event settings first.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              {appliesTo.length === 0 ? (
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  All categories
                </span>
              ) : (
                appliesTo.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ backgroundColor: "#EEEDFE", color: "#3C3489" }}
                  >
                    {cat}
                    <button
                      type="button"
                      aria-label={`Remove ${cat}`}
                      className="hover:opacity-70"
                      onClick={() =>
                        commitAppliesTo(appliesTo.filter((c) => c !== cat))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-7">
                    <Plus className="mr-1 h-3 w-3" />
                    {appliesTo.length === 0 ? "Restrict" : "Add"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {/* Defined order from Event.categories (open Q1). */}
                  {eventCategories.map((cat) => {
                    const checked = appliesTo.includes(cat);
                    return (
                      <DropdownMenuCheckboxItem
                        key={cat}
                        checked={checked}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={() =>
                          commitAppliesTo(
                            checked
                              ? appliesTo.filter((c) => c !== cat)
                              : [...appliesTo, cat]
                          )
                        }
                      >
                        {cat}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Empty = visible to every attendee. Restricting shows this phase
            only to attendees in the selected categories.
          </p>
        </div>

        <div className={multiLanguageEnabled ? "grid grid-cols-2 gap-4" : ""}>
          <div className="space-y-2">
            <Label>Title (English)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title.trim() && title !== phase.title) {
                  onUpdate({ title: title.trim() });
                }
              }}
            />
          </div>
          {multiLanguageEnabled && (
            <div className="space-y-2">
              <Label>Title (Arabic)</Label>
              <Input
                dir="rtl"
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                onBlur={() => {
                  if (titleAr !== (phase.titleAr ?? "")) {
                    onUpdate({ titleAr: titleAr.trim() || null });
                  }
                }}
              />
            </div>
          )}
        </div>

        <div className={multiLanguageEnabled ? "grid grid-cols-2 gap-4" : ""}>
          <div className="space-y-2">
            <Label>Description (English)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (description !== (phase.description ?? "")) {
                  onUpdate({ description: description.trim() || null });
                }
              }}
              placeholder="Shown to attendees on the portal phase card"
              rows={2}
            />
          </div>
          {multiLanguageEnabled && (
            <div className="space-y-2">
              <Label>Description (Arabic)</Label>
              <Textarea
                dir="rtl"
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                onBlur={() => {
                  if (descriptionAr !== (phase.descriptionAr ?? "")) {
                    onUpdate({
                      descriptionAr: descriptionAr.trim() || null,
                    });
                  }
                }}
                rows={2}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Opens at</Label>
            <Input
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
              onBlur={() => {
                const iso = fromDateTimeLocal(opensAt);
                if (iso !== (phase.opensAt ?? null)) {
                  onUpdate({ opensAt: iso });
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Closes at</Label>
            <Input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              onBlur={() => {
                const iso = fromDateTimeLocal(closesAt);
                if (iso !== (phase.closesAt ?? null)) {
                  onUpdate({ closesAt: iso });
                }
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-md border p-3">
          <Switch
            checked={isRequired}
            onCheckedChange={(c) => {
              setIsRequired(c);
              onUpdate({ isRequired: c });
            }}
          />
          <div>
            <Label className="font-medium">Required phase</Label>
            <p className="text-xs text-muted-foreground">
              Informational only in v1 — surfaces in admin reports. Does not
              block check-in.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Reminder email template</Label>
          <Select
            value={reminderTemplateId}
            onValueChange={(v) => {
              setReminderTemplateId(v);
              onUpdate({
                reminderTemplateId: v === "__none__" ? null : v,
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                — No automatic reminder —
              </SelectItem>
              {emailTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            When set, a single reminder fires automatically the first time the
            dashboard is opened after this phase&apos;s open time. Leave blank
            for manual sending only.
          </p>
        </div>

        {/* Stage 2: selectable-options panel. Purely additive — collapsed by */}
        {/* default unless the phase already has selectionMode != NONE. The */}
        {/* panel manages its own optimistic state; onRefetch is only called  */}
        {/* on 409 conflicts to recover from concurrent edits in another tab. */}
        <PhaseOptionsPanel
          eventId={eventId}
          phase={{
            id: phase.id,
            selectionMode: phase.selectionMode,
            maxSelections: phase.maxSelections,
            allowChangeAfterSubmit: phase.allowChangeAfterSubmit,
            requiresReceiptUpload: phase.requiresReceiptUpload,
            updatedAt: phase.updatedAt,
            options: phase.options,
          }}
          onRefetch={onRefetch}
          multiLanguageEnabled={multiLanguageEnabled}
        />
      </CardContent>
    </Card>
  );
}
