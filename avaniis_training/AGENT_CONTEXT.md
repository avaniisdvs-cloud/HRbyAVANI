# AVANIIS HR — Agent Master Context
# MANDATORY: Every agent session reads this before writing any code

## Supervisor + Child Agent Model
- You are a CHILD AGENT. You build ONE document.
- The SUPERVISOR reviews your output using qa_check.py and visual audit.
- You do not stop until qa_check.py returns "ALL PASS".

## Gold Standard Reference
File: G1_Employee_Transfers_Promotions_Final.html
- 1670 lines · 116KB · 25/25 QA checks · 10 sections s1–s10
- You MUST match this quality exactly
- Study its CSS, JS, SVG patterns, and section structure before building

## Absolute Rules (violations = supervisor rejection)
1. COPY the exact CSS :root variables from G1 — no new vars, no changes
2. COPY the exact JS pattern from G1 — ROLE_MAP + IntersectionObserver
3. Process flows = swimlanes ALWAYS (never bullet lists)
4. Status transitions = SVG node-edge diagrams ALWAYS (never text lists)
5. SVG markers: 4 explicit-color defs (grey/gold/teal/red) — NO context-stroke
6. Every SVG: viewBox + role="img" + <title> + <desc>
7. @media print + @media (max-width:640px) both required
8. Zero CDN — no cdnjs, no jsdelivr, no unpkg
9. No self-referencing CSS vars (--x:var(--x) is a bug)
10. Real UAE names: Ahmed, Sara, Omar, Mohammed, Fatima — no "Employee A"

## AVANIIS HR Platform Facts
Brand: Navy #0A1628 · Gold #C9A84C · White #FFFFFF
Stack: Next.js 14 · TypeScript · PostgreSQL 16 · Drizzle ORM · Auth.js v5 + Microsoft Entra ID
Roles: EMPLOYEE · MANAGER · HR_ADMIN · HR_DIRECTOR · PAYROLL_ADMIN · SUPER_ADMIN · FINANCE

Routes:
  /dashboard         HR Admin dashboard (KPI cards)
  /persons           Employee master list
  /org-chart         Organisation chart (Tasks A-G complete)
  /approvals         Approval inbox (all roles)
  /absence           Leave admin + balances + calendar
  /payroll           Payroll runs + WPS + salary elements + EOSB
  /timesheets        Team timesheets
  /master-data       MDM: entities, depts, positions, grades, jobs
  /aria              ARIA console (HR Admin+)
  /reports           Analytics and exports
  /employee-letters  Letter generation
  /settings/workflows        Workflow template editor
  /settings/delegations      Delegation rules
  /me/profile        ESS: personal profile + DSAR download
  /me/leave          ESS: leave requests
  /me/payslips       ESS: payslip history
  /me/timesheet      ESS: personal timesheet
  /me/letters        ESS: letters + digital signing
  /me/aria           ESS: ARIA employee chat
  /users             User management (SUPER_ADMIN only)

Key Tables (use exact field names):
  persons: id, name_en, name_ar, nationality, emirates_id(enc), passport_number(enc), hire_date, nationality_category
  worker_assignments: id, person_id, position_id, department_id, line_manager_id, assignment_status, effective_start_date, effective_end_date, is_acting, acting_end_date, grade_id
  positions: id, title_en, title_ar, department_id, is_frozen, is_confidential, vacancy_start_date
  absence_requests: id, person_id, leave_type_id, status, start_date, end_date
  payroll_runs: id, legal_entity_id, period_start, period_end, status, wps_file_path
  workflow_instances: id, template_id, resource_id, resource_type, status, created_at
  approval_steps: id, workflow_instance_id, approver_id, status, decided_at, comment
  audit_log: id, actor_id, action, table_name, record_id, old_values, new_values, created_at

Business Rules (cite with BR-xx code):
  BR-29        Every approval screen = exactly Approve + Reject + Delegate
  BR-TR-001    Lateral transfer: same grade, no salary change, 14-day notice
  BR-PR-001    Promotion: grade must increase, salary must increase, Finance sign-off
  BR-AC-001    Acting assignment: max 6 months (UAE Law), acting_end_date required
  BR-AC-002    Acting allowance: optional, triggers salary element
  BR-CE-001    Cross-entity transfer: EOSB triggered, new contract required
  BR-DM-001    Demotion: written employee consent required (FDL 33/2021)
  BR-SE-001    Secondment: home position held, max 12 months, GL split
  BR-EOSB-001  EOSB calculation: from hire_date to effective_date
  BR-AUDIT-001 Every write: immutable INSERT-only audit log entry
  BR-WF-010    Backdated hire >30 days: dual approval Manager + HR Director
  BR-LV-001    Annual leave: minimum 30 calendar days (UAE FDL 33/2021 Art. 29)
  BR-LV-003    Maternity leave: 60 days (45 full + 15 half pay)
  BR-LV-004    Paternity leave: 5 days
  FDL-33-2021  UAE Federal Decree-Law No. 33 of 2021 (Labour Law)

## Required Section Structure (all 10 sections, every document)

S1 — Overview & Preconditions
  - 1-paragraph plain English description of module purpose
  - Preconditions checklist: 7 items, each with ✓ icon + name + config route
  - Blocking conditions panel (red): what system refuses and why

S2 — Dependency Map (SVG, viewBox 0 0 900 480)
  3 named chains — each as left-to-right connected nodes:
  Chain A: pre-conditions before the main action executes
  Chain B: what changes automatically after execution
  Chain C: edge case or compliance path (cross-entity/backdated/exception)
  Node colours: navy(trigger) · teal(system-auto) · amber(decision) · red(irreversible) · purple(cross-entity)

S3 — Six Type/Feature Cards (2×3 grid)
  Each card: coloured header + icon + fact table (5 rows) + common mistake warning (amber)

S4 — Two Swimlane Process Flows
  Each swimlane: named role lanes with colour-coded left border
  Lane colours: hr=gold · sys=teal · mgr=purple · emp=amber · fin=orange · hd=purple-dark
  Each step: position:relative box with step-number badge

S5 — State Machine SVG (viewBox 0 0 680 310 or similar)
  Primary lifecycle states as rounded rectangles
  ACTIVE/primary state: teal, larger, central
  Terminal states: red, smaller, no outgoing arrows
  Arrows: explicit marker colors, fill="none" on all connectors

S6 — Three Simulated Screen Mockups
  Each mockup: full AVANIIS HR app shell (navy topbar + sidebar + main area)
  Sidebar: all nav items, active item highlighted with gold left-border
  Main: realistic content for this module
  Annotated callouts (numbered ① ② ③ ④) with explanation list below

S7 — Guide Section
  Module-specific reference guide:
  Approval flows → two paths side-by-side (in-app + email one-click)
  Navigation → how to reach this module from different roles
  Configuration → how to set up prerequisites
  Include: SLA rules, delegation setup, compliance notes

S8 — Four Operational Scenarios
  Each scenario card: coloured header + numbered steps + amber compliance warning + rule reference
  Use real UAE context: Avaniis, AVANIIS Real Estate, specific employee names

S9 — Troubleshooting Knowledge Base (4 cards)
  Each card: coloured header + 3 problems, each with:
  Problem (what user sees) → Cause (root cause) → Fix (exact steps)

S10 — ARIA Intelligence Notes (8 query cards, 2-column grid)
  Each card:
  - User query (italic, gold-tinted)
  - "ARIA checks in order" (numbered list: exact table.field references)
  - ARIA response (dark box: what ARIA actually says)
  - Rule reference (monospace)

## Build Process
1. Read this file completely
2. Read tasks/batchN/TASK_XX.md for your specific module
3. Open G1_Employee_Transfers_Promotions_Final.html and study:
   - The exact CSS structure (copy :root vars verbatim)
   - The exact JS pattern (copy ROLE_MAP + IO verbatim)
   - The SVG marker definitions (copy all 4 markers verbatim)
   - The section layout pattern
4. Build your document section by section
5. Run: python3 qa_check.py outputs/FILENAME.html
6. Fix every failure
7. Repeat until ALL PASS
