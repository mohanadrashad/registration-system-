"use client";

import type { Dispatch, SetStateAction } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TabsContent } from "@/components/ui/tabs";
import type { BrandingSettings } from "./types";

// Content tab: bilingual welcome title/message + footer text.
export function ContentTab({
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
  );
}
