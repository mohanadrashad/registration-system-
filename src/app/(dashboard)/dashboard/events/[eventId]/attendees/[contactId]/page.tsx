"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getRole, canEdit } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Tag } from "lucide-react";
import {
  type ContactDetail,
  type ContactStatus,
  LAYOUT_TYPES,
  COLUMN_FIELDS,
  STATUS_CONFIG,
  deriveDisplayName,
  getFieldValue,
  initialsFor,
} from "@/components/attendee/field-display";
import { IdentityCard } from "@/components/attendee/identity-card";
import { RegistrationAnswersCard } from "@/components/attendee/registration-answers-card";
import { AdminCard } from "@/components/attendee/admin-card";
import { RegistrationLinkCard } from "@/components/attendee/registration-link-card";
import { PhaseColumn } from "@/components/attendee/phase-column";
import { EBadgeCard } from "@/components/attendee/ebadge-card";
import { EmailHistoryCard } from "@/components/attendee/email-history-card";
import { QuickActionsCard } from "@/components/attendee/quick-actions-card";

/**
 * Attendee detail — three-column layout.
 *  - Left:   Identity / Registration answers / Admin / Registration link
 *  - Middle: one unified card per phase (PhaseColumn)
 *  - Right:  E-Badge / Email history / Quick actions
 *
 * This page owns only the contact fetch + the single shared edit flow
 * (one Save writes columns + metadata + category + status in one PUT,
 * unchanged from before). All per-phase data fetching/mutating lives in
 * the column/card components.
 */
export default function AttendeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const contactId = params.contactId as string;
  const { data: session } = useSession();
  const userCanEdit = canEdit(getRole(session as { user?: { role?: string } } | null));

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [editCategory, setEditCategory] = useState("");
  const [editStatus, setEditStatus] = useState<ContactStatus>("IMPORTED");

  const fetchContact = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/contacts/${contactId}`);
      if (!res.ok) throw new Error("Not found");
      const data: ContactDetail = await res.json();
      setContact(data);

      const values: Record<string, unknown> = {};
      for (const field of data.formFields || []) {
        if (LAYOUT_TYPES.has(field.type)) continue;
        const raw = getFieldValue(data, field);
        if (field.type === "CHECKBOX") {
          values[field.name] = Boolean(raw);
        } else if (field.type === "MULTISELECT") {
          values[field.name] = Array.isArray(raw) ? raw : [];
        } else {
          values[field.name] = raw ?? "";
        }
      }
      setEditValues(values);
      setEditCategory(data.category || "");
      setEditStatus(data.status);
    } catch {
      toast.error("Failed to load attendee");
      router.push(`/dashboard/events/${eventId}/attendees`);
    } finally {
      setLoading(false);
    }
  }, [eventId, contactId, router]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const registrationLink = contact
    ? contact.inviteToken
      ? `${appUrl}/register/${contact.event.slug}?token=${contact.inviteToken}`
      : `${appUrl}/register/${contact.event.slug}`
    : "";

  async function handleSave() {
    if (!contact) return;
    setSaving(true);
    try {
      const columnUpdates: Record<string, unknown> = {};
      const metadataUpdates: Record<string, unknown> = {
        ...(contact.metadata || {}),
      };

      for (const field of contact.formFields || []) {
        if (LAYOUT_TYPES.has(field.type)) continue;
        const value = editValues[field.name];
        if (COLUMN_FIELDS.has(field.name)) {
          columnUpdates[field.name] =
            value === "" || value === undefined ? null : value;
        } else {
          metadataUpdates[field.name] = value;
        }
      }

      const body = {
        ...columnUpdates,
        metadata:
          Object.keys(metadataUpdates).length > 0 ? metadataUpdates : null,
        category: editCategory || null,
        status: editStatus,
      };

      const res = await fetch(`/api/events/${eventId}/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success("Attendee updated");
        setEditing(false);
        fetchContact();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(
          err?.error?.fieldErrors ? "Validation error" : "Failed to update"
        );
      }
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">Loading...</div>
    );
  }

  if (!contact) return null;

  const visibleFields = (contact.formFields || []).filter(
    (f) => !LAYOUT_TYPES.has(f.type)
  );
  const systemFields = visibleFields.filter((f) => f.isSystem);
  const answerFields = visibleFields.filter((f) => !f.isSystem);
  const displayName = deriveDisplayName(contact, visibleFields);
  const statusCfg = STATUS_CONFIG[contact.status];

  const onChangeValue = (name: string, v: unknown) =>
    setEditValues((prev) => ({ ...prev, [name]: v }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Link href={`/dashboard/events/${eventId}/attendees`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
            {initialsFor(displayName.primary)}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold break-words">{displayName.primary}</h1>
            {displayName.secondary && (
              <p className="text-sm text-muted-foreground break-words">
                {displayName.secondary}
              </p>
            )}
            {/* Badges sit on their own line so a long name is never
                squeezed/truncated by them at narrow widths. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant={statusCfg?.variant || "secondary"}>
                {statusCfg?.label || contact.status}
              </Badge>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <Tag className="h-3 w-3" />
                {contact.category || "Uncategorized"}
              </span>
            </div>
          </div>
        </div>
        {userCanEdit && (
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    // reset drafts to last-loaded values
                    fetchContact();
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-1 gap-[14px] lg:[grid-template-columns:minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
        {/* Left — Identity */}
        <div className="space-y-[14px]">
          <IdentityCard
            contact={contact}
            fields={systemFields}
            editing={editing}
            editValues={editValues}
            onChangeValue={onChangeValue}
          />
          <RegistrationAnswersCard
            contact={contact}
            fields={answerFields}
            editing={editing}
            editValues={editValues}
            onChangeValue={onChangeValue}
          />
          <AdminCard
            contact={contact}
            editing={editing}
            editCategory={editCategory}
            setEditCategory={setEditCategory}
            editStatus={editStatus}
            setEditStatus={setEditStatus}
          />
          <RegistrationLinkCard
            hasToken={!!contact.inviteToken}
            registrationLink={registrationLink}
          />
        </div>

        {/* Middle — Per-phase */}
        <div>
          <PhaseColumn
            eventId={eventId}
            contactId={contactId}
            canEdit={userCanEdit}
            hasRegistration={!!contact.registration}
          />
        </div>

        {/* Right — Communications & Output */}
        <div className="space-y-[14px]">
          <EBadgeCard registration={contact.registration} />
          <EmailHistoryCard emailLogs={contact.emailLogs} />
          {userCanEdit && (
            <QuickActionsCard
              eventId={eventId}
              contactId={contactId}
              registration={contact.registration}
              contactStatus={contact.status}
              onChanged={fetchContact}
            />
          )}
        </div>
      </div>
    </div>
  );
}
