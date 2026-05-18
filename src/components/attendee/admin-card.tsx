"use client";

import { useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ContactDetail,
  type ContactStatus,
  deriveSource,
} from "./field-display";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Non-form administrative metadata: category, source, added date,
 * registration status, registered-at, confirmation code. Edit mode
 * exposes the category + contact-status controls exactly as the old
 * Admin card did (category is still surfaced as a header pill too — this
 * card keeps the editable control + the long-form details).
 */
export function AdminCard({
  contact,
  editing,
  editCategory,
  setEditCategory,
  editStatus,
  setEditStatus,
}: {
  contact: ContactDetail;
  editing: boolean;
  editCategory: string;
  setEditCategory: (v: string) => void;
  editStatus: ContactStatus;
  setEditStatus: (v: ContactStatus) => void;
}) {
  const [copied, setCopied] = useState(false);
  const code = contact.registration?.confirmationCode;

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Confirmation code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Admin &amp; registration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {editing ? (
          <>
            <div className="space-y-1.5">
              <Label>Category</Label>
              {contact.event.categories.length > 0 ? (
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {contact.event.categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={editStatus}
                onValueChange={(v) => setEditStatus(v as ContactStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IMPORTED">Imported</SelectItem>
                  <SelectItem value="INVITED">Invited</SelectItem>
                  <SelectItem value="REGISTERED">Registered</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Category</span>
              <span className="font-medium">{contact.category || "Uncategorized"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Source</span>
              <span className="font-medium">{deriveSource(contact)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Added</span>
              <span className="font-medium">{fmtDate(contact.createdAt)}</span>
            </div>
            {contact.registration && (
              <>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Registration status</span>
                  <Badge variant="default">{contact.registration.status}</Badge>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Registered at</span>
                  <span className="font-medium">
                    {new Date(contact.registration.registeredAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between gap-3 items-center">
                  <span className="text-muted-foreground">Confirmation code</span>
                  <button
                    type="button"
                    onClick={copyCode}
                    title="Click to copy"
                    className="flex items-center gap-1.5 font-mono text-xs font-medium max-w-[60%] hover:text-primary transition-colors"
                  >
                    <span className="truncate">{code}</span>
                    {copied ? (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 shrink-0" />
                    )}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
