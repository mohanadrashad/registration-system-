"use client";

import { useState, useEffect } from "react";
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
  "badgeUrl",
];

const DEFAULT_HEADER = `<div style="margin: 0; padding: 0;">
  <img src="https://registration-system-gray.vercel.app/email-header.jpg" alt="العشاء السنوي - Annual Gathering Dinner" style="width: 100%; display: block;" />
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
    `<div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.8;">
  <p>Dear Team,</p>
  <p>We are excited to invite you again to our <strong>Annual Company Gathering</strong>.</p>
  <p>As you know, the event was postponed earlier due to the ongoing situation and we are happy that we can now come together and spend some fun time as one team out of the work environment.</p>
  <p>Get ready for a fun and enjoyable evening filled with great company, exciting games, and prizes. To make the night even more special, we will wrap up the event with <strong>Jad and the band</strong>.</p>
  <p style="margin-top: 20px;">
    <strong>Tuesday 14 April 2026</strong><br/>
    From 6 pm onwards<br/>
    <strong>Maseena Resort</strong>
  </p>
  <p><a href="https://maps.app.goo.gl/QyP2Htgpd4SxF3UQ6?g_st=ic" style="color: #4a9e4a; text-decoration: underline;">View Location on Google Maps</a></p>
  <p>We look forward to seeing you all there 🙏🏼</p>

  <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;" />

  <div dir="rtl" style="text-align: right; font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.8;">
    <p>الزملاء الأعزاء،</p>
    <p>يسرّنا دعوتكم مجددًا لحضور <strong>اللقاء السنوي للشركة</strong>.</p>
    <p>كما تعلمون، فقد تم تأجيل الفعالية سابقًا نظرًا للوضع القائم، ويسعدنا أننا أصبحنا الآن قادرين على الاجتماع معًا وقضاء وقت ممتع كفريق واحد خارج إطار العمل.</p>
    <p>استعدوا لأمسية مليئة بالمرح والأجواء الجميلة، تتضمن ألعابًا ممتعة وجوائز. ولنجعل هذه الليلة أكثر تميزًا، سنختتم الفعالية مع <strong>جاد والفرقة الموسيقية</strong>.</p>
    <p style="margin-top: 20px;">
      <strong>الثلاثاء ١٤ أبريل</strong><br/>
      من الساعة ٦ مساءً<br/>
      <strong>منتجع ماسينا</strong>
    </p>
    <p>نتطلع إلى رؤيتكم جميعًا 🙏🏼</p>
  </div>
</div>`
  );
  const [headerHtml, setHeaderHtml] = useState(DEFAULT_HEADER);
  const [footerHtml, setFooterHtml] = useState(DEFAULT_FOOTER);
  const [eventPreview, setEventPreview] = useState({ name: "Your Event", date: "TBD", venue: "" });

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((e) => {
        if (e) setEventPreview({
          name: e.name || "Your Event",
          date: e.startDate ? new Date(e.startDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "TBD",
          venue: e.venue || "",
        });
      })
      .catch(() => {});
  }, [eventId]);

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

  function applyPreviewVars(html: string) {
    return html
      .replace(/{{firstName}}/g, "John")
      .replace(/{{lastName}}/g, "Doe")
      .replace(/{{email}}/g, "john@example.com")
      .replace(/{{eventName}}/g, eventPreview.name)
      .replace(/{{eventDate}}/g, eventPreview.date)
      .replace(/{{eventVenue}}/g, eventPreview.venue || "Convention Center")
      .replace(/{{registrationLink}}/g, "#")
      .replace(/{{confirmationCode}}/g, "ABC123")
      .replace(/{{badgeUrl}}/g, "#badge-preview");
  }

  const previewHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      ${applyPreviewVars(headerHtml)}
      <div style="padding: 20px;">
        ${applyPreviewVars(bodyHtml)}
      </div>
      ${applyPreviewVars(footerHtml)}
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
