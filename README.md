# Registration System

A modular event registration platform built for La Gloire.

## Features

- Multi-event management with custom settings per event
- Dynamic registration forms
- Contact management (import/export CSV/Excel)
- Email campaigns and templates
- Badge generation with QR codes
- Check-in system (coming soon)
- WhatsApp notifications (coming soon)
- User management with role-based access control (4 roles)

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript 5
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** NextAuth.js v5
- **UI:** Shadcn/ui + Tailwind CSS 4
- **Email:** Nodemailer + React Email
- **PDF/Badge:** @react-pdf/renderer + QRCode

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/mohanadrashad/registration-system-.git
   cd registration-system
   ```

2. Copy `.env.example` to `.env` and fill in values:
   ```bash
   cp .env.example .env
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Push database schema:
   ```bash
   npm run db:push
   ```

5. Seed database (optional):
   ```bash
   npm run db:seed
   ```

6. Run development server:
   ```bash
   npm run dev
   ```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema to database |
| `npm run db:seed` | Seed database with initial data |
| `npm run db:studio` | Open Prisma Studio |

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication pages
│   ├── (dashboard)/       # Protected dashboard
│   ├── (public)/          # Public registration pages
│   └── api/               # API routes
├── components/            # React components
│   ├── ui/               # Shadcn/ui components
│   └── layout/           # Layout components
├── lib/                   # Utilities and services
│   ├── services/         # Business logic
│   └── validations/      # Zod schemas
├── hooks/                 # Custom React hooks
└── types/                 # TypeScript types
```

## User Roles

| Role | Permissions |
|------|-------------|
| VIEWER | View events, contacts, and statistics |
| EDITOR | Create/edit events, contacts, send emails |
| MANAGER | All editor permissions + manage users |
| SUPER_ADMIN | Full system access |

## License

Private - La Gloire
