"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  Wand2,
  Type,
  Mail,
  Phone,
  AlignLeft,
  Hash,
  ChevronDownIcon,
  CheckSquare,
  Circle,
  Calendar,
  Clock,
  Globe,
  Upload,
  EyeOff,
  Heading,
  Minus,
  FileText,
  ArrowRightLeft,
  Lock,
  X,
} from "lucide-react";
import { FieldType, FieldWidth, PhaseType } from "@prisma/client";
import type { PhaseSelectionMode } from "@prisma/client";
import {
  PhaseOptionsPanel,
  type PhaseOption,
} from "./phase-options-panel";

interface FieldOption {
  value: string;
  label: string;
  labelAr?: string;
}

interface ConditionalRule {
  showIf: {
    field: string;
    operator: "equals" | "notEquals" | "contains";
    value: string | boolean;
  };
}

interface FormField {
  id: string;
  name: string;
  label: string;
  labelAr?: string;
  type: FieldType;
  placeholder?: string;
  required: boolean;
  order: number;
  width: FieldWidth;
  isSystem: boolean;
  isActive: boolean;
  options?: FieldOption[];
  stepId: string;
  conditional?: ConditionalRule | null;
}

interface Step {
  id: string;
  title: string;
  order: number;
  fields: FormField[];
}

interface Phase {
  id: string;
  type: PhaseType;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  order: number;
  steps: Step[];
  opensAt?: string | null;
  closesAt?: string | null;
  isRequired: boolean;
  reminderTemplateId?: string | null;
  // Stage 2 selection fields. Always present on the wire — defaults to
  // NONE/1/false/false on phases that don't use the Options panel.
  selectionMode: PhaseSelectionMode;
  maxSelections: number;
  allowChangeAfterSubmit: boolean;
  requiresReceiptUpload: boolean;
  // Stage 2 (category phases): empty = visible to everyone; non-empty
  // = only attendees whose category is in this list.
  appliesToCategories: string[];
  // Concurrency token for the phase row. Used by the Options panel as
  // expectedUpdatedAt on its phase-level PATCH calls.
  updatedAt: string;
  options: PhaseOption[];
}

interface ModulesPayload {
  postRegPhases?: boolean;
  multiLanguage?: boolean;
}

interface EmailTemplateOption {
  id: string;
  name: string;
}

const OPTION_FIELD_TYPES: FieldType[] = ["SELECT", "MULTISELECT", "RADIO"];

const FIELD_ICONS: Record<FieldType, React.ReactNode> = {
  TEXT: <Type className="h-4 w-4" />,
  EMAIL: <Mail className="h-4 w-4" />,
  PHONE: <Phone className="h-4 w-4" />,
  TEXTAREA: <AlignLeft className="h-4 w-4" />,
  NUMBER: <Hash className="h-4 w-4" />,
  SELECT: <ChevronDownIcon className="h-4 w-4" />,
  MULTISELECT: <CheckSquare className="h-4 w-4" />,
  RADIO: <Circle className="h-4 w-4" />,
  CHECKBOX: <CheckSquare className="h-4 w-4" />,
  DATE: <Calendar className="h-4 w-4" />,
  TIME: <Clock className="h-4 w-4" />,
  DATETIME: <Calendar className="h-4 w-4" />,
  COUNTRY: <Globe className="h-4 w-4" />,
  PHONE_COUNTRY: <Phone className="h-4 w-4" />,
  FILE: <Upload className="h-4 w-4" />,
  HIDDEN: <EyeOff className="h-4 w-4" />,
  HEADING: <Heading className="h-4 w-4" />,
  DIVIDER: <Minus className="h-4 w-4" />,
  PARAGRAPH: <FileText className="h-4 w-4" />,
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  TEXT: "Text Input",
  EMAIL: "Email",
  PHONE: "Phone",
  TEXTAREA: "Long Text",
  NUMBER: "Number",
  SELECT: "Dropdown",
  MULTISELECT: "Multi-Select",
  RADIO: "Radio Buttons",
  CHECKBOX: "Checkbox",
  DATE: "Date",
  TIME: "Time",
  DATETIME: "Date & Time",
  COUNTRY: "Country",
  PHONE_COUNTRY: "Phone with Country",
  FILE: "File Upload",
  HIDDEN: "Hidden",
  HEADING: "Section Heading",
  DIVIDER: "Divider",
  PARAGRAPH: "Info Text",
};

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

function ConditionalEditor({
  value,
  onChange,
  candidateFields,
}: {
  value: ConditionalRule | null | undefined;
  onChange: (next: ConditionalRule | null) => void;
  candidateFields: FormField[];
}) {
  const enabled = !!value?.showIf?.field;
  const target = candidateFields.find((f) => f.name === value?.showIf?.field);

  function toggle(on: boolean) {
    if (on) {
      const first = candidateFields[0];
      if (!first) {
        // No other fields exist to depend on yet; do nothing.
        return;
      }
      onChange({
        showIf: {
          field: first.name,
          operator: "equals",
          value: first.type === "CHECKBOX" ? true : "",
        },
      });
    } else {
      onChange(null);
    }
  }

  function patch(next: Partial<ConditionalRule["showIf"]>) {
    if (!value?.showIf) return;
    onChange({ showIf: { ...value.showIf, ...next } });
  }

  return (
    <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <Switch checked={enabled} onCheckedChange={toggle} />
        <Label className="text-sm font-medium">
          Show this field only if…
        </Label>
      </div>
      {enabled && value?.showIf && (
        <div className="space-y-2 pl-2">
          {candidateFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              You need at least one other field on the event to use a
              condition.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Depends on field
                  </Label>
                  <Select
                    value={value.showIf.field}
                    onValueChange={(v) => {
                      const next = candidateFields.find((f) => f.name === v);
                      patch({
                        field: v,
                        // Reset value when field type changes so we don't
                        // leave stale strings on a checkbox dependency.
                        value: next?.type === "CHECKBOX" ? true : "",
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {candidateFields.map((f) => (
                        <SelectItem key={f.id} value={f.name}>
                          {f.label}
                          <span className="text-xs text-muted-foreground ml-2">
                            ({f.name})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Operator
                  </Label>
                  <Select
                    value={value.showIf.operator}
                    onValueChange={(v) =>
                      patch({
                        operator: v as "equals" | "notEquals" | "contains",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">equals</SelectItem>
                      <SelectItem value="notEquals">does not equal</SelectItem>
                      <SelectItem value="contains">contains</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Value</Label>
                {target?.type === "CHECKBOX" ? (
                  <Select
                    value={String(value.showIf.value)}
                    onValueChange={(v) => patch({ value: v === "true" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">checked</SelectItem>
                      <SelectItem value="false">unchecked</SelectItem>
                    </SelectContent>
                  </Select>
                ) : target?.options && target.options.length > 0 ? (
                  <Select
                    value={String(value.showIf.value)}
                    onValueChange={(v) => patch({ value: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select expected value…" />
                    </SelectTrigger>
                    <SelectContent>
                      {target.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={String(value.showIf.value ?? "")}
                    onChange={(e) => patch({ value: e.target.value })}
                    placeholder="Expected value"
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PhaseSettingsCard({
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
  const appliesToKey = (phase.appliesToCategories ?? []).join("");

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

export default function FormBuilderPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [phases, setPhases] = useState<Phase[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>("");
  const [selectedStepId, setSelectedStepId] = useState<string>("");
  const [postRegEnabled, setPostRegEnabled] = useState(false);
  const [multiLanguageEnabled, setMultiLanguageEnabled] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateOption[]>([]);
  const [eventSlug, setEventSlug] = useState<string>("");
  const [eventCategories, setEventCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newField, setNewField] = useState({
    name: "",
    label: "",
    type: "TEXT" as FieldType,
    required: false,
    width: "FULL" as FieldWidth,
    options: [] as FieldOption[],
    conditional: null as ConditionalRule | null,
  });
  const [newOption, setNewOption] = useState({ value: "", label: "" });
  const [editOption, setEditOption] = useState({ value: "", label: "" });

  // Inline rename state — null when not editing, draft string when editing.
  const [renamingPhaseId, setRenamingPhaseId] = useState<string | null>(null);
  const [renamingPhaseDraft, setRenamingPhaseDraft] = useState("");
  const [renamingStepId, setRenamingStepId] = useState<string | null>(null);
  const [renamingStepDraft, setRenamingStepDraft] = useState("");
  const [newPhaseTitle, setNewPhaseTitle] = useState("");
  const [showAddPhase, setShowAddPhase] = useState(false);

  const fetchEverything = useCallback(async () => {
    try {
      const [phasesRes, eventRes, modulesRes, templatesRes] = await Promise.all([
        fetch(`/api/events/${eventId}/phases`),
        fetch(`/api/events/${eventId}`),
        fetch(`/api/events/${eventId}/modules`),
        fetch(`/api/events/${eventId}/emails/templates`),
      ]);

      if (phasesRes.ok) {
        const data: Phase[] = await phasesRes.json();
        setPhases(data);
        setSelectedPhaseId((current) => {
          const stillExists = data.find((p) => p.id === current);
          return stillExists ? current : data[0]?.id ?? "";
        });
      }
      if (eventRes.ok) {
        const event = await eventRes.json();
        setEventSlug(event.slug);
        setEventCategories(
          Array.isArray(event.categories) ? event.categories : []
        );
      }
      if (modulesRes.ok) {
        const modules: ModulesPayload = await modulesRes.json();
        setPostRegEnabled(!!modules.postRegPhases);
        setMultiLanguageEnabled(!!modules.multiLanguage);
      }
      if (templatesRes.ok) {
        const templates: { id: string; name: string }[] = await templatesRes.json();
        setEmailTemplates(templates.map((t) => ({ id: t.id, name: t.name })));
      }
    } catch {
      toast.error("Failed to load form builder");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchEverything();
  }, [fetchEverything]);

  // Whenever the selected phase changes (or phases load), default the step.
  useEffect(() => {
    const phase = phases.find((p) => p.id === selectedPhaseId);
    if (!phase) {
      setSelectedStepId("");
      return;
    }
    const stepStillExists = phase.steps.find((s) => s.id === selectedStepId);
    if (!stepStillExists) {
      setSelectedStepId(phase.steps[0]?.id ?? "");
    }
  }, [selectedPhaseId, phases, selectedStepId]);

  const selectedPhase = useMemo(
    () => phases.find((p) => p.id === selectedPhaseId) ?? null,
    [phases, selectedPhaseId]
  );
  const selectedStep = useMemo(
    () => selectedPhase?.steps.find((s) => s.id === selectedStepId) ?? null,
    [selectedPhase, selectedStepId]
  );
  const fields = selectedStep?.fields ?? [];
  const totalSteps = selectedPhase?.steps.length ?? 0;
  const totalPhases = phases.length;

  // All fields on the event, used as candidates for `showIf` conditions.
  // We exclude system-only display fields (HEADING/DIVIDER/PARAGRAPH/HIDDEN)
  // since you can't usefully condition on them.
  const allFieldsOnEvent = useMemo(
    () =>
      phases.flatMap((p) =>
        p.steps.flatMap((s) =>
          s.fields.filter(
            (f) => !["HEADING", "DIVIDER", "PARAGRAPH"].includes(f.type)
          )
        )
      ),
    [phases]
  );

  // ── Field operations ───────────────────────────────────────────────

  async function seedDefaultFields() {
    const res = await fetch(`/api/events/${eventId}/form-fields/seed`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success("Default fields created");
      fetchEverything();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to seed fields");
    }
  }

  async function addField() {
    if (!newField.name || !newField.label) {
      toast.error("Name and label are required");
      return;
    }
    if (!selectedStepId) {
      toast.error("Pick a step first");
      return;
    }

    const res = await fetch(`/api/events/${eventId}/form-fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newField, stepId: selectedStepId }),
    });
    if (res.ok) {
      setIsAddDialogOpen(false);
      setNewField({
        name: "",
        label: "",
        type: "TEXT",
        required: false,
        width: "FULL",
        options: [],
        conditional: null,
      });
      setNewOption({ value: "", label: "" });
      toast.success("Field added");
      fetchEverything();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to add field");
    }
  }

  async function updateField(field: FormField) {
    const res = await fetch(
      `/api/events/${eventId}/form-fields/${field.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(field),
      }
    );
    if (res.ok) {
      setEditingField(null);
      toast.success("Field updated");
      fetchEverything();
    } else {
      toast.error("Failed to update field");
    }
  }

  async function deleteField(fieldId: string) {
    if (!confirm("Delete this field?")) return;
    const res = await fetch(
      `/api/events/${eventId}/form-fields/${fieldId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      toast.success("Field deleted");
      fetchEverything();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to delete field");
    }
  }

  async function moveFieldOrder(fieldId: string, direction: "up" | "down") {
    const idx = fields.findIndex((f) => f.id === fieldId);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= fields.length) return;

    const reordered = [...fields];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    const res = await fetch(`/api/events/${eventId}/form-fields/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: reordered.map((f, i) => ({ id: f.id, order: i })),
      }),
    });
    if (res.ok) {
      fetchEverything();
    } else {
      toast.error("Failed to save order");
    }
  }

  async function moveFieldToStep(fieldId: string, targetStepId: string) {
    const res = await fetch(
      `/api/events/${eventId}/form-fields/${fieldId}/move`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId: targetStepId }),
      }
    );
    if (res.ok) {
      toast.success("Field moved");
      fetchEverything();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to move field");
    }
  }

  // ── Phase / Step operations ────────────────────────────────────────

  async function addPhase() {
    const title = newPhaseTitle.trim();
    if (!title) {
      toast.error("Phase title is required");
      return;
    }
    const res = await fetch(`/api/events/${eventId}/phases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const created = await res.json();
      toast.success("Phase added");
      setNewPhaseTitle("");
      setShowAddPhase(false);
      await fetchEverything();
      setSelectedPhaseId(created.id);
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to add phase");
    }
  }

  async function commitPhaseRename() {
    if (!renamingPhaseId) return;
    const title = renamingPhaseDraft.trim();
    const id = renamingPhaseId;
    setRenamingPhaseId(null);
    if (!title) return;
    const res = await fetch(`/api/events/${eventId}/phases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      toast.success("Phase renamed");
      fetchEverything();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to rename");
    }
  }

  async function updatePhaseSettings(
    phaseId: string,
    patch: Partial<Phase>
  ) {
    const res = await fetch(`/api/events/${eventId}/phases/${phaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      toast.success("Phase updated");
      fetchEverything();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to update phase");
    }
  }

  async function reorderPhase(phaseId: string, direction: "up" | "down") {
    const res = await fetch(`/api/events/${eventId}/phases/${phaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    if (res.ok) {
      fetchEverything();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to reorder");
    }
  }

  async function deletePhase(phaseId: string) {
    if (!confirm("Delete this phase?")) return;
    const res = await fetch(`/api/events/${eventId}/phases/${phaseId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Phase deleted");
      fetchEverything();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to delete phase");
    }
  }

  async function addStep() {
    if (!selectedPhaseId) return;
    const res = await fetch(
      `/api/events/${eventId}/phases/${selectedPhaseId}/steps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Step ${(selectedPhase?.steps.length ?? 0) + 1}`,
        }),
      }
    );
    if (res.ok) {
      const created = await res.json();
      toast.success("Step added");
      await fetchEverything();
      setSelectedStepId(created.id);
    } else {
      toast.error("Failed to add step");
    }
  }

  async function commitStepRename() {
    if (!renamingStepId || !selectedPhaseId) return;
    const title = renamingStepDraft.trim();
    const id = renamingStepId;
    setRenamingStepId(null);
    if (!title) return;
    const res = await fetch(
      `/api/events/${eventId}/phases/${selectedPhaseId}/steps/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }
    );
    if (res.ok) {
      toast.success("Step renamed");
      fetchEverything();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to rename");
    }
  }

  async function reorderStep(stepId: string, direction: "up" | "down") {
    if (!selectedPhaseId) return;
    const res = await fetch(
      `/api/events/${eventId}/phases/${selectedPhaseId}/steps/${stepId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      }
    );
    if (res.ok) {
      fetchEverything();
    } else {
      toast.error("Failed to reorder");
    }
  }

  async function deleteStep(stepId: string) {
    if (!selectedPhaseId) return;
    if (!confirm("Delete this step?")) return;
    const res = await fetch(
      `/api/events/${eventId}/phases/${selectedPhaseId}/steps/${stepId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      toast.success("Step deleted");
      fetchEverything();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to delete step");
    }
  }

  if (loading) {
    return <div className="py-12 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Form Builder"
        description="Configure the registration form for this event"
      >
        {eventSlug && (
          <Button variant="outline" asChild>
            <a
              href={`/register/${eventSlug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Eye className="mr-2 h-4 w-4" />
              Preview Form
            </a>
          </Button>
        )}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!selectedStepId}>
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Add Field to &ldquo;{selectedStep?.title ?? "step"}&rdquo;
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Field Name (internal)</Label>
                <Input
                  value={newField.name}
                  onChange={(e) =>
                    setNewField({
                      ...newField,
                      name: e.target.value.replace(/\s/g, "_").toLowerCase(),
                    })
                  }
                  placeholder="field_name"
                />
              </div>
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  value={newField.label}
                  onChange={(e) =>
                    setNewField({ ...newField, label: e.target.value })
                  }
                  placeholder="Display Label"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={newField.type}
                  onValueChange={(v) =>
                    setNewField({ ...newField, type: v as FieldType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          {FIELD_ICONS[type as FieldType]}
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Width</Label>
                <Select
                  value={newField.width}
                  onValueChange={(v) =>
                    setNewField({ ...newField, width: v as FieldWidth })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL">Full Width</SelectItem>
                    <SelectItem value="HALF">Half Width</SelectItem>
                    <SelectItem value="THIRD">One Third</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={newField.required}
                  onCheckedChange={(c) =>
                    setNewField({ ...newField, required: c })
                  }
                />
                <Label>Required</Label>
              </div>

              <ConditionalEditor
                value={newField.conditional}
                onChange={(c) =>
                  setNewField({ ...newField, conditional: c })
                }
                candidateFields={allFieldsOnEvent}
              />

              {OPTION_FIELD_TYPES.includes(newField.type) && (
                <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                  <Label className="text-sm font-medium">Options</Label>
                  {newField.options.length > 0 && (
                    <div className="space-y-2">
                      {newField.options.map((opt, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-sm bg-white rounded px-3 py-2 border"
                        >
                          <span className="flex-1 truncate">{opt.label}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              const opts = [...newField.options];
                              opts.splice(idx, 1);
                              setNewField({ ...newField, options: opts });
                            }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type option and press Enter or +"
                      value={newOption.label}
                      onChange={(e) =>
                        setNewOption({
                          label: e.target.value,
                          value: e.target.value
                            .replace(/\s/g, "_")
                            .toLowerCase(),
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newOption.label) {
                          e.preventDefault();
                          setNewField({
                            ...newField,
                            options: [...newField.options, { ...newOption }],
                          });
                          setNewOption({ value: "", label: "" });
                        }
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (newOption.label) {
                          setNewField({
                            ...newField,
                            options: [...newField.options, { ...newOption }],
                          });
                          setNewOption({ value: "", label: "" });
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <Button onClick={addField} className="w-full">
                Add Field
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Phase strip — only shown when there's more than one phase, or
          postRegPhases module is on (so the "+ Phase" affordance exists). */}
      {(totalPhases > 1 || postRegEnabled) && (
        <Card>
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-2">
                Phases
              </span>
              {phases.map((p, i) => {
                const active = p.id === selectedPhaseId;
                const isRenaming = renamingPhaseId === p.id;
                return (
                  <div key={p.id} className="flex items-center">
                    {isRenaming ? (
                      <Input
                        autoFocus
                        value={renamingPhaseDraft}
                        onChange={(e) => setRenamingPhaseDraft(e.target.value)}
                        onBlur={commitPhaseRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitPhaseRename();
                          if (e.key === "Escape") setRenamingPhaseId(null);
                        }}
                        className="h-8 w-44"
                      />
                    ) : (
                      <button
                        onClick={() => setSelectedPhaseId(p.id)}
                        className={`px-3 py-1.5 rounded-l-md text-sm border ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted"
                        }`}
                      >
                        {p.type === "REGISTRATION" && (
                          <Lock className="inline h-3 w-3 mr-1 opacity-60" />
                        )}
                        {p.title}
                        {p.type !== "REGISTRATION" &&
                          (p.appliesToCategories?.length ? (
                            <span
                              className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium align-middle"
                              style={{
                                backgroundColor: "#EEEDFE",
                                color: "#3C3489",
                              }}
                              title={p.appliesToCategories.join(", ")}
                            >
                              {p.appliesToCategories.join(", ")}
                            </span>
                          ) : (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground align-middle">
                              All categories
                            </span>
                          ))}
                      </button>
                    )}
                    {active && p.type !== "REGISTRATION" && !isRenaming && (
                      <div className="flex border border-l-0 rounded-r-md overflow-hidden">
                        <button
                          onClick={() => reorderPhase(p.id, "up")}
                          disabled={i <= 1}
                          className="px-1 py-1.5 text-xs bg-background hover:bg-muted disabled:opacity-30"
                          title="Move left"
                        >
                          <ChevronUp className="h-3 w-3 -rotate-90" />
                        </button>
                        <button
                          onClick={() => reorderPhase(p.id, "down")}
                          disabled={i >= phases.length - 1}
                          className="px-1 py-1.5 text-xs bg-background hover:bg-muted disabled:opacity-30 border-l"
                          title="Move right"
                        >
                          <ChevronDown className="h-3 w-3 -rotate-90" />
                        </button>
                        <button
                          onClick={() => {
                            setRenamingPhaseId(p.id);
                            setRenamingPhaseDraft(p.title);
                          }}
                          className="px-1 py-1.5 text-xs bg-background hover:bg-muted border-l"
                          title="Rename"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => deletePhase(p.id)}
                          className="px-1 py-1.5 text-xs bg-background hover:bg-destructive/10 text-destructive border-l"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {postRegEnabled && !showAddPhase && (
                <button
                  onClick={() => setShowAddPhase(true)}
                  className="px-3 py-1.5 rounded-md text-sm border border-dashed text-muted-foreground hover:bg-muted"
                >
                  <Plus className="inline h-3 w-3 mr-1" /> Add Phase
                </button>
              )}
              {showAddPhase && (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    placeholder="Phase title"
                    value={newPhaseTitle}
                    onChange={(e) => setNewPhaseTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addPhase();
                      if (e.key === "Escape") {
                        setShowAddPhase(false);
                        setNewPhaseTitle("");
                      }
                    }}
                    className="h-8 w-44"
                  />
                  <Button size="sm" onClick={addPhase}>
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAddPhase(false);
                      setNewPhaseTitle("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            {!postRegEnabled && totalPhases === 1 && (
              <p className="text-xs text-muted-foreground mt-2">
                Enable the &ldquo;Post-Registration Phases&rdquo; module in
                Settings to collect data after registration (e.g. flight info,
                hotel preferences).
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step strip — always shown when a phase is selected. */}
      {selectedPhase && (
        <Card>
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-2">
                Steps
              </span>
              {selectedPhase.steps.map((s, i) => {
                const active = s.id === selectedStepId;
                const isRenaming = renamingStepId === s.id;
                return (
                  <div key={s.id} className="flex items-center">
                    {isRenaming ? (
                      <Input
                        autoFocus
                        value={renamingStepDraft}
                        onChange={(e) => setRenamingStepDraft(e.target.value)}
                        onBlur={commitStepRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitStepRename();
                          if (e.key === "Escape") setRenamingStepId(null);
                        }}
                        className="h-8 w-44"
                      />
                    ) : (
                      <button
                        onClick={() => setSelectedStepId(s.id)}
                        className={`px-3 py-1.5 rounded-l-md text-sm border ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted"
                        }`}
                      >
                        {s.title}
                        <span className="ml-2 text-xs opacity-70">
                          {s.fields.length}
                        </span>
                      </button>
                    )}
                    {active && !isRenaming && (
                      <div className="flex border border-l-0 rounded-r-md overflow-hidden">
                        <button
                          onClick={() => reorderStep(s.id, "up")}
                          disabled={i === 0}
                          className="px-1 py-1.5 text-xs bg-background hover:bg-muted disabled:opacity-30"
                          title="Move left"
                        >
                          <ChevronUp className="h-3 w-3 -rotate-90" />
                        </button>
                        <button
                          onClick={() => reorderStep(s.id, "down")}
                          disabled={i === selectedPhase.steps.length - 1}
                          className="px-1 py-1.5 text-xs bg-background hover:bg-muted disabled:opacity-30 border-l"
                          title="Move right"
                        >
                          <ChevronDown className="h-3 w-3 -rotate-90" />
                        </button>
                        <button
                          onClick={() => {
                            setRenamingStepId(s.id);
                            setRenamingStepDraft(s.title);
                          }}
                          className="px-1 py-1.5 text-xs bg-background hover:bg-muted border-l"
                          title="Rename"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => deleteStep(s.id)}
                          disabled={selectedPhase.steps.length <= 1 || s.fields.length > 0}
                          className="px-1 py-1.5 text-xs bg-background hover:bg-destructive/10 text-destructive border-l disabled:opacity-30"
                          title={
                            selectedPhase.steps.length <= 1
                              ? "A phase must have at least one step"
                              : s.fields.length > 0
                              ? "Move fields off this step first"
                              : "Delete"
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                onClick={addStep}
                className="px-3 py-1.5 rounded-md text-sm border border-dashed text-muted-foreground hover:bg-muted"
              >
                <Plus className="inline h-3 w-3 mr-1" /> Add Step
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Field list for the selected step */}
      {fields.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              {selectedStep
                ? `No fields in "${selectedStep.title}" yet.`
                : "No step selected."}
            </p>
            {selectedStep && totalPhases === 1 && totalSteps === 1 && (
              <Button onClick={seedDefaultFields}>
                <Wand2 className="mr-2 h-4 w-4" />
                Create Default Fields
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedStep?.title} &middot; {fields.length} field
              {fields.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="flex items-center gap-2 rounded-lg border p-3"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                  {FIELD_ICONS[field.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{field.label}</span>
                    {field.required && (
                      <span className="text-xs text-destructive">*</span>
                    )}
                    {field.isSystem && (
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        System
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {FIELD_TYPE_LABELS[field.type]} &middot; {field.name}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveFieldOrder(field.id, "up")}
                    disabled={index === 0}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveFieldOrder(field.id, "down")}
                    disabled={index === fields.length - 1}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  {/* Move to step dropdown — only shown when there's
                      somewhere else to move it to. */}
                  {phases.some(
                    (p) => p.steps.some((s) => s.id !== selectedStepId)
                  ) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" title="Move to…">
                          <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {phases.flatMap((p) =>
                          p.steps
                            .filter((s) => s.id !== selectedStepId)
                            .map((s) => (
                              <DropdownMenuItem
                                key={s.id}
                                onClick={() =>
                                  moveFieldToStep(field.id, s.id)
                                }
                              >
                                <span className="text-muted-foreground mr-2">
                                  {p.title} →
                                </span>
                                {s.title}
                              </DropdownMenuItem>
                            ))
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingField(field)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!field.isSystem && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteField(field.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Phase settings card — only for POST_REGISTRATION phases. */}
      {selectedPhase && selectedPhase.type === "POST_REGISTRATION" && (
        <PhaseSettingsCard
          phase={selectedPhase}
          eventId={eventId}
          eventCategories={eventCategories}
          multiLanguageEnabled={multiLanguageEnabled}
          emailTemplates={emailTemplates}
          onUpdate={(patch) => updatePhaseSettings(selectedPhase.id, patch)}
          onRefetch={fetchEverything}
        />
      )}

      {/* Edit Dialog (existing field-edit UI, unchanged) */}
      <Dialog
        open={!!editingField}
        onOpenChange={() => setEditingField(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Field</DialogTitle>
          </DialogHeader>
          {editingField && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Field Name</Label>
                <Input
                  value={editingField.name}
                  onChange={(e) =>
                    setEditingField({ ...editingField, name: e.target.value })
                  }
                  disabled={editingField.isSystem}
                />
              </div>
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  value={editingField.label}
                  onChange={(e) =>
                    setEditingField({ ...editingField, label: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={editingField.type}
                  onValueChange={(v) =>
                    setEditingField({ ...editingField, type: v as FieldType })
                  }
                  disabled={editingField.isSystem}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
                      <SelectItem key={type} value={type}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Width</Label>
                <Select
                  value={editingField.width}
                  onValueChange={(v) =>
                    setEditingField({
                      ...editingField,
                      width: v as FieldWidth,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL">Full Width</SelectItem>
                    <SelectItem value="HALF">Half Width</SelectItem>
                    <SelectItem value="THIRD">One Third</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editingField.required}
                  onCheckedChange={(c) =>
                    setEditingField({ ...editingField, required: c })
                  }
                />
                <Label>Required</Label>
              </div>

              <ConditionalEditor
                value={editingField.conditional}
                onChange={(c) =>
                  setEditingField({ ...editingField, conditional: c })
                }
                candidateFields={allFieldsOnEvent.filter(
                  (f) => f.id !== editingField.id
                )}
              />

              {OPTION_FIELD_TYPES.includes(editingField.type) && (
                <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                  <Label className="text-sm font-medium">Options</Label>
                  {(editingField.options || []).length > 0 && (
                    <div className="space-y-2">
                      {(editingField.options || []).map((opt, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-sm bg-white rounded px-3 py-2 border"
                        >
                          <span className="flex-1 truncate">{opt.label}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              const opts = [...(editingField.options || [])];
                              opts.splice(idx, 1);
                              setEditingField({ ...editingField, options: opts });
                            }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type option and press Enter or +"
                      value={editOption.label}
                      onChange={(e) =>
                        setEditOption({
                          label: e.target.value,
                          value: e.target.value
                            .replace(/\s/g, "_")
                            .toLowerCase(),
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editOption.label) {
                          e.preventDefault();
                          setEditingField({
                            ...editingField,
                            options: [
                              ...(editingField.options || []),
                              { ...editOption },
                            ],
                          });
                          setEditOption({ value: "", label: "" });
                        }
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (editOption.label) {
                          setEditingField({
                            ...editingField,
                            options: [
                              ...(editingField.options || []),
                              { ...editOption },
                            ],
                          });
                          setEditOption({ value: "", label: "" });
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Switch
                  checked={editingField.isActive}
                  onCheckedChange={(c) =>
                    setEditingField({ ...editingField, isActive: c })
                  }
                />
                <Label>Active</Label>
              </div>
              <Button
                onClick={() => updateField(editingField)}
                className="w-full"
              >
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
