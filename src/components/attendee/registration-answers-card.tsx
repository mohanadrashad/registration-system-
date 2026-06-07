"use client";

import { ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FieldEditInput } from "./field-edit-input";
import { FileViewerInline, isFileRef } from "./file-viewer-inline";
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
  eventId,
  contactId,
  onFileChanged,
  hasRegistration,
}: {
  contact: ContactDetail;
  fields: FormFieldDef[];
  editing: boolean;
  editValues: Record<string, unknown>;
  onChangeValue: (name: string, v: unknown) => void;
  // eventId builds the FILE stream-through URL in view mode
  // (FileViewerInline). contactId + onFileChanged add the edit-mode
  // admin Replace/Remove/Upload cell. onFileChanged resyncs the parent
  // after an immediate file commit. hasRegistration gates the
  // upload-into-empty affordance (formData lives on Registration).
  eventId: string;
  contactId: string;
  onFileChanged: () => void | Promise<void>;
  hasRegistration: boolean;
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
                  otherText={
                    (editValues[`${field.name}_other`] as string) ?? ""
                  }
                  onChangeOtherText={(v) =>
                    onChangeValue(`${field.name}_other`, v)
                  }
                  eventId={eventId}
                  contactId={contactId}
                  onFileChanged={onFileChanged}
                  hasRegistration={hasRegistration}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field) => {
              const raw = getFieldValue(contact, field);
              // Stage 3: FILE fields render a rich one-liner with an
              // inline View button instead of the bare filename string
              // formatFieldValue returns. Falls back to formatFieldValue
              // when the value isn't a well-formed FILE ref (orphan
              // cleanup edge case, malformed legacy data) so the row
              // still shows the filename rather than nothing.
              const showRichFile =
                field.type === "FILE" && isFileRef(raw);
              return (
                <div
                  key={field.name}
                  className="flex items-start gap-3 text-sm"
                >
                  <span className="text-muted-foreground w-28 shrink-0">
                    {field.label}
                  </span>
                  {showRichFile ? (
                    <FileViewerInline file={raw} eventId={eventId} />
                  ) : (
                    <span className="font-medium break-words">
                      {formatFieldValue(field, raw, contact.metadata)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
