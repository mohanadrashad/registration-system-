"use client";

import { ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FieldEditInput } from "./field-edit-input";
import {
  type ContactDetail,
  type FormFieldDef,
  formatFieldValue,
  getFieldValue,
} from "./field-display";

/**
 * Every REGISTRATION-phase answer that is NOT a system identity field —
 * dietary prefs, t-shirt size, arrival mode, any dynamic field the admin
 * added. Same data path as the Identity card (Contact columns +
 * metadata, via getFieldValue); just the non-system slice.
 */
export function RegistrationAnswersCard({
  contact,
  fields,
  editing,
  editValues,
  onChangeValue,
}: {
  contact: ContactDetail;
  fields: FormFieldDef[];
  editing: boolean;
  editValues: Record<string, unknown>;
  onChangeValue: (name: string, v: unknown) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Registration answers
        </CardTitle>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No additional registration questions for this event.
          </p>
        ) : editing ? (
          <div className="space-y-4">
            {fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                {field.type !== "CHECKBOX" && <Label>{field.label}</Label>}
                <FieldEditInput
                  field={field}
                  value={editValues[field.name]}
                  onChange={(v) => onChangeValue(field.name, v)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field) => (
              <div key={field.name} className="flex items-start gap-3 text-sm">
                <span className="text-muted-foreground w-28 shrink-0">{field.label}</span>
                <span className="font-medium break-words">
                  {formatFieldValue(field, getFieldValue(contact, field))}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
