"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import type { DomainSettings } from "./types";

// Domain tab: default URL, custom-domain entry with edit lock, TXT/CNAME
// instructions, verification, and the remove-domain entry point (the
// confirm dialog itself stays mounted at the page root).
export function DomainTab({
  eventId,
  registrationUrl,
  domain,
  setDomain,
  isEditingDomain,
  setIsEditingDomain,
  verifying,
  savingDomain,
  saveDomain,
  verifyDomain,
  setRemoveDialogOpen,
}: {
  eventId: string;
  registrationUrl: string;
  domain: DomainSettings;
  setDomain: Dispatch<SetStateAction<DomainSettings>>;
  isEditingDomain: boolean;
  setIsEditingDomain: (editing: boolean) => void;
  verifying: boolean;
  savingDomain: boolean;
  saveDomain: () => void;
  verifyDomain: () => void;
  setRemoveDialogOpen: (open: boolean) => void;
}) {
  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  return (
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
                          Add the following TXT record to your domain&apos;s DNS settings:
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
  );
}
