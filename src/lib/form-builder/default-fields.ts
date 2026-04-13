import { FieldType, FieldWidth } from "@prisma/client";

export interface DefaultFieldConfig {
  name: string;
  label: string;
  labelAr: string;
  type: FieldType;
  required: boolean;
  order: number;
  isSystem: boolean;
  width?: FieldWidth;
  placeholder?: string;
  placeholderAr?: string;
}

export const DEFAULT_FIELDS: DefaultFieldConfig[] = [
  {
    name: "firstName",
    label: "First Name",
    labelAr: "الاسم الأول",
    type: "TEXT",
    required: true,
    order: 0,
    isSystem: true,
    width: "HALF",
    placeholder: "Enter your first name",
    placeholderAr: "أدخل اسمك الأول",
  },
  {
    name: "lastName",
    label: "Last Name",
    labelAr: "اسم العائلة",
    type: "TEXT",
    required: true,
    order: 1,
    isSystem: true,
    width: "HALF",
    placeholder: "Enter your last name",
    placeholderAr: "أدخل اسم العائلة",
  },
  {
    name: "email",
    label: "Email",
    labelAr: "البريد الإلكتروني",
    type: "EMAIL",
    required: true,
    order: 2,
    isSystem: true,
    placeholder: "your@email.com",
    placeholderAr: "بريدك@example.com",
  },
  {
    name: "phone",
    label: "Phone Number",
    labelAr: "رقم الهاتف",
    type: "PHONE",
    required: false,
    order: 3,
    isSystem: false,
    width: "HALF",
    placeholder: "+966 5XX XXX XXXX",
  },
  {
    name: "organization",
    label: "Organization",
    labelAr: "الجهة / المنظمة",
    type: "TEXT",
    required: false,
    order: 4,
    isSystem: false,
    width: "HALF",
    placeholder: "Company or organization name",
    placeholderAr: "اسم الشركة أو المنظمة",
  },
  {
    name: "designation",
    label: "Job Title",
    labelAr: "المسمى الوظيفي",
    type: "TEXT",
    required: false,
    order: 5,
    isSystem: false,
    placeholder: "Your job title",
    placeholderAr: "مسماك الوظيفي",
  },
];

export function getDefaultFieldsForEvent(eventId: string) {
  return DEFAULT_FIELDS.map((field) => ({
    ...field,
    eventId,
  }));
}
