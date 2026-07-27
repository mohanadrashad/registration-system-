// Per-FieldType UI metadata for the form builder: list-row icons, the
// human-readable type names, and which types carry an options array.

import type { FieldType } from "@prisma/client";
import {
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

export const OPTION_FIELD_TYPES: FieldType[] = ["SELECT", "MULTISELECT", "RADIO"];

export const FIELD_ICONS: Record<FieldType, React.ReactNode> = {
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

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
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
