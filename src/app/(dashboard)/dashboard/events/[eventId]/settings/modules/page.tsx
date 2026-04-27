"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  FormInput,
  QrCode,
  MessageCircle,
  Calendar,
  CreditCard,
  User,
  CheckCircle,
  Users,
  Globe,
  Globe2,
  Mail,
  Webhook,
  Layers,
} from "lucide-react";

interface ModuleConfig {
  key: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
}

const MODULES: ModuleConfig[] = [
  {
    key: "formBuilder",
    name: "Form Builder",
    description: "Create custom registration forms with drag-and-drop fields",
    icon: <FormInput className="h-5 w-5" />,
    category: "Core Features",
  },
  {
    key: "checkIn",
    name: "Check-in System",
    description: "QR code scanning and attendance tracking at event entry",
    icon: <QrCode className="h-5 w-5" />,
    category: "Event Day",
  },
  {
    key: "sessions",
    name: "Sessions & Agenda",
    description: "Manage event schedule, sessions, and speakers",
    icon: <Calendar className="h-5 w-5" />,
    category: "Event Day",
  },
  {
    key: "whatsApp",
    name: "WhatsApp Notifications",
    description: "Send confirmations, reminders, and badges via WhatsApp",
    icon: <MessageCircle className="h-5 w-5" />,
    category: "Communication",
  },
  {
    key: "customEmail",
    name: "Custom Email Sender",
    description: "Use custom SMTP settings for this event's emails",
    icon: <Mail className="h-5 w-5" />,
    category: "Communication",
  },
  {
    key: "approvalWorkflow",
    name: "Approval Workflow",
    description: "Manually approve or reject registration requests",
    icon: <CheckCircle className="h-5 w-5" />,
    category: "Registration",
  },
  {
    key: "waitlist",
    name: "Waitlist",
    description: "Automatically waitlist registrations when capacity is reached",
    icon: <Users className="h-5 w-5" />,
    category: "Registration",
  },
  {
    key: "postRegPhases",
    name: "Post-Registration Phases",
    description: "Collect additional info after registration (flight, hotel, etc.) with per-phase open/close windows",
    icon: <Layers className="h-5 w-5" />,
    category: "Registration",
  },
  {
    key: "selfServicePortal",
    name: "Self-Service Portal",
    description: "Allow attendees to view and edit their registration",
    icon: <User className="h-5 w-5" />,
    category: "Attendee Experience",
  },
  {
    key: "multiLanguage",
    name: "Multi-Language",
    description: "Support Arabic/English toggle on registration forms",
    icon: <Globe className="h-5 w-5" />,
    category: "Attendee Experience",
  },
  {
    key: "payments",
    name: "Payment Collection",
    description: "Accept payments during registration (Stripe)",
    icon: <CreditCard className="h-5 w-5" />,
    category: "Advanced",
  },
  {
    key: "customDomain",
    name: "Custom Domain",
    description: "Use your own domain for registration pages",
    icon: <Globe2 className="h-5 w-5" />,
    category: "Advanced",
  },
  {
    key: "webhooks",
    name: "Webhooks",
    description: "Send registration data to external services",
    icon: <Webhook className="h-5 w-5" />,
    category: "Advanced",
  },
];

const CATEGORIES = [
  "Core Features",
  "Communication",
  "Registration",
  "Event Day",
  "Attendee Experience",
  "Advanced",
];

interface Modules {
  formBuilder: boolean;
  checkIn: boolean;
  whatsApp: boolean;
  sessions: boolean;
  payments: boolean;
  selfServicePortal: boolean;
  approvalWorkflow: boolean;
  waitlist: boolean;
  multiLanguage: boolean;
  customDomain: boolean;
  customEmail: boolean;
  webhooks: boolean;
  postRegPhases: boolean;
}

export default function ModulesSettingsPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [modules, setModules] = useState<Modules | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/modules`)
      .then((r) => {
        if (r.ok) return r.json();
        throw new Error("Failed");
      })
      .then(setModules)
      .catch(() => {
        // Modules might not exist yet, create them
        fetch(`/api/events/${eventId}/modules`, { method: "POST" })
          .then((r) => r.json())
          .then(setModules)
          .catch(() => toast.error("Failed to load modules"));
      });
  }, [eventId]);

  async function toggleModule(key: string, enabled: boolean) {
    setUpdating(key);
    try {
      const res = await fetch(`/api/events/${eventId}/modules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: enabled }),
      });

      if (res.ok) {
        const updated = await res.json();
        setModules(updated);
        toast.success(`${enabled ? "Enabled" : "Disabled"} successfully`);
      } else {
        toast.error("Failed to update module");
      }
    } catch {
      toast.error("Failed to update module");
    } finally {
      setUpdating(null);
    }
  }

  if (!modules) {
    return <div className="py-12 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modules"
        description="Enable or disable optional features for this event"
      />

      {CATEGORIES.map((category) => {
        const categoryModules = MODULES.filter((m) => m.category === category);
        if (categoryModules.length === 0) return null;

        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle>{category}</CardTitle>
              <CardDescription>
                {category === "Core Features" && "Essential features for your event"}
                {category === "Communication" && "Ways to communicate with attendees"}
                {category === "Registration" && "Control how registrations work"}
                {category === "Event Day" && "Features for the day of your event"}
                {category === "Attendee Experience" && "Improve the attendee experience"}
                {category === "Advanced" && "Advanced configuration options"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {categoryModules.map((module) => (
                <div
                  key={module.key}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      {module.icon}
                    </div>
                    <div>
                      <p className="font-medium">{module.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {module.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={modules[module.key as keyof Modules] || false}
                    onCheckedChange={(checked) => toggleModule(module.key, checked)}
                    disabled={updating === module.key}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
