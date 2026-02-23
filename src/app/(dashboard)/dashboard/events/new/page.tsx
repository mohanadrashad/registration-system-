"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { toast } from "sonner";

export default function NewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name"),
      description: formData.get("description"),
      venue: formData.get("venue"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
    };

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      const event = await res.json();
      toast.success("Event created successfully");
      router.push(`/dashboard/events/${event.id}/contacts`);
    } else {
      toast.error("Failed to create event");
      setLoading(false);
    }
  }

  return (
    <DashboardShell>
    <div className="space-y-6">
      <PageHeader title="Create Event" description="Set up a new event" />
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
            <div className="space-y-2">
              <Label htmlFor="name">Event Name</Label>
              <Input id="name" name="name" placeholder="Tech Conference 2026" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" placeholder="Event description..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venue">Venue</Label>
              <Input id="venue" name="venue" placeholder="Convention Center" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" name="startDate" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input id="endDate" name="endDate" type="date" required />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Event"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
    </DashboardShell>
  );
}
