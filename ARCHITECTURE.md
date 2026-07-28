# Architecture Guide

This document explains how the codebase is organized, how a request flows through it, and — most importantly — **where to edit what**. It's written for a developer seeing this repo for the first time.

Companion docs:

- `README.md` — setup, scripts, tech stack.
- `PROJECT_HANDOFF.md` — chronological log of what has shipped (history, not architecture).
- `CLAUDE.md` — instructions for the AI coding assistant (conventions live there too, but this file is the human-first explanation).

---

## 1. What this app is

A **multi-event registration platform**: one deployment hosts many events. Admins create an event, build its registration form, and manage attendees; the public registers through a per-event page; attendees can return through a self-service portal to submit follow-up information.

Almost everything in the system is **scoped to an Event**. If you see `eventId` in a path or function signature, that's why.

## 2. One repo, both frontend and backend — on purpose

This is a **Next.js (App Router)** project. Next.js intentionally puts the frontend pages and the backend API in the same codebase, under the same folder tree. There is no separate "backend repo" — but there **is** a clear separation by folder:

| Layer | Where |
|---|---|
| Backend HTTP API | `src/app/api/**` (files named `route.ts`) |
| Business logic + database access | `src/lib/services/` and `src/lib/` |
| Database schema | `prisma/schema.prisma` (PostgreSQL) |
| Frontend pages | `src/app/(dashboard)/`, `src/app/(public)/`, `src/app/(auth)/` (files named `page.tsx`) |
| Reusable UI components | `src/components/` |

### The two Next.js conventions you must know

1. **The folder path IS the URL.** A folder maps to a route; the file inside is always named the same thing:
   - `src/app/(dashboard)/dashboard/events/[eventId]/attendees/page.tsx` → the page at `/dashboard/events/123/attendees`
   - `src/app/api/events/[eventId]/contacts/route.ts` → the API endpoint at `/api/events/123/contacts`
   - `[eventId]` in a folder name is a **URL parameter** (dynamic segment).
   - Folders in `(parentheses)` like `(dashboard)` are **route groups** — they organize files but do NOT appear in the URL.
2. **Because of this, dozens of files share the same name** (30× `page.tsx`, ~98× `route.ts`). You cannot find anything by filename — **navigate by folder path**, or search for a distinctive string from the UI/endpoint you're looking at.

## 3. How a request flows (the layers)

Nearly every screen in the app follows the same pattern. Dashboard pages are client components (`"use client"`) that fetch JSON from the API routes:

```
Browser
  │
  ▼
page.tsx  (React client component — state, forms, tables)
  │  fetch("/api/events/123/contacts")
  ▼
route.ts  (API handler — parses input, returns JSON)
  │  1. authorizeEvent(eventId, {...})   ← auth + membership + module check
  │  2. zod schema from src/lib/validations/   ← input validation
  │  3. calls a service
  ▼
src/lib/services/*.service.ts  (business logic)
  │
  ▼
Prisma (src/lib/prisma.ts)  →  PostgreSQL
```

Rules that keep this sane:

- **API routes under `/api/events/[eventId]/...` must call `authorizeEvent(eventId, { role, module })`** from `src/lib/api-auth.ts`. It checks login + per-event membership + (optionally) that the feature module is enabled, in one call. Never re-implement that check by hand.
- **Database writes go through a service** in `src/lib/services/` when a suitable method exists, not inline `prisma.*` calls in the route handler.
- **Input validation uses the Zod schemas** in `src/lib/validations/` (one file per domain).

## 4. Folder map

```
middleware.ts                  Login gate for /dashboard (repo ROOT, not under src/)
prisma/
  schema.prisma                The entire database schema — single source of truth
  seed.ts                      npm run db:seed
  scripts/                     One-off maintenance/backfill scripts (run manually with tsx)
src/
  app/
    (auth)/login/              Admin login page
    (dashboard)/dashboard/     Admin UI (protected). Per-event pages under events/[eventId]/
    (public)/
      register/[eventSlug]/    Public registration page
      portal/[eventSlug]/      Attendee self-service portal (OTP login)
      badge/[confirmationCode] Public badge download page
    api/
      events/[eventId]/        Per-event admin API (the bulk of the backend)
      register/[eventSlug]/    Public registration submit + file upload API
      portal/[eventSlug]/      Portal API (OTP login, phase submissions, receipts)
      users/, auth/            Global user management, NextAuth
      cron/                    Scheduled jobs (phase reminders, orphan-receipt cleanup)
      webhooks/whatsapp/       Inbound WhatsApp webhook
      translate/               EN→AR auto-translate helper
  components/
    ui/                        shadcn/ui primitives (button, dialog, table…) — generic
    layout/                    Dashboard shell: sidebar, topbar, page header
    attendee/                  Cards & cells for the attendee detail/list pages
    admin/                     Form-builder and admin dialogs (options editor, bulk paste…)
    public/                    Pieces of the public registration form (file upload control…)
    register-templates/        Registration page templates (registry + ClassicTemplate)
    data-table/                Shared data-table wrapper
  hooks/                       Small reusable React hooks (debounce, media query…)
  lib/
    api-auth.ts                authorizeEvent — THE auth helper for per-event API routes
    auth.ts                    NextAuth config (admin login, JWT sessions)
    permissions.ts             Global roles (VIEWER<EDITOR<MANAGER<SUPER_ADMIN) + event roles
    prisma.ts                  Prisma client singleton
    blob.ts                    Vercel Blob storage helpers (uploaded files)
    badge-generator.ts         Badge PDF generation (@react-pdf/renderer + QR)
    email-renderer.ts          Fills {{variables}} into email template HTML
    form-conditional.ts        showIf logic for conditional form fields
    urls.ts, utils.ts, …       Small shared utilities
    services/                  Business logic, one service per domain (see §6)
    validations/               Zod input schemas, one file per domain
    form-builder/              Field-type metadata, default fields, countries, value formatting
    portal/                    Portal auth: OTP service, session cookie, rate limit, i18n
    guards/module-guard.ts     MODULE_INFO — the feature-toggle catalog (see §5)
    attendees/                 Filter definitions + where-clause builder for the attendee list
    security/, registration/, contact/   Narrow helpers (CSS sanitizer, upload sessions…)
```

## 5. The domain model (what the tables mean)

Read `prisma/schema.prisma` alongside this. The essentials:

- **Event** — the root of everything. Deleting an event cascades to all its data.
- **EventModules** — 1:1 with Event; a row of booleans that switch optional features on/off per event (`checkIn`, `whatsApp`, `selfServicePortal`, `approvalWorkflow`, `customEmail`, …). The catalog of modules (names, labels, descriptions) is `MODULE_INFO` in `src/lib/guards/module-guard.ts`. UI: Settings → Modules.
- **Contact** — a person, unique per `(eventId, email)`. **Registration** — 1:1 with Contact; its `formData` JSON holds the answers to the registration form (keys = `FormField.name`). Status flow supports approval workflow and waitlist.
- **Phase → Step → FormField** — forms are a tree, not a flat list:
  - A **Phase** is either the `REGISTRATION` phase (the public sign-up form, one per event) or a `POST_REGISTRATION` phase (extra info collected later via the portal, e.g. travel details), optionally time-windowed (`opensAt`/`closesAt`).
  - A **Step** is one page of a phase (the public form renders steps as a stepper).
  - A **FormField** always belongs to a Step (`stepId` is non-nullable). Fields with `isSystem: true` (e.g. email) cannot be deleted from the form builder.
  - Registration-phase answers live in `Registration.formData`; post-registration answers live in **PhaseSubmission** (one per phase+registration). Don't mix them.
  - **PhaseAccess** is a per-attendee override (`LOCKED`/`OPEN`); no row = follow the phase's date window.
- **AttendeeGroup / value / assignment** — admin-defined classification labels (e.g. Region, Ranking) attachable to contacts.
- **EmailTemplate / EmailCampaign / EmailLog** — templates with `{{variables}}`, bulk campaigns, and a log row per send.
- **BadgeTemplate / Badge** — one badge design per event; a badge PDF per registration.
- **EventBranding / EventDomain / EventEmailSettings** — per-event look & feel, custom domain, custom email sender.
- **CheckIn / WhatsApp models** — attendance scanning and WhatsApp messaging, both module-gated.

## 6. The services layer

`src/lib/services/` — one file per domain, exporting a service object. This is where business logic lives so route handlers stay thin:

`event`, `contact`, `registration`, `email`, `email-provider` (resolves *which* SMTP/API sender an event uses and does the actual nodemailer send), `badge`, `checkin`, `whatsapp`, `approval`, `event-member`, `phase`, `phase-reminder`, `selection` (per-phase option choices with capacity), `receipt`, `registration-file` (uploaded-file lifecycle), `field-mapping` + `field-mapping-backfill` (tagging form fields as "this is the name field"), `translation`.

## 7. The two auth systems (don't confuse them)

| | Admin (dashboard) | Attendee (portal) |
|---|---|---|
| Who | Staff users in the `User` table | Registrants (no password) |
| Mechanism | NextAuth v5, email+password (bcrypt), JWT session cookie | One-time code sent by email → signed 24h `portal_session` cookie |
| Code | `src/lib/auth.ts`, `middleware.ts`, `src/lib/api-auth.ts`, `src/lib/permissions.ts` | `src/lib/portal/` (otp.service, session, login-rate-limit) |
| Authorization | Global role + per-event `EventMember` role (`canViewEvent` / `canEditEvent` / `canManageEvent`); `SUPER_ADMIN` bypasses | Cookie is bound to one registration + one event slug |

`middleware.ts` (repo root) only gates the `/dashboard` pages by cookie presence. **API routes are NOT protected by middleware** — each route handler does its own auth (`authorizeEvent` for admin routes, `getPortalSessionFromRequest` for portal routes).

## 8. Three end-to-end walkthroughs

**A visitor registers.**
`(public)/register/[eventSlug]/page.tsx` resolves which template to render via `src/components/register-templates/registry.ts` (currently `ClassicTemplate` — this component IS the public form: stepper, field rendering, conditional logic, validation). On submit it POSTs to `src/app/api/register/[eventSlug]/route.ts`, which validates, enforces capacity, creates Contact + Registration (status depends on approval/waitlist modules), and sends the confirmation email via `email.service` → `email-provider.service`.

**An admin edits an attendee.**
List page `(dashboard)/dashboard/events/[eventId]/attendees/page.tsx` (filters/columns logic in `src/lib/attendees/`) → detail page `attendees/[contactId]/page.tsx`, composed of the cards in `src/components/attendee/`. Saves go to `api/events/[eventId]/contacts/[contactId]/route.ts` and related sub-routes (fields, files, groups, phase-access), each stamping the audit trail (`updatedBy`).

**An attendee submits a post-registration phase.**
Portal login: `(public)/portal/[eventSlug]/page.tsx` → OTP request/verify under `api/portal/[eventSlug]/otp/` → cookie. Phase form: `portal/[eventSlug]/phases/[phaseId]/page.tsx` → `POST api/portal/[eventSlug]/phases/[phaseId]/route.ts` → writes a `PhaseSubmission`.

## 9. "I want to change X" → edit Y

| I want to change… | Edit |
|---|---|
| How the public registration form looks/behaves | `src/components/register-templates/classic-template.tsx` (shell, stepper, submit) and `classic-field.tsx` (how each field type renders) + `src/components/public/` for the file-upload control |
| What happens when a registration is submitted | `src/app/api/register/[eventSlug]/route.ts` + `src/lib/services/registration.service.ts` |
| Add a new form field **type** | `FieldType` enum in `prisma/schema.prisma` → metadata in `src/lib/form-builder/field-types.ts` → renderer in `classic-field.tsx` → display/export formatting in `src/lib/form-builder/format-form-value.ts` |
| The form builder (admin drag/drop, field settings) | `(dashboard)/…/[eventId]/form-builder/page.tsx` + dialogs in `src/components/admin/` + API under `api/events/[eventId]/form-fields/` and `…/phases/` |
| Attendees **list** (table, filters, columns, pagination) | `(dashboard)/…/[eventId]/attendees/page.tsx` + `src/lib/attendees/` + list API `api/events/[eventId]/attendees/route.ts` |
| Attendee **detail** page | `(dashboard)/…/[eventId]/attendees/[contactId]/page.tsx` + cards in `src/components/attendee/` |
| CSV / Excel export | `api/events/[eventId]/registrations/export/route.ts` (shares column formatting with the table via `format-form-value.ts`) |
| Email templates / campaigns UI | `(dashboard)/…/[eventId]/emails/` pages |
| How emails are rendered & sent | `src/lib/email-renderer.ts` (variables) → `src/lib/services/email.service.ts` (orchestration, EmailLog) → `src/lib/services/email-provider.service.ts` (actual send, per-event sender) |
| Registration page branding (colors, logo, text) | `(dashboard)/…/[eventId]/settings/branding/` (one file per tab) + `api/events/[eventId]/branding/` |
| Feature toggles (enable/disable a module) | UI `settings/modules/page.tsx`; catalog `MODULE_INFO` in `src/lib/guards/module-guard.ts`; enforcement via `authorizeEvent({ module })` |
| Badges (design, PDF, QR) | `(dashboard)/…/[eventId]/badges/page.tsx` + `src/lib/badge-generator.ts` + `api/events/[eventId]/badges/` |
| Check-in / scanning | `(dashboard)/…/[eventId]/checkin/` + `src/lib/services/checkin.service.ts` |
| Approval workflow | `(dashboard)/…/[eventId]/approvals/page.tsx` + `src/lib/services/approval.service.ts` |
| WhatsApp messaging | `(dashboard)/…/[eventId]/whatsapp/page.tsx` + `whatsapp.service.ts` + webhook `api/webhooks/whatsapp/` |
| Statistics dashboard | `(dashboard)/…/[eventId]/statistics/page.tsx` + `api/events/[eventId]/statistics/` |
| Attendee portal (login, phase forms) | `(public)/portal/[eventSlug]/` pages + `api/portal/[eventSlug]/` + `src/lib/portal/` |
| Who can access what (roles, permissions) | `src/lib/permissions.ts` + `src/lib/api-auth.ts`; team UI `settings/team/`; global users `dashboard/users/` |
| The database schema | `prisma/schema.prisma`, then `npm run db:migrate` to generate + apply a migration (see §10) |
| Sidebar / dashboard layout | `src/components/layout/` (sidebar.tsx shows/hides items per enabled modules) |
| Uploaded files (storage, replace, receipts) | `src/lib/blob.ts` + `registration-file.service.ts` / `receipt.service.ts` + `files`/`receipts` API routes |

## 10. Conventions and gotchas

- **Everything is event-scoped.** New per-event features follow the pattern: API at `api/events/[eventId]/<feature>/route.ts`, page at `(dashboard)/dashboard/events/[eventId]/<feature>/page.tsx`, optional `EventModules` boolean + `MODULE_INFO` entry if the feature is toggleable.
- **Schema changes ship as Prisma migrations.** Edit `prisma/schema.prisma`, run `npm run db:migrate` (writes SQL into `prisma/migrations/` and applies it locally), and commit the migration with the schema. Deploys run `prisma migrate deploy`; CI builds its test database purely from the committed migrations, so a broken chain fails the PR. `db push` remains for local prototyping only. One-off data transforms still live in `prisma/scripts/`.
- **Smoke tests cover the attendee flows.** `tests/smoke/` holds Playwright tests for the three critical journeys (public registration, portal OTP login, phase submit) against the dedicated `smoke-e2e` event — `npm run seed:smoke && npm run test:smoke` locally; CI runs them on every PR against an ephemeral Postgres. There are no unit tests; everything else is verified via typecheck, lint, and Vercel preview builds.
- **Bilingual fields.** Many models have Arabic siblings (`labelAr`, `welcomeTitleAr`, …). New user-facing text on the registration page usually needs one (the `multiLanguage` module toggles the Arabic UI).
- **`Registration.formData` has no fixed shape** — keys follow the event's form fields. Use `src/lib/form-builder/format-form-value.ts` to display values so screen and export stay consistent.
- **System fields** (`isSystem: true`) must remain undeletable in the form builder.
- **Pages are containers; their UI lives in colocated files.** Every large page (attendees, form-builder, the portal pages, the branding tabs, the CLASSIC template) follows the same pattern: `page.tsx` owns the state, data fetching, and API calls, and the visual pieces live in sibling files in the same folder (`*-dialog.tsx`, `*-card.tsx`, `*-tab.tsx`, `types.ts`, …). To find something, look for the file named after what you see on screen; when adding UI, extend or add a sibling rather than growing `page.tsx`. The largest remaining files are two service modules (`selection.service.ts`, `registration-file.service.ts`) — those are deliberate: flat catalogs of named exported functions you navigate by function name.
- **Two Vercel Blob stores** exist (dev and prod) with separate tokens — be careful which one a script points at before running anything destructive.
