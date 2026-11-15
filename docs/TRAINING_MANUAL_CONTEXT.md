# AVANIIS HCM — Training Manual Context Reference

> **Purpose:** This file is a complete factual snapshot of the AVANIIS HCM codebase, intended as source material for generating training manuals, user guides, and onboarding documentation.
> **Generated:** 2026-05-22 | Phase 1 MVP (Sprints 1–11, QA-certified, production-ready)
> **Source:** Live codebase analysis — all data is factual, nothing invented.

---

## HOW TO USE THIS FILE

Feed this file to Claude with a prompt like:

> "Using the context in TRAINING_MANUAL_CONTEXT.md, create a [HR Admin User Guide / Employee Self-Service Guide / Payroll Admin Guide / System Administrator Guide] covering [specific module or role]. Use plain language, include step-by-step instructions for every task, and organise by workflow."

You can also ask for:
- Role-specific user guides (Employee, Manager, HR Admin, Payroll Admin, Super Admin)
- Module-specific deep-dives (Payroll, Leave, Org Chart, ARIA, etc.)
- SOPs (Standard Operating Procedures) for recurring tasks
- Quick-reference cards
- FAQ documents

---

## PART 1 — APPLICATION OVERVIEW

### What is AVANIIS HCM?

AVANIIS HCM is an AI-native, bilingual (English/Arabic) enterprise Human Capital Management (HCM) platform built for **Avaniis / Avaniis** in the UAE. It digitises the full employee lifecycle — from hiring and onboarding through leave management, payroll, timesheets, and offboarding — with UAE Labour Law compliance enforced at every step.

### Core Problems It Solves

- Replaces manual, paper-based UAE HR processes with a digital, auditable system
- Enforces UAE Labour Law (57+ rules) automatically at the point of data entry
- Provides a bilingual (English + Arabic) interface for a diverse workforce
- Integrates leave, payroll, timesheets, and compliance into a single platform
- Gives employees self-service access to their own HR data (leave, payslips, letters, documents)
- Provides an AI assistant (ARIA) powered by Claude for HR queries and org chart analysis

### Production URLs

| Environment | URL |
|---|---|
| Production | http://localhost:3001 |
| Staging | https://staging.avaniis.dev |

### Tech Stack (for technical training materials)

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router + TypeScript |
| Database | PostgreSQL 16 via Neon (cloud, Frankfurt region) |
| ORM | Drizzle ORM |
| Auth | Microsoft Entra ID SSO (primary) + Auth.js v5 |
| UI | Tailwind CSS + shadcn/ui components |
| AI | Anthropic Claude API (ARIA assistant) |
| Document storage | Azure Blob Storage |
| Email | Nodemailer / Azure Communication Services |
| PDF generation | jsPDF 4.2.1 + React PDF Renderer |
| Package manager | pnpm |
| Hosting | Vercel (serverless, Frankfurt) |

---

## PART 2 — USER ROLES

There are 7 user roles in the system. Every user is assigned exactly one role.

| Role | Who has it | What they can do |
|---|---|---|
| `EMPLOYEE` | All staff | Self-service only: view/edit own profile, request leave, view payslips and letters, submit timesheet, chat with ARIA |
| `MANAGER` | Line managers | All employee access + view and approve their direct team's leave and timesheets; team dashboard; can access persons list for their team |
| `HR_ADMIN` | HR officers | Full HR operations: manage all employees, leave, contracts, documents, master data, settings, letters, insurance, workflows |
| `HR_DIRECTOR` | Head of HR | Same as HR_ADMIN plus approves payroll runs and terminations |
| `PAYROLL_ADMIN` | Payroll team | Manage payroll runs, salary elements, WPS; read-only access to persons |
| `FINANCE` | Finance team | Read-only access to payroll reports, dashboard metrics, insurance reports |
| `SUPER_ADMIN` | System administrator | Full access including user management, DataOps SQL console, system settings, all entities |

### Role Assignment

- New users who sign in via Microsoft SSO for the first time are automatically assigned `EMPLOYEE` role and a Super Admin is notified
- Roles are changed by a `SUPER_ADMIN` via **User Management → Users**
- A user can only belong to one role at a time

---

## PART 3 — MODULE INVENTORY

| Module | What it does |
|---|---|
| **Core HR** | Manages employee master records, contracts, job assignments, dependents, documents, bank details, exit clearance, and probation |
| **Leave / Absence** | Leave requests, balances, accrual engine, leave rule sets, public holidays, team calendar |
| **Payroll** | UAE payroll runs with WPS/GPSSA/DEWS/EOSB calculations, salary elements, and approval workflow |
| **Timesheets** | Daily hours entry, biometric punch sync, overtime, Ramadan schedule, manager approval |
| **Org Chart** | Interactive organisational hierarchy with hiring/transfer drawers, analytics, PNG/PDF export, and ARIA chat panel |
| **ARIA (AI)** | Claude-powered HR assistant with real-time streaming responses, org chart intents, and knowledge base |
| **Employee Letters** | Bilingual letter template engine (salary certificate, NOC, etc.) with PDF generation and digital signing |
| **Insurance** | Medical insurance enrollment, plan management, coverage tracking, dependent linking |
| **Approvals / Workflow** | Configurable multi-step approval routing with SLA tracking, delegation, and email one-click actions |
| **Employee Self-Service (ESS)** | Employee-facing portal covering all of the above from the employee's perspective |
| **Master Data (MDM)** | Legal entities, departments, grades, jobs, positions, locations, work schedules, projects, public holidays |
| **Settings / Config** | System-wide configuration: workflows, custom fields, leave rules, branding, currencies, notifications |
| **Reports** | Analytics exports for payroll, leave utilisation, insurance coverage |
| **User Management** | User accounts, role assignments, deactivation |
| **Compliance** | UAE Labour Law engine tracking 57 business rules |
| **Audit** | Immutable INSERT-only audit trail for every write in the system |
| **Directory** | Organisation-wide employee search and directory |
| **DataOps** | Admin SQL console with NL-to-SQL (SUPER_ADMIN only) |

---

## PART 4 — COMPLETE PAGE & SCREEN INVENTORY

### Navigation Structure

The application has two main areas:
1. **Employee Self-Service (ESS)** — accessible via `/me/*` — for `EMPLOYEE` role
2. **HR Administration** — accessible via all other routes — for `MANAGER`, `HR_ADMIN`, `HR_DIRECTOR`, `PAYROLL_ADMIN`, `FINANCE`, `SUPER_ADMIN`

Employees who sign in are automatically redirected to `/me`. Everyone else lands on `/dashboard`.

---

### Public / Auth Screens

| Page Name | Route | Who Can Access | Key Actions |
|---|---|---|---|
| Login | `/sign-in` | Public | Sign in via Microsoft SSO; (dev: email/password) |
| Public Letter Signing | `/letters/sign/[token]` | Public (token link) | View letter, apply digital signature |

---

### Employee Self-Service Screens

| Page Name | Route | Key UI Elements | Actions Available |
|---|---|---|---|
| ESS Home / Dashboard | `/me` | Leave balance cards, upcoming time-off, team-out-today card, expiring documents list, recent activity | Download personal data (DSAR) |
| My Profile | `/me/profile` | Personal info form (name, contact, emergency contact, nationality, marital status) | Edit personal details |
| My Accommodations | `/me/accommodations` | Accommodation request form | Request reasonable accommodation |
| My ARIA Chat | `/me/aria` | Chat interface, message history, streaming responses | Ask HR questions in English or Arabic |
| My Bank Details | `/me/bank-details` | Bank form (IBAN, bank name, account type) | Update bank account for payroll |
| My Directory | `/me/directory` | Search bar, employee card grid | Browse organisation, find colleagues |
| My Documents | `/me/documents` | Document list with expiry dates, upload button | Upload personal documents, view expiry |
| My Insurance | `/me/insurance` | Insurance plan card, coverage details, dependents covered | View insurance information (read-only) |
| My Leave | `/me/leave` | Balance cards per leave type, request history table | View balances, view leave history |
| My Letters | `/me/letters` | Letters list with status (Signed / Pending) | Download letters, navigate to signing |
| Sign Letter (auth) | `/me/letters/sign/[letterId]` | Letter preview, signature capture area | Sign letter digitally |
| My Payslips | `/me/payslips` | Payslip list by month/year | Download payslip PDF |
| My Requests | `/me/requests` | Workflow status list (leave, promotions, etc.) | View status of submitted requests |
| Request Detail | `/me/requests/[requestId]` | Request details, approval timeline, comments | View progress, see approver comments |
| Probation Confirmation | `/me/requests/probation` | Probation details, dates, acknowledgement form | Acknowledge probation outcome |
| My Timesheet | `/me/timesheet` | Calendar grid, daily hours input, total hours, submit button | Enter hours, submit for approval |

---

### HR Admin / Manager Screens

#### Dashboard

| Page Name | Route | Roles | Key UI Elements | Actions |
|---|---|---|---|---|
| Admin Dashboard | `/dashboard` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN, PAYROLL_ADMIN, FINANCE | KPI cards: headcount, dept distribution, on-leave today, pending approvals, leave utilisation YTD, upcoming holidays | Navigate to approvals, drill into KPIs |
| Manager Dashboard | `/dashboard` | MANAGER | Team headcount, pending approvals count, team members on leave this month | Navigate to approve requests |

#### Employee / People Management

| Page Name | Route | Roles | Key UI Elements | Actions |
|---|---|---|---|---|
| Employee List | `/persons` | HR_ADMIN, HR_DIRECTOR, PAYROLL_ADMIN, MANAGER, SUPER_ADMIN, FINANCE | Filter bar (entity, dept, project, status, Emiratisation toggle), sortable data table, pagination | Filter, sort, view detail, create new employee |
| New Employee | `/persons/new` | HR_ADMIN, SUPER_ADMIN | Multi-step onboarding form: personal info, employment details, contract, assignment | Create employee record with auto-generated person number |
| Bulk Import | `/persons/import` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | File upload area, preview/validation table, error list | Upload Excel template, validate, confirm bulk import |
| Employee Detail | `/persons/[id]` | HR_ADMIN, HR_DIRECTOR, PAYROLL_ADMIN, MANAGER (own team), SUPER_ADMIN | Tabbed layout: Overview, Assignments, Contracts, Documents, Bank Details, Dependents, Insurance, Leave, Timesheets, Letters, Audit | Navigate tabs, initiate actions (transfer, amend contract, generate letter) |
| Edit Employee | `/persons/[id]/edit` | HR_ADMIN, SUPER_ADMIN | Personal information form with bilingual fields | Edit and save personal data |
| Amend Contract | `/persons/[id]/contracts/amend` | HR_ADMIN | Contract form, amendment reason, effective date | Create contract amendment record |
| Terminate Contract | `/persons/[id]/contracts/terminate` | HR_ADMIN | Termination date, reason, notice period confirmation | Terminate employment; triggers exit clearance workflow |
| Bank Details (admin) | `/persons/[id]/bank-details` | HR_ADMIN, PAYROLL_ADMIN | IBAN input, bank name, account type | Add or update bank details for WPS |
| Dependents | `/persons/[id]/dependents` | HR_ADMIN | Dependent list (name, DOB, relationship, visa status), add/edit form | Add, edit dependents |
| Documents (admin) | `/persons/[id]/documents` | HR_ADMIN | Document table with type, expiry date, status badges, upload button | Upload, view, track document expiry |
| Insurance (per person) | `/persons/[id]/insurance` | HR_ADMIN | Plan selector, effective dates, card number field | Enroll employee in insurance plan |

#### Leave / Absence Management

| Page Name | Route | Roles | Key UI Elements | Actions |
|---|---|---|---|---|
| Leave List | `/absence` | HR_ADMIN, HR_DIRECTOR, PAYROLL_ADMIN, MANAGER, SUPER_ADMIN, FINANCE | Filter bar (status, date range), leave request table with status badges | Filter, review, approve/reject leave |
| New Leave Request | `/absence/new` | HR_ADMIN, MANAGER | Employee selector, leave type, start/end dates, notes, medical cert flag | Create leave on behalf of employee |
| Leave Detail | `/absence/[id]` | HR_ADMIN, MANAGER, SUPER_ADMIN | Leave details card, workflow approval timeline, Approve / Reject / Delegate buttons | Make approval decision with optional comment |
| My Leave (admin view) | `/absence/my` | All authenticated | Personal leave request history | View own submitted requests |
| Leave Balances | `/absence/balances` | HR_ADMIN, HR_DIRECTOR | Balance table per employee per leave type per year | Review balances; manual adjustment |
| Leave Calendar | `/absence/calendar` | HR_ADMIN, MANAGER | Monthly/weekly visual calendar, colour-coded by leave type | View team absences at a glance |
| Leave Rules | `/absence/rules` | HR_ADMIN, HR_DIRECTOR | Rule set editor (accrual rate, carryover cap, encashment rules) | Configure leave accrual policies |

#### Payroll

| Page Name | Route | Roles | Key UI Elements | Actions |
|---|---|---|---|---|
| Payroll Hub | `/payroll` | HR_ADMIN, HR_DIRECTOR, PAYROLL_ADMIN, SUPER_ADMIN, FINANCE | Run status cards, quick navigation | Navigate to runs, definitions, WPS |
| Payroll Runs | `/payroll/runs` | PAYROLL_ADMIN, HR_ADMIN, HR_DIRECTOR, FINANCE | Run list with period, status badge, employee count | Create new run, view details |
| New Payroll Run | `/payroll/runs/new` | PAYROLL_ADMIN | Legal entity selector, period (month/year), run type | Create run in DRAFT status |
| Payroll Run Detail | `/payroll/runs/[runId]` | PAYROLL_ADMIN, HR_DIRECTOR | Entry table (one row per employee), totals summary, action buttons | Calculate → Lock → Submit for Approval → Approve → Generate WPS SIF → Confirm |
| Payroll Definitions | `/payroll/definitions` | PAYROLL_ADMIN, HR_ADMIN | Salary structure list, element assignments | Define salary structures per legal entity |
| Salary Elements | `/payroll/salary-elements` | PAYROLL_ADMIN | Element list (Basic, Housing, Transport, Overtime, Deductions) | Add and configure salary components |
| WPS | `/payroll/wps` | PAYROLL_ADMIN, FINANCE | WPS file generation panel, submission status | Generate WPS SIF file for Central Bank submission |
| Payroll Reports | `/payroll/reports` | PAYROLL_ADMIN, FINANCE, HR_DIRECTOR | Export filters (entity, period, element) | Download payroll data as Excel/CSV |
| Employee Payslips (ESS) | `/me/payslips` | EMPLOYEE | Payslip list with month/year | Download personal payslip PDF |

#### Timesheets

| Page Name | Route | Roles | Key UI Elements | Actions |
|---|---|---|---|---|
| Timesheets (admin) | `/timesheets` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN, PAYROLL_ADMIN | Period selector, all-employee timesheet overview | Review all timesheets |
| Team Timesheets | `/timesheets/team` | MANAGER, HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | Direct reports timesheet list with status badges | Approve or reject team timesheets |
| My Timesheet | `/me/timesheet` | EMPLOYEE | Calendar grid, daily hours, submit button | Enter and submit personal timesheet |

#### Org Chart

| Page Name | Route | Roles | Key UI Elements | Actions |
|---|---|---|---|---|
| Org Chart | `/org-chart` | All authenticated | Interactive node canvas (employee nodes, vacant nodes), filter panel, analytics drawer, export button, ARIA chat panel | Zoom/pan chart; filter by entity/dept; open hiring drawer for vacancies; open transfer/acting drawers; export as PNG or PDF; ask ARIA questions about the org |

#### Approvals & Workflows

| Page Name | Route | Roles | Key UI Elements | Actions |
|---|---|---|---|---|
| Approvals Inbox | `/approvals` | All approver roles + EMPLOYEE (own requests) | Pending approvals list, SLA countdown badges, resource type filter | Approve / Reject / Delegate; email one-click action links are also available |
| Approval Detail | `/approvals/[instanceId]` | Assigned approver | Request details, prior decisions, Approve / Reject / Delegate buttons with comment field | Take decision on approval step |
| Workflow Instances | `/workflows` | HR_ADMIN, SUPER_ADMIN | In-flight workflow list with status | Monitor all active workflows |
| Workflow Instance Detail | `/workflows/[instanceId]` | HR_ADMIN, SUPER_ADMIN | Step-by-step timeline with decisions | View workflow progress; intervene if needed |
| Workflow History | `/workflows/[instanceId]/history` | HR_ADMIN, SUPER_ADMIN | Full audit trail of every action | Review decision history |

#### Employee Letters

| Page Name | Route | Roles | Key UI Elements | Actions |
|---|---|---|---|---|
| Letters Hub | `/employee-letters` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | Letter type cards (Salary Certificate, NOC, etc.), recent letters table | Navigate to letter type; generate letter |
| Letter Type | `/employee-letters/[typeCode]` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | Employee selector, template preview (EN + AR), generate button, recent letters table | Generate letter(s), download PDF, email to employee |
| Sign Letter (public) | `/letters/sign/[token]` | Public (token link) | Letter preview, digital signature capture | Sign letter — no login required |

#### Settings & Configuration

| Page Name | Route | Roles | Key UI Elements | Actions |
|---|---|---|---|---|
| Settings Hub | `/settings` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | Category cards linking to each settings section | Navigate to configuration areas |
| Absence Types | `/settings/absence-types` | HR_ADMIN, SUPER_ADMIN | Type list (Annual, Sick, Maternity, etc.) with rules | Edit absence type properties |
| AI Agent (ARIA) | `/settings/ai-agent` | SUPER_ADMIN, HR_ADMIN | Model selector, system prompt editor, knowledge source list | Configure ARIA model and behaviour |
| Appearance | `/settings/appearance` | HR_ADMIN, SUPER_ADMIN | Theme selector, colour token preview | Set UI appearance |
| Branding | `/settings/branding` | HR_ADMIN, SUPER_ADMIN | Logo upload, primary colour picker | Set company branding shown in app and letters |
| Compliance | `/settings/compliance` | HR_ADMIN, HR_DIRECTOR | Compliance rule list, event log | Track compliance events |
| Currency Setup | `/settings/currency-setup` | SUPER_ADMIN | Currency table, exchange rates | Configure multi-currency settings |
| Custom Fields | `/settings/custom-fields` | HR_ADMIN, SUPER_ADMIN | Field list with entity type and data type | Add custom fields to person or position forms |
| Delegations | `/settings/delegations` | HR_ADMIN, SUPER_ADMIN | Delegation rule list with date ranges and delegate names | Set who approves on behalf of whom and when |
| Document Branding | `/settings/document-branding` | HR_ADMIN, SUPER_ADMIN | Logo upload, footer text | Style PDF letters with company branding |
| Employee Numbers | `/settings/employee-numbers` | SUPER_ADMIN | Numbering scheme (prefix, sequence, padding) | Configure auto-generated employee ID format |
| Form Layout | `/settings/form-layout` | HR_ADMIN, SUPER_ADMIN | Drag-and-drop field order editor | Reorder fields on employee forms |
| Insurance Plans | `/settings/insurance-plans` | HR_ADMIN, SUPER_ADMIN | Plan list (BASIC / ENHANCED / PREMIUM / EXECUTIVE) with premium amounts | Define insurance plans |
| Insurance Policy | `/settings/insurance-policy` | HR_ADMIN, SUPER_ADMIN | Policy template editor | Configure standard insurance policy terms |
| Leave Rules | `/settings/leave-rules` | HR_ADMIN, HR_DIRECTOR | Accrual rate, carryover cap, encashment rule editor per leave type | Define how leave accrues and rolls over |
| Letter Templates | `/settings/letter-templates` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | Template list, bilingual body editor with merge fields | Edit letter templates (English + Arabic) |
| Notifications | `/settings/notifications` | HR_ADMIN, SUPER_ADMIN | Notification toggle list (email, in-app, event types) | Control which events trigger notifications |
| Permissions | `/settings/permissions` | SUPER_ADMIN | Feature permission matrix | Override default role permissions |
| HR Policy | `/settings/policy` | HR_ADMIN, SUPER_ADMIN | Policy document editor | Publish internal HR policy documents |
| Work Schedules | `/settings/work-schedules` | HR_ADMIN, SUPER_ADMIN | Schedule pattern editor (working days, hours per day) | Define work patterns (5-day, 4.5-day, etc.) |
| Workflow Definitions | `/settings/workflows` | HR_ADMIN, SUPER_ADMIN | Workflow list | Manage all approval workflow definitions |
| Workflow Editor | `/settings/workflows/[id]` | HR_ADMIN, SUPER_ADMIN | Step list, approver role/group picker, SLA hours input | Edit workflow steps and approver routing |

#### Master Data

| Page Name | Route | Roles | Key UI Elements | Actions |
|---|---|---|---|---|
| Legal Entities | `/master-data/legal-entities` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | Entity list, edit drawer | Add/edit legal entities (companies) |
| Departments | `/master-data/departments` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | Department tree + list, parent-child structure | Add/edit departments and hierarchy |
| Salary Grades | `/master-data/grades` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | Grade list with salary bands, notice period | Add/edit grades |
| Holiday Calendars | `/master-data/holiday-calendars` | HR_ADMIN, SUPER_ADMIN | Calendar with public holiday dates | Set public holidays per year/entity |
| Jobs | `/master-data/jobs` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | Job title list (EN + AR) | Add/edit job titles |
| Leave Types | `/master-data/leave-types` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | Type list with paid/unpaid flag, cert requirement | Configure leave type properties |
| Locations | `/master-data/locations` | HR_ADMIN, SUPER_ADMIN | Location list (office, city, country) | Add/edit work locations |
| Positions | `/master-data/positions` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | Position list with vacancy/frozen/confidential badges | Add/edit org chart positions |
| Projects | `/master-data/projects` | HR_ADMIN, SUPER_ADMIN | Project list with entity assignment | Add/edit project codes |
| Work Schedules | `/master-data/work-schedules` | HR_ADMIN, SUPER_ADMIN | Schedule pattern list | Add/edit standard work patterns |

#### Admin-Only Screens

| Page Name | Route | Roles | Key UI Elements | Actions |
|---|---|---|---|---|
| User Management | `/users` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | User table with role badge, search/filter | Edit user roles, deactivate users |
| New User | `/users/new` | SUPER_ADMIN | User creation form (email, role, entity) | Create user account |
| Pending Changes | `/pending-changes` | HR_ADMIN, SUPER_ADMIN | Pending data modification review list | Approve or reject staged data changes |
| Probation Management | `/admin/probation` | HR_ADMIN, SUPER_ADMIN | Probation list, status badges, end-date countdown | Confirm or extend probation periods |
| Exit Clearance List | `/admin/exit-clearance` | HR_ADMIN, SUPER_ADMIN | Exit clearance checklist list by employee | Review outstanding clearance items |
| Exit Clearance (person) | `/admin/exit-clearance/[personId]` | HR_ADMIN, SUPER_ADMIN | Checklist items (IT, Finance, HR, Facilities), complete/waive buttons | Complete or waive individual clearance items |
| Feature Permissions | `/access/feature-permissions` | HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN | Feature permission matrix per role | Override feature-level access |
| DataOps Console | `/admin/dataops` | SUPER_ADMIN only | SQL editor, schema browser, natural-language SQL generator, results table | Write and execute SQL queries; browse all tables |
| Reports Hub | `/reports` | HR_ADMIN, HR_DIRECTOR, PAYROLL_ADMIN, FINANCE, SUPER_ADMIN | Report type cards | Navigate to specific reports |
| Insurance Report | `/reports/insurance` | HR_ADMIN, HR_DIRECTOR, FINANCE, SUPER_ADMIN | Coverage table with plan breakdown | Download insurance coverage export |

---

## PART 5 — BUSINESS RULES & VALIDATIONS

### UAE Labour Law Rules (enforced in code)

| Rule ID | Description |
|---|---|
| BR-AL-001 | Minimum annual leave is 22 calendar days per year |
| BR-AL-002 | Leave duration is calculated in calendar days (inclusive of start and end date) |
| BR-SL-001 | Sick leave requires a medical certificate (Article 31, UAE Labour Law) |
| BR-SL-002 | Medical certificate threshold is configurable per absence type |
| BR-ML-004 | Maternity leave: employee entitled to 2 × 30-minute nursing breaks for 6 months after delivery (FDL 33/2021) |
| BR-SP-001 | Special provisions apply for employees with a dependent disability |
| BR-NP-001 | Notice period defaults to 30 calendar days; configurable per salary grade |
| BR-EOSB-001 | End of Service Benefit scheme is determined by jurisdiction: TRADITIONAL / VSS / DEWS |
| BR-GPSSA-001 | UAE nationals are subject to GPSSA pension contribution |
| BR-GPSSA-002 | Expat employees are subject to DEWS or company pension provision |
| BR-WPS-005 | WPS SIF file is required for all UAE mainland payrolls before salary transfer |
| BR-37 | Probation follows the state machine: ACTIVE → CONFIRMED / EXTENDED / FAILED |
| BR-DIFC-003 | DIFC jurisdiction employees are governed by DIFC Employment Law (not mainland UAE Labour Law) |
| BR-INS-006 | Insurance states: ENROLLED / PENDING_ENROLMENT / RENEWAL_DUE / EXPIRED / CANCELLED / NOT_ENROLLED |
| BR-PR-001 | Project codes must be unique within a legal entity |
| BR-WF-010 | Any hire dated more than 30 days in the past requires a dual approval workflow (Line Manager → HR HOD) |
| BR-29 | Every approval decision screen must show exactly three buttons: Approve, Reject, Delegate |
| BR-AUDIT-001 | Every database table must have 7 audit columns: created_by, created_by_name, created_date, updated_by, updated_by_name, last_updated_date, updated_date |
| BR-TENANT-001 | Every table and every insert must include tenant_id |

### Status State Machines

**Leave Request:**
```
DRAFT → SUBMITTED → APPROVED → TAKEN
                 → REJECTED
                 → CANCELLED
       → CANCELLED
APPROVED → RECALLED
```

**Payroll Run:**
```
DRAFT → CALCULATED → LOCKED → APPROVAL_PENDING → APPROVED → SIF_GENERATED → CONFIRMED
                                               → REJECTED (returns to CALCULATED)
```

**Worker Assignment:**
```
PENDING_HIRE → ACTIVE → ON_LEAVE → ACTIVE
                      → SUSPENDED
             → TERMINATED
             → RETIRED
             → DECEASED
```

**Probation:**
```
ACTIVE → CONFIRMED
       → EXTENDED → CONFIRMED / FAILED
       → FAILED
```

**Contract:**
```
ACTIVE → AMENDED (new contract created)
       → TERMINATED
       → EXPIRED (fixed-term, date reached)
```

**Employee Letter:**
```
DRAFT → PENDING_SIGNATURE → SIGNED
                          → CANCELLED
```

**Document:**
```
VALID → EXPIRING (within 90 days) → EXPIRED
     → UNDER_RENEWAL
     → CANCELLED
```

**Insurance:**
```
NOT_ENROLLED → PENDING_ENROLMENT → ENROLLED → RENEWAL_DUE → ENROLLED (renewed)
                                             → EXPIRED
                                             → CANCELLED
```

### Field Validation Rules

| Field | Validation |
|---|---|
| Leave duration | Positive number, maximum 365 days |
| Leave notes | Maximum 2000 characters |
| Leave half-day period | Must be AM or PM if `isHalfDay = true` |
| Contracted hours | Defaults to 48 hours/week (UAE standard) |
| Salary elements | Numeric, positive |
| DataOps SQL input | Maximum 8000 characters; dangerous operations blocked |
| Global search query | Minimum 2 characters; returns maximum 10 results |
| Document expiry alerts | Generated at 90, 60, 30, and 14 days before expiry |
| Backdated hire threshold | 30 days — beyond this, dual approval workflow is triggered |

### PII (Personal Data) Rules

The following fields are AES-256-GCM encrypted at rest and decrypted only in authorised Server Actions:
- Emirates ID
- Passport number
- IBAN (bank account number)

PDPL (UAE Personal Data Protection Law 2021) consent is recorded on the employee record:
- `pdpl_consent_given` / `pdpl_consent_date` / `pdpl_consent_version`
- `sensitive_data_consent` / `sensitive_data_consent_date`
- `religion_consent_given`

---

## PART 6 — WORKFLOW & APPROVAL LOGIC

### How Approvals Work

1. A request is submitted (leave request, payroll run, hire, transfer, etc.)
2. The system creates a **Workflow Instance** with one or more sequential approval **Steps**
3. Each step has an assigned approver (resolved from role or approval group)
4. The approver receives an in-app notification AND an email with one-click Approve / Reject / Delegate links
5. The approver takes a decision — the step records: decision, notes, timestamp, IP address
6. When all steps are approved, the underlying record is updated automatically
7. If any step is rejected, the workflow closes and the request is returned

### Approval Workflows

| Workflow | What triggers it | Approvers | Outcome |
|---|---|---|---|
| Leave Request | Employee submits leave request | Configurable (default: Line Manager) | Leave approved/rejected; balance updated |
| Payroll Approval | Payroll Admin submits run for approval | Payroll Admin → Finance / HR Director | Run status advances to APPROVED |
| Backdated Hire | Hire date > 30 days in the past | Step 1: Line Manager (48h SLA) → Step 2: HR HOD (48h SLA) | Hire confirmed or kept pending |
| Transfer | Transfer request initiated | Line Manager → HR Admin | Worker assignment updated |
| Promotion | Promotion request initiated | Line Manager → HR Director | Grade and position updated |
| Termination | Termination initiated by HR | HR Admin → HR Director | Contract terminated; exit clearance begins |
| Probation Confirmation | Probation end date approaching | Line Manager | Probation status updated |
| Exit Clearance | Termination confirmed | Dept HOD → IT → Finance → HR | Clearance checklist completed |

### SLA Rules

- Default SLA per approval step: **48–72 hours** (configurable)
- On SLA breach: escalate to the next level in hierarchy (configurable per workflow)
- SLA is tracked in business days using the UAE public holiday calendar

### Email One-Click Actions

Every approval notification email contains:
- **Approve** link
- **Reject** link
- **Delegate** link

Each link contains a signed JWT token (single-use, expires after 7 days). Clicking the link records the decision without requiring the approver to log into the system.

### Delegation

- Any approver can delegate approval authority to another person for a specific date range
- Delegation rules are configured in **Settings → Delegations** or **Configuration → Workflows → Delegations**
- A delegation rule specifies: delegator, delegate, from date, to date

---

## PART 7 — INTEGRATIONS

### Microsoft Entra ID (SSO)

- Primary login method for all users
- Users sign in with their Avaniis Microsoft 365 account
- New users are auto-provisioned with `EMPLOYEE` role and a Super Admin is notified
- Roles are then manually assigned by a Super Admin

### ARIA — AI Assistant (Anthropic Claude)

- Powered by Anthropic Claude API
- Available to employees (at `/me/aria`) and HR admins (at `/aria`)
- Responds to HR queries in English and Arabic
- Has access to org chart data (can answer questions about reporting lines, team size, vacancies)
- Configured by Super Admin in Settings → AI Agent (model, system prompt, knowledge sources)
- Responses stream in real-time

### Azure Blob Storage

- Stores all uploaded documents: employee documents, profile photos, letter PDFs
- Access is via time-limited SAS URLs (documents expire from direct access)

### Email (SMTP / Azure Communication Services)

- Sends approval notification emails with one-click action links
- Sends letter PDFs to employees
- Sends new-user notification to Super Admin
- Configurable SMTP credentials; falls back gracefully if not configured

### WPS (Wage Protection System)

- UAE Central Bank requirement for all UAE mainland payrolls
- System generates a SIF (Salary Information File) after payroll approval
- SIF is downloaded and submitted to the employer's bank
- Tracked in **Payroll → WPS**

---

## PART 8 — KEY PROCESSES (END-TO-END)

### Onboarding a New Employee

1. **HR Admin** navigates to **People → New Employee**
2. Fills in personal details (name in English and Arabic, nationality, date of birth, Emirates ID, passport)
3. Selects legal entity, department, position, grade, line manager
4. Sets hire date and probation period
5. System auto-generates employee ID
6. If hire date is more than 30 days in the past → backdated hire approval workflow triggers automatically
7. Once confirmed, employee receives Microsoft SSO access and can log in to ESS

### Processing Monthly Payroll

1. **Payroll Admin** navigates to **Payroll → Runs → New Run**
2. Selects legal entity and period (month/year)
3. System calculates salaries, allowances, GPSSA/DEWS/EOSB provisions for all active employees
4. Payroll Admin reviews entries, adjusts if needed, clicks **Calculate**
5. Clicks **Lock** to prevent further changes
6. Clicks **Submit for Approval** — approval workflow begins
7. HR Director reviews and **Approves**
8. Payroll Admin generates **WPS SIF file** and downloads it
9. SIF file is submitted to the bank for salary transfer
10. Payroll Admin clicks **Confirm** — run is finalized; payslips are accessible to employees

### Submitting a Leave Request (Employee)

1. Employee navigates to **My Leave** (or **My ARIA** to ask for recommendation)
2. Clicks **New Request**, selects leave type, start date, end date
3. System shows calculated duration and remaining balance
4. If sick leave → medical certificate upload may be required
5. Employee submits — leave request status moves to SUBMITTED
6. Line Manager receives approval notification (in-app + email)
7. Manager approves/rejects from **Approvals inbox** or via email one-click link
8. Employee receives notification of decision
9. If approved, balance is debited automatically

### Generating an Employee Letter

1. **HR Admin** navigates to **Employee Letters**
2. Selects letter type (e.g. Salary Certificate)
3. Selects employee(s) — system merges template with employee data
4. Reviews bilingual preview (English + Arabic)
5. Clicks **Generate** — PDF is created and stored
6. Optionally emails letter to employee or marks it for signing
7. Employee receives letter in **My Letters**; can sign digitally if required

### Approving a Probation

1. Automated alert fires 7 days before probation end date
2. **Line Manager** receives notification: confirm or extend
3. Manager navigates to **Approvals inbox** or clicks email link
4. Selects: Confirm / Extend (with new end date) / Fail
5. Employee is notified of outcome
6. If confirmed → `probation_status` updates to CONFIRMED; confirmation date recorded

---

## PART 9 — KNOWN LIMITATIONS (PHASE 1)

| Item | Status | Planned |
|---|---|---|
| MFA (Multi-Factor Authentication) enforcement | Not built — 4 security tests are skipped | Phase 2 |
| Microsoft Edge browser certification | Deferred (needs Edge installed) | Phase 2 |
| Full RTL/Arabic visual audit | CSS direction correct; full visual regression pending | Phase 2 |
| Colour contrast full accessibility audit | axe-core critical/serious = 0; colour-contrast deferred | Phase 2 |
| Insurance insurer API integration | Read-only in Phase 1 | Phase 3 |
| Bulk insurance import | Not built | Go-live milestone |
| Manager Dashboard approval wiring | UI placeholder only; no backend action yet | Phase 2 |
| OpenAI / Azure OpenAI provider for ARIA | Not implemented; Anthropic only | Not scheduled |

---

## PART 10 — GLOSSARY

| Term | Definition |
|---|---|
| **ESS** | Employee Self-Service — the employee-facing portal at `/me` |
| **MSS** | Manager Self-Service — manager functions within the HR admin area |
| **WPS** | Wage Protection System — UAE Central Bank mandate requiring monthly payroll SIF file submission |
| **GPSSA** | General Pension and Social Security Authority — UAE national pension scheme |
| **DEWS** | DIFC Employee Workplace Savings — DIFC-based pension scheme for expats |
| **EOSB** | End of Service Benefit — UAE gratuity payment on employment termination |
| **SIF** | Salary Information File — WPS-formatted file submitted to bank for payroll |
| **PDPL** | UAE Personal Data Protection Law 2021 — governs how personal data is collected and stored |
| **ARIA** | AI-powered HR assistant built into AVANIIS HCM (Anthropic Claude) |
| **Effective-date pattern** | Records are never deleted; they are closed (given an end date) and a new version is opened |
| **Org chart node** | A position in the org chart — can be filled (shows employee) or vacant (shows open role) |
| **Tenant ID** | Avaniis's unique identifier (`00000000-0000-0000-0000-000000000001`) — on every record |
| **Acting assignment** | Temporary assignment to a higher role while the permanent holder is absent |
| **Approval group** | A named group of approvers — any member can approve on behalf of the group |
| **SLA** | Service Level Agreement for approval steps — breach triggers escalation |
| **DSAR** | Data Subject Access Request — employee can download all their personal data |
| **MDM** | Master Data Management — legal entities, departments, grades, jobs, positions, locations |
| **JWT** | JSON Web Token — used for session management and email approval links |
| **AES-256-GCM** | Encryption standard used for PII fields (Emirates ID, passport, IBAN) |
| **Drizzle ORM** | The database library used; all queries go through this, never raw SQL in app code |
| **Server Action** | Next.js 14 feature — a backend function called directly from the frontend, with full auth context |

---

## PART 11 — DATA MODELS (DETAILED)

### persons
The central employee record. Every HR entity references back to this.

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| person_number | VARCHAR(20) | Auto-generated unique ID (e.g. EMP-00123) |
| first_name_en / last_name_en | VARCHAR(100) | Required |
| first_name_ar / last_name_ar | VARCHAR(100) | Arabic name |
| full_name_en / full_name_ar | VARCHAR(255) | Computed concatenation |
| date_of_birth | DATE | |
| gender | VARCHAR(10) | MALE / FEMALE / OTHER |
| nationality | VARCHAR(100) | |
| nationality_category | VARCHAR(20) | UAE_NATIONAL / GCC_NATIONAL / EXPAT (affects payroll) |
| marital_status | VARCHAR(20) | |
| religion | VARCHAR(50) | |
| emirates_id | TEXT | Encrypted (AES-256-GCM) |
| passport_number | TEXT | Encrypted (AES-256-GCM) |
| visa_status | VARCHAR(20) | VALID / EXPIRING / EXPIRED / CANCELLED / PENDING / NOT_APPLICABLE |
| profile_photo_url | VARCHAR(500) | Azure Blob SAS URL |
| is_active | BOOLEAN | Soft delete flag |
| legal_entity_id | UUID → legal_entities | Which company this person belongs to |
| grade_id | UUID → grades | Current salary grade |
| probation_status | VARCHAR(20) | ACTIVE / CONFIRMED / EXTENDED / FAILED |
| probation_end_date | DATE | |
| hire_date | DATE | |
| confirmation_date | DATE | Date probation was confirmed |
| contracted_hours_per_week | NUMERIC | Default 48 |
| pdpl_consent_given | BOOLEAN | PDPL consent flag |
| sensitive_data_consent | BOOLEAN | Consent for sensitive fields (religion, etc.) |

### worker_assignments
Links an employee to their current position. Uses effective-date pattern — never deleted.

| Field | Type | Notes |
|---|---|---|
| person_id | UUID → persons | |
| position_id | UUID → positions | Current org chart position |
| department_id | UUID → departments | Current department |
| grade_id | UUID → grades | Grade at time of assignment |
| job_id | UUID → jobs | Job title |
| line_manager_id | UUID → persons | Direct line manager |
| employment_type | VARCHAR(20) | FULL_TIME / PART_TIME / TEMPORARY / TASK_BASED / FLEXIBLE / REMOTE / SHARED |
| work_location | VARCHAR(20) | OFFICE / REMOTE / HYBRID |
| assignment_status | VARCHAR(20) | ACTIVE / ON_LEAVE / SUSPENDED / TERMINATED / RETIRED / DECEASED / PENDING_HIRE |
| effective_start_date | DATE | When this assignment became active |
| effective_end_date | DATE | NULL = currently active |
| is_acting | BOOLEAN | True if this is a temporary acting assignment |
| acting_end_date | DATE | When acting assignment ends |

### positions
An org chart node — can be filled (linked to an employee) or vacant.

| Field | Type | Notes |
|---|---|---|
| position_title_en / position_title_ar | VARCHAR(255) | Bilingual title |
| department_id | UUID → departments | |
| reports_to_position_id | UUID → positions | Self-referencing for hierarchy |
| job_id | UUID → jobs | |
| grade_id | UUID → grades | Grade band for this position |
| location_id | UUID → locations | |
| is_confidential | BOOLEAN | Hidden from non-admin org chart |
| is_frozen | BOOLEAN | Budget-frozen position |
| vacancy_start_date | DATE | When position became vacant |

### absence_requests (leave requests)

| Field | Type | Notes |
|---|---|---|
| person_id | UUID → persons | Who is requesting leave |
| absence_type_id | UUID → absence_types | Type of leave |
| status | VARCHAR(20) | DRAFT / SUBMITTED / APPROVED / REJECTED / CANCELLED / TAKEN / RECALLED |
| start_date / end_date | DATE | Leave period |
| duration_days | NUMERIC | Calculated calendar days |
| is_half_day | BOOLEAN | |
| half_day_period | VARCHAR(2) | AM / PM |
| medical_cert_required | BOOLEAN | |
| notes | TEXT | Max 2000 chars |
| workflow_instance_id | UUID → workflow_instances | Linked approval workflow |

### payroll_runs

| Field | Type | Notes |
|---|---|---|
| legal_entity_id | UUID → legal_entities | Which company's payroll |
| run_number | VARCHAR(50) | Auto-generated reference |
| period_month / period_year | INTEGER | e.g. 5 / 2026 |
| status | VARCHAR(30) | DRAFT → CALCULATED → LOCKED → APPROVAL_PENDING → APPROVED → SIF_GENERATED → CONFIRMED |
| total_gross / total_net / total_deductions | NUMERIC | Payroll totals |
| wps_file_url | VARCHAR(500) | Azure Blob URL of generated SIF |

### audit_log
Every write to the system produces an immutable audit entry.

| Field | Type | Notes |
|---|---|---|
| actor_id | UUID → persons | Who made the change |
| actor_name | VARCHAR(255) | Name at time of change |
| action | VARCHAR(100) | e.g. PERSON.CREATED, LEAVE.APPROVED |
| resource_type | VARCHAR(50) | e.g. PERSON, LEAVE_REQUEST |
| resource_id | UUID | ID of the record changed |
| changes | JSONB | Field-level diff (old value → new value) |
| ip_address | VARCHAR(45) | Requester IP |
| created_at | TIMESTAMPTZ | When the change occurred |

---

## PART 12 — API REFERENCE (SUMMARY)

All API routes are under `/api/`.

| Route | Method | Auth Required | Purpose |
|---|---|---|---|
| `/api/health` | GET | None | Health check (returns `{ status: 'ok' }`) |
| `/api/auth/[...nextauth]` | GET/POST | None | Auth.js session management |
| `/api/search?q=` | GET | Session | Global person search (min 2 chars, max 10 results) |
| `/api/aria/chat` | POST | Session | ARIA streaming chat (returns SSE stream) |
| `/api/workflow/action?token=` | GET | JWT token | One-click email approve/reject/delegate |
| `/api/attendance/sync` | POST | API key | Biometric punch data ingest (1–5000 punches) |
| `/api/employee-letters/list` | GET | Session | List letters by type |
| `/api/employee-letters/download` | GET | Session + HR role | Download letter PDF |
| `/api/employee-letters/download-my` | GET | Session | Employee downloads own letter |
| `/api/persons/import/template` | GET | Session + HR role | Download Excel import template |
| `/api/dataops/execute` | POST | Session + SUPER_ADMIN (writes) | Execute SQL via DataOps console |
| `/api/cron/probation-alerts` | POST | CRON_SECRET | Daily probation expiry alerts |
| `/api/cron/workflow-sla` | POST | CRON_SECRET | Workflow SLA breach detection |
| `/api/cron/org-chart-snapshot` | POST | CRON_SECRET | Daily org hierarchy snapshot |

---

*End of TRAINING_MANUAL_CONTEXT.md*
*All information is factual and derived from live codebase analysis of AVANIIS HCM Phase 1 MVP (Sprints 1–11).*
