#!/usr/bin/env python3
"""
AVANIIS HR Training System — Local Agent Setup
Run: python3 avaniis_agent_setup.py
Creates all task files + context + QA tools in ./avaniis_training/
"""
import os, sys, textwrap

BASE = os.path.join(os.getcwd(), "avaniis_training")
for d in ["tasks/batch1","tasks/batch2","tasks/batch3","tasks/batch4","outputs","logs"]:
    os.makedirs(os.path.join(BASE, d), exist_ok=True)

print(f"Creating agent workspace at: {BASE}")

# ── QA VALIDATOR ──────────────────────────────────────────────────────────────
QA_SCRIPT = '''#!/usr/bin/env python3
"""Universal QA validator for all AVANIIS training documents"""
import sys, re, os

def qa(filepath):
    if not os.path.exists(filepath):
        print(f"FILE NOT FOUND: {filepath}"); return False
    with open(filepath) as f: c = f.read()
    fname = os.path.basename(filepath)
    checks = [
        ("10 sections s1-s10",          all(f\'id="s{i}"\' in c for i in range(1,11))),
        ("3-chain dependency map",       all(x in c for x in ["CHAIN A","CHAIN B","CHAIN C"])),
        ("6+ type/feature cards",        c.count("type-card") >= 6),
        ("2+ swimlane flows",            c.count("sw-head") >= 2),
        ("4+ SVG elements",              c.count("<svg") >= 4),
        ("All SVGs have viewBox",        len(re.findall(r\'viewBox="\', c)) >= 4),
        ("3 screen mockups A/B/C",       all(f"Mockup {x}" in c for x in ["A","B","C"])),
        ("8 ARIA intelligence cards",    c.count("aria-card") >= 8),
        ("8 ARIA dependency checks",     c.count("aria-checks") >= 8),
        ("4 operational scenarios",      c.count("sc-card") >= 4),
        ("4 troubleshooting cards",      c.count("ts-card") >= 4),
        ("ROLE_MAP JS defined",          "ROLE_MAP" in c),
        ("setRole hides DOM sections",   "style.display" in c),
        ("IntersectionObserver nav",     "IntersectionObserver" in c),
        ("@media print CSS",             "@media print" in c),
        ("@media mobile 640px",          "max-width:640px" in c.replace(" ","")),
        ("Zero CDN dependencies",        "cdnjs" not in c and "jsdelivr" not in c),
        ("No context-stroke",            "context-stroke" not in c),
        ("All SVG tags balanced",        c.count("<svg") == c.count("</svg>")),
        ("All div tags balanced",        c.count("<div") == c.count("</div>")),
        ("No placeholder [TBD] text",    "[TBD]" not in c and "Lorem ipsum" not in c),
        ("Brand navy --n defined",       "--n:#0A1628" in c.replace(" ","")),
        ("Brand gold --g defined",       "--g:#C9A84C" in c.replace(" ","")),
        ("File size > 80KB",             len(c.encode()) > 80000),
        ("File size < 250KB",            len(c.encode()) < 256000),
    ]
    passed = sum(1 for _,v in checks if v)
    total  = len(checks)
    fails  = [l for l,v in checks if not v]
    print(f"\\n{'='*55}")
    print(f"  QA REPORT: {fname}")
    print(f"  Score: {passed}/{total} = {round(passed/total*100)}%")
    print(f"{'='*55}")
    for label, val in checks:
        print(f"  {\'✅\' if val else \'❌\'}  {label}")
    if fails:
        print(f"\\n  FAILURES ({len(fails)}):")
        for f in fails: print(f"    ✗ {f}")
        print("\\n  STATUS: NEEDS_REVISION — fix failures and rerun")
        return False
    else:
        print(f"\\n  STATUS: ALL PASS — document certified ✓")
        return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 qa_check.py outputs/FILENAME.html")
        sys.exit(1)
    ok = qa(sys.argv[1])
    sys.exit(0 if ok else 1)
'''

with open(os.path.join(BASE, "qa_check.py"), "w") as f:
    f.write(QA_SCRIPT)
os.chmod(os.path.join(BASE, "qa_check.py"), 0o755)
print("✓ qa_check.py")

# ── AGENT CONTEXT ─────────────────────────────────────────────────────────────
AGENT_CONTEXT = '''# AVANIIS HR — Agent Master Context
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
'''

with open(os.path.join(BASE, "AGENT_CONTEXT.md"), "w") as f:
    f.write(AGENT_CONTEXT)
print("✓ AGENT_CONTEXT.md")

# ── SUPERVISOR ────────────────────────────────────────────────────────────────
SUPERVISOR = '''# AVANIIS HR Training — Supervisor Agent
# Role: Review child agent output. Never build. Only review, approve, or reject.

## Review Checklist (run for every submitted document)

### Step 1 — Automated QA
python3 qa_check.py outputs/FILENAME.html
Must return 25/25 ALL PASS. Any failure → return to child agent with exact failure list.

### Step 2 — Visual Browser Check
Open the HTML file in Chrome/Safari:
□ Header: navy background, gold module tag, bilingual Arabic subtitle
□ Sticky nav: stays at top on scroll, active item highlights gold
□ Role filter: clicking HR Admin hides employee-only sections
□ SVGs render: dependency map (3 chains), state machine, all arrows visible
□ Screen mockups: look like real AVANIIS HR application
□ Print preview (Ctrl+P): nav hidden, clean layout, no broken elements

### Step 3 — Content Accuracy
□ All BR-xx rules match the known rule list in AGENT_CONTEXT.md
□ All routes match /hr-admin/* /me/* patterns
□ All field names match schema (not invented)
□ ARIA cards have numbered dependency-check sequences
□ Scenarios use real UAE names and Avaniis context
□ No content contradicts G1 (the gold standard)

### Step 4 — Cross-Reference Integrity
□ References to other modules link correctly
□ Troubleshooting cards reference correct routes for fixes
□ ARIA queries reference correct table.field names

## Approval Response
SUPERVISOR APPROVAL — [MODULE_ID] v1.0
Status: CERTIFIED ✓
QA Score: 25/25
File size: [KB]
Visual: PASS
Content: PASS
Cross-refs: PASS
→ Ready for production deployment on SharePoint/Vercel

## Rejection Response
SUPERVISOR REJECTION — [MODULE_ID]
Status: NEEDS_REVISION
Failed checks:
  1. [specific issue with section/line reference]
  2. [specific issue]
Action required: Fix all items above and resubmit to supervisor.

## Build Sequence Gate
Batch 1 (M1 M2 M3 M5 M7 M8) → MUST all be CERTIFIED before Batch 2 starts
Batch 2 (M4 M6 M9 G2 G3)    → MUST all be CERTIFIED before Batch 3 starts
Batch 3 (G4 G5)              → MUST all be CERTIFIED before Batch 4 starts
Batch 4 (G6)                 → Final document — references all others
'''

with open(os.path.join(BASE, "SUPERVISOR.md"), "w") as f:
    f.write(SUPERVISOR)
print("✓ SUPERVISOR.md")

# ── BATCH 1 TASK FILES ────────────────────────────────────────────────────────
TASKS_B1 = {

"M1_Onboarding.md": """# CHILD AGENT TASK — M1: Employee Onboarding & Core HR
## Batch: 1 | No dependencies | Output: outputs/M1_Employee_Onboarding_CoreHR.html
## Target roles: HR_ADMIN · HR_DIRECTOR · SUPER_ADMIN

### S1 Preconditions (7)
1 Legal entity → /master-data/legal-entities
2 Department under entity → /master-data/departments
3 Position with grade → /master-data/positions
4 Grade has salary band → /master-data/grades
5 Job title defined → /master-data/jobs
6 Line manager has ACTIVE assignment → /persons
7 Hire workflow configured → /settings/workflows
Blocking: duplicate emirates_id · position occupied · missing grade_salary_ranges · payroll entity mismatch

### S2 Dependency Chains
A: [Legal Entity] → [Department] → [Position+Grade] → [Person Record] → [Worker Assignment] → [ACTIVE]
B: [ACTIVE] → [Leave eligibility created] → [Payroll enrolled] → [Org chart node] → [ARIA visible] → [ESS access]
C: [Hire date >30 days past] → [BR-WF-010 dual approval] → [Manager+HR Director] → [Audit note] → [Employee created]

### S3 Six Cards
Standard Hire · Backdated Hire (BR-WF-010) · Rehire · Contractor · Secondee Inbound · Probation Extension
Common mistakes: backdated hire without approval / no salary band on grade / missing name_ar field

### S4 Two Swimlanes
Flow A: Standard hire (HR Admin · System · Employee — 3 lanes)
Flow B: Backdated hire >30 days (HR Admin · Manager · HR Director · System — 4 lanes)

### S5 State Machine
PENDING_HIRE → ACTIVE → ON_LEAVE → SUSPENDED → TERMINATED → RETIRED
ACTIVE = teal, central. All non-ACTIVE show blocked modules.

### S6 Mockups
A: /persons/new drawer — emirates_id 🔒 field + bilingual name fields + auto employee ID + hire date warning
B: /persons/[id] profile — tabs: Overview · Assignments · Documents · Audit Trail
C: Assignment status panel — current ACTIVE + grade + position + effective dates + history

### S7 Probation Guide
State machine: IN_PROBATION → CONFIRMED | EXTENDED (max 2×) | FAILED
UAE rule BR-PROB-001: max 6 months (FDL 33/2021 Art. 9)
Cron alert: 7 days before end date · 3-button decision: Confirm · Extend · Fail

### S8 Scenarios
A: Position not in master data yet — prerequisite setup steps
B: Duplicate Emirates ID — search, identify, resolve
C: Hire date 45 days past — backdated hire workflow end-to-end
D: Employee created but not in payroll — PENDING_HIRE root cause

### S9 Troubleshooting
1: Not in org chart (status/filter/position)
2: Emirates ID exists error (duplicate search)
3: Probation alert not firing (cron/ARIA config)
4: Grade not in dropdown (salary band missing)

### S10 ARIA Queries
Q1: Create employee for Ahmed joining last month → backdated workflow explanation
Q2: Why can't I find Fatima in org chart → assignment_status check
Q3: Ahmed's probation ends next week → confirm/extend/fail guidance
Q4: How many employees currently in probation → WHERE probation_status=IN_PROBATION
Q5: What fields are encrypted → emirates_id + passport_number + iban AES-256-GCM
Q6: Show employees hired last 30 days → hire_date range query
Q7: Why is Sara not in payroll → assignment_status + payroll enrollment check
Q8: Hire date 45 days past — what happens → BR-WF-010 dual approval explanation

## QA Command
python3 qa_check.py outputs/M1_Employee_Onboarding_CoreHR.html
""",

"M2_Leave.md": """# CHILD AGENT TASK — M2: Leave & Absence Management
## Batch: 1 | No dependencies | Output: outputs/M2_Leave_Absence_Management.html
## Target roles: EMPLOYEE · MANAGER · HR_ADMIN · HR_DIRECTOR

### S1 Preconditions (7)
1 Employee has ACTIVE assignment
2 Leave types configured → /master-data/leave-types
3 Leave rules set (accrual rates, carry-forward) → /master-data/leave-rules
4 Holiday calendar configured → /master-data/holidays
5 Accrual engine running (cron)
6 Manager assigned as line_manager_id
7 Leave approval workflow configured → /settings/workflows
Blocking: no balance · dates in past · overlapping approved leave · notice period conflict

### S2 Dependency Chains
A: [ACTIVE assignment] → [Leave eligibility created] → [Accrual runs monthly] → [Balance accrues] → [Employee can request]
B: [Request submitted] → [Manager approves 48h SLA] → [Balance deducted] → [Calendar blocked] → [Payroll notified]
C: [Sick leave >2 days] → [Medical cert required BR-LV-002] → [HR uploads cert] → [Balance deducted] → [Audit logged]

### S3 Six Leave Types
Annual Leave (BR-LV-001: min 30 days) · Sick Leave (90 days tiered) · Maternity (BR-LV-003: 60 days) · Paternity (BR-LV-004: 5 days) · Unpaid Leave · Public Holiday
Common mistakes: carry-forward cap not set / sick >2 days no cert / maternity eligibility not checked

### S4 Two Swimlanes
Flow A: Employee self-service request (/me/leave → Manager → System)
Flow B: HR Admin applies on behalf (override capability, balance warning bypass)

### S5 State Machine
DRAFT → SUBMITTED → APPROVED → ACTIVE (on leave) → COMPLETED
SUBMITTED → REJECTED (terminal) · WITHDRAWN · APPROVED → CANCELLED (before start)

### S6 Mockups
A: /me/leave/new — leave type picker + date range calendar + balance indicator + reason
B: Manager approval view — employee info + dates + balance + Approve/Reject/Delegate
C: Leave balance dashboard — bar chart per leave type (used/remaining/accrued)

### S7 Approval Guide
Two paths: in-app (/approvals) + email one-click JWT
SLA: 48h, UAE business days, cron /api/cron/workflow-sla
Delegation: /settings/delegations (essential when manager on leave)
Carry-forward: max 30 days UAE law, excess forfeited

### S8 Scenarios
A: Leave overlaps notice period — what blocks and manager options
B: Sick leave exceeds 90 days — status change and HR escalation flow
C: Leave applied after payroll close — retroactive impact handling
D: Manager on leave — team leave approval delegation setup

### S9 Troubleshooting
1: Balance shows zero — accrual not run / new hire proration
2: Cannot submit — no balance / past dates / conflicting leave
3: Manager not getting emails — notification config / delegation
4: Public holiday not blocked — entity holiday calendar not configured

### S10 ARIA Queries
Q1: How many annual leave days does Ahmed have left → absence_balances query
Q2: Who is on leave this week → absence_requests WHERE active this week
Q3: Show all pending leave approvals → status=SUBMITTED for my team
Q4: Ahmed wants sick leave — what documents needed → BR-LV-002 cert rules
Q5: Why is Sara's balance negative → carry-forward cap / balance calculation
Q6: How many sick days has Mohammed taken this year → YTD sick leave count
Q7: Maximum annual leave carry-forward → 30 days UAE law explanation
Q8: Can Fatima take maternity leave next month → eligibility + BR-LV-003 check

## QA Command
python3 qa_check.py outputs/M2_Leave_Absence_Management.html
""",

"M3_Payroll.md": """# CHILD AGENT TASK — M3: Payroll Processing
## Batch: 1 | No dependencies | Output: outputs/M3_Payroll_Processing.html
## Target roles: PAYROLL_ADMIN · HR_DIRECTOR · FINANCE

### S1 Preconditions (7)
1 All employees ACTIVE with assignments
2 Salary elements configured → /master-data/salary-elements
3 Legal entities with bank details → /master-data/legal-entities
4 WPS bank credentials configured (IBAN per employee — encrypted)
5 EOSB scheme per nationality_category set
6 GL cost centre mapping to Oracle ERP
7 Finance approver user assigned → /users
Blocking: IBAN missing · LOCKED payroll = no changes · no salary element = excluded · nationality_category missing = EOSB scheme unknown

### S2 Dependency Chains
A: [ACTIVE employees] → [Salary elements resolved] → [DRAFT run] → [CALCULATED] → [Finance APPROVED] → [LOCKED] → [WPS file] → [Bank] → [PAID]
B: [EOSB trigger] → [hire_date to eff_date] → [Scheme: TRADITIONAL/DEWS/VSS] → [GPSSA if UAE national] → [Settlement] → [Payroll processes]
C: [Mid-month change] → [effective_date splits period] → [Pro-rata days 1-14 old / 15-end new] → [GL journals to both cost centres]

### S3 Six Cards
Standard Payroll Run · Mid-Month Transfer Split · EOSB Traditional · DEWS Scheme · GPSSA/UAE National · WPS Submission
Common mistakes: payroll locked during Finance approval / IBAN wrong format / nationality_category not set

### S4 Two Swimlanes
Flow A: Monthly payroll run (Payroll Admin · System · Finance · Bank — 4 lanes)
Flow B: EOSB settlement on termination/cross-entity (HR Admin · System · Finance · Employee — 4 lanes)

### S5 State Machine
DRAFT → CALCULATED → APPROVAL_PENDING → APPROVED → LOCKED → WPS_GENERATED → SUBMITTED → PAID
CALCULATED → DRAFT (recalculation) · APPROVED → REJECTED_BY_FINANCE

### S6 Mockups
A: Payroll run list — status badges + employee count + total + WPS status
B: Run detail — employee breakdown table with salary/deductions/EOSB/net
C: WPS generation screen — bank file format + SIF download + submission status

### S7 Salary Elements Guide
Types: Basic · Housing · Transport · Acting allowance · Overtime · Deductions
Grade-based defaults · mid-month pro-rata calculation · GL cost centre mapping
IBAN encryption (AES-256-GCM) · WPS SIF file format requirements

### S8 Scenarios
A: Employee resigned during payroll run — EOSB mid-cycle calculation
B: WPS file rejected by bank — error codes and re-submission process
C: Wrong salary applied — cannot correct current run, adjustment next run
D: New entity added mid-year — first payroll run setup steps

### S9 Troubleshooting
1: Employee excluded from run — not ACTIVE / no salary element / IBAN missing
2: WPS file format error — IBAN length / bank code / Emirates ID format
3: EOSB calculation mismatch — nationality_category wrong / hire_date wrong
4: Finance step frozen — payroll LOCKED blocks all workflow approvals

### S10 ARIA Queries
Q1: Total payroll cost this month → current run total by entity
Q2: Why is Ahmed not in payroll run → ACTIVE check + salary element check
Q3: Ahmed's EOSB if he leaves today → BR-EOSB-001 calculation
Q4: Employees with missing IBAN → WHERE iban IS NULL
Q5: When is payroll cutoff → current run status + close date
Q6: What salary elements does Sara have → salary_elements for her assignment
Q7: WPS file rejected — what to check → IBAN format + bank code + SIF structure
Q8: Mid-month transfer payroll impact → pro-rata split explanation

## QA Command
python3 qa_check.py outputs/M3_Payroll_Processing.html
""",

"M5_Approvals.md": """# CHILD AGENT TASK — M5: Approvals & Workflow Engine
## Batch: 1 | No dependencies | Output: outputs/M5_Approvals_Workflow_Engine.html
## Target roles: MANAGER · HR_ADMIN · HR_DIRECTOR · All Approvers

### S1 Preconditions (7)
1 Workflow templates configured → /settings/workflows
2 Approver roles assigned to users → /users
3 SLA timers set per workflow type
4 Holiday calendar for UAE business days
5 Notification templates configured
6 Delegation rules optionally set → /settings/delegations
7 Email SMTP configured for one-click JWT links
Blocking: no Finance approver = promotion stalls · no delegation = SLA breach when approver absent

### S2 Dependency Chains
A: [Request submitted] → [workflow_instance created] → [approval_steps resolved] → [Step 1 notified] → [Decision] → [Next step or terminal]
B: [48h no action] → [cron /api/cron/workflow-sla] → [SLA breached] → [Auto-escalate to next level] → [ARIA alert fired]
C: [Any step rejects] → [status=REJECTED terminal] → [Requester notified] → [New request required — no reopen]

### S3 Six Workflow Types
Transfer (BR-TR-001) · Promotion (BR-PR-001) · Acting Assignment (BR-AC-001) · Backdated Hire (BR-WF-010) · Leave (Manager level) · Employee Letter
Common mistakes: no Finance approver before creating promotion / no delegation before going on leave

### S4 Two Swimlanes
Flow A: 2-step approval (Manager + HR Admin)
Flow B: 4-step promotion (Manager → HR Admin → HR Director → Finance)

### S5 State Machine
DRAFT → PENDING_STEP_1 → PENDING_STEP_2 → APPROVED → EXECUTED
Any step → REJECTED (terminal) · WITHDRAWN · RECALLED (before effective date only)

### S6 Mockups
A: /approvals inbox — table with SLA timers, status badges, 3-button actions (BR-29)
B: /settings/workflows template editor — step configuration, SLA settings, approver roles
C: /settings/delegations — delegator + delegate + date range + scope selector

### S7 Approval Paths Guide
Path A: In-app at /approvals → find request → Approve/Reject/Delegate
Path B: Email one-click → JWT token (single-use, 7-day expiry, no login required)
SLA: 48-72h configurable, UAE business days, /api/cron/workflow-sla daily
BR-29: exactly 3 buttons always — Approve · Reject (reason ≥10 chars) · Delegate

### S8 Scenarios
A: Approver on leave, no delegate — SLA breach cascade
B: Finance frozen during payroll close — workflow blocked explanation
C: Rejected workflow — retry options (new request, not reopen)
D: Email link expired/used — troubleshooting JWT token

### S9 Troubleshooting
1: Stuck at Step 2 — identify approver, escalation path
2: Email approval link broken — JWT token expired/consumed
3: Wrong approver on step — workflow template misconfiguration
4: Recall not available — effective date already passed

### S10 ARIA Queries
Q1: All approvals pending >48 hours → SLA breach detection
Q2: Why is Ahmed's promotion stuck → workflow_instance step status
Q3: Who is Finance approver for promotions → user role query
Q4: Set up delegation for Sara on leave → /settings/delegations guidance
Q5: Email approval link not working → JWT token troubleshooting
Q6: How to recall approved transfer → RECALLED status conditions
Q7: What happens if no one approves in time → auto-escalation explanation
Q8: My approvals this month → approved decisions for current user

## QA Command
python3 qa_check.py outputs/M5_Approvals_Workflow_Engine.html
""",

"M7_OrgChart.md": """# CHILD AGENT TASK — M7: Org Chart & ARIA AI Assistant
## Batch: 1 | No dependencies | Output: outputs/M7_OrgChart_ARIA.html
## Target roles: ALL users (read) · HR_ADMIN (actions) · SUPER_ADMIN (config)

### S1 Preconditions (7)
1 All employees ACTIVE with positions assigned
2 Department hierarchy set in master data
3 ARIA API key configured (ANTHROPIC_API_KEY)
4 Org chart permissions set per role
5 Acting assignments workflow configured
6 Hiring request workflow configured
7 Export PDF/PNG — A3 landscape print CSS
Blocking: no ACTIVE assignment = no org chart node · no API key = ARIA disabled

### S2 Dependency Chains
A: [worker_assignments] → [Org chart renders] → [Node colours applied] → [Acting strips shown] → [Vacancy indicators]
B: [User query] → [ARIA intent detected] → [Confidence ≥0.7] → [DB query] → [PII masked] → [Response + action offered]
C: [Org chart ··· action] → [Drawer opens] → [Request submitted] → [Workflow created] → [Org chart updates on approval]

### S3 Six Feature Cards
Full Org / My Team / By Dept views · Node types (5 colours) · ··· Action menu · Analytics panel · Filter panel · Export (PNG/PDF)
Common mistakes: export blank — too many nodes / acting strip not showing — still PENDING not ACTIVE

### S4 Two Swimlanes
Flow A: Assign Acting Manager from org chart ··· menu
Flow B: Request Transfer from org chart ··· menu

### S5 ARIA Intent State Machine
RECEIVED → INTENT_DETECTED → CONFIDENCE_CHECKED → [≥0.7: DB_QUERY → RESPONSE → LOGGED]
CONFIDENCE_CHECKED → [<0.7: ESCALATION_OFFERED]
INTENT_DETECTED → [INJECTION: BLOCKED → ALERT]
4 intent types: ORG_QUERY · HR_ACTION · DIAGNOSTIC · COMPLIANCE

### S6 Mockups
A: Full org chart — filter panel open, amber acting strip, red vacant node, ··· menu open
B: ARIA chat panel — example query + structured response + action button
C: Org Chart Analytics panel — headcount KPIs, span of control, vacancy %, Emiratisation %

### S7 Navigation Guide
Zoom/pan controls · search by name/ID · breadcrumb trail · view shortcuts
Node colour legend: green(active) · amber(acting/frozen) · red(vacant) · blue(contractor)
How to reach from each role · mobile nav behaviour

### S8 Scenarios
A: Large org — find specific person without scrolling
B: Acting end date wrong — update acting assignment
C: ARIA wrong answer — confidence fallback and escalation
D: Org chart not reflecting approved transfer — effective date in future (expected)

### S9 Troubleshooting
1: Employee missing — PENDING_HIRE / confidential / active filter
2: Acting amber strip not showing — PENDING_APPROVAL not ACTIVE yet
3: ARIA not responding — API key / rate limit / network
4: PDF export blank pages — too many nodes / print CSS issue

### S10 ARIA Queries
Q1: Show Finance department org chart → PAN_TO_NODE intent
Q2: Who reports to the CEO → direct reports query
Q3: Find Ahmed Al-Rashidi in org chart → person search + pan
Q4: How many vacancies in IT → vacancy_start_date IS NOT NULL count
Q5: Acting assignments expiring this month → is_acting=true + acting_end_date range
Q6: Current Emiratisation percentage → nationality_category count / total
Q7: Who has the most direct reports → line_manager_id count GROUP BY
Q8: Navigate to Operations department → FILTER_DEPT intent

## QA Command
python3 qa_check.py outputs/M7_OrgChart_ARIA.html
""",

"M8_SysAdmin.md": """# CHILD AGENT TASK — M8: System Administration & Master Data
## Batch: 1 | No dependencies | Output: outputs/M8_System_Administration_MasterData.html
## Target roles: SUPER_ADMIN · HR_ADMIN

### S1 Preconditions (7)
1 Super Admin user exists and logged in
2 Microsoft Entra ID SSO configured
3 Default tenant_id set (00000000-0000-0000-0000-000000000001)
4 At minimum: 1 legal entity configured
5 Database migrations current (0026 applied)
6 Cron jobs running (/api/cron/*)
7 SMTP configured for notifications
Blocking: no legal entity = cannot create any employee · no grade salary band = promotions blocked · SSO misconfigured = no login

### S2 Dependency Chains
A: [Legal Entity] → [Department] → [Grade+SalaryBand] → [Job] → [Position] → [Worker Assignment] → [All modules work]
B: [Grade salary band update] → [Existing positions recheck] → [Grade Band Validator updates] → [Finance sign-off required if above max]
C: [Workflow template config] → [Approval steps resolve] → [SLA timers apply] → [Delegation rules apply] → [All request types work]

### S3 Six Entity Types
Legal Entities · Departments · Grades & Salary Bands · Jobs · Positions · Custom Fields
Each: route + who can edit + what breaks if missing + bilingual (name_en + name_ar required)

### S4 Two Swimlanes
Flow A: New legal entity setup — full hierarchy from scratch
Flow B: New grade addition — salary band + impact on existing positions + Finance notification

### S5 Position Lifecycle State Machine
DRAFT → ACTIVE → OCCUPIED → VACANT (on departure) → FROZEN → ARCHIVED
FROZEN: is_frozen=true blocks all assignments
VACANT: vacancy_start_date set automatically

### S6 Mockups
A: /master-data navigation — all entity types listed, counts, last updated
B: Grade editor — salary band with min/mid/max visual slider
C: Position record — is_frozen toggle + is_confidential toggle + vacancy_start_date field

### S7 User Management Guide
/users — SUPER_ADMIN only · role assignment · SSO integration
Role permissions matrix table: all 7 roles × all 10 modules
Password/SSO: Microsoft Entra ID is the ONLY login method — no local passwords
Custom fields: /settings/custom-fields — add to persons or assignments

### S8 Scenarios
A: New subsidiary acquired — full entity hierarchy setup
B: Salary band increase — updating min/max and impact on existing employees
C: Reorganisation — moving department to new parent without breaking assignments
D: Position frozen — freeze process, impact, and unfreeze with HR Director approval

### S9 Troubleshooting
1: Transfer failing — position is_frozen=true or grade rank mismatch
2: Promotion salary blocked — grade_salary_ranges not defined
3: Employee in wrong entity — legal_entity_id mismatch in assignment
4: New user cannot log in — Entra ID SSO / role not assigned

### S10 ARIA Queries
Q1: How many positions currently vacant → vacancy_start_date IS NOT NULL
Q2: Show all frozen positions → is_frozen=true list
Q3: Salary band for Grade 7 → grade_salary_ranges WHERE grade_id=G7
Q4: Why can't I promote Ahmed if salary is in range → other blockers check
Q5: All positions in Avaniis Construction entity → by legal_entity_id
Q6: How to set up a new legal entity → step-by-step configuration
Q7: What custom fields are configured → /settings/custom-fields list
Q8: Which departments have no positions → department vacancy analysis

## QA Command
python3 qa_check.py outputs/M8_System_Administration_MasterData.html
""",
}

for fname, content in TASKS_B1.items():
    path = os.path.join(BASE, "tasks", "batch1", fname)
    with open(path, "w") as f:
        f.write(content)
    print(f"✓ tasks/batch1/{fname}")

# ── BATCH 2 TASK FILES ────────────────────────────────────────────────────────
TASKS_B2 = {

"M4_ESS.md": """# CHILD AGENT TASK — M4: Employee Self-Service (ESS)
## Batch: 2 | Depends on: M1 M2 | Output: outputs/M4_Employee_Self_Service.html
## Target roles: EMPLOYEE (primary) · MANAGER (for context)

### S1 Preconditions (7)
1 Employee has ACTIVE worker assignment
2 Microsoft Entra ID SSO access provisioned
3 Leave rules configured (M2 prerequisite)
4 Payslip generation running (M3 prerequisite)
5 Letter templates configured (links to M6)
6 Timesheet rules configured
7 ARIA employee chat enabled → /me/aria
Blocking: PENDING_HIRE = ESS access denied · no assignment = no payslips

### S2 Dependency Chains
A: [ACTIVE assignment] → [SSO provisioned] → [/me/* routes accessible] → [Profile visible] → [Leave balance shown] → [Payslips listed]
B: [Employee submits leave] → [/me/leave/new] → [Manager notified] → [Approved] → [Balance updated] → [Calendar blocked]
C: [Letter requested/received] → [/me/letters] → [Employee reviews] → [Digital signature] → [/letters/sign/[token]] → [Archived]

### S3 Six ESS Modules
My Profile (/me/profile) · My Leave (/me/leave) · My Payslips (/me/payslips) · My Timesheet (/me/timesheet) · My Letters (/me/letters) · ARIA Chat (/me/aria)
Common mistakes: employee tries to edit encrypted fields / DSAR download not visible / letter signing link expired

### S4 Two Swimlanes
Flow A: Employee submits leave request (Employee · System · Manager — 3 lanes)
Flow B: Employee receives and signs a letter (HR Admin generates · System sends · Employee signs — 3 lanes)

### S5 ESS Access State Machine
NOT_PROVISIONED → PROVISIONED → ACTIVE_ACCESS → SUSPENDED_ACCESS → TERMINATED_ACCESS
ACTIVE_ACCESS has all /me/* routes
SUSPENDED_ACCESS: read-only · TERMINATED_ACCESS: payslips + letters only (30 days)

### S6 Mockups
A: /me/profile — personal info + encrypted fields masked + DSAR download button + language toggle (EN/AR)
B: /me/leave — leave balance cards + request history + New Request button
C: /me/letters — letter list + Sign Now button + signed status indicator

### S7 DSAR & Privacy Guide
DSAR: Data Subject Access Request — employee downloads own data at /me/profile
Encrypted fields: emirates_id shows as ****-****-***-XXXX · iban masked · passport masked
Language toggle: all /me/* pages bilingual (name_ar for Arabic content)
Letter signing: token-based public URL (/letters/sign/[token]) — no login required

### S8 Scenarios
A: Employee cannot see their payslips — assignment not ACTIVE
B: Letter signing link expired — token expiry and re-send process
C: Leave balance wrong — accrual not run / grade change impact
D: Employee wants to download all their data — DSAR process

### S9 Troubleshooting
1: /me/* shows access denied — assignment_status not ACTIVE
2: Payslips missing from list — payroll_run not PAID for that period
3: Leave balance shows 0 — accrual engine / new hire pro-rata
4: Letter not appearing — letter not assigned to this employee in /employee-letters

### S10 ARIA Queries (from /me/aria — employee-facing)
Q1: How much annual leave do I have left → my absence_balance
Q2: When was my last payslip → most recent payroll_run PAID
Q3: How do I request leave → /me/leave/new guided walkthrough
Q4: What is my current grade and salary → my worker_assignment
Q5: Can I download my employment contract → /me/letters list
Q6: What is my line manager's name → my line_manager_id lookup
Q7: My payslip looks wrong this month → guide to contact HR Admin
Q8: How do I update my contact details → /me/profile editable fields

## QA Command
python3 qa_check.py outputs/M4_Employee_Self_Service.html
""",

"M6_Letters.md": """# CHILD AGENT TASK — M6: Employee Letters & Document Generation
## Batch: 2 | Depends on: M1 | Output: outputs/M6_Employee_Letters_Documents.html
## Target roles: HR_ADMIN · HR_DIRECTOR · EMPLOYEE (receiving)

### S1 Preconditions (7)
1 Employee has ACTIVE assignment
2 Letter templates configured in system
3 Digital signing enabled
4 Employee email address on file
5 PDF generation working (jspdf 4.2.1)
6 SMTP configured for delivery
7 DOMPurify XSS sanitization active
Blocking: no email = cannot deliver · template variables not filled = generation fails

### S2 Dependency Chains
A: [HR Admin] → [/employee-letters → select template] → [Select employee] → [Merge fields] → [PDF generated] → [Sent to employee]
B: [Employee receives] → [/me/letters] → [Review letter] → [Click Sign] → [/letters/sign/[token]] → [Digital signature recorded] → [Archived]
C: [Token-based signing] → [Public URL no login] → [One-time use JWT] → [Signature timestamped] → [Audit log entry BR-AUDIT-001]

### S3 Six Letter Types
Salary Certificate · NOC (No Objection Certificate) · Employment Confirmation · Promotion Letter · Experience Letter · Warning Letter
Common mistakes: wrong salary figures from wrong payroll run / signing link not sent / template merge fields missing

### S4 Two Swimlanes
Flow A: HR Admin generates and sends letter (HR Admin · System · Employee)
Flow B: Employee digital signing (Employee · System — public route, no auth)

### S5 Letter Lifecycle State Machine
DRAFT → GENERATED → SENT → VIEWED → SIGNED → ARCHIVED
SENT → EXPIRED (if signing link not used within 30 days)
GENERATED → RECALLED (before SENT only)

### S6 Mockups
A: /employee-letters — template selector + employee picker + merge field preview
B: /me/letters — letter list with status badges (Pending Signature / Signed / Archived)
C: /letters/sign/[token] — public signing page (no login) with letter preview + Sign button

### S7 Template Configuration Guide
Available merge fields: {{employee_name}} {{employee_name_ar}} {{position}} {{grade}} {{salary}} {{hire_date}} {{department}} {{entity_name}} {{date_today}}
XSS protection: DOMPurify sanitizes all merge values before PDF generation
CVE note: jspdf upgraded 2.5.2 → 4.2.1 (LFI vulnerability patched)
Arabic rendering: name_ar field used when letter language = Arabic

### S8 Scenarios
A: Salary certificate shows wrong amount — wrong payroll run selected
B: Employee cannot find their letter — not sent / wrong email / /me/letters filter
C: Signing link expired — 30-day expiry, HR must regenerate
D: Letter in wrong language — language setting on template

### S9 Troubleshooting
1: PDF not generating — jspdf error / template syntax / DOMPurify blocking
2: Employee email not received — SMTP / email on file / spam filter
3: Signature not recording — JWT token expired / already used
4: Wrong salary in letter — payroll_run selection in letter generation

### S10 ARIA Queries
Q1: Generate a salary certificate for Ahmed → /employee-letters guided steps
Q2: Has Sara signed her promotion letter → letter status check
Q3: Ahmed's NOC letter was sent — why can't he find it → /me/letters check
Q4: How do I add a new letter template → template configuration guide
Q5: Signing link expired — what do I do → regenerate process
Q6: How long is the signing link valid → 30 days JWT expiry
Q7: Show all unsigned letters this month → status=SENT not SIGNED
Q8: Can letters be in Arabic → bilingual template explanation

## QA Command
python3 qa_check.py outputs/M6_Employee_Letters_Documents.html
""",

"M9_MSS.md": """# CHILD AGENT TASK — M9: Manager Self-Service (MSS)
## Batch: 2 | Depends on: M5 M7 | Output: outputs/M9_Manager_Self_Service.html
## Target roles: MANAGER (primary) · HR_ADMIN (for reference)

### S1 Preconditions (7)
1 User has MANAGER role assigned
2 Has active direct reports (line_manager_id = this manager)
3 /approvals accessible
4 Delegation configured if going on leave → /settings/delegations
5 Org chart actions enabled
6 Leave approval workflow assigned to manager role
7 Team timesheets visible → /timesheets
Blocking: no direct reports = no team view / no delegation = SLA breach risk

### S2 Dependency Chains
A: [MANAGER role] → [Team visible in /org-chart] → [Approvals inbox populated] → [Team timesheets accessible] → [Team leave visible]
B: [Team member submits request] → [Manager inbox badge increments] → [48h SLA starts] → [Manager decides] → [System executes on approval]
C: [Manager absent] → [Delegation rule active] → [Delegate receives notifications] → [Delegate approves on behalf] → [Audit records delegator]

### S3 Six MSS Capabilities
Team Org Chart View · Approvals Inbox · Team Leave Calendar · Team Timesheets · Request Transfers/Promotions · Delegation Setup
Common mistakes: approving own transfer (system blocks) / no delegation before leave / missing team member due to filter

### S4 Two Swimlanes
Flow A: Manager approves team leave request (3 lanes: Employee · Manager · System)
Flow B: Manager initiates team member promotion from org chart (4 lanes: Manager · HR Admin · Finance · System)

### S5 Manager Decision State Machine
REQUEST_RECEIVED → REVIEWED → APPROVED → SYSTEM_EXECUTING → COMPLETED
REQUEST_RECEIVED → REJECTED (reason mandatory) → REQUESTER_NOTIFIED
REQUEST_RECEIVED → DELEGATED → DELEGATE_DECIDES → OUTCOME
SLA_BREACH → AUTO_ESCALATED → HR_DIRECTOR_NOTIFIED

### S6 Mockups
A: Manager dashboard — pending approvals count, team on leave today, upcoming probation reviews
B: /approvals inbox filtered to "My Team" — all request types sorted by SLA remaining
C: Team org chart view — only direct reports and their reports visible, acting strips, vacancy indicators

### S7 Delegation Complete Guide
When to set: before any planned absence
Route: /settings/delegations → Add Rule
Fields: Delegator (you) · Delegate (colleague) · From Date · To Date · Scope (All or specific types)
Impact: delegate receives ALL your approval notifications during the period
Audit: all delegate decisions show delegator name in audit log

### S8 Scenarios
A: New team member not in my team view — assignment not pointing to me as line_manager_id
B: Cannot approve my own transfer request — system block BR-29 self-approval rule
C: SLA breach notification received — escalation path and how to still act
D: Delegate made wrong approval — escalation to HR Admin for reversal options

### S9 Troubleshooting
1: Team member not visible in my view — line_manager_id not set to me
2: Approval badge shows 0 but email says pending — filter on inbox / browser cache
3: Cannot see team timesheets — role permission / team assignment
4: Delegation not working — active date range / delegate role insufficient

### S10 ARIA Queries
Q1: Show me all pending approvals for my team → inbox with my team filter
Q2: Who on my team is on leave this week → team absence calendar
Q3: Ahmed's probation ends soon — what do I need to do → confirmation guidance
Q4: How do I set up delegation before my holiday → /settings/delegations steps
Q5: My team's overtime this month → timesheets summary
Q6: Can I approve a request on behalf of my team member → no — they must submit
Q7: Someone else approved my team's requests → check delegation rules
Q8: How do I request a promotion for Sara → org chart → Sara → ··· → Request Promotion

## QA Command
python3 qa_check.py outputs/M9_Manager_Self_Service.html
""",

"G2_ARIA_Governance.md": """# CHILD AGENT TASK — G2: ARIA AI Governance & Security
## Batch: 2 | Depends on: M7 | Output: outputs/G2_ARIA_AI_Governance_Security.html
## Target roles: HR_ADMIN · HR_DIRECTOR · SUPER_ADMIN · IT Security
## ENTERPRISE-CRITICAL — highest attention to accuracy

### S1 Preconditions (7)
1 ARIA deployed (ANTHROPIC_API_KEY set)
2 Audit logging enabled for ARIA (every response logged)
3 PII masking configured (emirates_id, iban, passport_number)
4 DOMPurify XSS sanitization active on input
5 Rate limiting configured (graceful fallback on RateLimitError)
6 Model fallback responses configured (bilingual AriaResponse)
7 ARIA access restricted by role (HR_ADMIN+ only for /aria console)
Blocking: no API key = ARIA entirely disabled · no audit log = compliance violation

### S2 Dependency Chains
A: [User query] → [Input sanitized DOMPurify] → [Intent detected] → [Confidence ≥0.7] → [DB query grounded] → [PII masked] → [Response] → [Audit logged]
B: [Confidence <0.7] → [Uncertainty expressed] → [Escalation offered to HR human] → [Handoff logged with query context]
C: [Prompt injection attempt] → [Pattern detected] → [BLOCKED] → [Security alert logged] → [Super Admin notified]

### S3 Six Governance Pillars
Hallucination Prevention (grounding only) · Confidence Handling (threshold 0.7) · PII Masking (AES fields) · Prompt Injection Protection (DOMPurify) · Audit Trail (immutable every response) · Model Fallback (bilingual, no crash)
Common mistakes: asking ARIA to make HR decisions / ARIA appearing to access data it cannot see

### S4 Two Swimlanes
Flow A: Safe response flow (confidence ≥0.7, PII masked, logged)
Flow B: Blocked input flow (injection detected → block → alert → log)

### S5 ARIA Response Lifecycle State Machine
RECEIVED → SANITIZED → INTENT_DETECTED → CONFIDENCE_CHECKED
→ [HIGH] DB_QUERIED → PII_MASKED → RESPONSE_GENERATED → DELIVERED → AUDIT_LOGGED
→ [LOW] ESCALATION_OFFERED → HUMAN_HANDOFF → AUDIT_LOGGED
→ [INJECTION] BLOCKED → SECURITY_ALERT → AUDIT_LOGGED

### S6 Mockups
A: ARIA chat showing PII-masked response — emirates_id as ****-****-***-1234
B: ARIA audit log (/aria/audit — SUPER_ADMIN only) — query + response + confidence + user + timestamp
C: ARIA confidence warning UI — amber callout "I'm not fully certain. Please confirm with HR Admin."

### S7 PII Handling Rules Reference
Complete table: Field → Encryption → ARIA behaviour → Authorised viewers
emirates_id: AES-256-GCM · masked in all responses · SUPER_ADMIN + HR_DIRECTOR only
passport_number: AES-256-GCM · masked · same
iban: AES-256-GCM · never returned · PAYROLL_ADMIN only
salary: plaintext · returned to authorised roles only (not EMPLOYEE for others)
DSAR: employee downloads their own full data at /me/profile → Download My Data

### S8 Scenarios
A: ARIA gives wrong salary figure — how to identify, report, correct, prevent
B: Employee asks ARIA about another employee's data — access control response
C: API rate limit hit — fallback behaviour, recovery, no data loss
D: Manager asks ARIA to approve a leave request — ARIA correctly declines and redirects

### S9 Troubleshooting
1: ARIA not responding — API key / network / RateLimitError fallback check
2: ARIA inventing data not in system — grounding failure, escalate to Super Admin
3: PII appearing unmasked in ARIA responses — masking configuration check
4: ARIA audit log missing entries — logging pipeline / database write check

### S10 ARIA Meta-Queries (ARIA explaining its own governance)
Q1: What data can you access about employees → scoped DB access explanation
Q2: Can you show me Ahmed's salary → role-based access check response
Q3: Why did you say you don't know → confidence threshold explanation
Q4: Are my conversations with you logged → yes, audit trail explanation
Q5: Can you approve a leave request for me → ARIA cannot make HR decisions
Q6: What happens if you give wrong information → correction and reporting process
Q7: How do I report an incorrect ARIA response → /aria/feedback route
Q8: Can I ask you to ignore your rules → injection block demonstration

## QA Command
python3 qa_check.py outputs/G2_ARIA_AI_Governance_Security.html
""",

"G3_Reporting.md": """# CHILD AGENT TASK — G3: Reporting & Analytics
## Batch: 2 | Depends on: M1 M3 | Output: outputs/G3_Reporting_Analytics.html
## Target roles: HR_DIRECTOR · HR_ADMIN · PAYROLL_ADMIN · Executive

### S1 Preconditions (7)
1 Data populated: employees, payroll runs, leave records, timesheets
2 /reports route accessible (HR_ADMIN+)
3 Export permissions configured
4 BI integration credentials set (if applicable)
5 Date filters default to current financial year
6 Emiratisation targets set in system configuration
7 Department hierarchy complete for org analytics
Blocking: no payroll data = no payroll analytics · no leave data = no absence reports

### S2 Dependency Chains
A: [All modules running] → [Data accumulates] → [/reports dashboards] → [Real-time KPIs] → [Export to Excel/PDF]
B: [Payroll runs PAID] → [Payroll analytics update] → [Cost centre breakdown] → [GL reconciliation data]
C: [Workforce events] → [Attrition detected] → [Turnover rate calculated] → [Emiratisation % tracked] → [Executive dashboard updated]

### S3 Six Report Categories
Headcount & Org · Leave & Absence · Payroll & Cost · Attrition & Turnover · Emiratisation · Audit & Compliance
Each: available filters + export formats + who can access + refresh frequency

### S4 Two Swimlanes
Flow A: HR Admin generates headcount report — filters → generate → export
Flow B: Executive dashboard — auto-refresh KPIs → drill-down → PDF export

### S5 Report Export State Machine
REQUESTED → GENERATING → READY → DOWNLOADED → EXPIRED (after 24h)
GENERATING → FAILED (data timeout) → RETRY

### S6 Mockups
A: Executive dashboard — 6 KPI cards (headcount, vacancies, attrition, payroll cost, leave days, Emiratisation %)
B: Headcount report with department filter — table + bar chart + export buttons
C: Payroll cost analysis — entity breakdown + GL cost centre + monthly trend chart

### S7 BI Integration Guide
Export formats: Excel (.xlsx), PDF, CSV
Available integrations: Phase 1 = export only · Phase 2 = BI connector (Power BI / Tableau)
Scheduled reports: daily/weekly/monthly email delivery
Data retention: reports expire after 24h, regenerate on demand

### S8 Scenarios
A: Board wants headcount by entity for this quarter
B: Finance needs payroll cost breakdown by GL code
C: HR Director wants Emiratisation progress against target
D: Auditor requests all leave records for the past year

### S9 Troubleshooting
1: Report shows 0 records — date filter too narrow / no data for period
2: Export fails — large dataset timeout / retry with narrower filter
3: Payroll data missing from cost report — run not yet PAID status
4: Emiratisation % seems wrong — nationality_category not set on some employees

### S10 ARIA Queries
Q1: Total headcount by department → /reports headcount grouped by department_id
Q2: Attrition rate this year → terminated/total employees YTD
Q3: Payroll cost by entity this month → payroll_runs PAID current month
Q4: Emiratisation percentage → UAE national count / total headcount
Q5: Which departments have the most vacancies → vacancy_start_date IS NOT NULL by dept
Q6: Average sick days per employee this year → absence_requests sick type YTD
Q7: Show turnover trend last 12 months → monthly terminations/headcount
Q8: Who has not submitted timesheets this week → missing timesheet records

## QA Command
python3 qa_check.py outputs/G3_Reporting_Analytics.html
""",
}

for fname, content in TASKS_B2.items():
    path = os.path.join(BASE, "tasks", "batch2", fname)
    with open(path, "w") as f:
        f.write(content)
    print(f"✓ tasks/batch2/{fname}")

# ── BATCH 3 TASK FILES ────────────────────────────────────────────────────────
TASKS_B3 = {

"G4_Scenarios.md": """# CHILD AGENT TASK — G4: Operational Scenarios — Edge Cases
## Batch: 3 | Depends on: M1 M2 M3 M5 | Output: outputs/G4_Operational_Scenarios.html
## Target roles: HR_ADMIN · PAYROLL_ADMIN · MANAGER
## NOTE: This module is SCENARIO-DRIVEN not feature-driven. S3 has 12 scenarios not 6 type cards.

### S1 Preconditions
All base modules M1-M5 must be live. This module references real situations that arise only when the system is in production use.

### S2 Dependency Chains
A: [Payroll LOCKED] → [Any approval blocked] → [Finance step frozen] → [Wait for close] → [Actions resume]
B: [Employee submits resignation] → [Notice period starts] → [Leave/transfers/payroll all intersect] → [EOSB calculated] → [Final payslip] → [Termination]
C: [Backdated event discovered] → [BR-WF-010 or retroactive payroll] → [Dual approval] → [Audit correction] → [Downstream impact assessed]

### S3 Twelve Operational Scenarios (use sc-card for each, 2 columns)
1: Employee resigned during open payroll run — EOSB + final pay handling
2: Leave request overlaps notice period — what blocks + override options
3: WPS file rejected by bank after payroll LOCKED — re-generation process
4: Manager delegation expired while request still pending — SLA breach cascade
5: Employee transferred mid-payroll month — pro-rata GL split
6: Backdated hire discovered after payroll close — correction workflow
7: Probation extension during sick leave — two concurrent statuses
8: Acting assignment exceeded 6 months — UAE Law conversion to promotion
9: Cross-entity transfer EOSB carry-forward not documented — compliance risk
10: Payroll run shows wrong cost centre — position transfer not yet effective
11: Duplicate employee record discovered — merge or deactivate process
12: Public holiday added retroactively — impact on approved leave in that period

### S4 Two Swimlanes
Flow A: Employee resignation end-to-end (resignation → notice → EOSB → final pay → termination)
Flow B: Retroactive payroll correction (discover error → correction run → audit note → Finance sign-off)

### S5 Resignation & Termination State Machine
ACTIVE → NOTICE_PERIOD → LAST_WORKING_DAY → TERMINATED
ACTIVE → IMMEDIATE_TERMINATION (disciplinary)
NOTICE_PERIOD → NOTICE_WAIVED (mutual agreement)
Each state: what payroll/leave/access does

### S6 Mockups
A: EOSB calculation screen — showing hire_date, effective_date, scheme, amount breakdown
B: Correction run workflow — payroll run with "CORRECTION" badge, original + delta amounts
C: Resignation processing — notice period tracker with leave balance, pending transfers blocked

### S7 Compliance Risk Reference
UAE Labour Law (FDL 33/2021) scenarios:
- Immediate termination without cause: 30-day notice or payment in lieu
- EOSB must be paid within 14 days of termination
- Unlawful deductions: only approved deductions permitted
- Sick leave during notice: notice period pauses (Art. 44)

### S8 Scenarios (summary cards — link to S3 detailed scenarios)
A: Payroll-resignation intersection
B: Backdated correction process
C: Acting conversion to promotion
D: Cross-entity EOSB compliance failure

### S9 Troubleshooting
1: Payroll correction rejected — Finance refused, reasons and retry
2: EOSB amount disputed — recalculation with audit trail
3: Acting conversion blocked — promotion prerequisites not met
4: Retroactive leave adjustment — balance negative after correction

### S10 ARIA Queries
Q1: Ahmed resigned today — what steps do I need to follow
Q2: What is Ahmed's final EOSB amount
Q3: There's a payroll error from last month — how do I correct it
Q4: Ahmed's acting is now 6 months — what happens
Q5: The WPS file was rejected after payroll closed — next steps
Q6: Sara's leave overlaps her notice period — what are the options
Q7: We hired someone 45 days ago but forgot to enter them
Q8: A public holiday was added retroactively — impact on existing approvals

## QA Command
python3 qa_check.py outputs/G4_Operational_Scenarios.html
""",

"G5_Troubleshooting.md": """# CHILD AGENT TASK — G5: Production Troubleshooting
## Batch: 3 | Depends on: M1 M3 M5 | Output: outputs/G5_Production_Troubleshooting.html
## Target roles: HR_ADMIN · SUPER_ADMIN · IT Support
## NOTE: S9 has 8 troubleshooting cards (not 4) — this is the dedicated troubleshooting module

### S1 Preconditions
System is live. This module covers problems that occur in production. All base modules must be deployed.

### S2 Dependency Chains
A: [User reports issue] → [ARIA diagnoses] → [Route to correct fix] → [Resolution applied] → [Audit logged]
B: [System alert fires] → [Cron failure / SLA breach / API error] → [Admin notified] → [Investigation] → [Root cause] → [Fix]
C: [Data integrity issue] → [Audit log consulted] → [Old record recovered] → [Correction applied] → [Finance notified if payroll impact]

### S3 Six Problem Categories (cards)
Workflow/Approval Issues · Payroll Discrepancies · Org Chart/Data Issues · ARIA/AI Failures · Notification Failures · Permission/Access Issues
Each: common symptoms + severity rating + first-response steps

### S4 Two Swimlanes
Flow A: Standard issue triage (User reports → HR Admin diagnoses → ARIA assists → Fix applied → Verified)
Flow B: Escalation flow (HR Admin cannot resolve → Super Admin → IT Support → Engineering if needed)

### S5 Issue Severity State Machine
REPORTED → TRIAGED → IN_PROGRESS → RESOLVED → VERIFIED_CLOSED
TRIAGED → ESCALATED (P1/P2) → ENGINEERING_NOTIFIED
IN_PROGRESS → BLOCKED_ON_VENDOR → SLA_EXTENDED

### S6 Mockups
A: Issue triage dashboard — open issues by category, severity badges, age
B: ARIA diagnostic response — ARIA identifying root cause of stuck workflow
C: Audit log viewer — searching for specific record change with before/after values

### S7 Diagnostic Tools Reference
ARIA console (/aria): diagnose workflow status, check field values, identify blockers
Audit log (/audit or DB): immutable INSERT-only, every change with before/after values
Cron jobs (/api/cron/*): workflow-sla + probation + org-snapshot — check logs for failures
Notification log: SMTP outbox — PENDING/SENT/FAILED status per notification
Payroll run status: DRAFT/CALCULATED/LOCKED — determines what is/isn't possible

### S8 Scenarios
A: Complete diagnosis walkthrough — approval stuck 3 days
B: Payroll discrepancy — employee paid wrong amount
C: Sync failure — org chart not updating after transfer
D: Cascade failure — one cron job failure causing multiple downstream issues

### S9 Troubleshooting Knowledge Base (8 cards — extended for this module)
1: Approval stuck / no movement
2: Employee missing from system unexpectedly
3: Payroll run won't advance to next status
4: ARIA not responding or wrong answers
5: Notifications not being received
6: Org chart showing stale/wrong data
7: Permission denied errors for correct role
8: Audit log showing unexpected changes

### S10 ARIA Queries
Q1: Ahmed's approval has been stuck for 3 days — diagnose
Q2: Why did the payroll run fail to advance to APPROVED
Q3: Employee appeared then disappeared from org chart — what happened
Q4: ARIA gave a wrong answer about Sara's salary — how to investigate
Q5: Emails stopped being sent 2 hours ago — what to check
Q6: Transfer was approved but org chart not updated — why
Q7: User says they lost access to /approvals overnight — diagnose
Q8: Audit log shows a change I didn't make — how to trace it

## QA Command
python3 qa_check.py outputs/G5_Production_Troubleshooting.html
""",
}

for fname, content in TASKS_B3.items():
    path = os.path.join(BASE, "tasks", "batch3", fname)
    with open(path, "w") as f:
        f.write(content)
    print(f"✓ tasks/batch3/{fname}")

# ── BATCH 4 TASK FILES ────────────────────────────────────────────────────────
TASKS_B4 = {

"G6_Runbooks.md": """# CHILD AGENT TASK — G6: Administrator Runbooks
## Batch: 4 | Depends on: M3 M5 M8 G5 | Output: outputs/G6_Administrator_Runbooks.html
## Target roles: HR_ADMIN · SUPER_ADMIN · PAYROLL_ADMIN
## NOTE: This is an OPERATIONAL CHECKLIST module. S3 has operational runbooks not type cards.
## S8 has 6 runbooks not 4 scenarios.

### S1 Preconditions
All modules M1-M9 + G1-G5 live and certified. This module is the operational bible for daily running of AVANIIS HR.

### S2 Dependency Chains
A: [Daily cron jobs run] → [SLA timers checked] → [ARIA alerts fired] → [Admin reviews dashboard] → [Actions taken]
B: [Month-end process] → [Payroll closed] → [Reports generated] → [Audit review] → [Archive]
C: [System health check] → [DB backup verified] → [API health confirmed] → [User access audited] → [Compliance sign-off]

### S3 Six Operational Runbooks (replace type cards with runbook cards)
1: Daily Operations Checklist
2: Payroll Cutoff Checklist
3: Month-End HR Checklist
4: New Employee Onboarding Checklist
5: Audit Review Checklist
6: SLA Monitoring Checklist
Each runbook: numbered checklist items with routes, responsible role, time required, consequences if missed

### S4 Two Swimlanes
Flow A: Monthly payroll cutoff process (Payroll Admin · Finance · HR Admin · System)
Flow B: Annual audit preparation process (HR Admin · HR Director · Finance · Super Admin)

### S5 Operational Calendar State Machine
MONTH_START → ACTIVE_PERIOD → PAYROLL_CUTOFF → PAYROLL_CLOSE → MONTH_END_REVIEW → MONTH_ARCHIVED → MONTH_START
Each state: what actions are available / blocked / required

### S6 Mockups
A: Admin dashboard — system health indicators, cron job status, pending action counts
B: Payroll cutoff checklist — interactive checklist with completion tracking
C: Audit review dashboard — compliance score, open items, sign-off status

### S7 System Health Reference
Cron jobs to monitor: /api/cron/workflow-sla · /api/cron/probation · /api/cron/org-snapshot
DB backup: verify daily (Neon automated, confirm in Neon dashboard)
API health: /api/health endpoint
Notification queue: check notification_log for FAILED status
Error monitoring: Vercel function logs at fra1 region

### S8 Six Runbooks (replace scenarios with detailed runbooks)
Runbook 1: Daily operations — 8 steps every morning
Runbook 2: Payroll cutoff — 12 steps, day before and day of cutoff
Runbook 3: Month-end — 10 steps after payroll PAID
Runbook 4: New employee onboarding — 7 steps from offer to ACTIVE
Runbook 5: Audit preparation — 9 steps for quarterly/annual audit
Runbook 6: Incident response — 6 steps when something breaks in production

### S9 Troubleshooting
1: Cron job failed — identify which job, check logs, manual trigger
2: DB backup not confirming — Neon dashboard check, manual verify
3: API response slow — Vercel function cold start / DB connection pool
4: User reports access lost overnight — Entra ID token expiry / role change

### S10 ARIA Queries
Q1: What cron jobs ran today and did any fail
Q2: Is the system healthy — all services up
Q3: What is outstanding on the month-end checklist
Q4: When was the last successful DB backup
Q5: Any compliance items overdue this week
Q6: Payroll cutoff is tomorrow — what do I need to check
Q7: How many open approvals are there across all workflows
Q8: Show me the audit sign-off status for this quarter

## QA Command
python3 qa_check.py outputs/G6_Administrator_Runbooks.html
""",
}

for fname, content in TASKS_B4.items():
    path = os.path.join(BASE, "tasks", "batch4", fname)
    with open(path, "w") as f:
        f.write(content)
    print(f"✓ tasks/batch4/{fname}")

# ── README ────────────────────────────────────────────────────────────────────
README = f"""# AVANIIS HR Training System — Agent Workspace
Generated by: avaniis_agent_setup.py

## Structure
avaniis_training/
├── AGENT_CONTEXT.md      ← Read first in EVERY session
├── SUPERVISOR.md         ← Supervisor review protocol
├── qa_check.py           ← Universal QA validator (run after every build)
├── G1_Employee_Transfers_Promotions_Final.html  ← GOLD STANDARD (copy here)
├── tasks/
│   ├── batch1/   M1 M2 M3 M5 M7 M8  (no dependencies — run in parallel)
│   ├── batch2/   M4 M6 M9 G2 G3     (after batch1)
│   ├── batch3/   G4 G5               (after batch2)
│   └── batch4/   G6                  (after batch3)
├── outputs/        ← All generated HTML files go here
└── logs/           ← QA run logs

## CRITICAL FIRST STEP
Copy the gold standard file into this directory:
cp /path/to/G1_Employee_Transfers_Promotions_Final.html {BASE}/G1_Employee_Transfers_Promotions_Final.html

## How to Run a Session (Claude Code)
1. Open Claude Code
2. Paste:
   Read AGENT_CONTEXT.md then read tasks/batch1/M1_Onboarding.md
   Build the document. Do not stop until qa_check.py returns ALL PASS.
3. Claude builds, tests, fixes, and delivers the certified HTML.

## Parallel Sessions (Batch 1 — 6 simultaneously)
Terminal 1:  Read AGENT_CONTEXT.md then tasks/batch1/M1_Onboarding.md. Build.
Terminal 2:  Read AGENT_CONTEXT.md then tasks/batch1/M2_Leave.md. Build.
Terminal 3:  Read AGENT_CONTEXT.md then tasks/batch1/M3_Payroll.md. Build.
Terminal 4:  Read AGENT_CONTEXT.md then tasks/batch1/M5_Approvals.md. Build.
Terminal 5:  Read AGENT_CONTEXT.md then tasks/batch1/M7_OrgChart.md. Build.
Terminal 6:  Read AGENT_CONTEXT.md then tasks/batch1/M8_SysAdmin.md. Build.

## QA Check
python3 qa_check.py outputs/M1_Employee_Onboarding_CoreHR.html

## Document Registry
| ID | Name | Batch | Depends On | Output File |
|----|------|-------|-----------|-------------|
| G1 | Transfers & Promotions | DONE | — | G1_Employee_Transfers_Promotions_Final.html |
| M1 | Employee Onboarding & Core HR | 1 | — | M1_Employee_Onboarding_CoreHR.html |
| M2 | Leave & Absence Management | 1 | — | M2_Leave_Absence_Management.html |
| M3 | Payroll Processing | 1 | — | M3_Payroll_Processing.html |
| M5 | Approvals & Workflow Engine | 1 | — | M5_Approvals_Workflow_Engine.html |
| M7 | Org Chart & ARIA AI | 1 | — | M7_OrgChart_ARIA.html |
| M8 | System Admin & Master Data | 1 | — | M8_System_Administration_MasterData.html |
| M4 | Employee Self-Service (ESS) | 2 | M1 M2 | M4_Employee_Self_Service.html |
| M6 | Employee Letters & Docs | 2 | M1 | M6_Employee_Letters_Documents.html |
| M9 | Manager Self-Service (MSS) | 2 | M5 M7 | M9_Manager_Self_Service.html |
| G2 | ARIA AI Governance & Security | 2 | M7 | G2_ARIA_AI_Governance_Security.html |
| G3 | Reporting & Analytics | 2 | M1 M3 | G3_Reporting_Analytics.html |
| G4 | Operational Scenarios | 3 | M1 M2 M3 M5 | G4_Operational_Scenarios.html |
| G5 | Production Troubleshooting | 3 | M1 M3 M5 | G5_Production_Troubleshooting.html |
| G6 | Administrator Runbooks | 4 | M3 M5 M8 G5 | G6_Administrator_Runbooks.html |
"""

with open(os.path.join(BASE, "README.md"), "w") as f:
    f.write(README)
print("✓ README.md")

# Summary
total_tasks = sum(len(t) for t in [TASKS_B1, TASKS_B2, TASKS_B3, TASKS_B4])
print(f"\n{'='*50}")
print(f"  Setup complete.")
print(f"  Location: {BASE}")
print(f"  Task files: {total_tasks} (+ G1 already done = 15 total)")
print(f"  Batches: 4 (6 + 5 + 2 + 1 = 14 documents to build)")
print(f"\n  NEXT STEP:")
print(f"  cp G1_Employee_Transfers_Promotions_Final.html {BASE}/")
print(f"  cd {BASE}")
print(f"  Open Claude Code and run Batch 1 (6 parallel sessions)")
print(f"{'='*50}")
