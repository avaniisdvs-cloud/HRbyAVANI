# Avaniis HR

A bilingual English/Arabic HR application with employee records, leave, approvals,
payroll, organization management, and employee self-service.

## Current preview

This working copy is configured for a local preview with **six synthetic employees**.
It is not linked to a new cloud deployment. The imported operational documents are
historical references, not certification of this rebranded copy.

```bash
pnpm install
pnpm preview
```

Open [Avaniis HR](http://localhost:3001). Sign in as `super.admin@avaniis.dev` with
password `demo`. The other preview accounts are listed in
[the preview guide](docs/AVANIIS-PREVIEW.md).

Private configuration is in ignored `.env.local`; do not commit or share that file.
The current preview uses an isolated PostgreSQL 16 database, not a customer database.
The preview command starts the provisioned local database when it is stopped.

For a fresh machine, configure a local development PostgreSQL connection and generate
`AUTH_SECRET` and a 64-character hex `ENCRYPTION_KEY`; use `.env.example` for key names.
The current schema was created from the Drizzle definitions on an empty local database.
**Do not use `db:migrate` alone to initialize a fresh database:** the historical migration
journal omits manual SQL files. Do not run `db:push` against existing customer data.

```bash
pnpm typecheck
pnpm test
pnpm audit:branding
pnpm build
```

The current logo is a temporary Avaniis text wordmark. Existing layout, typography,
and photography are retained pending the supplied logo and branding guidelines.

---

## Key Features

- **Core HR** — employee records, contracts, bank details, dependents, documents
- **Master Data Management** — 9 entities with full CRUD: Legal Entities, Departments, Positions, Grades, Locations, Work Schedules, Holiday Calendars, Leave Types, Jobs; each with slide-over drawer, change-reason modal, disable/enable flows, and audit history
- **Absence Management** — leave requests, balances, accruals, calendar view
- **Approval Workflows** — multi-step Approve / Reject / Delegate engine
- **Feature Permissions** — role-based feature access control per user
- **Admin Navigation** — grouped sidebar nav with role-aware config (`admin-nav.ts`, `manager-nav.ts`)
- **ARIA AI Assistant** — Claude-powered HR chatbot (admin + employee)
- **Compliance** — UAE Labour Law, GPSSA pension, data retention with BR-* guard enforcement
- **Document Vault** — Azure Blob Storage with expiry tracking
- **Bilingual** — English + Arabic with RTL layout support
- **Audit Log** — immutable change history on all sensitive records

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Database | PostgreSQL 16 (Drizzle ORM) |
| Auth | Auth.js v5 + Microsoft Entra ID |
| UI | Tailwind CSS + Radix UI (shadcn/ui) |
| Storage | Azure Blob Storage |
| AI | Anthropic Claude API |
| Testing | Vitest + Playwright |
| Package manager | pnpm 9.4 |

---

## Documentation

| File | Description |
|------|-------------|
| [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) | Full step-by-step setup instructions |
| [`docs/FILE_STRUCTURE.md`](docs/FILE_STRUCTURE.md) | Annotated project file tree |
| [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md) | All packages and external services |
| [`docs/KNOWN_GAPS.md`](docs/KNOWN_GAPS.md) | Incomplete features and assumptions |
| [`docs/DESIGN-STANDARD.md`](docs/DESIGN-STANDARD.md) | Hard rules, design tokens, component patterns |
| [`docs/handoff-reference.md`](docs/handoff-reference.md) | Full handoff reference for new developers |
| [`HRBacklog.md`](HRBacklog.md) | Full product backlog |
| [`HRAuditlog.md`](HRAuditlog.md) | QA/QC audit log — all findings and resolutions |
| [`SPRINT_1_PROGRESS.md`](SPRINT_1_PROGRESS.md) | Sprint progress tracker (all sprints) |

---

## Development Commands

```bash
pnpm dev            # Start dev server
pnpm build          # Production build
pnpm test           # Run all tests
pnpm typecheck      # TypeScript check
pnpm lint           # ESLint
pnpm db:migrate     # Apply DB migrations
pnpm db:seed        # Seed dev data
pnpm db:studio      # Open Drizzle Studio
```

---

## Environment Variables

See [`.env.example`](.env.example) for all required variables with descriptions.
