"use client";

import type { Dispatch, SetStateAction } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import { BrandingImageField } from "@/components/admin/branding-image-field";
import type { BrandingSettings } from "./types";

// Images tab: logo / white logo / favicon uploads + the legacy header-image field.
export function ImagesTab({
  eventId,
  branding,
  setBranding,
  savingBranding,
  saveBranding,
}: {
  eventId: string;
  branding: BrandingSettings;
  setBranding: Dispatch<SetStateAction<BrandingSettings>>;
  savingBranding: boolean;
  saveBranding: () => void;
}) {
  return (
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
                <BrandingImageField
                  eventId={eventId}
                  kind="logo"
                  label="Logo URL"
                  value={branding.logoUrl || ""}
                  onChange={(url) => setBranding({ ...branding, logoUrl: url })}
                  helpText="Recommended: 200×50px PNG with a transparent background. Upload a file or paste a URL."
                />

                <BrandingImageField
                  eventId={eventId}
                  kind="logoWhite"
                  label="Logo (White/Light version)"
                  value={branding.logoWhiteUrl || ""}
                  onChange={(url) =>
                    setBranding({ ...branding, logoWhiteUrl: url })
                  }
                  helpText="For use on dark headers."
                />

                <BrandingImageField
                  eventId={eventId}
                  kind="favicon"
                  label="Favicon"
                  value={branding.faviconUrl || ""}
                  onChange={(url) =>
                    setBranding({ ...branding, faviconUrl: url })
                  }
                  helpText="32×32px ICO, PNG, or SVG."
                  accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
                />

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
  );
}
