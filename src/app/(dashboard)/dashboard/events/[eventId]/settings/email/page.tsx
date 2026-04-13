"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Mail,
  Server,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";

type EmailProvider = "SYSTEM" | "CUSTOM_SMTP" | "RESEND" | "SENDGRID" | "MAILGUN";

interface EmailSettings {
  eventId: string;
  provider: EmailProvider;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure?: boolean;
  apiKey?: string;
  isVerified: boolean;
  verifiedAt?: string;
}

const PROVIDERS: { value: EmailProvider; label: string; description: string }[] = [
  {
    value: "SYSTEM",
    label: "System Default",
    description: "Use the system's default email configuration",
  },
  {
    value: "CUSTOM_SMTP",
    label: "Custom SMTP",
    description: "Use your own SMTP server",
  },
  {
    value: "RESEND",
    label: "Resend",
    description: "Use Resend API for email delivery",
  },
  {
    value: "SENDGRID",
    label: "SendGrid",
    description: "Use SendGrid API for email delivery",
  },
  {
    value: "MAILGUN",
    label: "Mailgun",
    description: "Use Mailgun API for email delivery",
  },
];

export default function EmailSettingsPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [settings, setSettings] = useState<EmailSettings>({
    eventId,
    provider: "SYSTEM",
    fromName: "",
    fromEmail: "",
    isVerified: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    fetchSettings();
  }, [eventId]);

  async function fetchSettings() {
    try {
      const res = await fetch(`/api/events/${eventId}/email-settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch {
      toast.error("Failed to load email settings");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/email-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        toast.success("Email settings saved");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail() {
    if (!testEmail) {
      toast.error("Please enter a test email address");
      return;
    }

    setTesting(true);
    try {
      const res = await fetch(`/api/events/${eventId}/email-settings/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testEmail }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Test email sent!");
      } else {
        toast.error(data.error || "Failed to send test email");
      }
    } catch {
      toast.error("Failed to send test email");
    } finally {
      setTesting(false);
    }
  }

  async function verifySettings() {
    setVerifying(true);
    try {
      const res = await fetch(`/api/events/${eventId}/email-settings/verify`, {
        method: "POST",
      });

      const data = await res.json();
      if (res.ok) {
        setSettings({ ...settings, isVerified: true, verifiedAt: data.verifiedAt });
        toast.success("Email settings verified!");
      } else {
        toast.error(data.error || "Verification failed");
      }
    } catch {
      toast.error("Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center">Loading...</div>;
  }

  const showSmtpFields = settings.provider === "CUSTOM_SMTP";
  const showApiKeyField = ["RESEND", "SENDGRID", "MAILGUN"].includes(settings.provider);
  const showCustomFields = settings.provider !== "SYSTEM";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Settings"
        description="Configure how emails are sent for this event"
      />

      {/* Provider Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Provider
          </CardTitle>
          <CardDescription>
            Choose how emails are sent for this event
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROVIDERS.map((provider) => (
              <div
                key={provider.value}
                className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                  settings.provider === provider.value
                    ? "border-primary bg-primary/5"
                    : "hover:border-muted-foreground/50"
                }`}
                onClick={() =>
                  setSettings({ ...settings, provider: provider.value, isVerified: provider.value === "SYSTEM" })
                }
              >
                <div className="font-medium">{provider.label}</div>
                <div className="text-sm text-muted-foreground">
                  {provider.description}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Custom Configuration */}
      {showCustomFields && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Configuration
            </CardTitle>
            <CardDescription>
              Configure your email provider settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>From Name *</Label>
                <Input
                  value={settings.fromName}
                  onChange={(e) =>
                    setSettings({ ...settings, fromName: e.target.value })
                  }
                  placeholder="Your Event Name"
                />
              </div>
              <div className="space-y-2">
                <Label>From Email *</Label>
                <Input
                  type="email"
                  value={settings.fromEmail}
                  onChange={(e) =>
                    setSettings({ ...settings, fromEmail: e.target.value })
                  }
                  placeholder="noreply@yourdomain.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reply-To Email (optional)</Label>
              <Input
                type="email"
                value={settings.replyTo || ""}
                onChange={(e) =>
                  setSettings({ ...settings, replyTo: e.target.value })
                }
                placeholder="support@yourdomain.com"
              />
            </div>

            {showSmtpFields && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>SMTP Host *</Label>
                    <Input
                      value={settings.smtpHost || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, smtpHost: e.target.value })
                      }
                      placeholder="smtp.example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SMTP Port</Label>
                    <Input
                      type="number"
                      value={settings.smtpPort || 587}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          smtpPort: parseInt(e.target.value) || 587,
                        })
                      }
                      placeholder="587"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>SMTP Username *</Label>
                    <Input
                      value={settings.smtpUser || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, smtpUser: e.target.value })
                      }
                      placeholder="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SMTP Password *</Label>
                    <Input
                      type="password"
                      value={settings.smtpPassword || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, smtpPassword: e.target.value })
                      }
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={settings.smtpSecure ?? true}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, smtpSecure: checked })
                    }
                  />
                  <Label>Use TLS/SSL</Label>
                </div>
              </>
            )}

            {showApiKeyField && (
              <div className="space-y-2">
                <Label>API Key *</Label>
                <Input
                  type="password"
                  value={settings.apiKey || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, apiKey: e.target.value })
                  }
                  placeholder="••••••••"
                />
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button onClick={saveSettings} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Verification & Testing */}
      {showCustomFields && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Verification & Testing
            </CardTitle>
            <CardDescription>
              Verify your settings and send a test email
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Verification Status */}
            <div className="flex items-center gap-3 rounded-lg border p-4">
              {settings.isVerified ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <div className="font-medium text-green-700">Verified</div>
                    <div className="text-sm text-muted-foreground">
                      {settings.verifiedAt
                        ? `Verified on ${new Date(settings.verifiedAt).toLocaleDateString()}`
                        : "Email settings are verified and ready to use"}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                  <div className="flex-1">
                    <div className="font-medium text-yellow-700">Not Verified</div>
                    <div className="text-sm text-muted-foreground">
                      Please verify your settings before using them
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={verifySettings}
                    disabled={verifying}
                  >
                    {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify Now
                  </Button>
                </>
              )}
            </div>

            {/* Test Email */}
            <div className="space-y-2">
              <Label>Send Test Email</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={sendTestEmail}
                  disabled={testing || !settings.isVerified}
                >
                  {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Test
                </Button>
              </div>
              {!settings.isVerified && (
                <p className="text-sm text-muted-foreground">
                  Verify your settings first to send a test email
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Default Info */}
      {settings.provider === "SYSTEM" && (
        <Card>
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <div className="font-medium">Using System Default</div>
                <div className="text-sm text-muted-foreground">
                  Emails will be sent using the system&apos;s default email configuration.
                  No additional setup required.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
