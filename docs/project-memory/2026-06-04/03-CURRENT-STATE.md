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
