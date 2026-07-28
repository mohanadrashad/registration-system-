"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PhaseCard } from "./phase-card";
import {
  type MergedPhase,
  type PhaseAccessItem,
  type PhaseSubmissionItem,
  type SelectionPhaseEntry,
  computeCompletion,
} from "./phase-types";

/**
 * The middle column. Fetches the three existing per-phase endpoints
 * (phase-access, phase-submissions, selections), unions them by
 * phase.id — phase-access is the canonical, fully-ordered superset of
 * POST_REGISTRATION phases — and renders one PhaseCard each. No new
 * endpoint or query is introduced; this only regroups data the old
 * three cards already fetched.
 */
export function PhaseColumn({
  eventId,
  contactId,
  canEdit,
  hasRegistration,
  attendeeCategory,
}: {
  eventId: string;
  contactId: string;
  canEdit: boolean;
  hasRegistration: boolean;
  attendeeCategory: string | null;
}) {
  const [access, setAccess] = useState<PhaseAccessItem[] | null>(null);
  const [submissions, setSubmissions] = useState<PhaseSubmissionItem[] | null>(
    null
  );
  const [selections, setSelections] = useState<SelectionPhaseEntry[] | null>(
    null
  );
  // M for the "Showing N of M" hint — total active POST_REG phases on
  // the event, before category filtering. Surfaced by phase-submissions.
  const [totalPhases, setTotalPhases] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const base = `/api/events/${eventId}/contacts/${contactId}`;
    const [accRes, subRes, selRes] = await Promise.allSettled([
      fetch(`${base}/phase-access`, { credentials: "same-origin" }),
      fetch(`${base}/phase-submissions`, { credentials: "same-origin" }),
      fetch(`${base}/selections`, { credentials: "same-origin" }),
    ]);

    if (accRes.status === "fulfilled" && accRes.value.ok) {
      const d = (await accRes.value.json()) as { phases: PhaseAccessItem[] };
      setAccess(d.phases);
    } else {
      setAccess([]);
    }

    if (subRes.status === "fulfilled" && subRes.value.ok) {
      const d = (await subRes.value.json()) as {
        phases: PhaseSubmissionItem[];
        totalPostRegPhases?: number;
      };
      setSubmissions(d.phases);
      setTotalPhases(
        typeof d.totalPostRegPhases === "number"
          ? d.totalPostRegPhases
          : d.phases.length
      );
    } else {
      setSubmissions([]);
      setTotalPhases(0);
    }

    // selections 403s when the postRegPhases module is off and 404s
    // when there is no registration — both mean "nothing to show".
    if (selRes.status === "fulfilled" && selRes.value.ok) {
      const d = (await selRes.value.json()) as {
        phases: SelectionPhaseEntry[];
      };
      setSelections(d.phases);
    } else {
      setSelections([]);
    }

    setLoading(false);
  }, [eventId, contactId]);

  useEffect(() => {
    // False positive: every setState inside refetch happens after an
    // awaited fetch, never synchronously during the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
  }, [refetch]);

  const merged: MergedPhase[] = (() => {
    if (!access) return [];
    const subById = new Map((submissions ?? []).map((s) => [s.id, s]));
    const selById = new Map((selections ?? []).map((s) => [s.id, s]));

    // phase-access is the ordered superset. Build from it, then
    // defensively append any phase id seen only in the other two
    // responses (shouldn't normally happen, but keeps a phase from
    // silently vanishing if filters ever diverge).
    const seen = new Set<string>();
    const out: MergedPhase[] = [];

    for (const a of access) {
      seen.add(a.id);
      out.push({
        id: a.id,
        title: a.title,
        access: a,
        submission: subById.get(a.id),
        selection: selById.get(a.id),
      });
    }
    for (const s of submissions ?? []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({
        id: s.id,
        title: s.title,
        access: {
          id: s.id,
          title: s.title,
          titleAr: s.titleAr,
          opensAt: null,
          closesAt: null,
          isRequired: false,
          override: null,
          reason: null,
          overriddenAt: null,
          overriddenBy: null,
          status: "OPEN",
        },
        submission: s,
        selection: selById.get(s.id),
      });
    }
    for (const s of selections ?? []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({
        id: s.id,
        title: s.title,
        access: {
          id: s.id,
          title: s.title,
          titleAr: s.titleAr,
          opensAt: null,
          closesAt: null,
          isRequired: s.isRequired,
          override: null,
          reason: null,
          overriddenAt: null,
          overriddenBy: null,
          status: "OPEN",
        },
        submission: undefined,
        selection: s,
      });
    }
    return out;
  })();

  const total = merged.length;
  const complete = merged.filter(
    (p) => computeCompletion(p).label === "Complete"
  ).length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading phases…
      </div>
    );
  }

  // No registration → no per-phase state to act on (phase-access has
  // nothing to override, selections 404). The old page hid all three
  // phase cards in this case; preserve that rather than rendering
  // cards with mutation controls that would 400.
  if (!hasRegistration) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <p className="text-sm font-medium">Phases for this attendee</p>
        </div>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            This attendee has not registered yet — no phase activity.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-medium">Phases for this attendee</p>
        {total > 0 && (
          <p className="text-xs text-muted-foreground">
            {complete} of {total} complete
          </p>
        )}
      </div>

      {/* Open Q2 default: the filtering hint shows only when the
          category filter actually reduces the visible count. */}
      {totalPhases !== null && total < totalPhases && (
        <p className="px-1 text-xs text-muted-foreground">
          Showing {total} of {totalPhases} phases
          {attendeeCategory
            ? ` (filtered by category: ${attendeeCategory})`
            : " (filtered by category)"}
        </p>
      )}

      {total === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {totalPhases && totalPhases > 0
              ? "No phases apply to this attendee — they may need a category assigned."
              : "No phases configured for this event."}
          </p>
        </div>
      ) : (
        merged.map((p) => (
          <PhaseCard
            key={p.id}
            eventId={eventId}
            contactId={contactId}
            phase={p}
            canEdit={canEdit}
            onRefetch={refetch}
          />
        ))
      )}
    </div>
  );
}
