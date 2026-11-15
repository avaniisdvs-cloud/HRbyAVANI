# CHILD AGENT TASK — M4: Employee Self-Service (ESS)
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
