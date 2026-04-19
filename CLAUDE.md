# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server (http://localhost:3000)
npm run build        # Runs `prisma generate` then `next build`
npm run start        # Production server
npm run lint         # ESLint (config: eslint.config.mjs extends next)

npm run db:push      # Push schema.prisma to DB without migration (dev/quick iteration)
npm run db:migrate   # Create + apply a migration (preferred for schema changes meant to ship)
npm run db:seed      # Runs prisma/seed.ts via tsx — seeds initial users/data
npm run db:studio    # Prisma Studio GUI
```

No test runner is configured in this project — there are no unit/integration tests. Do not add mocks or test scaffolding unless the user asks.

`postinstall` runs `prisma generate` automatically; `prisma/seed.ts` is excluded from `tsconfig` compilation (it's executed by `tsx`).

## Architecture

This is a **Next.js 16 App Router** multi-event registration platform. Every feature is scoped to an **Event**, and most per-event capabilities are gated by a feature-toggle row (`EventModules`).

### Route groups (src/app)

- `(auth)/login` — NextAuth credentials login.
- `(dashboard)/dashboard/...` — protected admin UI. All event-specific admin pages live under `dashboard/events/[eventId]/{approvals,attendees,badges,checkin,contacts,emails,form-builder,registrations,settings,statistics,whatsapp}`.
- `(public)/register/[eventSlug]`, `(public)/badge`, `(public)/portal` — unauthenticated pages for attendees.
- `api/...` — route handlers. Per-event API lives under `api/events/[eventId]/{modules,form-fields,registrations,contacts,emails,email-settings,branding,domain,capacity,badges,checkin,whatsapp,approvals,statistics,attendees}`. Public-facing endpoints are `api/register/[eventSlug]` and `api/portal/[eventSlug]`.

### Auth & authorization (three layers)

1. **`middleware.ts`** — cookie-based gate. Redirects unauthenticated users away from `/dashboard` and authenticated users away from `/login`. Explicitly lets `/register/*`, `/badge/*`, and `/api/*` through; API routes must do their own auth.
2. **`src/lib/auth.ts`** — NextAuth v5 with Prisma adapter, Credentials provider (bcrypt), JWT sessions. The `role` claim is copied into the JWT and session.
3. **`src/lib/permissions.ts`** — role helpers (`canEdit`, `canDelete`, `canManageUsers`) over four roles: `VIEWER` < `EDITOR` < `MANAGER` < `SUPER_ADMIN`. Only `SUPER_ADMIN` can manage users.

### Module system (important)

Each `Event` has a 1:1 `EventModules` row with booleans for optional features (`checkIn`, `whatsApp`, `sessions`, `payments`, `selfServicePortal`, `approvalWorkflow`, `waitlist`, `multiLanguage`, `customDomain`, `customEmail`, `webhooks`). `formBuilder` defaults to `true`; the rest default to `false`.

**API routes for gated features must call `requireModule(eventId, moduleName)` from `src/lib/guards/module-guard.ts` and return its response if non-null.** `MODULE_INFO` in the same file is the single source of truth for module names, labels, descriptions, and categories — reuse it rather than duplicating strings. When creating a new event, call `createDefaultModules(eventId)` to seed the row.

### Data layer

- `src/lib/prisma.ts` — singleton Prisma client.
- `src/lib/services/` — thin service objects (`eventService`, `contactService`, `registrationService`, `emailService`, `badgeService`, plus approval/checkin/whatsapp/email-provider). New DB access should go through a service, not inline `prisma.*` calls in route handlers where a service method already exists. Only `event/contact/registration/email/badge` are re-exported from `services/index.ts`.
- `src/lib/validations/` — Zod schemas per domain (contact, event, email-template, registration). Use these in API routes rather than ad-hoc validation.
- `prisma/schema.prisma` — PostgreSQL. Key cascade chains: deleting an `Event` cascades to `Contact`, `Registration`, `FormField`, `EmailTemplate/Campaign/Log`, `Badge*`, `CheckIn*`, `WhatsApp*`, `EventModules`, `EventBranding`, `EventDomain`, `EventEmailSettings`. A `Contact` is unique per `(eventId, email)`; a `Registration` is 1:1 with a `Contact`.

### Dynamic form builder

Registration forms are defined per event by `FormField` rows, not hardcoded. `src/lib/form-builder/` holds:

- `field-types.ts` — maps `FieldType` enum values to UI metadata.
- `countries.ts` — full 195-country list used by `COUNTRY` / `PHONE_COUNTRY` field types (pre-populated, do not re-seed elsewhere).
- `default-fields.ts` — `DEFAULT_FIELDS` seeded on event creation. Fields with `isSystem: true` cannot be deleted from the form builder.

Attendee submissions land in `Registration.formData` (Json). The registration page at `(public)/register/[eventSlug]` renders fields dynamically from `FormField` rows ordered by `order`, respecting `width` (FULL/HALF/THIRD), `conditional` logic (`{showIf: {field, operator, value}}`), and `validation` rules. When adding a new `FieldType`, update the enum in `schema.prisma`, the metadata in `field-types.ts`, and the renderer on the public registration page.

### Email & notifications

- `src/lib/email.ts` — low-level nodemailer transport using `SMTP_*` env vars (system sender).
- `src/lib/services/email-provider.service.ts` — per-event sender resolution. If `EventModules.customEmail` is on, use `EventEmailSettings` (which supports `SYSTEM`, `CUSTOM_SMTP`, `RESEND`, `SENDGRID`, `MAILGUN`) instead of the system defaults.
- `src/lib/email-renderer.ts` + `src/lib/services/email.service.ts` — template rendering (`EmailTemplate.bodyHtml` with `variables`) and campaign send orchestration, writing an `EmailLog` row per recipient.
- Badge PDFs: `src/lib/badge-generator.ts` uses `@react-pdf/renderer` + `qrcode`. Badges are 1:1 with `Registration` and reference the event's single `BadgeTemplate`.

### Styling & UI

Tailwind CSS 4 (via `@tailwindcss/postcss`), shadcn/ui components in `src/components/ui/` (config in `components.json`), Radix primitives, `lucide-react` icons, `sonner` for toasts. Prefer adding/extending shadcn components over bespoke ones. Path alias: `@/*` → `./src/*`.

## Conventions specific to this codebase

- **Event-scoped everything**: almost every API handler and service method takes an `eventId`. When adding new features, follow the `api/events/[eventId]/<feature>/route.ts` pattern and add a matching dashboard page under `(dashboard)/dashboard/events/[eventId]/<feature>/`.
- **Gating new features**: if the feature is optional per event, add a boolean to `EventModules` in `schema.prisma`, add an entry in `MODULE_INFO`, and call `requireModule` in its API routes. Don't gate via ad-hoc flags.
- **System fields** on `FormField` (`isSystem: true`) must remain undeletable from the UI — the form-builder page enforces this; preserve that behavior.
- **Bilingual content**: many models carry `*Ar` siblings (`labelAr`, `welcomeTitleAr`, etc.) for Arabic. When adding user-facing text fields that belong on the registration page or branding, consider whether an Arabic counterpart is needed (the `multiLanguage` module toggles this UI).
- **`Registration.formData`** is a free-form Json blob matching active `FormField.name`s — do not assume a fixed shape.
