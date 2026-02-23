"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const TEMPLATE_VARIABLES = [
  "firstName",
  "lastName",
  "email",
  "eventName",
  "eventDate",
  "eventVenue",
  "registrationLink",
  "confirmationCode",
];

const DEFAULT_HEADER = `<div style="background-color: #1a1a2e; padding: 30px; text-align: center;">
  <h1 style="color: white; margin: 0; font-size: 24px;">{{eventName}}</h1>
</div>`;

const DEFAULT_FOOTER = `<div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
  <p>You are receiving this email because you are registered for {{eventName}}.</p>
  <p>&copy; 2026 Registration System. All rights reserved.</p>
</div>`;

export default function NewTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const [loading, setLoading] = useState(false);
  const [bodyHtml, setBodyHtml] = useState(
    `<h2>Hello {{firstName}},</h2>\n<p>We are excited to invite you to <strong>{{eventName}}</strong>!</p>\n<p>Event Details:</p>\n<ul>\n<li>Date: {{eventDate}}</li>\n<li>Venue: {{eventVenue}}</li>\n</ul>\n<p><a href="{{registrationLink}}" style="display: inline-block; background-color: #1a1a2e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Register Now</a></p>\n<p>We look forward to seeing you there!</p>`
  );
  const [headerHtml, setHeaderHtml] = useState(DEFAULT_HEADER);
  const [footerHtml, setFooterHtml] = useState(DEFAULT_FOOTER);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const res = await fetch(`/api/events/${eventId}/emails/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        type: formData.get("type"),
        subject: formData.get("subject"),
        bodyHtml,
        headerHtml,
        footerHtml,
        variables: TEMPLATE_VARIABLES,
      }),
    });

    if (res.ok) {
      toast.success("Template created");
      router.push(`/dashboard/events/${eventId}/emails/templates`);
    } else {
      toast.error("Failed to create template");
      setLoading(false);
    }
  }

  function insertVariable(variable: string, setter: (fn: (prev: string) => string) => void) {
    setter((prev) => prev + `{{${variable}}}`);
  }

  const previewHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      ${headerHtml}
      <div style="padding: 20px;">
        ${bodyHtml
          .replace(/{{firstName}}/g, "John")
          .replace(/{{lastName}}/g, "Doe")
          .replace(/{{email}}/g, "john@example.com")
          .replace(/{{eventName}}/g, "Tech Conference 2026")
          .replace(/{{eventDate}}/g, "June 15, 2026")
          .replace(/{{eventVenue}}/g, "Convention Center")
          .replace(/{{registrationLink}}/g, "#")
          .replace(/{{confirmationCode}}/g, "ABC123")}
      </div>
      ${footerHtml
        .replace(/{{eventName}}/g, "Tech Conference 2026")}
    </div>
  `;

  return (
    <div className="space-y-6">
      <PageHeader title="Create Email Template" description="Design your email template" />

      <form onSubmit={onSubmit}>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Editor Panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Template Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input name="name" placeholder="Invitation Email" required />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select name="type" defaultValue="INVITATION">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INVITATION">Invitation</SelectItem>
                      <SelectItem value="REMINDER">Reminder</SelectItem>
                      <SelectItem value="CONFIRMATION">Confirmation</SelectItem>
                      <SelectItem value="ANNOUNCEMENT">Announcement</SelectItem>
                      <SelectItem value="BADGE_DELIVERY">Badge Delivery</SelectItem>
                      <SelectItem value="CUSTOM">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subject Line</Label>
                  <Input
                    name="subject"
                    placeholder="You're invited to {{eventName}}!"
                    required
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Variables</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <Badge
                      key={v}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => insertVariable(v, setBodyHtml)}
                    >
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Click a variable to insert it into the body editor
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <Tabs defaultValue="body">
                  <TabsList className="w-full">
                    <TabsTrigger value="header" className="flex-1">Header</TabsTrigger>
                    <TabsTrigger value="body" className="flex-1">Body</TabsTrigger>
                    <TabsTrigger value="footer" className="flex-1">Footer</TabsTrigger>
                  </TabsList>
                  <TabsContent value="header" className="space-y-2">
                    <Label>Header HTML</Label>
                    <Textarea
                      value={headerHtml}
                      onChange={(e) => setHeaderHtml(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                      placeholder="Header HTML..."
                    />
                  </TabsContent>
                  <TabsContent value="body" className="space-y-2">
                    <Label>Body HTML</Label>
                    <Textarea
                      value={bodyHtml}
                      onChange={(e) => setBodyHtml(e.target.value)}
                      className="min-h-[300px] font-mono text-sm"
                      placeholder="Email body HTML..."
                    />
                  </TabsContent>
                  <TabsContent value="footer" className="space-y-2">
                    <Label>Footer HTML</Label>
                    <Textarea
                      value={footerHtml}
                      onChange={(e) => setFooterHtml(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                      placeholder="Footer HTML..."
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Template"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border bg-white">
                  <iframe
                    srcDoc={previewHtml}
                    className="h-[600px] w-full"
                    title="Email Preview"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
