"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { isSyntheticEmail } from "@/lib/contact/synthetic-email";
import {
  QrCode,
  Search,
  CheckCircle,
  XCircle,
  Users,
  Clock,
  BarChart3,
  Loader2,
  Camera,
  CameraOff,
} from "lucide-react";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  organization?: string;
  category?: string;
}

interface SearchResult {
  id: string;
  confirmationCode: string;
  contact: Contact;
  isCheckedIn: boolean;
}

interface Stats {
  totalRegistrations: number;
  checkedIn: number;
  remaining: number;
  checkInRate: number;
}

interface RecentCheckIn {
  id: string;
  checkInTime: string;
  contact: Contact;
  confirmationCode: string;
}

export default function CheckInPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [stats, setStats] = useState<Stats | null>(null);
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [lastCheckIn, setLastCheckIn] = useState<{
    success: boolean;
    contact?: Contact;
    confirmationCode?: string;
    error?: string;
  } | null>(null);
  const [manualCode, setManualCode] = useState("");

  // Fetch stats periodically
  useEffect(() => {
    fetchStats();
    fetchRecentCheckIns();

    const interval = setInterval(() => {
      fetchStats();
      fetchRecentCheckIns();
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [eventId]);

  async function fetchStats() {
    try {
      const res = await fetch(`/api/events/${eventId}/checkin`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }

  async function fetchRecentCheckIns() {
    try {
      const res = await fetch(`/api/events/${eventId}/checkin/recent?limit=5`);
      if (res.ok) {
        const data = await res.json();
        setRecentCheckIns(data);
      }
    } catch (error) {
      console.error("Failed to fetch recent check-ins:", error);
    }
  }

  async function searchAttendees(query: string) {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/checkin/search?q=${encodeURIComponent(query)}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      } else {
        toast.error("Search failed — please try again");
      }
    } catch (error) {
      console.error("Failed to search:", error);
      toast.error("Search failed — please try again");
    } finally {
      setSearching(false);
    }
  }

  async function checkIn(confirmationCode: string) {
    setCheckingIn(confirmationCode);
    setLastCheckIn(null);

    try {
      const res = await fetch(`/api/events/${eventId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmationCode,
          method: "MANUAL",
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setLastCheckIn({
          success: true,
          contact: data.registration.contact,
          confirmationCode: data.registration.confirmationCode ?? confirmationCode,
        });
        toast.success(
          `Checked in: ${data.registration.contact.firstName} ${data.registration.contact.lastName}`
        );
        fetchStats();
        fetchRecentCheckIns();
        setSearchQuery("");
        setSearchResults([]);
        setManualCode("");
      } else {
        setLastCheckIn({
          success: false,
          contact: data.registration?.contact,
          error: data.error,
        });
        if (data.alreadyCheckedIn) {
          toast.error(`Already checked in: ${data.registration?.contact?.firstName || "Unknown"}`);
        } else {
          toast.error(data.error || "Check-in failed");
        }
      }
    } catch (error) {
      setLastCheckIn({
        success: false,
        error: "Network error",
      });
      toast.error("Network error");
    } finally {
      setCheckingIn(null);
    }
  }

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchAttendees(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check-in"
        description="Scan QR codes or search for attendees"
      >
        <Button variant="outline" asChild>
          <a href={`/dashboard/events/${eventId}/checkin/dashboard`}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Dashboard
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Check-in Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Check-in
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Last Check-in Result */}
            {lastCheckIn && (
              <div
                className={`rounded-lg p-4 ${
                  lastCheckIn.success
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  {lastCheckIn.success ? (
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  ) : (
                    <XCircle className="h-8 w-8 text-red-500" />
                  )}
                  <div>
                    {lastCheckIn.success && lastCheckIn.contact && (
                      <>
                        <p className="font-semibold text-green-700">
                          {lastCheckIn.contact.firstName} {lastCheckIn.contact.lastName}
                        </p>
                        <p className="text-sm text-green-600">
                          {lastCheckIn.contact.organization ||
                            (!isSyntheticEmail(lastCheckIn.contact.email)
                              ? lastCheckIn.contact.email
                              : lastCheckIn.confirmationCode
                                ? `Reg #${lastCheckIn.confirmationCode.slice(0, 8)}`
                                : "")}
                        </p>
                      </>
                    )}
                    {!lastCheckIn.success && (
                      <p className="font-semibold text-red-700">
                        {lastCheckIn.error}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Manual Code Entry */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirmation Code</label>
              <div className="flex gap-2">
                <Input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  placeholder="Enter code..."
                  className="font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && manualCode) {
                      checkIn(manualCode);
                    }
                  }}
                />
                <Button
                  onClick={() => checkIn(manualCode)}
                  disabled={!manualCode || checkingIn === manualCode}
                >
                  {checkingIn === manualCode ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Check In"
                  )}
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Attendee</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Name, email, or code..."
                  className="pl-10"
                />
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {result.contact.firstName} {result.contact.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {result.contact.organization ||
                          (!isSyntheticEmail(result.contact.email)
                            ? result.contact.email
                            : `Reg #${result.confirmationCode.slice(0, 8)}`)}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {result.confirmationCode}
                      </p>
                    </div>
                    {result.isCheckedIn ? (
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" />
                        Checked In
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => checkIn(result.confirmationCode)}
                        disabled={checkingIn === result.confirmationCode}
                      >
                        {checkingIn === result.confirmationCode ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Check In"
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {searching && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Check-ins */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Check-ins
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentCheckIns.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No check-ins yet
              </p>
            ) : (
              <div className="space-y-3">
                {recentCheckIns.map((checkIn) => (
                  <div
                    key={checkIn.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {checkIn.contact.firstName} {checkIn.contact.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {checkIn.contact.organization ||
                          (!isSyntheticEmail(checkIn.contact.email)
                            ? checkIn.contact.email
                            : `Reg #${checkIn.confirmationCode.slice(0, 8)}`)}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(checkIn.checkInTime).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
