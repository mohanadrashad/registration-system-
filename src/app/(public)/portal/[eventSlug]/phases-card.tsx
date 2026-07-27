"use client";

import Link from "next/link";
import {
  CalendarClock,
  CheckCircle,
  ChevronRight,
  Lock as LockIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { pickText, type PortalLang } from "@/lib/portal/i18n";
import type { PhaseInfo } from "./types";
import type { PortalT } from "./portal-strings";

// "Additional Information" card — one row per post-registration phase with
// its open/closed/locked status and the fill-in / view action.
export function PhasesCard({
  phases,
  eventSlug,
  lang,
  t,
  tag,
  isRtl,
  primaryColor,
}: {
  phases: PhaseInfo[];
  eventSlug: string;
  lang: PortalLang;
  t: PortalT;
  // From localeTag(lang) — undefined means the browser's default locale.
  tag: string | undefined;
  isRtl: boolean;
  primaryColor: string;
}) {
  if (phases.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.additionalInfo}</CardTitle>
        <CardDescription>{t.additionalInfoDesc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {phases.map((p) => {
          const opensAt = p.opensAt ? new Date(p.opensAt) : null;
          const closesAt = p.closesAt ? new Date(p.closesAt) : null;
          const baseHref = `/portal/${eventSlug}/phases/${p.id}`;
          const phaseTitle = pickText(lang, p.title, p.titleAr);
          const phaseDescription = pickText(
            lang,
            p.description,
            p.descriptionAr
          );

          let statusBadge: React.ReactNode = null;
          let action: React.ReactNode = null;
          let helperText: string | null = null;

          if (p.status === "OPEN") {
            statusBadge = (
              <Badge variant="default" className="text-xs">
                {t.open}
              </Badge>
            );
            action = (
              <Button
                asChild
                variant={p.isCompleted ? "outline" : "default"}
                size="sm"
                style={
                  p.isCompleted
                    ? undefined
                    : { backgroundColor: primaryColor, color: "#fff" }
                }
              >
                <Link href={baseHref}>
                  {p.isCompleted ? t.edit : t.fillIn}
                  <ChevronRight
                    className={`h-3.5 w-3.5 ${
                      isRtl ? "mr-1 rotate-180" : "ml-1"
                    }`}
                  />
                </Link>
              </Button>
            );
            if (closesAt) {
              helperText = t.closes(closesAt.toLocaleString(tag));
            }
          } else if (p.status === "NOT_OPEN") {
            statusBadge = (
              <Badge variant="secondary" className="text-xs">
                <CalendarClock className="mr-1 h-3 w-3" />
                {t.notOpenYet}
              </Badge>
            );
            if (opensAt) {
              helperText = t.opens(opensAt.toLocaleString(tag));
            }
          } else if (p.status === "CLOSED") {
            // Visible only when there's a submission (server already filtered).
            statusBadge = (
              <Badge variant="outline" className="text-xs">
                {t.closed}
              </Badge>
            );
            action = (
              <Button asChild variant="ghost" size="sm">
                <Link href={baseHref}>
                  {t.view}
                  <ChevronRight
                    className={`h-3.5 w-3.5 ${
                      isRtl ? "mr-1 rotate-180" : "ml-1"
                    }`}
                  />
                </Link>
              </Button>
            );
            helperText = t.phaseClosedViewOnly;
          } else if (p.status === "LOCKED") {
            statusBadge = (
              <Badge variant="secondary" className="text-xs">
                <LockIcon className="mr-1 h-3 w-3" />
                {t.locked}
              </Badge>
            );
            helperText = t.notAvailable;
          }

          return (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{phaseTitle}</p>
                  {statusBadge}
                  {p.isCompleted && (
                    <Badge variant="outline" className="text-xs">
                      <CheckCircle className="mr-1 h-3 w-3 text-green-600" />
                      {t.completed}
                    </Badge>
                  )}
                  {p.isRequired && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t.required}
                    </span>
                  )}
                </div>
                {phaseDescription && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {phaseDescription}
                  </p>
                )}
                {helperText && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {helperText}
                  </p>
                )}
              </div>
              {action}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
