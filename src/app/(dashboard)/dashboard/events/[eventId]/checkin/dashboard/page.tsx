"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { isSyntheticEmail } from "@/lib/contact/synthetic-email";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  QrCode,
  Users,
  CheckCircle,
  Clock,
  BarChart3,
  Download,
  RefreshCw,
} from "lucide-react";

interface Contact {
  firstName: string;
  lastName: string;
  email: string;
  organization?: string;
  category?: string;
}

interface Stats {
  totalRegistrations: number;
  checkedIn: number;
  remaining: number;
  checkInRate: number;
  checkInsByLocation: { location: string; count: number }[];
}

interface CheckInRecord {
  id: string;
  checkInTime: string;
  checkOutTime?: string;
  method: string;
  location?: string;
  contact: Contact;
  confirmationCode: string;
}

export default function CheckInDashboardPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [stats, setStats] = useState<Stats | null>(null);
  const [recentCheckIns, setRecentCheckIns] = useState<CheckInRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [eventId]);

  async function fetchData() {
    try {
      const [statsRes, recentRes] = await Promise.all([
        fetch(`/api/events/${eventId}/checkin`),
        fetch(`/api/events/${eventId}/checkin/recent?limit=50`),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (recentRes.ok) {
        const recentData = await recentRes.json();
        setRecentCheckIns(recentData);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success("Data refreshed");
  }

  async function exportCheckIns() {
    try {
      // Create CSV from current data
      const headers = [
        "First Name",
        "Last Name",
        "Email",
        "Organization",
        "Category",
        "Confirmation Code",
        "Check-in Time",
        "Method",
        "Location",
      ];

      const rows = recentCheckIns.map((c) => [
        c.contact.firstName,
        c.contact.lastName,
        isSyntheticEmail(c.contact.email) ? "" : c.contact.email,
        c.contact.organization || "",
        c.contact.category || "",
        c.confirmationCode,
        new Date(c.checkInTime).toLocaleString(),
        c.method,
        c.location || "",
      ]);

      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `checkin-report-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Export downloaded");
    } catch (error) {
      toast.error("Export failed");
    }
  }

  if (loading) {
    return <div className="py-12 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Check-in Dashboard" description="View check-in statistics and history">
        <Button variant="outline" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button variant="outline" onClick={exportCheckIns}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
        <Button asChild>
          <a href={`/dashboard/events/${eventId}/checkin`}>
            <QrCode className="mr-2 h-4 w-4" />
            Scanner
          </a>
        </Button>
      </PageHeader>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-blue-100 p-3">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalRegistrations || 0}</p>
                <p className="text-sm text-muted-foreground">Total Registered</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.checkedIn || 0}</p>
                <p className="text-sm text-muted-foreground">Checked In</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-yellow-100 p-3">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.remaining || 0}</p>
                <p className="text-sm text-muted-foreground">Remaining</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-purple-100 p-3">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.checkInRate || 0}%</p>
                <p className="text-sm text-muted-foreground">Check-in Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Check-ins by Location */}
      {stats?.checkInsByLocation && stats.checkInsByLocation.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Check-ins by Location</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {stats.checkInsByLocation.map((loc) => (
                <div key={loc.location} className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">{loc.location}</span>
                  <span className="text-2xl font-bold">{loc.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Check-in History */}
      <Card>
        <CardHeader>
          <CardTitle>Check-in History</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCheckIns.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No check-ins recorded yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentCheckIns.map((checkIn) => (
                    <TableRow key={checkIn.id}>
                      <TableCell className="font-medium">
                        {checkIn.contact.firstName} {checkIn.contact.lastName}
                      </TableCell>
                      <TableCell>{checkIn.contact.organization || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {checkIn.confirmationCode}
                      </TableCell>
                      <TableCell>
                        {new Date(checkIn.checkInTime).toLocaleString()}
                      </TableCell>
                      <TableCell>{checkIn.method.replace("_", " ")}</TableCell>
                      <TableCell>{checkIn.location || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
