import { FieldType, FieldWidth } from "@prisma/client";

export interface FieldTypeConfig {
  type: FieldType;
  label: string;
  labelAr: string;
  icon: string; // Lucide icon name
  category: "text" | "selection" | "datetime" | "special" | "layout";
  hasOptions: boolean;
  hasValidation: boolean;
  defaultValidation?: Record<string, unknown>;
}

export const FIELD_TYPES: Record<FieldType, FieldTypeConfig> = {
  TEXT: {
    type: "TEXT",
    label: "Text Input",
    labelAr: "حقل نص",
    icon: "Type",
    category: "text",
    hasOptions: false,
    hasValidation: true,
  },
  EMAIL: {
    type: "EMAIL",
    label: "Email",
    labelAr: "البريد الإلكتروني",
    icon: "Mail",
    category: "text",
    hasOptions: false,
    hasValidation: true,
    defaultValidation: { pattern: "email" },
  },
  PHONE: {
    type: "PHONE",
    label: "Phone Number",
    labelAr: "رقم الهاتف",
    icon: "Phone",
    category: "text",
    hasOptions: false,
    hasValidation: true,
  },
  TEXTAREA: {
    type: "TEXTAREA",
    label: "Long Text",
    labelAr: "نص طويل",
    icon: "AlignLeft",
    category: "text",
    hasOptions: false,
    hasValidation: true,
  },
  NUMBER: {
    type: "NUMBER",
    label: "Number",
    labelAr: "رقم",
    icon: "Hash",
    category: "text",
    hasOptions: false,
    hasValidation: true,
  },
  SELECT: {
    type: "SELECT",
    label: "Dropdown",
    labelAr: "قائمة منسدلة",
    icon: "ChevronDown",
    category: "selection",
    hasOptions: true,
    hasValidation: false,
  },
  MULTISELECT: {
    type: "MULTISELECT",
    label: "Multi-Select",
    labelAr: "اختيار متعدد",
    icon: "CheckSquare",
    category: "selection",
    hasOptions: true,
    hasValidation: false,
  },
  RADIO: {
    type: "RADIO",
    label: "Radio Buttons",
    labelAr: "أزرار اختيار",
    icon: "Circle",
    category: "selection",
    hasOptions: true,
    hasValidation: false,
  },
  CHECKBOX: {
    type: "CHECKBOX",
    label: "Checkbox",
    labelAr: "مربع اختيار",
    icon: "CheckSquare",
    category: "selection",
    hasOptions: false,
    hasValidation: false,
  },
  DATE: {
    type: "DATE",
    label: "Date",
    labelAr: "تاريخ",
    icon: "Calendar",
    category: "datetime",
    hasOptions: false,
    hasValidation: true,
  },
  TIME: {
    type: "TIME",
    label: "Time",
    labelAr: "وقت",
    icon: "Clock",
    category: "datetime",
    hasOptions: false,
    hasValidation: false,
  },
  DATETIME: {
    type: "DATETIME",
    label: "Date & Time",
    labelAr: "تاريخ ووقت",
    icon: "CalendarClock",
    category: "datetime",
    hasOptions: false,
    hasValidation: true,
  },
  COUNTRY: {
    type: "COUNTRY",
    label: "Country",
    labelAr: "الدولة",
    icon: "Globe",
    category: "special",
    hasOptions: false, // Pre-populated
    hasValidation: false,
  },
  PHONE_COUNTRY: {
    type: "PHONE_COUNTRY",
    label: "Phone with Country",
    labelAr: "هاتف مع رمز الدولة",
    icon: "Phone",
    category: "special",
    hasOptions: false,
    hasValidation: true,
  },
  FILE: {
    type: "FILE",
    label: "File Upload",
    labelAr: "رفع ملف",
    icon: "Upload",
    category: "special",
    hasOptions: false,
    hasValidation: true,
  },
  HIDDEN: {
    type: "HIDDEN",
    label: "Hidden Field",
    labelAr: "حقل مخفي",
    icon: "EyeOff",
    category: "special",
    hasOptions: false,
    hasValidation: false,
  },
  HEADING: {
    type: "HEADING",
    label: "Section Heading",
    labelAr: "عنوان قسم",
    icon: "Heading",
    category: "layout",
    hasOptions: false,
    hasValidation: false,
  },
  DIVIDER: {
    type: "DIVIDER",
    label: "Divider",
    labelAr: "فاصل",
    icon: "Minus",
    category: "layout",
    hasOptions: false,
    hasValidation: false,
  },
  PARAGRAPH: {
    type: "PARAGRAPH",
    label: "Info Text",
    labelAr: "نص معلومات",
    icon: "FileText",
    category: "layout",
    hasOptions: false,
    hasValidation: false,
  },
};

export const FIELD_WIDTH_OPTIONS: { value: FieldWidth; label: string }[] = [
  { value: "FULL", label: "Full Width" },
  { value: "HALF", label: "Half Width" },
  { value: "THIRD", label: "One Third" },
];

export const FIELD_CATEGORIES = [
  { key: "text", label: "Text Inputs", labelAr: "حقول نصية" },
  { key: "selection", label: "Selection", labelAr: "اختيارات" },
  { key: "datetime", label: "Date & Time", labelAr: "تاريخ ووقت" },
  { key: "special", label: "Special", labelAr: "خاصة" },
  { key: "layout", label: "Layout", labelAr: "تخطيط" },
] as const;

export function getFieldsByCategory(category: string): FieldTypeConfig[] {
  return Object.values(FIELD_TYPES).filter((f) => f.category === category);
}

export function isInputField(type: FieldType): boolean {
  return !["HEADING", "DIVIDER", "PARAGRAPH"].includes(type);
}
