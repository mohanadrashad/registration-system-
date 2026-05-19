"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Personal (or general) registration link with a copy button.
 * Behaviour unchanged from the original Registration Link card.
 */
export function RegistrationLinkCard({
  hasToken,
  registrationLink,
}: {
  hasToken: boolean;
  registrationLink: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(registrationLink);
      setCopied(true);
      toast.success("Registration link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          Registration link
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-2">
          {hasToken
            ? "Personal registration link for this attendee. Share it if they didn't receive the email."
            : "This attendee has no invite token. They can use the general registration link."}
        </p>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={registrationLink}
            className="text-xs font-mono"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={copyLink}
            className="shrink-0"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
