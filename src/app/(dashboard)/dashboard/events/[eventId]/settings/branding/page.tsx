"use client";

// Branding settings — container page. Owns the branding/domain state and
// all API calls; each tab's UI lives in its own colocated file.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Palette, Image, Type, Code, Globe, Eye, Loader2 } from "lucide-react";

import type { BrandingSettings, DomainSettings } from "./types";
import { ColorsTab } from "./colors-tab";
import { ImagesTab } from "./images-tab";
import { ContentTab } from "./content-tab";
import { AdvancedTab } from "./advanced-tab";
import { DomainTab } from "./domain-tab";
import { RemoveDomainDialog } from "./remove-domain-dialog";

export default function BrandingPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [branding, setBranding] = useState<BrandingSettings>({
    primaryColor: "#7dc242",
  });
  const [domain, setDomain] = useState<DomainSettings>({
    isVerified: false,
  });
  const [loading, setLoading] = useState(true);
  const [savingBranding, setSavingBranding] = useState(false);
  const [savingDomain, setSavingDomain] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [eventSlug, setEventSlug] = useState("");
  const [eventName, setEventName] = useState("");
  const [isEditingDomain, setIsEditingDomain] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [eventId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [brandingRes, domainRes, eventRes] = await Promise.all([
        fetch(`/api/events/${eventId}/branding`),
        fetch(`/api/events/${eventId}/domain`).catch(() => null),
        fetch(`/api/events/${eventId}`),
      ]);

      if (brandingRes.ok) {
        setBranding(await brandingRes.json());
      }

      if (domainRes?.ok) {
        setDomain(await domainRes.json());
      }

      if (eventRes.ok) {
        const event = await eventRes.json();
        setEventSlug(event.slug);
        setEventName(event.name ?? "");
      }
    } catch (error) {
      console.error("Failed to fetch branding data:", error);
      toast.error("Failed to load branding settings");
    } finally {
      setLoading(false);
    }
  }

  async function saveBranding() {
    setSavingBranding(true);
    try {
      const res = await fetch(`/api/events/${eventId}/branding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branding),
      });

      if (res.ok) {
        toast.success("Branding saved successfully");
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to save branding");
      }
    } catch (error) {
      toast.error("Failed to save branding");
    } finally {
      setSavingBranding(false);
    }
  }

  async function saveDomain() {
    setSavingDomain(true);
    try {
      const res = await fetch(`/api/events/${eventId}/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customDomain: domain.customDomain }),
      });

      if (res.ok) {
        const data = await res.json();
        setDomain(data);
        setIsEditingDomain(false);
        toast.success("Domain settings saved");
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to save domain");
      }
    } catch {
      toast.error("Failed to save domain");
    } finally {
      setSavingDomain(false);
    }
  }

  async function removeDomain() {
    setRemoving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/domain`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDomain({ isVerified: false });
        setIsEditingDomain(false);
        setRemoveDialogOpen(false);
        toast.success("Domain removed");
      } else {
        const error = await res.json().catch(() => null);
        toast.error(error?.error || "Failed to remove domain");
      }
    } catch {
      toast.error("Failed to remove domain");
    } finally {
      setRemoving(false);
    }
  }

  async function verifyDomain() {
    setVerifying(true);
    try {
      const res = await fetch(`/api/events/${eventId}/domain/verify`, {
        method: "POST",
      });

      const data = await res.json();

      if (data.verified) {
        setDomain({ ...domain, isVerified: true, verifiedAt: new Date().toISOString() });
        toast.success("Domain verified successfully");
      } else {
        toast.error(data.message || "Domain verification failed");
      }
    } catch (error) {
      toast.error("Failed to verify domain");
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const registrationUrl = typeof window !== "undefined"
    ? `${window.location.origin}/register/${eventSlug}`
    : `/register/${eventSlug}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Event Branding"
        description="Customize the look and feel of your registration page"
      >
        <Button variant="outline" asChild>
          <a href={registrationUrl} target="_blank" rel="noopener noreferrer">
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </a>
        </Button>
      </PageHeader>

      <Tabs defaultValue="colors">
        <TabsList>
          <TabsTrigger value="colors">
            <Palette className="w-4 h-4 mr-2" />
            Colors
          </TabsTrigger>
          <TabsTrigger value="images">
            <Image className="w-4 h-4 mr-2" />
            Images
          </TabsTrigger>
          <TabsTrigger value="content">
            <Type className="w-4 h-4 mr-2" />
            Content
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <Code className="w-4 h-4 mr-2" />
            Advanced
          </TabsTrigger>
          <TabsTrigger value="domain">
            <Globe className="w-4 h-4 mr-2" />
            Domain
          </TabsTrigger>
        </TabsList>

        <ColorsTab
          branding={branding}
          setBranding={setBranding}
          eventName={eventName}
          savingBranding={savingBranding}
          saveBranding={saveBranding}
        />

        <ImagesTab
          eventId={eventId}
          branding={branding}
          setBranding={setBranding}
          savingBranding={savingBranding}
          saveBranding={saveBranding}
        />

        <ContentTab
          branding={branding}
          setBranding={setBranding}
          savingBranding={savingBranding}
          saveBranding={saveBranding}
        />

        <AdvancedTab
          branding={branding}
          setBranding={setBranding}
          savingBranding={savingBranding}
          saveBranding={saveBranding}
        />

        <DomainTab
          eventId={eventId}
          registrationUrl={registrationUrl}
          domain={domain}
          setDomain={setDomain}
          isEditingDomain={isEditingDomain}
          setIsEditingDomain={setIsEditingDomain}
          verifying={verifying}
          savingDomain={savingDomain}
          saveDomain={saveDomain}
          verifyDomain={verifyDomain}
          setRemoveDialogOpen={setRemoveDialogOpen}
        />
      </Tabs>

      <RemoveDomainDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        customDomain={domain.customDomain}
        removing={removing}
        onConfirm={removeDomain}
      />
    </div>
  );
}
