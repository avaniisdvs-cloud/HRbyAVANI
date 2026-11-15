# AVANIIS HR — Complete System Context Export
**Version:** May 2026 · Phase 1 MVP · Sprints 1–11 complete
**Purpose:** Full system dump for AI collaboration baseline (ChatGPT / Claude sessions)

---

## 1. Executive Summary

AVANIIS HR is an AI-native, enterprise-grade Human Capital Management (HCM) platform purpose-built for **Avaniis / Avaniis** operating under **UAE Labour Law**. It is a monolithic Next.js 14 application that replaces traditional HRMS tools (SAP, Oracle HCM) with a modern, audit-first, bilingual (English + Arabic) system.

**What it does:**
- Full employee lifecycle: hire → onboard → manage → transfer/promote → terminate/retire
- UAE-specific compliance: EOSB (End of Service Benefits), WPS (Wage Protection System), GPSSA/DEWS pension routing, 57 coded business rules (BR-xx)
- Configurable multi-step approval workflows with SLA, escalation, and email-link approvals
- AI assistant (ARIA) powered by Anthropic Claude API with intent routing and RAG
- Interactive org chart (React Flow), letter generation with e-signatures, document vault
- Employee self-service + manager self-service portals

**Phase 1 scope:** Single-tenant (Avaniis), UAE only, 11 functional modules. Phase 3 will introduce multi-tenancy.

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INTERNET / INTRANET                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────────────────┐
│              Azure App Service — UAE North                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Next.js 14 App (Single Process)                │    │
│  │                                                             │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │    │
│  │  │  React RSC   │  │  Server      │  │  API Routes      │  │    │
│  │  │  (App Router)│  │  Actions     │  │  (webhooks, AI,  │  │    │
│  │  │              │  │  (mutations) │  │   cron, auth)    │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘  │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │                   18 Modules                         │  │    │
│  │  │  core-hr · absence · payroll · workflow · notify     │  │    │
│  │  │  auth · audit · config · compliance · timesheets     │  │    │
│  │  │  aria · directory · profile · reports · access       │  │    │
│  │  │  employee-letters · org-cache · (utilities)          │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │                    lib/ layer                        │  │    │
│  │  │  db · audit · encryption · effective-date · auth     │  │    │
│  │  │  workflow-engine · blob-storage · config-resolver    │  │    │
│  │  │  date-utils · i18n · leave-rule-resolver · org-chart │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐    ┌──────────────────┐   ┌──────────────────┐
│ PostgreSQL  │    │  Azure Blob      │   │  Anthropic       │
│ 16 (Docker  │    │  Storage (Docs,  │   │  Claude API      │
│ local /     │    │  Photos, PDFs)   │   │  (ARIA module)   │
│ Azure prod) │    └──────────────────┘   └──────────────────┘
└─────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│   node-cron (in-process scheduler)                              │
│   Jobs: org-chart-snapshot · probation-alerts · workflow-sla    │
└─────────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**
- **No microservices:** One Next.js app, one Postgres database, one deployment unit (ADR-001)
- **No Redis / Kafka:** Background jobs use node-cron + Postgres outbox pattern
- **No Prisma / TypeORM:** Drizzle ORM only (type-safe SQL, no ORM magic)
- **Server Actions pattern:** All mutations are Next.js Server Actions (no REST API layer for internal use)
- **RSC-first:** Data fetching in Server Components (no client-side data fetching except org chart canvas)

---

## 3. Technical Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js App Router | 14.x | RSC + Server Actions |
| Language | TypeScript | 5.5 (strict) | `noImplicitAny`, `strictNullChecks` |
| Database | PostgreSQL | 16 | Docker locally; Azure UAE North prod |
| ORM | Drizzle ORM + drizzle-kit | 0.30.10 | Type-safe SQL, no runtime magic |
| Auth | Auth.js v5 (NextAuth) | 5.x | Microsoft Entra ID OIDC + dev credentials |
| UI components | shadcn/ui + Radix UI | Latest | Headless, accessible |
| Styling | Tailwind CSS | 3.x | CSS custom property tokens (never raw hex) |
| Org chart | @xyflow/react | 12.10.2 | React Flow — locked version |
| AI / LLM | Anthropic Claude API | Latest | ARIA module only |
| PDF generation | @react-pdf/renderer | Latest | Letter PDF generation |
| Image export | html-to-image + jspdf | Latest | Org chart PNG/PDF export |
| Storage | Azure Blob Storage | SDK v12 | Documents, photos, PDFs |
| Email | Azure Communication Services | SDK | Transactional email delivery |
| Font (body) | Inter | — | `var(--font-sans)` |
| Font (headings) | Fraunces | — | `var(--font-serif)` |
| Font (code/IDs) | JetBrains Mono | — | `var(--font-mono)` |
| Testing (unit) | Vitest | Latest | 40+ test suites |
| Testing (E2E) | Playwright | Latest | Auth, CRUD, workflow flows |
| Testing (a11y) | axe-core | Latest | Accessibility compliance |
| Encryption | Node.js crypto (AES-256-GCM) | Built-in | PII field encryption |
| Package mgr | pnpm | 9.4 | **Never npm or yarn** |
| Hosting | Azure App Service | UAE North | Single region |

**Explicitly rejected technologies:** NestJS · Kafka · Redis · Zookeeper · Flyway · pgAdmin · React Native · Prisma · TypeORM · Kubernetes · Kong

---

## 4. Folder Structure

```
/
├── app/                          ← Next.js App Router routes
│   ├── (auth)/                   ← Public auth routes (no shell)
│   │   ├── sign-in/              ← Login page (carousel + SSO button)
│   │   └── sign-out/
│   ├── (employee)/               ← Employee portal (me/)
│   │   └── me/
│   │       ├── home/
│   │       ├── profile/
│   │       ├── requests/[id]/
│   │       ├── letters/sign/[letterId]/
│   │       ├── aria/
│   │       ├── directory/
│   │       └── timesheet/
│   └── (hr-admin)/               ← HR Admin portal
│       ├── dashboard/
│       ├── persons/
│       │   ├── new/
│       │   └── [id]/
│       │       ├── edit/
│       │       ├── contracts/
│       │       ├── bank-details/
│       │       ├── dependents/
│       │       └── documents/
│       ├── master-data/
│       │   ├── legal-entities/
│       │   ├── departments/
│       │   ├── positions/
│       │   ├── grades/
│       │   ├── locations/
│       │   ├── jobs/
│       │   ├── leave-types/
│       │   ├── work-schedules/
│       │   └── holiday-calendars/
│       ├── absence/
│       ├── workflows/[instanceId]/
│       ├── approvals/[instanceId]/
│       ├── configuration/workflows/
│       ├── employee-letters/
│       ├── timesheets/
│       ├── reports/
│       ├── org-chart/
│       ├── aria/
│       ├── users/
│       └── settings/             ← 20+ configuration pages
│           ├── appearance/
│           ├── custom-fields/
│           ├── leave-rules/
│           ├── letter-templates/
│           ├── notifications/
│           ├── permissions/
│           ├── workflows/
│           ├── ai-agent/
│           └── ...
├── modules/                      ← 18 domain modules
│   ├── core-hr/
│   │   ├── index.ts              ← ONLY public API (Hard Rule 6)
│   │   ├── actions.ts
│   │   ├── services.ts
│   │   ├── types.ts
│   │   ├── validations.ts
│   │   ├── bank-details/
│   │   ├── contracts/
│   │   ├── dependents/
│   │   ├── documents/
│   │   ├── employment-actions/
│   │   ├── org-chart-actions.ts
│   │   └── worker-assignments/
│   ├── workflow/
│   ├── notification/
│   ├── absence/
│   ├── payroll/
│   ├── audit/
│   ├── auth/
│   ├── compliance/
│   ├── config/
│   │   └── guards.ts             ← 6 business rule guards
│   ├── timesheets/
│   ├── aria/
│   │   ├── index.ts
│   │   ├── actions.ts
│   │   └── intents/
│   │       └── org-chart-intents.ts
│   ├── employee-letters/
│   ├── directory/
│   ├── profile/
│   ├── reports/
│   └── access/
├── lib/                          ← Cross-cutting utilities
│   ├── db.ts                     ← Drizzle singleton
│   ├── auth.ts                   ← Auth.js config + getCurrentUser()
│   ├── audit.ts                  ← writeAuditLog()
│   ├── audit-diff.ts             ← diffFields()
│   ├── encryption.ts             ← AES-256-GCM (PII fields)
│   ├── effective-date.ts         ← close+open pattern (never DELETE)
│   ├── config-resolver.ts        ← dynamic config resolution
│   ├── retention-policy.ts       ← data retention windows
│   ├── workflow-engine.ts        ← v2 engine core
│   ├── workflow-hierarchy.ts     ← approver resolution
│   ├── workflow-rules.ts         ← AND/OR condition trees
│   ├── workflow-sla.ts           ← UAE working-hours SLA
│   ├── blob-storage.ts           ← Azure Blob adapter
│   ├── constants.ts              ← TENANT_ID, limits
│   ├── date-utils.ts             ← Hijri calendar
│   ├── i18n.ts / i18n-runtime.ts ← EN/AR translations
│   ├── leave-rule-resolver.ts    ← entitlement calculation
│   ├── evaluate-manager-role.ts  ← manager eligibility
│   ├── person-form-helpers.ts    ← form composition
│   ├── csv.ts                    ← CSV export
│   ├── app-error.ts              ← error types
│   └── org-chart/
│       ├── build-tree.ts         ← getOrgTree() recursive CTE
│       ├── types.ts              ← OrgFlowNode, OrgFlowEdge
│       ├── chart-events.ts       ← typed EventTarget bus (6 types)
│       └── export.ts             ← PNG/PDF export
├── drizzle/
│   ├── schema/
│   │   ├── foundation.ts         ← 69 KB — core HR tables
│   │   ├── configuration.ts      ← 42 KB — admin config tables
│   │   ├── transactions.ts       ← 40 KB — runtime tables
│   │   ├── workflow-engine.ts    ← 29 KB — workflow v2 tables
│   │   ├── timesheets.ts         ← 8.5 KB
│   │   ├── employee-letters.ts   ← 7.5 KB
│   │   ├── actions.ts            ← 4.4 KB — hiring/transfer requests
│   │   └── org-cache.ts          ← 1.5 KB — snapshot cache
│   ├── migrations/               ← 25 numbered SQL migrations (0000–0024)
│   └── seed.ts                   ← Dev seed data
├── components/                   ← Shared UI components
│   ├── ui/                       ← shadcn primitives
│   └── ...
├── config/
│   ├── admin-nav.ts              ← HR Admin sidebar nav
│   ├── employee-nav.ts           ← Employee sidebar nav
│   └── manager-nav.ts            ← Manager sidebar nav
├── middleware.ts                 ← Auth guard + role routing
├── tests/
│   ├── unit/                     ← 15+ Vitest unit suites
│   ├── integration/              ← 12+ Vitest integration suites
│   ├── security/                 ← 5 security test suites
│   ├── accessibility/            ← axe-core tests
│   ├── performance/              ← load tests
│   └── e2e/                      ← Playwright tests + e2etestresults.md
└── docs/
    ├── SETUP_GUIDE.md
    ├── FILE_STRUCTURE.md
    ├── DEPENDENCIES.md
    ├── KNOWN_GAPS.md
    ├── DESIGN-STANDARD.md
    ├── handoff-reference.md
    ├── WORKFLOW_DATA_MODEL.md
    ├── WORKFLOW_ENGINE_DESIGN.md
    ├── WORKFLOW_API_SPEC.md
    ├── WORKFLOW_ADMIN_UI_SPEC.md
    ├── WORKFLOW_TEMPLATES.md
    └── ARIA_TEST_CASES.md
```

---

## 5. Module-by-Module Breakdown

### 5.1 `core-hr` — Employee Master

**Responsibility:** System of record for all people, positions, departments, org structure, and employment contracts.

**Public API (via `modules/core-hr/index.ts`):**
```typescript
// Person CRUD
createPerson(input)
getPerson(id)
listPersons(filters)
updatePerson(id, patch)
requestPersonalDataExport(id)        // PDPL compliance

// Contracts
createContract(personId, data)
amendContract(contractId, data)
terminateContract(personId, data)    // triggers EOSB calc

// Worker Assignments (effective-dated)
createWorkerAssignment(data)
changeWorkerAssignment(id, patch)

// Employment Actions
hire(data)         // creates person + position + assignment
transfer(data)     // changes position/department
promotion(data)    // changes grade + position
gradeChange(data)  // salary grade change

// Supporting data
addBankDetails(personId, iban)       // IBAN encrypted at rest
getBankDetails(personId)             // decrypts IBAN
addDependent(personId, data)         // family member (EID + passport encrypted)
uploadPersonDocument(personId, file) // Azure Blob + SAS URL
getDocumentUrl(documentId)           // fresh 15-min SAS URL
getPersonPicklists()                 // dropdowns: positions, depts, grades, managers
```

**`persons` table critical columns:**

| Column group | Columns |
|---|---|
| Identity | `full_name_en`, `full_name_ar`, `date_of_birth`, `gender`, `nationality`, `marital_status` |
| Status | `ACTIVE \| ON_LEAVE \| SUSPENDED \| TERMINATED \| RETIRED \| PENDING_HIRE` |
| Encrypted PII | `emirates_id`, `passport_number`, `visa_number`, `labour_card_number` |
| Current assignment | `current_position_id`, `current_department_id`, `current_grade_id`, `line_manager_id`, `dotted_line_manager_id` |
| Payroll | `basic_salary`, `total_package`, `payroll_frequency` |
| Medical | `insurance_status`, `insurance_card_number`, `insurance_provider`, `premium_employee_share`, `premium_employer_share` |
| Consent | `pdpl_consent` — UAE data privacy law |
| Photo | `profile_photo_url` — Azure Blob SAS URL |

---

### 5.2 `workflow` — Approval Engine (v2)

**Responsibility:** Configurable multi-step approval workflows for any HR transaction.

**Features:**
- AND/OR condition trees evaluated against request context
- Hybrid hierarchy types: `LINE_MANAGER` · `POSITION` · `CUSTOM_GROUP`
- SLA with UAE working hours (excl. Fridays + public holidays); escalation on breach
- Email-link approvals (HMAC-signed tokens, no login required)
- Delegation — approver delegates to substitute during leave
- Org snapshots — immutable hierarchy captured at submit time

**Public API:**
```typescript
submitWorkflow(requestType, requestId, context)   // → instanceId
takeWorkflowAction(instanceId, action, comment)   // action: APPROVE | REJECT | DELEGATE
previewWorkflow(requestType, context)             // → [approver chain]
processSLABreaches()                              // cron job
getPendingApprovalsV2(userId)
getWorkflowInstanceDetailV2(instanceId)
getMyWorkflowRequests(userId)
getWorkflowStatusForRequest(requestId)
```

**Workflow decision buttons:** Approve · Reject · Delegate (canonical set — all three always present)

---

### 5.3 `notification` — Multi-channel Notifications

**Channels:** `IN_APP | EMAIL | SMS | PUSH | ARIA`

**Notification types:**
```
DOCUMENT_EXPIRY       — visa/EID/passport expiry warning
LEAVE_REQUEST         — new leave request submitted
LEAVE_APPROVED / _REJECTED
PAYROLL_DEADLINE      — payroll cutoff reminder
APPROVAL_REQUIRED     — new approval waiting
APPROVAL_ESCALATION   — SLA breach escalation
ARIA_ALERT            — ARIA-generated insight
SYSTEM_ALERT          — system health alert
```

**Public API:**
```typescript
getMyNotifications(userId, filters)
getUnreadCount(userId)
markNotificationRead(notificationId)
markAllRead(userId)
getApprovalDetail(instanceId)
approveRequest(instanceId, comment)
rejectRequest(instanceId, comment)
```

---

### 5.4 `absence` — Leave Management

**Key tables:** `absenceEntries` · `absenceBalances` · `absenceCycles`

**Leave rules scoped by:** Legal entity type × Nationality × Employment type

**Key business rules:**
- `BR-AL-001` — UAE minimum 22 calendar days annual leave
- Nursing break entitlement (FDL 33/2021 amendment) tracked per person
- Certificate policy — `absence-cert-policy.ts` defines which reasons require medical certificate
- Blackout periods — `blackoutPeriods` table freezes leave requests during critical windows

---

### 5.5 `payroll` — Payroll Processing

**Features:**
- WPS SIF file generation (MoHRE Wage Protection System)
- GL journal entry generation for Oracle ERP
- EOSB calculation routing:
  - Traditional gratuity (21 days/year ≤5 years, 30 days after)
  - VSS (Voluntary Savings Scheme)
  - DEWS (DIFC Employee Workplace Savings)
  - GPSSA (UAE nationals — government pension)
- Payroll blocking on document expiry or active investigation

**Key tables:** `payrollRuns` · `salaryElements` · `wpsSifRecords` · `glJournalLines`

---

### 5.6 `audit` — Immutable Audit Trail

**Architecture:** INSERT-only `audit_log` table. Zero updates. Zero deletes. Ever.

```typescript
// Called inside EVERY db.transaction()
await writeAuditLog({
  tableName: 'persons',
  recordId: personId,
  action: 'UPDATE',
  fieldChanges: diffFields(before, after),
  reason: 'Employment data update'
}, session.user)
```

**Mandatory 7 audit columns on every table:**
`created_by` · `created_date` · `updated_by` · `last_updated_date` · `updated_date` · `created_by_name` · `updated_by_name`

---

### 5.7 `auth` — Authentication & Session

**Providers:**
1. Microsoft Entra ID (OIDC) — Production SSO for Avaniis
2. Credentials — Dev-only, 7 hardcoded demo accounts (`NODE_ENV=development`)

**Session JWT payload:**
```typescript
{
  id: string           // user UUID
  email: string
  name: string
  role: UserRole
  legalEntityId: string
  personId: string     // linked employee record
}
```

**Dev accounts:**
| Email | Role |
|---|---|
| `super.admin@avaniis.dev` | SUPER_ADMIN |
| `hr.admin@avaniis.dev` | HR_ADMIN |
| `hr.director@avaniis.dev` | HR_DIRECTOR |
| `manager@avaniis.dev` | MANAGER |
| `employee@avaniis.dev` | EMPLOYEE |
| `finance@avaniis.dev` | FINANCE_MANAGER |
| `payroll@avaniis.dev` | PAYROLL_ADMIN |

---

### 5.8 `compliance` — UAE Labour Law Engine

**57 coded business rules** (BR-xx) stored in `complianceRules` table.

**6 synchronous guards** (`modules/config/guards.ts`):
```typescript
assertNotSystemField(fieldCode)
// Prevents mutation of system-owned fields (BR-CONF-001)

assertLeaveRuleNotBelowMinimum(days, entityType)
// UAE minimum 22 days annual leave (BR-AL-001)

assertMaxCustomFields(entityCode, activeCount)
// Max 50 active custom fields per entity (BR-CONF-003)

assertWorkflowRoleValid(role)
// Approver role must be a recognized role code (BR-WF-001)

assertEscalationRoleHigher(stepRole, escalationRole)
// Escalation approver must outrank step approver (BR-WF-002)

assertPlaceholdersValid(template, availableTokens)
// Notification template {{tokens}} must exist in context (BR-NOTIF-001)
```

Guards are synchronous (no `'use server'`) and called before every config write.

---

### 5.9 `config` — Configuration Layer

Manages: custom fields · workflow definitions · work schedules · public holidays · leave rule sets · medical insurance plans · notification templates · feature permissions · user preferences

**Config resolution:** `lib/config-resolver.ts` resolves entity-aware rules (e.g., leave rules differ by DIFC vs MAINLAND entity type).

---

### 5.10 `aria` — AI Assistant

See Section 11 for full ARIA detail.

---

### 5.11 `employee-letters` — Document Generation & E-Signing

**Template categories:** Offer letter · Employment contract · Salary certificate · NOC · Experience letter · Exit letter

**Key tables:** `letterTemplates` · `letterInstances` · `letterSignatures` · `letterTemplateTypes`

---

### 5.12 `timesheets` — Attendance Tracking

**Tables:** `timesheetEntries` · `timesheetExceptions` · `biometricSyncLog`

Biometric sync webhook: `/api/attendance/sync`

---

### 5.13 `reports` — Analytics & Dashboards

Pre-built dashboards: Hiring pipeline · Headcount trends · Retention/turnover · Absence analytics · Compliance status · Payroll analytics

---

### 5.14 `directory` — People Search

Full-text employee search. Filterable by department, grade, manager, location.

---

### 5.15 `access` — Feature Permissions

`featurePermissions(user_id, feature_code, enabled)`. Managed via Settings → Permissions matrix.

---

## 6. Database Design Approach

### 6.1 Core Principles

1. **Never hard-delete** — `lib/effective-date.ts` implements close+open pattern
2. **Single-tenant Phase 1** — `tenant_id DEFAULT '00000000-0000-0000-0000-000000000001'` on every table
3. **Immutable audit** — `audit_log` is INSERT-only forever
4. **Encrypted PII** — `emirates_id`, `passport_number`, `visa_number`, `labour_card_number`, `iban` encrypted with AES-256-GCM before insert
5. **Bilingual strings** — every user-facing name has `_en` and `_ar` variants
6. **JSONB for flexibility** — `extraData JSONB` on `persons`, JSON columns for workflow condition trees

### 6.2 Schema Files

| File | Size | Purpose |
|---|---|---|
| `foundation.ts` | 69 KB | `persons` (85+ cols), `positions`, `departments`, `worker_assignments`, `grades`, `jobs`, `legal_entities`, `locations`, `person_documents`, `person_dependents`, payroll tables, absence tables, `audit_log` |
| `configuration.ts` | 42 KB | `customFieldDefinitions`, `workflowDefinitions`, `leaveRuleSets`, `workSchedules`, `publicHolidays`, `notificationTemplates`, `featurePermissions`, `userPreferences`, `medicalInsurancePlans` |
| `transactions.ts` | 40 KB | `workflowInstances` (v1), `approvalDelegations`, `notificationLog`, `onboardingChecklists`, `blackoutPeriods`, `wpsSifRecords`, `glJournalLines` |
| `workflow-engine.ts` | 29 KB | `workflowRules`, `workflowHierarchies`, `workflowInstancesV2`, `workflowStepInstances`, `workflowAuditLog`, `workflowEmailTokens`, `workflowSlaCalendars`, `organizationHierarchySnapshots` |
| `timesheets.ts` | 8.5 KB | `timesheetEntries`, `timesheetExceptions`, `biometricSyncLog` |
| `employee-letters.ts` | 7.5 KB | `letterTemplates`, `letterInstances`, `letterSignatures`, `letterTemplateTypes` |
| `actions.ts` | 4.4 KB | `hiringRequests` (22 cols), `transferRequests` (20 cols) |
| `org-cache.ts` | 1.5 KB | `orgHierarchySnapshots` |

**Total: 85+ tables · 8 schema files · 25 migrations (0000–0024)**

### 6.3 Key Relationships

```
legalEntities
    └── persons (legal_entity_id)
            └── worker_assignments (person_id, position_id, line_manager_id)
                    └── absenceEntries (person_id)
                    └── payrollRuns → salaryElements
positions (self-ref: reports_to_position_id)
    └── departments (self-ref: parent_department_id)
workflowRules
    └── workflowInstancesV2 (rule_id)
            └── workflowStepInstances (instance_id)
            └── workflowAuditLog (instance_id)
letterTemplates
    └── letterInstances (template_id, person_id)
            └── letterSignatures (instance_id)
```

---

## 7. Roles & Permissions

### 7.1 Role Hierarchy

```
SUPER_ADMIN
    ↓
HR_DIRECTOR
    ↓
HR_ADMIN
    ↓
PAYROLL_ADMIN
    ↓
FINANCE_MANAGER
    ↓
MANAGER
    ↓
EMPLOYEE
```

### 7.2 Role Access Matrix

| Feature | SUPER_ADMIN | HR_DIRECTOR | HR_ADMIN | PAYROLL_ADMIN | FINANCE_MANAGER | MANAGER | EMPLOYEE |
|---|---|---|---|---|---|---|---|
| Employee CRUD | ✅ | ✅ | ✅ | read | read | team only | self only |
| Payroll | ✅ | ✅ | ✅ | ✅ | GL only | ❌ | ❌ |
| Master Data | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Workflow config | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approvals (action) | ✅ | ✅ | ✅ | ❌ | ❌ | assigned only | ❌ |
| Leave approval | ✅ | ✅ | ✅ | ❌ | ❌ | team only | ❌ |
| Leave request | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Reports | ✅ | ✅ | ✅ | partial | partial | team only | ❌ |
| ARIA | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Org chart | ✅ | ✅ | ✅ | ❌ | ❌ | view | view |

### 7.3 Route-Level Guards (middleware.ts)

```typescript
'/master-data'  → [HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN]
'/access'       → [HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN]
'/users'        → [HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN]
'/settings'     → [HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN]
```

### 7.4 Server Action Auth Pattern

```typescript
const session = await auth()
requireRole(session, 'HR_ADMIN')  // throws AuthError if insufficient
```

---

## 8. Workflow Engine

### 8.1 Architecture — V2 Hybrid Engine

**Core concepts:**

| Concept | Description |
|---|---|
| `WorkflowRule` | Defines conditions + steps for a request type |
| `ConditionNode` | `SimpleCondition \| GroupCondition` (AND/OR nested) |
| `HierarchyType` | `LINE_MANAGER` · `POSITION` · `CUSTOM_GROUP` |
| `StepEffect` | `AND` (all must approve) or `OR` (any one advances) |
| `SLABreachAction` | `ESCALATE \| AUTO_APPROVE \| NOTIFY` |

**Submit flow:**
```
submitWorkflow(requestType, requestId, context)
    → Evaluate condition trees → select matching WorkflowRule
    → Materialize steps → WorkflowStepInstances
    → Capture org snapshot → organizationHierarchySnapshots
    → Dispatch notifications to step-1 approvers
    → workflowInstancesV2.status = IN_PROGRESS
```

**Decision flow:**
```
Approver clicks email link (HMAC token) OR uses /approvals inbox
    → takeWorkflowAction(instanceId, APPROVE | REJECT | DELEGATE, comment)
    → workflowAuditLog INSERT
    → If AND: wait for co-approvers
    → If OR: advance immediately
    → If last step + APPROVED: apply effect
    → Dispatch outcome notifications
```

**SLA enforcement (cron: `/api/cron/workflow-sla`):**
- `workflowSlaCalendars` defines UAE working hours (Sun–Thu, excl. public holidays)
- `processSLABreaches()` runs hourly, checks `workflowStepInstances.sla_deadline`

### 8.2 Pre-built Workflow Templates

| Template | Steps |
|---|---|
| New Hire Approval | HR Admin → HR Director → CEO |
| Transfer / Promotion | Line Manager → HR Director |
| Leave Request | Line Manager |
| Contract Amendment | HR Admin → Finance → CEO |
| Resignation Acceptance | Line Manager → HR Admin |
| EOSB Payment | HR Admin → Finance → CFO |

---

## 9. Notification & Document Systems

### 9.1 Notification Pipeline

```
Event trigger
    → notification module action
    → look up notificationTemplates (type + channel)
    → resolve {{tokens}} from context
    → assertPlaceholdersValid() guard
    → INSERT into workflowNotificationQueue (Postgres outbox)
    → background worker:
        IN_APP  → INSERT into notificationLog
        EMAIL   → Azure Communication Services API
        SMS     → (stub, not connected)
        PUSH    → (stub, not connected)
```

### 9.2 Letter Generation & E-Signing Pipeline

```
HR Admin: select template + employee → generateLetter(templateId, personId)
    → fetch person + contract data
    → substitute {{tokens}}
    → render PDF via @react-pdf/renderer
    → upload to Azure Blob → INSERT letterInstances (status: DRAFT)

sendLetter(instanceId)
    → generate HMAC-signed link (7-day expiry)
    → email PDF + link to employee
    → letterInstances.status = SENT

Employee opens public link /letters/sign/[token] (no login required)
    → verify HMAC token + expiry
    → display PDF preview + signature form

signLetter(token, signatureData)
    → INSERT letterSignatures (signer, timestamp, IP, image)
    → re-render PDF with signature block
    → upload signed copy to Azure Blob
    → letterInstances.status = SIGNED
```

**Token examples:** `{{employee.fullName}}` · `{{contract.startDate}}` · `{{contract.basicSalary}}` · `{{company.name}}` · `{{signatory.name}}`

---

## 10. Org Chart System

### 10.1 Architecture

**Route:** `/org-chart` — full-screen (56 px top bar, no sidebar padding)

**Data source:** `lib/org-chart/build-tree.ts` — `getOrgTree(filters)` uses PostgreSQL recursive CTE:
```sql
WITH RECURSIVE org_tree AS (
  SELECT p.*, 0 AS depth FROM positions p
  WHERE reports_to_position_id IS NULL
  UNION ALL
  SELECT p.*, ot.depth + 1
  FROM positions p
  JOIN org_tree ot ON p.reports_to_position_id = ot.id
)
SELECT ... FROM org_tree
LEFT JOIN worker_assignments wa ON ...
LEFT JOIN persons per ON wa.person_id = per.id
```

**Canvas:** `@xyflow/react 12.10.2` (version locked — do not upgrade)

**Node dimensions:** 220 × 112 px · H-gap: 40 px · V-gap: 80 px

### 10.2 Node Types & Status Rings

| Node type | Description |
|---|---|
| `EmployeeNode` | Filled position — shows avatar, name, title, department |
| `VacantNode` | Unfilled position — red styling |

| Ring colour | Token | Meaning |
|---|---|---|
| Amber | `--org-acting` (#F59E0B) | Acting assignment |
| Red | `--org-vacant` (#EF4444) | Vacant position |
| Amber dashed | `--org-frozen` (#F59E0B) | Budget frozen |
| Blue | `--org-contractor` (#3B82F6) | Contractor |
| Orange | `--org-overloaded` (#F97316) | >8 direct reports |
| Grey dashed | — | 0 direct reports |
| Accent | `--accent` | Highlighted by ARIA or search |

### 10.3 Component Hierarchy

```
OrgChartShell (master state)
    ├── OrgChartCanvas (@xyflow/react)
    │       ├── EmployeeNode
    │       └── VacantNode
    ├── Filter Panel
    ├── Active Filter Chips
    ├── Stats Bar
    ├── Legend
    ├── Action Panel
    │       ├── HiringRequestDrawer
    │       ├── TransferRequestDrawer
    │       └── ActingManagerDrawer
    ├── Analytics Panel (5 sections)
    └── ARIA Chat Panel
```

### 10.4 Chart Event Bus (`lib/org-chart/chart-events.ts`)

Typed `EventTarget`-based bus (SSR-safe):

```typescript
type OrgChartEventType =
  | 'PAN_TO_NODE'     // centre canvas + highlight node
  | 'FILTER_VACANT'   // apply vacant-only filter
  | 'FILTER_DEPT'     // reload tree for department
  | 'RELOAD_FULL'     // reload full tree, clear highlights
  | 'RELOAD_MY_TEAM'  // reload current user's team
  | 'HIGHLIGHT_NODES' // add accent ring to node IDs
```

---

## 11. ARIA AI Capabilities

### 11.1 Architecture

```
User message (chat UI at /me/aria OR org chart panel)
    → /api/aria/chat POST
    → sendAriaMessage()
    → Intent routing:
        ├── ORG_PAN_TO_NODE     → fires PAN_TO_NODE chart event
        ├── ORG_FILTER_VACANT   → fires FILTER_VACANT chart event
        ├── ORG_FILTER_DEPT     → fires FILTER_DEPT chart event
        ├── ORG_HIGHLIGHT       → fires HIGHLIGHT_NODES chart event
        ├── APPROVAL_ASSIST     → getPendingApprovalsForUser()
        ├── LEAVE_RECOMMEND     → getLeaveRecommendationForInstance()
        ├── HR_POLICY_LOOKUP    → getKnowledgeSources() + RAG
        └── PEOPLE_INTEL        → getPeopleIntelligence()
    → Context gathering
    → Anthropic Claude API call
    → Response + optional chart events
```

### 11.2 Capabilities

| Capability | Description |
|---|---|
| Approval assistant | "How many approvals are waiting for me?" |
| Leave recommendation | Advises on team coverage before approving leave |
| Workflow summary | Pipeline overview for HR directors |
| Org navigation | "Go to Finance department", "Show Dubai Marina team" |
| Org filtering | "Show all vacant positions", "Highlight contractors" |
| HR policy Q&A | Answers from uploaded knowledge sources |
| People intelligence | Org structure queries and insights |

### 11.3 Admin Configuration (Settings → AI Agent)

```typescript
updateAgentIdentity(name, persona)     // customize ARIA's name/persona
updateModelConfig(modelId, params)     // Claude model selection
uploadKnowledgeSource(document)        // RAG knowledge base upload
```

### 11.4 Key Types

```typescript
type AriaIntentCode =
  | 'ORG_PAN_TO_NODE' | 'ORG_FILTER_VACANT' | 'ORG_FILTER_DEPT'
  | 'ORG_HIGHLIGHT' | 'APPROVAL_ASSIST' | 'LEAVE_RECOMMEND'
  | 'HR_POLICY_LOOKUP' | 'PEOPLE_INTEL'

interface AriaSessionContext {
  userId: string
  role: UserRole
  currentView: string
  selectedNodeId?: string
}
```

---

## 12. Dashboards & Reporting

### 12.1 HR Admin Dashboard (`/dashboard`)

- Total headcount by legal entity
- Active / on-leave / suspended breakdown
- Pending approvals count
- Document expiry warnings (next 30 days)
- Vacant positions count

### 12.2 Pre-built Reports (`/reports`)

| Report | Key metrics |
|---|---|
| Hiring Pipeline | Requisitions by status, time-to-hire, open vacancies |
| Headcount Trend | Monthly headcount by dept/grade/nationality |
| Retention & Turnover | Monthly leavers, turnover %, avg tenure |
| Absence Analytics | Leave utilization, top 10 by absence days, patterns |
| Compliance Status | Document expiry calendar, pending renewals |
| Payroll Analytics | Salary distribution by grade, EOSB liability estimate |

### 12.3 Org Chart Analytics Panel (5 sections)

1. Headcount summary — total, filled, vacant, frozen
2. Manager load distribution — histogram of direct reports
3. Acting assignments — list with end dates
4. Vacancy aging — time since vacancy opened
5. Department summary — per-department headcount + vacancy rate

---

## 13. Configuration Layer

### 13.1 Settings Pages (20+ pages under `/settings`)

| Page | Configures |
|---|---|
| Appearance | Theme colour (7 accents), density, language (EN/AR), dark mode |
| Branding | Logo, signatory name/title, document header/footer |
| Custom Fields | Dynamic fields per entity (max 50 per entity) |
| Leave Rules | Accrual policy per entity type × nationality × employment type |
| Work Schedules | Daily time slots + Ramadan schedule patterns |
| Absence Types | Leave type definitions (paid/unpaid, accrual, cert required) |
| Holiday Calendars | Public holidays (Hijri floating dates) by year |
| Letter Templates | Rich-text templates with {{token}} library |
| Notifications | Template editor per type × channel |
| Permissions | Feature permission matrix (role × feature) |
| Delegations | Delegation rules (delegator → delegate, date range) |
| Employee Numbers | Employee ID format and sequence |
| Policy | Data retention periods per data type |
| Compliance | BR-xx rule enforcement toggles |
| Form Layout | Person form field ordering (drag-and-drop) |
| AI Agent | ARIA persona, model, knowledge sources |
| Workflows | Workflow template management |

### 13.2 Dynamic Custom Fields

`customFieldDefinitions` table — HR Admin can define extra fields per entity without code changes. Max 50 per entity (`assertMaxCustomFields` guard). Values stored in `extraData JSONB` on `persons`.

---

## 14. Testing Strategy

### 14.1 Test Pyramid

```
                  ┌──────────────────────┐
                  │   E2E (Playwright)   │  10+ flows
                  └──────────────────────┘
              ┌──────────────────────────────┐
              │  Integration (Vitest)        │  12+ suites — real DB, no mocks
              └──────────────────────────────┘
          ┌──────────────────────────────────────┐
          │  Unit (Vitest)                       │  15+ suites
          └──────────────────────────────────────┘
      ┌──────────────────────────────────────────────┐
      │  Security (Vitest) + Accessibility (axe-core) │
      └──────────────────────────────────────────────┘
```

### 14.2 Unit Tests (`tests/unit/`)

| Suite | Covers |
|---|---|
| `core-hr-services.test.ts` | Person CRUD, name composition |
| `leave-rule-resolver.test.ts` | Entitlement calc (entity × nationality) |
| `compliance-engine.test.ts` | BR-* guard assertions |
| `gpssa.test.ts` | UAE pension eligibility |
| `absence-cert-policy.test.ts` | Certificate requirements |
| `org-chart-*.test.ts` | Tree filtering, node status |
| `date-utils.test.ts` | Hijri ↔ Gregorian conversion |
| `eosb-calculations.test.ts` | Traditional / VSS / DEWS routing |
| `payroll-suspension.test.ts` | Payroll blocking logic |
| `aria-*.test.ts` | Intent routing, recommendation logic |

### 14.3 Integration Tests (`tests/integration/`)

**Rule: always hit a real PostgreSQL database — no mocks** (learned from past incident where mock/prod divergence masked a broken migration).

| Suite | Covers |
|---|---|
| `core-hr-actions.test.ts` | Person + position CRUD |
| `employment-actions.test.ts` | Hire / transfer / promotion flow |
| `absence-balance-engine.test.ts` | Accrual + request + approval |
| `workflows.test.ts` | Submit → approve → complete |
| `notifications.test.ts` | Dispatch + delivery status |
| `employee-letters.test.ts` | Generation + signing |
| `bank-dependents-documents.test.ts` | PII encryption round-trip |
| `contracts-actions.test.ts` | Amend + terminate |
| `mdm-crud.test.ts` | Master data CRUD + change history |

### 14.4 Security Tests (`tests/security/`)

`auth-session` · `encryption-audit` · `rbac-tests` · `security-static` · `mfa-enforcement`

### 14.5 Test Commands

```bash
pnpm test          # unit + integration (Vitest)
pnpm test:e2e      # Playwright E2E
pnpm typecheck     # tsc --noEmit
pnpm build         # production build check
```

**E2E logbook:** `tests/e2e/e2etestresults.md` — updated with a numbered entry after every Playwright run.

---

## 15. Coding Rules (Non-Negotiables)

### 15.1 Hard Rules

| # | Rule |
|---|---|
| HR-1 | Every DB write = Drizzle transaction + `audit.log()` in **same** transaction |
| HR-2 | HR records **never deleted** — use `lib/effective-date.ts` (close + open) |
| HR-3 | PII fields (`emirates_id`, `passport_number`, `iban`) encrypted via `lib/encryption.ts` before persist |
| HR-4 | Every user-facing string needs `name_en` AND `name_ar` (bilingual mandatory) |
| HR-5 | Server Actions: auth → validate → business rules → tx+audit → revalidate |
| HR-6 | Cross-module imports **only** via `modules/*/index.ts` barrel exports |
| HR-7 | CSS uses tokens (`var(--accent)`) — **never raw hex** |
| HR-8 | Config writes must call `modules/config/guards.ts` before DB insert/update |
| HR-9 | Every compliance rule cited as `BR-xx` in code comments at enforcement point |
| HR-10 | `tenant_id` on every table insert (DEFAULT `'00000000-0000-0000-0000-000000000001'::uuid`) |

### 15.2 Server Actions Template

```typescript
'use server'
export async function actionName(input: InputType): Promise<OutputType> {
  // 1. Auth check
  const session = await auth()
  requireRole(session, 'HR_ADMIN')

  // 2. Input validation
  const data = InputSchema.parse(input)

  // 3. Business rules — BR-AL-001: minimum 22 days annual leave
  assertLeaveRuleNotBelowMinimum(data.days, legalEntity.entityType)

  // 4. Transaction with audit
  const result = await db.transaction(async (tx) => {
    const [record] = await tx
      .insert(targetTable)
      .values({ ...data, tenant_id: TENANT_ID })
      .returning()

    await writeAuditLog({
      tableName: 'target_table',
      recordId: record.id,
      action: 'INSERT',
      newValues: record,
      reason: 'HR action reason'
    }, session.user)

    return record
  })

  // 5. Cache invalidation
  revalidatePath('/relevant-path')
  return result
}
```

### 15.3 Additional Constraints

- **Package manager:** pnpm only
- **No new external dependencies** without explicit approval
- **No new tables** touching >3 existing tables without design review
- **Workflow decisions:** Approve · Reject · Delegate — all three always present
- **Comments:** Only for non-obvious WHY — no docblocks, no task references

---

## 16. Known Gaps / Issues

### 16.1 Not Yet Built

| Area | Status | Notes |
|---|---|---|
| WPS SIF generation | Stub | `wpsSifRecords` table exists; generator not implemented |
| Oracle ERP GL export | Stub | `glJournalLines` table exists; export not built |
| SMS notifications | Stub | Channel defined; no SMS provider connected |
| Push notifications | Stub | Channel defined; no push provider connected |
| Biometric device integration | Partial | Webhook endpoint exists; device protocol incomplete |
| GPSSA portal submission | Planned | Eligibility logic exists; portal API not built |
| Multi-tenancy | Phase 3 | Single tenant only in Phase 1 |
| Mobile app | Out of scope | React Native explicitly rejected (ADR-001) |
| pgvector RAG for ARIA | Partial | Knowledge upload works; vector search not fully wired |

### 16.2 Known Limitations

- Absence accrual cron runs in-process (node-cron) — not distributed; single instance only
- Org chart recursive CTE performance on >5000 nodes is untested
- Workflow v1 and v2 schemas coexist; v1-to-v2 instance migration not implemented (v1 unused)
- Arabic UI tokens exist; translations not 100% complete for all pages
- SLA calendar only has one UAE template; multi-entity SLA calendars not built

---

## 17. Key Design Decisions

| Decision | Rationale |
|---|---|
| Monolith over microservices | Phase 1 single-tenant MVP; small team; DB transactions work across modules; extract services in Phase 3 if needed |
| Drizzle over Prisma/TypeORM | Minimal SQL overhead, no runtime magic, type-safe, no ORM hidden N+1 risks |
| Server Actions over REST (internal) | No round-trip overhead, no extra API layer, type-safe across client/server boundary |
| AES-256-GCM field encryption | Works on any Postgres instance (local + Azure); no cloud-specific extensions needed |
| Postgres outbox (no Redis/Kafka) | Provides at-least-once delivery with full audit trail; Redis/Kafka rejected per ADR-001 |
| No hard delete — ever | UAE Labour Law requires 5-year post-termination data retention |
| Org hierarchy snapshots at submit time | Approver chain frozen when submitted; mid-approval org moves cannot invalidate decisions |
| JWT sessions (no DB sessions) | Stateless, no cleanup needed, works with horizontal scaling |

---

## 18. End-to-End Data Flow Examples

### 18.1 Employee Creation Flow

```
HR Admin → /persons/new
    ↓
createPerson() Server Action
    1. auth() → requireRole('HR_ADMIN')
    2. PersonSchema.parse(input)
    3. encrypt emirates_id, passport_number
    4. db.transaction(tx =>
           INSERT INTO persons (... encrypted fields ..., tenant_id)
           INSERT INTO worker_assignments (person_id, position_id, ...)
           writeAuditLog × 2
       )
    5. submitWorkflow('NEW_HIRE', personId, context)  ← if configured
    6. revalidatePath('/persons')
    ↓
Person status = PENDING_HIRE → workflow approval
    ↓
On final APPROVE: person status = ACTIVE
```

### 18.2 Approval Workflow Flow

```
Request submitted (hire, transfer, leave, contract amendment)
    ↓
submitWorkflow(requestType, requestId, context)
    → Evaluate condition trees → select WorkflowRule
    → Materialize WorkflowStepInstances
    → Capture organizationHierarchySnapshots (immutable)
    → Dispatch notifications to step-1 approvers
    → status = IN_PROGRESS
    ↓
Approver: email link (HMAC token) OR /approvals inbox
    ↓
takeWorkflowAction(instanceId, APPROVE | REJECT | DELEGATE, comment)
    → INSERT workflowAuditLog
    → AND: wait for co-approvers / OR: advance immediately
    → Last step + APPROVED: apply downstream effect
    → Dispatch outcome notification
```

### 18.3 Document Generation & Signing Flow

```
HR Admin: /employee-letters → select template + employee
    ↓
generateLetter(templateId, personId)
    → fetch person + contract
    → substitute {{tokens}}
    → render PDF (@react-pdf/renderer)
    → upload to Azure Blob
    → INSERT letterInstances (status: DRAFT)
    ↓
sendLetter(instanceId)
    → generate HMAC-signed link (7-day expiry)
    → email PDF + /letters/sign/[token] to employee
    → status: SENT
    ↓
Employee opens public link (no login required)
    → verify HMAC + expiry
    → display PDF + signature form
    ↓
signLetter(token, signatureData)
    → INSERT letterSignatures (signer, timestamp, IP, image)
    → re-render PDF with signature block
    → upload signed PDF to Azure Blob
    → status: SIGNED
```

---

## 19. Integration Points

### 19.1 External Integrations

| System | Method | Status |
|---|---|---|
| Microsoft Entra ID | OIDC SSO via Auth.js | ✅ Working |
| Azure Blob Storage | SDK v12 | ✅ Working |
| Azure Communication Services | SDK (email) | ✅ Working |
| Anthropic Claude API | REST API | ✅ Working |
| Oracle ERP | GL journal export | 🟡 Schema ready, export not built |
| MoHRE WPS | SIF file | 🟡 Schema ready, generator not built |
| Biometric devices | Webhook POST | 🟡 Endpoint exists, protocol incomplete |
| GPSSA Portal | API submission | 🔴 Not built |
| SMS provider | Notification channel | 🔴 Not connected |

### 19.2 Internal Module Data Flow

```
core-hr ──── persons, positions, assignments
    ↓
workflow ← absence (leave requests)
         ← core-hr (hire, transfer, promotion)
         ← payroll (EOSB payment)
    ↓
notification ← workflow (approval events)
             ← compliance (expiry alerts)
    ↓
audit ← ALL modules (every single write)

payroll ← core-hr (salary)
        ← absence (approved leave)
        ← timesheets (attendance)
        → GL export (Oracle ERP — stub)
        → WPS SIF (MoHRE — stub)

aria ← workflow (pending approvals)
     ← core-hr (people data)
     ← absence (leave context)
     ← compliance (alerts)
     → org-chart event bus (fires chart events)

employee-letters ← core-hr (person + contract)
                 ← config (letter templates)
                 → Azure Blob (PDF storage)
                 → notification (email delivery)
```

---

## 20. Environment Variables Reference

```bash
# Database
POSTGRES_URL=postgresql://user:pass@localhost:5432/avaniis_hr

# Security
FIELD_ENCRYPTION_KEY=<32-byte hex>        # AES-256-GCM PII encryption
AUTH_SECRET=<random string>               # Auth.js JWT signing

# Microsoft Entra ID (SSO)
AZURE_AD_TENANT_ID=<tenant-uuid>
AZURE_AD_CLIENT_ID=<client-uuid>
AZURE_AD_CLIENT_SECRET=<secret>

# Azure Storage
AZURE_STORAGE_CONNECTION_STRING=<string>
AZURE_STORAGE_CONTAINER_NAME=avaniis-hr-documents

# Azure Communication Services (email)
AZURE_COMMUNICATION_CONNECTION_STRING=<string>
AZURE_COMMUNICATION_FROM_ADDRESS=noreply@avaniis.ae

# AI
ANTHROPIC_API_KEY=<key>

# App
NEXTAUTH_URL=https://hr.avaniis.ae
NEXT_PUBLIC_APP_URL=https://hr.avaniis.ae
MAG_TENANT_UUID=00000000-0000-0000-0000-000000000001
NODE_ENV=development                      # enables dev credentials
```

---

## 21. Design System Reference

```css
/* Surfaces */
--bg:       #F0F2F5   /* page background */
--surface:  #F5F6F8   /* secondary bg, hover */
--card:     #FFFFFF   /* cards, panels, drawers */
--border:   #E5E8EC   /* dividers, input borders */

/* Text */
--ink-1: primary text
--ink-2: secondary text
--ink-3: muted / placeholder
--ink-4: disabled

/* Accent — Teal default (theme-switchable, 7 colours) */
--accent:       #2E6170   /* primary buttons, active states */
--accent-050:             /* very light tint */
--accent-100:             /* focus rings, selected bg */
--accent-200:             /* hover borders */
--accent-700:             /* dark accent, text on light bg */

/* Navigation */
--nav-bg:           #0F2E38   /* dark blue sidebar */
--nav-fg:                      /* sidebar text */
--nav-active-bg:               /* active nav item */
--nav-active-fg:               /* active nav item text */

/* Status pills */
--status-pending-bg/fg
--status-approved-bg/fg
--status-rejected-bg/fg
--status-draft-bg/fg

/* Org chart status rings */
--org-acting:       #F59E0B   /* amber — acting assignment */
--org-vacant:       #EF4444   /* red — vacant position */
--org-frozen:       #F59E0B   /* amber — budget frozen */
--org-contractor:   #3B82F6   /* blue — contractor */
--org-overloaded:   #F97316   /* orange — >8 direct reports */

/* Fonts */
--font-sans:  Inter           /* body, labels, UI */
--font-serif: Fraunces        /* headings, display numbers */
--font-mono:  JetBrains Mono  /* codes, emails, IDs */
```

---

## 22. How to Use This Document as an AI Prompt Baseline

When starting a new ChatGPT or Claude session for AVANIIS HR work:

1. **Paste this entire file** as the first message or as a system context block.

2. **For new features**, prompt as:
   > "Using the AVANIIS HR context above, I want to build [X]. The relevant modules are [Y and Z]. Follow all Hard Rules listed in Section 15 and the Server Actions template."

3. **For business rule questions**, reference BR-xx codes:
   > "Explain how BR-AL-001 applies to DIFC employees versus MAINLAND employees."

4. **For schema questions**, point to the schema file and table:
   > "Using `drizzle/schema/foundation.ts`, add a column to the `persons` table for [X]. Follow the effective-date pattern."

5. **For identifying what to build next**, start from Section 16 (Known Gaps).

6. **For workflow design**, reference Section 8.2 (pre-built templates) and the WORKFLOW_ENGINE_DESIGN.md doc.

---

*AVANIIS HR System Context · Last updated: May 2026 · Phase 1 MVP · Sprints 1–11 complete*
*Primary engineer: Avaniis Engineering / Claude Code · Client: Avaniis UAE · Architecture review: April 2026*
