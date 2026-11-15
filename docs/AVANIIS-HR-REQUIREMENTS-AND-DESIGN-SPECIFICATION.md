# AVANIIS HR — Requirements & Design Specification (SRS + SDD)

> **The foundational requirements & design document** on which the AVANIIS HR system was built.
> **Date:** 2026-06-04 · **Status:** Phase 1 MVP complete & QA-certified
> **Client:** Avaniis / Avaniis (UAE)
> **Production:** http://localhost:3001
> **Companion document:** `docs/qa-qc/hr-requirements-uae-labour-law-validation.md` (law-by-law compliance proof)

---

## Version History

| Version | Date | Author | Change summary |
|---|---|---|---|
| 1.0 (BASELINE) | 2026-06-04 | HR Systems team | Initial consolidated baseline — checkpoint established. Derived from live codebase + project-memory package. |

> **Change control:** This is the living baseline. Minor/factual updates amend this document and add a
> row above (bump the minor version). Major scope or law changes are first written as a dated addendum
> in `docs/requirements-changelog/` and then merged here on the next version bump. See the change-control
> note in the Business Requirements package README.

---

## 0. How to Read This Document

This is the single consolidated specification that answers three questions:

1. **What laws (and at what level) does the system implement?** → §2
2. **What UAE compliance is integrated, and how?** → §3
3. **What was built — functionally and architecturally?** → §4 (requirements) and §5 (design)

Every requirement and design claim is **traceable to source code** (file:line) so it can be
independently verified. This document was **reverse-derived from the live codebase and the
project-memory package** (`docs/project-memory/2026-06-04/`, 19 files) — it is the authoritative
basis statement, not a forward-looking wish list.

**Legal caveat:** This describes how the software implements UAE law. It is **not a legal opinion**.
Final compliance sign-off requires a licensed UAE labour-law advisor (see companion validation doc §5).

---

## 1. Product Overview

AVANIIS HR is an **AI-native, bilingual (English/Arabic), UAE-compliant Human Capital Management
(HCM) platform** covering the full employee lifecycle:

> Hiring → Onboarding → Core HR records → Org structure → Leave/Absence → Timesheets →
> Payroll (WPS/GPSSA/DEWS/EOSB) → Insurance → Letters → Offboarding → Reporting → AI assistant (ARIA)

**Defining characteristics (the non-negotiable product requirements):**

| # | Requirement | Why |
|---|---|---|
| P1 | Bilingual throughout — every user-facing field has `_en` **and** `_ar` | UAE business + government requirement |
| P2 | UAE Labour Law compliant — rules cited as `BR-xx` with statute references | Legal compliance |
| P3 | PII encrypted at field level (Emirates ID, passport, IBAN) | UAE PDPL (FDL 45/2021) |
| P4 | HR records never hard-deleted — effective-date pattern | Auditability / labour record-keeping |
| P5 | Every business write produces an immutable audit trail | Governance / dispute defence |
| P6 | Multi-jurisdiction aware (Mainland / DIFC / ADGM / Free-zone) | UAE entities span jurisdictions |

---

## 2. Legal Foundation — The Levels of Law Implemented

This directly answers *"what level laws are being implemented."* The system is built against **four
levels of UAE legal authority**, and is **jurisdiction-aware** (it routes rules differently per entity type).

### 2.1 The Four Levels of Law

| Level | Authority | Instrument(s) implemented | Where it lives in the system |
|---|---|---|---|
| **L1 — Federal labour statute** | UAE Federal Government | **Federal Decree-Law No. 33 of 2021** (UAE Labour Law, private sector) + Cabinet resolutions | Core HR, Absence, Payroll rules (`BR-xx`) |
| **L2 — Federal social/data statutes** | UAE Federal Government | **GPSSA Federal Law No. 7 of 1999** (pensions); **FDL No. 45 of 2021** (PDPL — data protection) | Payroll (GPSSA), PII encryption + consent fields |
| **L3 — Regulatory authority rules** | MOHRE, UAE Central Bank | **MOHRE WPS Regulations** (Wages Protection System / SIF file) | Payroll WPS module |
| **L4 — Free-zone jurisdiction law** | DIFC, ADGM | **DIFC Employment Law No. 2 of 2019**; DEWS scheme | Separate entitlement sets, `eosbScheme` routing |

### 2.2 Jurisdiction Awareness (a core design requirement)

The system is **not single-jurisdiction**. The `legal_entities.entityType` field drives different
legal rule sets:

| Entity type | EOSB scheme | Leave entitlements | Evidence |
|---|---|---|---|
| **MAINLAND** | TRADITIONAL (gratuity, FDL 33/2021) | Federal entitlements (30/90/60-day etc.) | `drizzle/seed.ts:356-561` |
| **DIFC** | DEWS / VSS | DIFC set (20 working-day annual, 65-day maternity, 60-day sick) | `drizzle/seed.ts:625-701` |
| **ADGM / FREEZONE** | DEWS / VSS | Free-zone variants | `legalEntities.entityType` enum |

Evidence: `legalEntities.entityType` enum = `MAINLAND, DIFC, ADGM, FREEZONE`; `eosbScheme` enum =
`TRADITIONAL, VSS, DEWS` (`docs/project-memory/2026-06-04/04-DATABASE-MODEL.md:135-136`).

### 2.3 Statutory Sources Cited in Code

- **Federal Decree-Law No. 33 of 2021** — Articles 9 (probation), 17/19/26/65 (hours/overtime/holidays),
  29–33 (leave), 43 (notice), 51–53 (EOSB). *Primary source.*
- **GPSSA Federal Law No. 7 of 1999** — pension contributions (UAE nationals).
- **MOHRE WPS Regulations** — Salary Information File (SIF) submission.
- **DIFC Employment Law No. 2 of 2019** — free-zone entitlements.
- **FDL No. 45 of 2021 (PDPL)** — personal-data protection (encryption + consent).

> **Currency note (must be reviewed by counsel):** Recent instruments **not yet mapped** —
> FDL 57/2023 (revised pensions), FDL 13/2022 (unemployment insurance / ILOE), FDL 9/2024 (amendments).
> See companion validation doc §5.

---

## 3. UAE Compliance Integration — How It Is Enforced

This answers *"what compliance is integrated to UAE level laws."* Compliance is not a document — it is
**enforced in running code** at four integration points:

### 3.1 The Governed Compliance Rules Engine

A dedicated `compliance_rules` table holds **law-cited, version-controlled, audit-logged** rules. Each
rule carries: `ruleId` (e.g. `BR-EOSB-001`), `articleRef` (the statute citation), a `formula` (the
actual numbers), `entityTypes`, `nationalityScope`, `effectiveDate`, and an `isOverridable` lock.

**Governance control (key legitimacy feature):** rules with `isOverridable: false` (annual-leave
minimum, EOSB formula, GPSSA, probation, overtime) **cannot be edited via the UI** — only via a code
migration with a documented law-change justification. Every change writes an immutable
`COMPLIANCE_RULE.UPDATED` audit event with a mandatory reason (min 10 chars), SUPER_ADMIN-gated.
Evidence: `modules/compliance/actions.ts:57-127`; seed at `drizzle/seed.ts:715-787`.

### 3.2 The Compliance Matrix (statute → system value)

| Domain | UAE Law | System rule + value | Evidence | Status |
|---|---|---|---|---|
| Annual leave 30 days/yr | FDL 33/2021 Art. 29 | `ANNUAL maxDaysPerYear: 30` | `seed.ts:356` | ✅ |
| Sick leave 90 days, tiered (15/30/45) | Art. 31 | `SICK 90, TIERED, after 3-mo` | `seed.ts:357,499` | ✅ |
| Maternity 60 days (45 full+15 half) | Art. 30 | `MATERNITY 60, full pay` | `seed.ts:358,517` | ✅ |
| Parental/Paternity 5 working days | Art. 32 | `PATERNITY 5 (BR-AL-005)` | `seed.ts:359,533` | ✅ |
| Bereavement / Hajj | Art. 33 | `BEREAVEMENT 5; HAJJ 30 once` | `seed.ts:360-361` | ✅ |
| Probation max 6 months, 14-day notice | Art. 9 | `BR-PR-001 max_months:6` (locked) | `seed.ts:768` | ✅ |
| Notice period 30–90 days | Art. 43 | `BR-NP-001 30/60/90` (overridable) | `seed.ts:758` | 🟡 policy |
| Overtime +25% / +50% | Art. 19 | `BR-OT-001 1.25 / 1.50` (locked) | `seed.ts:778` | 🟡 verify night-hours |
| EOSB 21→30 days/yr, cap 24 mo | Art. 51–53 | `BR-EOSB-001` (locked) | `seed.ts:718` | ✅ |
| EOSB pro-ration <5 yrs | Art. 51(3) | `BR-EOSB-002` 33/67/100% | `seed.ts:728` | ✅ |
| GPSSA 5% / 12.5% (nationals) | GPSSA 7/1999 | `BR-GPSSA-001` | `seed.ts:748` | 🔴 rate currency |
| WPS payment by 14th, SIF format | MOHRE WPS | `BR-WPS-001 day:14` | `seed.ts:738` | 🟡 SIF format |
| PII encryption + consent | PDPL 45/2021 | AES-256-GCM + `pdplConsentGiven` | `lib/encryption.ts`; persons table | ✅ |
| DIFC free-zone entitlements | DIFC Law 2/2019 | `BR-DIFC-005` separate set | `seed.ts:625-701` | ✅ |

*Full version with all rows: `docs/qa-qc/hr-requirements-uae-labour-law-validation.md` §3.*

### 3.3 Point-of-Enforcement Rules (`BR-xx` annotations)

~80 business rules are enforced inline at every transaction (e.g. `BR-SL-002` sick-cert from Day 1,
`BR-PH-003` public-holiday pay, `BR-NP-001` notice derivation). Each is a code comment + a guard at the
write path, so the rule is applied *where the data is written*, not just documented.

### 3.4 UAE-Specific Data Model Fields

The `persons` table carries UAE compliance fields natively: `emiratesId` (encrypted), `visaNumber`,
`visaType`, `visaExpiry`, `labourCardNumber`, `labourCardExpiry`, `nationalityCategory`
(`UAE_NATIONAL/GCC_NATIONAL/EXPAT` — drives GPSSA eligibility), `pdplConsentGiven`.
Evidence: `04-DATABASE-MODEL.md:41-57`.

---

## 4. Functional Requirements (What Was Built)

21 modules, ~121 pages. Status per `docs/project-memory/2026-06-04/15-VERIFIED-IMPLEMENTATION-MATRIX.md`.

| # | Module | Functional scope | Status |
|---|---|---|---|
| 1 | **Core HR** | Person master, positions, departments, contracts, worker assignments, bank details, dependents, documents, probation, exit clearance, bulk import | ✅ Verified |
| 2 | **Employee Self-Service (ESS)** | Profile, leave requests, payslips, documents, letters, insurance view, timesheet, ARIA chat, directory, bank details (19 routes) | ✅ Verified |
| 3 | **Leave / Absence** | Requests, balances, accrual engine, carry-forward, leave rules, blackout periods, public holidays, backdate policy, medical-cert upload | ✅ Verified |
| 4 | **Workflow Engine** | Configurable multi-step approvals: submit/approve/reject/delegate, SLA breach, escalation, hierarchy (LINE_MANAGER/POSITION/CUSTOM_GROUP), AND/OR conditions | ✅ Verified (collision-hardened) |
| 5 | **Approvals** | HR Admin inbox, instance detail, operations view, my-requests (ESS) | ✅ Verified |
| 6 | **Notifications** | In-app + email queue (Postgres outbox), preferences, topbar quick-actions | ✅ Verified |
| 7 | **Employee Letters** | Templates, bilingual PDF (jsPDF), XSS-sanitised, token-based e-signing, lifecycle | ✅ Verified |
| 8 | **Document Management** | Upload/download, 36-type taxonomy, cloud-portable storage (Azure/S3/local), signed URLs | 🟡 UAT (prod storage blocker) |
| 9 | **Master Data (MDM)** | Legal entities, departments, positions, grades, locations, business units, jobs, projects, work schedules, leave types, holiday calendars | ✅ Verified |
| 10 | **RBAC / Access** | 7-role matrix, feature permissions (view/create/edit/delete/approve/export), MFA step-up, user management | ✅ Verified |
| 11 | **Payroll** | UAE WPS runs, salary elements, EOSB, GPSSA/DEWS, suspension pay, run lifecycle (DRAFT→ARCHIVED) | 🟡 UAE depth to verify |
| 12 | **AI / ARIA** | Claude-powered chat, intent resolution, daily briefing, HR-admin AI console, RAG knowledge sources | ✅ Verified |
| 13 | **Insurance** | Medical plans, enrolment lifecycle, dependent visa, contractor exceptions, plan auto-change | ✅ Verified |
| 14 | **Timesheets** | Daily hours, overtime, Ramadan schedule, team/personal views | ✅ Verified |
| 15 | **Reports / Analytics** | Role-segmented dashboards (HR Admin/Manager/Director/Finance/Employee), insurance reports | ✅ Verified |
| 16 | **Audit Trail** | INSERT-only immutable log on every write | ✅ Verified |
| 17 | **Migration Factory V2** | 9-step data migration wizard + source ingestion (classify/transform/build) | 🟡 Partial |
| 18 | **DataOps Console** | SUPER_ADMIN SQL console, NL-to-SQL, schema browser | ✅ Verified |
| 19 | **Org Chart** | Interactive canvas, recursive hierarchy, hiring/transfer drawers, export | ✅ Verified |
| 20 | **Compliance (UAE Law)** | Governed `BR-xx` rules engine + compliance settings UI | ✅ Verified |
| 21 | **Settings / Config** | Appearance, custom fields, workflow templates, leave rules, branding, letter templates, currency, policy (16 sub-pages) | ✅ Verified |

*Detailed file/table inventory: `docs/project-memory/2026-06-04/02-MODULE-MAP.md`.*

---

## 5. System Design (How It Was Built)

### 5.1 Architecture Style
- **Next.js 15 App Router** with React Server Components + **Server Actions** as the primary RPC mechanism (no separate internal API layer).
- **Monolith** — all business logic in `modules/`, all UI in `app/` + `components/`. No microservices.
- **Background jobs** via `node-cron` + **Postgres outbox** pattern (no Redis/Kafka/BullMQ — explicitly rejected).
- **Multi-tenant ready, single-tenant deployed** (`tenant_id` on every table).

### 5.2 Technology Stack
| Layer | Tech | Version |
|---|---|---|
| Framework | Next.js | 15.3.9 |
| Runtime | React | 19.2.6 |
| Language | TypeScript (strict, 0 errors) | 5.5 |
| Database | PostgreSQL 16 (Neon, eu-central-1) | — |
| ORM | Drizzle ORM | 0.45.2 |
| Auth | Auth.js (next-auth) JWT | 5.0.0-beta.31 |
| SSO | Microsoft Entra ID (OIDC) | — |
| UI | Radix + shadcn/ui + Tailwind (token-based) | 3.4.4 |
| Org chart | @xyflow/react | 12.10.2 |
| AI | Anthropic Claude API | SDK 0.91.1 |
| PDF | jsPDF (LFI-patched) | 4.2.1 |
| Storage | Azure Blob / AWS S3 / local (abstracted) | — |
| Hosting | Vercel `fra1` (co-located with Neon) | — |

**Key performance decision:** Vercel function (`fra1`) and Neon DB (`eu-central-1`) are co-located in
AWS Frankfurt — DB latency <5ms vs ~80–100ms cross-region.

### 5.3 Data Model
- **109 `pgTable` definitions** across 11 schema files (`drizzle/schema/`).
- **Every table** carries `tenant_id` + 7 audit columns; **no hard deletes** (effective-date pattern).
- **PII** (`emirates_id`, `passport_number`, `iban`) = AES-256-GCM ciphertext.
- Core tables: `persons` (master), `positions`, `worker_assignments`, `departments`, `legal_entities`,
  `absence_entries`/`absence_balances`, `payroll_runs`/`eosb_calculations`/`gpssa_contributions`,
  `workflow_instances_v2`, `audit_log`, `compliance_rules`.
- *Full model: `docs/project-memory/2026-06-04/04-DATABASE-MODEL.md`.*

### 5.4 Security & Authorization
- **7 roles:** EMPLOYEE, MANAGER, PAYROLL_ADMIN, FINANCE, HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN.
- **Dual-layer RBAC:** `requireRole()` at every Server Action + `feature_permissions` matrix per feature×role.
- **MFA step-up** for HIGH_PRIVILEGE_ROLES (HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN), strict `mfaVerified === false` guard.
- **Middleware** routing backstop on role-gated path prefixes.
- 180/180 security tests pass.

### 5.5 Workflow Engine (design highlight)
Configurable approval engine with hybrid hierarchy (LINE_MANAGER / POSITION / CUSTOM_GROUP), AND/OR
condition trees, SLA calendars with breach actions (ESCALATE/AUTO_APPROVE/AUTO_REJECT/REMINDER/FREEZE),
group voting (ANY_ONE/MAJORITY/ALL/WEIGHTED), and an immutable workflow audit log. Collision-hardened
(5 transaction-boundary fixes + advisory locks). The **Approve / Reject / Delegate** 3-button decision
set is the canonical UI. Evidence: `lib/workflow-engine.ts`; `drizzle/schema/workflow-engine.ts`.

### 5.6 Non-Functional Requirements (NFRs)
| NFR | Requirement |
|---|---|
| Performance | DB co-location <5ms; dashboards parallelised (`Promise.all`); 6 telemetry thresholds |
| Security | PII encryption; MFA; CSP/secure cookies (pre-prod checklist); rate limiting (planned) |
| Auditability | INSERT-only audit on every write; immutable workflow audit |
| Bilingual | EN/AR mandatory; RTL configured |
| Reliability | Postgres outbox = at-least-once email; advisory locks prevent collisions |
| Testability | Vitest (unit/integration/chaos/security) + Playwright (14 E2E projects) + k6 load |

### 5.7 Architectural Constraints (ADR-001 — non-negotiable rules)
1. Every DB write = `db.transaction()` + `audit.log(tx, …)` in the same handle.
2. No hard deletes — effective-date pattern.
3. PII encrypted before persist.
4. Bilingual mandatory.
5. Server Action pattern: `auth()` → `requireRole()` → `Schema.parse()` → transaction+audit → `revalidatePath()`.
6. Cross-module imports only via `modules/*/index.ts` barrels.
7. CSS tokens only (no raw hex).
8. `tenant_id` on every insert.

---

## 6. Requirements Traceability (Where to Verify Anything)

| Layer | Location | Use |
|---|---|---|
| Law compliance proof | `docs/qa-qc/hr-requirements-uae-labour-law-validation.md` | Article-by-article validation |
| Governed rules | `compliance_rules` table / `drizzle/seed.ts:715` | Live law-cited rules |
| In-code rules | `BR-xx` across `modules/*`, `lib/*` | Point-of-enforcement |
| Module inventory | `docs/project-memory/2026-06-04/02-MODULE-MAP.md` | Files + tables per module |
| Verified status | `…/15-VERIFIED-IMPLEMENTATION-MATRIX.md` | Evidence-backed status |
| Data model | `…/04-DATABASE-MODEL.md` | Tables, enums, migrations |
| Architecture decisions | `…/18-ARCHITECTURAL-DECISIONS.md` | Why decisions were made |
| Known gaps | `docs/KNOWN_GAPS.md` | Outstanding items |

---

## 7. Open Items / Caveats (for Macy's awareness)

1. 🔴 **GPSSA rates** may predate FDL 57/2023 — configurable, needs a data refresh + legal confirm.
2. 🔴 **WPS SIF file format** not verified end-to-end — required before live payroll.
3. 🔴 **Unemployment Insurance (ILOE, FDL 13/2022)** not yet tracked.
4. 🔴 **FDL 9/2024 amendments** not yet mapped.
5. 🟡 **Production blockers** (document storage on `/tmp`, email not wired, WIP migrations 0055–0061 unapplied) — deployment readiness, not legal.

*Detail: companion validation doc §5 + `docs/KNOWN_GAPS.md`.*

---

*This specification is the consolidated basis of the AVANIIS HR system. It supersedes scattered
requirement notes by unifying the law foundation, compliance integration, functional scope, and system
design into one verifiable document.*
</content>
