"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  UserCheck,
  Send,
  Clock,
  Mail,
  MailX,
  ArrowLeft,
  XCircle,
  Hourglass,
} from "lucide-react";

interface StatusCounts {
  IMPORTED: number;
  INVITED: number;
  REGISTERED: number;
  CANCELLED: number;
}

interface Summary {
  total: number;
  statusCounts: StatusCounts;
  emailsSent: number;
  emailsFailed: number;
}

interface CategoryRow {
  category: string;
  total: number;
  IMPORTED: number;
  INVITED: number;
  REGISTERED: number;
  CANCELLED: number;
}

interface EventInfo {
  id: string;
  name: string;
  categories: string[];
}

export default function StatisticsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryRow[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  useEffect(() => {
    fetch(`/api/events/${eventId}/statistics`)
      .then((r) => { if (r.ok) return r.json(); throw new Error(); })
      .then((data) => {
        setEvent(data.event);
        setSummary(data.summary);
        setCategoryBreakdown(data.categoryBreakdown || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) {
    return <div className="flex items-center justify-center py-12">Loading...</div>;
  }

  if (!summary) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Failed to load statistics.</div>;
  }

  // Compute displayed stats based on category filter
  let displayTotal: number;
  let displayStatus: StatusCounts;

  if (categoryFilter === "ALL") {
    displayTotal = summary.total;
    displayStatus = summary.statusCounts;
  } else {
    const cat = categoryBreakdown.find((c) => c.category === categoryFilter);
    if (cat) {
      displayTotal = cat.total;
      displayStatus = {
        IMPORTED: cat.IMPORTED,
        INVITED: cat.INVITED,
        REGISTERED: cat.REGISTERED,
        CANCELLED: cat.CANCELLED,
      };
    } else {
      displayTotal = 0;
      displayStatus = { IMPORTED: 0, INVITED: 0, REGISTERED: 0, CANCELLED: 0 };
    }
  }

  const categories = event?.categories || [];

  return (
    <div className="space-y-6">
      <PageHeader title="Statistics" description={event?.name || ""}>
        <Link href={`/dashboard/events/${eventId}/attendees`}>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Attendees
          </Button>
        </Link>
      </PageHeader>

      {/* Category Tabs */}
      {categories.length > 0 && (
        <div className="flex gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
          {["ALL", ...categories].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
                categoryFilter === cat
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat === "ALL" ? "All Categories" : cat}
            </button>
          ))}
        </div>
      )}

      {/* Row 1: Total Invitees - Full Width */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-muted p-3"><Users className="h-6 w-6 text-muted-foreground" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Invitees</p>
              <p className="text-3xl font-bold">{displayTotal}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Row 2: Status Breakdown Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2"><Clock className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Imported</p>
                <p className="text-2xl font-bold">{displayStatus.IMPORTED}</p>
                <p className="text-xs text-muted-foreground">
                  {displayTotal > 0 ? Math.round((displayStatus.IMPORTED / displayTotal) * 100) : 0}% of total
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-50 p-2"><Send className="h-5 w-5 text-orange-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Invited</p>
                <p className="text-2xl font-bold">{displayStatus.INVITED}</p>
                <p className="text-xs text-muted-foreground">
                  {displayTotal > 0 ? Math.round((displayStatus.INVITED / displayTotal) * 100) : 0}% of total
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-yellow-50 p-2"><Hourglass className="h-5 w-5 text-yellow-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{displayStatus.IMPORTED + displayStatus.INVITED}</p>
                <p className="text-xs text-muted-foreground">
                  Invited but not registered
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2"><UserCheck className="h-5 w-5 text-green-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Registered</p>
                <p className="text-2xl font-bold">{displayStatus.REGISTERED}</p>
                <p className="text-xs text-muted-foreground">
                  {displayTotal > 0 ? Math.round((displayStatus.REGISTERED / displayTotal) * 100) : 0}% of total
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-50 p-2"><XCircle className="h-5 w-5 text-red-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Cancelled</p>
                <p className="text-2xl font-bold">{displayStatus.CANCELLED}</p>
                <p className="text-xs text-muted-foreground">
                  {displayTotal > 0 ? Math.round((displayStatus.CANCELLED / displayTotal) * 100) : 0}% of total
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Email Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2"><Mail className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Emails Sent</p>
                <p className="text-2xl font-bold">{summary.emailsSent}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-50 p-2"><MailX className="h-5 w-5 text-red-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Emails Failed</p>
                <p className="text-2xl font-bold">{summary.emailsFailed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Category Cards (only in "All" view) */}
      {categoryFilter === "ALL" && categoryBreakdown.length > 0 && (
        <>
          <h3 className="text-lg font-semibold">By Category</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryBreakdown.map((cat) => (
                <Card key={cat.category} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setCategoryFilter(cat.category)}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-base">{cat.category}</h4>
                      <span className="text-2xl font-bold">{cat.total}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div>
                        <div className="rounded-md bg-blue-50 py-2 mb-1">
                          <p className="text-lg font-bold text-blue-600">{cat.IMPORTED}</p>
                        </div>
                        <p className="text-muted-foreground">Imported</p>
                      </div>
                      <div>
                        <div className="rounded-md bg-orange-50 py-2 mb-1">
                          <p className="text-lg font-bold text-orange-600">{cat.INVITED}</p>
                        </div>
                        <p className="text-muted-foreground">Invited</p>
                      </div>
                      <div>
                        <div className="rounded-md bg-green-50 py-2 mb-1">
                          <p className="text-lg font-bold text-green-600">{cat.REGISTERED}</p>
                        </div>
                        <p className="text-muted-foreground">Registered</p>
                      </div>
                      <div>
                        <div className="rounded-md bg-red-50 py-2 mb-1">
                          <p className="text-lg font-bold text-red-600">{cat.CANCELLED}</p>
                        </div>
                        <p className="text-muted-foreground">Cancelled</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
