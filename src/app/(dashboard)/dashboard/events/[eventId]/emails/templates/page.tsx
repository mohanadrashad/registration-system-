"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Mail, Trash2, Send } from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  type: string;
  subject: string;
  createdAt: string;
  _count: { campaigns: number };
}

export default function EmailTemplatesPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/emails/templates`);
      if (res.ok) setTemplates(await res.json());
    } catch {
      // DB may be temporarily unavailable
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  async function handleDelete(templateId: string) {
    if (!confirm("Delete this template?")) return;
    const res = await fetch(
      `/api/events/${eventId}/emails/templates/${templateId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      toast.success("Template deleted");
      fetchTemplates();
    }
  }

  if (loading) return <div className="py-12 text-center">Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Email Templates" description="Manage email templates and campaigns">
        <Link href={`/dashboard/events/${eventId}/emails/campaigns`}>
          <Button variant="outline">
            <Send className="mr-2 h-4 w-4" />
            Campaigns
          </Button>
        </Link>
        <Link href={`/dashboard/events/${eventId}/emails/templates/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </Link>
      </PageHeader>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No email templates yet</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Create templates for invitations, reminders, and announcements
            </p>
            <Link href={`/dashboard/events/${eventId}/emails/templates/new`}>
              <Button>Create Template</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  <Badge variant="outline">{template.type}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  Subject: {template.subject}
                </p>
                <p className="mb-4 text-xs text-muted-foreground">
                  Used in {template._count.campaigns} campaign(s)
                </p>
                <div className="flex gap-2">
                  <Link href={`/dashboard/events/${eventId}/emails/templates/${template.id}`}>
                    <Button size="sm" variant="outline">Edit</Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleDelete(template.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
