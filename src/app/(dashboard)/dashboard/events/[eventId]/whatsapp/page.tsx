"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { isSyntheticEmail } from "@/lib/contact/synthetic-email";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  Settings,
  BarChart3,
  History,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  RefreshCw,
  Loader2,
  Copy,
  ExternalLink,
} from "lucide-react";

interface WhatsAppSettings {
  id?: string;
  isActive: boolean;
  provider: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  accessToken?: string;
  webhookVerifyToken?: string;
  confirmationTemplate?: string;
  reminderTemplate?: string;
  badgeTemplate?: string;
}

interface WhatsAppStats {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

interface WhatsAppLog {
  id: string;
  templateName: string;
  phoneNumber: string;
  status: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  errorMessage?: string;
  createdAt: string;
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
}

export default function WhatsAppPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [settings, setSettings] = useState<WhatsAppSettings>({
    isActive: false,
    provider: "META",
  });
  const [stats, setStats] = useState<WhatsAppStats | null>(null);
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    fetchData();
  }, [eventId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [settingsRes, statsRes, logsRes] = await Promise.all([
        fetch(`/api/events/${eventId}/whatsapp`),
        fetch(`/api/events/${eventId}/whatsapp/stats`),
        fetch(`/api/events/${eventId}/whatsapp/logs?limit=50`),
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setSettings(data);
      }

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }

      if (logsRes.ok) {
        setLogs(await logsRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch WhatsApp data:", error);
      toast.error("Failed to load WhatsApp settings");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        toast.success("Settings saved successfully");
        fetchData();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to save settings");
      }
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function generateWebhookToken() {
    const token = crypto.randomUUID();
    setSettings({ ...settings, webhookVerifyToken: token });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "PENDING":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "SENT":
        return <Badge variant="outline"><Send className="w-3 h-3 mr-1" />Sent</Badge>;
      case "DELIVERED":
        return <Badge variant="default"><CheckCircle className="w-3 h-3 mr-1" />Delivered</Badge>;
      case "READ":
        return <Badge className="bg-green-500"><Eye className="w-3 h-3 mr-1" />Read</Badge>;
      case "FAILED":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/whatsapp`
    : "/api/webhooks/whatsapp";

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp"
        description="Configure WhatsApp Business API for sending notifications"
      >
        <Button variant="outline" onClick={fetchData}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </PageHeader>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="stats">
            <BarChart3 className="w-4 h-4 mr-2" />
            Statistics
          </TabsTrigger>
          <TabsTrigger value="logs">
            <History className="w-4 h-4 mr-2" />
            Message Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6 mt-6">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                WhatsApp Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable WhatsApp Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Send registration confirmations, reminders, and badges via WhatsApp
                  </p>
                </div>
                <Switch
                  checked={settings.isActive}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, isActive: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* API Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Meta Business API Configuration</CardTitle>
              <CardDescription>
                Connect your WhatsApp Business account through the Meta Business API
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                  <Input
                    id="phoneNumberId"
                    value={settings.phoneNumberId || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, phoneNumberId: e.target.value })
                    }
                    placeholder="Enter Phone Number ID"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessAccountId">Business Account ID</Label>
                  <Input
                    id="businessAccountId"
                    value={settings.businessAccountId || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, businessAccountId: e.target.value })
                    }
                    placeholder="Enter Business Account ID"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessToken">Access Token</Label>
                <div className="flex gap-2">
                  <Input
                    id="accessToken"
                    type={showToken ? "text" : "password"}
                    value={settings.accessToken || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, accessToken: e.target.value })
                    }
                    placeholder="Enter Permanent Access Token"
                  />
                  <Button
                    variant="outline"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? "Hide" : "Show"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Generate a permanent access token from Meta Business Settings
                </p>
              </div>

              <div className="rounded-lg bg-muted p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Webhook URL</p>
                    <p className="text-xs text-muted-foreground">
                      Configure this URL in your Meta App Dashboard
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(webhookUrl)}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
                <code className="block text-xs bg-background p-2 rounded break-all">
                  {webhookUrl}
                </code>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhookVerifyToken">Webhook Verify Token</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhookVerifyToken"
                    value={settings.webhookVerifyToken || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, webhookVerifyToken: e.target.value })
                    }
                    placeholder="Enter or generate a verify token"
                  />
                  <Button variant="outline" onClick={generateWebhookToken}>
                    Generate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use this token when configuring the webhook in Meta App Dashboard
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Message Templates */}
          <Card>
            <CardHeader>
              <CardTitle>Message Templates</CardTitle>
              <CardDescription>
                Configure pre-approved WhatsApp message templates. Templates must be
                created and approved in your Meta Business Manager first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="confirmationTemplate">Confirmation Template</Label>
                <Input
                  id="confirmationTemplate"
                  value={settings.confirmationTemplate || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, confirmationTemplate: e.target.value })
                  }
                  placeholder="e.g., registration_confirmation"
                />
                <p className="text-xs text-muted-foreground">
                  Variables: {"{{1}}"} = First Name, {"{{2}}"} = Event Name, {"{{3}}"} = Confirmation Code
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reminderTemplate">Reminder Template</Label>
                <Input
                  id="reminderTemplate"
                  value={settings.reminderTemplate || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, reminderTemplate: e.target.value })
                  }
                  placeholder="e.g., event_reminder"
                />
                <p className="text-xs text-muted-foreground">
                  Variables: {"{{1}}"} = First Name, {"{{2}}"} = Event Name, {"{{3}}"} = Event Date
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="badgeTemplate">Badge Delivery Template</Label>
                <Input
                  id="badgeTemplate"
                  value={settings.badgeTemplate || ""}
                  onChange={(e) =>
                    setSettings({ ...settings, badgeTemplate: e.target.value })
                  }
                  placeholder="e.g., badge_delivery"
                />
                <p className="text-xs text-muted-foreground">
                  Variables: {"{{1}}"} = First Name, {"{{2}}"} = Event Name, {"{{3}}"} = Badge URL
                </p>
              </div>

              <div className="flex items-center gap-2 pt-4">
                <Button
                  variant="outline"
                  asChild
                >
                  <a
                    href="https://business.facebook.com/wa/manage/message-templates/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Manage Templates in Meta
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="stats" className="mt-6">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-3xl font-bold">{stats?.total || 0}</p>
                  <p className="text-sm text-muted-foreground">Total Messages</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-yellow-600">{stats?.pending || 0}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-600">{stats?.sent || 0}</p>
                  <p className="text-sm text-muted-foreground">Sent</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-indigo-600">{stats?.delivered || 0}</p>
                  <p className="text-sm text-muted-foreground">Delivered</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">{stats?.read || 0}</p>
                  <p className="text-sm text-muted-foreground">Read</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-red-600">{stats?.failed || 0}</p>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Message History</CardTitle>
              <CardDescription>
                Recent WhatsApp messages sent from this event
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No messages sent yet
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Template</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {log.contact.firstName} {log.contact.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {isSyntheticEmail(log.contact.email) ? "—" : log.contact.email}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {log.phoneNumber}
                          </TableCell>
                          <TableCell>{log.templateName}</TableCell>
                          <TableCell>{getStatusBadge(log.status)}</TableCell>
                          <TableCell className="text-sm">
                            {log.sentAt
                              ? new Date(log.sentAt).toLocaleString()
                              : new Date(log.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm text-red-600 max-w-xs truncate">
                            {log.errorMessage || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
