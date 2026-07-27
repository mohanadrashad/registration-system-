"use client";

// Form builder — container page. Owns all phase/step/field state and the
// API calls; the UI is composed from the colocated pieces in this folder
// (phase/step strips, field list, add/edit dialogs, phase settings card).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Eye, Heading } from "lucide-react";
import { FieldMappingSummaryCard } from "@/components/admin/field-mapping-summary-card";
import { BackfillDialog } from "@/components/admin/backfill-dialog";
import { defaultFileFieldMetadata } from "@/components/admin/file-field-settings";
import {
  parseFormFieldOptions,
  serializeFormFieldOptions,
} from "@/lib/form-builder/options-parse";

import type {
  FieldOption,
  FormField,
  Phase,
  ModulesPayload,
  EmailTemplateOption,
  NewFieldDraft,
} from "./types";
import { OPTION_FIELD_TYPES } from "./field-meta";
import { AddFieldDialog } from "./add-field-dialog";
import { EditFieldDialog } from "./edit-field-dialog";
import { PhaseStrip } from "./phase-strip";
import { StepStrip } from "./step-strip";
import { FieldList } from "./field-list";
import { PhaseSettingsCard } from "./phase-settings-card";

export default function FormBuilderPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [phases, setPhases] = useState<Phase[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>("");
  const [selectedStepId, setSelectedStepId] = useState<string>("");
  const [postRegEnabled, setPostRegEnabled] = useState(false);
  const [multiLanguageEnabled, setMultiLanguageEnabled] = useState(false);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateOption[]>([]);
  const [eventSlug, setEventSlug] = useState<string>("");
  const [eventCategories, setEventCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newField, setNewField] = useState<NewFieldDraft>({
    name: "",
    label: "",
    labelAr: "",
    placeholder: "",
    placeholderAr: "",
    helpText: "",
    helpTextAr: "",
    type: "TEXT",
    required: false,
    width: "FULL",
    optionColumns: "AUTO",
    options: [],
    other: undefined,
    maxSelections: undefined,
    showSelectionCounter: undefined,
    conditional: null,
    // Only consumed when type === "FILE". Kept on every newField for
    // simplicity; ignored by other field types on the wire.
    fileMetadata: defaultFileFieldMetadata(),
    // Only consumed when type === "HEADING": the section-label color
    // ("" = default muted gray). Stored into FormField.metadata.color.
    headingColor: "",
  });

  // Backfill dialog open state — Stage 3c of FIELD_MAPPING_SPEC. The
  // BackfillDialog itself owns all internal phase/preview/result
  // state and is always-mounted at the page root (see end of return)
  // so its Radix lifecycle is not entangled with the summary card's
  // CardFooter conditional render.
  const [backfillOpen, setBackfillOpen] = useState(false);

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
        const raw: Phase[] = await phasesRes.json();
        // Normalize FormField.options: server may return either legacy
        // array or wrapped { options, other?, maxSelections?, ... }. We
        // always work with the parsed pieces internally so every editor
        // reads consistent state.
        const data: Phase[] = raw.map((phase) => ({
          ...phase,
          steps: phase.steps.map((step) => ({
            ...step,
            fields: step.fields.map((field) => {
              const parsed = parseFormFieldOptions(field.options);
              // Parser's FieldOption permits labelAr: null (matches the DB
              // Json column); this component's interface uses string | undefined.
              const normalized: FieldOption[] = parsed.options.map((o) => ({
                value: o.value,
                label: o.label,
                ...(typeof o.labelAr === "string" && o.labelAr
                  ? { labelAr: o.labelAr }
                  : {}),
              }));
              return {
                ...field,
                options: normalized,
                other: parsed.other,
                maxSelections: parsed.maxSelections,
                showSelectionCounter: parsed.showSelectionCounter,
              };
            }),
          })),
        }));
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
        setPortalEnabled(!!modules.selfServicePortal);
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

  // Stage 1 of FIELD_MAPPING_SPEC: all FormFields across phases/steps
  // with their mapsTo tag. The summary card groups by role; the
  // MapsToDropdown looks up "taken by" sibling for the conflict UX.
  // Order is preserved (phases.order → steps.order → fields.order via
  // fetchEverything's existing orderBy) so LAST_NAME join order is
  // deterministic for the summary card.
  const allFieldsWithMapping = useMemo(
    () =>
      phases.flatMap((p) =>
        p.steps.flatMap((s) =>
          s.fields.map((f) => ({
            id: f.id,
            label: f.label,
            mapsTo: f.mapsTo ?? null,
          }))
        )
      ),
    [phases]
  );

  const taggedFields = useMemo(
    () =>
      allFieldsWithMapping.flatMap((f) =>
        f.mapsTo !== null
          ? [{ id: f.id, name: f.id, label: f.label, mapsTo: f.mapsTo }]
          : []
      ),
    [allFieldsWithMapping]
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
    if (!newField.name) {
      toast.error("Field name is required");
      return;
    }
    // DIVIDER renders as a plain <hr> on the public form — it has no
    // visible text, so a label is genuinely optional for that type.
    // Every other type renders `label` somewhere (as the input's label
    // for inputs, as the heading text for HEADING, as the body text for
    // PARAGRAPH), so a label is required.
    if (newField.type !== "DIVIDER" && !newField.label) {
      toast.error("Label is required");
      return;
    }
    if (!selectedStepId) {
      toast.error("Pick a step first");
      return;
    }

    // Compose wrapped options (or legacy array) from the editor pieces.
    const optionsPayload = OPTION_FIELD_TYPES.includes(newField.type)
      ? serializeFormFieldOptions({
          options: newField.options,
          other: newField.other,
          maxSelections:
            newField.type === "MULTISELECT" ? newField.maxSelections : undefined,
          showSelectionCounter:
            newField.type === "MULTISELECT"
              ? newField.showSelectionCounter
              : undefined,
        })
      : undefined;

    // FILE fields persist the upload settings into FormField.metadata.
    // Other types send metadata undefined so the column stays null
    // (existing behavior — Chunk 2 will Zod-validate this for FILE).
    const { fileMetadata, headingColor, ...rest } = newField;
    const metadataPayload =
      newField.type === "FILE"
        ? fileMetadata
        : newField.type === "HEADING" && headingColor
        ? { color: headingColor }
        : undefined;

    const res = await fetch(`/api/events/${eventId}/form-fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...rest,
        options: optionsPayload,
        metadata: metadataPayload,
        stepId: selectedStepId,
      }),
    });
    if (res.ok) {
      setIsAddDialogOpen(false);
      setNewField({
        name: "",
        label: "",
        labelAr: "",
        placeholder: "",
        placeholderAr: "",
        helpText: "",
        helpTextAr: "",
        type: "TEXT",
        required: false,
        width: "FULL",
        optionColumns: "AUTO",
        options: [],
        other: undefined,
        maxSelections: undefined,
        showSelectionCounter: undefined,
        conditional: null,
        fileMetadata: defaultFileFieldMetadata(),
        headingColor: "",
      });
      toast.success("Field added");
      fetchEverything();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to add field");
    }
  }

  async function updateField(field: FormField) {
    // Re-wrap options if this is an option-bearing field; for everything
    // else we send the existing options through unchanged.
    const optionsPayload = OPTION_FIELD_TYPES.includes(field.type)
      ? serializeFormFieldOptions({
          options: field.options ?? [],
          other: field.other,
          maxSelections:
            field.type === "MULTISELECT" ? field.maxSelections : undefined,
          showSelectionCounter:
            field.type === "MULTISELECT" ? field.showSelectionCounter : undefined,
        })
      : field.options;

    // For FILE fields, force the metadata payload to the editor's
    // current shape (already normalized via parseFileFieldMetadata in
    // the dialog). For all other types we send null so a type change
    // (FILE → TEXT) clears the stale FILE keys from the column rather
    // than leaving them dormant.
    const metadataPayload =
      field.type === "FILE" || field.type === "HEADING"
        ? field.metadata ?? null
        : null;

    // Email-required lock: when the self-service portal module is on, the
    // email field's `required` is non-negotiable. The Edit dialog shows
    // the toggle as checked+disabled; coerce here too so a no-op save on
    // a stale-false DB row writes back the locked-true value instead of
    // tripping the server-side validation (chunk 2 of stage 2).
    const requiredPayload =
      portalEnabled && field.name === "email" ? true : field.required;

    const res = await fetch(
      `/api/events/${eventId}/form-fields/${field.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...field,
          required: requiredPayload,
          options: optionsPayload,
          metadata: metadataPayload,
        }),
      }
    );
    if (res.ok) {
      setEditingField(null);
      toast.success("Field updated");
      fetchEverything();
    } else {
      const err = await res.json().catch(() => null);
      toast.error(err?.error || "Failed to update field");
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
        <Button
          variant="outline"
          disabled={!selectedStepId}
          onClick={() => {
            setNewField((f) => ({ ...f, type: "HEADING" }));
            setIsAddDialogOpen(true);
          }}
        >
          <Heading className="mr-2 h-4 w-4" />
          Add section heading
        </Button>
        <AddFieldDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          selectedStepId={selectedStepId}
          selectedStepTitle={selectedStep?.title}
          newField={newField}
          onChange={setNewField}
          onSubmit={addField}
          allFieldsOnEvent={allFieldsOnEvent}
        />
      </PageHeader>

      {/* Field mapping summary — pinned above the phase list. Reads
          from in-memory phases data (no extra fetch); recomputes
          automatically when fetchEverything updates phases. */}
      <FieldMappingSummaryCard
        taggedFields={taggedFields}
        onApplyToExisting={() => setBackfillOpen(true)}
      />

      <PhaseStrip
        phases={phases}
        selectedPhaseId={selectedPhaseId}
        postRegEnabled={postRegEnabled}
        renamingPhaseId={renamingPhaseId}
        renamingPhaseDraft={renamingPhaseDraft}
        onRenamingPhaseDraftChange={setRenamingPhaseDraft}
        onStartRename={(id, draft) => {
          setRenamingPhaseId(id);
          setRenamingPhaseDraft(draft);
        }}
        onCancelRename={() => setRenamingPhaseId(null)}
        onCommitRename={commitPhaseRename}
        showAddPhase={showAddPhase}
        newPhaseTitle={newPhaseTitle}
        onNewPhaseTitleChange={setNewPhaseTitle}
        onShowAddPhaseChange={setShowAddPhase}
        onAddPhase={addPhase}
        onSelectPhase={setSelectedPhaseId}
        onReorderPhase={reorderPhase}
        onDeletePhase={deletePhase}
      />

      {selectedPhase && (
        <StepStrip
          phase={selectedPhase}
          selectedStepId={selectedStepId}
          renamingStepId={renamingStepId}
          renamingStepDraft={renamingStepDraft}
          onRenamingStepDraftChange={setRenamingStepDraft}
          onStartRename={(id, draft) => {
            setRenamingStepId(id);
            setRenamingStepDraft(draft);
          }}
          onCancelRename={() => setRenamingStepId(null)}
          onCommitRename={commitStepRename}
          onSelectStep={setSelectedStepId}
          onReorderStep={reorderStep}
          onDeleteStep={deleteStep}
          onAddStep={addStep}
        />
      )}

      <FieldList
        fields={fields}
        selectedStep={selectedStep}
        selectedStepId={selectedStepId}
        phases={phases}
        totalPhases={totalPhases}
        totalSteps={totalSteps}
        eventId={eventId}
        allFieldsWithMapping={allFieldsWithMapping}
        onSeedDefaults={seedDefaultFields}
        onMoveOrder={moveFieldOrder}
        onMoveToStep={moveFieldToStep}
        onEdit={setEditingField}
        onDelete={deleteField}
        onRefetch={fetchEverything}
      />

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

      <EditFieldDialog
        field={editingField}
        onFieldChange={setEditingField}
        onClose={() => setEditingField(null)}
        onSave={updateField}
        allFieldsOnEvent={allFieldsOnEvent}
        portalEnabled={portalEnabled}
      />

      {/* Backfill dialog — always mounted at page root so its Radix
          lifecycle is independent of the summary card's CardFooter
          conditional render (mirrors quick-actions-card.tsx, the
          gold-standard non-racing dialog pattern; see
          [[radix-dialog-post-refetch-race]] memory). */}
      <BackfillDialog
        eventId={eventId}
        open={backfillOpen}
        onOpenChange={setBackfillOpen}
        onChanged={fetchEverything}
      />
    </div>
  );
}
