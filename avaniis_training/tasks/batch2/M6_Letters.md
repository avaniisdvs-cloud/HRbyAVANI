# CHILD AGENT TASK — M6: Employee Letters & Document Generation
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
