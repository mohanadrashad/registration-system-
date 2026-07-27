"use client";

import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EmailTemplate } from "./types";

// Template picker for the bulk "Send Email" action. Controlled by the page;
// the actual send (and the `sending` flag on the toolbar button) stays there.
export function SendEmailDialog({
  open,
  onOpenChange,
  templates,
  selectedCount,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: EmailTemplate[];
  selectedCount: number;
  onSend: (templateId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Email to {selectedCount} attendee{selectedCount !== 1 ? "s" : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* With server pagination the client only holds one page of
              contacts, so a precise synthetic-email count isn't known
              up front — the send endpoint skips them and reports the
              exact skipped count in the result toast. */}
          <p className="text-xs text-muted-foreground">
            Recipients without an email address are skipped automatically.
          </p>
          <p className="text-sm text-muted-foreground">Choose a template to send:</p>
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => onSend(t.id)}
              className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
            >
              <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{t.name}</p>
                <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
              </div>
              <Badge variant="outline" className="ml-auto shrink-0">{t.type}</Badge>
            </button>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-destructive text-center py-4">
              No templates found. Create one in Email Templates first.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
