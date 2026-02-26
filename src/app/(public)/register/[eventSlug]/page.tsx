"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

interface PrefilledContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  organization: string | null;
  designation: string | null;
}

export default function RegisterPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventSlug = params.eventSlug as string;
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [prefilled, setPrefilled] = useState<PrefilledContact | null>(null);

  // If token is present, fetch the invited contact's data to pre-fill the form
  useEffect(() => {
    if (!token) return;
    fetch(`/api/register/${eventSlug}?token=${token}`)
      .then((r) => { if (r.ok) return r.json(); return null; })
      .then((data) => { if (data?.contact) setPrefilled(data.contact); })
      .catch(() => {});
  }, [eventSlug, token]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      organization: formData.get("organization"),
      designation: formData.get("designation"),
    };

    const url = token
      ? `/api/register/${eventSlug}?token=${token}`
      : `/api/register/${eventSlug}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (res.ok) {
      setSuccess(true);
    } else {
      setError(result.error || "Registration failed");
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
            <h2 className="mb-2 text-2xl font-bold">Registration Successful!</h2>
            <p className="text-muted-foreground">
              Thank you for registering. We look forward to seeing you there!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Event Registration</CardTitle>
          <CardDescription>Fill in your details to register</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" name="firstName" defaultValue={prefilled?.firstName || ""} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" name="lastName" defaultValue={prefilled?.lastName || ""} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={prefilled?.email || ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={prefilled?.phone || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Input id="organization" name="organization" defaultValue={prefilled?.organization || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="designation">Designation / Title</Label>
              <Input id="designation" name="designation" defaultValue={prefilled?.designation || ""} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Registering..." : "Register"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
