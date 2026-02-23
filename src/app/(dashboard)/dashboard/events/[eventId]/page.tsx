"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Copy, X, Plus } from "lucide-react";

interface Event {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  venue: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  categories: string[];
}

export default function EventSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then((r) => { if (r.ok) return r.json(); throw new Error("Failed"); })
      .then((data) => {
        setEvent(data);
        setCategories(data.categories || []);
      })
      .catch(() => toast.error("Failed to load event"));
  }, [eventId]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const res = await fetch(`/api/events/${eventId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        description: formData.get("description"),
        venue: formData.get("venue"),
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate"),
        categories,
      }),
    });

    if (res.ok) {
      toast.success("Event updated");
      const updated = await res.json();
      setEvent(updated);
    } else {
      toast.error("Failed to update");
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this event? This cannot be undone.")) return;

    const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Event deleted");
      router.push("/dashboard/events");
    } else {
      toast.error("Failed to delete");
    }
  }

  if (!event) return <div className="py-12 text-center">Loading...</div>;

  const registrationUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/register/${event.slug}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Event Settings" description={event.name} />

      <Card>
        <CardHeader>
          <CardTitle>Registration Link</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input value={registrationUrl} readOnly />
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(registrationUrl);
                toast.success("Copied to clipboard");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
            <div className="space-y-2">
              <Label>Event Name</Label>
              <Input name="name" defaultValue={event.name} required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea name="description" defaultValue={event.description || ""} />
            </div>
            <div className="space-y-2">
              <Label>Venue</Label>
              <Input name="venue" defaultValue={event.venue || ""} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  name="startDate"
                  type="date"
                  defaultValue={event.startDate.split("T")[0]}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  name="endDate"
                  type="date"
                  defaultValue={event.endDate.split("T")[0]}
                  required
                />
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attendee Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Define categories to group attendees (e.g., Project Management, Production, AV, IT).
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <Badge key={cat} variant="secondary" className="text-sm py-1 px-3 gap-1">
                {cat}
                <button
                  type="button"
                  onClick={() => setCategories(categories.filter((c) => c !== cat))}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 max-w-sm">
            <Input
              placeholder="New category name"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = newCategory.trim();
                  if (val && !categories.includes(val)) {
                    setCategories([...categories, val]);
                    setNewCategory("");
                  }
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                const val = newCategory.trim();
                if (val && !categories.includes(val)) {
                  setCategories([...categories, val]);
                  setNewCategory("");
                }
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              const res = await fetch(`/api/events/${eventId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ categories }),
              });
              if (res.ok) {
                toast.success("Categories saved");
                const updated = await res.json();
                setEvent(updated);
              } else {
                toast.error("Failed to save categories");
              }
            }}
          >
            Save Categories
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleDelete}>
            Delete Event
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
