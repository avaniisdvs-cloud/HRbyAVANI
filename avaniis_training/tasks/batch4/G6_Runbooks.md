# CHILD AGENT TASK — G6: Administrator Runbooks
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
