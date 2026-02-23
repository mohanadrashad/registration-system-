"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Award, Wand2, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";

interface Registration {
  id: string;
  status: string;
  confirmationCode: string;
  badgeGenerated: boolean;
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    organization: string | null;
    category: string | null;
  };
  badge: { id: string; pdfUrl: string | null } | null;
}

const columns: ColumnDef<Registration>[] = [
  {
    id: "name",
    header: "Name",
    cell: ({ row }) =>
      `${row.original.contact.firstName} ${row.original.contact.lastName}`,
  },
  {
    id: "email",
    accessorFn: (row) => row.contact.email,
    header: "Email",
  },
  {
    id: "category",
    header: "Category",
    cell: ({ row }) =>
      row.original.contact.category ? (
        <Badge variant="outline">{row.original.contact.category}</Badge>
      ) : (
        "Attendee"
      ),
  },
  {
    id: "badgeStatus",
    header: "Badge",
    cell: ({ row }) =>
      row.original.badgeGenerated ? (
        <Badge variant="default">Generated</Badge>
      ) : (
        <Badge variant="secondary">Pending</Badge>
      ),
  },
  {
    id: "actions",
    header: "Preview",
    cell: ({ row }) =>
      row.original.badgeGenerated ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            window.open(`/badge/${row.original.confirmationCode}`, "_blank")
          }
        >
          <ExternalLink className="mr-1 h-3 w-3" />
          View
        </Button>
      ) : null,
  },
];

export default function BadgesPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/registrations`);
      if (res.ok) {
        const data = await res.json();
        setRegistrations(data.filter((r: Registration) => r.status === "CONFIRMED"));
      }
    } catch {
      // DB may be temporarily unavailable
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleGenerateAll() {
    setGenerating(true);
    const res = await fetch(`/api/events/${eventId}/badges/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const result = await res.json();
    if (res.ok) {
      toast.success(`Generated ${result.generated} badges`);
      fetchData();
    } else {
      toast.error(result.error || "Failed to generate badges");
    }
    setGenerating(false);
  }

  async function handleSendBadges() {
    setSending(true);
    const res = await fetch(`/api/events/${eventId}/badges/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const result = await res.json();
    if (res.ok) {
      toast.success(`Sent ${result.sent} badge emails`);
    } else {
      toast.error(result.error || "Failed to send badges");
    }
    setSending(false);
  }

  if (loading) return <div className="py-12 text-center">Loading...</div>;

  const generated = registrations.filter((r) => r.badgeGenerated).length;
  const pending = registrations.length - generated;

  return (
    <div className="space-y-6">
      <PageHeader title="E-Badges" description="Generate and manage attendee badges">
        <Button onClick={handleSendBadges} variant="outline" disabled={sending || generated === 0}>
          <Send className="mr-2 h-4 w-4" />
          {sending ? "Sending..." : "Email Badges"}
        </Button>
        <Button onClick={handleGenerateAll} disabled={generating}>
          <Wand2 className="mr-2 h-4 w-4" />
          {generating ? "Generating..." : "Generate All Badges"}
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{registrations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Generated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{generated}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pending}</div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={registrations}
        searchKey="email"
        searchPlaceholder="Search by email..."
      />
    </div>
  );
}
