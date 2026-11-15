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
