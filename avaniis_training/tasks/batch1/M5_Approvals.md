# CHILD AGENT TASK — M5: Approvals & Workflow Engine
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
