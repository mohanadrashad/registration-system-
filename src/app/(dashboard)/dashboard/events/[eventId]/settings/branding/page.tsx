"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { prefersWhiteText, readableTextColor } from "@/lib/color-contrast";
import {
  Palette,
  Image,
  Type,
  Code,
  Globe,
  Eye,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Copy,
  ExternalLink,
  Pencil,
  Trash2,
  AlertTriangle,
} from "lucide-react";

interface BrandingSettings {
  id?: string;
  primaryColor: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  logoUrl?: string;
  logoWhiteUrl?: string;
  faviconUrl?: string;
  headerImageUrl?: string;
  headerColor?: string | null;
  headerShowLogo?: boolean;
  logoHeight?: number | null;
  customCss?: string;
  welcomeTitle?: string;
  welcomeTitleAr?: string;
  welcomeMessage?: string;
  welcomeMessageAr?: string;
  footerText?: string;
  footerTextAr?: string;
}

interface DomainSettings {
  id?: string;
  customDomain?: string;
  isVerified: boolean;
  verifiedAt?: string;
  verificationRecord?: string;
}

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

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
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

  // ── Header card derived state (mirrors the public renderer in Stage 1) ──
  const resolvedHeaderColor = branding.headerColor || "#0c0c0e";
  const headerIsDark = prefersWhiteText(resolvedHeaderColor);
  const headerTextColor = readableTextColor(resolvedHeaderColor);
  const headerShowLogo = branding.headerShowLogo !== false;
  // Dark/light-aware logo pick — same precedence as the public page.
  const previewLogo = !headerShowLogo
    ? null
    : headerIsDark
    ? branding.logoWhiteUrl || branding.logoUrl || null
    : branding.logoUrl || branding.logoWhiteUrl || null;
  const previewLogoHeight = Math.min(80, Math.max(24, branding.logoHeight ?? 48));
  // Warn only when the pick would actually render a white logo on a light
  // strip: light header + showing a logo + a white logo set but no colored one.
  const whiteLogoOnLightWarning =
    headerShowLogo &&
    !headerIsDark &&
    !!branding.logoWhiteUrl &&
    !branding.logoUrl;

  const HEADER_PRESETS = [
    "#0c0c0e",
    "#1f2937",
    "#0b3d2e",
    "#3b0764",
    "#f3f4f6",
    "#ffffff",
  ];

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

        <TabsContent value="colors" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Brand Colors</CardTitle>
              <CardDescription>
                Set your event's color scheme for the registration page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="primaryColor"
                      type="color"
                      value={branding.primaryColor}
                      onChange={(e) =>
                        setBranding({ ...branding, primaryColor: e.target.value })
                      }
                      className="w-16 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={branding.primaryColor}
                      onChange={(e) =>
                        setBranding({ ...branding, primaryColor: e.target.value })
                      }
                      placeholder="#7dc242"
                      className="font-mono"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used for buttons, links, and accents
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="secondaryColor">Secondary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="secondaryColor"
                      type="color"
                      value={branding.secondaryColor || "#ffffff"}
                      onChange={(e) =>
                        setBranding({ ...branding, secondaryColor: e.target.value })
                      }
                      className="w-16 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={branding.secondaryColor || ""}
                      onChange={(e) =>
                        setBranding({ ...branding, secondaryColor: e.target.value })
                      }
                      placeholder="Optional"
                      className="font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="backgroundColor">Background Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="backgroundColor"
                      type="color"
                      value={branding.backgroundColor || "#ffffff"}
                      onChange={(e) =>
                        setBranding({ ...branding, backgroundColor: e.target.value })
                      }
                      className="w-16 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={branding.backgroundColor || ""}
                      onChange={(e) =>
                        setBranding({ ...branding, backgroundColor: e.target.value })
                      }
                      placeholder="Optional"
                      className="font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="textColor">Text Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="textColor"
                      type="color"
                      value={branding.textColor || "#000000"}
                      onChange={(e) =>
                        setBranding({ ...branding, textColor: e.target.value })
                      }
                      className="w-16 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={branding.textColor || ""}
                      onChange={(e) =>
                        setBranding({ ...branding, textColor: e.target.value })
                      }
                      placeholder="Optional"
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Color Preview */}
              <div className="rounded-lg border p-6 space-y-4">
                <p className="text-sm font-medium text-muted-foreground">Preview</p>
                <div
                  className="rounded-lg p-6"
                  style={{
                    backgroundColor: branding.backgroundColor || "#ffffff",
                    color: branding.textColor || "#000000",
                  }}
                >
                  <h3 className="text-lg font-semibold mb-2">Sample Heading</h3>
                  <p className="mb-4">This is sample text showing how your colors will look.</p>
                  <button
                    className="px-4 py-2 rounded-md text-white font-medium"
                    style={{ backgroundColor: branding.primaryColor }}
                  >
                    Register Now
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registration Header</CardTitle>
              <CardDescription>
                The colored strip at the top of the registration page. Text
                color adjusts automatically for contrast.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Header color */}
                <div className="space-y-2">
                  <Label htmlFor="headerColor">Header Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="headerColor"
                      type="color"
                      value={resolvedHeaderColor}
                      onChange={(e) =>
                        setBranding({ ...branding, headerColor: e.target.value })
                      }
                      className="w-16 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={branding.headerColor || ""}
                      onChange={(e) =>
                        setBranding({ ...branding, headerColor: e.target.value })
                      }
                      placeholder="#0c0c0e (default)"
                      className="font-mono"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {HEADER_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        aria-label={`Set header color ${preset}`}
                        onClick={() =>
                          setBranding({ ...branding, headerColor: preset })
                        }
                        className={`h-6 w-6 rounded-md border transition-transform hover:scale-110 ${
                          resolvedHeaderColor.toLowerCase() === preset.toLowerCase()
                            ? "ring-2 ring-offset-1 ring-primary"
                            : "border-gray-300"
                        }`}
                        style={{ backgroundColor: preset }}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave the text box empty for the default dark header.
                  </p>
                </div>

                {/* Logo / event-name hard switch + size */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="headerShowLogo">Header Content</Label>
                    <div className="flex items-center gap-3">
                      <Switch
                        id="headerShowLogo"
                        checked={headerShowLogo}
                        onCheckedChange={(checked) =>
                          setBranding({ ...branding, headerShowLogo: checked })
                        }
                      />
                      <span className="text-sm">
                        {headerShowLogo ? "Show logo" : "Show event name"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When off, the header always shows the event name — even
                      if a logo is set.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="logoHeight">Logo Size</Label>
                      <span className="text-xs font-mono text-muted-foreground">
                        {previewLogoHeight}px
                      </span>
                    </div>
                    <Slider
                      id="logoHeight"
                      min={24}
                      max={80}
                      step={1}
                      value={[previewLogoHeight]}
                      onValueChange={([v]) =>
                        setBranding({ ...branding, logoHeight: v })
                      }
                      disabled={!headerShowLogo}
                    />
                    <p className="text-xs text-muted-foreground">
                      Max logo height in the header. Small logos are never
                      enlarged.
                    </p>
                  </div>
                </div>
              </div>

              {/* White-logo-on-light warning */}
              {whiteLogoOnLightWarning && (
                <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    This header is light but only a white logo is set — it will
                    be nearly invisible. Add a colored <strong>Logo URL</strong>{" "}
                    (Images tab), or use a darker header color.
                  </span>
                </div>
              )}

              {/* Live preview */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Live Preview
                </p>
                <div className="rounded-lg border overflow-hidden max-w-md">
                  <div
                    className="px-6 py-7 flex items-center justify-center"
                    style={{ backgroundColor: resolvedHeaderColor }}
                  >
                    {previewLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewLogo}
                        alt="Header logo preview"
                        style={{ maxHeight: previewLogoHeight }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <span
                        className="text-lg font-semibold"
                        style={{ color: headerTextColor }}
                      >
                        {eventName || "Event Name"}
                      </span>
                    )}
                  </div>
                  <div
                    className="h-[3px] w-full"
                    style={{
                      background: `linear-gradient(90deg, ${
                        branding.primaryColor
                      }, ${branding.secondaryColor || "#CB1681"})`,
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveBranding} disabled={savingBranding}>
              {savingBranding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Colors"
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="images" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Logo & Images</CardTitle>
              <CardDescription>
                Upload your event logo and header images
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="logoUrl">Logo URL</Label>
                  <Input
                    id="logoUrl"
                    value={branding.logoUrl || ""}
                    onChange={(e) =>
                      setBranding({ ...branding, logoUrl: e.target.value })
                    }
                    placeholder="https://example.com/logo.png"
                  />
                  <p className="text-xs text-muted-foreground">
                    Recommended: 200x50px PNG with transparent background
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logoWhiteUrl">Logo (White/Light version)</Label>
                  <Input
                    id="logoWhiteUrl"
                    value={branding.logoWhiteUrl || ""}
                    onChange={(e) =>
                      setBranding({ ...branding, logoWhiteUrl: e.target.value })
                    }
                    placeholder="https://example.com/logo-white.png"
                  />
                  <p className="text-xs text-muted-foreground">
                    For use on dark backgrounds
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="faviconUrl">Favicon URL</Label>
                  <Input
                    id="faviconUrl"
                    value={branding.faviconUrl || ""}
                    onChange={(e) =>
                      setBranding({ ...branding, faviconUrl: e.target.value })
                    }
                    placeholder="https://example.com/favicon.ico"
                  />
                  <p className="text-xs text-muted-foreground">
                    32x32px ICO or PNG
                  </p>
                </div>

                <div className="space-y-2 opacity-80">
                  <Label
                    htmlFor="headerImageUrl"
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    Header Image URL
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Legacy · not used
                    </span>
                  </Label>
                  <Input
                    id="headerImageUrl"
                    value={branding.headerImageUrl || ""}
                    onChange={(e) =>
                      setBranding({ ...branding, headerImageUrl: e.target.value })
                    }
                    placeholder="No longer used"
                  />
                  <p className="text-xs text-muted-foreground">
                    This field is no longer shown on the registration page — the
                    header is configured under{" "}
                    <strong>Colors → Registration Header</strong>. It is{" "}
                    <strong>not</strong> a logo field; set your logo via Logo URL
                    above. Safe to leave blank.
                  </p>
                </div>
              </div>

              {/* Logo Preview */}
              {branding.logoUrl && (
                <div className="rounded-lg border p-6">
                  <p className="text-sm font-medium text-muted-foreground mb-4">Logo Preview</p>
                  <img
                    src={branding.logoUrl}
                    alt="Logo preview"
                    className="max-h-20 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveBranding} disabled={savingBranding}>
              {savingBranding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Images"
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="content" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Welcome Message</CardTitle>
              <CardDescription>
                Customize the welcome text shown on the registration page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="welcomeTitle">Welcome Title (English)</Label>
                  <Input
                    id="welcomeTitle"
                    value={branding.welcomeTitle || ""}
                    onChange={(e) =>
                      setBranding({ ...branding, welcomeTitle: e.target.value })
                    }
                    placeholder="Welcome to Our Event"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="welcomeTitleAr">Welcome Title (Arabic)</Label>
                  <Input
                    id="welcomeTitleAr"
                    value={branding.welcomeTitleAr || ""}
                    onChange={(e) =>
                      setBranding({ ...branding, welcomeTitleAr: e.target.value })
                    }
                    placeholder="مرحبا بكم في فعاليتنا"
                    dir="rtl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="welcomeMessage">Welcome Message (English)</Label>
                  <Textarea
                    id="welcomeMessage"
                    value={branding.welcomeMessage || ""}
                    onChange={(e) =>
                      setBranding({ ...branding, welcomeMessage: e.target.value })
                    }
                    placeholder="Please fill out the registration form below..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="welcomeMessageAr">Welcome Message (Arabic)</Label>
                  <Textarea
                    id="welcomeMessageAr"
                    value={branding.welcomeMessageAr || ""}
                    onChange={(e) =>
                      setBranding({ ...branding, welcomeMessageAr: e.target.value })
                    }
                    placeholder="يرجى ملء نموذج التسجيل أدناه..."
                    rows={3}
                    dir="rtl"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Footer</CardTitle>
              <CardDescription>
                Customize the footer text
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="footerText">Footer Text (English)</Label>
                  <Input
                    id="footerText"
                    value={branding.footerText || ""}
                    onChange={(e) =>
                      setBranding({ ...branding, footerText: e.target.value })
                    }
                    placeholder="© 2024 Your Organization"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="footerTextAr">Footer Text (Arabic)</Label>
                  <Input
                    id="footerTextAr"
                    value={branding.footerTextAr || ""}
                    onChange={(e) =>
                      setBranding({ ...branding, footerTextAr: e.target.value })
                    }
                    placeholder="© 2024 منظمتكم"
                    dir="rtl"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveBranding} disabled={savingBranding}>
              {savingBranding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Content"
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Custom CSS</CardTitle>
              <CardDescription>
                Add custom CSS to further customize your registration page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customCss">Custom CSS</Label>
                <Textarea
                  id="customCss"
                  value={branding.customCss || ""}
                  onChange={(e) =>
                    setBranding({ ...branding, customCss: e.target.value })
                  }
                  placeholder={`.registration-form {
  /* Your custom styles */
}

.submit-button {
  border-radius: 8px;
}`}
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  CSS will be applied to the public registration page only.
                </p>
                <p className="text-xs text-muted-foreground">
                  Stable selectors you can target:{" "}
                  <code className="font-mono">[data-event-date]</code>,{" "}
                  <code className="font-mono">[data-event-time]</code>, and{" "}
                  <code className="font-mono">[data-event-venue]</code> wrap
                  the event date, time, and venue displayed below the banner —
                  use{" "}
                  <code className="font-mono">
                    {`[data-event-date], [data-event-time], [data-event-venue] { display: none; }`}
                  </code>{" "}
                  to hide them.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveBranding} disabled={savingBranding}>
              {savingBranding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save CSS"
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="domain" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Custom Domain</CardTitle>
              <CardDescription>
                Use your own domain for the registration page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm font-medium mb-2">Default Registration URL</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-background px-2 py-1 rounded flex-1 break-all">
                    {registrationUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(registrationUrl)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customDomain">Custom Domain</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="customDomain"
                    value={domain.customDomain || ""}
                    onChange={(e) =>
                      setDomain({ ...domain, customDomain: e.target.value })
                    }
                    placeholder="register.your-event.com"
                    readOnly={!!domain.customDomain && !isEditingDomain}
                    className={!!domain.customDomain && !isEditingDomain ? "bg-muted" : ""}
                  />
                  {!!domain.customDomain && !isEditingDomain && (
                    <Button
                      variant="outline"
                      onClick={() => setIsEditingDomain(true)}
                      className="shrink-0"
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
                {isEditingDomain && domain.isVerified && (
                  <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Changing the domain will reset verification. You&apos;ll need to
                      re-add the TXT record on the new hostname.
                    </span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Enter your custom domain without https://
                </p>
              </div>

              {domain.customDomain && (
                <>
                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {domain.isVerified ? (
                          <>
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            <span className="text-green-600 font-medium">Domain Verified</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-5 w-5 text-yellow-500" />
                            <span className="text-yellow-600 font-medium">Pending Verification</span>
                          </>
                        )}
                      </div>
                      {!domain.isVerified && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={verifyDomain}
                          disabled={verifying}
                        >
                          {verifying ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Verify
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {!domain.isVerified && domain.verificationRecord && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">DNS Configuration</p>
                        <p className="text-xs text-muted-foreground">
                          Add the following TXT record to your domain's DNS settings:
                        </p>
                        <div className="bg-muted rounded p-3 space-y-2">
                          <div>
                            <span className="text-xs text-muted-foreground">Type:</span>
                            <code className="ml-2 text-sm">TXT</code>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Name/Host:</span>
                            <code className="ml-2 text-sm">
                              {(() => {
                                const parts = (domain.customDomain || "").split(".").filter(Boolean);
                                return parts.length > 2 ? parts.slice(0, -2).join(".") : "@";
                              })()}
                            </code>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Value:</span>
                            <div className="flex items-center gap-2 mt-1">
                              <code className="text-sm break-all">{domain.verificationRecord}</code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(domain.verificationRecord!)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          DNS changes can take up to 48 hours to propagate.
                        </p>
                      </div>
                    )}
                  </div>

                  {!domain.isVerified && (
                    <div className="rounded-lg border p-4 space-y-2">
                      <p className="text-sm font-medium">CNAME Record</p>
                      <p className="text-xs text-muted-foreground">
                        After verification, add a CNAME record to point your domain to our servers:
                      </p>
                      <div className="bg-muted rounded p-3 space-y-2">
                        <div>
                          <span className="text-xs text-muted-foreground">Type:</span>
                          <code className="ml-2 text-sm">CNAME</code>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Name/Host:</span>
                          <code className="ml-2 text-sm">{domain.customDomain?.split(".")[0] || "register"}</code>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Value:</span>
                          <code className="ml-2 text-sm">
                            {typeof window !== "undefined" ? window.location.host : "your-app.vercel.app"}
                          </code>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between items-center">
                <div>
                  {domain.customDomain && (
                    <Button
                      variant="outline"
                      onClick={() => setRemoveDialogOpen(true)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remove Domain
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {isEditingDomain && domain.customDomain && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setIsEditingDomain(false);
                        // Refetch to revert any unsaved edits — simpler than tracking original value
                        fetch(`/api/events/${eventId}/domain`)
                          .then((r) => (r.ok ? r.json() : null))
                          .then((d) => d && setDomain(d));
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    onClick={saveDomain}
                    disabled={
                      savingDomain ||
                      (!!domain.customDomain && !isEditingDomain)
                    }
                  >
                    {savingDomain ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Domain"
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remove Custom Domain
            </DialogTitle>
            <DialogDescription>
              This will disconnect{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {domain.customDomain}
              </code>{" "}
              from this event. Emails, badge links, and QR codes will immediately
              fall back to the default URL.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p className="font-medium">You&apos;ll also want to clean up externally:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Remove the domain from your Vercel project&apos;s Domains settings.</li>
              <li>Delete the CNAME record in your DNS provider.</li>
              <li>Delete the TXT verification record if still present.</li>
            </ul>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveDialogOpen(false)}
              disabled={removing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={removeDomain}
              disabled={removing}
            >
              {removing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Domain"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
