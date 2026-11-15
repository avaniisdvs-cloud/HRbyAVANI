# CHILD AGENT TASK — M2: Leave & Absence Management
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
