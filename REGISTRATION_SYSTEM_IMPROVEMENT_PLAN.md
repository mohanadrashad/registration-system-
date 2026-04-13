# Registration System — Improvement Plan

## Overview

This document outlines the plan to improve the existing **Registration System** built with Next.js 16, TypeScript, Prisma, and PostgreSQL. The goal is to transform it into a **universal, modular event registration platform** that can handle any type of event without rebuilding.

**Repository:** `https://github.com/mohanadrashad/registration-system-.git`

---

## Current State

### Tech Stack (Keep As-Is)
- **Framework:** Next.js 16.1.6 (App Router)
- **Language:** TypeScript 5
- **Database:** PostgreSQL + Prisma ORM 6.19
- **Auth:** NextAuth.js v5
- **UI:** Shadcn/ui + Tailwind CSS 4
- **Email:** Nodemailer + React Email
- **PDF/Badge:** @react-pdf/renderer + QRCode

### Existing Features (Working)
- ✅ Event CRUD (create, edit, delete events)
- ✅ Contact management (import/export CSV/Excel)
- ✅ Registration flow
- ✅ Email templates & campaigns
- ✅ Badge generation with QR codes
- ✅ User management with RBAC (4 roles)
- ✅ Statistics dashboard

### What's Missing
- ❌ Module system (feature toggles per event)
- ❌ Dynamic form builder (customizable registration fields)
- ❌ Custom email sender per event
- ❌ Custom domain per event
- ❌ WhatsApp integration
- ❌ Check-in system (QR scanning)
- ❌ Self-service portal for attendees
- ❌ Payment integration
- ❌ Sessions/agenda management

---

## Architecture Principles

1. **Modular:** Each feature is a module that can be ON/OFF per event
2. **Event Isolation:** Each event has its own settings, branding, domain, email
3. **Dynamic Forms:** Registration fields are configurable, not hardcoded
4. **Backward Compatible:** Existing events continue to work
5. **Incremental:** Add features without breaking existing code

---

## Phase 0: Preparation & Cleanup

### Task 0.1: Create Environment Example
Create `.env.example` file in project root:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/registration_system"

# NextAuth
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# App
APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Default Email (System)
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="your-email@example.com"
SMTP_PASSWORD="your-password"
SMTP_FROM_NAME="Registration System"
SMTP_FROM_EMAIL="noreply@example.com"

# WhatsApp (Optional - Phase 5)
# WHATSAPP_PHONE_NUMBER_ID=""
# WHATSAPP_ACCESS_TOKEN=""
# WHATSAPP_WEBHOOK_SECRET=""

# Payments (Optional - Future)
# STRIPE_SECRET_KEY=""
# STRIPE_WEBHOOK_SECRET=""
```

### Task 0.2: Update README.md
Replace the default Next.js README with project-specific documentation:

```markdown
# Registration System

A modular event registration platform built for La Gloire.

## Features
- Multi-event management
- Dynamic registration forms
- Email campaigns
- Badge generation with QR codes
- Check-in system
- WhatsApp notifications

## Tech Stack
- Next.js 16 (App Router)
- TypeScript
- PostgreSQL + Prisma
- NextAuth.js v5
- Shadcn/ui + Tailwind CSS

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in values
3. Install dependencies: `npm install`
4. Push database schema: `npm run db:push`
5. Seed database (optional): `npm run db:seed`
6. Run development server: `npm run dev`

## Scripts
- `npm run dev` - Development server
- `npm run build` - Production build
- `npm run db:migrate` - Run migrations
- `npm run db:push` - Push schema to database
- `npm run db:seed` - Seed database
- `npm run db:studio` - Open Prisma Studio
```

### Task 0.3: Add Services Layer
Create a services folder for business logic separation:

```
src/lib/services/
├── event.service.ts
├── contact.service.ts
├── registration.service.ts
├── email.service.ts
└── badge.service.ts
```

Example structure for `event.service.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { Event, Prisma } from "@prisma/client";

export const eventService = {
  async findAll() {
    return prisma.event.findMany({
      orderBy: { createdAt: "desc" },
    });
  },

  async findById(id: string) {
    return prisma.event.findUnique({
      where: { id },
      include: {
        modules: true,
        emailSettings: true,
        _count: {
          select: {
            contacts: true,
            registrations: true,
          },
        },
      },
    });
  },

  async findBySlug(slug: string) {
    return prisma.event.findUnique({
      where: { slug },
      include: {
        modules: true,
        formFields: { orderBy: { order: "asc" } },
      },
    });
  },

  async create(data: Prisma.EventCreateInput) {
    return prisma.event.create({ data });
  },

  async update(id: string, data: Prisma.EventUpdateInput) {
    return prisma.event.update({ where: { id }, data });
  },

  async delete(id: string) {
    return prisma.event.delete({ where: { id } });
  },
};
```

### Task 0.4: Add Custom Hooks Folder
Create hooks folder:

```
src/hooks/
├── use-event.ts
├── use-contacts.ts
├── use-debounce.ts
└── use-media-query.ts
```

### Task 0.5: Add Error Pages
Create error handling pages:

- `src/app/error.tsx` - Global error boundary
- `src/app/not-found.tsx` - 404 page
- `src/app/(dashboard)/dashboard/events/[eventId]/not-found.tsx` - Event not found

---

## Phase 1: Module System (Feature Toggles)

### Goal
Allow each event to enable/disable optional features. This is the foundation for all future modular features.

### Task 1.1: Update Prisma Schema

Add to `prisma/schema.prisma`:

```prisma
// ─── Event Modules (Feature Toggles) ───

model EventModules {
  id                  String   @id @default(cuid())
  eventId             String   @unique
  
  // Optional Modules (all default to false)
  formBuilder         Boolean  @default(true)   // Dynamic form fields (core, but toggleable)
  checkIn             Boolean  @default(false)  // QR check-in system
  whatsApp            Boolean  @default(false)  // WhatsApp notifications
  sessions            Boolean  @default(false)  // Agenda/session management
  payments            Boolean  @default(false)  // Payment collection
  selfServicePortal   Boolean  @default(false)  // Attendee self-service
  approvalWorkflow    Boolean  @default(false)  // Manual registration approval
  waitlist            Boolean  @default(false)  // Waitlist when capacity reached
  multiLanguage       Boolean  @default(false)  // AR/EN form toggle
  customDomain        Boolean  @default(false)  // Custom domain support
  customEmail         Boolean  @default(false)  // Custom SMTP per event
  webhooks            Boolean  @default(false)  // External integrations
  
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  event               Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
}
```

Update Event model to include relation:

```prisma
model Event {
  // ... existing fields ...
  
  modules         EventModules?
  
  // ... existing relations ...
}
```

### Task 1.2: Create Module Guard Utility

Create `src/lib/guards/module-guard.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export type ModuleName = 
  | "formBuilder"
  | "checkIn"
  | "whatsApp"
  | "sessions"
  | "payments"
  | "selfServicePortal"
  | "approvalWorkflow"
  | "waitlist"
  | "multiLanguage"
  | "customDomain"
  | "customEmail"
  | "webhooks";

export async function isModuleEnabled(
  eventId: string,
  moduleName: ModuleName
): Promise<boolean> {
  const modules = await prisma.eventModules.findUnique({
    where: { eventId },
  });
  
  if (!modules) return false;
  return modules[moduleName] === true;
}

export async function requireModule(
  eventId: string,
  moduleName: ModuleName
): Promise<NextResponse | null> {
  const enabled = await isModuleEnabled(eventId, moduleName);
  
  if (!enabled) {
    return NextResponse.json(
      { error: `Module "${moduleName}" is not enabled for this event` },
      { status: 403 }
    );
  }
  
  return null;
}

export async function getEventModules(eventId: string) {
  return prisma.eventModules.findUnique({
    where: { eventId },
  });
}
```

### Task 1.3: Create Modules Settings Page

Create `src/app/(dashboard)/dashboard/events/[eventId]/settings/modules/page.tsx`:

This page should display:
- A card for each module with:
  - Icon
  - Name
  - Description
  - Toggle switch (ON/OFF)
- Organized into sections:
  - "Core Features" (always on, non-toggleable)
  - "Communication" (WhatsApp, Custom Email)
  - "Registration" (Form Builder, Approval Workflow, Waitlist)
  - "Event Day" (Check-in, Sessions)
  - "Attendee Experience" (Self-Service Portal, Multi-Language)
  - "Advanced" (Payments, Custom Domain, Webhooks)

Use Shadcn Switch component for toggles.

### Task 1.4: Auto-Create EventModules on Event Creation

Update the event creation logic to automatically create an `EventModules` record when a new event is created:

```typescript
// In event creation API or service
const event = await prisma.event.create({
  data: {
    ...eventData,
    modules: {
      create: {} // Creates with all defaults (false)
    }
  },
  include: { modules: true }
});
```

### Task 1.5: Update Dashboard Sidebar

Modify `src/components/layout/sidebar.tsx` to conditionally show menu items based on enabled modules:

```typescript
// Fetch event with modules
const event = await getEventWithModules(eventId);

const menuItems = [
  // Always visible
  { name: "Overview", href: `...`, icon: LayoutDashboard, alwaysShow: true },
  { name: "Attendees", href: `...`, icon: Users, alwaysShow: true },
  { name: "Registration Form", href: `...`, icon: FormInput, alwaysShow: true },
  { name: "Emails", href: `...`, icon: Mail, alwaysShow: true },
  { name: "Badges", href: `...`, icon: CreditCard, alwaysShow: true },
  { name: "Statistics", href: `...`, icon: BarChart, alwaysShow: true },
  
  // Conditional based on modules
  { name: "Check-in", href: `...`, icon: QrCode, module: "checkIn" },
  { name: "WhatsApp", href: `...`, icon: MessageCircle, module: "whatsApp" },
  { name: "Sessions", href: `...`, icon: Calendar, module: "sessions" },
  { name: "Payments", href: `...`, icon: CreditCard, module: "payments" },
  { name: "Portal", href: `...`, icon: User, module: "selfServicePortal" },
  
  // Always at bottom
  { name: "Settings", href: `...`, icon: Settings, alwaysShow: true },
];

// Filter based on enabled modules
const visibleItems = menuItems.filter(item => 
  item.alwaysShow || (item.module && event.modules?.[item.module])
);
```

### Task 1.6: Migration for Existing Events

Create a script to add `EventModules` to existing events:

```typescript
// prisma/migrations/add-modules-to-existing-events.ts
import { prisma } from "../src/lib/prisma";

async function main() {
  const eventsWithoutModules = await prisma.event.findMany({
    where: { modules: null },
  });

  for (const event of eventsWithoutModules) {
    await prisma.eventModules.create({
      data: { eventId: event.id },
    });
    console.log(`Created modules for event: ${event.name}`);
  }
}

main();
```

---

## Phase 2: Dynamic Form Builder

### Goal
Replace hardcoded registration fields with a fully customizable form builder where admins can add, remove, reorder, and configure fields per event.

### Task 2.1: Add FormField Model to Schema

Add to `prisma/schema.prisma`:

```prisma
// ─── Dynamic Form Fields ───

model FormField {
  id            String      @id @default(cuid())
  eventId       String
  
  // Field Identity
  name          String      // Internal name: "firstName", "country", "dietary"
  label         String      // Display label: "First Name"
  labelAr       String?     // Arabic label: "الاسم الأول"
  
  // Field Configuration
  type          FieldType
  placeholder   String?
  placeholderAr String?
  helpText      String?     // Helper text below field
  helpTextAr    String?
  
  // Validation
  required      Boolean     @default(false)
  validation    Json?       // {minLength, maxLength, pattern, min, max, customMessage}
  
  // Options (for SELECT, MULTISELECT, RADIO, CHECKBOX)
  options       Json?       // [{value: "sa", label: "Saudi Arabia", labelAr: "السعودية"}]
  
  // Layout
  order         Int         @default(0)
  width         FieldWidth  @default(FULL)
  section       String?     // Group fields: "Personal Info", "Work Details"
  
  // Conditional Logic
  conditional   Json?       // {showIf: {field: "attendeeType", operator: "equals", value: "VIP"}}
  
  // State
  isActive      Boolean     @default(true)
  isSystem      Boolean     @default(false)  // System fields can't be deleted
  
  // Metadata
  defaultValue  String?
  metadata      Json?       // Any additional config
  
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  event         Event       @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([eventId, name])
  @@index([eventId, order])
  @@index([eventId, isActive])
}

enum FieldType {
  // Text Inputs
  TEXT
  EMAIL
  PHONE
  TEXTAREA
  NUMBER
  
  // Selection
  SELECT
  MULTISELECT
  RADIO
  CHECKBOX
  
  // Date/Time
  DATE
  TIME
  DATETIME
  
  // Special
  COUNTRY       // Pre-populated country list
  PHONE_COUNTRY // Phone with country code
  FILE          // File upload
  HIDDEN        // Hidden field
  
  // Layout (non-input)
  HEADING       // Section heading
  DIVIDER       // Visual separator
  PARAGRAPH     // Informational text
}

enum FieldWidth {
  FULL          // 100% width
  HALF          // 50% width (2 columns)
  THIRD         // 33% width (3 columns)
}
```

Update Event model:

```prisma
model Event {
  // ... existing fields ...
  
  formFields      FormField[]
  
  // ... existing relations ...
}
```

### Task 2.2: Create Field Type Definitions

Create `src/lib/form-builder/field-types.ts`:

```typescript
import { FieldType } from "@prisma/client";

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
```

### Task 2.3: Create Country List Data

Create `src/lib/form-builder/countries.ts`:

```typescript
export interface Country {
  code: string;
  name: string;
  nameAr: string;
  phoneCode: string;
}

export const COUNTRIES: Country[] = [
  { code: "SA", name: "Saudi Arabia", nameAr: "السعودية", phoneCode: "+966" },
  { code: "AE", name: "United Arab Emirates", nameAr: "الإمارات", phoneCode: "+971" },
  { code: "KW", name: "Kuwait", nameAr: "الكويت", phoneCode: "+965" },
  { code: "BH", name: "Bahrain", nameAr: "البحرين", phoneCode: "+973" },
  { code: "QA", name: "Qatar", nameAr: "قطر", phoneCode: "+974" },
  { code: "OM", name: "Oman", nameAr: "عمان", phoneCode: "+968" },
  { code: "EG", name: "Egypt", nameAr: "مصر", phoneCode: "+20" },
  { code: "JO", name: "Jordan", nameAr: "الأردن", phoneCode: "+962" },
  { code: "LB", name: "Lebanon", nameAr: "لبنان", phoneCode: "+961" },
  { code: "YE", name: "Yemen", nameAr: "اليمن", phoneCode: "+967" },
  // ... add all countries
  // Sort: GCC first, then Arab countries, then alphabetical
];

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code);
}
```

### Task 2.4: Create Form Builder API Routes

Create API routes for managing form fields:

`src/app/api/events/[eventId]/form-fields/route.ts`:
- GET: List all fields for event (ordered)
- POST: Create new field

`src/app/api/events/[eventId]/form-fields/[fieldId]/route.ts`:
- GET: Get single field
- PATCH: Update field
- DELETE: Delete field (only if not system field)

`src/app/api/events/[eventId]/form-fields/reorder/route.ts`:
- POST: Reorder fields (receives array of {id, order})

### Task 2.5: Create Form Builder UI

Create `src/app/(dashboard)/dashboard/events/[eventId]/form-builder/page.tsx`:

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Form Builder                                        [Preview]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌─────────────────────────────────────────┐  │
│  │ Field Types  │  │  Form Canvas (drag-and-drop)            │  │
│  │              │  │                                         │  │
│  │ ─ Text ─     │  │  ┌─────────────────────────────────┐    │  │
│  │ [Text Input] │  │  │ ⋮⋮ First Name *          [Edit] │    │  │
│  │ [Email]      │  │  │    Text Input                   │    │  │
│  │ [Phone]      │  │  └─────────────────────────────────┘    │  │
│  │ [Long Text]  │  │                                         │  │
│  │              │  │  ┌─────────────────────────────────┐    │  │
│  │ ─ Select ─   │  │  │ ⋮⋮ Last Name *           [Edit] │    │  │
│  │ [Dropdown]   │  │  │    Text Input                   │    │  │
│  │ [Multi]      │  │  └─────────────────────────────────┘    │  │
│  │ [Radio]      │  │                                         │  │
│  │              │  │  ┌───────────────┐ ┌───────────────┐    │  │
│  │ ─ Date ─     │  │  │ ⋮⋮ Email *    │ │ ⋮⋮ Phone      │    │  │
│  │ [Date]       │  │  │   Email       │ │   Phone       │    │  │
│  │ [Time]       │  │  └───────────────┘ └───────────────┘    │  │
│  │              │  │         (half width)   (half width)     │  │
│  │ ─ Special ─  │  │                                         │  │
│  │ [Country]    │  │  ┌─────────────────────────────────┐    │  │
│  │ [File]       │  │  │ + Add Field                     │    │  │
│  │              │  │  │   Drag from left or click here  │    │  │
│  │ ─ Layout ─   │  │  └─────────────────────────────────┘    │  │
│  │ [Heading]    │  │                                         │  │
│  │ [Divider]    │  │                                         │  │
│  └──────────────┘  └─────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Drag fields from left panel to canvas
- Drag to reorder fields on canvas
- Click field to open edit dialog
- Edit dialog includes:
  - Label (EN/AR)
  - Placeholder (EN/AR)
  - Required toggle
  - Width (Full/Half/Third)
  - Validation rules
  - Options (for select types)
  - Conditional logic
- Preview button opens form in modal
- Auto-save on changes

Use a drag-and-drop library like `@dnd-kit/core`.

### Task 2.6: Create Field Editor Dialog

Create `src/components/form-builder/field-editor-dialog.tsx`:

Dialog with tabs:
1. **General**: Label, placeholder, help text, required, width
2. **Options**: For SELECT/MULTISELECT/RADIO - add/remove/reorder options
3. **Validation**: Min/max length, pattern, custom message
4. **Conditional**: Show/hide based on other field values
5. **Arabic**: Arabic translations for labels

### Task 2.7: Create Dynamic Form Renderer

Create `src/components/form-builder/form-renderer.tsx`:

This component:
- Receives array of FormField
- Renders each field based on type
- Handles validation
- Manages form state
- Supports RTL (Arabic)
- Handles conditional logic (show/hide)

```typescript
interface FormRendererProps {
  fields: FormField[];
  onSubmit: (data: Record<string, unknown>) => void;
  initialData?: Record<string, unknown>;
  language?: "en" | "ar";
  disabled?: boolean;
}

export function FormRenderer({ fields, onSubmit, initialData, language = "en" }: FormRendererProps) {
  // Implementation
}
```

### Task 2.8: Update Public Registration Page

Update `src/app/(public)/register/[eventSlug]/page.tsx`:

- Fetch FormFields for the event
- Pass to FormRenderer component
- Handle submission
- Store answers in Registration.formData as JSON

### Task 2.9: Create Default Field Templates

When a new event is created, optionally seed with default fields:

```typescript
const DEFAULT_FIELDS = [
  { name: "firstName", label: "First Name", labelAr: "الاسم الأول", type: "TEXT", required: true, order: 1, isSystem: true },
  { name: "lastName", label: "Last Name", labelAr: "اسم العائلة", type: "TEXT", required: true, order: 2, isSystem: true },
  { name: "email", label: "Email", labelAr: "البريد الإلكتروني", type: "EMAIL", required: true, order: 3, isSystem: true },
  { name: "phone", label: "Phone", labelAr: "الهاتف", type: "PHONE", required: false, order: 4, isSystem: false },
  { name: "organization", label: "Organization", labelAr: "الجهة", type: "TEXT", required: false, order: 5, isSystem: false },
  { name: "designation", label: "Job Title", labelAr: "المسمى الوظيفي", type: "TEXT", required: false, order: 6, isSystem: false },
];
```

### Task 2.10: Update Attendee Table to Show Dynamic Fields

The attendees table should dynamically show columns based on the form fields, not hardcoded columns.

---

## Phase 3: Custom Email per Event

### Goal
Allow each event to use its own email sender (SMTP or provider) instead of the system default.

### Task 3.1: Add EventEmailSettings Model

Add to `prisma/schema.prisma`:

```prisma
// ─── Event Email Settings ───

model EventEmailSettings {
  id              String        @id @default(cuid())
  eventId         String        @unique
  
  provider        EmailProvider @default(SYSTEM)
  fromName        String        // "AlUla Conference Team"
  fromEmail       String        // "register@alula.sa"
  replyTo         String?
  
  // Custom SMTP
  smtpHost        String?
  smtpPort        Int?
  smtpUser        String?
  smtpPassword    String?       // Should be encrypted
  smtpSecure      Boolean       @default(true)
  
  // Provider API (Resend, SendGrid, etc.)
  apiKey          String?       // Should be encrypted
  
  // Verification
  isVerified      Boolean       @default(false)
  verifiedAt      DateTime?
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  event           Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

enum EmailProvider {
  SYSTEM        // Use system default SMTP
  CUSTOM_SMTP   // Custom SMTP server
  RESEND        // Resend API
  SENDGRID      // SendGrid API
  MAILGUN       // Mailgun API
}
```

### Task 3.2: Update Email Service

Update `src/lib/email.ts` to:
1. Check if event has custom email settings
2. If yes, use event's SMTP/provider
3. If no, fall back to system default
4. Support multiple providers

### Task 3.3: Create Email Settings Page

Create `src/app/(dashboard)/dashboard/events/[eventId]/settings/email/page.tsx`:

- Provider selector (System, Custom SMTP, Resend, SendGrid)
- Configuration form based on provider
- Test email button
- Verification status

### Task 3.4: Email Verification Flow

For custom email:
1. Admin enters email settings
2. System sends verification email
3. Admin clicks verify link
4. Settings marked as verified

---

## Phase 4: Check-in System

### Goal
QR code scanning at event entry points with real-time attendance tracking.

### Task 4.1: Add CheckIn Model

Add to `prisma/schema.prisma`:

```prisma
// ─── Check-in Records ───

model CheckIn {
  id              String       @id @default(cuid())
  registrationId  String
  eventId         String
  
  checkInTime     DateTime     @default(now())
  checkOutTime    DateTime?
  
  method          CheckInMethod
  location        String?       // "Main Entrance", "VIP Gate"
  deviceId        String?       // Device identifier
  checkedInBy     String?       // User ID who performed check-in
  
  notes           String?
  metadata        Json?
  
  registration    Registration  @relation(fields: [registrationId], references: [id], onDelete: Cascade)
  event           Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@index([registrationId])
  @@index([eventId, checkInTime])
}

enum CheckInMethod {
  QR_SCAN       // QR code scanned
  MANUAL        // Manual lookup by staff
  SELF_SERVICE  // Self check-in kiosk
  BULK          // Bulk check-in
}

// Add CheckInPoint model for multiple entry points
model CheckInPoint {
  id        String   @id @default(cuid())
  eventId   String
  name      String   // "Main Entrance", "VIP Gate"
  nameAr    String?
  isActive  Boolean  @default(true)
  
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  
  @@index([eventId])
}
```

Update Event and Registration models with relations.

### Task 4.2: Create Check-in Scanner Page

Create `src/app/(dashboard)/dashboard/events/[eventId]/checkin/page.tsx`:

**Features:**
- Camera-based QR scanner (use `html5-qrcode` or `@zxing/browser`)
- Manual search by name/email/confirmation code
- Show attendee info after scan:
  - Name, organization, category
  - Badge photo (if available)
  - Already checked in? Show warning
- Check-in button
- Real-time stats (total checked in, remaining)

**Mobile-optimized** - this will be used on phones/tablets at entry gates.

### Task 4.3: Create Check-in Dashboard

Create `src/app/(dashboard)/dashboard/events/[eventId]/checkin/dashboard/page.tsx`:

**Features:**
- Real-time check-in count (auto-refresh)
- Check-in by hour chart
- Check-in by category breakdown
- Recent check-ins list
- Search checked-in attendees
- Export check-in report

### Task 4.4: Check-in API Routes

`src/app/api/events/[eventId]/checkin/route.ts`:
- POST: Record check-in (by confirmation code)
- GET: Get check-in stats

`src/app/api/events/[eventId]/checkin/search/route.ts`:
- GET: Search attendees for manual check-in

`src/app/api/events/[eventId]/checkin/export/route.ts`:
- GET: Export check-in data

### Task 4.5: Add Check-in Status to Attendee Table

Show check-in status (✓ Checked In, time) in attendee list.

---

## Phase 5: WhatsApp Integration

### Goal
Send registration confirmations, reminders, and badges via WhatsApp.

### Task 5.1: Add WhatsApp Models

Add to `prisma/schema.prisma`:

```prisma
// ─── WhatsApp Settings ───

model EventWhatsAppSettings {
  id                    String          @id @default(cuid())
  eventId               String          @unique
  
  provider              WhatsAppProvider @default(META)
  isActive              Boolean         @default(false)
  
  // Meta Business API
  phoneNumberId         String?
  businessAccountId     String?
  accessToken           String?         // Encrypted
  webhookVerifyToken    String?
  
  // Templates (must be approved by Meta)
  confirmationTemplate  String?         // Template name
  reminderTemplate      String?
  badgeTemplate         String?
  
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt

  event                 Event           @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

enum WhatsAppProvider {
  META          // Official Meta Business API
  TWILIO        // Twilio WhatsApp
  WATI          // WATI.io
}

// ─── WhatsApp Logs ───

model WhatsAppLog {
  id            String   @id @default(cuid())
  eventId       String
  contactId     String
  
  templateName  String
  phoneNumber   String
  
  status        WhatsAppStatus @default(PENDING)
  messageId     String?        // From provider
  
  sentAt        DateTime?
  deliveredAt   DateTime?
  readAt        DateTime?
  failedAt      DateTime?
  errorMessage  String?
  
  createdAt     DateTime @default(now())

  event         Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  contact       Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@index([eventId])
  @@index([contactId])
  @@index([status])
}

enum WhatsAppStatus {
  PENDING
  SENT
  DELIVERED
  READ
  FAILED
}
```

### Task 5.2: Create WhatsApp Service

Create `src/lib/services/whatsapp.service.ts`:

```typescript
export const whatsAppService = {
  async sendTemplate(params: {
    eventId: string;
    contactId: string;
    phoneNumber: string;
    templateName: string;
    variables: Record<string, string>;
  }) {
    // 1. Get event WhatsApp settings
    // 2. Build message payload based on provider
    // 3. Send via provider API
    // 4. Log the message
  },
  
  async sendConfirmation(registrationId: string) {
    // Send confirmation template with registration details
  },
  
  async sendReminder(contactIds: string[]) {
    // Bulk send reminder template
  },
  
  async sendBadge(registrationId: string) {
    // Send badge image via WhatsApp
  },
};
```

### Task 5.3: Create WhatsApp Settings Page

Create `src/app/(dashboard)/dashboard/events/[eventId]/whatsapp/page.tsx`:

**Sections:**
1. Provider setup (Meta API credentials)
2. Template mapping (which template for which action)
3. Test message sender
4. Message logs

### Task 5.4: WhatsApp Webhook Handler

Create `src/app/api/webhooks/whatsapp/route.ts`:

Handle incoming webhooks from Meta:
- Message status updates (delivered, read)
- Incoming messages (replies)

### Task 5.5: Integrate with Registration Flow

After registration is confirmed:
1. Check if WhatsApp module is enabled
2. Check if contact has phone number
3. Send confirmation via WhatsApp

---

## Phase 6: Event Branding & Custom Domain

### Task 6.1: Add Branding Fields to Event

Update Event model or create separate model:

```prisma
model EventBranding {
  id              String   @id @default(cuid())
  eventId         String   @unique
  
  // Colors
  primaryColor    String   @default("#7dc242")
  secondaryColor  String?
  backgroundColor String?
  textColor       String?
  
  // Logo & Images
  logoUrl         String?
  logoWhiteUrl    String?  // For dark backgrounds
  faviconUrl      String?
  headerImageUrl  String?
  
  // Custom CSS
  customCss       String?  @db.Text
  
  // Registration Page
  welcomeTitle    String?
  welcomeTitleAr  String?
  welcomeMessage  String?  @db.Text
  welcomeMessageAr String? @db.Text
  
  event           Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

model EventDomain {
  id              String   @id @default(cuid())
  eventId         String   @unique
  
  customDomain    String?  @unique  // "register.client-event.com"
  isVerified      Boolean  @default(false)
  verifiedAt      DateTime?
  
  // DNS verification
  verificationRecord String?  // TXT record value
  
  event           Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
}
```

### Task 6.2: Create Branding Editor

Visual editor for:
- Color picker for primary/secondary colors
- Logo upload
- Live preview of registration page
- Custom CSS editor (advanced)

### Task 6.3: Apply Branding to Public Pages

Update public registration page to:
- Use event colors (CSS variables)
- Show event logo
- Display welcome message
- Apply custom CSS if provided

---

## Phase 7: Additional Improvements

### Task 7.1: Approval Workflow

When enabled:
- New registrations have status `PENDING_APPROVAL`
- Admin sees pending list with Approve/Reject buttons
- Email sent on approval

### Task 7.2: Waitlist

When enabled:
- Set event capacity
- After capacity: new registrations go to waitlist
- When spot opens: auto-invite next in waitlist

### Task 7.3: Multi-Language Forms

When enabled:
- Language toggle on registration page (EN/AR)
- Form renders in selected language
- RTL support for Arabic

### Task 7.4: Self-Service Portal

Separate portal for attendees:
- Login with email + confirmation code
- View registration details
- Edit allowed fields
- Download badge
- Cancel registration

---

## Database Migration Strategy

After updating schema:

```bash
# Generate migration
npm run db:migrate -- --name add_modules_and_form_builder

# Or push directly (development)
npm run db:push

# Generate Prisma client
npx prisma generate
```

---

## Testing Checklist

After each phase, verify:

- [ ] Existing events still work
- [ ] New events can be created with modules
- [ ] Module toggles show/hide features correctly
- [ ] API routes check module status
- [ ] UI shows only enabled features
- [ ] Forms render correctly
- [ ] Data saves and loads properly
- [ ] No TypeScript errors
- [ ] No console errors

---

## File Structure After Improvements

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/
│   ├── (dashboard)/
│   │   └── dashboard/
│   │       ├── events/
│   │       │   ├── [eventId]/
│   │       │   │   ├── page.tsx              # Overview
│   │       │   │   ├── form-builder/         # NEW: Form builder
│   │       │   │   ├── attendees/
│   │       │   │   ├── emails/
│   │       │   │   ├── badges/
│   │       │   │   ├── statistics/
│   │       │   │   ├── checkin/              # NEW: Check-in
│   │       │   │   ├── whatsapp/             # NEW: WhatsApp
│   │       │   │   ├── sessions/             # NEW: Sessions
│   │       │   │   ├── payments/             # NEW: Payments
│   │       │   │   └── settings/
│   │       │   │       ├── general/
│   │       │   │       ├── modules/          # NEW: Module toggles
│   │       │   │       ├── branding/         # NEW: Branding
│   │       │   │       ├── domain/           # NEW: Custom domain
│   │       │   │       └── email/            # NEW: Email settings
│   │       │   └── new/
│   │       └── users/
│   ├── (public)/
│   │   ├── register/[eventSlug]/
│   │   ├── badge/[code]/
│   │   └── portal/                           # NEW: Self-service
│   └── api/
│       ├── events/[eventId]/
│       │   ├── form-fields/                  # NEW
│       │   ├── checkin/                      # NEW
│       │   ├── whatsapp/                     # NEW
│       │   ├── sessions/                     # NEW
│       │   └── ...existing
│       └── webhooks/
│           └── whatsapp/                     # NEW
├── components/
│   ├── ui/
│   ├── layout/
│   ├── form-builder/                         # NEW
│   │   ├── field-palette.tsx
│   │   ├── form-canvas.tsx
│   │   ├── field-editor-dialog.tsx
│   │   └── form-renderer.tsx
│   ├── checkin/                              # NEW
│   │   ├── qr-scanner.tsx
│   │   └── attendee-card.tsx
│   └── shared/
├── hooks/                                    # NEW
│   ├── use-event.ts
│   ├── use-form-fields.ts
│   └── use-debounce.ts
├── lib/
│   ├── services/                             # NEW
│   │   ├── event.service.ts
│   │   ├── registration.service.ts
│   │   ├── email.service.ts
│   │   ├── whatsapp.service.ts
│   │   └── checkin.service.ts
│   ├── guards/                               # NEW
│   │   └── module-guard.ts
│   ├── form-builder/                         # NEW
│   │   ├── field-types.ts
│   │   └── countries.ts
│   ├── validations/
│   └── ...existing
└── types/
    ├── form-field.ts                         # NEW
    └── ...existing
```

---

## Notes for Claude Code

1. **Always run `npx prisma generate`** after schema changes
2. **Check existing code patterns** before creating new components
3. **Use existing UI components** from `src/components/ui/`
4. **Follow existing naming conventions** (camelCase for files, PascalCase for components)
5. **Add TypeScript types** for all new code
6. **Test each change** before moving to next task
7. **Commit frequently** with clear messages

---

## Questions to Ask Before Starting

1. Which phase to start with?
2. Any existing code that conflicts with planned changes?
3. Database backup needed before migrations?
4. Any specific design preferences for new UI?

---

*Generated for: Registration System Improvement Project*
*Date: April 2026*
*Author: Claude (Anthropic)*
