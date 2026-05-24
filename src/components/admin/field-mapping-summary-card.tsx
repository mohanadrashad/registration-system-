"use client";

import { FieldMapping } from "@prisma/client";
import { Tag, Download } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FIELD_MAPPING_LABELS,
  FIELD_MAPPING_LEGACY_KEYS,
} from "@/lib/form-builder/field-mapping-labels";

interface TaggedField {
  id: string;
  name: string;
  label: string;
  mapsTo: FieldMapping;
  // Source order for LAST_NAME join determinism. Pre-sorted by caller.
}

interface Props {
  /**
   * All tagged fields across all phases/steps for the event, sorted by
   * FormField.order. The card groups by role and renders the summary;
   * no API fetch — phases data already carries `mapsTo` on every field.
   */
  taggedFields: TaggedField[];
  /** Rendered as the CardFooter button when ≥1 field is tagged. */
  onApplyToExisting?: () => void;
}

type SingleValueRole = Exclude<FieldMapping, "FULL_NAME">;

const SINGLE_VALUE_ORDER: SingleValueRole[] = [
  "FIRST_NAME",
  "LAST_NAME",
  "EMAIL",
  "PHONE",
  "ORGANIZATION",
  "DESIGNATION",
];

export function FieldMappingSummaryCard({
  taggedFields,
  onApplyToExisting,
}: Props) {
  const grouped: Record<SingleValueRole, TaggedField[]> = {
    FIRST_NAME: [],
    LAST_NAME: [],
    EMAIL: [],
    PHONE: [],
    ORGANIZATION: [],
    DESIGNATION: [],
  };
  let fullName: TaggedField | null = null;

  for (const f of taggedFields) {
    if (f.mapsTo === "FULL_NAME") {
      if (!fullName) fullName = f;
    } else {
      grouped[f.mapsTo].push(f);
    }
  }

  const hasAnyTag = taggedFields.length > 0;

  // FULL_NAME collapses FIRST_NAME and LAST_NAME into a single row. The
  // API does NOT filter — the validator prevents the conflicting state
  // from being saved in the first place, so this branch can trust that
  // FULL_NAME being held means the other two are empty.
  const fullNameActive = !!fullName;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Field Mapping</CardTitle>
        <p className="text-xs text-muted-foreground">
          Controls which form fields populate Contact columns.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {fullNameActive && fullName ? (
          <SummaryRow
            label={FIELD_MAPPING_LABELS.FULL_NAME}
            fields={[fullName]}
            hint="split on first whitespace"
          />
        ) : (
          <>
            <SummaryRow
              label={FIELD_MAPPING_LABELS.FIRST_NAME}
              fields={grouped.FIRST_NAME}
              legacy={FIELD_MAPPING_LEGACY_KEYS.FIRST_NAME}
            />
            <SummaryRow
              label={FIELD_MAPPING_LABELS.LAST_NAME}
              fields={grouped.LAST_NAME}
              legacy={FIELD_MAPPING_LEGACY_KEYS.LAST_NAME}
              joinIndicator={grouped.LAST_NAME.length >= 2}
              showMultiHint={grouped.LAST_NAME.length >= 2}
            />
          </>
        )}
        {SINGLE_VALUE_ORDER.filter(
          (r) => r !== "FIRST_NAME" && r !== "LAST_NAME"
        ).map((role) => (
          <SummaryRow
            key={role}
            label={FIELD_MAPPING_LABELS[role]}
            fields={grouped[role]}
            legacy={FIELD_MAPPING_LEGACY_KEYS[role]}
          />
        ))}
      </CardContent>
      {hasAnyTag && (
        <CardFooter className="justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onApplyToExisting}
            disabled={!onApplyToExisting}
          >
            Apply to existing registrations
            <Download className="ml-2 h-3 w-3" />
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

interface RowProps {
  label: string;
  fields: TaggedField[];
  legacy?: string;
  joinIndicator?: boolean;
  showMultiHint?: boolean;
  hint?: string;
}

function SummaryRow({
  label,
  fields,
  legacy,
  joinIndicator,
  showMultiHint,
  hint,
}: RowProps) {
  const unmapped = fields.length === 0;
  return (
    <div className="flex items-start gap-3">
      <div className="w-28 shrink-0 font-medium text-muted-foreground">
        {label}
      </div>
      <div className="text-muted-foreground select-none">→</div>
      <div className="min-w-0 flex-1">
        {unmapped ? (
          <span className="text-muted-foreground italic">
            — not mapped
            {legacy && (
              <span className="text-xs not-italic ml-2">
                (falls back to field named &quot;{legacy}&quot;)
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {fields.map((f, idx) => (
              <span key={f.id} className="inline-flex items-center gap-1">
                <Badge variant="secondary" className="font-normal">
                  <Tag className="h-3 w-3 mr-1" />
                  {f.label}
                </Badge>
                {idx < fields.length - 1 && (
                  <span className="text-muted-foreground">+</span>
                )}
              </span>
            ))}
            {joinIndicator && (
              <span className="text-xs text-muted-foreground ml-1">
                (joined in order)
              </span>
            )}
            {hint && (
              <span className="text-xs text-muted-foreground ml-1">
                ({hint})
              </span>
            )}
          </span>
        )}
        {showMultiHint && (
          <p className="mt-1 text-xs text-muted-foreground">
            Middle names are joined into Last Name. To split them, add a
            separate Middle Name role in v2.
          </p>
        )}
      </div>
    </div>
  );
}
