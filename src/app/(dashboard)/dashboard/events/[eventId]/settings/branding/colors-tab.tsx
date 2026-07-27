"use client";

import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { prefersWhiteText, readableTextColor } from "@/lib/color-contrast";
import type { BrandingSettings } from "./types";

// Colors tab: brand colors + the Registration Header card (color presets,
// logo/event-name switch, logo size, live preview).
export function ColorsTab({
  branding,
  setBranding,
  eventName,
  savingBranding,
  saveBranding,
}: {
  branding: BrandingSettings;
  setBranding: Dispatch<SetStateAction<BrandingSettings>>;
  eventName: string;
  savingBranding: boolean;
  saveBranding: () => void;
}) {
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
  );
}
