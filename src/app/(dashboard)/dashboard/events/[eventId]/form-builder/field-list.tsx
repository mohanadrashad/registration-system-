"use client";

import {
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Pencil,
  Trash2,
  Wand2,
} from "lucide-react";
import type { FieldMapping } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MapsToDropdown } from "@/components/admin/maps-to-dropdown";
import { parseHeadingColor } from "@/lib/form-builder/heading-meta";
import { FIELD_ICONS, FIELD_TYPE_LABELS } from "./field-meta";
import type { FormField, Phase, Step } from "./types";

// Field list for the selected step (or the empty state with the
// seed-default-fields affordance on a brand-new event).
export function FieldList({
  fields,
  selectedStep,
  selectedStepId,
  phases,
  totalPhases,
  totalSteps,
  eventId,
  allFieldsWithMapping,
  onSeedDefaults,
  onMoveOrder,
  onMoveToStep,
  onEdit,
  onDelete,
  onRefetch,
}: {
  fields: FormField[];
  selectedStep: Step | null;
  selectedStepId: string;
  phases: Phase[];
  totalPhases: number;
  totalSteps: number;
  eventId: string;
  allFieldsWithMapping: { id: string; label: string; mapsTo: FieldMapping | null }[];
  onSeedDefaults: () => void;
  onMoveOrder: (fieldId: string, direction: "up" | "down") => void;
  onMoveToStep: (fieldId: string, stepId: string) => void;
  onEdit: (field: FormField) => void;
  onDelete: (fieldId: string) => void;
  onRefetch: () => void;
}) {
  if (fields.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground mb-4">
            {selectedStep
              ? `No fields in "${selectedStep.title}" yet.`
              : "No step selected."}
          </p>
          {selectedStep && totalPhases === 1 && totalSteps === 1 && (
            <Button onClick={onSeedDefaults}>
              <Wand2 className="mr-2 h-4 w-4" />
              Create Default Fields
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
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
            className={`flex items-center gap-2 rounded-lg border p-3 ${
              field.type === "HEADING" ? "border-dashed bg-muted/40" : ""
            }`}
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
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span>
                  {FIELD_TYPE_LABELS[field.type]} &middot; {field.name}
                </span>
                {field.type === "HEADING" && (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full border border-black/10"
                    style={{
                      backgroundColor:
                        parseHeadingColor(field.metadata) ?? "#6b7280",
                    }}
                    title="Section label color"
                  />
                )}
              </div>
            </div>
            {/* Maps-to chip (Stage 1 of FIELD_MAPPING_SPEC). The
                component returns null for field types with no
                compatible role AND no current mapping, so layout
                fields and other non-mappable types render unchanged. */}
            <MapsToDropdown
              eventId={eventId}
              fieldId={field.id}
              fieldType={field.type}
              currentMapsTo={field.mapsTo ?? null}
              siblings={allFieldsWithMapping}
              onChanged={onRefetch}
            />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onMoveOrder(field.id, "up")}
                disabled={index === 0}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onMoveOrder(field.id, "down")}
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
                              onMoveToStep(field.id, s.id)
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
                onClick={() => onEdit(field)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              {!field.isSystem && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(field.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
