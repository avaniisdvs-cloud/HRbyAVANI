# Project Baseline
**Snapshot date:** 2026-06-04

---

## Application Purpose and Business Domain

AVANIIS HR is an AI-native enterprise Human Capital Management (HCM) platform built for Avaniis / Avaniis in the UAE. It covers the full employee lifecycle: hiring, onboarding, leave management, payroll (UAE WPS/GPSSA/DEWS/EOSB), timesheets, org chart, compliance, AI assistant (ARIA), and employee self-service.

Key characteristics:
- Bilingual throughout (English and Arabic) — all user-facing strings must have both `name_en` and `name_ar` fields
- UAE Labour Law compliant — 57 business rules cited as BR-xx in code comments
- PII encrypted at field level (emirates_id, passport_number, iban) per UAE PDPL
- All HR records are immutable (effective-date pattern — no hard deletes)
- Every business write produces an audit trail

**Production URL:** http://localhost:3001
**Client phase:** Phase 1 MVP — complete and QA-certified

---

## Architecture Style

- Next.js 15 App Router with React Server Components and Server Actions
- Monolith (no microservices): all business logic in `modules/`, all UI in `app/` and `components/`
- Server Actions are the primary RPC mechanism — no separate API layer for internal calls
- Background jobs via `node-cron` + Postgres outbox pattern (no Redis/BullMQ/Kafka)
- Multi-tenant ready but single-tenant deployed (one Avaniis tenant)

---

## Technology Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js | 15.3.9 | App Router; `serverExternalPackages: ['@react-pdf/renderer']` |
| Runtime | React | 19.2.6 | Required by Next.js 15 |
| Language | TypeScript | 5.5 | `strict: true`; 0 errors is the invariant |
| Database | PostgreSQL 16 (Neon) | — | eu-central-1; local dev uses Docker |
| ORM | Drizzle ORM | 0.45.2 | Schema in `drizzle/schema/`; migrations in `drizzle/migrations/` |
| ORM CLI | drizzle-kit | 0.31.10 | `pnpm db:generate` and `pnpm db:migrate` |
| Auth | Auth.js (next-auth) | 5.0.0-beta.31 | JWT strategy; no DB sessions |
| SSO | Microsoft Entra ID | — | OIDC; Avaniis corporate requirement |
| UI primitives | Radix UI + shadcn/ui | — | Headless; styled with Tailwind + CSS token system |
| Styling | Tailwind CSS | 3.4.4 | Token-based; never raw hex values in components |
| Fonts | Inter, Fraunces, JetBrains Mono, Noto Sans Arabic | — | Via `--font-sans`, `--font-serif`, `--font-mono`, `--font-arabic` CSS variables |
| Org chart | @xyflow/react | 12.10.2 | Purpose-built graph library |
| AI assistant | Anthropic Claude API (`@anthropic-ai/sdk`) | 0.91.1 | ARIA — streaming chat; graceful failure required |
| PDF generation | jspdf | 4.2.1 | Upgraded from 2.5.2 due to LFI CVE; `@react-pdf/renderer` also present |
| XSS sanitisation | isomorphic-dompurify | 3.14.0 | Applied in `pdf-template.tsx` before any HTML→PDF path |
| Background jobs | node-cron | 3.0.3 | Cron trigger; Postgres outbox for at-least-once email delivery |
| Storage (docs) | Azure Blob / AWS S3 / local | — | Provider abstracted via `lib/storage/`; controlled by `DOCUMENT_STORAGE_PROVIDER` env var |
| Package manager | pnpm | 9.4.0 | Never npm or yarn |
| Unit/integration tests | Vitest | 1.6.0 | `pnpm test` runs all |
| E2E tests | Playwright | 1.44.0 | 11 projects; must run against `pnpm start` not `pnpm dev` |
| Load tests | k6 | — | Scripts in `tests/performance/` |
| Accessibility | @axe-core/playwright | 4.11.2 | Smoke checks in E2E suite |
| Hosting | Vercel | — | Region `fra1` (Frankfurt); auto-deploy on push to `main` |

---

## Deployment Architecture

```
User (UAE) → bom1 PoP (Mumbai CDN edge) → fra1 function (Frankfurt) → Neon eu-central-1
```

**Why Frankfurt + eu-central-1:** The Vercel function and Neon database are co-located in the same AWS Frankfurt region. This reduces DB latency from ~80–100ms (cross-region) to under 5ms. This is the single most important performance decision in the architecture.

**Cron job:** `vercel.json` schedules `/api/cron/workflow-sla` at `0 9 * * *` (09:00 UTC daily).

**SSL:** Neon mandates TLS; `ssl: 'require'` is set in the production DB client config.

**Connection pooling:** Production uses the Neon **pooled** endpoint (pgBouncer transaction mode). The `DATABASE_URL` in Vercel **must point at the pooled connection string** (host contains `-pooler`). Pool config: `max: 5`, `prepare: false` (mandatory for pgBouncer transaction mode), `idle_timeout: 20s`, `connect_timeout: 10s`, `max_lifetime: 1800s`.

---

## Database Strategy

**Database:** PostgreSQL 16 via Neon (serverless, eu-central-1)
**ORM:** Drizzle ORM 0.45.2 with the `postgres` driver

**Schema files** (11 files in `drizzle/schema/`):
- `foundation.ts` — persons, positions, departments, legal_entities, worker_assignments
- `configuration.ts` — leave rules, workflows, custom fields, backdate policies
- `transactions.ts` — leave requests, payroll runs, timesheets
- `workflow-engine.ts` — workflow_instances, workflow_steps, workflow_templates
- `timesheets.ts` — daily timesheet records
- `actions.ts` — hiring_requests, transfer_requests
- `org-cache.ts` — org chart snapshot cache
- `employee-letters.ts` — letter templates and generated letters
- `probation.ts` — probation review tracking
- `document-files.ts` — person_documents
- (and others)

Total: 109 `pgTable` definitions across all schema files.

**Migration journal gap — CRITICAL:**

The Drizzle journal (`drizzle/meta/_journal.json`) tracks only migrations **0000–0039**. Running `pnpm db:migrate` applies only those 40 migrations.

Migrations 0040–0054 are **manual SQL files** applied directly via the Neon SQL Editor. They are NOT in the journal.

Migrations 0055–0057 are **WIP files in the folder but NOT yet applied to any environment**:
- `0055_payroll_run_number_per_entity.sql`
- `0055_wip_step_instance_columns.sql`
- `0056_wip_notification_queue_meta.sql`
- `0057_wip_audit_immutability.sql`

Note there are two files starting with `0055_` — check content before applying either.

**Next safe migration slot: 0058** (verify by inspecting `drizzle/migrations/` before creating).

To apply any migration to Neon:
1. Open Neon Console → SQL Editor
2. Paste the `.sql` file contents
3. Execute and verify (no error rows)
4. Verify with `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`

**Do not use `psql`** unless you have installed it via `brew install libpq` — it is not present by default on the dev Mac.

---

## Authentication Model

Auth.js v5 (`next-auth@5.0.0-beta.31`) with JWT session strategy.

**Session strategy: JWT** — no database sessions. This means every request does not require a DB round-trip to validate the session; the JWT carries all needed claims. Tradeoff: revocation requires JWT expiry (30 min `maxAge`).

**Providers:**

1. **Microsoft Entra ID (primary)** — OIDC SSO for Avaniis employees. Configured via `AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID`, `AUTH_MICROSOFT_ENTRA_ID_CLIENT_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`. Domain restriction via `AUTH_ALLOWED_DOMAINS` env var. New SSO users without a `user_accounts` row are provisioned as EMPLOYEE role and a Super Admin notification is sent.

2. **Credentials (secondary)** — Two modes:
   - Dev/UAT hardcoded accounts active when `NODE_ENV=development` or `ENABLE_DEV_ACCOUNTS=true`. Email/password `demo`. These accounts bypass DB lookup for authentication but still resolve `personId` and `legalEntityId` from the DB.
   - DB-backed LOCAL password — SUPER_ADMIN role only, all environments. Password stored as bcrypt hash in `user_accounts.passwordHash`.

**JWT claims:**
- `id` — user UUID
- `email` — primary email
- `name` — display name
- `role` — one of the 7 KRole values
- `legalEntityId` — the user's primary legal entity UUID
- `personId` — optional; the linked `persons` table UUID
- `mfaVerified` — `true` for Entra ID sessions (Avaniis CA enforces MFA); `false` for dev credentials; `undefined` for legacy JWTs (treated as trusted)

**Session timeout:** 30 minutes (`maxAge: 1800`).

**MFA enforcement (SEC-04):** `requireRole()` checks `mfaVerified === false` (strict equality — `undefined` is not blocked) for `HIGH_PRIVILEGE_ROLES` (HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN). Dev sessions bypass this check via `isDevSession` guard.

---

## Authorization Model

**7 roles (KRole type in `lib/auth.ts`):**

| Role | Access level | Notes |
|---|---|---|
| `EMPLOYEE` | Own records only | ESS: leave requests, profile, payslips, timesheet, documents |
| `MANAGER` | Own team | Leave approvals, team timesheets, org chart read |
| `PAYROLL_ADMIN` | Payroll only | Payroll runs, WPS, salary elements |
| `FINANCE` | Finance read | Reports, payroll read |
| `HR_ADMIN` | All HR operations | Persons, absence, master data, letters, workflows |
| `HR_DIRECTOR` | HR_ADMIN + strategic | Higher approval authority |
| `SUPER_ADMIN` | Full system | User management, DataOps console, migration factory |

**HIGH_PRIVILEGE_ROLES** (require MFA): `HR_ADMIN`, `HR_DIRECTOR`, `SUPER_ADMIN`

**Dual-layer RBAC:**
1. `requireRole(allowed: KRole[])` in `lib/auth.ts` — called at the top of every Server Action; throws FORBIDDEN or STEP_UP_REQUIRED
2. `feature_permissions` table — per-feature × per-role action matrix (view/create/edit/delete/approve/export) managed at `/access/feature-permissions`

**Middleware routing:** `middleware.ts` enforces role-gated path prefixes (e.g. `/master-data` requires HR_ADMIN+; `/admin/dataops` requires SUPER_ADMIN only). This is a routing-level backstop — page guards are the primary enforcement.

---

## Tenant Strategy

Single-tenant deployment with multi-tenant readiness built in.

Every table has `tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid`. This constant is `TENANT_ID` from `lib/constants.ts` and is used in every INSERT.

When the system becomes multi-tenant, the `tenant_id` column is already in place — only the query filters and auth claims need updating.

**Avaniis legal entity UUID:** `aaaa0001-0000-0000-0000-000000000001`
**Default dev entity UUID:** `11111111-1111-1111-1111-111111111111`

---

## Testing Strategy

| Layer | Tool | Location | Command |
|---|---|---|---|
| Unit | Vitest | `tests/unit/` | `pnpm vitest run tests/unit` |
| Integration | Vitest | `tests/integration/` | `pnpm vitest run tests/integration` |
| Chaos | Vitest | `tests/chaos/` | `pnpm vitest run tests/chaos/resilience.test.ts` |
| Security | Vitest | `tests/security/` | `pnpm vitest run tests/security` |
| E2E | Playwright | `tests/e2e/` | `pnpm playwright test` (against `pnpm start`) |
| Load | k6 | `tests/performance/` | See `tests/performance/soak-test-runbook.md` |

E2E test projects: `setup-hr-admin`, `setup-employee`, `setup-manager`, `setup-super-admin`, `hr-admin`, `employee`, `manager`, `super-admin`, `chromium`, `firefox`, `webkit`, `edge`, `tablet`, `rtl` (14 total).

E2E tests MUST run against `pnpm start` (production build), not `pnpm dev`. The dev server's hot-reload behaviour causes flaky results in concurrent tests.

After every Playwright test run, update `tests/e2e/e2etestresults.md` with a new numbered entry.

---

## Build Commands

```bash
pnpm install          # install all dependencies
pnpm dev              # dev server → http://localhost:3000
pnpm fresh            # rm -rf .next && dev (use when build cache is stale)
pnpm build            # production build (must produce 0 TS errors, 0 build errors)
pnpm start            # serve the production build (required for E2E tests)
pnpm typecheck        # tsc --noEmit (must be 0 errors — hard invariant)
pnpm test             # vitest run (all Vitest tests)
pnpm test:e2e         # playwright test (requires pnpm start running separately)
pnpm db:generate      # drizzle-kit generate (creates migration SQL from schema diff)
pnpm db:migrate       # applies journalled migrations 0000–0039 only
pnpm db:studio        # Drizzle Studio UI
```

**Safety rail:** `scripts/guard-db-write.js` blocks `db:migrate`, `db:push`, `db:seed`, and `test:e2e` commands against Neon unless overridden. This prevents accidental production DB writes from the dev machine.

---

## Deployment

Vercel auto-deploys on every push to `main`. No manual deploy step required. Preview deployments are created for every PR.

Key Vercel settings:
- Region: `fra1` (Frankfurt) — **do not change; this is the DB co-location decision**
- Node.js version: 20.x
- Build command: `pnpm build`
- Install command: `pnpm install`

---

## Important Environment Variables

Names only — never put values here or in chat. Obtain values from Vercel dashboard or a password manager.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (must contain `-pooler` in host) |
| `FIELD_ENCRYPTION_KEY` | 64 hex chars (32 bytes); AES-256-GCM key for PII fields |
| `AUTH_SECRET` | Auth.js JWT signing secret |
| `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` | Entra ID tenant UUID |
| `AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID` | Entra ID app client ID |
| `AUTH_MICROSOFT_ENTRA_ID_CLIENT_SECRET` | Entra ID app client secret |
| `AUTH_ALLOWED_DOMAINS` | Comma-separated allowed email domains (e.g. `avaniis.example,avaniis.ae`) |
| `DOCUMENT_STORAGE_PROVIDER` | `azure` / `aws` / `local`; unset in production throws a clear error |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob Storage connection string (when provider=azure) |
| `AZURE_STORAGE_CONTAINER_NAME` | Azure Blob container name (defaults to `avaniis-documents`) |
| `AWS_REGION` | AWS region (when provider=aws) |
| `AWS_ACCESS_KEY_ID` | AWS IAM access key (when provider=aws) |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key (when provider=aws) |
| `AWS_S3_BUCKET_NAME` | S3 bucket name (when provider=aws) |
| `ANTHROPIC_API_KEY` | Claude API key for ARIA |
| `CRON_SECRET` | Bearer token required by `/api/cron/*` endpoints |
| `ENABLE_DEV_ACCOUNTS` | `true` to enable dev credentials in non-development environments (UAT only) |
| `ENCRYPTION_KEY` | Alias used in some contexts for `FIELD_ENCRYPTION_KEY` — verify which is active |
| `DEFAULT_LEGAL_ENTITY_ID` | Entity UUID assigned to new SSO users without a DB row |
| `SUPER_ADMIN_NOTIFY_EMAIL` | Email address for new-SSO-user notifications |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | SMTP config for outbound email |
| `NODE_ENV` | `development` enables dev credentials; `production` enforces security guards |
