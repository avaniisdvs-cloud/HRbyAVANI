# AVANIIS HR — Enterprise Review Extraction Bundle
## PRIORITY 3-06 — project-memory/2026-06-04 (docs 00-18; 19 & 20 are in P1)
Generated: 2026-06-13 · Source repo: /Users/d.kethari/D_Drive/AVANIIS_HR_SYS · Branch: main
Delimiter: each file begins at a line of '=' with FILE [id]: <path>. Content is verbatim, unmodified.

================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/00-README-HANDOVER.md
LINES: 59
================================================================================
# Project Memory — Handover Package
**Generated:** 2026-06-04
**Project:** AVANIIS HR (Avaniis / Avaniis)
**Phase:** Phase 1 MVP — Complete and QA-certified

---

## Why this package exists

This directory is a structured knowledge snapshot for future AI coding sessions (and human developers who join mid-project). The CLAUDE.md at the repository root carries running session notes, but those accumulate over time and become noisy. This package provides clean, stable reference material that does not change between sessions.

Load this package at the start of a new session **before** reading CLAUDE.md, or when CLAUDE.md is ambiguous about the current state of an architectural rule.

---

## How to use it

1. Read this README first (you are here).
2. Read `01-PROJECT-BASELINE.md` for technology choices, deployment config, and commands.
3. Read `11-DO-NOT-BREAK-RULES.md` before touching any existing code.
4. Read `18-ARCHITECTURAL-DECISIONS.md` when you are about to propose a new approach and want to understand why the current one was chosen.
5. The remaining files (02–17) cover specific subsystems. Load them only when working in that area.

---

## File inventory

| File | Purpose |
|---|---|
| `00-README-HANDOVER.md` | This file — explains the package, when generated, how to use it |
| `01-PROJECT-BASELINE.md` | Tech stack, deployment architecture, auth model, roles, env vars, build commands |
| `02-MODULE-MAP.md` | Every module with status, main files, key tables, dependencies, risk, and load guidance |
| `03-CURRENT-STATE.md` | What's complete, what's partial, known issues, technical debt, open decisions |
| `04-DATABASE-MODEL.md` | Schema files, key tables, migration state (applied vs WIP), risky areas, payroll deps |
| `05-RBAC-SECURITY.md` | 7 roles, permissions, MFA enforcement, access boundaries, security controls |
| `06-WORKFLOW-RULES.md` | Workflow engine, approval chains, collision hardening, business invariants |
| `07-UI-PATTERNS.md` | CSS design tokens, layout conventions, nav patterns, bilingual, accessibility |
| `08-PAYROLL-READINESS.md` | UAE payroll blueprint (WPS/GPSSA/DEWS/EOSB), reusable entities, missing prerequisites |
| `09-AI-SESSION-GUIDE.md` | Task-specific file loading guide, session rules, known footguns |
| `10-NEXT-DEVELOPMENT-PLAN.md` | Immediate next steps, priorities, branch/migration/release strategy |
| `11-DO-NOT-BREAK-RULES.md` | Numbered checklist of architectural invariants — read before every code change |
| `12-FILE-OWNERSHIP-MATRIX.md` | Risk level per file/path pattern, what's safe to modify |
| `13-CODEX-START-PROMPT.md` | Ready-to-paste startup prompt for OpenAI Codex |
| `14-CLAUDE-START-PROMPT.md` | Ready-to-use startup prompt for a fresh Claude Code session |
| `15-VERIFIED-IMPLEMENTATION-MATRIX.md` | Evidence-backed module status — claimed vs verified with file references |
| `16-DEPENDENCY-GRAPH.md` | Module dependency tree, risk propagation, cross-cutting concerns |
| `17-CONTEXT-LOADING-MATRIX.md` | Minimum file sets per task type — critical for reducing context consumption |
| `18-ARCHITECTURAL-DECISIONS.md` | 13 ADRs with rationale, rejected alternatives, and future warnings |

---

## Important notes for AI sessions

- **Code freeze is the default.** Do not modify production code unless the user explicitly asks. Diagnose and explain only; ask permission before editing any file.
- **Never run `npm` or `yarn`.** This project uses `pnpm` exclusively.
- **Never deviate from ADR-001 stack.** No NestJS, Kafka, Redis, Prisma, TypeORM, Kubernetes, or Kong — ever.
- **Neon migration gap.** `drizzle-kit migrate` only applies migrations 0000–0039. Migrations 0040–0054 are applied manually via Neon SQL Editor. Migrations 0055–0057, 0060, and 0061 in the folder are WIP and NOT yet applied. The next safe slot for a new migration is 0058 (verify by checking `drizzle/migrations/` before creating anything).
- **CLAUDE.md is authoritative for session state.** This package is stable reference; CLAUDE.md carries current in-progress notes and pending tasks.
- **Production URL:** http://localhost:3001 — never run destructive operations against it.


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/01-PROJECT-BASELINE.md
LINES: 268
================================================================================
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


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/02-MODULE-MAP.md
LINES: 43
================================================================================
# 02 — Module Map
> Generated: 2026-06-04 | Source: live file inspection of modules/* and app/*
> DO NOT hand-edit — regenerate from file evidence only.

---

## Module Inventory Table

| # | Module | Purpose | Status | Main Files | Key Tables | Dependencies | Risk | Load For AI? |
|---|--------|---------|--------|------------|------------|-------------|------|-------------|
| 1 | **Core HR** | Employee master records, positions, departments, org chart actions, contracts, worker assignments, bank details, dependents, documents, photo, probation, exit clearance | Verified Complete | `modules/core-hr/actions.ts`, `validations.ts`, `schema.ts`, `services.ts`, `edit-person.ts`, `org-chart-actions.ts`, `photo-upload.ts`, `department-head.ts`, `bulk-import/`, `contracts/`, `bank-details/`, `dependents/`, `documents/`, `employment-actions/`, `exit-clearance/`, `probation/`, `worker-assignments/`, `work-schedule-assignment-actions.ts` | `persons`, `positions`, `worker_assignments`, `departments`, `contracts`, `bank_details`, `dependents`, `person_documents`, `work_schedule_assignments` | `lib/db`, `lib/auth`, `lib/audit`, `lib/encryption`, `lib/effective-date`, `lib/org-chart/*`, `modules/workflow`, `modules/notification` | HIGH — central to all other modules; any change has wide blast radius | YES — essential context for any HR-related task |
| 2 | **Employee Self-Service (ESS)** | Employee-facing self-service: profile, leave requests, payslips, documents, letters, insurance view, timesheet, ARIA chat, directory, bank details, accommodations | Verified Complete | `app/(employee)/me/profile/`, `leave/`, `payslips/`, `documents/`, `letters/`, `insurance/`, `timesheet/`, `aria/`, `bank-details/`, `directory/`, `requests/`, `home/`, `accommodations/` | (uses Core HR, Absence, Payroll, Insurance tables via server actions) | `modules/core-hr`, `modules/absence`, `modules/payroll`, `modules/insurance`, `modules/employee-letters`, `modules/notification`, `modules/aria`, `modules/profile` | MEDIUM — UI layer; bugs are UX-visible but not data-corrupting | YES — needed when working on any employee-facing feature |
| 3 | **Leave / Absence Management** | Leave requests, leave balances, accrual engine, carry-forward, leave rules, blackout periods, public holidays, leave plan enrolment, backdate policy enforcement, medical cert upload | Verified Complete | `modules/absence/actions.ts`, `backdate-policy-actions.ts`, `leave-plan-enrolment-actions.ts`, `services.ts`, `validations.ts`, `types.ts` | `absence_entries`, `absence_balances`, `absence_plans`, `absence_types`, `leave_rule_sets`, `leave_rule_lines`, `blackout_periods`, `public_holidays`, `leave_plan_enrolments`, `leave_backdate_policies` | `modules/workflow`, `modules/notification`, `modules/core-hr`, `lib/audit`, `lib/db`, `lib/leave-rule-resolver`, `lib/leave-person-scope` | HIGH — advisory lock, backdate hardening, accrual cron; regression-sensitive | YES — key module for leave-related tasks |
| 4 | **Workflow Engine** | Configurable multi-step approval engine: submit, take action (approve/reject/delegate), SLA breaches, escalation, workflow templates, steps, approval groups, delegations | Verified Complete | `lib/workflow-engine.ts`, `modules/workflow/actions.ts`, `queries.ts`, `schema.ts`, `services.ts`, `types.ts`, `validations.ts` | `workflow_instances`, `workflow_steps`, `workflow_definitions`, `workflow_groups`, `workflow_group_members`, `approval_delegations` | `modules/notification`, `lib/audit`, `lib/db`, `modules/absence`, `modules/core-hr`, `modules/payroll` | CRITICAL — collision-hardened (Phase 3 P2–P6E); do not modify without regression test run | YES — needed for any approval or workflow task |
| 5 | **Approvals** | HR Admin approval inbox, workflow instance detail, operations view, my requests (ESS), approval history | Verified Complete | `app/(hr-admin)/approvals/page.tsx`, `approvals/[instanceId]/page.tsx`, `approvals/operations/page.tsx`, `modules/workflow/queries.ts` | (reads workflow tables via queries) | `modules/workflow`, `modules/aria`, `modules/notification` | LOW — read-heavy UI; depends on workflow engine correctness | OPTIONAL — load when debugging approval flows |
| 6 | **Notifications (Postgres Outbox)** | In-app notifications, email queue, outbox polling, notification preferences, topbar bell, approve/reject quick-actions from topbar | Verified Complete | `modules/notification/actions.ts`, `topbar-actions.ts`, `schema.ts`, `services.ts`, `types.ts`, `validations.ts`, `lib/jobs/process-driver.ts` | `notification_log`, `notification_preferences` | `lib/db`, `lib/audit`, `modules/workflow` (receives dispatch calls) | MEDIUM — outbox poller is node-cron; duplicate dedup in cron must be preserved | YES — cross-cutting; relevant to any write-path task |
| 7 | **Employee Letters (PDF)** | Letter templates, PDF generation via jsPDF 4.2.1, DOMPurify XSS sanitization, email delivery, letter signing (token-based), letter status lifecycle (SUBMITTED/APPROVED/FAILED) | Verified Complete | `modules/employee-letters/actions.ts`, `email.ts`, `engine.ts`, `generate-pdf.ts`, `pdf-template.tsx`, `pdf-react-template.tsx`, `preflight.ts`, `queries.ts`, `resolvers.ts`, `translate.ts`, `app/(hr-admin)/employee-letters/`, `app/(signing)/me/letters/sign/[letterId]/` | `employee_letters`, `letter_templates` | `modules/core-hr`, `modules/workflow`, `lib/audit`, `lib/encryption` | MEDIUM — XSS hardening and status lifecycle are sensitive | OPTIONAL — load for letter/PDF-related tasks |
| 8 | **Document Management** | Employee document upload/download, document metadata, 36-type taxonomy, secure access via API route, cloud-portable storage (Azure/S3/local), UAT local/tmp mode, signed URL issuance | Verified Complete (UAT) / Partially Blocked (Production) | `modules/core-hr/documents/actions.ts`, `app/api/documents/[id]/route.ts`, `lib/storage/providers/`, `lib/storage/factory.ts`, `lib/blob-storage.ts` | `person_documents` | `lib/storage/*`, `lib/auth`, `lib/audit`, `modules/core-hr` | HIGH — 5 production blockers (Azure/S3 not configured, /tmp ephemeral, signed URL not end-to-end tested) | OPTIONAL — load when working on document storage or upload features |
| 9 | **Master Data (MDM)** | Legal entities, departments (with Head + Work Schedule), positions, grades, locations, business units, jobs, projects, work schedules, leave types, holiday calendars, custom fields | Verified Complete | `app/(hr-admin)/master-data/legal-entities/`, `departments/`, `positions/`, `grades/`, `locations/`, `business-units/`, `jobs/`, `projects/`, `work-schedules/`, `leave-types/`, `holiday-calendars/`, `modules/config/`, `components/mdm/MdmDrawer.tsx` | `legal_entities`, `departments`, `positions`, `grades`, `locations`, `business_units`, `jobs`, `work_schedules`, `public_holidays` | `lib/mdm-audit`, `lib/mdm-history`, `lib/audit`, `modules/config` | MEDIUM — department Head field + Work Schedule added 2026-05-31; migration 0054 applied | YES — needed for any schema or MDM feature work |
| 10 | **RBAC / Access Control** | Feature permission matrix (view/create/edit/delete/approve/export per role), SUPER_ADMIN user management, MFA step-up enforcement, role-based nav gating | Verified Complete | `lib/auth.ts`, `modules/access/actions.ts`, `app/(hr-admin)/access/feature-permissions/`, `app/(hr-admin)/users/`, `middleware.ts` | `feature_permissions`, `users` | `lib/db`, `lib/auth`, `modules/audit` | CRITICAL — MFA step-up (`=== false` strict guard) must not be loosened; dual-layer RBAC | YES — essential for any auth, role, or permission task |
| 11 | **Payroll** | UAE WPS payroll runs, salary elements, EOSB calculation, GPSSA/DEWS contributions, suspension pay, payroll assignment history, payroll run creation, payroll definitions, advisory lock on run number | Verified Complete (schema+services); UAE integration depth needs verification | `modules/payroll/actions.ts`, `calculation-engine.ts`, `services.ts`, `validations.ts`, `queries.ts`, `schema.ts`, `payroll-assignment-actions.ts`, `app/(hr-admin)/payroll/` (7 pages) | `payroll_runs`, `payroll_lines`, `salary_elements`, `payroll_definitions`, `payroll_assignments` | `modules/core-hr`, `modules/workflow`, `lib/audit`, `lib/db` | HIGH — advisory lock on run number (RISK-PAYROLL-2 fixed); WPS/GPSSA/DEWS calculations are UAE-law critical | YES — always load for payroll tasks; calculation logic is complex |
| 12 | **AI / ARIA** | Claude API chat assistant, streaming responses, intent resolution, employee/manager context, daily briefing generation, ARIA OS (HR admin AI console), knowledge sources, config management, approval quick-actions, people intelligence, compliance data | Verified Complete | `modules/aria/actions.ts`, `config-actions.ts`, `approval-queries.ts`, `employee-context.ts`, `os-actions.ts`, `people-queries.ts`, `workflow-queries.ts`, `leave-recommendation.ts`, `app/(hr-admin)/aria/`, `app/(employee)/me/aria/`, `app/api/aria/chat/` | `aria_configs`, `aria_knowledge_sources`, `aria_knowledge_chunks`, `aria_sessions` | `modules/workflow`, `modules/absence`, `modules/core-hr`, `modules/notification`, `lib/logger`, `Anthropic Claude API` | MEDIUM — graceful failure handling for RateLimitError/APIConnectionError/AuthenticationError; API key required | OPTIONAL — load for ARIA/AI feature tasks |
| 13 | **Insurance** | Medical insurance plans, policy settings, employee/dependent enrolment, enrolment lifecycle (cancel, extend, change plan), contractor exceptions, age eligibility, plan auto-change on promotion | Verified Complete | `modules/insurance/actions.ts`, `lifecycle.ts`, `eligibility.ts`, `validations.ts`, `app/(hr-admin)/persons/[id]/insurance/`, `app/(hr-admin)/settings/insurance-plans/`, `settings/insurance-policy/`, `app/(employee)/me/insurance/` | `insurance_plans`, `insurance_enrolments`, `insurance_policy_settings` | `modules/core-hr`, `lib/audit`, `lib/db` | LOW — Phase 3 insurer API integration is future work; current module is lifecycle management only | OPTIONAL — load for insurance feature tasks |
| 14 | **Timesheets** | Daily hours entry, overtime tracking, Ramadan schedule, team timesheet admin view, personal timesheet (ESS), work schedule resolution | Verified Complete | `modules/timesheets/actions.ts`, `schema.ts`, `services.ts`, `types.ts`, `validations.ts`, `app/(hr-admin)/timesheets/`, `app/(hr-admin)/my-timesheet/`, `app/(employee)/me/timesheet/` | `timesheet_entries`, `work_schedules`, `work_schedule_assignments` | `modules/core-hr`, `lib/db`, `lib/auth` | LOW — standalone; work schedule link to departments is dormant foundation | OPTIONAL — load for timesheet tasks |
| 15 | **Reports / Analytics** | Role-segmented dashboards (HR Admin, Manager, HR Director, Finance, Employee), insurance reports, KPI cards, Promise.all parallelised queries | Verified Complete | `modules/reports/queries.ts`, `app/(hr-admin)/reports/page.tsx`, `reports/insurance/page.tsx`, `app/(hr-admin)/dashboard/page.tsx` | (read-only queries across multiple tables) | `modules/core-hr`, `modules/absence`, `modules/payroll`, `modules/insurance`, `lib/db` | LOW — read-only; dashboard Promise.all pattern hardened for NFR-01 | OPTIONAL — load for dashboard/analytics tasks |
| 16 | **Audit Trail** | INSERT-only immutable audit log, every DB write emits an audit event, lib/audit.ts must be called inside every transaction | Verified Complete | `modules/audit/schema.ts`, `types.ts`, `lib/audit.ts` | `audit_log` | `lib/db` (written to from within transactions) | HIGH — must remain INSERT-only (Hard Rule 1); migration 0057_wip_audit_immutability.sql exists but is NOT applied | YES — cross-cutting rule; relevant to every write-path task |
| 17 | **Migration Factory V2** | 9-step production migration wizard: environment check, clear data, seed master data, upload XLSX package, validate, dry run, execute (4 phases: employees → manager links → dept heads → leave balances), post-load scorecard, sign-off. Source ingestion (Phases A-D) for raw file classification, transformation, and package building. | Verified Partial | `modules/migration/v2-executor.ts`, `v2-actions.ts`, `v2-validator.ts`, `v2-package-parser.ts`, `v2-dry-run.ts`, `v2-types.ts`, `seed-actions.ts`, `branch-safety.ts`, `source-actions.ts`, `source-classifier.ts`, `source-transformer.ts`, `package-store.ts`, `app/(hr-admin)/admin/migration/` | (writes to `persons`, `worker_assignments`, `absence_balances`, `departments`) | `modules/core-hr` (importEmployeesTx), `lib/db`, `lib/auth`, `lib/audit` | CRITICAL — false-success bug fixed 2026-06-04; pilot reload not yet run; DB state has 21 employees, 0 manager links, 0 leave balances; Step 2 Clear must run before reload | YES — essential context any time migration or data loading is discussed |
| 18 | **DataOps Console** | SUPER_ADMIN SQL console: NL-to-SQL, schema browser, table CRUD, execute arbitrary SQL | Verified Complete | `app/(hr-admin)/admin/dataops/`, `app/api/dataops/` (execute, nl2sql, schema, tables/[schema]/[table]) | (operates on all tables) | `lib/db`, `lib/auth` (SUPER_ADMIN gate), `modules/aria` (NL2SQL) | HIGH — SUPER_ADMIN gated; raw SQL execution; do not expose to non-SUPER_ADMIN | OPTIONAL — load only for DataOps/DBA tasks |
| 19 | **Org Chart** | Interactive org chart canvas using @xyflow/react 12.10.2, recursive CTE tree build, hiring/transfer/acting drawers, ARIA chat panel, analytics overlay, PNG/PDF export, event bus, vacant/frozen/confidential node types | Verified Complete | `lib/org-chart/build-tree.ts`, `types.ts`, `chart-events.ts`, `export.ts`, `components/org-chart/`, `modules/core-hr/org-chart-actions.ts`, `app/(hr-admin)/org-chart/`, `modules/aria/intents/org-chart-intents.ts` | `positions`, `persons`, `worker_assignments`, `org_chart_cache`, `hiring_requests`, `transfer_requests` | `modules/core-hr`, `modules/workflow`, `lib/org-chart/*`, `@xyflow/react` | MEDIUM — Tasks A-G all complete; COLLISION-004/004B hiring+transfer uniqueness hardened | OPTIONAL — load for org chart feature tasks |
| 20 | **Compliance (UAE Labour Law)** | 57 BR-xx UAE Labour Law rules engine, compliance data for ARIA, compliance settings UI | Verified Complete | `modules/compliance/actions.ts`, `schema.ts`, `services.ts`, `types.ts`, `validations.ts`, `app/(hr-admin)/settings/compliance/` | `compliance_rules` | `lib/db`, `lib/auth` | MEDIUM — rules are referenced in code comments throughout all HR logic; changes need legal review | OPTIONAL — load for compliance or UAE-law tasks |
| 21 | **Settings / Configuration** | System settings: appearance, custom fields, workflow templates, leave rules, notifications, permissions, delegations, branding, document branding, letter templates, form layout, work schedules, employee numbers, currency, policy | Verified Complete | `modules/config/actions.ts`, `guards.ts`, `services.ts`, `validations.ts`, `app/(hr-admin)/settings/` (16 sub-pages), `app/(hr-admin)/configuration/workflows/` (4 pages), `lib/config-resolver.ts` | `custom_fields`, `workflow_definitions`, `leave_rule_sets`, `notification_preferences`, `feature_permissions` | `lib/config-resolver`, `modules/compliance`, `modules/workflow`, `lib/audit` | MEDIUM — `config/guards.ts` must be called before every config write; `config-resolver.ts` is a central lookup | YES — load when working on any configuration or settings feature |

---

## Key Module Notes

**Workflow Engine (`lib/workflow-engine.ts`)** is the most collision-hardened file in the codebase. It received 5 transaction boundary fixes in Phase 3 (P2–P6E), an advisory lock for leave requests, and uniqueness constraints for hiring/transfer requests. Any future modification must be preceded by a full run of `tests/integration/workflow-collision.test.ts` (52 tests). The engine uses a `DbOrTx` parameter pattern to allow callers to thread outer transactions — this pattern must be preserved in all future handler additions.

**Migration Factory V2 (`modules/migration/`)** is the most complex recently-modified module. The false-success bug (2026-06-04) was rooted in silent `.catch()` blocks and missing zero-write detection. The `detectZeroWriteFailure()` helper was added to `v2-executor.ts` to ensure `ok=false` whenever expected writes returned 0. The module also includes a full source ingestion pipeline (Phases A-D: classify, transform, store, build package) that is separate from the core 9-step wizard. The DB currently holds a partial pilot state (21 employees, 0 manager links, 0 leave balances) that must be cleared with Step 2 before any reload.

**Payroll (`modules/payroll/`)** contains UAE-specific financial calculation logic (`calculateEosb`, `calculateGpssaContribution`, `determineSuspensionPayTreatment`) that directly implements UAE Labour Law. The `calculation-engine.ts` file runs salary element aggregation. The payroll run number uses `pg_advisory_xact_lock` to prevent concurrent duplicate run numbers (RISK-PAYROLL-2 fix). WPS export and GPSSA/DEWS integration completeness have not been independently verified this session — treat as Medium confidence until confirmed with actual payroll run end-to-end.

**ARIA (`modules/aria/`)** wraps the Anthropic Claude API. All four error types (RateLimitError, APIConnectionError, AuthenticationError, APIStatusError) are caught and return bilingual `AriaResponse` objects rather than crashing. The ARIA OS (`os-actions.ts`) provides HR admin AI console views including audit log entries, compliance data, and workflow pipeline — these are read-only aggregation queries. The `intents/` sub-directory resolves 4 org chart intents via natural language.


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/03-CURRENT-STATE.md
LINES: 215
================================================================================
# 03 — Current State
> Generated: 2026-06-04 | Source: live file inspection + CLAUDE.md session history
> Snapshot reflects the state of the codebase at the end of the 2026-06-04 session.

---

## Completed (with evidence)

### Phase 1 MVP — All 11 Sprints

| Feature / Module | Evidence |
|-----------------|---------|
| Employee master (create, edit, list, detail, bulk import) | `modules/core-hr/actions.ts`, `bulk-import/`, `app/(hr-admin)/persons/` (8 pages verified) |
| Contracts lifecycle (create, amend, terminate) | `modules/core-hr/contracts/`, barrel export confirmed |
| Worker assignments (effective-dated) | `modules/core-hr/worker-assignments/`, `work-schedule-assignment-actions.ts` |
| Bank details (IBAN encrypted) | `modules/core-hr/bank-details/`, `lib/encryption.ts` |
| Dependents (encrypted EID + passport) | `modules/core-hr/dependents/` |
| Documents management v2 (36-type taxonomy, secure API route) | `modules/core-hr/documents/actions.ts`, `app/api/documents/[id]/route.ts`, migrations 0050-0051 applied to Neon |
| Profile photo upload (Azure Blob, 7-day SAS TTL) | `modules/core-hr/photo-upload.ts`, migration 0052 applied |
| Emergency contact, home address, education upserts | `modules/core-hr/actions.ts` (upsert* functions), migration 0043 applied |
| Employment fields (worker category, employee code, probation months) | `modules/core-hr/validations.ts` WorkerCategory, migration 0044 applied |
| Leave / Absence management (requests, balances, rules, calendar, blackouts) | `modules/absence/actions.ts`, `services.ts`, 8 pages in `app/(hr-admin)/absence/` |
| Leave backdate policy (enterprise-hardened, bilingual errors, safe default) | `modules/absence/backdate-policy-actions.ts`, migrations 0047+0048 applied |
| Leave plan enrolment | `modules/absence/leave-plan-enrolment-actions.ts` |
| Medical certificate upload | `modules/absence/actions.ts` (uploadLeaveMedicalCert) |
| Workflow engine (atomic, collision-hardened, SLA, escalation, delegation) | `lib/workflow-engine.ts` — 5 Phase 3 fixes applied (P2–P6E) |
| Approval inbox (HR Admin + Manager) | `app/(hr-admin)/approvals/` (3 pages), `modules/workflow/queries.ts` |
| Notifications (Postgres outbox, topbar bell, email) | `modules/notification/` (6 files), `lib/jobs/process-driver.ts` |
| **Email Communication Platform (2026-06-06)** — admin-configurable Graph API / SMTP, provider abstraction, templates, delivery logs, leave approval email (reuses `workflow_email_tokens`), dispatcher cron, audit channel `EMAIL_GRAPH`/`EMAIL_SMTP` | `modules/communication/` (15 files), `app/(hr-admin)/settings/communication/`, `app/api/cron/email-dispatch/`, `drizzle/schema/communication.ts`, migration `0062_email_platform.sql` (**applied to DEV/UAT Neon — all 5 tables verified live 2026-06-12**), `docs/EMAIL-COMMUNICATION-PLATFORM.md`. Typecheck/build clean; 15 unit + 124 regression tests pass. **Live provider config + smoke test pending.** |
| Employee letters (PDF, DOMPurify XSS, status lifecycle, signing) | `modules/employee-letters/` (10 files), `app/(signing)/me/letters/sign/[letterId]/` |
| Medical insurance (plans, enrolment, lifecycle, contractor exception, age eligibility) | `modules/insurance/` (6 files), `app/(hr-admin)/persons/[id]/insurance/`, `app/(employee)/me/insurance/` |
| Timesheets (daily entry, overtime, team view, ESS view) | `modules/timesheets/` (5 files), 3 pages verified |
| Org chart (Tasks A-G: canvas, hiring/transfer/acting drawers, ARIA panel, analytics, export, event bus) | `lib/org-chart/` (4 files), `components/org-chart/`, `modules/core-hr/org-chart-actions.ts` |
| ARIA AI assistant (Claude API, employee + manager context, streaming, ARIA OS) | `modules/aria/` (12 files), `app/api/aria/chat/`, 2 ARIA pages |
| Payroll (runs, salary elements, WPS, EOSB, GPSSA, DEWS, definitions, reports) | `modules/payroll/` (9 files), `app/(hr-admin)/payroll/` (7 pages) |
| Reports / Dashboards (5 role views, insurance report, Promise.all optimised) | `modules/reports/queries.ts`, 2 report pages |
| Master data (12 sub-areas: legal entities, departments + Head + Work Schedule, positions, grades, locations, business units, jobs, projects, work schedules, leave types, holiday calendars, custom fields) | `app/(hr-admin)/master-data/` (12 pages) |
| RBAC (dual-layer: requireRole + feature_permissions table, MFA step-up for HIGH_PRIVILEGE_ROLES) | `lib/auth.ts`, `middleware.ts`, `modules/access/actions.ts`, `app/(hr-admin)/access/feature-permissions/` |
| Settings / Configuration (16 settings pages, 4 workflow config pages) | `app/(hr-admin)/settings/` (16 pages), `app/(hr-admin)/configuration/workflows/` (4 pages) |
| DataOps console (SUPER_ADMIN SQL + NL2SQL) | `app/(hr-admin)/admin/dataops/`, `app/api/dataops/` |
| ESS self-service (profile, leave, payslips, documents, letters, insurance, timesheet, ARIA, directory, bank details, accommodations, requests) | `app/(employee)/me/` (17 pages) |
| Observability (structured logging, PII redaction, telemetry, x-request-id, health endpoints, alerting strategy) | `lib/logger.ts`, `lib/telemetry.ts`, `middleware.ts`, `app/api/health/route.ts`, `app/api/health/db/route.ts` |
| Cloud-portable storage abstraction (Azure/S3/local providers) | `lib/storage/providers/`, `lib/storage/factory.ts` |
| WCAG 2.1 AA color contrast (3 token fixes, 0 violations) | `app/globals.css` tokens `--ink-3`, `--org-under-supervised`, `--rail-fg-mute` |
| Cross-browser certification (Chrome, Firefox, WebKit, Edge, tablet, mobile — 245/245) | `playwright.config.ts` (11 projects), `tests/e2e/cross-browser.spec.ts` |
| RTL / Arabic visual certification (45/45) | `tests/e2e/rtl-certification.spec.ts`, Noto Sans Arabic font |
| MFA step-up enforcement (SEC-04, 180/180 security tests) | `lib/auth.ts` HIGH_PRIVILEGE_ROLES gate |
| All workflow collision gaps resolved (P2–P6E, 52/52 collision tests) | `lib/workflow-engine.ts`, `modules/absence/actions.ts`, `modules/core-hr/probation/workflow-actions.ts` |
| 60-minute authenticated soak test (9 thresholds PASS) | `tests/performance/`, GitHub Actions `.github/workflows/soak-test.yml` |
| Enterprise governance sign-off | `tests/qa-enterprise-release-signoff.md`, all QA artefacts |

**Build status:** 0 TypeScript errors. 121 pages compiled. `pnpm build` passes.

---

## Partially Complete (what is done vs what is missing)

### Migration Factory V2

**Done:**
- 9-step wizard UI fully built (`app/(hr-admin)/admin/migration/MigrationConsoleV2.tsx`)
- V2 executor, validator, parser, dry-run, actions, types — all files present and functional
- False-success bug root cause identified and fixed (2026-06-04): `detectZeroWriteFailure()` helper added, all `.catch()` swallows replaced with explicit `try/catch`, `ok=false` propagates correctly
- 10 regression tests V2EX-001–010 added and passing
- Source ingestion pipeline (Phases A-D): `source-classifier.ts`, `source-transformer.ts`, `package-store.ts`, `source-actions.ts` — fully implemented
- UI shows `'failed'` status (red block) and disables Continue when `ok=false`

**Missing / Not yet done:**
- Pilot workbook has NOT been reloaded since the false-success fix
- Current Neon DB state: **21 employees, 0 manager links (lineManagerId=null for all), 0 absence_balances rows, 0 V2 dept heads**
- Step 2 Clear has NOT been run — mandatory before reload
- Full pilot reload sequence (Step 2 → Step 3 → Steps 4-9 with `pilot-v2-migration-package.xlsx`) is pending
- Until reload completes: Org Chart, My Team, Leave Requests, Manager Approvals are NOT READY for the pilot employees

### Document Storage (Production)

**Done:**
- Local/tmp provider works in dev and Vercel UAT (files stored in `/tmp/avaniis-uploads/`)
- Azure Blob and AWS S3 provider code is written (`lib/storage/providers/azure.ts`, `aws.ts`)
- Production factory guard throws clear error when `NODE_ENV=production` + no provider set
- UAT flow accepted (21/26 Playwright tests, 5 env-only skips, 0 hard failures)
- Migration 0051 applied (expanded `person_documents_type_check` from 8 to 36 types)

**Missing / Not yet done (5 production blockers):**
1. `DOCUMENT_STORAGE_PROVIDER=azure` (or `aws`) not set in Vercel environment
2. `AZURE_STORAGE_CONNECTION_STRING` not configured — files go to `/tmp` (ephemeral)
3. File persistence after Vercel container recycle not proven
4. Signed URL preview/download via cloud storage not end-to-end tested
5. HA-017/018/019/022 Playwright tests still skip (no HR Admin person seed data in test environment)

### Payroll

**Done:**
- Schema: `payroll_runs`, `payroll_lines`, `salary_elements`, `payroll_definitions`, `payroll_assignments`
- Services: `calculateEosb`, `calculateGpssaContribution`, `determineSuspensionPayTreatment` (`modules/payroll/services.ts`)
- Calculation engine: `modules/payroll/calculation-engine.ts`
- 7 pages: dashboard, runs (list/new/detail), salary elements, WPS, definitions, reports
- Advisory lock on run number (RISK-PAYROLL-2 fixed via `pg_advisory_xact_lock`)
- Payroll assignment history (`payroll-assignment-actions.ts`)

**Needs verification (not confirmed this session):**
- UAE WPS file generation (actual file format compliance)
- GPSSA / DEWS contribution deduction mechanics in live runs
- End-to-end payroll run (create → calculate → approve → WPS export) not smoke-tested against pilot employees
- Payslip ESS view (`app/(employee)/me/payslips/`) exists but no payroll data in DB to display

---

## Known Issues (Open Bugs)

| ID | Issue | Severity | Location | Status |
|----|-------|---------|---------|--------|
| DB-STATE-001 | 21 pilot employees have `lineManagerId=NULL` — Org Chart, My Team, Manager Approvals all non-functional | CRITICAL | Neon prod DB | Pending: run Step 2 Clear → reload V2 |
| DB-STATE-002 | `absence_balances` table empty (0 rows for 21 pilot employees) — Leave Requests fail-closed | CRITICAL | Neon prod DB | Pending: V2 reload |
| DB-STATE-003 | V1 dept head backfill set via `MIGRATION.DEPT_HEADS_BACKFILLED` (V1), not V2 — will be cleared by Step 2 | MEDIUM | Neon prod DB | Will be resolved by Step 2 Clear |
| DMG-PROD-1 | Document storage: no cloud provider configured — files stored in `/tmp` on Vercel (ephemeral) | HIGH | Vercel env | Blocked: Azure credentials needed |
| DMG-PROD-2 | Document file persistence after Vercel container recycle not proven | HIGH | Vercel runtime | Blocked by DMG-PROD-1 |
| DMG-PROD-3 | Signed URL preview/download via cloud storage not end-to-end tested | HIGH | `lib/storage/factory.ts` | Blocked by DMG-PROD-1 |
| DMG-PROD-4 | HA-017/018/019/022 Playwright tests skip — no HR Admin person seed data in Neon test entity | MEDIUM | `tests/e2e/documents-uat.spec.ts` | Needs test data seed |
| MFA-TOTP | App-level TOTP enrollment UI not built (QR code, recovery codes) | LOW | Phase 3 stretch goal | Deferred; Entra ID CA is production MFA |

---

## Known Technical Debt

| Item | Location | Impact | Priority |
|------|---------|--------|---------|
| `TEST_TRACEABILITY_MATRIX.md` — 85 tests show ✅ after governance fix, but matrix was auto-generated and links may drift | `tests/e2e/TEST_TRACEABILITY_MATRIX.md` | Documentation only — tests all pass | Low |
| V1 `MigrationConsoleClient.tsx` retained in codebase (not deleted) — retained as rollback shim | `app/(hr-admin)/admin/migration/` | Minimal — page.tsx routes to V2; V1 never rendered | Low |
| Dev credential accounts (`super.admin@avaniis.dev`, etc.) active in Neon production DB (behind `NODE_ENV=development` guard) | `lib/auth.ts` dev provider | Security: must be removed before final production handover | Medium |
| WIP migration files (0055-0061) exist in `drizzle/migrations/` but are NOT applied to Neon | `drizzle/migrations/` | Risk: `pnpm drizzle-kit migrate` on a fresh DB would not apply them; they may add columns expected by newer code | Medium |
| `drizzle/meta/_journal.json` tracks only 0000–0039 — migrations 0040–0054 are manual SQL not tracked by drizzle-kit | `drizzle/migrations/` | New developers must be warned; `drizzle-kit migrate` gives false sense of completeness | High (documentation) |
| `app/(hr-admin)/admin-preview/page.tsx` — purpose unclear; listed in pages but not in primary nav | `app/(hr-admin)/admin-preview/` | Unknown — needs investigation | Low |
| Insurance module: Phase 3 insurer API integration (bulk import, insurer connectivity) not built | `modules/insurance/` | Feature gap; current module is lifecycle management only | Low (Phase 3 backlog) |

---

## Known Risks

| Risk ID | Description | Likelihood | Impact | Mitigation |
|---------|------------|-----------|--------|-----------|
| RISK-DB-JOURNAL | Drizzle journal gap (0040+ manual SQL). `drizzle-kit migrate` on fresh DB applies 0000–0039 only. Migrations 0040–0054 must be applied manually via Neon SQL Editor. | High (will happen for every new environment) | High (missing columns/tables crash the app) | Documented in CLAUDE.md Neon Deployment Notes; `_PRODUCTION_SCHEMA_BUNDLE.sql` exists as a reference |
| RISK-DOC-STORAGE | `DOCUMENT_STORAGE_PROVIDER` not set in Vercel production — factory will throw at runtime | High (confirmed by UAT) | High (document upload/download fails entirely in production) | Must set env var before real-user production launch |
| RISK-TMP-EPHEMERAL | Files in `/tmp/avaniis-uploads/` on Vercel are lost on container recycle or redeployment | High (Vercel serverless guarantee) | Medium (DB rows persist, files lost — broken download links) | Configure Azure/S3 storage |
| RISK-PILOT-DB | 21 pilot employees have partial data (no manager links, no leave balances). Org Chart and Leave are not functional. | Confirmed (current state) | High (UAT blockers) | Run V2 reload sequence: Step 2 → 3 → 4-9 |
| RISK-WIP-MIGRATIONS | WIP migrations (0055-0061) exist but are not applied. Some may add columns that newer code expects. | Unknown | Medium-High (silent schema mismatch) | Audit each WIP migration before applying; check if code references new columns |
| RISK-PAYROLL-VERIFY | Payroll WPS file format compliance and GPSSA/DEWS deduction mechanics not independently verified this session | Unknown | High (UAE regulatory risk if wrong) | End-to-end payroll run smoke test against pilot employees after V2 reload |

---

## Open Decisions

| Decision | Context | Options | Recommendation |
|---------|---------|---------|---------------|
| When to run Migration V2 pilot reload | DB has 21 employees with no manager links or leave balances; executor fix is complete (2026-06-04) | Run immediately OR wait for next session | Run immediately: Step 2 Clear → Step 3 Seed → Steps 4-9 with `pilot-v2-migration-package.xlsx`; verify all phase counts before proceeding to Step 8 |
| Production blob storage provider | `DMG-PROD-1`; both Azure and AWS providers are implemented | Azure Blob (already referenced in deployment guide) vs AWS S3 | Azure, since Entra ID is already Azure infrastructure; `docs/deployment-azure.md` exists |
| MFA TOTP enrollment UI | App-level TOTP (QR code, recovery codes) not built; Entra ID CA handles production MFA | Build in Phase 3 vs defer indefinitely | Defer; Entra ID Conditional Access is the production control; app-level TOTP is redundant risk |
| WIP migrations (0055-0061) — apply or abandon | Files exist but are not applied or documented in journal | Apply to Neon + journal, or delete unused WIP files | Audit each file; apply only if code references new columns; delete if orphaned |
| `admin-preview` page purpose | Page exists at `app/(hr-admin)/admin-preview/page.tsx` but is not in primary nav | Keep as dev tool / remove | Investigate and document or remove before production |

---

## Areas Requiring Architectural Review

### WIP Migrations (0055-0061)
The following migration files exist in `drizzle/migrations/` but have NOT been applied to Neon and are NOT tracked in `drizzle/meta/_journal.json`:

| File | Description (from filename) | Risk |
|------|---------------------------|------|
| `0055_payroll_run_number_per_entity.sql` | Payroll run number scoping per entity | May conflict with advisory lock fix already in `modules/payroll/actions.ts` |
| `0055_wip_step_instance_columns.sql` | Workflow step instance new columns | May add columns expected by newer workflow engine code |
| `0056_wip_notification_queue_meta.sql` | Notification queue metadata | May add columns to `notification_log` table |
| `0057_wip_audit_immutability.sql` | Audit log immutability enforcement | If applied, may add DB-level triggers that conflict with `lib/audit.ts` patterns |
| `0060_wip_intelligence_view.sql` | Intelligence/analytics view | Likely safe (view only) but needs verification |
| `0061_absence_type_requires_balance.sql` | Absence type balance requirement flag | Could affect existing absence type data and leave request flow |

**Action required:** Each WIP migration must be reviewed before applying. Applying in wrong order or without testing could corrupt production data.

### Payroll Completeness Verification
The payroll module has schema, services, and UI for 7 pages. However:
- No end-to-end payroll run has been smoke-tested against the 21 pilot employees
- WPS file format compliance (UAE SIF format) is unverified
- GPSSA/DEWS contribution deduction (UAE national employee-specific) needs verification against actual employee data
- Payslip display (`app/(employee)/me/payslips/`) requires payroll data to exist in DB

Recommendation: after completing the V2 migration reload, run a test payroll for the pilot employees and verify WPS export.

---

## Update 2026-06-12 — Effective-Dating Remediation Phases 1, 2A–2D COMPLETE

The effective-dating remediation flagged by audit doc 19 (45/100) was developed on the historical branch `feat/effective-dating-phase-1` (11 commits, `a34b3bd` → `398ae2e`) and is now part of the **certified baseline `main @ f5246642c8eee54d35d3cb09ba4e6f3e5abf8c0a`** (merged 2026-06-12). Independent revalidation score: **72/100**.

**Done:** DB integrity constraints (migrations 0063/0064 — sentinel, date-order CHECKs, overlap EXCLUDE-gist, one-current partial-UNIQUE, as-of indexes); nightly future-dated activation cron; shared as-of query engine (`lib/as-of-query.ts`) wired across assignments, manager routing, leave enrolments, pending changes, MDM history labels; FUTURE_DATED mode + cancellation repair; retro split (periods split, never overwritten) incl. future-bounded variant — **certified PASS 11/11** (`docs/effective-dating/ed-2d-3-future-bounded-retro-split.md`); Employee History report. 83/83 ED unit tests green.

**Still open (pending PO decisions Q20.2/Q20.3/Q20.5):** retro payroll/arrears, mid-period proration, as-of EOSB, date-tracked absence balances, as-of org chart, as-of UI date picker.

**Deployment:** 0062/0063/0064 are **applied to the DEV/UAT Neon DB** (verified live 2026-06-12 — `docs/effective-dating/01-ED-CLOSURE-VERIFICATION-2026-06-12.md`); test ledger: 0063/0064 `verified`, 0062 `applied`. The future isolated **Production Environment** (see Definitions in `docs/environment/environment-governance.md`) is not yet active; its ledger correctly lists all three as `pending`.

**Docs:** `docs/effective-dating/00-EFFECTIVE-DATING-IMPLEMENTATION.md` (design+evidence), `RUNBOOK-future-dated-activation.md`, audit doc 19 §9 closure record, `docs/qa-qc/revalidation-2026-06-12.md`, root `CHANGELOG.md`.

---

## Areas That Must Not Be Modified Casually

| File / Area | Why Protected | Required Before Modifying |
|------------|-------------|--------------------------|
| `lib/workflow-engine.ts` | Collision-hardened (5 Phase 3 fixes, P2-P6E); atomic transaction boundaries are critical | Full run of `tests/integration/workflow-collision.test.ts` (52 tests) |
| `lib/auth.ts` | MFA step-up enforcement (`=== false` strict equality guard); HIGH_PRIVILEGE_ROLES list | Run full security suite: `pnpm vitest run tests/security` (180 tests) |
| `modules/absence/actions.ts` | Advisory lock (`pg_advisory_xact_lock`), backdate policy hardening (BDP-009, no fallback to caller entity), leave overlap check ordering | Run: `pnpm vitest run tests/integration/absence-actions.test.ts` and backdate policy tests |
| `modules/core-hr/probation/workflow-actions.ts` | `applyProbationOutcome` uses `tx?: DbOrTx` pattern (COLLISION-PROBATION fix); 4 outcome branches all use `runBranch(client)` closure | Run PROB-001–007 regression tests |
| `drizzle/schema/foundation.ts` | 109 `pgTable` definitions; any accidental rename breaks queries across all 11 schema files and all modules | `pnpm typecheck` + `pnpm build` required |
| Any migration file in `drizzle/migrations/` that is applied to Neon | Applied migrations are immutable — never edit, only add new migration files | N/A — never edit applied migrations |
| `lib/encryption.ts` | AES-256-GCM encryption for PII fields (emirates_id, passport, iban); key rotation is destructive | Consult FIELD_ENCRYPTION_KEY rotation procedure |
| `app/globals.css` (token values) | WCAG 2.1 AA certified; 3 tokens have minimum contrast ratios; any darkening could re-introduce violations | Run axe-core contrast audit after any token change |


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/04-DATABASE-MODEL.md
LINES: 236
================================================================================
# 04 — DATABASE MODEL

> Last updated: 2026-06-04
> Source: drizzle/schema/* (109 pgTable definitions across 11 schema files)

---

## Overview

- **109 pgTable definitions** across 11 schema files
- **PostgreSQL 16** (Neon eu-central-1, co-located with Vercel fra1)
- **Single tenant** (tenant_id DEFAULT '00000000-0000-0000-0000-000000000001')
- **Drizzle ORM 0.45.2** + drizzle-kit 0.31.10
- **Every table** carries: `tenant_id` (BR-TENANT-001) + 7 audit columns (BR-AUDIT-001)
- **Records are NEVER hard-deleted** — effective dates + `is_active` flags (BR-NO-DELETE)
- **PII fields** (emirates_id, passport_number, iban) are AES-256-GCM encrypted before persist

---

## Schema Files

| File | Purpose | Key Tables |
|---|---|---|
| `drizzle/schema/foundation.ts` | Core HR entities — the largest file (~91KB). Persons, org structure, leave, payroll, audit. | lookupValues, legalEntities, grades, payrollDefinitions, persons, businessUnits, departments, locations, jobs, positions, personContacts, personAddresses, personDocuments, personBankDetails, personDependents, personEmergencyContacts, personEducation, personProfessionalCerts, contracts, workerAssignments, employmentActions, absencePlans, absenceTypes, absenceEntries, absenceBalances, accommodationRequests, leavePlanEnrolments, workScheduleAssignments, payrollAssignments, gradeHistory, departmentHistory, locationHistory, jobHistory, positionHistory, projects, salaryElements, payrollRuns, payrollResults, eosbCalculations, auditLog |
| `drizzle/schema/configuration.ts` | HR Admin-configurable tables (~46KB). Workflows, schedules, leave rules, insurance plans, permissions. | customFieldDefinitions, workflowDefinitions, workflowStages, workflowRoutingRules, workSchedules, workSchedulePatterns, publicHolidays, leaveRuleSets, leaveRuleLines, notificationTemplates, policySettings, complianceRules, gradeSalaryRanges, medicalInsurancePlans, documentTypeConfigs, formConfigurations, pagePersonalization, featurePermissions, companyCurrencySettings, ariaAgentConfig, ariaModelConfig, ariaBehaviourConfig, ariaKnowledgeSources, leaveBackdatePolicies |
| `drizzle/schema/transactions.ts` | Operational runtime tables — created/updated at runtime (not config time). | workflowInstances, approvalDelegations, notificationLog, onboardingChecklists, onboardingChecklistItems, blackoutPeriods, wpsSifRecords, glJournalLines, userAccounts, refreshTokens, ssoProviderConfig, medicalInsuranceEnrolments, medicalInsurancePolicySettings, dewsContributions, gpssaContributions, timesheetPeriods, timesheetEntries, vssContributions, events |
| `drizzle/schema/workflow-engine.ts` | Workflow Engine v2 — hybrid hierarchy (LINE_MANAGER/POSITION/CUSTOM_GROUP) + AND/OR condition trees, SLA, immutable audit. | workflowRules, workflowDefinitionsV2, approvalGroups, approvalGroupMembers, workflowStepsV2, workflowSlaCalendars, workflowInstancesV2, workflowStepInstances, workflowAuditLog, workflowEmailTokens, workflowDelegationRules, workflowNotificationQueue |
| `drizzle/schema/employee-letters.ts` | PDF letter generation lifecycle. | letterFieldRegistry, letterTemplateTypes, letterTemplates, employeeLetters, letterEmailJobs |
| `drizzle/schema/probation.ts` | Probation review workflow. | probationReviews |
| `drizzle/schema/timesheets.ts` | Attendance device sync and exceptions. | attendanceRecords, attendanceExceptions, deviceSyncLog, devicePunchRaw |
| `drizzle/schema/actions.ts` | HR action requests requiring approval (org chart actions). | hiringRequests, transferRequests |
| `drizzle/schema/org-cache.ts` | Materialized org hierarchy snapshot (performance cache). | orgHierarchySnapshots |
| `drizzle/schema/document-files.ts` | Document file metadata (storage-provider-agnostic). | documentFiles |

> Note: foundation.ts and configuration.ts together account for ~60+ tables and ~137KB of schema definition. Never load both in the same session unless doing cross-schema work.

---

## Core HR Tables

### persons (V005 — Master person record)

The most important table. Every employee lifecycle event eventually traces back here.

| Column Group | Key Columns | Notes |
|---|---|---|
| Identity | personNumber (AVN-000123), firstNameEn, lastNameEn, fullNameEn, fullNameAr, dateOfBirth, gender, maritalStatus | personNumber is unique auto-generated. fullNameEn computed by application. |
| Nationality | nationalityCode, nationalityCategory (UAE_NATIONAL/GCC_NATIONAL/EXPAT), bloodType | bloodType is PDPL-sensitive, gate behind sensitiveDataConsent |
| PII (encrypted) | emiratesId (AES-256-GCM), passportNumber (AES-256-GCM) | Never store plaintext. lib/encryption.ts. |
| Residency | visaNumber, visaType, visaExpiry, labourCardNumber, labourCardExpiry | UAE-specific compliance fields |
| Employment | employmentType (FULL_TIME/PART_TIME/TEMPORARY/TASK_BASED/FLEXIBLE/REMOTE/SHARED), assignmentStatus (ACTIVE/ON_LEAVE/SUSPENDED/TERMINATED/RETIRED/DECEASED/PENDING_HIRE), hireDate, probationEndDate, probationStatus (ACTIVE/CONFIRMED/EXTENDED/FAILED), noticePeriodDays | `isActive` is NOT cleared on termination — only `assignmentStatus` changes |
| Worker Classification | workerCategory (FTE/CONTINGENT/CONTRACTOR), employeeCode | Separate axis from employmentType |
| Current Assignment | currentPositionId, currentJobId, currentDepartmentId, currentGradeId, lineManagerId (self-ref), dottedLineManagerId (self-ref) | Forward refs — FK enforced at DB level, not Drizzle level |
| Payroll | payrollId, basicSalary, totalPackage, payFrequency | Denormalized for fast access; source of truth is salary_elements |
| Insurance | insurancePlanId, insuranceStatus (ENROLLED/PENDING_ENROLMENT/RENEWAL_DUE/EXPIRED/CANCELLED/NOT_ENROLLED), annualPremiumAed | |
| PDPL Consent | pdplConsentGiven, pdplConsentDate, sensitiveDataConsent | UAE Personal Data Protection Law 2021 |
| System | isActive, userAccountId, profilePhotoUrl (Azure Blob SAS URL), profilePhotoData (base64 fallback), extraData (JSONB custom fields) | `isActive` defaults true; not cleared on termination |

**Critical warning:** `isActive` on persons is NOT a termination flag. Gate termination checks on `assignmentStatus = 'ACTIVE'` not `isActive = true`.

### positions (V009-adjacent)

| Column | Notes |
|---|---|
| reportsToPositionId | Self-referential — drives org chart hierarchy |
| isVacant | True when no active worker_assignment points here |
| isConfidential | Hides position from non-HR in org chart |
| isFrozen | Budget frozen — hiring blocked |
| isActing | Current occupant is in acting capacity |
| vacancyStartDate | When the position became vacant |

### worker_assignments (V019 — Links person ↔ position)

| Column | Notes |
|---|---|
| personId | FK to persons |
| positionId | FK to positions |
| isCurrent | Boolean — only one row per person can be true at a time |
| assignmentStatus | ACTIVE/ON_LEAVE/SUSPENDED/TERMINATED/etc. |
| workScheduleId | Denormalized from work_schedule_assignments for timesheet resolver |
| isActing | Acting assignment flag |
| actingEndDate | When the acting period ends |
| actionInitiatedBy | FK to persons — who triggered this assignment |

### departments (V007)

| Column | Notes |
|---|---|
| headPersonId | Department head person (pre-existed in schema, wired in Sprint 11) |
| parentDepartmentId | Self-referential for nested departments |
| workScheduleId | Department-level schedule tier (migration 0054; bare uuid, FK in SQL only) |
| businessUnitId | FK to business_units |
| legalEntityId | Entity scoping |
| approvedHeadcount | Budget headcount |

### legal_entities (V002)

| Column | Notes |
|---|---|
| entityType | MAINLAND / DIFC / ADGM / FREEZONE — drives EOSB/DEWS routing |
| eosbScheme | TRADITIONAL / VSS / DEWS — BR-EOSB-001 |
| empNumberPrefix, empNumberDigits, empNumberSeed | Employee number config (Settings → Employee Numbers) |
| Primary/secondary logo URLs, signatory fields | Document branding (Settings → Document Branding) |

### absence_balances

| Column | Notes |
|---|---|
| personId | FK to persons |
| absenceTypeId | FK to absenceTypes |
| balanceYear | The leave year this balance applies to |
| openingBalanceDays | Starting balance in days |
| isCurrent | Effective-date pattern column |
| effectiveSequence | Row version sequence |
| actionMode | UPDATE/CORRECT — correction mode infrastructure |

**Note:** `absence_balances` does NOT have `is_current`/`effective_sequence` on the same effective-date pattern as some other tables — confirm column names from schema before writing INSERT.

### leave_requests / absenceEntries

Stored as `absence_entries` in the schema (not `leave_requests`). Linked to `workflow_instances` via `resourceType = 'absence_entry'` and `resourceId`.

---

## Status Fields & Enums

| Entity | Status Values |
|---|---|
| persons.assignmentStatus | ACTIVE, ON_LEAVE, SUSPENDED, TERMINATED, RETIRED, DECEASED, PENDING_HIRE |
| persons.probationStatus | ACTIVE, CONFIRMED, EXTENDED, FAILED |
| persons.visaStatus | VALID, EXPIRING, EXPIRED, CANCELLED |
| persons.insuranceStatus | ENROLLED, PENDING_ENROLMENT, RENEWAL_DUE, EXPIRED, CANCELLED, NOT_ENROLLED |
| persons.employmentType | FULL_TIME, PART_TIME, TEMPORARY, TASK_BASED, FLEXIBLE, REMOTE, SHARED |
| persons.workerCategory | FTE, CONTINGENT, CONTRACTOR |
| legalEntities.entityType | MAINLAND, DIFC, ADGM, FREEZONE |
| legalEntities.eosbScheme | TRADITIONAL, VSS, DEWS |
| workflow_instances.status | PENDING, IN_PROGRESS, APPROVED, REJECTED, CANCELLED, ESCALATED |
| workflowInstancesV2 status | PENDING, IN_PROGRESS, APPROVED, REJECTED, CANCELLED, ESCALATED, ON_HOLD, RECALLED |
| workflowStepInstances status | WAITING, PENDING, APPROVED, REJECTED, DELEGATED, ESCALATED, SKIPPED, RECALLED, AUTO_APPROVED |
| hiringRequests.status | PENDING_APPROVAL, APPROVED, REJECTED, FULFILLED, CANCELLED |
| transferRequests.status | PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED |
| absenceEntries.status | DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED |
| employee_letters.status | DRAFT, SUBMITTED, PENDING_APPROVAL, APPROVED, SENT, PENDING_SIGNATURE, SIGNED, FAILED, REJECTED |
| notificationLog.status | PENDING, SENT, FAILED |

### Workflow Engine Enums (workflow-engine.ts)

| Enum | Values |
|---|---|
| hierarchyTypeEnum | LINE_MANAGER, POSITION, CUSTOM_GROUP |
| stepEffectEnum | NORMAL, ADD_IF_MATCHES, REPLACE, SKIP_PREVIOUS, INJECT_BEFORE, INJECT_AFTER, PARALLEL_ADD |
| slaBreachActionEnum | ESCALATE, AUTO_APPROVE, AUTO_REJECT, SEND_REMINDER, BLOCK_FREEZE |
| approverNotFoundActionEnum | ESCALATE_UP, USE_FALLBACK, ASSIGN_HR_ADMIN, BLOCK_WITH_ERROR |
| groupMemberTypeEnum | STATIC, DYNAMIC, HYBRID |
| groupVotingMethodEnum | ANY_ONE, MAJORITY, ALL, WEIGHTED |

---

## Migration State

### Journal Coverage

Drizzle journal (`drizzle/meta/_journal.json`) covers **0000–0039 only**. Running `pnpm drizzle-kit migrate` on a fresh DB applies 0000–0039 but **NOT 0040+**. The next additive migration slot is **0055** (but 0055 already has two WIP files — use 0062 or higher for new migrations to avoid collision).

### Applied to Neon (0040–0054) — ALL APPLIED via Neon SQL Editor

| Migration | What It Does | Applied? |
|---|---|---|
| 0040_aria_branding_config.sql | ARIA + document branding config tables | ✅ |
| 0041_hiring_request_uniqueness.sql | `uq_hiring_request_pending` partial unique index (COLLISION-004 fix) | ✅ |
| 0042_transfer_request_uniqueness.sql | `uq_transfer_request_pending` partial unique index (COLLISION-004B fix) | ✅ |
| 0043_personal_profile_fields.sql | Blood type + emergency contacts + home address fields | ✅ |
| 0044_employment_fields.sql | worker_category, employee_code, probation_months_granted columns | ✅ |
| 0045_persons_is_active_backfill.sql | Backfill is_active on persons | ✅ |
| 0046_person_documents_scope.sql | Document scope/visibility columns | ✅ |
| 0047_leave_backdate_policy.sql | Creates `leave_backdate_policies` table | ✅ Applied 2026-05-26 |
| 0048_backdate_policy_comment_fix.sql | Corrects DB comments: "No row = BLOCKED by default" | ✅ Applied 2026-05-26 |
| 0049_letter_types_ess_expansion.sql | ESS letter types expansion | ✅ |
| 0050_document_management_v2.sql | Document Management v2: 7 new columns, backfill, indexes | ✅ |
| 0051_document_type_check_expansion.sql | Expands `person_documents_type_check` from 8 to 36 types | ✅ Applied 2026-05-28 |
| 0052_document_file_data.sql | Document file data table | ✅ |
| 0052_person_profile_photo_data.sql | Person profile photo data (base64 column) | ✅ |
| 0053_letter_pdf_data_failure_reason.sql | Letter PDF data + failure reason column | ✅ |
| 0054_department_work_schedule.sql | `departments.work_schedule_id` + FK + partial index | ✅ Applied 2026-05-31 |

### WIP Migrations — NOT Applied

| Migration | Status | Notes |
|---|---|---|
| 0055_payroll_run_number_per_entity.sql | WIP — not applied | Payroll run number scoping |
| 0055_wip_step_instance_columns.sql | WIP — not applied | Conflicts with 0055 payroll file |
| 0056_wip_notification_queue_meta.sql | WIP — not applied | Notification queue metadata |
| 0057_wip_audit_immutability.sql | WIP — not applied | Audit log immutability enforcement |
| 0060_wip_intelligence_view.sql | WIP — not applied | Intelligence/analytics view |
| 0061_absence_type_requires_balance.sql | WIP — not applied | Absence type balance requirement |

Also present: `_PRODUCTION_SCHEMA_BUNDLE.sql` — full schema bundle for production deployment.

---

## Risky Schema Areas

| Risk | Detail |
|---|---|
| PII Encryption | `emirates_id`, `passport_number`, `iban` stored as AES-256-GCM ciphertext. `lib/encryption.ts` handles encrypt/decrypt. Never store or compare plaintext. |
| Effective-date pattern | Never DELETE records. Use close + open (set `is_current=false` on old row, insert new with `is_current=true`). Drizzle has no automatic guard — discipline required. |
| tenant_id on every insert | Every `db.insert()` must include `tenantId: TENANT_ID`. The column default only fires when the column is omitted entirely; explicit `undefined` bypasses it. |
| foundation.ts size | 91KB — the largest file in the codebase. Load only the sections you need via targeted reads with offset/limit. |
| configuration.ts size | ~46KB. Contains 25 pgTable definitions. Load selectively. |
| persons.isActive vs assignmentStatus | `isActive` is NOT cleared on termination. Always gate termination checks on `assignmentStatus = 'ACTIVE'`, not `isActive = true`. |
| Cross-entity data leakage | HR_ADMIN is entity-scoped. Always include `legalEntityId` in WHERE clauses for HR_ADMIN queries. SUPER_ADMIN bypasses this. |
| Forward references in persons | `currentPositionId`, `currentJobId`, `currentDepartmentId` are bare UUIDs in Drizzle (no `.references()`). FK enforced at DB level only. |
| Circular imports | foundation.ts imports nothing from schema. configuration.ts imports from foundation. transactions.ts imports from foundation + configuration. Never reverse this chain. |
| Migration journal gap | Journal covers 0000–0039. New migrations (0055+) must be applied manually via Neon SQL Editor — `pnpm drizzle-kit migrate` will NOT apply them. |

---

## Payroll Schema Dependencies

The payroll subsystem spans multiple tables across foundation.ts:

| Table | Role |
|---|---|
| `payrollDefinitions` | Payroll groups (monthly, biweekly, etc.) — referenced by `persons.payrollId` |
| `payrollRuns` | Individual payroll run instances per entity per period |
| `payrollResults` | Per-employee per-run computed amounts |
| `salaryElements` | Component breakdown (basic, housing, transport, etc.) |
| `payrollAssignments` | Employee → payroll group assignment history |
| `eosbCalculations` | EOSB gratuity calculations (UAE Labour Law) |
| `wpsSifRecords` | WPS Salary Information File records (MOHRE compliance) |
| `dewsContributions` (transactions.ts) | DEWS scheme contributions (DIFC/ADGM) |
| `gpssaContributions` (transactions.ts) | GPSSA scheme contributions (UAE Nationals) |
| `vssContributions` (transactions.ts) | VSS scheme contributions |
| `glJournalLines` (transactions.ts) | GL journal lines for payroll accounting |

**Payroll run number concurrency:** `nextRunNumber` must be called inside a `db.transaction` with `pg_advisory_xact_lock(hashtext('payroll_run:' || entityId))` to prevent duplicate run numbers under concurrent requests (RISK-PAYROLL-2 fix — `modules/payroll/actions.ts`).


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/05-RBAC-SECURITY.md
LINES: 219
================================================================================
# 05 — RBAC & SECURITY

> Last updated: 2026-06-04
> Sources: lib/auth.ts, modules/auth/index.ts, drizzle/schema/configuration.ts (featurePermissions)

---

## Roles (7 total)

| Role | Access Scope | Key Permissions | Notes |
|---|---|---|---|
| EMPLOYEE | Own records only (ESS) | View/edit own profile, submit leave, view payslips, view own letters, read-only insurance | Routes to /me/* only. Cannot cross-read other employees. getMyProfile enforces ownership guard. |
| MANAGER | Own team + approval inbox | View direct reports, approve/reject leave and actions for team, view team timesheets | Routes to admin-nav.ts sidebar. No access to payroll or global HR admin. |
| PAYROLL_ADMIN | Payroll module only | Create/run payrolls, generate WPS SIF, view salary elements, EOSB calculations | Does NOT require MFA step-up. Entity-scoped. |
| FINANCE | Finance reports only | View GL journals, financial exports, payroll cost reports | Does NOT require MFA step-up. Read-mostly. |
| HR_ADMIN | Full HR admin (entity-scoped) | Create/edit employees, manage leave, run workflows, approve documents, access all HR modules | **Requires MFA** (HIGH_PRIVILEGE_ROLES). Scoped to `session.user.legalEntityId`. Cannot cross-entity without SUPER_ADMIN. |
| HR_DIRECTOR | Full HR admin (cross-entity) | Same as HR_ADMIN but can view across multiple entities | **Requires MFA** (HIGH_PRIVILEGE_ROLES). |
| SUPER_ADMIN | Everything + DataOps + Migration | All HR_DIRECTOR permissions + user management, DataOps console (/admin/dataops), Data Migration Factory (/admin/migration), system settings | **Requires MFA** (HIGH_PRIVILEGE_ROLES). Only role allowed password-based login in production (bcryptjs). |

### Dev-only credential accounts

These are hardcoded in `lib/auth.ts` and active ONLY when `NODE_ENV=development` or `ENABLE_DEV_ACCOUNTS=true`:

```
super.admin@avaniis.dev / demo   → SUPER_ADMIN
hr.admin@avaniis.dev    / demo   → HR_ADMIN
hr.director@avaniis.dev / demo   → HR_DIRECTOR
payroll@avaniis.dev     / demo   → PAYROLL_ADMIN
manager@avaniis.dev     / demo   → MANAGER
employee@avaniis.dev    / demo   → EMPLOYEE
finance@avaniis.dev     / demo   → FINANCE
```

---

## HIGH_PRIVILEGE_ROLES

```typescript
const HIGH_PRIVILEGE_ROLES: KRole[] = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
```

These roles require `mfaVerified === true` in the JWT for any `requireRole()` call.

**How mfaVerified is set:**
- Microsoft Entra ID sessions → `mfaVerified = true` (Avaniis Conditional Access enforces MFA at OIDC layer)
- Dev credentials → `mfaVerified = false` (bypassed via `isDevSession` guard in `requireRole()`)
- Legacy JWTs without the field → `mfaVerified = undefined` (not blocked — treated as trusted to avoid breaking existing sessions)

**Dev bypass:** When `NODE_ENV=development` OR `ENABLE_DEV_ACCOUNTS=true`, the MFA check is skipped entirely. This allows local HR_ADMIN development without TOTP enrollment.

---

## RBAC Implementation

### Layer 1 — requireRole() in lib/auth.ts

```typescript
export async function requireRole(allowed: KRole[]): Promise<SessionUser>
```

- Called at the top of every Server Action
- Throws `FORBIDDEN: requires one of [...], got <role>` if role not in allowed list
- Throws `STEP_UP_REQUIRED: MFA verification required...` if HIGH_PRIVILEGE role with `mfaVerified === false` (and not dev session)
- Returns the authenticated `SessionUser` on success

**Standard Server Action pattern:**
```typescript
const session = await auth()
const user = await requireRole(session, ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
// user.legalEntityId is now safe to use for entity scoping
```

### Layer 2 — feature_permissions table (configuration.ts)

- Per-feature × per-role action matrix
- Actions: `view / create / edit / delete / approve / export`
- Zero code change to add a new permission — insert one row into `feature_permissions`
- UI at `/access/feature-permissions` (HR_ADMIN+ only)
- Checked by `modules/config/guards.ts` before every config write

---

## Access Boundaries

| Module | EMPLOYEE | MANAGER | PAYROLL_ADMIN | FINANCE | HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN |
|---|---|---|---|---|---|---|---|
| ESS (profile, leave, payslips) | Own only | Own only | Own only | Own only | Full | Full | Full |
| My Team | — | Own team | — | — | Full | Full | Full |
| People (persons list/detail) | — | Own team only | — | — | Entity-scoped | Cross-entity | All |
| Leave Admin | — | Team approvals | — | — | Entity-scoped | Cross-entity | All |
| Payroll | Own payslips | — | Full | Read | Run only | Run only | Full |
| Org Chart | View | View + actions | — | — | Full | Full | Full |
| Master Data | — | — | — | — | Full | Full | Full |
| Reports | — | Team reports | Payroll reports | Finance reports | HR reports | All | All |
| User Management | — | — | — | — | — | — | Full |
| DataOps Console | — | — | — | — | — | — | Full |
| Data Migration Factory | — | — | — | — | — | — | Full |
| System Settings | — | — | — | — | Partial | Partial | Full |
| ARIA Assistant | Own chat | Own chat | — | — | HR console | HR console | Full |

---

## Security Controls

### Authentication
- **Primary:** Microsoft Entra ID OIDC (Avaniis tenant, Conditional Access enforces MFA)
- **Secondary:** Password login — SUPER_ADMIN only, bcryptjs hash comparison
- **Dev/UAT:** Credentials provider (hardcoded accounts, disabled in production unless `ENABLE_DEV_ACCOUNTS=true`)
- **Session:** JWT strategy, `maxAge=1800s` (30 minutes), Auth.js v5

### MFA (SEC-04 — SHIPPED)
- Entra ID Conditional Access is the primary MFA control (enforced at OIDC layer before the app sees the token)
- `mfaVerified` JWT claim set from provider in `jwt` callback
- `requireRole()` enforces `mfaVerified === true` for HIGH_PRIVILEGE_ROLES in production
- App-level TOTP enrollment UI is a Phase 3 stretch goal (not yet implemented)

### PII Encryption
- `emirates_id`, `passport_number`, `iban` stored as AES-256-GCM ciphertext
- Key: `FIELD_ENCRYPTION_KEY` env var (32-byte hex) — NEVER commit
- Encrypt before write, decrypt after read — `lib/encryption.ts`
- Never log, compare, or display raw ciphertext

### Audit Trail (BR-AUDIT-001)
- `audit_log` table — INSERT-only, never updated or deleted
- `writeAuditLog()` must be called inside every `db.transaction`
- Every Server Action write produces an audit row
- Event types: AUTH.SIGN_IN, PERSON.CREATED, WORKER_ASSIGNMENT.CREATED, DOCUMENT.URL_ISSUED, DOCUMENT.ACCESS_DENIED, MIGRATION.MANAGER_LINKS_SET, etc.

### XSS Prevention
- `isomorphic-dompurify` used in `pdf-template.tsx` for all user-HTML-to-PDF paths
- Radix UI / shadcn components escape content by default
- No `dangerouslySetInnerHTML` in production UI paths

### SQL Injection
- Drizzle ORM uses parameterized queries exclusively
- No raw SQL string concatenation in application code
- DataOps console (SUPER_ADMIN) executes NL2SQL — gated at SUPER_ADMIN level, audit-logged

### Document Access (Defense in Depth)
- Server Action (`getDocumentUrl`): validates session + ownership/role → returns `/api/documents/${id}` URL (never raw storage key)
- API Route (`/api/documents/[id]`): independently re-validates session + ownership/role before serving bytes
- Unauthenticated direct URL → 401
- Cross-user URL attempt → 403
- Cloud storage: private containers; 5-minute SAS/presigned URL per-request
- `DOCUMENT.URL_ISSUED` and `DOCUMENT.ACCESS_DENIED` always audit-logged

### EMPLOYEE Ownership Guard
- `getMyProfile` in `modules/profile/actions.ts` enforces: if `session.user.role === 'EMPLOYEE'` and `session.user.personId !== personId` → return null (FIX-2G-001)
- HR_ADMIN+ roles can cross-read legitimately
- This prevents any authenticated EMPLOYEE from reading another employee's full profile via direct Server Action call

### CSRF
- Auth.js v5 handles CSRF protection for its own flows
- Next.js Server Actions are same-origin by design (no CSRF risk for mutation)

---

## Security Assumptions Future AI Agents Must Preserve

1. **Never expose raw storage keys or SAS tokens to the browser.** The API route + server action double-check pattern must be maintained. Removing either layer creates a direct PII exposure path.

2. **requireRole() must be the first call in every Server Action.** Any code that runs before requireRole() is unauthenticated by definition.

3. **PII fields must be encrypted before insert and decrypted after select.** Never pass plaintext emiratesId, passportNumber, or iban to Drizzle directly.

4. **Every db.transaction must include writeAuditLog() inside the same transaction.** Audit log outside the transaction can silently drop records if the transaction rolls back.

5. **The mfaVerified === false (strict equality) check must never be changed to falsy (!mfaVerified).** `undefined` (legacy JWTs) must not be blocked — that would lock out existing sessions at the moment of deployment.

6. **tenant_id must appear on every INSERT.** The column default only fires when the field is omitted; explicit `undefined` bypasses it. Always pass `tenantId: TENANT_ID`.

7. **The EMPLOYEE ownership guard in getMyProfile must be preserved.** It prevents cross-employee profile reads at the Server Action layer. Do not remove it to "simplify" the code.

8. **Cross-entity data isolation for HR_ADMIN.** HR_ADMIN is entity-scoped. Every query that runs under HR_ADMIN must include `WHERE legal_entity_id = session.user.legalEntityId`. SUPER_ADMIN bypasses this — but never extend SUPER_ADMIN bypass to HR_ADMIN.

9. **Dev credential bypass (ENABLE_DEV_ACCOUNTS) must never fire in production without explicit operator opt-in.** The guard is `process.env.NODE_ENV === 'development' || process.env.ENABLE_DEV_ACCOUNTS === 'true'`. Do not change to `!== 'production'` — that would include staging.

10. **Password login is restricted to SUPER_ADMIN role only.** The check `if (row.avaniisRole !== 'SUPER_ADMIN') return null` in the Credentials provider authorize() function must not be removed or relaxed.

---

## DataOps Console Security

- **Route:** `/admin/dataops` (SUPER_ADMIN only, `superAdminOnly: true` flag in workspace-nav.ts)
- **APIs:** `/api/dataops/execute`, `/api/dataops/nl2sql`, `/api/dataops/schema`, `/api/dataops/tables/[schema]/[table]` (CRUD)
- **All writes:** SUPER_ADMIN-gated at the API route level
- **NL2SQL:** Converts natural language to SQL via Claude API — every execution is audit-logged
- **Risk:** SUPER_ADMIN can execute arbitrary SQL. This is intentional (DataOps use case) but must never be exposed to lower roles.

---

## Session JWT Claims

The JWT carries exactly these claims (set in `lib/auth.ts` jwt callback):

| Claim | Type | Notes |
|---|---|---|
| id | string | User account UUID |
| email | string | Primary email |
| name | string | Display name |
| role | KRole | One of the 7 roles |
| legalEntityId | string | Primary entity UUID |
| personId | string? | persons.id — may be undefined for new SSO users |
| mfaVerified | boolean? | true=Entra ID, false=dev creds, undefined=legacy |

JWT maxAge: 1800 seconds (30 minutes). No refresh tokens for the session JWT itself.

---

## New User SSO Flow

When a Microsoft Entra ID user signs in for the first time with no `user_accounts` row:
1. Assigned `role = 'EMPLOYEE'` (safe default)
2. Assigned `legalEntityId = DEFAULT_LEGAL_ENTITY_ID` env var
3. SUPER_ADMIN receives in-app notification + email (if SMTP configured)
4. HR Admin must manually create an employee record and assign the correct role
5. `personId` remains undefined in JWT until the employee record is created and linked

This flow is safe: the new SSO user has EMPLOYEE access only and no personId, so they can log in but cannot access any meaningful HR data until provisioned.


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/06-WORKFLOW-RULES.md
LINES: 246
================================================================================
# 06 — WORKFLOW RULES

> Last updated: 2026-06-04
> Sources: lib/workflow-engine.ts, drizzle/schema/workflow-engine.ts, drizzle/schema/transactions.ts, drizzle/schema/configuration.ts, drizzle/schema/actions.ts

---

## Workflow Engine Architecture

| Dimension | Detail |
|---|---|
| Location | `lib/workflow-engine.ts` (primary engine) |
| Pattern | Configurable approval chains stored in `workflow_definitions_v2` + `workflow_steps_v2` tables |
| Runtime state | `workflow_instances_v2` + `workflow_step_instances` |
| Actions (canonical) | **APPROVE, REJECT, DELEGATE** — these 3 only. No other action is valid at a decision point. |
| SLA escalation | Cron job at `/api/cron/workflow-sla` (Vercel: 09:00 UTC daily). Actions: ESCALATE, AUTO_APPROVE, AUTO_REJECT, SEND_REMINDER, BLOCK_FREEZE |
| Notifications | Postgres outbox pattern via `notification_log` table + `lib/jobs/process-driver.ts` cron poller |
| Hierarchy resolution | `lib/workflow-hierarchy.ts` — resolves LINE_MANAGER, POSITION, CUSTOM_GROUP approver chains |
| Rules evaluation | `lib/workflow-rules.ts` — AND/OR condition tree evaluation |
| SLA calculation | `lib/workflow-sla.ts` — UAE working hours-aware deadline computation |
| Atomicity | **All workflow mutations wrapped in `db.transaction`** — collision-hardened 2026-05-24 |

### Key Schema Tables

| Table | Purpose |
|---|---|
| `workflow_definitions_v2` | Workflow templates (one per process type) |
| `workflow_steps_v2` | Step definitions within a workflow — order, approver type, SLA, conditions |
| `workflow_rules` | Condition rules for step evaluation |
| `workflow_sla_calendars` | UAE working-hours calendar for SLA deadline computation |
| `approval_groups` / `approval_group_members` | Custom approver groups (CUSTOM_GROUP type) |
| `workflow_instances_v2` | Live approval instance per submitted request |
| `workflow_step_instances` | Per-step runtime state (WAITING/PENDING/APPROVED/REJECTED/etc.) |
| `workflow_audit_log` | Immutable record of every decision taken |
| `workflow_email_tokens` | Email-link approval tokens (one-click approve/reject via email) |
| `workflow_delegation_rules` | Permanent delegation rules (different from per-instance DELEGATE action) |
| `workflow_notification_queue` | Outbound notification queue for workflow events |

### Legacy Tables (still present, workflow-engine v1)

| Table | Status |
|---|---|
| `workflow_definitions` (configuration.ts) | V1 — still referenced by some older code paths |
| `workflow_stages` (configuration.ts) | V1 |
| `workflow_routing_rules` (configuration.ts) | V1 |
| `workflow_instances` (transactions.ts) | V1 — has `currentDelegateePersonId` for per-instance delegation |
| `approval_delegations` (transactions.ts) | V1 temporary approval authority transfer |

---

## Workflow Types (resource types)

The `dispatchResourceCompletion` function in `lib/workflow-engine.ts` handles completion for these resource types:

| Resource Type | Table Updated on Approval | Uniqueness Constraint | Notes |
|---|---|---|---|
| `absence_entry` / `leave_requests` | `absence_entries.status` → APPROVED/REJECTED | None (advisory lock per person) | pg_advisory_xact_lock serialises per-person to prevent overlap race |
| `hiring_requests` | `hiring_requests.status` → APPROVED/REJECTED/FULFILLED | `uq_hiring_request_pending` (migration 0041) — only 1 PENDING_APPROVAL per position | COLLISION-004 fix |
| `transfer_requests` | `transfer_requests.status` → APPROVED/REJECTED/CANCELLED | `uq_transfer_request_pending` (migration 0042) — only 1 PENDING_APPROVAL per person | COLLISION-004B fix |
| `probation_review` | `probation_reviews.status` → CONFIRM/EXTEND/FAIL/REJECTED | None | COLLISION-PROBATION fix: tx? DbOrTx param |
| `insurance_enrollments` | `medical_insurance_enrolments.status` | None | |

The `resourceType` and `resourceId` columns on `workflow_instances_v2` link the workflow to the business record.

---

## State Transitions

### Leave Requests (`absence_entries`)

```
DRAFT
  ↓ (submitWorkflow)
PENDING_APPROVAL
  ↓ (APPROVE)       ↓ (REJECT)
APPROVED          REJECTED
  ↓ (employee withdraws)
CANCELLED
```

Backdating check runs before `db.transaction` — if `startDate < today`, `resolveBackdatePolicy` is called. No policy row = BLOCKED (safe default).

### Hiring Requests

```
PENDING_APPROVAL (max 1 per position via partial unique index)
  ↓ APPROVE → APPROVED → FULFILLED (when hired)
  ↓ REJECT  → REJECTED
  ↓ Cancel  → CANCELLED
```

### Transfer Requests

```
PENDING_APPROVAL (max 1 per person via partial unique index)
  ↓ APPROVE → APPROVED
  ↓ REJECT  → REJECTED
  ↓ Cancel  → CANCELLED
```

### Probation Reviews

```
PENDING
  ↓ HR decision:
CONFIRM   (employment confirmed)
EXTEND    (probation period extended)
FAIL      (triggers termination workflow)
REJECTED  (review rejected without action)
```

### Workflow Step Instances

```
WAITING → PENDING → APPROVED
                  → REJECTED
                  → DELEGATED (step reassigned; does not advance workflow)
                  → ESCALATED (SLA breach)
                  → SKIPPED   (conditional rule evaluation)
                  → AUTO_APPROVED (SLA auto-approve action)
                  → RECALLED
```

### Workflow Instances

```
PENDING → IN_PROGRESS → APPROVED
                      → REJECTED
                      → CANCELLED
                      → ESCALATED
                      → ON_HOLD
                      → RECALLED
```

---

## Collision Hardening Applied (all FIXED as of 2026-05-24)

All collision vulnerabilities have been resolved. Status verified in `tests/roadmap/collision-matrix.md` v6.0.

| Collision | Fix | Location |
|---|---|---|
| COLLISION-001: double-approval race | Atomic `UPDATE WHERE status='PENDING' RETURNING id` — empty return = concurrent race → safe error | `lib/workflow-engine.ts` `takeWorkflowAction` |
| COLLISION-002: SLA cron double-approve | Resolved automatically by COLLISION-001 fix (SLA AUTO_APPROVE uses `takeWorkflowAction`) | Same |
| COLLISION-003 engine: submitWorkflow multi-step bare inserts not atomic | Full `db.transaction` wrapping instance + steps + notification inserts + audit | `lib/workflow-engine.ts` `submitWorkflow` |
| COLLISION-003 caller: submitLeaveRequest + submitWorkflow in separate transactions | Single outer `db.transaction` wraps both; `submitWorkflow` accepts `tx?: DbOrTx` param | `modules/absence/actions.ts`, `lib/workflow-engine.ts` |
| COLLISION-004: hiring_requests duplicate pending | `uq_hiring_request_pending` partial unique index `(tenant_id, position_id) WHERE status = 'PENDING_APPROVAL'` | Migration 0041 |
| COLLISION-004B: transfer_requests duplicate pending | `uq_transfer_request_pending` partial unique index `(tenant_id, person_id) WHERE status = 'PENDING_APPROVAL'` | Migration 0042 |
| ARIA-LOCK: createLeaveRequest optimistic overlap guard | `pg_advisory_xact_lock(hashtext('leave:' || personId))` as first op inside `db.transaction`, before overlap check. Serialises per person; lock is tx-scoped. | `modules/absence/actions.ts` `createLeaveRequest` |
| COLLISION-DELEGATE: DELEGATE branch bare writes | `db.transaction` wraps step reassign + audit | `lib/workflow-engine.ts` |
| COLLISION-SLA-BRANCH ESCALATE: dual-write not atomic | `db.transaction` wraps step + instance writes | `lib/workflow-engine.ts` |
| COLLISION-SLA-BRANCH SEND_REMINDER: notification dedup | `db.transaction` wraps notification insert + `remindedAt` SET | `lib/workflow-engine.ts` |
| COLLISION-PROBATION: applyProbationOutcome owns its own tx | `tx?: DbOrTx` param; all 4 outcome branches refactored to `runBranch(client: DbOrTx)` closure with conditional dispatch | `modules/core-hr/probation/workflow-actions.ts` |
| COLLISION-NOTIF: probation alert duplicate notifications | 24h dedup check before insert; `skipped` counter in response | `app/api/cron/probation-alerts/route.ts` |
| RISK-PAYROLL-2: concurrent payroll run number collision | `pg_advisory_xact_lock(hashtext('payroll_run:' || entityId))` inside `db.transaction` before MAX read | `modules/payroll/actions.ts` |

**Test coverage:** 52/52 collision tests pass (`tests/integration/workflow-collision.test.ts`).

---

## Business Invariants

1. **Every workflow decision must be exactly one of: APPROVE, REJECT, DELEGATE.** No other action is valid at a decision step. (MEMORY.md: "Workflow decisions must include Delegate" — Approve/Reject/Delegate is the canonical 3-button set.)

2. **DELEGATE reassigns the step but does NOT advance the workflow.** The delegate becomes the new authoritative approver for that step instance. The `workflow_instances_v2.currentDelegateePersonId` field is cleared after the next decision.

3. **SLA cron (`/api/cron/workflow-sla`) triggers AUTO_APPROVE or ESCALATE on deadline breach.** The breach action is configured per step in `workflow_steps_v2.slaBreachAction`. Valid: ESCALATE, AUTO_APPROVE, AUTO_REJECT, SEND_REMINDER, BLOCK_FREEZE.

4. **Resource completion (`dispatchResourceCompletion`) must join the post-claim transaction.** The function accepts an optional `tx?: DbOrTx` parameter — always pass the current transaction when calling from within a workflow action handler.

5. **The partial unique index prevents >1 PENDING_APPROVAL per position (hiring) or person (transfer).** When a 23505 unique constraint violation occurs, the application converts it to a user-friendly bilingual message — never let the raw Postgres error reach the UI.

6. **`submitWorkflow` accepts an optional outer transaction (`tx?: DbOrTx`).** When provided, all workflow writes join the caller's transaction. When omitted, `submitWorkflow` opens its own `db.transaction`. Pass `tx` from `createLeaveRequest` to make leave creation + workflow submission fully atomic.

7. **`applyProbationOutcome` accepts an optional outer transaction (`tx?: DbOrTx`).** The `runBranch(client: DbOrTx)` closure handles all 4 outcome branches (REJECTED, CONFIRM, EXTEND, FAIL) consistently. Note: `generateProbationLetter` and `triggerTerminationApproval` intentionally remain outside the transaction (accepted design decision).

8. **The `SYSTEM_ACTOR` UUID ('22222222-...') must reference a real `persons.id` row.** It is the actor for AUTO_APPROVE, escalation, and SLA actions. This row must exist in every environment (seeded via `test-mdm.ts`).

---

## Leave Workflow Specifics

### createLeaveRequest flow

1. `pg_advisory_xact_lock(hashtext('leave:' || personId))` — first thing inside `db.transaction`. Serialises per-person.
2. `loadPersonScope` — verify person exists, get entity, get leave balance
3. **Backdate policy check** (if `startDate < today`): call `resolveBackdatePolicy(employeeEntityId, absenceTypeId, daysBack)`. No policy row = BLOCKED. Throws BACKDATE_POLICY_MISSING if not found.
4. **Overlap check** — query `absence_entries` for any PENDING or APPROVED leave overlapping the requested period
5. Create `absence_entries` row (status: PENDING_APPROVAL)
6. Call `submitWorkflow({ ..., tx: outerTx })` — workflow joins the outer transaction
7. All 6 steps are in a single `db.transaction` — atomic

### Backdate Policy

- Table: `leave_backdate_policies` (configuration.ts)
- Unique on `(tenant_id, legal_entity_id, absence_type_id)`
- `backdatingEnabled = false` → BACKDATE_NOT_ALLOWED (bilingual EN · AR error)
- `backdateLimitDays` = 0 → BACKDATE_LIMIT_EXCEEDED immediately
- No policy row → BACKDATE_POLICY_MISSING (BLOCKED — safe default)
- Employee entity resolved from `persons.legalEntityId` — never from caller-supplied data (BDP-009)

---

## Notification Workflow

### Postgres Outbox Pattern

Notifications never block the main request. They flow through:

1. **Write**: `notification_log` row inserted (status: PENDING) inside the same `db.transaction` as the business write
2. **Poll**: `lib/jobs/process-driver.ts` — node-cron poller picks up PENDING rows, sends via SMTP/in-app
3. **Status update**: row updated to SENT or FAILED
4. **Retry**: FAILED rows retried on next poll cycle (at-least-once delivery)

### Notification Types

| Type | Channel | When |
|---|---|---|
| LEAVE_REQUEST_APPROVED | IN_APP + EMAIL | Leave approved by workflow |
| LEAVE_REQUEST_REJECTED | IN_APP + EMAIL | Leave rejected by workflow |
| WORKFLOW_STEP_ASSIGNED | IN_APP + EMAIL | New step assigned to approver |
| PROBATION_ENDING | IN_APP | 30/14/7 days before probation end |
| SYSTEM_ALERT | IN_APP | New SSO user, system events |
| HIRING_REQUEST_* | IN_APP + EMAIL | Hiring workflow state changes |
| TRANSFER_REQUEST_* | IN_APP + EMAIL | Transfer workflow state changes |

### SLA Cron Schedule

- **Vercel cron:** `/api/cron/workflow-sla` — runs at 09:00 UTC daily (`vercel.json`)
- **Probation alerts:** `/api/cron/probation-alerts` — 24h dedup prevents duplicate alerts on retry
- **Outbox poller:** `lib/jobs/process-driver.ts` — node-cron, continuous polling in background

---

## Adding a New Workflow for a New Resource Type

To add a workflow for a new resource type (e.g., `expense_claims`):

1. **Schema:** Add the resource table to the appropriate schema file with `status` column (PENDING_APPROVAL/APPROVED/REJECTED)
2. **Uniqueness:** Add a partial unique index `WHERE status = 'PENDING_APPROVAL'` if only one pending approval per entity makes sense (migration file)
3. **dispatchResourceCompletion:** Add a case for the new `resourceType` in `lib/workflow-engine.ts` `dispatchResourceCompletion` function — update status + send bilingual notification (pass `client` not `db`)
4. **Submit:** Call `submitWorkflow({ workflowCode: 'EXPENSE_CLAIM', resourceType: 'expense_claims', resourceId: ..., tx: outerTx })` from within the creation `db.transaction`
5. **UI:** Add APPROVE/REJECT/DELEGATE buttons in the approvals inbox
6. **Error handling:** Catch `23505` (unique constraint) and return friendly bilingual error message

Never call `submitWorkflow` outside of a `db.transaction` — the caller must always provide an outer `tx`.


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/07-UI-PATTERNS.md
LINES: 299
================================================================================
# 07 — UI Patterns & Design System

> Generated: 2026-06-04. Source of truth: app/globals.css, tailwind.config.ts, CLAUDE.md.
> Do not modify token names or values without updating DESIGN_SYSTEM.md and globals.css.

---

## Layout Conventions

### Route Groups
| Route Group | Purpose | Auth |
|---|---|---|
| `(auth)` | Sign-in, sign-out pages | Public |
| `(employee)/me` | Employee Self-Service (ESS) | Authenticated, EMPLOYEE |
| `(hr-admin)` | HR Admin, Manager, SuperAdmin pages | Authenticated, role-gated |
| `(signing)/me` | Letter signing page (token-based) | Token-auth (no session) |

### Layout Architecture

**HR Admin Layout** (`app/(hr-admin)/layout.tsx`):
- `WorkspaceRail` (left sidebar, 240px) — workspace switcher + secondary nav
- `AdminTopbar` (top bar) — breadcrumbs, user avatar, notifications
- Main content area — route-specific Server Components
- `MobileBottomBar` — shown at ≤1024px, hidden at ≥1025px

**Employee Layout** (`app/(employee)/layout.tsx`):
- `EmployeeSidebar` (left sidebar) — ESS navigation (My Profile 2nd, Org Chart last per Task 2F)
- `EmployeeTopbar` (top bar) — user avatar, profile menu
- Main content area

**Font Assignments**:
- `var(--font-sans)` → Inter — body text, labels, UI strings
- `var(--font-serif)` → Fraunces — headings, display numbers, KPI values
- `var(--font-mono)` → JetBrains Mono — person numbers (AVN-XXXXX), email addresses, IDs, codes

---

## Design System (CSS Tokens)

**Hard Rule 7**: Always use `var(--token)` — NEVER raw hex colors anywhere in components.

### Accent Scale (Brand: Teal)
```css
--accent-050: #EFF5F6   /* very light tint — selected row bg, tag bg */
--accent-100: #D9E7E9   /* focus rings, selected item bg */
--accent-200: #B5CED2   /* hover borders */
--accent-500: #3E7582   /* mid accent */
--accent:     #2E6170   /* PRIMARY BRAND — buttons, active states, links */
--accent-700: #1F4A57   /* dark accent — pressed state */
--accent-900: #0F2E38   /* deepest — nav background, dark surfaces */
```

### Neutral Ink Scale
```css
--ink-1: #151A22   /* primary text — headings, labels, body */
--ink-2: #3E4855   /* secondary text — descriptions, subtitles */
--ink-3: #606E7A   /* muted / placeholder — darkened from #6E7885 for WCAG AA ≥4.5:1 (fixed P6F 2026-05-25) */
--ink-4: #A2A9B3   /* disabled / hairline — EXEMPT from SC 1.4.3 contrast rules */
```

### Surface Scale
```css
--card:    #FFFFFF   /* cards, panels, drawers, modals */
--surface: #F5F6F8   /* secondary bg, hover states, striped rows */
--bg:      #F0F2F5   /* page background */
--border:  #E5E8EC   /* dividers, input borders, table borders */
```

### Navigation Sidebar Tokens
```css
--nav-bg:        #0F2E38             /* sidebar background (dark teal) */
--nav-fg:        #A8BFC6             /* sidebar text (default) */
--nav-fg-dim:    #6D8990             /* dimmed sidebar text */
--nav-fg-strong: #FFFFFF             /* sidebar text (active/hover) */
--nav-border:    rgba(255,255,255,0.06)  /* sidebar dividers */
--nav-active-bg: rgba(255,255,255,0.08) /* active nav item background */
--nav-active-fg: #FFFFFF             /* active nav item text */
```

### Rail Tokens (WorkspaceRail specific)
```css
/* WorkspaceRail uses --rail-* tokens; --rail-fg-mute brightened to #7B8FA0 for WCAG AA (P6F) */
```

### Status Palette
```css
/* Warning / Amber */
--status-warning:        #F29900
--status-warning-bg:     #FEF6E4
--status-warning-fg:     #8A5A0B
--status-warning-border: #E5C896

/* Info / Blue */
--status-info:           #1A73E8

/* Success / Green */
--status-success:        #1E7E34

/* Status Pills */
--status-pending-bg:     #FEF6E4   --status-pending-fg:   #8A5A0B   --status-pending-dot:   #D98A00
--status-approved-bg:    #E8F3ED   --status-approved-fg:  #1E5B38   --status-approved-dot:  #2E8B57
--status-rejected-bg:    #FBE9E9   --status-rejected-fg:  #8A1F1F   --status-rejected-dot:  #C0392B
```

### Org Chart Special Tokens
```css
--org-acting:            #F59E0B   /* amber — acting assignment ring */
--org-vacant:            #EF4444   /* red — vacant position */
--org-frozen:            #F59E0B   /* amber — budget frozen */
--org-contractor:        #3B82F6   /* blue — contractor ring */
--org-overloaded:        #F97316   /* orange — >8 direct reports */
--org-under-supervised:  #808899   /* grey dashed ring — dedicated literal (decoupled from --ink-4 since P6F) */
```

### Font Variables
```css
--font-sans:  /* Inter — set via Next.js font loader in app/layout.tsx */
--font-serif: /* Fraunces — display headings */
--font-mono:  /* JetBrains Mono — codes, IDs */
```

### Tailwind Token Bridge
All tokens are bridged into Tailwind via `tailwind.config.ts`:
- `text-ink-1`, `text-ink-2`, `text-ink-3`, `text-ink-4`
- `bg-accent`, `bg-accent-050`, `bg-surface`, `bg-card`, `bg-bg`
- `border-border`, `border-accent-200`
- `text-accent`, `text-accent-700`

---

## Navigation Patterns

### Three Navigation Systems
AVANIIS HR has three completely separate navigation systems — they do NOT share components.

| System | File | Roles | Notes |
|---|---|---|---|
| Workspace Rail | `config/workspace-nav.ts` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | 11 workspace tiles + secondary nav |
| Admin Sidebar | `config/admin-nav.ts` | MANAGER | Flat grouped sidebar |
| Employee Sidebar | `components/employee/EmployeeSidebar.tsx` | EMPLOYEE | Fixed order: Home → My Profile → ... → Org Chart |

**Critical Invariant**: `workspace-nav.ts` and `admin-nav.ts` must ALWAYS be updated together. Adding a route to only one file means the other role loses it. This is a known footgun documented in MEMORY.md.

### SUPPRESS_SECONDARY_NAV
Some workspace IDs are listed in `SUPPRESS_SECONDARY_NAV` — these route directly to the workspace URL without showing the secondary nav panel. Example: `'migration'` was added so the Data Migration Activity workspace tiles directly.

### SUPER_ADMIN-Only Items
Items with `superAdminOnly: true` in workspace-nav.ts are filtered at render time. Only visible to SUPER_ADMIN role. Example: Users management, DataOps console.

### Employee Sidebar Order (locked by Task 2F tests NAV-001–010)
```
1. Home (/me)
2. My Profile (/me/profile)       ← moved to 2nd (Task 2F)
3. ARIA (/me/aria)
4. Leave (/me/leave)
5. Timesheet (/me/timesheet)
6. Payslips (/me/payslips)
7. Insurance (/me/insurance)
8. Letters (/me/letters)
9. Documents (/me/documents)
10. Organisation Chart (/me/org-chart)  ← last (Task 2F)
```

---

## Component Patterns

### Available shadcn/ui Primitives
Located at `components/ui/`:
- `badge.tsx` — status badges
- `button.tsx` — all button variants
- `card.tsx` — card container
- `dialog.tsx` — modal dialogs
- `input.tsx` — text inputs
- `label.tsx` — form labels
- `select.tsx` — dropdown selects
- `table.tsx` — data tables
- `textarea.tsx` — multi-line inputs
- `toast.tsx` + `toaster.tsx` — toast notifications
- `tooltip.tsx` — hover tooltips

### Custom Components
- `components/ui/ActionModeSelector.tsx` — action mode toggle
- `components/ui/DraftRestoreBanner.tsx` — draft recovery banner
- `components/ui/ErrorAlert.tsx` — error display
- `components/ui/LeaveBalanceCard.tsx` — leave balance display
- `components/ui/SectionHeader.tsx` — section headings
- `components/ui/SortableHeader.tsx` — sortable table column header

### Drawer Pattern (MdmDrawer)
`components/mdm/MdmDrawer.tsx` has a WAI-ARIA compliant focus trap:
- `getFocusable()` — finds all focusable elements within drawer
- Auto-focuses first element on open
- Tab/Shift+Tab cycles within drawer boundary
- Focus restores to trigger element on close
- `role="dialog"` with `aria-modal="true"` and `aria-labelledby`

**Do not replace MdmDrawer with a plain div.** It is WCAG 2.1.2 compliant (CB-BUG-002 fix).

### PersonSelect Component
`components/forms/PersonSelect.tsx` — searchable in-container person picker:
- Safe to use inside MdmDrawer (focus-trap compatible)
- `valueLabel` fallback for inactive saved persons
- Stores `person_id` (UUID), never display text
- Used for Department Head, Line Manager, Dotted Line Manager

### Table Pattern
- Server Component fetches data with `Promise.all` (never sequential awaits for >1 query)
- Client Component handles pagination state, filter bar
- `SortableHeader` for column sorting
- Export button triggers server action returning blob

### Form Pattern
- Zod schema at `modules/*/validations.ts`
- `useFormState` / `useActionState` for server action forms
- `revalidatePath()` after successful write
- Error display: inline field errors or ErrorAlert component

---

## Server Action Pattern (Mandatory)

Every server action that writes to the database must follow this exact pattern:

```typescript
'use server'

import { auth }        from '@/lib/auth'
import { requireRole } from '@/lib/auth'
import { db }          from '@/lib/db'
import { audit }       from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { Schema }      from './validations'

export async function myAction(input: unknown) {
  // 1. Auth + role gate
  const session = await auth()
  requireRole(session, ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  // 2. Zod validation
  const data = Schema.parse(input)

  // 3. Transaction + audit (ALWAYS together, never separate)
  await db.transaction(async tx => {
    // BR-xx: cite the business rule driving this write
    await tx.insert(myTable).values({
      ...data,
      tenantId: TENANT_ID,    // ALWAYS include tenant_id
    })
    await audit.log(tx, {
      actor:      session.user,
      event:      'MY_RESOURCE.CREATED',
      resourceId: data.id,
      newValues:  data,
    })
  })

  // 4. Revalidate affected routes
  revalidatePath('/hr-admin/my-resource')
}
```

**NEVER throw from a server action in a catch block** — Next.js 15 sanitizes thrown errors to a generic message. Return `{ error: string }` instead.

**NEVER use `translateError()` in server components** — it has return type `never` and always re-throws, crashing the page render with "An error occurred in the Server Components render".

---

## Bilingual Requirements

- ALL user-facing strings: `name_en` AND `name_ar` fields (bilingual mandatory)
- All form inputs: bilingual `aria-label` (e.g. `aria-label="Department / القسم"`)
- Auto-translate framework: `lib/translation.ts` + `POST /api/translate` + `useAutoTranslate` hook
- All MDM create/update server actions call `translateToArabic()`
- Arabic is NEVER translated back to English
- RTL support: `dir="rtl"` on `<html>` when locale is `ar`; use `[dir="rtl"]` CSS selectors for flip styles

---

## Accessibility Requirements (WCAG 2.1 AA)

- Color contrast: CERTIFIED 2026-05-25 (P6F). 3 token values corrected.
  - `--ink-3` fixed to #606E7A (was #6E7885) — ratio 5.24:1 on white
  - `--org-under-supervised` fixed to #808899 literal (was var(--ink-4)) — SC 1.4.11 compliant
  - `--rail-fg-mute` fixed to #7B8FA0 (was #5E7080) — ratio 5.57:1 on #0D1117
- Focus management: MdmDrawer focus trap (WCAG 2.1.2)
- ARIA roles: `role="dialog"`, `role="switch"`, `aria-checked`, `aria-label` on all interactive elements
- Bilingual aria-labels on all 4 PersonFilterBar select triggers (CB-BUG-001 fix)
- axe-core: 0 critical violations on 3 key pages
- RTL: 45/45 RTL certification tests pass

---

## Dark Mode

- Enabled via `[data-dark="true"]` on `<html>` (Tailwind selector strategy)
- All tokens must have dark-mode overrides defined in `globals.css` under `[data-dark="true"]`
- Do not use Tailwind's `dark:` prefix — use the `[data-dark]` attribute selector only
- Check dark-mode equivalents before adding new light-mode token values


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/08-PAYROLL-READINESS.md
LINES: 208
================================================================================
# 08 — Payroll Module Readiness Assessment

> Generated: 2026-06-04. BLUEPRINT ONLY — no implementation changes.
> Source: modules/payroll/, app/(hr-admin)/payroll/, drizzle/schema/transactions.ts.

---

## Current Payroll State

### Module Files
Located at `modules/payroll/`:
- `actions.ts` — server actions (createPayrollRun, etc.) with RISK-PAYROLL-2 advisory lock fix
- `calculation-engine.ts` — payroll calculation orchestration
- `index.ts` — public barrel (cross-module import point per Hard Rule 6)
- `payroll-assignment-actions.ts` — payroll grade/assignment history
- `queries.ts` — read queries
- `schema.ts` — Drizzle schema aliases/helpers
- `services.ts` — EOSB, GPSSA, DEWS calculation logic
- `types.ts` — TypeScript types, `PayrollRunStatus` enum, status labels
- `validations.ts` — Zod schemas

### Payroll Run Status Lifecycle
```
DRAFT → CALCULATED → LOCKED → APPROVAL_PENDING → APPROVED → SIF_GENERATED → CONFIRMED → ARCHIVED
```

### UI Pages (app/(hr-admin)/payroll/)
| Route | Purpose | Status |
|---|---|---|
| `/payroll` | Dashboard — KPI cards, recent runs, entity summary | Built (Promise.all parallelised — GEO-OPT-001) |
| `/payroll/runs` | Payroll run list + create | Built |
| `/payroll/salary-elements` | Salary element master data | Built |
| `/payroll/wps` | WPS file management | Built (SIF_GENERATED status exists) |
| `/payroll/definitions` | Payroll definition config | Built |
| `/payroll/reports` | Payroll reporting | Built |

### Hardening Already Applied
- **RISK-PAYROLL-2 (FIXED)**: `nextRunNumber` moved inside `db.transaction` with `pg_advisory_xact_lock(hashtext('payroll_run:' || entityId))` — prevents two concurrent `createPayrollRun` calls generating the same run number
- **GEO-OPT-001**: `/payroll/page.tsx` uses `Promise.all` for parallel DB queries (saves ~205ms per page load vs sequential awaits)
- **Workflow integration**: `APPROVAL_PENDING` → approval via workflow engine → `APPROVED`

---

## UAE Payroll Requirements

### Mandatory Compliance Items
| Requirement | Description | Implementation Status |
|---|---|---|
| **WPS** | Wages Protection System — Central Bank of UAE mandates SIF (Salary Information File) format submission for every payroll run | `SIF_GENERATED` status exists; SIF file format needs verification |
| **GPSSA** | General Pension & Social Security Authority — applies to UAE nationals only; employer + employee contributions | `calculateGpssaContribution()` in services.ts |
| **DEWS** | Dirhams End of Service Workscheme — alternative EOSB scheme for certain free zone employees | `dewsContributions` table in schema |
| **EOSB** | End of Service Benefit (gratuity) — UAE Labour Law: 21 days/year for first 5 years, 30 days/year thereafter | `calculateEosb()` in services.ts |
| **Bilingual Payslips** | All payslips must render in both English and Arabic | Payslip generation status needs verification |
| **IBAN Validation** | UAE bank accounts require validated IBAN for WPS compliance | PII-encrypted in persons table |

### WPS SIF File Format
The UAE Central Bank mandates a specific CSV/fixed-width format (SIF — Salary Information File):
- Must include: employer_bank_code, routing_code, employee_name, bank_account_number, salary_amount, currency, payment_date
- Submitted monthly to bank; bank files with MOHRE (Ministry of Human Resources)
- Penalties for late or incorrect submission

### GPSSA Contribution Rates (as of 2026 — rates are configurable, not hardcoded)
- UAE Nationals: Employee 5%, Employer 12.5% (Abu Dhabi); varies by emirate
- Non-nationals: exempt from GPSSA
- Implementation must support configurable rates — do not hardcode percentages

### EOSB Calculation Formula (UAE Labour Law Article 51–56)
```
Years 1–5:   21 days basic salary per year
Year 6+:     30 days basic salary per year
Maximum:     2 years total basic salary
Deductions:  Absent days, advances (per employment contract)
Triggers:    Resignation (≥5 years), termination, end of contract
```

---

## Reusable Entities Already Built

The payroll module can leverage all of these without rebuilding:

| Entity | Table(s) | Payroll Use |
|---|---|---|
| Legal Entities | `legal_entities` | Payroll run per entity; WPS per entity bank |
| Persons + Worker Assignments | `persons`, `worker_assignments` | Employee list for run; grade/position for salary band |
| Leave/Absence | `absence_requests`, `absence_balances` | Leave deduction calculation inputs |
| Work Schedules | `work_schedules`, `work_schedule_assignments` | Hours worked calculation, Ramadan schedule |
| Salary Elements | `salary_elements` (in transactions schema) | Earnings + deductions structure |
| Payroll Assignments | `payroll_assignments` | Grade-to-payroll-band mapping history |
| Workflow Engine | `workflow_instances`, `workflow_steps` | Payroll approval flow (APPROVAL_PENDING → APPROVED) |
| Audit Trail | `audit_log` | Payroll audit entries (every write must use audit.log()) |
| Notifications | `notification_log` (outbox) | Payslip ready notification to employee |
| GPSSA Contributions | `gpssaContributions` | Stored per run |
| DEWS Contributions | `dewsContributions` | Stored per run |
| EOSB Calculations | `eosbCalculations` | Stored per calculation |

---

## Missing Prerequisites (Audit Checklist)

Before payroll can go live, verify each item:

### Calculation Completeness
- [ ] `calculateEosb()` — verify all termination scenarios: resignation <5yr, resignation ≥5yr, termination without cause, contract expiry; unpaid leave deduction
- [ ] `calculateGpssaContribution()` — verify Abu Dhabi vs Dubai vs other emirate rate logic; verify UAE national detection (nationality field)
- [ ] Overtime calculation — UAE Labour Law: 25% premium (day), 50% premium (night/Friday); verify against `work_schedules`
- [ ] Ramadan schedule deductions — reduced hours, late deduction rules
- [ ] Allowances processing — housing, transport, school fees: verify they are salary-element-driven, not hardcoded

### File Generation
- [ ] WPS SIF file format — verify output matches UAE Central Bank v2.0 specification; include all mandatory fields; test with sample bank routing code
- [ ] Bank file generation — IBAN validation (must be 23-character UAE IBAN: AE + 2 check + 3 bank + 16 account)
- [ ] Payslip PDF generation — verify `jspdf` renders bilingual (EN/AR), all salary elements, YTD totals, company branding
- [ ] GPSSA monthly report format — confirm format required by authority

### Integration Points
- [ ] WPS submission workflow — does it integrate with bank portal API or is it file-upload only?
- [ ] DEWS provider API — which DEWS provider? API credentials needed?
- [ ] Email notification — payslip attached to email or link to portal?

### Data Prerequisites
- [ ] All employees have valid UAE IBAN (for WPS)
- [ ] All UAE nationals flagged correctly (for GPSSA)
- [ ] All employees assigned to correct payroll definition
- [ ] Salary elements configured per legal entity

---

## Risks

### Risk 1 — WPS SIF Format (HIGH)
**Risk**: UAE Central Bank updates SIF specification periodically. If implementation uses an old format version, WPS filing will be rejected.
**Mitigation**: Verify current SIF version (v2.0 as of 2026) at uaewps.ae before go-live. Make format version configurable.

### Risk 2 — GPSSA Contribution Rates (MEDIUM)
**Risk**: GPSSA rates change by emirate and occasionally by decree. Hardcoded rates cause incorrect deductions after rate change.
**Mitigation**: Store rates in a `gpssa_contribution_rates` configuration table. Never hardcode percentages in services.ts. The calculation engine should read from DB, not constants.

### Risk 3 — EOSB Calculation Complexity (HIGH)
**Risk**: EOSB edge cases are numerous: partial years, unpaid leave periods, salary changes mid-year, advances against EOSB.
**Mitigation**: Write comprehensive unit tests for `calculateEosb()` covering all edge cases before go-live. Test against manually calculated examples from a UAE labour lawyer.

### Risk 4 — Multi-Entity Isolation (MEDIUM)
**Risk**: WPS filing and bank accounts are per legal entity. Cross-entity data leakage in reports or file generation would be a compliance violation.
**Mitigation**: Every payroll query must include `tenantId` AND `legalEntityId` filters. Verify no cross-entity aggregations in WPS file generation.

### Risk 5 — Payslip Confidentiality (LOW)
**Risk**: Payslip PDF is generated server-side; if the URL is guessable, employees could access other employees' payslips.
**Mitigation**: Use signed URLs (short-lived, per-user) for payslip access. Same pattern as document management. Audit `PAYSLIP.ACCESSED` events.

---

## Phased Roadmap

### Phase 1 — Foundation (COMPLETE)
- Salary elements master data
- Payroll run lifecycle (DRAFT → ARCHIVED)
- Basic payroll assignment history
- EOSB calculation engine (needs verification)
- GPSSA calculation engine (needs verification)
- Payroll dashboard

### Phase 2 — Calculation Engine (VERIFY / COMPLETE)
- EOSB edge case handling and comprehensive test coverage
- GPSSA rate configuration table (replace hardcoded rates)
- Overtime calculation engine
- Ramadan schedule integration
- Allowances processing via salary elements
- Payslip PDF generation (bilingual)

### Phase 3 — Filing
- WPS SIF file generation (UAE Central Bank format v2.0)
- GPSSA monthly report generation
- DEWS contribution file generation
- Bank file generation with IBAN validation
- WPS submission status tracking

### Phase 4 — Integration
- Bank portal API integration (if available) vs manual file upload workflow
- DEWS provider API integration
- Employee payslip email delivery
- Payroll calendar and period management automation
- Direct debit processing confirmation

---

## Key Code Locations

```
modules/payroll/
├── actions.ts                  ← createPayrollRun (has advisory lock)
├── calculation-engine.ts       ← orchestration
├── services.ts                 ← calculateEosb, calculateGpssaContribution, determineSuspensionPayTreatment
├── payroll-assignment-actions.ts ← assignToPayroll, correctPayrollAssignment, getPayrollAssignmentHistory
├── queries.ts                  ← read queries
├── types.ts                    ← PayrollRunStatus, PAYROLL_RUN_STATUS_LABELS
└── validations.ts              ← Zod schemas

app/(hr-admin)/payroll/
├── page.tsx                    ← dashboard (Promise.all parallelised)
├── runs/                       ← run management
├── salary-elements/            ← MDM for salary components
├── wps/                        ← WPS file management
├── definitions/                ← payroll config
└── reports/                    ← analytics

drizzle/schema/transactions.ts  ← payrollRuns, eosbCalculations, gpssaContributions, dewsContributions
```


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/09-AI-SESSION-GUIDE.md
LINES: 188
================================================================================
# 09 — AI Session Guide

> Generated: 2026-06-04. Practical guide for all AI assistants continuing development on AVANIIS HR.
> Read this before any task. It documents what has gone wrong before and how to avoid it.

---

## Quick Start

Load these files at the start of every session (in this order):

1. `docs/project-memory/2026-06-04/00-README-HANDOVER.md` — orientation and state summary
2. `docs/project-memory/2026-06-04/03-CURRENT-STATE.md` — exact current codebase state
3. `docs/project-memory/2026-06-04/11-DO-NOT-BREAK-RULES.md` — what must never be changed

Then run these verification commands before touching any file:
```bash
git log --oneline -3       # confirm you are on the right commit
git status                 # confirm clean working tree (should be clean)
pnpm typecheck             # must be 0 errors before you start
```

---

## Task-Specific Loading Guide

| Task Type | Files To Load | Files To Avoid | Suggested Branch | Notes |
|---|---|---|---|---|
| **Employee record changes** | `modules/core-hr/actions.ts`, `modules/core-hr/validations.ts`, `drizzle/schema/foundation.ts` | `lib/workflow-engine.ts` | `feat/core-hr-*` | Always check effective-date pattern; never hard-delete persons |
| **Leave / absence changes** | `modules/absence/actions.ts`, `modules/absence/backdate-policy-actions.ts`, `drizzle/schema/transactions.ts` | `modules/payroll/` | `feat/leave-*` | Backdate policy enforced before DB write; advisory lock inside transaction |
| **Workflow engine changes** | `lib/workflow-engine.ts`, `lib/db.ts`, `drizzle/schema/workflow-engine.ts` | Everything else first | `feat/workflow-*` | MOST DANGEROUS FILE. Every change needs collision regression test in `tests/integration/workflow-collision.test.ts` |
| **Master data / MDM changes** | `app/(hr-admin)/master-data/`, `components/mdm/MdmDrawer.tsx`, relevant `modules/config/` | `lib/workflow-engine.ts` | `feat/mdm-*` | Both nav files must stay in sync if adding a new MDM route |
| **Reporting changes** | `modules/reports/`, `app/(hr-admin)/reports/` | Schema files | `feat/reports-*` | Always use Promise.all for parallel queries; never sequential awaits |
| **Payroll changes** | `modules/payroll/`, `app/(hr-admin)/payroll/` | `lib/workflow-engine.ts` | `feat/payroll-*` | Advisory lock required for run number; test EOSB edge cases |
| **RBAC changes** | `lib/auth.ts`, `drizzle/schema/configuration.ts` (feature_permissions) | Everything else | `feat/rbac-*` | requireRole() change affects ALL modules; MFA step-up gate must stay |
| **Database migrations** | `drizzle/migrations/` only | drizzle-kit (DO NOT USE) | `feat/migration-*` | Next slot: 0055. Apply via Neon SQL Editor only. Journal stops at 0039. |
| **UI / design changes** | `app/globals.css`, `tailwind.config.ts`, specific component | Schema files | `feat/ui-*` | Only use CSS tokens; never raw hex. Check dark-mode too. |
| **Bug fixing (generic)** | The specific file with the bug + its test file | Unrelated modules | `fix/bug-name` | Run typecheck before and after. Add regression test. |
| **Migration Factory changes** | `modules/migration/v2-executor.ts`, `modules/migration/v2-actions.ts`, `app/(hr-admin)/admin/migration/` | Production schema files | `feat/migration-factory-*` | Read CLAUDE.md migration section first. detectZeroWriteFailure() must stay. |
| **AI / ARIA changes** | `modules/aria/`, `app/api/aria/chat/route.ts`, `app/(hr-admin)/aria/`, `app/(employee)/me/aria/` | `lib/workflow-engine.ts` | `feat/aria-*` | All Claude API errors must return bilingual AriaResponse, never crash |

---

## Critical Session Rules

### 1. Always typecheck after code changes
```bash
pnpm typecheck   # must be 0 errors
```
If you see TypeScript errors after your change, fix them before committing. Never leave a session with TS errors.

### 2. Always check git status before starting
```bash
git status   # should show clean working tree
git log --oneline -3   # confirm you are on the right commit
```
If there are uncommitted changes from a previous session, understand them before adding more changes.

### 3. Never apply migrations via drizzle-kit
```bash
# WRONG — do not run this
pnpm drizzle-kit migrate

# CORRECT — apply via Neon SQL Editor
# Copy contents of drizzle/migrations/0055_your_migration.sql
# Paste into Neon Console → Project → SQL Editor → Execute
```
The drizzle journal only tracks 0000–0039. Running `drizzle-kit migrate` on a fresh DB will NOT apply 0040–0054. For new migrations (0055+), write the SQL file, then apply manually.

### 4. Always sync worktree changes to main project path
If you use git worktrees for parallel development, every file edit in the worktree must also be applied to `/Users/d.kethari/D_Drive/AVANIIS_HR_SYS` immediately. Changes in a worktree branch never automatically merge to main.

### 5. Never commit UAT dev credentials
The dev credential accounts (`employee@avaniis.dev`, `hr.admin@avaniis.dev`, etc.) are gated by `NODE_ENV=development`. The `ENABLE_DEV_ACCOUNTS` env var controls this in Vercel. Never expose real credentials in code or git history.

### 6. Always update e2etestresults.md after Playwright runs
After every `pnpm playwright test` run, add a new numbered entry to `tests/e2e/e2etestresults.md` before reporting results. This is a project invariant from MEMORY.md.

### 7. Never use translateError() in Server Components
`translateError()` has return type `never` — it always re-throws as AppError. In Server Components (page.tsx files), this crashes the render with "An error occurred in the Server Components render". 
- In server actions: return `{ error: string }` instead of throwing
- In server component pages: use try/catch with `notFound()` or empty state fallback

### 8. Always use db.transaction() + audit.log() for every write
Every DB write must be inside a transaction with an audit log entry in the same transaction. The audit log row must be written atomically with the business data row. No exceptions.

### 9. Always include tenant_id in every insert
Every table has `tenant_id DEFAULT '00000000-0000-0000-0000-000000000001'::uuid`. Even though it has a default, explicitly include it in all inserts for clarity and defence against future multi-tenant changes.

### 10. Check both nav files when adding routes
`config/workspace-nav.ts` and `config/admin-nav.ts` are two separate files. Adding a new route to only one means the other role (MANAGER) loses access. Always update both files together.

---

## Known Footguns (Things That Have Caused Bugs Before)

### Footgun 1 — translateError() in Server Components
**What happened**: `listPersons`, `getMyProfile`, `getPerson` all used `translateError()` in catch blocks. Any DB error crashed the entire page with a generic Next.js error message instead of a graceful fallback. Fixed as BUG-NAV-001.
**Avoid by**: Never use `translateError()` in page.tsx Server Components. Return `null` / `[]` / `notFound()` on error.

### Footgun 2 — Silent .catch() swallowing errors in migration executor
**What happened**: `setManagerLinks`, `setDeptHeads`, `insertLeaveBalances` all had `.catch(() => { return { created: 0 } })` — exceptions were silently eaten. The migration reported `ok=true` even when 0 records were written. Fixed with `detectZeroWriteFailure()`.
**Avoid by**: Never use bare `.catch()` that returns a success-shaped object. Use explicit `try/catch` and push to `errors[]`.

### Footgun 3 — Manager links resolution using only live DB (not within-batch)
**What happened**: During the V1 migration pilot, all 21 employees had `lineManagerId = null` because the validator checked manager references against the live DB only. Employees being imported in the same batch couldn't be found as managers for each other.
**Avoid by**: Within-batch resolution via the Managers sheet. Do not assume imported-in-the-same-batch persons exist in DB yet.

### Footgun 4 — Sequential DB awaits on dashboards
**What happened**: The payroll page and original dashboard had sequential `await db.select()` calls. Each held the Neon connection in series, causing p95 page loads >2,000ms.
**Avoid by**: Always use `Promise.all([...])` for independent DB queries on the same page.

### Footgun 5 — Two nav files getting out of sync
**What happened**: A new MDM route was added to `workspace-nav.ts` but not `admin-nav.ts`. MANAGER role users couldn't see the new route.
**Avoid by**: `grep` both files when adding routes. They must always be identical in structure.

### Footgun 6 — Missing tenant_id on new table inserts
**What happened**: New tables added without `tenant_id` DEFAULT got null constraint violations on insert.
**Avoid by**: Every new table in Drizzle schema must have `tenantId: uuid('tenant_id').notNull().default(sql\`'00000000-...'::uuid\`)`.

### Footgun 7 — Workflow double-approval race condition
**What happened**: Two concurrent callers both read `status='PENDING'` and both wrote `status='APPROVED'`. The second approval silently succeeded.
**Fixed by COLLISION-001**: `takeWorkflowAction` now uses `UPDATE WHERE status='PENDING' RETURNING id`. Empty return = race detected → error.
**Avoid by**: Never read-then-write workflow status in two separate transactions.

### Footgun 8 — SAS URL written verbatim to audit log
**What happened**: Profile photo upload stored a 7-day Azure SAS URL directly in `audit_log.new_values`. The token was a live credential persisted in the audit trail.
**Fixed as FIX-2G-002**: Now writes `'<updated>'` placeholder instead of the SAS URL.
**Avoid by**: Never log tokens, SAS URLs, presigned URLs, or any time-limited credentials to the audit trail.

### Footgun 9 — EMPLOYEE role cross-person data access
**What happened**: `getMyProfile` server action accepted any `personId` parameter without checking session ownership. Any authenticated EMPLOYEE could read another employee's full profile.
**Fixed as FIX-2G-001**: EMPLOYEE role guard added: `if (role === 'EMPLOYEE' && session.user.personId !== personId) return null`.
**Avoid by**: Any server action accepting a `personId` must verify EMPLOYEE role can only access their own personId.

### Footgun 10 — EROFS: read-only file system on Vercel
**What happened**: Document upload fallback wrote to `process.cwd()/public/uploads/` — read-only on Vercel serverless functions.
**Fixed as BUG-DMG-001**: Fallback now uses `/tmp/avaniis-uploads/` (writable on Vercel).
**Avoid by**: Never write to `process.cwd()` or `__dirname` in server-side code on Vercel. Use `/tmp` for ephemeral storage, cloud provider for persistent storage.

---

## Migration Factory Session Notes

### Current DB State (as of 2026-06-04)
- 21 active employees loaded (V1 pilot)
- 0 manager links (`persons.lineManagerId = NULL` for all 21)
- 0 leave balances (`absence_balances` table empty)
- 2 department heads set (via V1 backfill, not V2)
- Org Chart, My Team, Leave Requests: NOT READY

### DO NOT attempt to patch the current state
The false-success bug is now fixed in v2-executor.ts. The correct action is to run a full V2 reload:

```
Step 2: Clear (removes 21 employees + V1 dept head backfill + all assignments)
Step 3: Seed master data
Step 4: Upload pilot-v2-migration-package.xlsx (from hr_data_migration/UAT/)
Step 5: Validate (expect: 21 employees, 20 manager links, 2 dept heads, 21 leave balances)
Step 6: Dry run (confirm counts match expected)
Step 7: Execute (expect: ok=true, all 4 phases write non-zero)
Step 8: Scorecard (expect: READY — all 9 checks pass)
Step 9: Sign off
```

### What the false-success fix does
`detectZeroWriteFailure()` in `v2-executor.ts`:
- If expected writes > 0 and created = 0 → pushes to `errors[]` → `ok = false`
- If expected writes = 0 (empty sheet) → not an error (legitimate)
- Fires for Phase 2 (managers), Phase 3 (deptHeads), Phase 4 (leaveBalances)

### If any phase returns 0 writes during Step 7
The executor now fails hard with an error naming the skipped person numbers. Do NOT proceed to Step 8. Investigate which person numbers are missing from DB / master data and re-run from Step 2.

---

## Testing Checklist Before Any Commit

```bash
pnpm typecheck                    # 0 errors required
pnpm vitest run tests/unit        # all unit tests
pnpm vitest run tests/integration # if DB-layer code changed
pnpm build                        # 0 build errors
# For E2E (when available):
pnpm playwright test --project=hr-admin   # HR admin flows
```

Then update `tests/e2e/e2etestresults.md` if any Playwright tests were run.


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/10-NEXT-DEVELOPMENT-PLAN.md
LINES: 226
================================================================================
# 10 — Next Development Plan

> Generated: 2026-06-04.
> This document defines the recommended sequence of work after the session that fixed the Migration V2 false-success bug.

---

## Immediate Next Steps (Priority Order)

### Priority 1 — Migration V2 Pilot Reload
**Status**: BLOCKED — must run Step 2 Clear before reloading.
**Why**: Current Neon DB has 21 employees from V1 load with 0 manager links and 0 leave balances. Cannot patch in place; must clear and reload via V2.

**Exact sequence**:
1. Navigate to: HR Admin → Data Migration Activity
2. Step 2: Clear — removes 21 employees, V1 dept head backfill, all assignments
3. Step 3: Seed master data — seeds legal entities, departments, positions, grades, locations
4. Step 4: Upload `hr_data_migration/UAT/pilot-v2-migration-package.xlsx`
5. Step 5: Validate — expect 21 employees, 20 manager links, 2 dept heads, 21 leave balances
6. Step 6: Dry run — confirm counts match validation; 0 blockers
7. Step 7: Execute — expect `ok=true`; check all 4 phase counts are non-zero
8. Step 8: Post-load scorecard — expect READY; all 9 checks pass
9. Step 9: Sign off — generate sign-off record

**Success criteria**:
- `persons.lineManagerId` non-null for 20 of 21 employees (Talal has no manager — root node)
- `absence_balances` has 21 rows
- Org Chart renders with hierarchy
- Leave Requests page loads without error (fail-closed was due to empty balances)
- Manager Approvals inbox works for Talal and Dorababu

### Priority 2 — Verify Post-Load Scorecard (9 checks)
After Step 8, verify each scorecard check passes:
1. All employees have worker_assignments
2. All employees have absence_balances
3. All employees (except root) have lineManagerId set
4. Dept heads linked via departments.head_person_id
5. HOD auto-link audit event present (MIGRATION.HOD_AUTO_LINK)
6. No circular manager references
7. All employees have user accounts (or documented exceptions for K643/K450)
8. Leave balance years are current
9. MIGRATION.LEAVE_BALANCES_CREATED audit event present

### Priority 3 — Document Storage Production Setup
**Status**: UAT-only (files in /tmp; ephemeral).
Five production blockers remain (DMG-PROD-1 through DMG-PROD-5):

| Blocker | Action Required |
|---|---|
| DMG-PROD-1 | Set `DOCUMENT_STORAGE_PROVIDER=azure` + `AZURE_STORAGE_CONNECTION_STRING` in Vercel (all env scopes) |
| DMG-PROD-2 | Upload test file; force container recycle; verify file still accessible |
| DMG-PROD-3 | Test `getDocumentUrl` end-to-end with Azure Blob (signed URL flow, not /tmp stream) |
| DMG-PROD-4 | Seed HR Admin + person + entity test data in Neon; rerun 5 skipped HA-* Playwright tests |
| DMG-PROD-5 | Verify `lib/storage/factory.ts` throws (not falls back to /tmp) when `NODE_ENV=production` + wrong env var |

---

## Recommended Priorities (Post-Pilot)

### A — Document Storage Production Blockers (HIGH)
Complete DMG-PROD-1 through DMG-PROD-5 as listed above.
Coordinates with: Vercel dashboard, Azure Portal, Avaniis IT team.

### B — WIP Migrations Audit (MEDIUM)
Investigate migration files with `_wip_` prefix in `drizzle/migrations/`:
- Identify which (0055–0061 range) are safe to apply
- Determine if any are required for upcoming features
- Do NOT apply blindly — understand each one first
- Test on Neon staging before applying to production

### C — Payroll Module Completeness Audit (MEDIUM)
See `docs/project-memory/2026-06-04/08-PAYROLL-READINESS.md` for full checklist.
Priority sub-items:
1. Verify `calculateEosb()` handles all termination scenarios with unit tests
2. Verify WPS SIF file format matches UAE Central Bank v2.0 specification
3. Replace hardcoded GPSSA rates with configurable DB table
4. Verify payslip PDF renders bilingual

### D — MFA TOTP Enrollment UI (LOW)
**Status**: Phase 3 stretch goal. Entra ID CA is the production MFA control; app-level TOTP is additional defence-in-depth.
**Scope**: QR code enrollment flow, recovery codes, TOTP verification on login for non-Entra users.
**Dependency**: Requires `otplib` or similar; needs auth.ts JWT changes for `mfaVerified` from TOTP path.

### E — Insurance Module Phase 2 (LOW)
**Status**: Phase 1 insurance module built (read-only ESS view, basic admin). Insurer API integration deferred.
**Scope**: Insurer API integration, bulk import of insurance data, plan change automation on promotion.
**Dependency**: Insurer API credentials from Avaniis IT team.

---

## Branch Strategy

### Main Branch
- `main` is the production branch — auto-deploys to `avaniishcm.vercel.app` on push
- Never force-push to main
- Every merge to main must pass: `pnpm typecheck` + `pnpm build`

### Feature Branches
```bash
git checkout -b feat/v2-pilot-reload   # for migration factory work
git checkout -b feat/document-storage  # for Azure Blob integration
git checkout -b fix/bug-name           # for bug fixes
```

### Worktree Strategy
When working on two independent features in parallel:
```bash
git worktree add ../AVANIIS-HR-FEAT /branch-name
# Always sync changes back to main project path
# Changes in worktree never automatically reach main
```

---

## Migration Strategy

### Current State
- Journal tracks: 0000–0039 (Drizzle managed)
- Applied manually: 0040–0054 (Neon SQL Editor)
- WIP files: check `drizzle/migrations/` for `_wip_` suffix — do NOT apply without review
- Next clean slot: ~~0055~~ → **0065** (corrected 2026-06-12 — 0062 email platform, 0063/0064 effective-dating applied to DEV/UAT; ledger SSOT: `docs/environment/migration-ledger.test.md`)

### Creating a New Migration
```bash
# 1. Write the SQL file
# File: drizzle/migrations/0055_your_feature_name.sql

# 2. Update Drizzle schema TypeScript
# File: drizzle/schema/relevant-file.ts

# 3. Apply to Neon STAGING first
# Neon Console → Project → SQL Editor → paste 0055 SQL → Execute

# 4. Verify in staging
# SELECT table_name FROM information_schema.tables WHERE table_schema='public';

# 5. Apply to Neon PRODUCTION
# Same process after staging confirmation

# 6. Commit both the .sql file and schema .ts file
git add drizzle/migrations/0055_your_feature_name.sql
git add drizzle/schema/relevant-file.ts
git commit -m "feat(schema): add your_feature_name (migration 0055)"
```

### What NOT to do
- Do NOT run `pnpm drizzle-kit generate` — it will try to generate migrations for the 0040–0054 gap
- Do NOT run `pnpm drizzle-kit migrate` against Neon — it will not apply 0040–0054
- Do NOT add columns as `NOT NULL` without a default or backfill (Expand→Migrate→Contract pattern)

---

## Testing Strategy Before Release

Run in this order:

```bash
# 1. TypeScript
pnpm typecheck              # must be 0 errors

# 2. Unit tests
pnpm vitest run tests/unit  # all unit tests

# 3. Integration tests (if DB-layer code changed)
pnpm vitest run tests/integration

# 4. Security tests (if RBAC or auth changed)
pnpm vitest run tests/security

# 5. Build
pnpm build                  # must be 0 errors, shows page count

# 6. E2E (for affected flows)
pnpm start &
pnpm playwright test --project=hr-admin     # HR admin flows
pnpm playwright test --project=employee     # ESS flows
```

After Playwright: add entry to `tests/e2e/e2etestresults.md`.

---

## Release Strategy

### Standard Release
```bash
# 1. Verify locally
pnpm typecheck && pnpm build

# 2. Push to main (triggers Vercel auto-deploy)
git push origin main

# 3. Verify on Vercel
# - Check build logs for errors
# - Navigate to avaniishcm.vercel.app
# - Test key affected flows
# - Check Vercel function logs for runtime errors

# 4. If issues: revert via Vercel dashboard (instant rollback) or git revert
```

### DB Migration Release
```bash
# Apply SQL to Neon BEFORE pushing code that depends on new columns
# 1. Apply migration via Neon SQL Editor
# 2. Verify columns/tables exist
# 3. Push code changes to main
# 4. Verify deployment
```

### Rollback Plan
- Vercel: Instant rollback to previous deployment via Vercel dashboard
- Database: Drizzle has no automatic rollback. Write a manual rollback SQL before applying any migration.
- For column additions: `ALTER TABLE foo DROP COLUMN bar;`
- For table additions: `DROP TABLE foo;`

---

## Open Decisions (Needs User Input)

| Decision | Context | Status |
|---|---|---|
| Azure Blob vs AWS S3 for document storage | Both implementations exist in lib/storage/; just needs env var configuration | Awaiting Azure credentials from Avaniis IT |
| Production deployment domain | hr.avaniis.global (prod) + hr-test.avaniis.global (test) once Avaniis.global→AVANIIS.global migration done | Deferred |
| DEWS provider | Which DEWS provider will Avaniis use? API credentials needed for Phase 3 | Awaiting Avaniis finance team |
| App-level TOTP (MFA) | Phase 3 stretch goal; Entra ID CA is primary MFA | Decision: implement or skip? |


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/11-DO-NOT-BREAK-RULES.md
LINES: 216
================================================================================
# Do Not Break Rules — Architectural Invariants
**Snapshot date:** 2026-06-04

This is a checklist of rules that must not be violated under any circumstances. Each rule has a WHY explanation so you understand what breaks if you ignore it.

Read this before touching existing code. If a proposed change would violate any of these rules, stop and ask the user before proceeding.

---

## 1. Database Rules

- [ ] **Every business write must be inside a `db.transaction()` with `writeAuditLog()` called on the same transaction handle.**

  WHY: If the write commits but the audit write fails, or vice versa, the audit trail is incomplete and the system violates BR-AUDIT-001. The audit log is the compliance record for UAE Labour Law and PDPL. Using the tx handle ensures atomicity — both succeed or both roll back.

  Pattern:
  ```typescript
  await db.transaction(async tx => {
    await tx.insert(persons).values(...)
    await writeAuditLog({ ... }, tx)
  })
  ```

- [ ] **Never use `DELETE` on HR records. Use the effective-date pattern instead.**

  WHY: UAE Labour Law requires a complete, immutable history of employment, salary, and leave decisions. Hard deletes destroy legal evidence. The pattern is: close the current record (set `validTo = today`) and open a new record (insert with `validFrom = today`). See `lib/effective-date.ts`.

  Applies to: persons, worker_assignments, absence_balances, salary_elements, and any record with `valid_from` / `valid_to` columns.

- [ ] **PII fields must be encrypted before persistence using `lib/encryption.ts`.**

  WHY: UAE PDPL (Personal Data Protection Law) and GDPR require that sensitive identity fields cannot be read in plaintext from the database. A DB breach must not expose raw identity data.

  Affected fields: `emirates_id`, `passport_number`, `iban`. Use `encrypt()` / `encryptNullable()` before INSERT/UPDATE, and `decrypt()` / `decryptNullable()` after SELECT.

- [ ] **Every table must include `tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid`.**

  WHY: The system is designed to become multi-tenant. Every row needs a tenant discriminator from day one. Rows without `tenant_id` cannot be isolated when a second tenant is onboarded.

- [ ] **Use `TENANT_ID` from `lib/constants.ts` in every INSERT — never hardcode the UUID.**

  WHY: If the constant changes (e.g. multi-tenant routing), every INSERT changes automatically. Hardcoded UUIDs in 100+ places would require a search-and-replace and would inevitably miss some.

- [ ] **Do not bypass the `guard-db-write.js` safety rail.**

  WHY: This script prevents `drizzle-kit migrate`, `drizzle-kit push`, `db:seed`, and `test:e2e` from running against Neon unless explicitly overridden. Bypassing it risks destroying production data.

---

## 2. RBAC Rules

- [ ] **Every Server Action must call `requireRole(allowed)` as its first statement.**

  WHY: Server Actions are callable from any authenticated client. Without an upfront role check, a lower-privileged user who knows the action name could invoke it. Next.js does not enforce RBAC at the framework level.

  Pattern:
  ```typescript
  export async function updateSalary(input: UpdateSalaryInput) {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    // ... rest of action
  }
  ```

- [ ] **High-privilege roles (HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN) require MFA.**

  WHY: These roles have access to PII, salary data, and system configuration. SEC-04 mandates MFA step-up. `requireRole()` enforces this automatically via the `mfaVerified` JWT claim. Do not remove or weaken this check.

- [ ] **Never expand a role's access by widening the `allowed` array without user approval.**

  WHY: Role permissions are a business decision, not a technical one. Widening access without approval changes who can see salary data, PII, and audit logs.

- [ ] **Cross-module imports must use the module's `index.ts` barrel, not direct file imports.**

  WHY: Direct imports bypass the intentional public API boundary. If an internal helper changes signature, direct importers break silently. The barrel is the contract. Drizzle schema imports are exempt (they live under `drizzle/schema/` and are referenced directly).

---

## 3. Security Rules

- [ ] **Never log PII, secrets, tokens, or connection strings.**

  WHY: Vercel log drains send logs to external systems (Datadog/Axiom). PII in logs violates PDPL. Secrets in logs are a credential exposure. `lib/logger.ts` redacts 30+ known PII field names — use it instead of `console.log` for structured logging.

- [ ] **Never re-throw errors from Server Action catch blocks using `translateError()`.**

  WHY: Next.js 15 sanitises Server Action exceptions in production builds — the real error message is stripped and replaced with "An error occurred in the Server Components render". The client sees nothing useful. Pattern: catch, `console.error()`, return `{ error: string }`. The client checks `'error' in result`.

- [ ] **CSS tokens only — never raw hex or RGB values in component files.**

  WHY: Raw colour values bypass the design system. They do not respond to dark mode, they break the WCAG contrast audit, and they make theming impossible. Use `var(--accent)`, `var(--ink-1)`, etc. See `07-UI-DESIGN-SYSTEM.md`.

- [ ] **All user-facing strings must be bilingual: `name_en` and `name_ar`.**

  WHY: The system is contractually bilingual. Arabic-locale users see `name_ar`; English-locale users see `name_en`. A string with only one language will appear blank or broken in the other locale. This applies to DB-stored strings, error messages, notifications, and UI labels.

- [ ] **Document storage must use the `lib/storage/` abstraction — never write directly to the filesystem in production.**

  WHY: Vercel serverless functions have a read-only filesystem except `/tmp`. Files written to `/tmp` are lost when the container recycles. The storage abstraction routes to Azure Blob or AWS S3 in production. Setting `DOCUMENT_STORAGE_PROVIDER` to nothing in production throws a clear error rather than silently losing files.

---

## 4. Workflow Rules

- [ ] **Every workflow decision panel must expose exactly three buttons: Approve, Reject, Delegate.**

  WHY: This is BR-29 — the canonical workflow UX. Deviating from it makes the system inconsistent and breaks user training. Do not add extra buttons or remove Delegate.

- [ ] **Workflow writes (instance + steps + notifications + resource updates) must all be in the same database transaction.**

  WHY: If a step record is written but the instance status update fails (or vice versa), the workflow enters an inconsistent state that cannot be recovered automatically. Phase 3 Priority 2 hardened all five workflow write paths to be atomic. Do not revert this to bare `db.insert` / `db.update` calls outside a transaction.

- [ ] **Use `pg_advisory_xact_lock` for per-resource serialisation where overlap checks are race-prone.**

  WHY: Two concurrent leave requests for the same person can both pass the overlap check if they read before either commits. The advisory lock serialises per-person without locking the whole table. Pattern: `hashtext('leave:' || personId)` as the lock key. Already implemented in `createLeaveRequest`. Apply the same pattern for any new resource with a uniqueness-over-time constraint.

- [ ] **The `dispatchResourceCompletion` function must be called with the caller's transaction handle.**

  WHY: Resource completion (updating the hiring_request / transfer_request / leave_request status after workflow approval) must be atomic with the workflow step update. Calling it after the transaction commits creates a window where the workflow is approved but the resource is still PENDING.

---

## 5. UI Rules

- [ ] **Use CSS design system tokens — never raw hex, RGB, or HSL values in component files.**

  Full token list: `var(--bg)`, `var(--surface)`, `var(--card)`, `var(--border)`, `var(--ink-1)` through `var(--ink-4)`, `var(--accent)`, `var(--accent-050)` through `var(--accent-700)`, `var(--nav-bg)`, `var(--nav-fg)`, `var(--nav-active-bg)`, `var(--nav-active-fg)`. Org chart tokens: `--org-acting`, `--org-vacant`, `--org-frozen`, `--org-contractor`, `--org-overloaded`, `--org-under-supervised`.

- [ ] **All UI strings that appear in Arabic locale must have an Arabic counterpart.**

  WHY: The `name_ar` / `subjectAr` / `bodyAr` fields are not optional decoration — they are contractual. Any string without Arabic will appear blank when the user switches to Arabic locale.

- [ ] **The MdmDrawer has a WAI-ARIA focus trap — do not remove it.**

  WHY: CB-BUG-002 was a WCAG 2.1.2 violation. The drawer (`components/mdm/MdmDrawer.tsx`) implements auto-focus on open, Tab/Shift+Tab trapping within the dialog, and focus restoration on close. Removing any of these three hooks breaks keyboard accessibility.

- [ ] **The two navigation config files must stay in sync: `config/workspace-nav.ts` and `config/admin-nav.ts`.**

  WHY: `workspace-nav.ts` controls the HR Admin/Director/Super Admin rail; `admin-nav.ts` controls the Manager sidebar. Adding a new menu item to one without the other means managers never see it (or vice versa). Every navigation change touches both files.

---

## 6. Migration Rules

- [ ] **Never run `pnpm db:migrate` expecting it to apply migrations above 0039.**

  WHY: The Drizzle journal (`drizzle/meta/_journal.json`) tracks only migrations 0000–0039. `drizzle-kit migrate` reads the journal and silently skips unapplied migrations outside it. Migrations 0040–0054 were applied manually via Neon SQL Editor and are not in the journal. Running `db:migrate` on a fresh database will leave it 15 migrations behind the current schema.

- [ ] **Check WIP migration files before creating a new migration.**

  WHY: As of 2026-06-04, files `0055_payroll_run_number_per_entity.sql`, `0055_wip_step_instance_columns.sql`, `0056_wip_notification_queue_meta.sql`, and `0057_wip_audit_immutability.sql` exist in `drizzle/migrations/` but have NOT been applied to any environment. There are also two files starting with `0055_` which creates ambiguity. Always inspect the folder before assigning a slot number.

- [ ] **Apply new manual migrations to a Neon staging/preview branch first, verify, then apply to production.**

  WHY: Migrations applied directly to the production Neon branch cannot be easily rolled back. A mistake in a `NOT NULL` constraint or a missing FK drops the column, locks a table, or causes an immediate production error on next deploy.

- [ ] **Comment-only SQL migrations (e.g. `COMMENT ON TABLE`) are still real migrations and need a slot.**

  WHY: Even though they are zero-risk schema changes, they need a file and a slot number to maintain the migration log and enable future developers to understand the DB history.

---

## 7. Performance Rules

- [ ] **Use `Promise.all()` to parallelise independent DB queries on the same page.**

  WHY: Sequential `await db.select()` calls hold a DB connection per round-trip. On the dashboard page, 6 sequential queries held the connection for ~287ms each. Parallelising with `Promise.all` cut the total to the duration of the slowest query (~82ms). On Neon with a max pool of 5, sequential queries also risk starvation. Pattern: `const [a, b, c] = await Promise.all([query1, query2, query3])`.

- [ ] **The `DATABASE_URL` must point at the Neon pooled endpoint (pgBouncer).**

  WHY: The unpooled endpoint (direct Postgres connection) gives one connection per Vercel function instance. Under concurrency this immediately exhausts Neon's connection limit. The pooled endpoint lets pgBouncer multiplex many function instances over few Postgres connections. The `prepare: false` setting is mandatory with the pooled endpoint.

- [ ] **Never change the Vercel deployment region from `fra1`.**

  WHY: The Vercel function and Neon database are co-located in AWS Frankfurt (eu-central-1). Changing the region adds 80–100ms of DB latency to every request. UAE users already route through Mumbai PoP → Frankfurt function; this adds no meaningful extra latency to users but keeps the DB fast.

- [ ] **Keep `@react-pdf/renderer` in `serverExternalPackages` in `next.config.mjs`.**

  WHY: This package is large (fontkit, pdfkit) and Node-only. Bundling it into the serverless function increases cold start time significantly. `serverExternalPackages` keeps it as a runtime `require()` rather than a webpack bundle.

---

## 8. Code Architecture Rules

- [ ] **Server Actions follow this exact pattern — do not deviate:**

  ```typescript
  export async function myAction(input: unknown) {
    // 1. Auth gate — always first
    const actor = await requireRole(['HR_ADMIN', 'SUPER_ADMIN'])
    // 2. Validate input
    const data = MySchema.parse(input)
    // 3. Business rule comment
    // BR-XX: rule description
    // 4. Write inside transaction with audit
    await db.transaction(async tx => {
      await tx.insert(myTable).values({ ...data, tenantId: TENANT_ID })
      await writeAuditLog({ actorId: actor.id, actorName: actor.name,
        actorRole: actor.role, channel: 'WEB',
        eventType: 'RESOURCE.CREATED', resourceType: 'my_table' }, tx)
    })
    // 5. Revalidate the affected path
    revalidatePath('/relevant-path')
  }
  ```

- [ ] **Never use `translateError()` in a Server Action catch block that returns to a Server Component.**

  WHY: `translateError()` has return type `never` — it always re-throws as an `AppError`. In production Next.js 15, thrown exceptions from Server Actions are sanitised to a generic error message. The client sees nothing. Pattern: catch, `console.error()`, return `{ error: 'Human-readable message' }`.

- [ ] **Cross-module imports must go through the module's `index.ts` barrel.**

  WHY: The barrel is the module's public API. Direct internal imports create hidden coupling — a refactor of an internal helper breaks all direct importers without changing the barrel. Example: `import { getMyProfile } from '@/modules/profile'` (via index.ts), not `import { getMyProfile } from '@/modules/profile/actions'`.

- [ ] **Business rule citations (BR-xx) must appear as inline comments at the point of enforcement.**

  WHY: UAE Labour Law compliance requires traceability from code to legal rule. When an auditor asks "why does this calculation work this way?", the comment tells them which rule applies. Without it, the next developer cannot know whether a change would violate UAE law.


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/12-FILE-OWNERSHIP-MATRIX.md
LINES: 107
================================================================================
# 12 — File Ownership Matrix

> Generated: 2026-06-04.
> Use this matrix to assess risk before modifying any file. Higher-risk files require careful review and regression testing.

---

## Risk Definitions
- **CRITICAL**: A bug here can break production for all users immediately
- **HIGH**: Complex code with many dependents; changes require careful testing
- **MEDIUM**: Moderate complexity; test affected flows before committing
- **LOW**: Self-contained; safe with unit tests passing

---

## Ownership Matrix

| Path Pattern | Module | Safe To Modify | Requires Review | Risk Level | Notes |
|---|---|---|---|---|---|
| `lib/workflow-engine.ts` | Workflow | No — all changes need explicit approval and regression tests | AI/Human review + full collision test suite | CRITICAL | Powers ALL approval flows across leave, hiring, transfer, probation. Any change can break multiple modules simultaneously. Must run `tests/integration/workflow-collision.test.ts` after every change. COLLISION-001 through COLLISION-PROBATION all fixed here. |
| `lib/auth.ts` | Auth | No — changes affect all 119 pages | Human review + security test suite | CRITICAL | requireRole(), MFA step-up gate, HIGH_PRIVILEGE_ROLES constant. A bug here can bypass RBAC for all routes. Must run `tests/security/` after changes. |
| `lib/db.ts` | DB | No — used by every module | Human review | CRITICAL | Drizzle client singleton, pool settings (max:1 for Neon serverless), DbOrTx type export. Changing pool settings affects connection exhaustion at scale. |
| `lib/encryption.ts` | Security | No — handles PII | Human review + security tests | CRITICAL | AES-256-GCM for emirates_id, passport_number, iban. A bug corrupts encrypted PII permanently. |
| `lib/audit.ts` | Audit | With caution | Review + integration tests | HIGH | INSERT-only audit trail. Hard Rule 1: every write must call audit.log() in same transaction. A bug here breaks compliance and audit requirements. |
| `lib/effective-date.ts` | Core HR | With caution | Unit tests required | HIGH | Effective-date pattern (close + open). Never DELETE HR records — this implements the correct pattern. A bug here causes data integrity issues. |
| `modules/absence/actions.ts` | Absence | Yes, with tests | Run absence integration tests | HIGH | Contains ARIA-LOCK advisory lock, backdate policy enforcement, complex leave creation flow. Changes to createLeaveRequest need collision regression tests. |
| `modules/core-hr/actions.ts` | Core HR | Yes, with tests | Run core-hr unit tests | HIGH | Person create/update/list. Cross-module dependency. Any schema changes here ripple to ESS profile, HR admin, org chart. |
| `modules/payroll/` | Payroll | Yes (non-calculation files) | EOSB/GPSSA changes need specialist review | HIGH | `services.ts` (calculateEosb, calculateGpssaContribution) is UAE compliance code — errors cause incorrect payroll. Advisory lock must stay in `actions.ts`. |
| `modules/migration/v2-executor.ts` | Migration | Yes, with migration unit tests | Run `tests/unit/migration-v2-executor.test.ts` | HIGH | detectZeroWriteFailure() must stay. false-success bug was root cause of failed pilot. Any change to phase logic needs regression test V2EX-001–010. |
| `drizzle/schema/foundation.ts` | Database | With extreme caution | Human review + migration SQL | CRITICAL | Core HR tables: persons, positions, departments, worker_assignments, legal_entities. Schema changes require migration SQL. Column removals break backwards compatibility. |
| `drizzle/schema/configuration.ts` | Database | With caution | Human review + migration SQL | HIGH | Workflow templates, leave rules, custom fields, feature permissions, backdate policies. Changes affect MDM module. |
| `drizzle/schema/transactions.ts` | Database | With caution | Human review + migration SQL | HIGH | Payroll runs, leave requests, absence balances, EOSB, GPSSA, DEWS. Active transactional data. |
| `drizzle/schema/workflow-engine.ts` | Database | With extreme caution | Human review + collision tests | CRITICAL | Workflow instances, steps, SLA timers. Connected to workflow-engine.ts. Schema changes can corrupt in-flight approval workflows. |
| `drizzle/migrations/` | Database | New files only | Human review before applying to Neon | HIGH | Never modify an already-applied migration. Write new .sql files only. Apply via Neon SQL Editor (never drizzle-kit). Next slot: 0055. |
| `app/(hr-admin)/payroll/` | Payroll UI | Yes, with tests | Run payroll E2E if available | MEDIUM | UI layer only. Server actions in modules/payroll/actions.ts are the risk; UI changes are lower risk. |
| `app/(hr-admin)/admin/migration/` | Migration UI | Yes, with tests | Review MigrationConsoleV2.tsx changes carefully | MEDIUM | Step 6 status should show 'failed' (not 'warning') when ok=false. Regression tests cover this behavior. |
| `config/workspace-nav.ts` | Navigation | Yes — but ALWAYS update admin-nav.ts too | Check admin-nav.ts is in sync | MEDIUM | Two-file invariant. Adding route to only one file means MANAGER role users lose access. Both files must stay structurally identical. |
| `config/admin-nav.ts` | Navigation | Yes — but ALWAYS update workspace-nav.ts too | Check workspace-nav.ts is in sync | MEDIUM | See above. This serves MANAGER role. workspace-nav.ts serves HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN. |
| `components/layout/WorkspaceRail.tsx` | Navigation | Yes, with care | Visual regression check | MEDIUM | Renders the workspace switcher and secondary nav. Photo URL threading from layout must stay. Changes visible on all HR admin pages. |
| `middleware.ts` | Auth | No — affects all routes | Human review + security tests | CRITICAL | Auth.js session enforcement on every request. x-request-id generation. A bug here can expose all routes or block all authenticated users. |
| `app/api/auth/` | Auth | No | Human review | CRITICAL | Auth.js route handlers. Breaking these blocks all SSO login. |
| `app/api/cron/` | Background Jobs | With caution | Test timing/dedup logic | MEDIUM | workflow-sla and probation-alerts cron handlers. COLLISION-NOTIF dedup must stay in probation-alerts. Test that remindedAt is set atomically. |
| `app/globals.css` (design tokens) | Design System | Yes, tokens only | Visual regression check | LOW | Token values. WCAG AA certified. If changing token values: verify contrast ratios before committing. Never add raw hex colors. |

---

## Cross-Cutting Rules (Apply to All Files)

### Rule 1 — Transaction + Audit (lib/audit.ts, all modules)
Every file that writes to the database must:
```typescript
await db.transaction(async tx => {
  await tx.insert(table).values({...})
  await audit.log(tx, { actor, event, resourceId, newValues })
})
```

### Rule 2 — Role Gating (lib/auth.ts)
Every server action must start with:
```typescript
const session = await auth()
requireRole(session, ['ALLOWED_ROLES'])
```

### Rule 3 — Effective Date (lib/effective-date.ts)
HR records are NEVER deleted. Use close + open pattern:
```typescript
// Close old record: set validTo = today
// Open new record: insert with validFrom = today
```

### Rule 4 — PII Encryption (lib/encryption.ts)
These fields must ALWAYS be encrypted before persisting:
- `emirates_id`
- `passport_number`
- `iban`

### Rule 5 — Bilingual (all UI files)
Every user-facing string must have both `name_en` and `name_ar`.

### Rule 6 — Cross-Module Imports (modules/*/index.ts)
Import from other modules only via their barrel file:
```typescript
// Correct
import { getDepartmentHead } from '@/modules/core-hr'
// Wrong
import { getDepartmentHead } from '@/modules/core-hr/department-head'
```

### Rule 7 — Token-Only CSS (app/globals.css + components)
```css
/* Correct */
color: var(--ink-1);
background: var(--accent-050);

/* Wrong — never raw hex in components */
color: #151A22;
background: #EFF5F6;
```

### Rule 8 — tenant_id on Every Insert
```typescript
await tx.insert(myTable).values({
  ...data,
  tenantId: TENANT_ID,  // '00000000-0000-0000-0000-000000000001'
})
```


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/13-CODEX-START-PROMPT.md
LINES: 156
================================================================================
# 13 — Codex Session Start Prompt

> Copy the block below as the system prompt when starting an OpenAI Codex session on AVANIIS HR.

---

```
You are a senior full-stack engineer working on AVANIIS HR — an AI-native, bilingual (English/Arabic), UAE-compliant Human Capital Management (HCM) platform for Avaniis / Avaniis.

TECH STACK: Next.js 15.3.9 App Router + TypeScript strict | PostgreSQL 16 (Neon eu-central-1 in prod) | Drizzle ORM 0.45.2 | Auth.js v5 + Microsoft Entra ID OIDC | Tailwind CSS + shadcn/ui | pnpm (not npm or yarn)

REJECT IMMEDIATELY if suggested: NestJS · Kafka · Redis · Prisma · TypeORM · Kubernetes · React Native

---

## Critical Invariants (Never Violate These)

1. BILINGUAL: Every user-facing string must have name_en AND name_ar fields. No string is English-only.
2. EFFECTIVE-DATE: HR records are NEVER deleted. Use lib/effective-date.ts (close old record + open new record).
3. TRANSACTION + AUDIT: Every DB write = db.transaction() with audit.log() inside the SAME transaction. No exceptions.
4. TENANT_ID: Every table row requires tenantId: '00000000-0000-0000-0000-000000000001'. Include it explicitly in every insert.
5. PII ENCRYPTION: emirates_id, passport_number, iban must go through lib/encryption.ts before persisting.
6. CSS TOKENS: Use var(--token) in ALL styles. Never raw hex colors. Source: app/globals.css.
7. CROSS-MODULE IMPORTS: Only via modules/*/index.ts barrels. Never import directly from internal module files.

---

## The 7 User Roles

| Role | Level | Notes |
|---|---|---|
| EMPLOYEE | Self-service | ESS: profile, leave, timesheet, payslips |
| MANAGER | Team management | Leave approval, team view |
| PAYROLL_ADMIN | Payroll processing | Payroll runs, WPS filing |
| FINANCE | Finance view | EOSB, payroll reports |
| HR_ADMIN | Full HR operations | All people data, MDM, hiring |
| HR_DIRECTOR | HR leadership | Same as HR_ADMIN + policy config |
| SUPER_ADMIN | System administration | All + users, DataOps, migration factory |

HIGH_PRIVILEGE_ROLES = HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN (require mfaVerified = true).

RBAC pattern:
```typescript
const session = await auth()
requireRole(session, ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
```

---

## Most Critical Files to Understand First

1. lib/workflow-engine.ts — approval flow engine (all workflow transactions)
2. lib/auth.ts — requireRole(), MFA step-up, session types
3. drizzle/schema/foundation.ts — core HR tables (persons, positions, departments)
4. modules/core-hr/actions.ts — person create/update server actions
5. modules/absence/actions.ts — leave creation with advisory lock + backdate policy
6. CLAUDE.md — full project context, current state, all decisions made

---

## Database Migration Gap — CRITICAL

The Drizzle journal only tracks migrations 0000–0039. Migrations 0040–0054 were applied manually via Neon SQL Editor and are NOT in the journal.

DO NOT run: pnpm drizzle-kit migrate (will not apply 0040–0054)
DO NOT run: pnpm drizzle-kit generate (will try to re-generate the gap)

Next available slot: 0055

For new migrations:
1. Write SQL file: drizzle/migrations/0055_description.sql
2. Update Drizzle TypeScript schema: drizzle/schema/relevant-file.ts
3. Apply via Neon Console SQL Editor (paste and execute)
4. Verify, then commit both files

---

## What NOT To Do

- Never hard-delete HR records (use effective-date pattern: close + open)
- Never use translateError() in Server Components (return type never, crashes page render)
- Never put raw hex colors in components (use CSS tokens only)
- Never write sensitive data (SAS URLs, tokens, passwords) to the audit log
- Never create a server action without requireRole() + db.transaction() + audit.log()
- Never add a route to workspace-nav.ts without also updating admin-nav.ts
- Never apply migrations via drizzle-kit
- Never write to process.cwd()/public/uploads on Vercel (use /tmp for ephemeral, cloud for persistent)

---

## Current DB Status (2026-06-04)

Neon production DB has 21 pilot employees from V1 migration with:
- 0 manager links (lineManagerId = null for all 21)
- 0 leave balances (absence_balances empty)
- Org Chart, Leave Requests, Manager Approvals: NOT READY

Next action: Run V2 Migration Factory pilot reload (Step 2 → Step 3 → Steps 4–9).
File: hr_data_migration/UAT/pilot-v2-migration-package.xlsx

---

## Mandatory Server Action Pattern

```typescript
'use server'
import { auth }          from '@/lib/auth'
import { requireRole }   from '@/lib/auth'
import { db }            from '@/lib/db'
import { audit }         from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { MySchema }      from './validations'

export async function myAction(input: unknown) {
  const session = await auth()
  requireRole(session, ['HR_ADMIN'])       // role gate
  const data = MySchema.parse(input)        // Zod validation
  // BR-xx: cite business rule for each write
  await db.transaction(async tx => {
    await tx.insert(myTable).values({ ...data, tenantId: TENANT_ID })
    await audit.log(tx, { actor: session.user, event: 'MY_RESOURCE.CREATED', resourceId: data.id, newValues: data })
  })
  revalidatePath('/hr-admin/my-resource')
}
```

On error: return { error: string } — never throw from server actions.

---

## Test and Build Commands

```bash
pnpm typecheck                        # TypeScript — must be 0 errors
pnpm vitest run tests/unit            # Unit tests
pnpm vitest run tests/integration     # Integration tests (real DB)
pnpm vitest run tests/security        # Security/RBAC tests
pnpm build                            # Next.js production build (0 errors required)
pnpm playwright test --project=hr-admin  # E2E for HR admin flows
```

After any Playwright run: update tests/e2e/e2etestresults.md with a new numbered entry.

---

## Detailed Context

All session history, architectural decisions, and module documentation is in:
docs/project-memory/2026-06-04/

Start with:
- 00-README-HANDOVER.md (orientation)
- 03-CURRENT-STATE.md (exact current codebase state)
- 11-DO-NOT-BREAK-RULES.md (invariants)
- 12-FILE-OWNERSHIP-MATRIX.md (risk assessment before touching files)
```


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/14-CLAUDE-START-PROMPT.md
LINES: 135
================================================================================
# 14 — Claude Code Session Start Prompt

> Use this as the opening message when starting a fresh Claude Code session on AVANIIS HR.
> Copy the block below verbatim.

---

```
You are continuing development on AVANIIS HR — a bilingual (EN/AR), UAE-compliant HCM platform built for Avaniis / Avaniis.

Stack: Next.js 15.3.9 App Router, TypeScript strict, PostgreSQL (Neon), Drizzle ORM 0.45.2, Auth.js v5, pnpm only.

---

## Current State (2026-06-04)

Phase 1 MVP is COMPLETE and QA-certified (production at avaniishcm.vercel.app). However:

- Neon production DB has 21 pilot employees from V1 migration with PARTIAL data:
  - 0 manager links (lineManagerId = null for all 21)
  - 0 leave balances (absence_balances empty)
  - Org Chart, Leave Requests, Manager Approvals: NOT ready
- The V2 Migration Factory false-success bug is FIXED (detectZeroWriteFailure added)
- Document storage production blockers: files still in /tmp (ephemeral); Azure Blob not yet configured

The next action is: Run V2 pilot reload via Data Migration Activity (Step 2 → Step 3 → Steps 4–9).

---

## 5 Most Important Rules

1. Every DB write = db.transaction() + audit.log() in the SAME transaction. No exceptions.
2. HR records are NEVER deleted. Use lib/effective-date.ts (close old, open new).
3. translateError() must NEVER be used in Server Components (page.tsx). It has return type never and crashes the page. Return { error: string } or null instead.
4. workspace-nav.ts and admin-nav.ts must ALWAYS be updated together. They serve different roles and must stay in sync.
5. Use var(--token) for all CSS colors. Never raw hex. WCAG AA certified — do not regress it.

---

## Verify State Before Touching Any File

Run these commands first:

```bash
git log --oneline -3    # confirm you are on commit 7f6821b (Migration Phase D)
git status              # must be clean working tree
pnpm typecheck          # must be 0 errors
```

If typecheck fails before you touch anything: stop and investigate. Do not add changes on top of existing errors.

---

## Migration Situation

The Drizzle journal tracks migrations 0000–0039 ONLY.
Migrations 0040–0054 are manual SQL applied via Neon SQL Editor. They are NOT in _journal.json.

This means:
- pnpm drizzle-kit migrate: DO NOT RUN against Neon (will not apply 0040–0054)
- pnpm drizzle-kit generate: DO NOT RUN (will try to regenerate the 0040–0054 gap)
- New migrations: write SQL file manually, apply via Neon Console SQL Editor
- Next available slot: 0055

WIP migrations (files with _wip_ prefix in drizzle/migrations/): do NOT apply without understanding them first.

---

## Safety Checks Before Modifying Any File

1. Read the file first — understand the full scope before changing anything
2. Check docs/project-memory/2026-06-04/12-FILE-OWNERSHIP-MATRIX.md for risk level
3. For CRITICAL files (lib/workflow-engine.ts, lib/auth.ts, middleware.ts): ask for confirmation before proceeding
4. Run pnpm typecheck after every logical change
5. Write a test for any bug you fix (prevent regression)

---

## 3 Most Dangerous Files to Modify

1. lib/workflow-engine.ts — powers ALL approval flows. A bug breaks leave approvals, hiring, transfer, probation for all users. Every change needs tests in tests/integration/workflow-collision.test.ts.

2. lib/auth.ts — requireRole(), MFA step-up gate. A bug here bypasses RBAC for all 119 pages.

3. drizzle/schema/foundation.ts — core HR tables (persons, positions, departments). Schema changes require migration SQL and can corrupt data if applied incorrectly.

---

## Server Action Pattern (Always Follow)

```typescript
'use server'
import { auth }          from '@/lib/auth'
import { requireRole }   from '@/lib/auth'
import { db }            from '@/lib/db'
import { audit }         from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export async function myAction(input: unknown) {
  const session = await auth()
  requireRole(session, ['HR_ADMIN'])         // 1. Auth gate
  const data = MySchema.parse(input)          // 2. Zod validation
  // BR-xx: business rule citation
  await db.transaction(async tx => {          // 3. Atomic write + audit
    await tx.insert(myTable).values({ ...data, tenantId: TENANT_ID })
    await audit.log(tx, { actor: session.user, event: 'X.CREATED', resourceId: data.id, newValues: data })
  })
  revalidatePath('/path')                     // 4. Revalidate
  // On error: return { error: string } — never throw
}
```

---

## Where to Find Context

All project memory and documentation is in docs/project-memory/2026-06-04/:

- 00-README-HANDOVER.md — orientation, what was done this session
- 01-ARCHITECTURE-OVERVIEW.md — full stack and folder structure
- 02-DATABASE-SCHEMA.md — all 109 tables, key relationships
- 03-CURRENT-STATE.md — exact DB state, test pass matrix, pending tasks
- 04-MIGRATION-FACTORY.md — V2 migration factory, false-success fix, reload sequence
- 05-RBAC-AND-AUTH.md — roles, requireRole(), MFA, session types
- 06-KEY-MODULES.md — module-by-module breakdown
- 07-UI-PATTERNS.md — design tokens, layout patterns, bilingual requirements
- 08-PAYROLL-READINESS.md — payroll module completeness assessment
- 09-AI-SESSION-GUIDE.md — task-specific file loading, known footguns
- 10-NEXT-DEVELOPMENT-PLAN.md — priority order for upcoming work
- 11-DO-NOT-BREAK-RULES.md — invariants that must never be violated
- 12-FILE-OWNERSHIP-MATRIX.md — risk level for every file pattern
- 13-CODEX-START-PROMPT.md — equivalent prompt for Codex sessions

CLAUDE.md in the project root also has the full session history and all decisions made.
```


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/15-VERIFIED-IMPLEMENTATION-MATRIX.md
LINES: 79
================================================================================
# 15 — Verified Implementation Matrix
> Generated: 2026-06-04 | Source: live file inspection of modules/*, app/*, lib/*
> CRITICAL: This document records only what was directly verified from file evidence.
> "Claimed Status" = CLAUDE.md session history. "Verified Status" = actual file content read this session.
> Confidence levels: High = files read, logic verified | Medium = files exist, structure confirmed, logic not deep-read | Low = file exists, minimal content inspected | Needs Verification = file not found or insufficient content

---

## Verification Matrix

| # | Module | Claimed Status | Verified Status | Confidence | Evidence Files | Notes |
|---|--------|--------------|----------------|-----------|---------------|-------|
| 1 | **Core HR — Person CRUD** | Complete | Verified Complete | High | `modules/core-hr/actions.ts` (createPerson, getPerson, listPersons, updatePerson), `validations.ts` (CreatePersonSchema, UpdatePersonSchema, WorkerCategory, BloodType), `edit-person.ts`, `services.ts` | 18 top-level exports confirmed in barrel; all sub-modules listed in index.ts |
| 2 | **Core HR — Contracts** | Complete | Verified Complete | Medium | `modules/core-hr/contracts/actions.ts` (createContract, amendContract, terminateContract), `validations.ts`, `services.ts` (deriveNoticePeriodDays) | Barrel exports confirmed; logic not deep-read |
| 3 | **Core HR — Worker Assignments** | Complete | Verified Complete | Medium | `modules/core-hr/worker-assignments/actions.ts` (createWorkerAssignment, changeWorkerAssignment), `work-schedule-assignment-actions.ts` (assignWorkSchedule, correctWorkScheduleAssignment, getWorkScheduleAssignmentHistory) | Barrel exports confirmed |
| 4 | **Core HR — Bank Details + Dependents** | Complete | Verified Complete | Medium | `modules/core-hr/bank-details/actions.ts` (createBankDetails, getBankDetails, selfServiceUpdateBankDetails), `dependents/actions.ts` (addDependent) | Barrel exports confirm encryption-aware actions |
| 5 | **Core HR — Documents** | Complete (UAT) / Blocked (Prod) | Verified Partial | High | `modules/core-hr/documents/actions.ts` (uploadPersonDocument, uploadMyDocument, getDocumentUrl, listPersonDocuments, updateMyDocumentMeta, deleteMyDocument, DocumentUrlResult type), `app/api/documents/[id]/route.ts` exists, `lib/storage/providers/azure.ts`, `aws.ts`, `local.ts`, `factory.ts` | 5 production blockers confirmed; Azure/S3 env vars not set |
| 6 | **Core HR — Org Chart Actions** | Complete | Verified Complete | Medium | `modules/core-hr/org-chart-actions.ts` exists; `lib/org-chart/build-tree.ts`, `types.ts`, `chart-events.ts`, `export.ts` all confirmed present | Barrel does not re-export org-chart-actions (consumed directly by app layer) |
| 7 | **Core HR — Probation + Exit Clearance** | Complete | Verified Complete | Medium | `modules/core-hr/probation/` (confirmProbation, ConfirmProbationInput), `exit-clearance/actions.ts` (completeOffboardingItem, waiveOffboardingItem) | Barrel exports confirmed; app pages `admin/probation/page.tsx` and `admin/exit-clearance/` verified |
| 8 | **Core HR — Bulk Import** | Complete | Verified Complete | Medium | `modules/core-hr/bulk-import/` barrel exports: validateImportFile, confirmImport, getTemplateRefData, EMPLOYEE_HEADERS, all type exports | Internal helpers not re-exported (by design — avoids Node.js-only deps in client) |
| 9 | **Core HR — Department Head** | Complete | Verified Complete | High | `modules/core-hr/department-head.ts` (getDepartmentHead, DepartmentHead type), migration `0054_department_work_schedule.sql` confirmed applied | CLAUDE.md: migration applied to Neon, `idx_departments_work_schedule` verified 2026-06-01 |
| 10 | **Leave / Absence — Core** | Complete | Verified Complete | High | `modules/absence/actions.ts` (createLeaveRequest, submitLeaveRequest, getLeaveRequest, listLeaveRequests, cancelLeaveRequest, decideLeaveRequest, saveLeaveRuleSet, requestDisabilityParentalAccommodation, getLeaveHistoryForEmployee, uploadLeaveMedicalCert), `services.ts`, `types.ts`, `validations.ts` | All barrel exports confirmed; advisory lock and backdate policy confirmed in file |
| 11 | **Leave — Backdate Policy** | Complete (enterprise-hardened) | Verified Complete | High | `modules/absence/backdate-policy-actions.ts` (listBackdatePolicies, resolveBackdatePolicy, upsertBackdatePolicy, BackdatePolicyRow), `validations.ts` (UpsertBackdatePolicySchema), migrations 0047+0048 confirmed applied | PERSON_NOT_FOUND throw, no fallback to caller entity — confirmed in CLAUDE.md; BDP-011 + BDPAR-001–004 tests added |
| 12 | **Leave — Plan Enrolment** | Complete | Verified Complete | Medium | `modules/absence/leave-plan-enrolment-actions.ts` (enrolPersonInLeavePlan, correctLeavePlanEnrolment, getLeavePlanEnrolmentHistory) | Barrel exports confirmed |
| 13 | **Workflow Engine** | Complete (collision-hardened) | Verified Complete | High | `lib/workflow-engine.ts` (submitWorkflow, takeWorkflowAction, previewWorkflow, processSLABreaches — all exported via `modules/workflow/index.ts`); `modules/workflow/actions.ts` (triggerTransferApproval, triggerPromotionApproval, triggerTerminationApproval, triggerProbationConfirmationWorkflow, triggerExitClearanceWorkflow); `modules/workflow/queries.ts` (getPendingApprovalsV2, getWorkflowInstanceDetailV2, getMyWorkflowRequests, etc.) | 5 collision fixes confirmed (P2–P6E); DbOrTx param threading confirmed; COLLISION-PROBATION fix in probation/workflow-actions.ts |
| 14 | **Notifications** | Complete | Verified Complete | High | `modules/notification/actions.ts` (markNotificationRead), `topbar-actions.ts` (getMyNotifications, getUnreadCount, markAllRead, getApprovalDetail, approveRequest, rejectRequest, requestInfo, getPreferences, updatePreferences), `schema.ts`, `services.ts`, `types.ts`, `validations.ts` | Barrel exports confirmed; Postgres outbox confirmed; node-cron process-driver confirmed in `lib/jobs/process-driver.ts` |
| 15 | **Employee Letters** | Complete | Verified Complete | High | `modules/employee-letters/`: `actions.ts`, `email.ts`, `engine.ts`, `generate-pdf.ts`, `pdf-template.tsx`, `pdf-react-template.tsx`, `preflight.ts`, `queries.ts`, `resolvers.ts`, `translate.ts` — all 10 files confirmed present; barrel `export * from` all 6 sub-modules | jsPDF 4.2.1 (LFI CVE fix), DOMPurify confirmed; SUBMITTED/FAILED status lifecycle confirmed in CLAUDE.md; migration 0053 applied |
| 16 | **Medical Insurance** | Complete | Verified Complete | High | `modules/insurance/actions.ts` (getInsurancePlans, createInsurancePlan, enrolEmployee, enrolDependent, updateEnrolmentCard, cancelEnrolment, extendEnrolmentExpiry, grantContractorInsuranceException, getPersonEnrolments, getActiveEnrolment), `lifecycle.ts` (enrolEmployeeTx, enrolDependentTx, cancelEnrolmentTx, changePlanTx, getPolicySettingsTx), `eligibility.ts` (resolveEligiblePlan, checkDependentAgeEligibility), `validations.ts` | All 6 files confirmed; insurer API integration is Phase 3 only |
| 17 | **Timesheets** | Complete | Verified Complete | Medium | `modules/timesheets/actions.ts`, `schema.ts`, `services.ts`, `types.ts`, `validations.ts` — all 5 files confirmed; barrel re-exports all 3; pages: `app/(hr-admin)/timesheets/page.tsx`, `timesheets/team/page.tsx`, `app/(hr-admin)/my-timesheet/page.tsx`, `app/(employee)/me/timesheet/page.tsx` | Logic not deep-read; Ramadan schedule and overtime logic claimed complete in CLAUDE.md |
| 18 | **ARIA / AI Assistant** | Complete | Verified Complete | High | `modules/aria/`: `actions.ts` (sendAriaMessage, generateDailyBriefing), `config-actions.ts` (getAriaConfig, updateAgentIdentity, updateAriaBranding, updateModelConfig, updateBehaviourConfig, uploadKnowledgeSource, deleteKnowledgeSource, testAriaConnection), `approval-queries.ts`, `employee-context.ts`, `os-actions.ts`, `people-queries.ts`, `workflow-queries.ts`, `leave-recommendation.ts`, `intents/` sub-directory, `schema.ts`, `services.ts`, `types.ts`, `validations.ts` — all 14 files/dirs confirmed | Graceful failure handling, ARIA OS, 4 org chart intents confirmed in CLAUDE.md |
| 19 | **Payroll** | Complete (schema+UI); UAE integration depth unverified | Verified Partial | Medium | `modules/payroll/actions.ts`, `calculation-engine.ts`, `services.ts` (calculateEosb, calculateGpssaContribution, determineSuspensionPayTreatment), `validations.ts`, `queries.ts`, `schema.ts`, `payroll-assignment-actions.ts` — all 8 files confirmed + `index.ts`; 7 pages confirmed | Advisory lock (RISK-PAYROLL-2) confirmed in CLAUDE.md; WPS file format compliance and GPSSA/DEWS end-to-end not independently verified this session |
| 20 | **Reports / Analytics** | Complete | Verified Complete | High | `modules/reports/queries.ts` (getHRAdminDashboardData, getManagerDashboardData, getHRDirectorDashboardData, getFinanceDashboardData, getEmployeeDashboardData), `index.ts` confirmed barrel; `app/(hr-admin)/reports/page.tsx`, `reports/insurance/page.tsx`, `app/(hr-admin)/dashboard/page.tsx` — all confirmed | Promise.all parallelisation for dashboard confirmed (GEO-OPT-001) |
| 21 | **Audit Trail** | Complete | Verified Complete | High | `modules/audit/schema.ts`, `types.ts` — barrel confirmed; `lib/audit.ts` is the write path (called from within transactions, not re-exported via module barrel by design) | INSERT-only pattern confirmed; migration 0057_wip_audit_immutability.sql EXISTS but is NOT applied to Neon — WIP status |
| 22 | **RBAC / Access Control** | Complete (MFA shipped) | Verified Complete | High | `lib/auth.ts` (getCurrentUser, requireRole, HIGH_PRIVILEGE_ROLES, mfaVerified JWT claim), `middleware.ts`, `modules/access/actions.ts` — confirmed; `app/(hr-admin)/access/feature-permissions/page.tsx`, `app/(hr-admin)/users/page.tsx`, `app/(hr-admin)/users/new/page.tsx` — confirmed | MFA step-up `=== false` strict guard confirmed in CLAUDE.md; 180/180 security tests pass |
| 23 | **Master Data (MDM)** | Complete | Verified Complete | High | 12 pages confirmed: `master-data/legal-entities/`, `departments/`, `positions/`, `grades/`, `locations/`, `business-units/`, `jobs/`, `projects/`, `work-schedules/`, `leave-types/`, `holiday-calendars/`, `master-data/page.tsx`; `modules/config/` confirmed (8 files including `guards.ts`); `lib/config-resolver.ts` present | Department Head + Work Schedule (migration 0054) applied; MdmDrawer WAI-ARIA focus trap confirmed (CB-BUG-002) |
| 24 | **Settings / Configuration** | Complete | Verified Complete | High | 16 settings pages confirmed: `settings/absence-types/`, `ai-agent/`, `appearance/`, `branding/`, `compliance/`, `currency-setup/`, `custom-fields/`, `delegations/`, `document-branding/`, `employee-numbers/`, `form-layout/`, `insurance-plans/`, `insurance-policy/`, `leave-rules/`, `letter-templates/`, `notifications/`, `permissions/`, `policy/`, `work-schedules/`; 4 workflow config pages confirmed | 19+ settings pages confirmed (some overlap between settings/ and configuration/) |
| 25 | **Org Chart** | Complete (Tasks A-G) | Verified Complete | High | `lib/org-chart/build-tree.ts`, `types.ts`, `chart-events.ts`, `export.ts` — all 4 confirmed; `components/org-chart/` confirmed; `modules/core-hr/org-chart-actions.ts` confirmed; `app/(hr-admin)/org-chart/page.tsx` confirmed; `modules/aria/intents/` sub-directory confirmed | Hiring/transfer uniqueness constraints (COLLISION-004/004B) applied via migrations 0041+0042 |
| 26 | **ESS Self-Service** | Complete | Verified Complete | High | 19 ESS pages confirmed: `app/(employee)/me/page.tsx`, `home/`, `profile/`, `leave/`, `payslips/`, `documents/`, `letters/`, `insurance/`, `timesheet/`, `aria/`, `bank-details/`, `directory/`, `directory/[id]/`, `requests/`, `requests/[requestId]/`, `requests/probation/`, `accommodations/` | Navigation reorder (Task 2F) confirmed; photo in 7 surfaces (Task 2E) confirmed; employment fields (Task 2C) confirmed |
| 27 | **Migration Factory V2** | Partial (false-success bug fixed 2026-06-04; pilot not yet reloaded) | Verified Partial | High | `modules/migration/`: all 16 files confirmed including `v2-executor.ts`, `v2-actions.ts`, `v2-validator.ts`, `v2-package-parser.ts`, `v2-dry-run.ts`, `v2-types.ts`, `source-actions.ts`, `source-classifier.ts`, `source-transformer.ts`, `package-store.ts`; `app/(hr-admin)/admin/migration/page.tsx` confirmed | DB state: 21 employees, 0 manager links, 0 leave balances — confirmed not reloaded; detectZeroWriteFailure() fix confirmed in CLAUDE.md |
| 28 | **DataOps Console** | Complete | Verified Complete | Medium | `app/(hr-admin)/admin/dataops/page.tsx` confirmed; `app/api/dataops/` directory structure confirmed in CLAUDE.md | SUPER_ADMIN gating confirmed; logic not deep-read |
| 29 | **Compliance (UAE Labour Law)** | Complete | Verified Complete | Medium | `modules/compliance/actions.ts`, `schema.ts`, `services.ts`, `types.ts`, `validations.ts` — all 5 files confirmed; `app/(hr-admin)/settings/compliance/page.tsx` confirmed | 57 BR-xx rules referenced throughout codebase; logic not deep-read |
| 30 | **Observability** | Complete | Verified Complete | High | `lib/logger.ts` (structured JSON, PII redaction), `lib/telemetry.ts` (startTimer, withTiming, buildServerTiming, 6 NFR thresholds), `middleware.ts` (x-request-id), `app/api/health/route.ts`, `app/api/health/db/route.ts` — all confirmed present | 48 unit tests OBS-001–045; 26 alert pattern tests ALT-001–018; setup-log-drain.mjs script |
| 31 | **Cloud Storage Abstraction** | Complete | Verified Complete | High | `lib/storage/providers/azure.ts`, `aws.ts`, `local.ts`, `factory.ts`, `types.ts` — all 5 files confirmed; `lib/blob-storage.ts` confirmed as thin delegator wrapper | Production guard (throws if NODE_ENV=production + no provider) confirmed; 30 unit tests SPR-001–030 |
| 32 | **Notification (ARIA module integration)** | Complete | Verified Complete | Medium | `modules/aria/index.ts` exports `approveRequest, rejectRequest` from `@/modules/notification` — cross-module re-export confirmed | Shows notification module is consumed by ARIA module correctly |

---

## Summary by Confidence Level

| Confidence | Count | Modules |
|-----------|-------|---------|
| **High** | 19 | Core HR Person CRUD, Core HR Documents, Core HR Dept Head, Leave Core, Leave Backdate Policy, Workflow Engine, Notifications, Employee Letters, Insurance, ARIA, Reports, Audit, RBAC, MDM, Settings, Org Chart, ESS, Migration V2, Observability, Cloud Storage |
| **Medium** | 12 | Core HR Contracts, Core HR Worker Assignments, Core HR Bank/Dependents, Core HR Org Chart Actions, Core HR Probation/Exit, Core HR Bulk Import, Leave Plan Enrolment, Timesheets, Payroll, DataOps Console, Compliance, ARIA-Notification integration |
| **Low** | 0 | None |
| **Needs Verification** | 0 | None — all claimed modules have at least files present |

---

## Modules with Partial Status

| Module | What is verified | What needs verification |
|--------|----------------|------------------------|
| **Document Storage (production)** | Local/tmp provider works; Azure+S3 code exists; migration 0051 applied | Azure/S3 end-to-end: signed URL generation, file persistence, HA-* Playwright tests |
| **Payroll** | Schema, services (EOSB/GPSSA/DEWS functions), 7 pages, advisory lock | WPS file format compliance; GPSSA/DEWS deduction in actual run; payslip display with real data |
| **Migration Factory V2** | All 16 files present; false-success fix applied; 10 regression tests pass | Pilot reload with `detectZeroWriteFailure()` active; Steps 4-9 end-to-end with real XLSX |
| **Audit Immutability** | `audit_log` INSERT-only confirmed in `lib/audit.ts` pattern | Migration `0057_wip_audit_immutability.sql` exists but is NOT applied — unclear if it adds triggers or constraints beyond what `lib/audit.ts` already enforces |

---

## WIP Migrations — Verification Status

| File | Applied to Neon? | Referenced by Code? | Action |
|------|-----------------|-------------------|--------|
| `0055_payroll_run_number_per_entity.sql` | No | Unknown | Audit before applying |
| `0055_wip_step_instance_columns.sql` | No | Unknown | Audit before applying |
| `0056_wip_notification_queue_meta.sql` | No | Unknown | Audit before applying |
| `0057_wip_audit_immutability.sql` | No | Unknown | Audit before applying |
| `0060_wip_intelligence_view.sql` | No | Unknown | Audit before applying (view only, likely safe) |
| `0061_absence_type_requires_balance.sql` | No | Unknown | Audit before applying — may affect absence type data |


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/16-DEPENDENCY-GRAPH.md
LINES: 314
================================================================================
# 16 — Dependency Graph
> Generated: 2026-06-04 | Source: live inspection of module barrels, lib/ imports, and barrel re-exports
> This graph shows the actual dependency structure derived from verified file evidence.
> Hard Rule 6: cross-module imports MUST go through module index.ts barrels only.

---

## 1. Visual Dependency Tree

```
                        ┌─────────────────────────────────────────────────────┐
                        │            CROSS-CUTTING SERVICES (lib/)             │
                        │  lib/db.ts  lib/auth.ts  lib/audit.ts  lib/encryption.ts  │
                        │  lib/effective-date.ts  lib/workflow-engine.ts        │
                        │  lib/logger.ts  lib/telemetry.ts  lib/storage/*      │
                        └─────────────────────────────────────────────────────┘
                                             │ (all modules depend on these)
                                             │
                ┌────────────────────────────┼────────────────────────────────┐
                │                            │                                │
        ┌───────▼──────┐            ┌────────▼──────────┐           ┌────────▼──────┐
        │  modules/    │            │  modules/workflow  │           │ modules/      │
        │  audit       │            │  (+ lib/workflow-  │           │ notification  │
        │ (schema only)│            │   engine.ts)       │           │               │
        └───────┬──────┘            └────────┬──────────┘           └────────┬──────┘
                │ (used by all)               │ (used by many)                │ (used by many)
                │                            │                                │
        ┌───────▼──────────────────────────────────────────────────────────────▼─────┐
        │                          modules/core-hr                                    │
        │   persons · contracts · worker-assignments · bank-details · dependents      │
        │   documents · employment-actions · exit-clearance · probation              │
        │   org-chart-actions · department-head · bulk-import · photo-upload         │
        └───────────────────────────────────────────────────────────────────────────┘
                │                    │                    │                    │
        ┌───────▼──────┐   ┌─────────▼──────┐   ┌────────▼───────┐  ┌────────▼──────┐
        │  modules/    │   │  modules/       │   │  modules/      │  │  modules/     │
        │  absence     │   │  payroll        │   │  insurance     │  │  timesheets   │
        └───────┬──────┘   └─────────┬──────┘   └────────┬───────┘  └───────────────┘
                │                    │                    │
        ┌───────▼──────┐   ┌─────────▼──────┐            │
        │  modules/    │   │  modules/       │            │
        │  employee-   │   │  reports        ◄────────────┘
        │  letters     │   │  (read-only)    │
        └───────┬──────┘   └────────────────┘
                │
        ┌───────▼──────────────────────────────────────────────────────────────────┐
        │                          modules/aria                                     │
        │   Claude API · intent resolvers · ARIA OS · employee/manager context     │
        │   (reads from: core-hr, absence, workflow, notification, compliance)      │
        └───────────────────────────────────────────────────────────────────────────┘
                │
        ┌───────▼──────────────────────────────────────────────────────────────────┐
        │                     App Layer (app/ route groups)                         │
        │   (hr-admin)/ · (employee)/me/ · (signing)/ · (auth)/                   │
        │   api/aria/chat/ · api/documents/ · api/dataops/ · api/cron/ · api/health│
        └───────────────────────────────────────────────────────────────────────────┘

        ┌─────────────────────────────────────────────────────────────────────────┐
        │               modules/migration (STANDALONE — no dependents)             │
        │   depends on: modules/core-hr (importEmployeesTx), lib/db, lib/auth,    │
        │   lib/audit; NOT depended on by any other module                         │
        └─────────────────────────────────────────────────────────────────────────┘

        ┌─────────────────────────────────────────────────────────────────────────┐
        │               modules/config (MDM configuration)                         │
        │   depends on: lib/db, lib/auth, lib/audit                               │
        │   depended on by: modules/core-hr (via lib/config-resolver.ts)          │
        └─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Module Dependency Table

| Module | Depends On | Required By |
|--------|-----------|------------|
| **lib/db** (Drizzle client) | PostgreSQL, Neon | Every module and lib file that touches DB |
| **lib/auth** (Auth.js + OIDC) | Auth.js v5, Azure Entra ID, `lib/db` | Every module (requireRole called in all server actions) |
| **lib/audit** | `lib/db` | Every module that writes data (Hard Rule 1) |
| **lib/encryption** (AES-256-GCM) | Node.js crypto | `modules/core-hr` (bank-details, dependents), any PII write |
| **lib/effective-date** | `lib/db` | `modules/core-hr` (contracts, assignments, grades) |
| **lib/workflow-engine** | `lib/db`, `lib/audit`, `modules/notification` | `modules/workflow`, `modules/absence`, `modules/core-hr/probation`, `modules/core-hr/org-chart-actions` |
| **lib/config-resolver** | `lib/db` | `modules/core-hr`, `modules/absence`, `modules/workflow` |
| **lib/storage** (factory + providers) | Azure SDK / AWS SDK / Node.js fs | `modules/core-hr/documents`, `modules/core-hr/photo-upload`, `lib/blob-storage` |
| **lib/logger** | Node.js | `modules/aria` (ARIA API), `lib/jobs/process-driver`, `app/api/cron/*`, `app/api/health/*` |
| **lib/org-chart** (build-tree, types, chart-events, export) | `lib/db`, `@xyflow/react` | `modules/core-hr/org-chart-actions`, `components/org-chart/*`, `modules/aria/intents` |
| **modules/audit** | `lib/db` (schema only) | All modules (via `lib/audit.ts` write path) |
| **modules/notification** | `lib/db`, `lib/audit` | `modules/workflow` (dispatch calls), `modules/aria` (approveRequest/rejectRequest re-export), `modules/core-hr/probation` |
| **modules/config** | `lib/db`, `lib/audit`, `lib/config-resolver` | `modules/core-hr` (department actions), `modules/absence` (leave rule resolution), app settings pages |
| **modules/compliance** | `lib/db`, `lib/auth` | `modules/aria` (getComplianceData in os-actions) |
| **modules/core-hr** | `lib/db`, `lib/auth`, `lib/audit`, `lib/encryption`, `lib/effective-date`, `lib/storage`, `lib/org-chart`, `lib/config-resolver`, `modules/workflow`, `modules/notification` | `modules/absence`, `modules/payroll`, `modules/insurance`, `modules/timesheets`, `modules/employee-letters`, `modules/aria`, `modules/migration`, `modules/reports`, all `app/(hr-admin)` pages |
| **modules/workflow** | `lib/workflow-engine`, `lib/db`, `lib/audit`, `modules/notification` | `modules/absence` (submitLeaveRequest), `modules/core-hr/employment-actions`, `modules/core-hr/probation`, `modules/core-hr/org-chart-actions`, `modules/aria` (approval queries) |
| **modules/absence** | `modules/core-hr`, `modules/workflow`, `modules/notification`, `lib/db`, `lib/audit`, `lib/leave-rule-resolver`, `lib/leave-person-scope`, `lib/absence-cert-policy` | `modules/aria` (leave recommendation, approval queries), `modules/employee-letters` (leave-related letters), app absence pages, ESS leave pages |
| **modules/payroll** | `modules/core-hr`, `modules/workflow`, `lib/db`, `lib/audit` | `modules/aria` (people intelligence, briefing), `modules/reports`, app payroll pages, ESS payslips |
| **modules/insurance** | `modules/core-hr`, `lib/db`, `lib/audit` | `modules/aria` (expiry alerts in os-actions), `modules/reports`, app insurance pages, ESS insurance page |
| **modules/timesheets** | `modules/core-hr`, `lib/db`, `lib/auth` | `modules/aria` (context), app timesheet pages, ESS timesheet page |
| **modules/employee-letters** | `modules/core-hr`, `modules/workflow`, `lib/db`, `lib/audit`, `lib/encryption` | `modules/aria` (briefing), app employee-letters pages, ESS letters page, signing routes |
| **modules/aria** | `modules/core-hr`, `modules/absence`, `modules/payroll`, `modules/workflow`, `modules/notification`, `modules/compliance`, `modules/insurance`, `lib/logger`, Anthropic Claude API | App `(hr-admin)/aria/`, `(employee)/me/aria/`, `api/aria/chat/`, `modules/notification` (re-exports approveRequest/rejectRequest) |
| **modules/reports** | `modules/core-hr`, `modules/absence`, `modules/payroll`, `modules/insurance`, `lib/db` | App `(hr-admin)/reports/`, `(hr-admin)/dashboard/` |
| **modules/migration** | `modules/core-hr` (importEmployeesTx, bulk-import), `lib/db`, `lib/auth`, `lib/audit` | Nothing — leaf module (no other module imports from migration) |
| **modules/profile** | `modules/core-hr`, `lib/db`, `lib/auth` | App `(hr-admin)/my-profile/`, `(employee)/me/profile/` |
| **modules/directory** | `modules/core-hr`, `lib/db`, `lib/auth` | App `(hr-admin)/directory/`, `(employee)/me/directory/` |
| **modules/access** | `lib/db`, `lib/auth`, `lib/audit` | App `(hr-admin)/access/feature-permissions/`, `(hr-admin)/users/` |
| **modules/workflow-intelligence** | `modules/workflow`, `lib/db` | App `(hr-admin)/admin-preview/` (likely), analytics features |

---

## 3. Core Modules (everything depends on them)

These are the foundation — a bug here cascades to all dependents:

```
TIER 0 — DB + Auth (most foundational):
  lib/db.ts                  ← Drizzle client; every module that touches Postgres
  lib/auth.ts                ← requireRole(); called in every server action
  lib/audit.ts               ← audit.log(); called in every write transaction (Hard Rule 1)

TIER 1 — Cross-cutting lib:
  lib/encryption.ts          ← AES-256-GCM; PII fields everywhere
  lib/effective-date.ts      ← close+open record pattern; contracts, assignments, grades
  lib/workflow-engine.ts     ← approval engine; absence, org-chart, employment, payroll
  lib/config-resolver.ts     ← leave rules, workflow rules, form configs

TIER 2 — Core domain module:
  modules/core-hr            ← persons, positions, assignments; depended on by 9+ modules
  modules/notification       ← outbox; depended on by workflow, aria, probation
  modules/workflow            ← approval engine wrapper; depended on by absence, payroll, letters
```

---

## 4. Leaf Modules (no other modules depend on them)

These are safe to modify with lower blast radius:

| Module | Why it is a leaf |
|--------|----------------|
| `modules/migration` | No other module imports from it; it consumes core-hr but nothing consumes it |
| `modules/reports` | Read-only aggregation queries; no writes, no side effects on other modules |
| `modules/profile` | Thin wrapper around core-hr for ESS profile page; not imported by any other module |
| `modules/directory` | Employee directory lookup; read-only, not imported by other modules |
| `modules/access` | RBAC management UI; RBAC enforcement is in `lib/auth.ts`, not this module |
| `modules/timesheets` | Standalone daily entry; only consumed by app layer and ARIA context |
| `modules/compliance` | Rules data; only consumed by ARIA os-actions |
| `modules/workflow-intelligence` | Analytics; only consumed by app layer |

---

## 5. Migration Factory Specific Dependencies

```
modules/migration
├── depends on:
│   ├── modules/core-hr/bulk-import  (importEmployeesTx — the actual employee INSERT)
│   ├── lib/db                       (direct DB queries for Phase 2-4 writes)
│   ├── lib/auth                     (requireRole SUPER_ADMIN in v2-actions.ts)
│   ├── lib/audit                    (writeAuditLog in executor)
│   └── @/drizzle/schema             (absenceBalances, departments direct table refs)
│
├── internal pipeline:
│   source-classifier.ts → source-transformer.ts → package-store.ts → source-actions.ts
│   v2-package-parser.ts → v2-validator.ts → v2-dry-run.ts → v2-executor.ts
│   seed-actions.ts (Step 2 Clear + Step 3 Seed)
│   branch-safety.ts (Step 1 Environment Check)
│
└── consumed by:
    app/(hr-admin)/admin/migration/page.tsx (ONLY consumer)
    app/(hr-admin)/admin/migration/MigrationConsoleV2.tsx

CRITICAL CONSTRAINT: v2-dry-run.ts must NOT import lib/db.ts
    Reason: dry-run is called from client-side rendering path;
    lib/db.ts is a Node.js-only module that would break client bundle.
    buildDryRunSummary() is pure computation only.
```

---

## 6. Payroll-Specific Dependencies (Most Complex)

```
modules/payroll
├── depends on:
│   ├── modules/core-hr             (person data, worker assignments, positions)
│   ├── modules/workflow            (payroll approval routing)
│   ├── lib/db                      (payroll run queries, pg_advisory_xact_lock)
│   ├── lib/audit                   (every payroll write)
│   └── @/drizzle/schema            (payroll_runs, payroll_lines, salary_elements, etc.)
│
├── internal structure:
│   services.ts        → calculateEosb(), calculateGpssaContribution(), determineSuspensionPayTreatment()
│   calculation-engine.ts → salary element aggregation
│   validations.ts     → Zod schemas for all payroll inputs
│   queries.ts         → read-side payroll queries
│   actions.ts         → write-side: createPayrollRun (with advisory lock), etc.
│   payroll-assignment-actions.ts → assignToPayroll(), correctPayrollAssignment()
│
├── consumed by:
│   modules/aria       (generateDailyBriefing, getPeopleIntelligence)
│   modules/reports    (getFinanceDashboardData)
│   app/(hr-admin)/payroll/ (7 pages)
│   app/(employee)/me/payslips/ (ESS payslip view)
│
└── UAE-specific risk:
    calculateEosb()          → End of Service Benefit (UAE Labour Law Art. 51)
    calculateGpssaContribution() → UAE national employees only (GPSSA scheme)
    determineSuspensionPayTreatment() → suspension/disciplinary scenarios
    WPS export               → UAE Ministry of Labour file format (SIF)
    DEWS                     → Dubai Employee Workplace Savings (DIFC employees)
    ADVISORY LOCK: pg_advisory_xact_lock(hashtext('payroll_run:' || entityId))
                   acquired inside db.transaction before nextRunNumber MAX query
```

---

## 7. Cross-Cutting Concerns

### Authentication & Authorization
```
lib/auth.ts
├── getCurrentUser()     → reads JWT from Auth.js session
├── requireRole()        → FORBIDDEN throw if role not in allowed list
│                          STEP_UP_REQUIRED throw if mfaVerified === false (strict)
│                          for HIGH_PRIVILEGE_ROLES (HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN)
├── HIGH_PRIVILEGE_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
├── isDevSession()       → bypasses MFA check in development only
└── Used by: EVERY server action in every module

middleware.ts
├── Enforces Auth.js session on all routes except /sign-in, /api/health/*
└── Injects x-request-id header for request correlation
```

### Audit Trail
```
lib/audit.ts  (write path)
├── audit.log(tx, event, resourceId, actorId, metadata)
├── MUST be called inside db.transaction() (Hard Rule 1)
├── INSERT-only — never UPDATE or DELETE audit_log rows
└── Used by: every module that writes data

modules/audit (read path)
├── schema.ts  → audit_log table definition
├── types.ts   → AuditEntry, AuditEventType
└── Read by: modules/aria (getAuditLogEntries in os-actions), DataOps console
```

### Encryption (PII Fields)
```
lib/encryption.ts
├── encrypt(plaintext) → AES-256-GCM ciphertext
├── decrypt(ciphertext) → plaintext
├── PII fields ALWAYS encrypted before DB insert:
│   - persons.emirates_id
│   - persons.passport_number
│   - bank_details.iban
│   - dependents.emirates_id
│   - dependents.passport_number
└── FIELD_ENCRYPTION_KEY env var — 32-byte hex; NEVER committed
```

### Notification Outbox
```
modules/notification
├── notification_log table (Postgres outbox)
├── lib/jobs/process-driver.ts → node-cron polls every minute
├── DUPLICATE GUARD: probation-alerts cron checks 24h window before insert
├── Consumed by:
│   - lib/workflow-engine.ts (dispatch notifications on action)
│   - modules/core-hr/probation (probation outcome notifications)
│   - modules/aria (re-exports approveRequest/rejectRequest for topbar actions)
└── Email delivery via SMTP outbox pattern (at-least-once)
```

### Bilingual (EN/AR) Requirement
```
Hard Rule 4: every user-facing string needs name_en AND name_ar
Applies to:
├── All MDM entities (departments, positions, grades, leave types, etc.)
├── Error messages from server actions (EN · AR format)
├── Workflow notifications
├── Employee letters (bilingual PDF)
└── Leave backdate policy errors (BACKDATE_POLICY_MISSING contains ` · `)

translateError() in lib/app-error.ts:
├── Strips error prefix (e.g. "BACKDATE_NOT_ALLOWED:")
└── Returns full remaining body (may include " · " bilingual separator)
```

---

## 8. Risk Propagation Matrix

If module X breaks, which modules are affected?

| Broken Module | Direct Impact | Cascade Impact | Severity |
|--------------|--------------|---------------|---------|
| **lib/db** | ALL modules fail | Entire application down | CATASTROPHIC |
| **lib/auth** | ALL server actions return FORBIDDEN | Entire application inaccessible | CATASTROPHIC |
| **lib/audit** | All write transactions fail (audit.log() inside transaction) | ALL modules that write data | CATASTROPHIC |
| **lib/workflow-engine** | Leave requests cannot be submitted; approvals cannot be actioned; probation cannot be confirmed; employment actions blocked | modules/absence, modules/core-hr/employment-actions, modules/core-hr/probation, modules/core-hr/org-chart-actions, modules/payroll (approval), modules/employee-letters (approval) | CRITICAL |
| **lib/encryption** | Bank details, dependent EID/passport, emirates_id encrypt/decrypt fails | modules/core-hr/bank-details, modules/core-hr/dependents, all PII reads for these fields | CRITICAL |
| **modules/core-hr** | Person data unavailable | modules/absence (leave requests require person), modules/payroll (payroll requires person), modules/insurance (enrolment requires person), modules/aria (context requires person), modules/migration, ESS | CRITICAL |
| **modules/workflow** | Approval workflows cannot be submitted or actioned | modules/absence (leave submission), modules/core-hr/employment-actions (transfer/promotion), modules/employee-letters (letter approval), modules/org-chart-actions (hiring/transfer drawers) | HIGH |
| **modules/notification** | Notifications not sent; approval topbar actions (approveRequest/rejectRequest) unavailable | modules/aria (notification re-exports), modules/core-hr/probation, all workflow completions that dispatch notifications | HIGH |
| **modules/absence** | Leave requests cannot be created; leave balances unavailable | modules/aria (leave recommendation), ESS leave page | HIGH |
| **lib/storage/factory** | Document upload fails; photo upload fails | modules/core-hr/documents, modules/core-hr/photo-upload | HIGH (production); MEDIUM (UAT with /tmp) |
| **modules/payroll** | Payroll runs cannot be created; ESS payslips unavailable | modules/reports (finance dashboard), modules/aria (briefing, people intelligence) | HIGH |
| **modules/notification** (outbox poller crash) | Queued emails stuck in PENDING; no email delivery but app functions | Email delivery chain only | MEDIUM |
| **modules/reports** | Dashboard KPI cards unavailable | No cascade — read-only, self-contained | LOW |
| **modules/migration** | Data load wizard unavailable | No cascade — leaf module | LOW |
| **modules/aria** | AI chat unavailable; ARIA OS unavailable; approval topbar uses notification module directly | No cascade to non-ARIA features | LOW |
| **modules/timesheets** | Timesheet entry unavailable | No cascade | LOW |
| **modules/insurance** | Insurance enrolment unavailable; ESS insurance view fails | modules/reports (insurance report) | LOW |
| **modules/compliance** | Compliance rules data unavailable in ARIA OS | ARIA os-actions getComplianceData fails; no cascade to core HR logic | LOW |


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/17-CONTEXT-LOADING-MATRIX.md
LINES: 285
================================================================================
# 17 — CONTEXT LOADING MATRIX

> Last updated: 2026-06-04
> Purpose: Reduce AI context consumption by loading only the minimum files needed per task type.

---

## Context Budget Guide

| Item | Size | Notes |
|---|---|---|
| CLAUDE.md (auto-loaded) | ~70KB | Very heavy — loads automatically every session. Cannot be avoided. |
| drizzle/schema/foundation.ts | ~91KB | Largest file. Never load fully unless doing schema work. Use offset/limit reads. |
| drizzle/schema/configuration.ts | ~46KB | 25 tables. Load selectively (first 100 lines shows table list). |
| drizzle/schema/transactions.ts | ~30KB | Runtime tables. Load selectively. |
| lib/workflow-engine.ts | Large | Complex engine. Use grep to find specific functions. |
| modules/absence/actions.ts | Large | Leave business logic. Load only if fixing leave bugs. |

**Prefer:** Targeted `grep` searches and offset/limit reads over full file reads.

**Never load the full foundation.ts or configuration.ts** unless you are doing schema/migration work. Instead, use:
```bash
grep "export const" drizzle/schema/foundation.ts | grep "pgTable"
# then read specific offsets for the tables you need
```

**Use these project-memory docs** (`docs/project-memory/2026-06-04/`) for architectural context instead of re-reading CLAUDE.md sections. They are smaller and task-focused.

---

## Task-Based File Loading Matrix

### 1. Bug Fix in Employee Management (persons)

| Priority | Files |
|---|---|
| **Must load** | `modules/core-hr/actions.ts` (or specific action file), `drizzle/schema/foundation.ts` lines 154–306 (persons table), `modules/core-hr/validations.ts` |
| **If UI involved** | `app/(hr-admin)/persons/[id]/page.tsx`, `app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx` |
| **If new hire involved** | `app/(hr-admin)/persons/new/PersonNewForm.tsx`, `modules/core-hr/actions.ts` (createPerson function) |
| **Avoid** | Full foundation.ts, full configuration.ts, entire lib/workflow-engine.ts |
| **Grep first** | `grep -n "createPerson\|updatePerson\|getPerson" modules/core-hr/actions.ts` |

### 2. Bug Fix in Leave/Absence

| Priority | Files |
|---|---|
| **Must load** | `modules/absence/actions.ts` (createLeaveRequest / submitLeaveRequest), `drizzle/schema/foundation.ts` lines 700–800 (absenceEntries, absenceBalances — check exact offsets) |
| **If backdate issue** | `modules/absence/backdate-policy-actions.ts`, `drizzle/schema/configuration.ts` lines covering leaveBackdatePolicies |
| **If balance issue** | `drizzle/schema/foundation.ts` absenceBalances section |
| **If approval issue** | `lib/workflow-engine.ts` (first 150 lines), `modules/absence/actions.ts` submitLeaveRequest |
| **Avoid** | Full workflow-engine.ts, full foundation.ts |
| **Grep first** | `grep -n "absenceBalances\|absenceEntries\|createLeaveRequest" modules/absence/actions.ts \| head -40` |

### 3. Bug Fix in Workflow Engine

| Priority | Files |
|---|---|
| **Must load** | `lib/workflow-engine.ts` (targeted — use grep to find the function) |
| **If step/instance issue** | `drizzle/schema/workflow-engine.ts` (first 120 lines for enums + table structure) |
| **If SLA issue** | `lib/workflow-sla.ts`, `app/api/cron/workflow-sla/route.ts` |
| **If hierarchy resolution** | `lib/workflow-hierarchy.ts` |
| **If rules evaluation** | `lib/workflow-rules.ts` |
| **Reference** | `docs/project-memory/2026-06-04/06-WORKFLOW-RULES.md` (this repo) |
| **Avoid** | Full transactions.ts, full configuration.ts |
| **Grep first** | `grep -n "dispatchResourceCompletion\|takeWorkflowAction\|submitWorkflow" lib/workflow-engine.ts \| head -30` |

### 4. Bug Fix in Notifications

| Priority | Files |
|---|---|
| **Must load** | `lib/jobs/process-driver.ts`, `modules/notification/` |
| **If outbox issue** | `drizzle/schema/transactions.ts` lines covering notificationLog (grep first) |
| **If email template** | `modules/notification/templates/` |
| **If cron schedule** | `app/api/cron/workflow-sla/route.ts`, `app/api/cron/probation-alerts/route.ts` |
| **Avoid** | Full workflow-engine.ts |
| **Grep first** | `grep -n "notificationLog\|PENDING\|SENT\|FAILED" lib/jobs/process-driver.ts` |

### 5. Adding a New Leave Type

| Priority | Files |
|---|---|
| **Must load** | `drizzle/schema/foundation.ts` absenceTypes section, `modules/absence/backdate-policy-actions.ts`, `modules/config/` (leave rule config) |
| **Migration needed** | Check `drizzle/migrations/0051_document_type_check_expansion.sql` pattern — may need constraint update |
| **If UI** | `app/(hr-admin)/absence/` (relevant page component) |
| **If balance** | `drizzle/schema/foundation.ts` absenceBalances section |
| **Avoid** | Full workflow-engine.ts, full persons section of foundation.ts |
| **Grep first** | `grep -rn "absenceTypes\|absence_types" modules/absence/ \| head -20` |

### 6. Adding a New Master Data Entity

| Priority | Files |
|---|---|
| **Must load** | `app/(hr-admin)/master-data/` (existing MDM example to follow), `modules/core-hr/` (relevant actions), `config/workspace-nav.ts`, `config/admin-nav.ts` |
| **Must update both nav files** | `config/workspace-nav.ts` AND `config/admin-nav.ts` (invariant from MEMORY.md) |
| **Schema** | Create new migration file (0062+), update relevant schema file |
| **If drawer** | `components/mdm/MdmDrawer.tsx` (has WAI-ARIA focus trap — do not break it) |
| **Translation** | `lib/translation.ts` — all bilingual fields need EN+AR |
| **Avoid** | Full foundation.ts (use targeted read for the specific area) |
| **Reference pattern** | `app/(hr-admin)/master-data/departments/` is the cleanest example |

### 7. Adding a Workflow for a New Resource Type

| Priority | Files |
|---|---|
| **Must load** | `lib/workflow-engine.ts` (dispatchResourceCompletion function — grep for it), `drizzle/schema/workflow-engine.ts` first 100 lines |
| **Reference** | `docs/project-memory/2026-06-04/06-WORKFLOW-RULES.md` section "Adding a New Workflow" |
| **Migration** | Create partial unique index `WHERE status = 'PENDING_APPROVAL'` (follow migration 0041 pattern) |
| **If approval UI** | `app/(hr-admin)/approvals/` |
| **Grep first** | `grep -n "dispatchResourceCompletion\|case 'hiring_requests'\|case 'transfer_requests'" lib/workflow-engine.ts` |

### 8. Payroll Changes

| Priority | Files |
|---|---|
| **Must load** | `modules/payroll/actions.ts`, `drizzle/schema/foundation.ts` payroll section (grep: payrollRuns, payrollResults, salaryElements) |
| **If WPS/SIF** | `drizzle/schema/transactions.ts` wpsSifRecords section, `modules/payroll/wps/` |
| **If EOSB** | `drizzle/schema/foundation.ts` eosbCalculations section, `modules/payroll/eosb/` |
| **If run number** | `modules/payroll/actions.ts` nextRunNumber function — must use `pg_advisory_xact_lock` inside `db.transaction` |
| **If DEWS/GPSSA** | `drizzle/schema/transactions.ts` dewsContributions / gpssaContributions |
| **Avoid** | Full workflow-engine.ts, full configuration.ts |
| **Grep first** | `grep -n "payrollRuns\|createPayrollRun\|nextRunNumber" modules/payroll/actions.ts \| head -20` |

### 9. RBAC Changes (Adding Permissions)

| Priority | Files |
|---|---|
| **Must load** | `lib/auth.ts` (requireRole, HIGH_PRIVILEGE_ROLES), `drizzle/schema/configuration.ts` featurePermissions section |
| **If nav changes** | `config/workspace-nav.ts` AND `config/admin-nav.ts` (both files — invariant) |
| **If new route** | `middleware.ts` |
| **Reference** | `docs/project-memory/2026-06-04/05-RBAC-SECURITY.md` |
| **To add permission** | Insert one row into `feature_permissions` — zero code change |
| **Avoid** | Full transactions.ts, full foundation.ts |
| **Grep first** | `grep -n "requireRole\|HIGH_PRIVILEGE\|FORBIDDEN" lib/auth.ts` |

### 10. Database Schema Changes (New Migration)

| Priority | Files |
|---|---|
| **Must load** | Relevant schema file (targeted read — not the whole file), existing migration of similar type to follow as pattern |
| **Must read** | `drizzle/migrations/` — `ls` to find next available number (currently 0062+ for safety — 0055-0061 have WIP files) |
| **Must NOT use** | `pnpm drizzle-kit generate` — journal only covers 0000–0039; all new migrations are manual SQL |
| **Reference** | `docs/project-memory/2026-06-04/04-DATABASE-MODEL.md` Migration State section |
| **Pattern file** | `drizzle/migrations/0047_leave_backdate_policy.sql` (clean table creation example) |
| **Pattern file** | `drizzle/migrations/0041_hiring_request_uniqueness.sql` (partial unique index example) |
| **After creating SQL** | Apply via Neon SQL Editor, NOT `pnpm drizzle-kit migrate` |
| **Avoid** | Modifying `drizzle/meta/_journal.json` — journal covers 0000–0039 only, do not add entries |

### 11. Migration Factory Changes

| Priority | Files |
|---|---|
| **Must load** | `modules/migration/v2-executor.ts`, `modules/migration/v2-types.ts`, `modules/migration/v2-actions.ts` |
| **If validator** | `modules/migration/v2-validator.ts` |
| **If UI** | `app/(hr-admin)/admin/migration/MigrationConsoleV2.tsx` |
| **If parser** | `modules/migration/v2-package-parser.ts` |
| **If dry run** | `modules/migration/v2-dry-run.ts` |
| **Tests** | `tests/unit/migration-v2-executor.test.ts` (regression tests V2EX-001–010) |
| **Reference** | CLAUDE.md "Migration V2 False-Success" section (in project context) |
| **Avoid** | Full foundation.ts (use targeted reads for specific tables) |
| **Critical** | `detectZeroWriteFailure` in v2-executor.ts — never remove or weaken this check |

### 12. AI/ARIA Changes

| Priority | Files |
|---|---|
| **Must load** | `modules/aria/` (relevant intent/action file), `app/api/aria/chat/route.ts` |
| **If org chart intents** | `modules/aria/intents/org-chart-intents.ts` |
| **If ARIA config** | `drizzle/schema/configuration.ts` ariaAgentConfig / ariaModelConfig / ariaBehaviourConfig |
| **If Claude API** | `app/api/aria/chat/route.ts` — uses streaming, has RateLimitError/APIConnectionError/AuthenticationError handling |
| **Avoid** | Full workflow-engine.ts, full foundation.ts |
| **Grep first** | `grep -rn "AriaResponse\|aria_agent_config" modules/aria/ \| head -20` |

### 13. UI / Design System Changes

| Priority | Files |
|---|---|
| **Must load** | Target component file, `app/globals.css` (token definitions), `tailwind.config.ts` |
| **If new shadcn component** | `components/ui/` |
| **If nav changes** | `config/workspace-nav.ts` AND `config/admin-nav.ts` (both — invariant) |
| **If employee nav** | `components/employee/EmployeeSidebar.tsx` |
| **If org chart** | `components/org-chart/` |
| **Token rule** | Always use CSS custom properties (`var(--accent)`) — never raw hex |
| **Color contrast** | `--ink-3` is #606E7A (light) — certified WCAG 2.1 AA. Do not change without re-running contrast check. |
| **Avoid** | Full schema files, full workflow-engine.ts |
| **Reference** | `docs/project-memory/2026-06-04/01-ARCHITECTURE.md` design system token table |

### 14. API Route Changes

| Priority | Files |
|---|---|
| **Must load** | Target `app/api/*/route.ts` file, `middleware.ts` (auth enforcement), `lib/auth.ts` (requireRole) |
| **If health/observability** | `app/api/health/route.ts`, `app/api/health/db/route.ts`, `lib/logger.ts`, `lib/telemetry.ts` |
| **If cron** | `app/api/cron/*/route.ts`, `vercel.json` (cron schedule), `CRON_SECRET` env var required |
| **If DataOps** | `app/api/dataops/*/route.ts` — SUPER_ADMIN only, every write audit-logged |
| **If persons import** | `app/api/persons/import/route.ts` — GET only (template download); no bulk POST endpoint exists |
| **Avoid** | Full foundation.ts, full configuration.ts |
| **Pattern** | Every API route must: check auth, check role, validate input, wrap writes in db.transaction with audit |

### 15. Security / Audit Changes

| Priority | Files |
|---|---|
| **Must load** | `lib/auth.ts` (requireRole, mfaVerified), `lib/audit.ts` (writeAuditLog), `lib/encryption.ts` |
| **If PII** | `lib/encryption.ts` — AES-256-GCM; always encrypt before insert, decrypt after select |
| **If document access** | `app/api/documents/[id]/route.ts`, `modules/core-hr/documents/actions.ts` (getDocumentUrl) |
| **If MFA** | `lib/auth.ts` HIGH_PRIVILEGE_ROLES, requireRole, mfaVerified JWT claim |
| **If RBAC** | `drizzle/schema/configuration.ts` featurePermissions section |
| **Tests** | `tests/security/` (8 files, 180 tests — do not regress) |
| **Avoid** | Full workflow-engine.ts, full foundation.ts |
| **Grep first** | `grep -n "writeAuditLog\|requireRole\|AES\|encrypt" lib/audit.ts lib/auth.ts lib/encryption.ts` |

---

## Quick Reference: Critical File Paths

```
# RBAC / Auth
lib/auth.ts                           ← requireRole, mfaVerified, KRole, HIGH_PRIVILEGE_ROLES
middleware.ts                         ← session enforcement on all routes

# Database
drizzle/schema/foundation.ts          ← 40+ tables (91KB — read selectively)
drizzle/schema/configuration.ts       ← 25 config tables (46KB — read selectively)
drizzle/schema/transactions.ts        ← runtime tables (workflow instances, notifications, user accounts)
drizzle/schema/workflow-engine.ts     ← V2 workflow engine tables + enums
drizzle/schema/actions.ts             ← hiringRequests, transferRequests
lib/db.ts                             ← Drizzle client, DbOrTx type export

# Core HR
modules/core-hr/actions.ts            ← createPerson, updatePerson, getPerson, listPersons
modules/core-hr/validations.ts        ← PersonSchema, WorkerCategory, UpdatePersonSchema
modules/core-hr/department-head.ts    ← getDepartmentHead

# Leave / Absence
modules/absence/actions.ts            ← createLeaveRequest, submitLeaveRequest, pg_advisory_xact_lock
modules/absence/backdate-policy-actions.ts ← resolveBackdatePolicy, upsertBackdatePolicy

# Workflow
lib/workflow-engine.ts                ← submitWorkflow, takeWorkflowAction, dispatchResourceCompletion
lib/workflow-hierarchy.ts             ← approver chain resolution
lib/workflow-sla.ts                   ← SLA deadline computation

# Security / Audit
lib/audit.ts                          ← writeAuditLog (call inside every db.transaction)
lib/encryption.ts                     ← AES-256-GCM encrypt/decrypt for PII
lib/storage/factory.ts                ← getStorageProvider() — document storage abstraction
app/api/documents/[id]/route.ts       ← secure document serve endpoint

# Migration Factory
modules/migration/v2-executor.ts      ← executeMigrationV2, detectZeroWriteFailure
modules/migration/v2-validator.ts     ← validateMigrationPackage
modules/migration/v2-types.ts         ← V2ExecutionResult, V2ParsedPackage

# Navigation (must update BOTH files for any nav change)
config/workspace-nav.ts               ← HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN rail nav
config/admin-nav.ts                   ← MANAGER sidebar nav
components/employee/EmployeeSidebar.tsx ← EMPLOYEE sidebar nav

# UI / Design
app/globals.css                        ← CSS custom property tokens
tailwind.config.ts                     ← Tailwind token config

# Observability
lib/logger.ts                          ← Structured JSON logger, PII redaction
lib/telemetry.ts                       ← startTimer, withTiming, NFR thresholds
app/api/health/route.ts               ← Liveness probe
app/api/health/db/route.ts            ← DB connectivity probe
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why | Correct Approach |
|---|---|---|
| Reading full foundation.ts | 91KB — wastes context budget | Use `grep "export const" drizzle/schema/foundation.ts \| grep pgTable` then read specific offsets |
| Running `pnpm drizzle-kit migrate` for new migration | Journal only covers 0000–0039 | Create manual SQL file, apply via Neon SQL Editor |
| Running `pnpm drizzle-kit generate` | Will generate based on schema diff but journal gap makes it unreliable | Write migrations manually, follow existing patterns |
| Updating only workspace-nav.ts | admin-nav.ts must be updated simultaneously (invariant) | Always update both nav files |
| Calling `writeAuditLog` outside `db.transaction` | Audit row can be lost if transaction rolls back | Always call inside the same `db.transaction` as the business write |
| Storing plaintext emiratesId / passportNumber / iban | PDPL violation | Always encrypt via `lib/encryption.ts` before write |
| Hardcoding `#2E6170` or any raw hex in CSS/Tailwind | Token system violation | Use `var(--accent)` or equivalent token |
| Calling `submitWorkflow` outside a `db.transaction` | Leaves business record and workflow instance non-atomic | Wrap both in outer `db.transaction`, pass `tx` to `submitWorkflow` |
| Using `npm` or `yarn` | Project uses pnpm exclusively | `pnpm install`, `pnpm dev`, `pnpm build` |
| Loading full CLAUDE.md sections by re-reading the file | CLAUDE.md is auto-loaded; re-reading wastes tokens | Reference project-memory docs instead |


================================================================================
FILE [P3-06]: docs/project-memory/2026-06-04/18-ARCHITECTURAL-DECISIONS.md
LINES: 244
================================================================================
# Architectural Decisions Record (ADR)
**Snapshot date:** 2026-06-04

These decisions were made during Phase 1 design and early sprints. Each entry includes the rationale, what was rejected and why, and a warning for future developers about the cost of changing it.

---

## ADR-001: Neon PostgreSQL + Drizzle ORM

**Decision:** Use Neon serverless PostgreSQL (eu-central-1) as the database and Drizzle ORM as the query builder and migration tool.

**Rationale:**
- Neon provides a serverless-compatible PostgreSQL (auto-suspend, pgBouncer pooling, branch-per-PR) that matches Vercel's serverless function lifecycle. Traditional managed Postgres (RDS, CloudSQL) keeps connections open permanently, which is expensive and incompatible with Vercel's ephemeral function model.
- Drizzle ORM gives full TypeScript type safety on every query result without code generation steps (unlike Prisma). The schema is written as TypeScript and compiled — if a column is removed from the schema, every query that references it becomes a compile error. This is the only ORM that satisfies `strict: true` TypeScript without extensive workarounds.
- Drizzle migrations produce plain SQL files. This gives the team full control over what runs on the database and allows the manual migration pattern needed when the Drizzle journal diverged from production (see ADR-011).

**Rejected alternatives:**
- **Prisma:** Generated client creates a large binary; less flexible raw SQL; schema changes require `prisma generate` step in CI; difficult to use with pgBouncer transaction mode (same `prepare: false` issue, but Prisma's workaround is less stable).
- **TypeORM:** Poor TypeScript inference; decorator-based pattern does not compose well with React Server Components.
- **Plain SQL (pg/postgres.js):** No type safety; schema drift between code and DB is undetectable at compile time.

**Future warning:** Drizzle's migration journal has already diverged from production (see ADR-011). Any future migrations require careful handling. Do not assume `pnpm db:migrate` is safe to run without verifying which migrations are already applied.

---

## ADR-002: Vercel fra1 + Neon eu-central-1 Co-location

**Decision:** Deploy all Vercel functions to `fra1` (Frankfurt) and use Neon's eu-central-1 region.

**Rationale:**
- Vercel fra1 and Neon eu-central-1 both run in the same AWS Frankfurt availability zone. The inter-service DB latency is under 5ms (measured at DB p95=41ms in production soak; the DB query itself accounts for ~36ms of that).
- Without co-location, Vercel→Neon cross-region traffic adds 80–100ms per DB query. Multiplied across 6 parallel dashboard queries, this adds 80–100ms to every page load.
- UAE users route through Vercel's Mumbai PoP (bom1) to the fra1 function. This adds edge CDN latency (~127ms) but keeps the function→DB path fast. The alternative (deploying to a Middle East PoP) has no Neon equivalent and would add 150ms+ of DB latency.
- k6 NFR results: page p95=1,143ms, API p95=294ms, all under threshold. These numbers are only achievable with co-location.

**Rejected alternatives:**
- **me-central-1 (UAE):** Neon does not have a UAE region. Hosting the function in UAE with the DB in Frankfurt would add ~150ms to every query.
- **Supabase (eu-central-1):** Investigated but Supabase's real-time and row-level security features add overhead not needed here; Drizzle integration is less mature.

**Future warning:** Changing `vercel.json` `"regions": ["fra1"]` to any other value will immediately add 80–150ms to every database-backed page. If Neon adds a Middle East region, this decision should be revisited — but measure before moving.

---

## ADR-003: Auth.js v5 JWT Session Strategy (No DB Sessions)

**Decision:** Use JWT sessions (`session: { strategy: 'jwt', maxAge: 1800 }`) rather than database-backed sessions.

**Rationale:**
- DB sessions require a SELECT on every request to validate the session. With 500 concurrent users, this is 500 extra DB queries per page load — a significant bottleneck on a max-5 pgBouncer pool.
- JWT sessions carry all needed claims (role, personId, legalEntityId, mfaVerified) in the signed token. The middleware can enforce routing rules without a DB round-trip.
- 30-minute `maxAge` is the session timeout requirement (NFR-10). This is enforced by JWT expiry without any server-side state.

**Rejected alternatives:**
- **Database sessions:** More revocable (a logout can invalidate the session immediately), but adds a DB query to every request. Acceptable for low-concurrency apps; not acceptable here given NFR-01 (page p95 < 2,000ms with 500 VU).
- **Redis sessions:** Would eliminate the DB query cost, but Redis is explicitly rejected (ADR-001 stack constraints — no Redis in this architecture).

**Tradeoff accepted:** JWT sessions cannot be revoked until expiry. A user whose role is changed in the database will continue to operate with the old role until their 30-minute JWT expires. This is accepted because role changes are rare HR events, not frequent operational changes.

**Future warning:** If immediate session revocation becomes a requirement (e.g. for terminated employees), this decision must be revisited. Options: switch to DB sessions, add a JWT blocklist table (checked in middleware), or reduce `maxAge` to 5 minutes (increases DB load from token refresh).

---

## ADR-004: Microsoft Entra ID as Primary SSO

**Decision:** Use Microsoft Entra ID (formerly Azure AD) as the primary authentication provider via OIDC.

**Rationale:**
- Avaniis is an enterprise Microsoft customer. All employees have Entra ID accounts. Using Entra ID eliminates password management for the application entirely.
- Entra ID Conditional Access policies enforce MFA at the OIDC layer before the AVANIIS HR application ever sees the user. This satisfies SEC-04 (MFA for high-privilege roles) without requiring an in-app TOTP implementation.
- The Avaniis tenant can enforce device compliance, geo-restrictions, and session policies independently of the application.
- Zero password storage for SSO users — `passwordHash` is only populated for SUPER_ADMIN accounts that use the local credentials provider.

**Rejected alternatives:**
- **Google Workspace SSO:** Avaniis uses Microsoft 365, not Google. Employees would need separate Google accounts.
- **SAML 2.0 (direct):** OIDC is simpler to implement with Auth.js; SAML requires XML parsing and is more complex to debug.
- **Custom username/password for all users:** Requires password hashing, reset flows, brute-force protection, and breach monitoring — significant ongoing operational burden for no benefit when Entra ID is available.

**Future warning:** The `AUTH_MICROSOFT_ENTRA_ID_*` env var names follow Auth.js v5's convention. If the Avaniis tenant changes (e.g. renamed or merged), the `issuer` URL and client credentials must all be updated. New SSO users who sign in before they have a `user_accounts` row are provisioned as EMPLOYEE role and a Super Admin notification is sent — this is intentional but means Super Admin must action new-user registrations manually.

---

## ADR-005: Postgres Outbox Pattern for Notifications (No Kafka/Redis)

**Decision:** Use a `notification_log` database table as an outbox for email and in-app notifications, polled by a `node-cron` background process.

**Rationale:**
- The outbox pattern provides at-least-once delivery without requiring a separate message broker. If the notification send fails, the row stays in `PENDING` status and is retried on the next cron tick.
- Postgres is already the system of record. A `notification_log` INSERT inside the same transaction as the business event means the notification is guaranteed to exist if the business event commits.
- `node-cron` running inside the Next.js process avoids the operational complexity of a separate worker service.
- This is sufficient for AVANIIS HR's volume. UAE enterprise HCM for a single group company does not generate Kafka-scale notification throughput.

**Rejected alternatives:**
- **Kafka:** Explicitly rejected (ADR-001). Kafka adds ZooKeeper, broker clusters, consumer groups, schema registry, and significant operational overhead. The throughput requirement does not justify it.
- **Redis (BullMQ/Bull):** Explicitly rejected. Redis adds another infrastructure dependency. An outage in Redis would block all notifications. Postgres is already HA (Neon).
- **AWS SQS/SNS:** Would work technically but adds cloud lock-in and a separate IAM role. The team chose to keep all state in Postgres.

**Future warning:** `node-cron` runs inside the Vercel function, which is stateless and can run multiple instances concurrently. The cron handler uses a dedup check to prevent duplicate notifications (`SELECT WHERE created_date >= now-24h`). If the cron frequency increases or the notification volume grows significantly, the dedup window may need to be tightened and the poller should be moved to a dedicated Vercel Cron function.

---

## ADR-006: Effective-Date Pattern for HR Records (No Hard Deletes)

**Decision:** HR records are never deleted. Changes are represented by closing the current record (`valid_to = today`) and opening a new record (`valid_from = today`).

**Rationale:**
- UAE Labour Law requires employers to maintain complete employment records. A salary that was reduced must remain visible in the audit trail — deleting or overwriting it would destroy legal evidence.
- The effective-date pattern enables point-in-time queries: "what was this employee's salary on 2025-01-01?" This is required for payroll recalculations, dispute resolution, and regulatory audits.
- Immutability is simpler than soft-delete: you never have to remember to filter `WHERE deleted_at IS NULL`. Active records are those where `valid_to IS NULL` or `valid_to > NOW()`.

**Rejected alternatives:**
- **Soft delete (`deleted_at` column):** Does not preserve history — the deleted row has the latest values only, not all intermediate values. A salary history requires multiple rows, not a deletion flag.
- **Event sourcing:** Would also provide a complete history but is significantly more complex to query. Effective-date achieves the same result with standard SQL and Drizzle.

**Future warning:** Every UPDATE to an HR record must follow the close/open pattern or the history is broken. Do not use Drizzle's `.update()` directly on effective-dated tables without first understanding the current `valid_to` state. Use `lib/effective-date.ts` helpers. Failure to follow this pattern breaks point-in-time queries and the leave accrual engine's retroactive calculations.

---

## ADR-007: node-cron + Vercel Cron for Background Jobs

**Decision:** Use `node-cron` for in-process scheduled tasks and Vercel's built-in cron (`vercel.json`) for HTTP-triggered scheduled jobs.

**Rationale:**
- The system needs periodic jobs: workflow SLA checks, probation alerts, outbox poller. These are low-frequency (daily or sub-minute) and low-volume.
- `node-cron` handles the outbox poller (sub-minute) inside the Next.js process. No separate worker infrastructure required.
- Vercel cron handles the daily SLA check by triggering the `/api/cron/workflow-sla` endpoint at 09:00 UTC. This endpoint is protected by `CRON_SECRET`.
- Together these cover all scheduling needs without any external scheduler (no Airflow, no Temporal, no BullMQ).

**Rejected alternatives:**
- **BullMQ (Redis-backed):** Explicitly rejected. Adds Redis dependency. See ADR-005.
- **AWS Lambda scheduled events:** Adds cloud lock-in and cross-service latency. The Vercel cron approach is native to the hosting platform.
- **Temporal:** Powerful but massively over-engineered for this use case. Temporal requires a Temporal server cluster, worker processes, and significant operational overhead.

**Future warning:** Vercel serverless functions can run multiple concurrent instances. If `node-cron` is running in multiple instances simultaneously, each instance will tick independently. The outbox poller and the probation alert cron both have dedup guards, but any new cron jobs must also implement dedup to prevent duplicate processing.

---

## ADR-008: AES-256-GCM Field-Level Encryption for PII

**Decision:** Encrypt `emirates_id`, `passport_number`, and `iban` fields at the application layer using AES-256-GCM before storing them in PostgreSQL.

**Rationale:**
- UAE PDPL (Personal Data Protection Law) and GDPR classify these fields as sensitive personal data. A database breach must not expose them in plaintext.
- Field-level encryption (application-layer) means the database itself holds only ciphertext. Even a full Neon database export does not contain readable PII without the `FIELD_ENCRYPTION_KEY`.
- AES-256-GCM provides authenticated encryption — the `tag` field detects tampering or corruption. A tampered ciphertext throws rather than silently returning garbage data.
- Wire format: `base64(iv[12] || tag[16] || ciphertext)` stored in `VARCHAR(500)`. This is self-contained — no separate IV or tag columns needed.

**Rejected alternatives:**
- **PostgreSQL `pgcrypto`:** DB-level encryption still exposes plaintext to anyone with DB access (the application sends the key with each query). Application-layer encryption means the DB never sees plaintext.
- **Transparent Data Encryption (TDE):** Encrypts the entire DB at rest, but the DB engine itself still processes plaintext. A compromised DB account can read everything. TDE protects against disk theft, not DB account compromise.
- **No encryption (rely on Neon access controls):** Neon access controls are a necessary but not sufficient control. PDPL requires that PII cannot be read in plaintext from the storage medium.

**Future warning:** The `FIELD_ENCRYPTION_KEY` must never be rotated without a migration that re-encrypts all existing ciphertext rows with the new key. Rotating the key without re-encrypting will make all existing encrypted data unreadable. There is currently no key rotation tooling — build it before the first rotation. The zero key (`0`.repeat(64)) is rejected in all environments except `NODE_ENV=development`.

---

## ADR-009: Single-Tenant Architecture with tenant_id Default

**Decision:** Deploy as a single tenant (one Avaniis / AVANIIS Real Estate entity group) but include `tenant_id` on every table from day one, with `DEFAULT '00000000-0000-0000-0000-000000000001'::uuid`.

**Rationale:**
- AVANIIS HR is being built for a single client today but the codebase may be productised for multiple clients in the future.
- Adding `tenant_id` retroactively across 100+ tables is extremely risky (missed tables, data migration complexity, query rewrites). Adding it upfront costs almost nothing — it is a single column per table.
- The `TENANT_ID` constant in `lib/constants.ts` is used in every INSERT. When the system becomes multi-tenant, the constant becomes a function that reads from the session context — no other changes needed in the INSERT code.

**Rejected alternatives:**
- **Single-tenant with no tenant_id:** Cheaper now, very expensive later if productisation is needed. Schema changes across 100+ tables in production is a multi-month project with high risk.
- **Schema-per-tenant:** Different PostgreSQL schema per tenant. Drizzle ORM does not handle dynamic schema names well. Migrations would need to run N times (once per tenant). This approach has no benefits for the current single-tenant deployment.

**Future warning:** Queries currently do not filter by `tenant_id` in most places — the default value makes all rows implicitly the same tenant. When multi-tenancy is enabled, every `SELECT` must add a `WHERE tenant_id = :tenantId` filter. Missing even one is a data leak between tenants. A systematic audit of all queries is required before enabling multi-tenancy.

---

## ADR-010: max:5 Connection Pool on Neon Pooled Endpoint

**Decision:** Use `max: 5` connections in the `postgres.js` client configuration, pointing at the Neon **pooled** (pgBouncer) endpoint, with `prepare: false`.

**Rationale:**
- The original configuration used `max: 1`. This caused a critical production bug: a database transaction holding the single connection blocked every concurrent request until Vercel killed the function (observed as "Saving…" forever on leave submit with status 0).
- The Neon pooled endpoint (pgBouncer in transaction mode) multiplexes many client connections onto few Postgres backend connections. Client-side `max: 5` means each Vercel function instance holds at most 5 connections to pgBouncer. pgBouncer handles the Postgres-level connection limit.
- `prepare: false` is **mandatory** with pgBouncer transaction mode. pgBouncer does not maintain stable sessions between transactions, so PostgreSQL prepared statements (postgres.js default) fail with "prepared statement does not exist". Without this, every query after the first will fail in production.
- `idle_timeout: 20s` releases idle connections quickly, preventing Neon from seeing stale connections from warm-but-idle function instances.

**Rejected alternatives:**
- **max: 1 (original):** Causes request starvation under concurrency. Any in-flight transaction blocks all other requests from that function instance.
- **max: 20+:** Would exhaust pgBouncer's configured backend pool. Neon's free/standard tiers have a backend connection limit. With multiple Vercel function instances each holding 20 connections, the limit is hit quickly.
- **Unpooled endpoint:** Without pgBouncer, each function instance holds a direct Postgres connection. Under Vercel's concurrency model this quickly exhausts Postgres's `max_connections`.

**Future warning:** The `DATABASE_URL` environment variable **must** point at the pooled endpoint (host contains `-pooler`). If someone replaces it with the unpooled endpoint (perhaps copied from the Neon console's "Direct" tab), the `prepare: false` setting becomes unnecessary but the connection limit issue returns immediately. Check the URL format when debugging connection issues.

---

## ADR-011: Migration Journal Gap (0000-0039 Journalled; 0040+ Manual SQL)

**Decision:** Accept that Drizzle's journal covers only migrations 0000–0039. Migrations 0040 and above are applied manually via the Neon SQL Editor and are not tracked by the journal.

**Rationale:**
- The Drizzle journal diverged from production at migration 0040 due to a schema complexity issue where `drizzle-kit generate` created migrations that could not be applied cleanly to the live Neon database in order.
- The team chose to write migration 0040 as raw SQL and apply it directly to Neon, bypassing the journal. This decision was repeated for 0041–0054.
- The manual approach gives full control over what runs on the database (no unexpected Drizzle-generated SQL), allows complex multi-step migrations (e.g. `ALTER TABLE ... ADD COLUMN; UPDATE ...; ALTER TABLE ... ADD NOT NULL`), and avoids the risk of `drizzle-kit migrate` applying a destructive change in production.

**Rejected alternatives:**
- **Reset the journal:** Would require re-applying all 40+ manual migrations to a fresh database and re-testing. This was judged too risky mid-project.
- **Squash all migrations:** Creates a single "initial" migration containing the full schema. This loses history and makes rollback analysis impossible.
- **Continue using `drizzle-kit generate` for 0040+:** Drizzle-generated SQL was producing incorrect migrations for complex schema changes (multi-table FKs, partial indexes). Manual SQL gives precise control.

**Future warning:** There are currently four WIP migration files in `drizzle/migrations/` that are NOT yet applied to any environment: `0055_payroll_run_number_per_entity.sql`, `0055_wip_step_instance_columns.sql`, `0056_wip_notification_queue_meta.sql`, `0057_wip_audit_immutability.sql`. There are also two files with the `0055_` prefix — this must be resolved (rename one to `0055b_` or pick the correct one) before applying either. The next safe new migration slot is **0058**. Always verify by listing `drizzle/migrations/` before creating a new migration.

---

## ADR-012: React Server Components + Server Actions Pattern

**Decision:** Use Next.js 15 App Router's React Server Components (RSC) as the primary rendering model, with Server Actions as the primary mutation mechanism.

**Rationale:**
- Server Components eliminate the client-side data fetching pattern (useEffect + fetch + loading state). Data is fetched at render time on the server, co-located with the component that displays it. No API route required for reading data.
- Server Actions provide a secure, typed RPC mechanism. The action runs on the server; the client sends a POST to a Next.js-generated endpoint. `requireRole()` at the top of every action ensures the auth check happens server-side, not in client-side code that can be bypassed.
- The combination reduces client bundle size significantly: all business logic, DB queries, and auth checks stay on the server. The client only receives the rendered HTML and minimal interactivity.
- Server Actions + `revalidatePath()` replaces manual cache invalidation. After a successful mutation, the affected page is revalidated automatically.

**Rejected alternatives:**
- **Next.js Pages Router with API routes:** The older pattern. API routes are still needed for some cases (document streaming, cron endpoints) but are not the primary mutation mechanism.
- **tRPC:** Type-safe API layer. Considered, but Server Actions achieve the same type safety with less boilerplate and no separate router definition.
- **GraphQL:** Over-engineered for a single-client enterprise HCM. GraphQL's flexibility is a liability when the schema is stable and the client is known.

**Future warning:** Server Action exceptions thrown from Server Components are sanitised by Next.js 15 in production — the error message is replaced with a generic string. **Never use `translateError()` (which always re-throws) in a Server Action catch block.** Always catch, log with `console.error()`, and return `{ error: string }`. The client then checks `'error' in result` and displays the message. This pattern is established throughout the codebase and must be followed for any new Server Action.

---

## ADR-013: @xyflow/react for Org Chart

**Decision:** Use `@xyflow/react` v12.10.2 as the org chart rendering library.

**Rationale:**
- The org chart is a core feature of AVANIIS HR — it displays the full reporting hierarchy, supports hiring and transfer actions from nodes, shows analytics overlays, and exports to PNG/PDF.
- `@xyflow/react` (formerly React Flow) is purpose-built for node-edge graph UIs. It provides drag-and-drop, zoom/pan, custom node types, and edge routing out of the box. Building equivalent functionality from scratch would require months of work.
- The library is mature (v12), actively maintained, and has TypeScript-first APIs. Custom node types (`EmployeeNode`, `VacantNode`) are plain React components with full access to the design system tokens and shadcn/ui primitives.
- The org chart event bus (`lib/org-chart/chart-events.ts`) uses a typed `EventTarget` to decouple the canvas from the ARIA chat panel and the analytics overlay — this is a standard browser API and does not depend on any library-specific feature.

**Rejected alternatives:**
- **D3.js:** Low-level SVG library. Powerful but requires implementing all interaction patterns (zoom, pan, drag, selection) from scratch. Poor React integration (imperative vs. declarative).
- **GoJS:** Commercial license. Complex API. Not open-source.
- **Mermaid.js:** Diagram generation, not an interactive graph. Cannot support click handlers, drag-and-drop, or custom React node components.

**Future warning:** `@xyflow/react` uses an internal canvas coordinate system. Custom nodes receive position props from the library and must not manage their own position state. The `OrgChartCanvas` component re-renders the full node list when the data changes — if the employee count grows beyond ~500 nodes, virtualisation or server-side filtering will be needed. The current implementation renders all nodes on the client and is only tested up to ~100 employees.

