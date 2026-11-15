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
