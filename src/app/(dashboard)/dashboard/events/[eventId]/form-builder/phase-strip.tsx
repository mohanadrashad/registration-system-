"use client";

import { ChevronDown, ChevronUp, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Phase } from "./types";

// Phase strip — only shown when there's more than one phase, or the
// postRegPhases module is on (so the "+ Phase" affordance exists). All
// state (selection, inline-rename drafts, add-phase input) lives in the
// page; this component only renders it.
export function PhaseStrip({
  phases,
  selectedPhaseId,
  postRegEnabled,
  renamingPhaseId,
  renamingPhaseDraft,
  onRenamingPhaseDraftChange,
  onStartRename,
  onCancelRename,
  onCommitRename,
  showAddPhase,
  newPhaseTitle,
  onNewPhaseTitleChange,
  onShowAddPhaseChange,
  onAddPhase,
  onSelectPhase,
  onReorderPhase,
  onDeletePhase,
}: {
  phases: Phase[];
  selectedPhaseId: string;
  postRegEnabled: boolean;
  renamingPhaseId: string | null;
  renamingPhaseDraft: string;
  onRenamingPhaseDraftChange: (v: string) => void;
  onStartRename: (id: string, draft: string) => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  showAddPhase: boolean;
  newPhaseTitle: string;
  onNewPhaseTitleChange: (v: string) => void;
  onShowAddPhaseChange: (show: boolean) => void;
  onAddPhase: () => void;
  onSelectPhase: (id: string) => void;
  onReorderPhase: (id: string, direction: "up" | "down") => void;
  onDeletePhase: (id: string) => void;
}) {
  const totalPhases = phases.length;
  if (!(totalPhases > 1 || postRegEnabled)) return null;

  return (
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
                    onChange={(e) => onRenamingPhaseDraftChange(e.target.value)}
                    onBlur={onCommitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onCommitRename();
                      if (e.key === "Escape") onCancelRename();
                    }}
                    className="h-8 w-44"
                  />
                ) : (
                  <button
                    onClick={() => onSelectPhase(p.id)}
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
                      onClick={() => onReorderPhase(p.id, "up")}
                      disabled={i <= 1}
                      className="px-1 py-1.5 text-xs bg-background hover:bg-muted disabled:opacity-30"
                      title="Move left"
                    >
                      <ChevronUp className="h-3 w-3 -rotate-90" />
                    </button>
                    <button
                      onClick={() => onReorderPhase(p.id, "down")}
                      disabled={i >= phases.length - 1}
                      className="px-1 py-1.5 text-xs bg-background hover:bg-muted disabled:opacity-30 border-l"
                      title="Move right"
                    >
                      <ChevronDown className="h-3 w-3 -rotate-90" />
                    </button>
                    <button
                      onClick={() => onStartRename(p.id, p.title)}
                      className="px-1 py-1.5 text-xs bg-background hover:bg-muted border-l"
                      title="Rename"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onDeletePhase(p.id)}
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
              onClick={() => onShowAddPhaseChange(true)}
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
                onChange={(e) => onNewPhaseTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onAddPhase();
                  if (e.key === "Escape") {
                    onShowAddPhaseChange(false);
                    onNewPhaseTitleChange("");
                  }
                }}
                className="h-8 w-44"
              />
              <Button size="sm" onClick={onAddPhase}>
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onShowAddPhaseChange(false);
                  onNewPhaseTitleChange("");
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
  );
}
