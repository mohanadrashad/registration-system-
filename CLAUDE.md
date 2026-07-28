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

npm run seed:smoke   # (Re)seed the dedicated smoke-test event (slug: smoke-e2e)
npm run test:smoke   # Playwright smoke tests: register → portal OTP login → phase submit
```

The only tests are the Playwright smoke tests in `tests/smoke/` (they also run in CI against an ephemeral Postgres — see `.github/workflows/ci.yml`). There are no unit tests; do not add unit-test scaffolding or mocks unless the user asks. When changing the registration or portal flows, run `npm run seed:smoke && npm run test:smoke` before pushing.

`postinstall` runs `prisma generate` automatically; `prisma/seed.ts` is excluded from `tsconfig` compilation (it's executed by `tsx`).

## Architecture

This is a **Next.js 16 App Router** multi-event registration platform. Every feature is scoped to an **Event**, and most per-event capabilities are gated by a feature-toggle row (`EventModules`).

### Route groups (src/app)

- `(auth)/login` — NextAuth credentials login.
- `(dashboard)/dashboard/...` — protected admin UI. Per-event admin pages live under `dashboard/events/[eventId]/{approvals,attendees,attendees/[contactId],badges,checkin,contacts,emails,form-builder,registrations,settings,settings/team,statistics,whatsapp}`.
- `(public)/register/[eventSlug]`, `(public)/badge`, `(public)/portal` — unauthenticated pages for attendees.
- `api/...` — route handlers. Per-event API lives under `api/events/[eventId]/{modules,form-fields,phases,phases/[phaseId]/steps,registrations,contacts,emails,email-settings,branding,domain,capacity,badges,checkin,whatsapp,approvals,statistics,attendees}`. Public-facing endpoints are `api/register/[eventSlug]` and `api/portal/[eventSlug]/*` (info, OTP request/verify, logout, phases).

### Auth & authorization

There are two parallel auth systems: **admin (NextAuth)** for `/dashboard` and **portal (custom JWT cookie)** for attendees on `/portal`.

**Admin auth — three layers:**

1. **`middleware.ts`** (repo root, not under `src/`) — cookie-based gate. Redirects unauthenticated users away from `/dashboard` and authenticated users away from `/login`. `/register/*`, `/badge/*`, and `/api/*` pass through; API routes must do their own auth.
2. **`src/lib/auth.ts`** — NextAuth v5 with Prisma adapter, Credentials provider (bcrypt), JWT sessions. The `role` claim is copied into the JWT and session.
3. **`src/lib/permissions.ts`** + **`src/lib/api-auth.ts`** — global roles (`VIEWER` < `EDITOR` < `MANAGER` < `SUPER_ADMIN`) gate user management; per-event access is gated by `EventMember` rows. `SUPER_ADMIN` bypasses all event-scoped checks. For everyone else the `eventRole` (from `EventMember`) is what matters — the user's global role is otherwise ignored for event operations. Use the helpers `canViewEvent`, `canEditEvent`, `canManageEvent`.

**API routes against `/api/events/[eventId]/...` should call `authorizeEvent(eventId, { role, module })` from `src/lib/api-auth.ts`** rather than re-implementing the membership lookup. It returns either an `EventAuthContext` (with `event`, `eventRole`, `session`, `role`) or a `NextResponse` error to forward. `authorizeEvent` can also enforce a `ModuleName` in one call, replacing a separate `requireModule`.

**Portal auth (attendees):** `src/lib/portal/` holds the OTP flow that replaced the old confirmation-code form. Attendees request a one-time code (`POST /api/portal/[eventSlug]/otp/request`), verify it (`POST /api/portal/[eventSlug]/otp/verify`), and receive a signed 24-hour cookie (`portal_session`) bound to a `registrationId` + `eventSlug` (see `src/lib/portal/session.ts`). Portal API routes verify the cookie via `getPortalSessionFromRequest(req, eventSlug)`. Login is rate-limited (`src/lib/portal/login-rate-limit.ts`).

### Module system (important)

Each `Event` has a 1:1 `EventModules` row with booleans for optional features (`checkIn`, `whatsApp`, `sessions`, `payments`, `selfServicePortal`, `approvalWorkflow`, `waitlist`, `multiLanguage`, `customDomain`, `customEmail`, `webhooks`). `formBuilder` defaults to `true`; the rest default to `false`.

For gated features, prefer `authorizeEvent(eventId, { module: "..." })` (which combines membership + module check). The lower-level `requireModule(eventId, moduleName)` from `src/lib/guards/module-guard.ts` is still available when you only need the module check. `MODULE_INFO` in the same file is the single source of truth for module names, labels, descriptions, and categories — reuse it rather than duplicating strings. When creating a new event, call `createDefaultModules(eventId)` to seed the row.

### Data layer

- `src/lib/prisma.ts` — singleton Prisma client.
- `src/lib/services/` — service objects: `eventService`, `contactService`, `registrationService`, `emailService`, `badgeService`, `approvalService`, `checkinService`, `whatsappService`, `emailProviderService`, `eventMemberService`, `phaseService`, `phaseReminderService`. New DB access should go through a service rather than inline `prisma.*` calls in route handlers when an existing method covers it. Only `event/contact/registration/email/badge` are re-exported from `services/index.ts`; other services are imported directly from their file.
- `src/lib/validations/` — Zod schemas per domain (contact, event, email-template, registration, event-member). Use these in API routes rather than ad-hoc validation.
- `prisma/schema.prisma` — PostgreSQL. Key cascade chains: deleting an `Event` cascades to `Contact`, `Registration`, `FormField`, `EmailTemplate/Campaign/Log`, `Badge*`, `CheckIn*`, `WhatsApp*`, `EventModules`, `EventBranding`, `EventDomain`, `EventEmailSettings`, `EventMember`, `Phase` (and through `Phase` to `Step`, `PhaseSubmission`, `PhaseAccess`). A `Contact` is unique per `(eventId, email)`; a `Registration` is 1:1 with a `Contact`.

### Phase → Step → FormField (forms are no longer flat)

Forms are organized as **Phase → Step → FormField**. Every `FormField` has a non-nullable `stepId`; there is no flat per-event field list anymore.

- **`Phase`** has a `type`: `REGISTRATION` (the public registration flow, exactly one per event in current usage) or `POST_REGISTRATION` (data collected after the attendee has registered, e.g. travel info, dietary preferences). Post-registration phases optionally carry `opensAt`/`closesAt`, `isRequired`, and a `reminderTemplateId` (an `EmailTemplate` to auto-send when the phase opens or as a reminder — see `phaseReminderService`).
- **`Step`** is a page within a phase. The public registration page (`(public)/register/[eventSlug]`) renders steps as a stepper. Order is enforced by `@@unique([phaseId, order])`.
- **`PhaseSubmission`** stores the attendee's answers for a `POST_REGISTRATION` phase (`(phaseId, registrationId)` unique). The `REGISTRATION` phase's data still lands in `Registration.formData` — do not duplicate it into a `PhaseSubmission`.
- **`PhaseAccess`** is a per-attendee override row. `AccessStatus` is `LOCKED` (admin force-closed for this attendee, ignores dates) or `OPEN` (admin force-opened, ignores dates). **Absence of a row is not an enum value** — it means "fall back to the phase's `opensAt`/`closesAt` window." Admins use these overrides to grant/revoke access for individual registrants without changing the phase's global window.

When working with form data: the registration form (`(public)/register/[eventSlug]`) walks `Phase[type=REGISTRATION] → Step[] → FormField[]` ordered by `order`, respecting `width` (FULL/HALF/THIRD), `conditional` logic (`{showIf: {field, operator, value}}`), and `validation` rules. Post-registration phases are rendered separately by the portal (`(public)/portal`) and submitted via `POST /api/portal/[eventSlug]/phases/[phaseId]`.

### Dynamic form builder

`src/lib/form-builder/` holds:

- `field-types.ts` — maps `FieldType` enum values to UI metadata.
- `countries.ts` — full 195-country list used by `COUNTRY` / `PHONE_COUNTRY` field types (pre-populated, do not re-seed elsewhere).
- `default-fields.ts` — `DEFAULT_FIELDS` seeded on event creation. Fields with `isSystem: true` cannot be deleted from the form builder.

When adding a new `FieldType`: update the enum in `schema.prisma`, the metadata in `field-types.ts`, and the renderer on the public registration page.

### Email & notifications

- `src/lib/services/email-provider.service.ts` — the nodemailer transport AND per-event sender resolution. `SYSTEM` uses the `SMTP_*` env vars; if `EventModules.customEmail` is on, `EventEmailSettings` can switch the event to `CUSTOM_SMTP`, `RESEND`, `SENDGRID`, or `MAILGUN`.
- `src/lib/email-renderer.ts` + `src/lib/services/email.service.ts` — template rendering (`EmailTemplate.bodyHtml` with `variables`) and campaign send orchestration, writing an `EmailLog` row per recipient.
- `src/lib/services/phase-reminder.service.ts` — sends the per-phase reminder email (using `Phase.reminderTemplateId`) and toggles `Phase.reminderSent`. Phases without a `reminderTemplateId` are manual-only.
- Badge PDFs: `src/lib/badge-generator.ts` uses `@react-pdf/renderer` + `qrcode`. Badges are 1:1 with `Registration` and reference the event's single `BadgeTemplate`.

### Styling & UI

Tailwind CSS 4 (via `@tailwindcss/postcss`), shadcn/ui components in `src/components/ui/` (config in `components.json`), Radix primitives, `lucide-react` icons, `sonner` for toasts. Prefer adding/extending shadcn components over bespoke ones. Path alias: `@/*` → `./src/*`.

## Conventions specific to this codebase

- **Event-scoped everything**: almost every API handler and service method takes an `eventId`. When adding new features, follow the `api/events/[eventId]/<feature>/route.ts` pattern and add a matching dashboard page under `(dashboard)/dashboard/events/[eventId]/<feature>/`.
- **Use `authorizeEvent` for per-event API routes**: don't re-implement membership lookups or stack `auth()` + `requireModule` by hand when one call covers both.
- **Gating new features**: if the feature is optional per event, add a boolean to `EventModules` in `schema.prisma`, add an entry in `MODULE_INFO`, and pass it to `authorizeEvent({ module: ... })` (or call `requireModule`). Don't gate via ad-hoc flags.
- **System fields** on `FormField` (`isSystem: true`) must remain undeletable from the UI — the form-builder page enforces this; preserve that behavior.
- **Bilingual content**: many models carry `*Ar` siblings (`labelAr`, `welcomeTitleAr`, etc.) for Arabic. When adding user-facing text fields that belong on the registration page or branding, consider whether an Arabic counterpart is needed (the `multiLanguage` module toggles this UI).
- **`Registration.formData`** is a free-form Json blob matching active `FormField.name`s in the `REGISTRATION` phase — do not assume a fixed shape. Post-registration data lives in `PhaseSubmission.data`, not in `formData`.
- **Form fields always belong to a step**: `FormField.stepId` is non-nullable. There is no event-level field list — create or look up the right `Step` (under the right `Phase`) first.

## Workflow rules for staged feature work

Every stage in a multi-stage spec ends with these four steps, in order:

1. Commit all changes from this stage to git with a clear message describing what was added or changed. Use a stage prefix like `feat(stage2): ...` so the history is easy to scan.
2. Push to `origin/<branch>`.
3. Verify the Vercel Preview build for this branch goes green. If it fails, fix the issue before declaring the stage done.
4. Report stage status to the user — what was shipped, any deviations from the spec, and confirmation that build is green.

Do not start the next stage until those four are done. The user will explicitly green-light each stage based on the report.

Schema changes deserve extra care:

- Always verify the local database state matches the schema in code before committing. If you ran `prisma db push` to apply schema, make sure the schema file is also committed.
- Never leave the deployed code and the deployed database out of sync.
- For destructive schema changes (dropping columns, removing tables), do not silently use `--accept-data-loss`. Surface the change to the user first.
