# CHILD AGENT TASK — M9: Manager Self-Service (MSS)
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
