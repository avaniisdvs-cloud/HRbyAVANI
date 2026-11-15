# CHILD AGENT TASK — M3: Payroll Processing
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
