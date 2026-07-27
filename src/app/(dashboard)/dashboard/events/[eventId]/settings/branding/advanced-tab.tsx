"use client";

import type { Dispatch, SetStateAction } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TabsContent } from "@/components/ui/tabs";
import type { BrandingSettings } from "./types";

// Advanced tab: the per-event custom CSS editor.
export function AdvancedTab({
  branding,
  setBranding,
  savingBranding,
  saveBranding,
}: {
  branding: BrandingSettings;
  setBranding: Dispatch<SetStateAction<BrandingSettings>>;
  savingBranding: boolean;
  saveBranding: () => void;
}) {
  return (
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
  );
}
