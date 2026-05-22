"use client";

import { User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FieldEditInput } from "./field-edit-input";
import {
  type ContactDetail,
  type FormFieldDef,
  formatFieldValue,
  getFieldValue,
  isSyntheticEmail,
} from "./field-display";

/**
 * System identity fields only — the stable identity of the person
 * (name, email, phone, nationality, ID, company, …). Membership is
 * driven by `FormField.isSystem`, not hardcoded names, so it tracks
 * whatever the event marks as system fields.
 */
export function IdentityCard({
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
          <User className="h-4 w-4" />
          Identity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No system identity fields configured for this event.
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
                  otherText={
                    (editValues[`${field.name}_other`] as string) ?? ""
                  }
                  onChangeOtherText={(v) =>
                    onChangeValue(`${field.name}_other`, v)
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field) => {
              // Synthetic emails are placeholders, not real data — dash them
              // out so the identity card matches the rest of the dashboard
              // (see Stage 3 of the email-optional-events spec).
              const isEmptyEmail =
                field.name === "email" && isSyntheticEmail(contact.email);
              return (
                <div key={field.name} className="flex items-start gap-3 text-sm">
                  <span className="text-muted-foreground w-28 shrink-0">{field.label}</span>
                  <span className="font-medium break-words">
                    {isEmptyEmail
                      ? "—"
                      : formatFieldValue(
                          field,
                          getFieldValue(contact, field),
                          contact.metadata
                        )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
