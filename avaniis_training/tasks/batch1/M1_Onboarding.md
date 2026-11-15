# CHILD AGENT TASK — M1: Employee Onboarding & Core HR
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
