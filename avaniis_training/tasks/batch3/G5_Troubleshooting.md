# CHILD AGENT TASK — G5: Production Troubleshooting
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
