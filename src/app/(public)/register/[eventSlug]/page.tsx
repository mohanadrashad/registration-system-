"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { resolveTemplate } from "@/components/register-templates/registry";

// Per-Event Template System — public registration container (spec §5, Stage 1).
//
// Resolves which curated template renders this event (`Event.template`) and
// dispatches to it through the registry. Until the template is known it renders
// the CLASSIC default; with only CLASSIC registered today that never swaps, so
// the chosen template component mounts once and renders byte-identically to the
// pre-extraction page (the renderer logic moved verbatim into ClassicTemplate).
//
// Stage 1b will move the single data fetch + form state into a shared hook here
// and pass a typed contract down, letting the lightweight `/template` endpoint
// retire and every template embed the same field/stepper engine.
export default function RegisterPage() {
  const params = useParams();
  const eventSlug = params.eventSlug as string;
  const [template, setTemplate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/register/${eventSlug}/template`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setTemplate(d?.template ?? "CLASSIC");
      })
      .catch(() => {
        if (!cancelled) setTemplate("CLASSIC");
      });
    return () => {
      cancelled = true;
    };
  }, [eventSlug]);

  // null (still resolving) and CLASSIC both resolve to ClassicTemplate, so the
  // component reference is stable across the resolve → no remount, no flash.
  const Template = resolveTemplate(template);
  return <Template />;
}
