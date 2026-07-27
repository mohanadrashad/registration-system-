"use client";

import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Phase } from "./types";

// Step strip — always shown when a phase is selected. All state
// (selection, inline-rename drafts) lives in the page.
export function StepStrip({
  phase,
  selectedStepId,
  renamingStepId,
  renamingStepDraft,
  onRenamingStepDraftChange,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onSelectStep,
  onReorderStep,
  onDeleteStep,
  onAddStep,
}: {
  phase: Phase;
  selectedStepId: string;
  renamingStepId: string | null;
  renamingStepDraft: string;
  onRenamingStepDraftChange: (v: string) => void;
  onStartRename: (id: string, draft: string) => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onSelectStep: (id: string) => void;
  onReorderStep: (id: string, direction: "up" | "down") => void;
  onDeleteStep: (id: string) => void;
  onAddStep: () => void;
}) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-2">
            Steps
          </span>
          {phase.steps.map((s, i) => {
            const active = s.id === selectedStepId;
            const isRenaming = renamingStepId === s.id;
            return (
              <div key={s.id} className="flex items-center">
                {isRenaming ? (
                  <Input
                    autoFocus
                    value={renamingStepDraft}
                    onChange={(e) => onRenamingStepDraftChange(e.target.value)}
                    onBlur={onCommitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onCommitRename();
                      if (e.key === "Escape") onCancelRename();
                    }}
                    className="h-8 w-44"
                  />
                ) : (
                  <button
                    onClick={() => onSelectStep(s.id)}
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
                      onClick={() => onReorderStep(s.id, "up")}
                      disabled={i === 0}
                      className="px-1 py-1.5 text-xs bg-background hover:bg-muted disabled:opacity-30"
                      title="Move left"
                    >
                      <ChevronUp className="h-3 w-3 -rotate-90" />
                    </button>
                    <button
                      onClick={() => onReorderStep(s.id, "down")}
                      disabled={i === phase.steps.length - 1}
                      className="px-1 py-1.5 text-xs bg-background hover:bg-muted disabled:opacity-30 border-l"
                      title="Move right"
                    >
                      <ChevronDown className="h-3 w-3 -rotate-90" />
                    </button>
                    <button
                      onClick={() => onStartRename(s.id, s.title)}
                      className="px-1 py-1.5 text-xs bg-background hover:bg-muted border-l"
                      title="Rename"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onDeleteStep(s.id)}
                      disabled={phase.steps.length <= 1 || s.fields.length > 0}
                      className="px-1 py-1.5 text-xs bg-background hover:bg-destructive/10 text-destructive border-l disabled:opacity-30"
                      title={
                        phase.steps.length <= 1
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
            onClick={onAddStep}
            className="px-3 py-1.5 rounded-md text-sm border border-dashed text-muted-foreground hover:bg-muted"
          >
            <Plus className="inline h-3 w-3 mr-1" /> Add Step
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
