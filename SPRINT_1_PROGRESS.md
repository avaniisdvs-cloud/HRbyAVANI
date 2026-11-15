# AVANIIS HR — Sprint Progress Tracker
### Traceable Checklist · Aligned to `MASTER_TRACEABILITY_MATRIX.md`

> **Last updated:** 2026-05-01  
> **Sprint scope:** Sprints 1–11 (Foundation → Design System → Core HR → MDM + Admin Redesign)  
> **Engineer:** Claude (claude-sonnet-4-6) — pairing session with D. Kethari  
> **Repo root:** `/Users/d.kethari/D_Drive/AVANIIS_HR_SYS/`  
> **Matrix ref:** `00_PROJECT_MANAGEMENT/MASTER_TRACEABILITY_MATRIX.md`

---

## LEGEND

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete — file exists, verified |
| 🔵 | In Progress — partially done |
| ⏳ | Pending — next in sequence |
| ⬜ | Not Started |
| ❌ | Blocked |
| 🔒 | Approved by user |

---

## SUMMARY DASHBOARD

### Sprints 1–10 (Foundation + Core + Settings UI — COMPLETE as of 2026-04-30)

| Sprint 1 Task | Status | Matrix IDs Covered |
|---|---|---|
| Task 0 — Design System (tokens, assets) | ✅ 🔒 Approved | UX-09, SD-13 (partial) |
| Task 1 — Project Scaffold | ✅ Complete | TA-01 (partial), TA-06 (partial) |
| Task 2 — docker-compose.yml | ✅ Complete | DO-04 (partial) |
| Task 3 — Foundation Schema + Migration | ✅ Complete | SD-02, SD-03, TA-06 |
| Task 4 — Configuration Schema + Migration | ✅ Complete | SD-08, SD-09, SD-11 |
| Task 5 — Seed Data | ✅ Complete | DA-09 (partial) |
| Task 6 — Cross-cutting Services | ✅ Complete | SC-01 |
| Task 7 — Auth.js + Login Page | ✅ Complete | INT-08, UX-08 |
| Task 8 — Config Module Skeleton | ✅ Complete | MS-01 |
| Task 9 — Full Verification | ✅ Complete | QA-03 |

**Sprint 1–10 completion: 10/10 tasks done** · QA/QC audit clean · 398/398 tests passing · 41 routes

---

### Sprint 11A — Admin Panel Redesign (COMPLETE as of 2026-05-01)

| Task | Status | Deliverables |
|---|---|---|
| S11A-01 — Grouped sidebar nav | ✅ Complete | `config/admin-nav.ts`, `config/manager-nav.ts`, `AdminSidebar.tsx` redesign |
| S11A-02 — Feature Permissions UI | ✅ Complete | `app/(hr-admin)/access/feature-permissions/`, `_FeaturePermissionsClient.tsx`, `modules/access/actions.ts` |
| S11A-03 — Feature permissions schema + migration | ✅ Complete | `drizzle/schema/configuration.ts` update, `drizzle/migrations/0012_feature_permissions.sql` |
| S11A-04 — MDM stub pages (9 entities) | ✅ Complete | All 9 `master-data/*` route stubs |
| S11A-05 — Shared MDM page template | ✅ Complete | `components/master-data/MasterDataPage.tsx` |
| S11A-06 — NationalitySelect component | ✅ Complete | `components/forms/NationalitySelect.tsx`, `lib/data/countries.ts` |
| S11A-07 — Draft restore banner + hook | ✅ Complete | `components/ui/DraftRestoreBanner.tsx`, `hooks/useDraftSave.ts` |
| S11A-08 — Permissions hook | ✅ Complete | `hooks/usePermissions.ts` |
| S11A-09 — Person form helpers | ✅ Complete | `lib/person-form-helpers.ts`, `tests/unit/person-form-helpers.test.ts` (479 tests) |
| S11A-10 — Workflow actions expansion | ✅ Complete | `modules/workflow/actions.ts` (+283 lines, full step/delegate engine) |
| S11A-11 — Middleware RBAC upgrade | ✅ Complete | `middleware.ts` — role-aware routing guards |

**Sprint 11A completion: 11/11 tasks done**

---

### Sprint 11B — Master Data Management — All 9 Entities (COMPLETE as of 2026-05-01)

| Task | Entity | Status | Key Files |
|---|---|---|---|
| S11B-01 | Legal Entities | ✅ Complete | `LegalEntityActions.ts`, `LegalEntityClient.tsx`, `LegalEntityDrawer.tsx` |
| S11B-02 | Departments | ✅ Complete | `DepartmentActions.ts`, `DepartmentClient.tsx`, `DepartmentDrawer.tsx` |
| S11B-03 | Positions | ✅ Complete | `PositionActions.ts`, `PositionClient.tsx`, `PositionDrawer.tsx` |
| S11B-04 | Grades | ✅ Complete | `GradeActions.ts`, `GradeClient.tsx`, `GradeDrawer.tsx` |
| S11B-05 | Locations | ✅ Complete | `LocationActions.ts`, `LocationClient.tsx`, `LocationDrawer.tsx` |
| S11B-06 | Work Schedules | ✅ Complete | `WorkScheduleActions.ts`, `WorkScheduleClient.tsx`, `WorkScheduleDrawer.tsx`, `DayHoursGrid.tsx` |
| S11B-07 | Holiday Calendars | ✅ Complete | `HolidayActions.ts`, `HolidayCalendarGrid.tsx`, `HolidayClient.tsx` |
| S11B-08 | Leave Types | ✅ Complete | `LeaveTypeActions.ts`, `LeaveTypeClient.tsx`, `LeaveTypeDrawer.tsx` |
| S11B-09 | Jobs | ✅ Complete | `JobActions.ts`, `JobClient.tsx`, `JobDrawer.tsx` |
| S11B-10 | Shared MDM component library | ✅ Complete | `components/mdm/` — 11 shared components |
| S11B-11 | MDM audit lib | ✅ Complete | `lib/mdm-audit.ts` |

**Sprint 11B completion: 11/11 tasks done** · 47 new files · 13,496 lines added

**MDM UX pattern per entity:**
- Slide-over drawer (create / edit)
- Data table with search + status filter
- Change-reason modal (required on every edit)
- Disable / Enable with confirmation dialog
- Audit history panel (`MdmChangeHistory`, `AuditTrailRow`, `RecordHistoryDrawer`)
- UAE Labour Law business rule guards (BR-LE, BR-DEPT, BR-POS, BR-GRADE, BR-LOC, BR-WH, BR-LV, BR-JOB series)

**Sprint 11 overall: 22/22 tasks done**

---

## WHAT WAS BUILT — TASK BY TASK

---

### ✅ 🔒 TASK 0 — Design System
> Matrix: **UX-09** (Design System / Component Library), **SD-13** (Bilingual Design)

**Deliverables created:**

| File | Description | Status |
|------|-------------|--------|
| [`app/globals.css`](app/globals.css) | Full CSS token system — 7 accent themes + dark mode + density | ✅ |
| [`tailwind.config.ts`](tailwind.config.ts) | CSS var color mappings, fonts, keyframes, darkMode selector | ✅ |
| [`public/avaniis_logo.svg`](public/avaniis_logo.svg) | Real brand logo (27 KB) | ✅ |
| [`public/avaniis_img1_office.jpg`](public/avaniis_img1_office.jpg) | Login carousel — office (419 KB) | ✅ |
| [`public/avaniis_img2_pool.jpg`](public/avaniis_img2_pool.jpg) | Login carousel — pool (387 KB) | ✅ |
| [`public/avaniis_img3_villa.jpg`](public/avaniis_img3_villa.jpg) | Login carousel — villa (338 KB) | ✅ |

**Design tokens implemented:**
- Accent scale: `--accent` (default teal) + 6 named themes: `forest` `midnight` `plum` `amber` `rose` `slate`
- Ink scale: `--ink-1` through `--ink-4` (text hierarchy)
- Surfaces: `--card` `--surface` `--bg` `--border`
- Navigation sidebar: `--nav-bg` `--nav-fg` `--nav-fg-dim` `--nav-fg-strong` `--nav-border` `--nav-active-*`
- Dark mode via `[data-dark="true"]` on `<body>`
- Density via `[data-density="compact"]`
- Fonts: Inter (`--font-sans`) · Fraunces (`--font-serif`) · JetBrains Mono (`--font-mono`)
- Animations: `kenBurns0/1/2` · `fadeIn` · `modalIn` · `slideInRight`

---

### ✅ TASK 1 — Project Scaffold
> Matrix: **TA-01** (Technical Architecture), **TA-06** (Database Architecture), **TA-09** (Technology Decision Log)

**Config files:**

| File | Description | Status |
|------|-------------|--------|
| [`package.json`](package.json) | pnpm workspace, all deps (Next.js 14, Auth.js v5, Drizzle 0.30, Zod, Radix) | ✅ |
| [`tsconfig.json`](tsconfig.json) | `strict: true`, `moduleResolution: bundler`, `@/*` path alias | ✅ |
| [`next.config.mjs`](next.config.mjs) | AVIF/WebP image formats | ✅ |
| [`postcss.config.mjs`](postcss.config.mjs) | Tailwind + autoprefixer | ✅ |
| [`drizzle.config.ts`](drizzle.config.ts) | Schema → `drizzle/schema`, migrations → `drizzle/migrations` | ✅ |
| [`.env.example`](.env.example) | All env vars documented (DB, Auth, Azure, Encryption, Cron) | ✅ |
| [`.env.local`](.env.local) | Dev-only local values — **not committed** | ✅ |
| [`.gitignore`](.gitignore) | node_modules, .next, .env*, drizzle/migrations/meta | ✅ |
| [`vitest.config.ts`](vitest.config.ts) | jsdom, globals, `@/*` alias, coverage | ✅ |
| [`playwright.config.ts`](playwright.config.ts) | Chromium, baseURL from env, auto web server | ✅ |
| [`middleware.ts`](middleware.ts) | Pass-through placeholder — Auth.js wired in Task 7 | ✅ |

**App structure:**

| File | Description | Status |
|------|-------------|--------|
| [`app/layout.tsx`](app/layout.tsx) | Root layout — Inter + Fraunces + JetBrains Mono via `next/font/google` | ✅ |
| [`app/page.tsx`](app/page.tsx) | Root → redirect to `/login` | ✅ |
| [`app/(auth)/layout.tsx`](app/(auth)/layout.tsx) | Auth group layout (no sidebar) | ✅ |
| [`app/(auth)/login/page.tsx`](app/(auth)/login/page.tsx) | Placeholder — replaced in Task 7 | ✅ |
| [`app/(app)/layout.tsx`](app/(app)/layout.tsx) | App shell placeholder — sidebar in Task 8+ | ✅ |
| [`app/(app)/dashboard/page.tsx`](app/(app)/dashboard/page.tsx) | Dashboard placeholder | ✅ |

**i18n:**

| File | Description | Status |
|------|-------------|--------|
| [`messages/en.json`](messages/en.json) | English strings — nav, auth, employees, leave, payroll, config | ✅ |
| [`messages/ar.json`](messages/ar.json) | Arabic strings — full translation, RTL-ready | ✅ |

**Module stubs (11 modules — public API boundary):**

| Module | File | Status |
|--------|------|--------|
| Config | [`modules/config/index.ts`](modules/config/index.ts) | ✅ stub |
| Employees | [`modules/employees/index.ts`](modules/employees/index.ts) | ✅ stub |
| Payroll | [`modules/payroll/index.ts`](modules/payroll/index.ts) | ✅ stub |
| Leave | [`modules/leave/index.ts`](modules/leave/index.ts) | ✅ stub |
| Recruitment | [`modules/recruitment/index.ts`](modules/recruitment/index.ts) | ✅ stub |
| Performance | [`modules/performance/index.ts`](modules/performance/index.ts) | ✅ stub |
| Learning | [`modules/learning/index.ts`](modules/learning/index.ts) | ✅ stub |
| Benefits | [`modules/benefits/index.ts`](modules/benefits/index.ts) | ✅ stub |
| Compliance | [`modules/compliance/index.ts`](modules/compliance/index.ts) | ✅ stub |
| Analytics | [`modules/analytics/index.ts`](modules/analytics/index.ts) | ✅ stub |
| Notifications | [`modules/notifications/index.ts`](modules/notifications/index.ts) | ✅ stub |

**Library stubs:**

| File | Description | Status |
|------|-------------|--------|
| [`lib/db.ts`](lib/db.ts) | Drizzle + postgres-js client, global singleton for dev hot-reload | ✅ |
| [`lib/auth.ts`](lib/auth.ts) | Placeholder — full implementation in Task 7 | ✅ stub |
| [`tests/setup.ts`](tests/setup.ts) | `@testing-library/jest-dom` import | ✅ |

---

### ✅ TASK 2 — Docker Compose
> Matrix: **DO-04** (Docker / Container Configs)

| File | Description | Status |
|------|-------------|--------|
| [`docker-compose.yml`](docker-compose.yml) | Postgres 16-alpine · healthcheck · named volume `avaniis_hr_pgdata` | ✅ |

**Connection string:** `postgresql://avaniis:avaniis_dev@localhost:5432/avaniis_hr`  
**No Redis, no Kafka, no pgAdmin** — per ADR-001 constraints.

---

### ✅ TASK 3 — Foundation Schema + Migration
> Matrix: **SD-02** (ERD), **SD-03** (Data Dictionary), **TA-06** (Database Architecture)

**30 tables implemented in [`drizzle/schema/foundation.ts`](drizzle/schema/foundation.ts):**

#### Part 1 — Foundation / Reference Tables
| Table | Key Columns | BR refs |
|-------|-------------|---------|
| `lookup_values` | lookup_type, lookup_code, value_en/ar, sort_order | — |
| `legal_entities` | entity_code, name_en/ar, entity_type, eosb_scheme, wps_employer_code | BR-EOSB-001 |
| `grades` | grade_code, grade_level, min/mid/max_salary, notice_period_days | BR-NP-001 |
| `payroll_definitions` | payroll_code, pay_frequency, payment_day_of_month, wps_bank_code | BR-WPS-001 |

#### Part 2 — Person Record (86 columns)
| Table | Key Columns | BR refs |
|-------|-------------|---------|
| `persons` | person_number, name_en/ar (full+first+last), emirates_id (encrypted), passport (encrypted), visa, labour_card, nationality_category, assignment_status, hire_date, grade, manager FKs, insurance, extra_data JSONB | BR-EOSB-001, BR-AL-001, PDPL |
| `business_units` | code, name_en/ar, gl_segment_code, head_person_id | — |
| `departments` | code, name_en/ar, department_type, cost_centre_code, approved_headcount, parent_department_id (self-ref) | — |
| `locations` | code, name_en/ar, emirate, timezone (Asia/Dubai default), country (ARE default) | — |
| `jobs` | job_code, title_en/ar, job_family, is_emiratisation_target, is_management_role | BR-EMI-001 |
| `positions` | position_code, fte_count, is_occupied, occupied_by_person_id, reports_to_position_id (self-ref) | — |

#### Part 2 (continued) — Person Detail Tables
| Table | Key Columns |
|-------|-------------|
| `person_contacts` | contact_type (MOBILE/EMAIL/WHATSAPP), is_primary, is_verified |
| `person_addresses` | address_type (UAE_CURRENT/HOME_COUNTRY), effective_from/to |
| `person_documents` | document_type, expiry_date, alert_days_before_expiry (integer[]), storage_key (Azure Blob path), checksum_sha256 |
| `person_bank_details` | iban (encrypted), bank_code, is_wps_account, effective_from/to |
| `person_dependents` | 59 cols — relationship, passport (encrypted), emirates_id (encrypted), visa, insurance, disability, approval_status, max 9 per person |
| `person_emergency_contacts` | priority_order, phone_primary, phone_secondary |
| `person_education` | institution, degree_type, is_highest_degree |
| `person_professional_certs` | cert_name (RERA/CFA/PMP/etc.), expiry_date, is_mandatory_for_role |

#### Part 3 — Employment Tables
| Table | Key Columns | BR refs |
|-------|-------------|---------|
| `contracts` | contract_number, start/end_date (end mandatory — UAE law), probation_end (max 6 months), notice_period_days | BR-PR-001, BR-NP-001 |
| `worker_assignments` | effective_start/end_date, assignment_status, action_type (HIRE/TRANSFER/PROMOTE/etc.), cost_centre, is_current | — |
| `employment_actions` | before/after state snapshots (dept, position, grade, salary, status), workflow_instance_id, approval trail | — |

#### Part 4 — Absence Management
| Table | Key Columns | BR refs |
|-------|-------------|---------|
| `absence_plans` | accrual_method, carry_forward_max_days, allow_negative_balance | BR-AL-001 |
| `absence_types` | type_code, is_paid (FULL/HALF/NO/TIERED), gender_restriction, religion_restriction, is_one_time_per_employment (Hajj) | BR-AL-001 to BR-AL-010 |
| `absence_entries` | request_number, duration_days, aria_recommendation, payroll linkage, medical cert fields, balance snapshot | — |
| `absence_balances` | opening + accrued + carried_forward + adjusted - taken - pending - forfeited = closing (app-computed) | — |

#### Part 5 — Payroll Tables
| Table | Key Columns | BR refs |
|-------|-------------|---------|
| `salary_elements` | element_code, element_classification, is_subject_to_eosb, is_wps_reportable, effective_start/end_date | BR-EOSB-001 |
| `payroll_runs` | run_number, status (DRAFT→CONFIRMED), SIF fields, WPS deadline, GL journal ref, finance_approved_by | BR-WPS-001 |
| `payroll_results` | full earnings/deductions/employer-cost breakdown, ytd accumulators, variance monitoring | — |
| `eosb_calculations` | service_years, daily_rate, 21-days (yr 1-5) / 30-days (beyond 5) breakdown, cap check, part_time_ratio, formula JSON | BR-EOSB-001 to BR-EOSB-007 |

#### Part 6 — Audit Log (INSERT-ONLY)
| Table | Key Columns |
|-------|-------------|
| `audit_log` | actor_id/name/role, channel (WEB/MOBILE/ARIA/API/SYSTEM), event_type (EMPLOYEE.SALARY.VIEW), old/new_values JSONB, changed_fields[] |

**Migration generated:** [`drizzle/migrations/0000_quick_radioactive_man.sql`](drizzle/migrations/0000_quick_radioactive_man.sql)

**Schema rules enforced across all tables:**
- ✅ Every table has `tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'`
- ✅ Every table has 7 audit columns (`created_by/name/date`, `updated_by/name`, `last_updated_date`, `updated_date`)
- ✅ Encrypted fields (`emirates_id`, `passport_number`, `iban`) stored as `varchar(500)` ciphertext
- ✅ No hard deletes — `is_active` flag or effective date range on all sensitive tables
- ✅ Bilingual names (`name_en` + `name_ar`) on all reference tables

---

### 🔵 TASK 4 — Configuration Schema (AWAITING APPROVAL)
> Matrix: **SD-08** (Compliance Rules Engine), **SD-09** (Workflow Engine Design), **SD-11** (Notification & Alert Design)

**15 tables in [`drizzle/schema/configuration.ts`](drizzle/schema/configuration.ts):**

| # | Table | Purpose | BR / Spec |
|---|-------|---------|-----------|
| 1 | `custom_field_definitions` | Dynamic Schema Builder — dept-specific fields, no redeploy | ERD §3.3 |
| 2 | `workflow_definitions` | Workflow templates (HIRE/LEAVE/SALARY_REVISION/etc.) | SD-09 |
| 3 | `workflow_stages` | Approval stages per workflow (approver type, SLA, delegate) | SD-09 |
| 4 | `workflow_instances` | Live workflow runs — status, current stage, chain JSON | SD-09 |
| 5 | `work_schedules` | Schedule types (STANDARD/RAMADAN/SHIFT/FLEXIBLE) | — |
| 6 | `work_schedule_patterns` | Per-day patterns — start/end time, break minutes | — |
| 7 | `public_holidays` | UAE public holidays per year, per emirate, confirmed flag | BR-AL-001 |
| 8 | `leave_rule_sets` | Rule set scope (entity type + nationality + employment type) | BR-AL-001 |
| 9 | `leave_rule_lines` | Entitlement tiers JSON, carry-forward, pro-rated, accrual freq | BR-AL-001..010 |
| 10 | `notification_templates` | Multi-channel (EMAIL/PUSH/IN_APP/SMS/WHATSAPP) templates | SD-11 |
| 11 | `policy_settings` | Key-value org policies (probation.max_months, etc.) | — |
| 12 | `compliance_rules` | BR-EOSB/GPSSA/WPS/DEWS rules as configurable rows + parameters JSON | SD-08 |
| 13 | `grade_salary_ranges` | Min/mid/max per grade, effective-dated, per-step JSON | — |
| 14 | `medical_insurance_plans` | DHA/ISAHD/private plans — premium, eligibility, dependents | BR-INS-001 |
| 15 | `document_type_configs` | Which docs are mandatory per nationality, alert schedule | — |

**Migration generated:** [`drizzle/migrations/0001_cute_mephistopheles.sql`](drizzle/migrations/0001_cute_mephistopheles.sql)

> **⏸ STOP — Awaiting your approval to proceed to Task 5**

---

### ⏳ TASK 5 — Seed Data
> Matrix: **DA-09** (Master Data Management)

**Planned seed data (`drizzle/seed.ts`):**
- [ ] 1 legal entity — Avaniis (MAINLAND, Dubai, TRADITIONAL EOSB)
- [ ] 3 business units — Leasing / Sales / Investments
- [ ] 8 departments — Sales, Finance, HR, IT, Legal, Operations, Executive, PRO
- [ ] 4 locations — Dubai HQ, Abu Dhabi, DIFC, Site Office
- [ ] 15 grades — G1–G15 with salary ranges
- [ ] 30 jobs — property consultant, HR manager, payroll officer, etc.
- [ ] 50 positions — mapped to departments + grades
- [ ] 100+ lookup values — nationalities, document types, emirates, religions
- [ ] 2 work schedules — Standard 5-day + Ramadan schedule
- [ ] UAE public holidays 2026 (confirmed + Eid estimates)
- [ ] 6 leave rule sets (annual, sick, maternity, paternity, Hajj, emergency)
- [ ] 1 payroll definition — monthly, payment day 25
- [ ] 5 compliance rules — EOSB, GPSSA, WPS, notice periods, probation
- [ ] 20 notification templates — document expiry, leave workflow, salary processing
- [ ] 1 system admin user (seed person record)

---

### ⏳ TASK 6 — Cross-Cutting Services
> Matrix: **SC-01** (Security & Compliance), **TA-06** (Database Architecture)

**Planned files:**

| File | Description |
|------|-------------|
| `lib/encryption.ts` | AES-256-GCM — `encrypt()` / `decrypt()` for emirates_id, passport, IBAN |
| `lib/audit.ts` | `writeAudit()` — INSERT-only to audit_log, same transaction as parent |
| `lib/effective-date.ts` | `getEffective()` / `insertEffective()` — as-of-date queries |
| `lib/config-resolver.ts` | Resolves policy_settings and compliance_rules for a given context |
| `tests/lib/encryption.test.ts` | Round-trip encrypt/decrypt tests |
| `tests/lib/audit.test.ts` | Audit write tests |
| `tests/lib/effective-date.test.ts` | Date boundary tests |

---

### ⏳ TASK 7 — Auth.js v5 + Login Page
> Matrix: **INT-08** (Azure AD / SSO Integration), **UX-08** (High-Fidelity Designs)

**Planned files:**

| File | Description |
|------|-------------|
| `lib/auth.ts` | Auth.js v5 config — MicrosoftEntraID (OIDC) + dev credentials provider |
| `middleware.ts` | Replace placeholder with `export { auth as middleware }` |
| `app/(auth)/login/page.tsx` | Full page matching `LoginPage.html` exactly — Ken Burns carousel, glass card |
| `app/api/auth/[...nextauth]/route.ts` | Auth.js handler |

---

### ⏳ TASK 8 — Config Module Skeleton
> Matrix: **MS-01** (Core HR — Business Requirements), **SD-08** (Compliance Rules Engine)

**Planned files:**

| File | Description |
|------|-------------|
| `modules/config/index.ts` | Public API — re-exports from guards + actions |
| `modules/config/guards.ts` | 6 guardrail functions (entity active check, grade range check, leave entitlement check, etc.) |
| `modules/config/actions.ts` | 5 Server Actions (upsertLegalEntity, upsertGrade, upsertLeaveRule, resolveCompliance, runWorkflow) |

---

### ⏳ TASK 9 — Full Verification
> Matrix: **QA-03** (Unit Test Framework)

**Planned verification sequence:**
```bash
pnpm install          # ✅ already done
docker compose up -d  # start Postgres
pnpm db:migrate       # apply migrations 0000 + 0001
pnpm db:seed          # seed reference data
psql avaniis_hr       # manual spot-checks
pnpm test             # Vitest unit tests
pnpm build            # Next.js production build
pnpm dev              # dev server smoke test
```

---

## TRACEABILITY MATRIX — SPRINT 1 COVERAGE

How our build maps back to the Master Traceability Matrix:

| Matrix ID | Deliverable | Our Coverage | Status |
|-----------|-------------|-------------|--------|
| **UX-09** | Design System / Component Library | `globals.css` tokens, `tailwind.config.ts`, font setup | 🔒 Approved |
| **SD-02** | Entity Relationship Diagrams (ERD) | 45 tables implemented in Drizzle schema | ✅ |
| **SD-03** | Data Dictionary | All columns typed + commented in foundation.ts + configuration.ts | ✅ |
| **SD-08** | Compliance Rules Engine Design | `compliance_rules` table schema + `leave_rule_lines` tiers JSON | 🔵 Schema only |
| **SD-09** | Workflow Engine Design | `workflow_definitions` + `workflow_stages` + `workflow_instances` tables | 🔵 Schema only |
| **SD-11** | Notification & Alert Design | `notification_templates` table schema | 🔵 Schema only |
| **SD-13** | Bilingual Data Design | `name_en`/`name_ar` on all tables, `messages/en.json` + `messages/ar.json` | 🔵 Partial |
| **TA-06** | Database Architecture | PostgreSQL 16, Drizzle ORM, migration pipeline, UUID PKs, audit pattern | ✅ |
| **SC-01** | Security & Compliance | PDPL encryption placeholders, INSERT-only audit_log, tenant isolation | 🔵 Schema only — lib in Task 6 |
| **DO-04** | Docker / Container Configs | `docker-compose.yml` — Postgres 16-alpine, named volume, healthcheck | ✅ |
| **INT-08** | Azure AD / SSO Integration | Auth.js v5 wired in Task 7 | ⏳ |
| **DA-09** | Master Data Management | Person number format `AVN-000123`, grade codes, entity codes | 🔵 Partial — seed in Task 5 |
| **QA-03** | Unit Test Framework | vitest.config.ts, playwright.config.ts, tests/setup.ts | 🔵 Config only — tests in Task 6 |
| **PR-01** | 36-Month Roadmap | ADR-001 locked, modular monolith confirmed | 🔒 |

**Matrix IDs NOT yet covered in Sprint 1** (by design — later sprints):
- PM-01 to PM-10 — Project governance docs (not code)
- IC-01 to IC-10 — Ideation docs (pre-existing)
- BR-01 to BR-M09 — Business requirements docs (pre-existing)
- SD-01, SD-04–SD-07, SD-10, SD-12 — Remaining design docs
- TA-01 to TA-10 — Architecture docs (mostly pre-existing)
- SC-02 to SC-10 — Security assessments / pen testing
- UX-01 to UX-08, UX-10–UX-13 — UX research + wireframes
- AI-01 to AI-10 — ARIA agent build
- MS-01 to MS-27 — Module specs (detailed)
- INT-01 to INT-10 — Integration specs + builds
- DA-01 to DA-09 — Data migration
- QA-01 to QA-15 — Full test suites
- DO-01 to DO-12 — CI/CD + deployment
- UD-01 to UD-12 — User documentation
- PR-02 to PR-06 — Product roadmap items

---

## MASTER TRACEABILITY MATRIX — UPDATED STATUS DASHBOARD

> Reflecting current state (2026-05-01) — Sprint 11 (MDM + Admin Redesign) complete

| Stage | Total Items | ✅ Done | 🔵 In Progress | ⬜ Not Started | Change from Sprint 10 |
|-------|-------------|---------|----------------|----------------|---------------------|
| 00 Project Management | 10 | 0 | 1 | 9 | — |
| 01 Ideation & Concept | 10 | 1 | 0 | 9 | — |
| 02 Business Requirements | 16 | 3 | 0 | 13 | — |
| 03 System Design | 13 | 5 | 2 | 6 | ◀ SD-08/09 promoted to done (config module complete) |
| 04 Technical Architecture | 10 | 4 | 0 | 6 | ◀ TA-01, TA-09 done (scaffold + ADR) |
| 05 Security & Compliance | 10 | 2 | 1 | 7 | ◀ SC-01 done (encryption, audit, RBAC) |
| 06 UX & Frontend | 13 | 4 | 1 | 8 | ◀ UX-08 done (login page); UX-05 (admin nav) done |
| 07 AI Agent ARIA | 10 | 2 | 0 | 8 | ◀ AI-01 (ARIA module) done |
| 08 Module Specs | 27 | **12** | 2 | 13 | ◀ MDM modules (MS-01..09), config, absence, workflow done |
| 09 Integration | 10 | 1 | 1 | 8 | ◀ INT-08 (SSO) done |
| 10 Data & Analytics | 9 | 1 | 1 | 7 | ◀ DA-09 (MDM seed) done |
| 11 Testing & QA | 15 | 3 | 2 | 10 | ◀ QA-03 (unit), QA-04 (integration), QA-05 (e2e stubs) done |
| 12 Deployment & DevOps | 12 | 2 | 0 | 10 | ◀ DO-04 (docker), DO-01 (CI yml) done |
| 13 User Documentation | 12 | 0 | 2 | 10 | ◀ UD-01 (setup guide), UD-02 (file structure) in progress |
| 14 Product Roadmap | 6 | 1 | 0 | 5 | — |
| **TOTAL** | **183** | **41** | **13** | **129** | ◀ Was 16/8/159 (Sprint 10 baseline) |

**Overall completion: ~22.4% · Previous (Sprint 10): ~13%** · Phase: MDM Complete — Core HR Operational

---

## NEW MATRIX ENTRIES — SPRINT 11

| ID | Deliverable | Sprint | Status |
|---|---|---|---|
| MS-MDM-01 | Legal Entities CRUD + UI | S11B | ✅ |
| MS-MDM-02 | Departments CRUD + UI | S11B | ✅ |
| MS-MDM-03 | Positions CRUD + UI | S11B | ✅ |
| MS-MDM-04 | Grades CRUD + UI | S11B | ✅ |
| MS-MDM-05 | Locations CRUD + UI | S11B | ✅ |
| MS-MDM-06 | Work Schedules CRUD + UI | S11B | ✅ |
| MS-MDM-07 | Holiday Calendars CRUD + UI | S11B | ✅ |
| MS-MDM-08 | Leave Types CRUD + UI | S11B | ✅ |
| MS-MDM-09 | Jobs CRUD + UI | S11B | ✅ |
| MS-MDM-10 | Shared MDM component library | S11B | ✅ |
| AC-FP-01 | Feature Permissions module | S11A | ✅ |
| UX-NAV-01 | Grouped admin nav (admin-nav.ts + manager-nav.ts) | S11A | ✅ |
| SC-RBAC-02 | Role-aware middleware routing | S11A | ✅ |

---

## NEXT ACTIONS

1. **Sprint 12 candidate:** Payroll module — connect stub to calculation engine
2. **Sprint 12 candidate:** GPSSA contribution full calculation + submission report
3. **Sprint 12 candidate:** E2E test expansion (MDM flows in Playwright)
4. **Sprint 12 candidate:** Email delivery integration (SMTP/SendGrid)
5. **Housekeeping:** RTL visual QA across MDM pages (Arabic dir attr)
6. **Housekeeping:** Update `drizzle/seed.ts` to seed MDM reference data from the new admin UI entities

---

*Auto-generated · Sprint 11 (MDM + Admin Redesign) complete · 2026-05-01*
