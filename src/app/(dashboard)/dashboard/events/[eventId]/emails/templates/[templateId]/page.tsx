"use client";

import { useEffect, useState } from "react";
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
  "firstName", "lastName", "email", "eventName",
  "eventDate", "eventVenue", "registrationLink", "confirmationCode",
];

interface Template {
  id: string;
  name: string;
  type: string;
  subject: string;
  bodyHtml: string;
  headerHtml: string | null;
  footerHtml: string | null;
}

export default function EditTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const templateId = params.templateId as string;
  const [template, setTemplate] = useState<Template | null>(null);
  const [bodyHtml, setBodyHtml] = useState("");
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/events/${eventId}/emails/templates/${templateId}`)
      .then((r) => r.json())
      .then((data) => {
        setTemplate(data);
        setBodyHtml(data.bodyHtml || "");
        setHeaderHtml(data.headerHtml || "");
        setFooterHtml(data.footerHtml || "");
      });
  }, [eventId, templateId]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const res = await fetch(
      `/api/events/${eventId}/emails/templates/${templateId}`,
      {
        method: "PUT",
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
      }
    );

    if (res.ok) {
      toast.success("Template updated");
    } else {
      toast.error("Failed to update");
    }
    setLoading(false);
  }

  if (!template) return <div className="py-12 text-center">Loading...</div>;

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
      ${footerHtml.replace(/{{eventName}}/g, "Tech Conference 2026")}
    </div>
  `;

  return (
    <div className="space-y-6">
      <PageHeader title="Edit Template" description={template.name} />

      <form onSubmit={onSubmit}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Template Info</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input name="name" defaultValue={template.name} required />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select name="type" defaultValue={template.type}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Label>Subject</Label>
                  <Input name="subject" defaultValue={template.subject} required />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Variables</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <Badge key={v} variant="outline" className="cursor-pointer hover:bg-accent"
                      onClick={() => setBodyHtml((prev) => prev + `{{${v}}}`)}>
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
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
                  <TabsContent value="header">
                    <Textarea value={headerHtml} onChange={(e) => setHeaderHtml(e.target.value)}
                      className="min-h-[200px] font-mono text-sm" />
                  </TabsContent>
                  <TabsContent value="body">
                    <Textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)}
                      className="min-h-[300px] font-mono text-sm" />
                  </TabsContent>
                  <TabsContent value="footer">
                    <Textarea value={footerHtml} onChange={(e) => setFooterHtml(e.target.value)}
                      className="min-h-[200px] font-mono text-sm" />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Changes"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Back
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border bg-white">
                <iframe srcDoc={previewHtml} className="h-[600px] w-full" title="Preview" />
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
