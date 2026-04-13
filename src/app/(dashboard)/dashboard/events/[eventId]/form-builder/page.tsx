"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  Wand2,
  Type,
  Mail,
  Phone,
  AlignLeft,
  Hash,
  ChevronDownIcon,
  CheckSquare,
  Circle,
  Calendar,
  Clock,
  Globe,
  Upload,
  EyeOff,
  Heading,
  Minus,
  FileText,
} from "lucide-react";
import { FieldType, FieldWidth } from "@prisma/client";

interface FormField {
  id: string;
  name: string;
  label: string;
  labelAr?: string;
  type: FieldType;
  placeholder?: string;
  required: boolean;
  order: number;
  width: FieldWidth;
  isSystem: boolean;
  isActive: boolean;
  options?: { value: string; label: string }[];
}

const FIELD_ICONS: Record<FieldType, React.ReactNode> = {
  TEXT: <Type className="h-4 w-4" />,
  EMAIL: <Mail className="h-4 w-4" />,
  PHONE: <Phone className="h-4 w-4" />,
  TEXTAREA: <AlignLeft className="h-4 w-4" />,
  NUMBER: <Hash className="h-4 w-4" />,
  SELECT: <ChevronDownIcon className="h-4 w-4" />,
  MULTISELECT: <CheckSquare className="h-4 w-4" />,
  RADIO: <Circle className="h-4 w-4" />,
  CHECKBOX: <CheckSquare className="h-4 w-4" />,
  DATE: <Calendar className="h-4 w-4" />,
  TIME: <Clock className="h-4 w-4" />,
  DATETIME: <Calendar className="h-4 w-4" />,
  COUNTRY: <Globe className="h-4 w-4" />,
  PHONE_COUNTRY: <Phone className="h-4 w-4" />,
  FILE: <Upload className="h-4 w-4" />,
  HIDDEN: <EyeOff className="h-4 w-4" />,
  HEADING: <Heading className="h-4 w-4" />,
  DIVIDER: <Minus className="h-4 w-4" />,
  PARAGRAPH: <FileText className="h-4 w-4" />,
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  TEXT: "Text Input",
  EMAIL: "Email",
  PHONE: "Phone",
  TEXTAREA: "Long Text",
  NUMBER: "Number",
  SELECT: "Dropdown",
  MULTISELECT: "Multi-Select",
  RADIO: "Radio Buttons",
  CHECKBOX: "Checkbox",
  DATE: "Date",
  TIME: "Time",
  DATETIME: "Date & Time",
  COUNTRY: "Country",
  PHONE_COUNTRY: "Phone with Country",
  FILE: "File Upload",
  HIDDEN: "Hidden",
  HEADING: "Section Heading",
  DIVIDER: "Divider",
  PARAGRAPH: "Info Text",
};

export default function FormBuilderPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newField, setNewField] = useState({
    name: "",
    label: "",
    type: "TEXT" as FieldType,
    required: false,
    width: "FULL" as FieldWidth,
  });

  useEffect(() => {
    fetchFields();
  }, [eventId]);

  async function fetchFields() {
    try {
      const res = await fetch(`/api/events/${eventId}/form-fields`);
      if (res.ok) {
        const data = await res.json();
        setFields(data);
      }
    } catch {
      toast.error("Failed to load fields");
    } finally {
      setLoading(false);
    }
  }

  async function seedDefaultFields() {
    try {
      const res = await fetch(`/api/events/${eventId}/form-fields/seed`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setFields(data);
        toast.success("Default fields created");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to seed fields");
      }
    } catch {
      toast.error("Failed to seed fields");
    }
  }

  async function addField() {
    if (!newField.name || !newField.label) {
      toast.error("Name and label are required");
      return;
    }

    try {
      const res = await fetch(`/api/events/${eventId}/form-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newField),
      });

      if (res.ok) {
        const field = await res.json();
        setFields([...fields, field]);
        setIsAddDialogOpen(false);
        setNewField({
          name: "",
          label: "",
          type: "TEXT",
          required: false,
          width: "FULL",
        });
        toast.success("Field added");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to add field");
      }
    } catch {
      toast.error("Failed to add field");
    }
  }

  async function updateField(field: FormField) {
    try {
      const res = await fetch(
        `/api/events/${eventId}/form-fields/${field.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(field),
        }
      );

      if (res.ok) {
        const updated = await res.json();
        setFields(fields.map((f) => (f.id === updated.id ? updated : f)));
        setEditingField(null);
        toast.success("Field updated");
      } else {
        toast.error("Failed to update field");
      }
    } catch {
      toast.error("Failed to update field");
    }
  }

  async function deleteField(fieldId: string) {
    if (!confirm("Are you sure you want to delete this field?")) return;

    try {
      const res = await fetch(
        `/api/events/${eventId}/form-fields/${fieldId}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        setFields(fields.filter((f) => f.id !== fieldId));
        toast.success("Field deleted");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete field");
      }
    } catch {
      toast.error("Failed to delete field");
    }
  }

  async function moveField(fieldId: string, direction: "up" | "down") {
    const index = fields.findIndex((f) => f.id === fieldId);
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === fields.length - 1)
    ) {
      return;
    }

    const newFields = [...fields];
    const swapIndex = direction === "up" ? index - 1 : index + 1;

    // Swap order values
    const tempOrder = newFields[index].order;
    newFields[index].order = newFields[swapIndex].order;
    newFields[swapIndex].order = tempOrder;

    // Swap positions in array
    [newFields[index], newFields[swapIndex]] = [
      newFields[swapIndex],
      newFields[index],
    ];

    setFields(newFields);

    // Save to server
    try {
      await fetch(`/api/events/${eventId}/form-fields/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: newFields.map((f, i) => ({ id: f.id, order: i })),
        }),
      });
    } catch {
      toast.error("Failed to save order");
      fetchFields(); // Revert
    }
  }

  if (loading) {
    return <div className="py-12 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Form Builder"
        description="Configure registration form fields"
      >
        <Button variant="outline" asChild>
          <a
            href={`/register/${eventId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Eye className="mr-2 h-4 w-4" />
            Preview Form
          </a>
        </Button>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
          </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Field</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Field Name (internal)</Label>
                    <Input
                      value={newField.name}
                      onChange={(e) =>
                        setNewField({
                          ...newField,
                          name: e.target.value.replace(/\s/g, "_").toLowerCase(),
                        })
                      }
                      placeholder="field_name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Label</Label>
                    <Input
                      value={newField.label}
                      onChange={(e) =>
                        setNewField({ ...newField, label: e.target.value })
                      }
                      placeholder="Display Label"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select
                      value={newField.type}
                      onValueChange={(v) =>
                        setNewField({ ...newField, type: v as FieldType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
                          <SelectItem key={type} value={type}>
                            <div className="flex items-center gap-2">
                              {FIELD_ICONS[type as FieldType]}
                              {label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Width</Label>
                    <Select
                      value={newField.width}
                      onValueChange={(v) =>
                        setNewField({ ...newField, width: v as FieldWidth })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FULL">Full Width</SelectItem>
                        <SelectItem value="HALF">Half Width</SelectItem>
                        <SelectItem value="THIRD">One Third</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newField.required}
                      onCheckedChange={(c) =>
                        setNewField({ ...newField, required: c })
                      }
                    />
                    <Label>Required</Label>
                  </div>
                  <Button onClick={addField} className="w-full">
                    Add Field
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
      </PageHeader>

      {fields.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No form fields yet. Add fields manually or start with defaults.
            </p>
            <Button onClick={seedDefaultFields}>
              <Wand2 className="mr-2 h-4 w-4" />
              Create Default Fields
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Form Fields ({fields.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="flex items-center gap-2 rounded-lg border p-3"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />

                <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                  {FIELD_ICONS[field.type]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{field.label}</span>
                    {field.required && (
                      <span className="text-xs text-destructive">*</span>
                    )}
                    {field.isSystem && (
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        System
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {FIELD_TYPE_LABELS[field.type]} &middot; {field.name}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveField(field.id, "up")}
                    disabled={index === 0}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveField(field.id, "down")}
                    disabled={index === fields.length - 1}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingField(field)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!field.isSystem && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteField(field.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingField} onOpenChange={() => setEditingField(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Field</DialogTitle>
          </DialogHeader>
          {editingField && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Field Name</Label>
                <Input
                  value={editingField.name}
                  onChange={(e) =>
                    setEditingField({ ...editingField, name: e.target.value })
                  }
                  disabled={editingField.isSystem}
                />
              </div>
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  value={editingField.label}
                  onChange={(e) =>
                    setEditingField({ ...editingField, label: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={editingField.type}
                  onValueChange={(v) =>
                    setEditingField({ ...editingField, type: v as FieldType })
                  }
                  disabled={editingField.isSystem}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
                      <SelectItem key={type} value={type}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Width</Label>
                <Select
                  value={editingField.width}
                  onValueChange={(v) =>
                    setEditingField({ ...editingField, width: v as FieldWidth })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL">Full Width</SelectItem>
                    <SelectItem value="HALF">Half Width</SelectItem>
                    <SelectItem value="THIRD">One Third</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editingField.required}
                  onCheckedChange={(c) =>
                    setEditingField({ ...editingField, required: c })
                  }
                />
                <Label>Required</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editingField.isActive}
                  onCheckedChange={(c) =>
                    setEditingField({ ...editingField, isActive: c })
                  }
                />
                <Label>Active</Label>
              </div>
              <Button
                onClick={() => updateField(editingField)}
                className="w-full"
              >
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
