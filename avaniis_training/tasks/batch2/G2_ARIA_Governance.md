# CHILD AGENT TASK — G2: ARIA AI Governance & Security
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
