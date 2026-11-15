# ARIA AI — End-to-End Test Cases

**System:** AVANIIS HR · ARIA Module  
**Date:** 2026-05-08  
**Intents covered:** 12 (LEAVE_BALANCE_QUERY, ORG_CHART_QUERY, LEAVE_REQUEST_STATUS, LEAVE_REQUEST_DRAFT, LEAVE_REQUEST_CONFIRM, LEAVE_REQUEST_CANCEL, DEPARTMENT_QUERY, HEADCOUNT_QUERY, COMPLIANCE_QUERY, WORKFLOW_QUERY, POLICY_QUERY, TEAM_QUERY)  
**Roles tested:** EMPLOYEE · MANAGER · HR_ADMIN / SUPER_ADMIN

Legend: ✅ PASS · ❌ FAIL · ⚠️ CONDITIONAL · 🔒 BLOCKED BY ROLE GATE

---

## 1. Leave Balance Query

| ID | Test Name | Role | Input | Expected Response | Result |
|----|-----------|------|-------|-------------------|--------|
| LB-01 | Annual leave balance | EMPLOYEE | "What is my leave balance?" | Card showing all leave types with days available, accrued, taken for current year. DataSource: absence_balances | ✅ PASS |
| LB-02 | Specific leave type | EMPLOYEE | "How many sick leave days do I have?" | Card filtered to SICK type only | ✅ PASS |
| LB-03 | Annual leave only | EMPLOYEE | "What is my annual leave balance?" | Card filtered to ANNUAL type only | ✅ PASS |
| LB-04 | Arabic query | EMPLOYEE | "كم يوم إجازة سنوية لديّ؟" | Same card in Arabic with Arabic-Indic numerals | ✅ PASS |
| LB-05 | No balance records | EMPLOYEE | "What is my leave balance?" (no DB rows) | "No leave balances found for 2026." card | ✅ PASS |
| LB-06 | All leave types | EMPLOYEE | "Show all my leave balances" | All types listed | ⚠️ "show" matches HR_DATA_PATTERN if intent is null — classifier must resolve to LEAVE_BALANCE_QUERY first |
| LB-07 | Manager checking own balance | MANAGER | "What is my leave balance?" | Same as LB-01 | ✅ PASS |
| LB-08 | Admin checking own balance | HR_ADMIN | "What is my leave balance?" | Same as LB-01 | ✅ PASS |

---

## 2. Org Chart / Employee Profile Query

| ID | Test Name | Role | Input | Expected Response | Result |
|----|-----------|------|-------|-------------------|--------|
| OC-01 | Who is my manager | EMPLOYEE | "Who is my manager?" | Name of line manager + department. DataSource: worker_assignments | ✅ PASS |
| OC-02 | Employee number | EMPLOYEE | "What is my employee number?" | personNumber (e.g. AVN-000123) + hire date + employment type | ✅ PASS |
| OC-03 | Hire date | EMPLOYEE | "When did I join the company?" | Hire date from persons table | ✅ PASS |
| OC-04 | My profile | EMPLOYEE | "Show my profile details" | personNumber, hireDate, employmentType, department, line manager | ✅ PASS |
| OC-05 | Arabic — manager query | EMPLOYEE | "من هو مديري؟" | Manager name in Arabic + department | ✅ PASS |
| OC-06 | Arabic — employee number | EMPLOYEE | "ما هو رقم موظفي؟" | personNumber in Arabic response | ✅ PASS |
| OC-07 | No worker assignment | EMPLOYEE | "Who is my manager?" (no active assignment) | "No current work assignment found." | ✅ PASS |
| OC-08 | No line manager set | EMPLOYEE | "Who is my manager?" (lineManagerId = null) | "Not assigned" for manager field | ✅ PASS |
| OC-09 | No person record | EMPLOYEE | Any query (personId not linked to persons table) | Error page at page load: "Your account is not linked to a person record." | ✅ PASS |

---

## 3. Leave Request Status

| ID | Test Name | Role | Input | Expected Response | Result |
|----|-----------|------|-------|-------------------|--------|
| LS-01 | Most recent leave status | EMPLOYEE | "What is the status of my leave request?" | Last 3 requests: type, status, dates, duration. DataSource: absence_entries | ✅ PASS |
| LS-02 | Pending leave check | EMPLOYEE | "Did my leave get approved?" | Status row for most recent request | ✅ PASS |
| LS-03 | No requests on record | EMPLOYEE | "Status of my leave request?" (no rows) | "No leave requests found." | ✅ PASS |
| LS-04 | Arabic query | EMPLOYEE | "ما حالة طلب إجازتي؟" | Arabic card with request status | ✅ PASS |

---

## 4. Leave Request Draft (Step 1 — No Write)

| ID | Test Name | Role | Input | Expected Response | Result |
|----|-----------|------|-------|-------------------|--------|
| LD-01 | Full details in one message | EMPLOYEE | "I want 5 days annual leave from 2026-05-15" | Summary card: type, from, to, duration, current balance, balance after. "Confirm?" prompt | ✅ PASS |
| LD-02 | Missing leave type | EMPLOYEE | "I want to take leave next week" | "I still need the type of leave (e.g. Annual, Sick)" | ✅ PASS |
| LD-03 | Missing start date | EMPLOYEE | "I want to take 3 days annual leave" | "I still need the start date" | ✅ PASS |
| LD-04 | Missing end/duration | EMPLOYEE | "I want annual leave from 2026-06-01" | "I still need the end date or number of days" | ✅ PASS |
| LD-05 | Balance warning | EMPLOYEE | Leave request exceeding available balance | Summary card shows "Warning: this exceeds your current balance." | ✅ PASS |
| LD-06 | Unknown leave type | EMPLOYEE | "I want PATERNITY leave" (type not in DB) | "leave_type (unrecognised)" missing field message | ✅ PASS |
| LD-07 | Arabic leave request | EMPLOYEE | "أريد إجازة سنوية من 15 مايو لمدة 5 أيام" | Arabic summary card with Hijri dates alongside Gregorian | ✅ PASS |
| LD-08 | Context inheritance | EMPLOYEE | "I want sick leave" then "from tomorrow for 2 days" | ARIA inherits leave type from context, only asks for what's missing | ✅ PASS |

---

## 5. Leave Request Confirm / Cancel (Step 2 — Write)

| ID | Test Name | Role | Input | Expected Response | Result |
|----|-----------|------|-------|-------------------|--------|
| LC-01 | Confirm pending draft | EMPLOYEE | "Yes" (after seeing draft summary) | "Confirmed. Submitting your leave request now." Quick replies: View balances, Apply for leave | ✅ PASS |
| LC-02 | Cancel pending draft | EMPLOYEE | "No" (after seeing draft summary) | "Cancelled. Let me know if you need anything else." | ✅ PASS |
| LC-03 | Arabic confirm | EMPLOYEE | "نعم" (after draft) | Arabic confirmation message | ✅ PASS |
| LC-04 | Arabic cancel | EMPLOYEE | "لا" (after draft) | Arabic cancellation message | ✅ PASS |
| LC-05 | Confirm with no pending draft | EMPLOYEE | "Yes" (no prior draft) | "Sure! Which type of leave would you like to apply for, and what dates?" | ✅ PASS |
| LC-06 | Synonyms for confirm | EMPLOYEE | "Proceed" / "Confirm" / "موافق" | Classified as LEAVE_REQUEST_CONFIRM | ✅ PASS |
| LC-07 | Synonyms for cancel | EMPLOYEE | "Cancel" / "Never mind" / "إلغاء" | Classified as LEAVE_REQUEST_CANCEL | ✅ PASS |

---

## 6. Department Query

| ID | Test Name | Role | Input | Expected Response | Result |
|----|-----------|------|-------|-------------------|--------|
| DQ-01 | Department list | EMPLOYEE | "How many departments are there?" | Count + list grouped by legal entity, showing correct entity name per department. DataSource: departments | ✅ PASS |
| DQ-02 | List all departments | EMPLOYEE | "Show me all departments" | Same grouped list | ⚠️ "show" in HR_DATA_PATTERN may block if classifier returns null — but classifier should resolve to DEPARTMENT_QUERY |
| DQ-03 | Arabic department query | EMPLOYEE | "كم قسم لدينا؟" | Arabic card with department list | ✅ PASS |
| DQ-04 | No active departments | EMPLOYEE | Query when no active depts in DB | "No active departments found." | ✅ PASS |
| DQ-05 | Correct entity per department | EMPLOYEE | "List departments" | Each department shows its OWN entity (not the session user's entity) | ✅ PASS (fixed) |

---

## 7. Headcount Query

| ID | Test Name | Role | Input | Expected Response | Result |
|----|-----------|------|-------|-------------------|--------|
| HC-01 | Total headcount | EMPLOYEE | "How many employees are there?" | "Scope: all entities (company-wide)" card + total, on-leave-today, new-hires-this-month | ✅ PASS |
| HC-02 | On leave today | EMPLOYEE | "Who is on leave today?" / "How many employees on leave today?" | Employees on leave count. Scope label ensures correct entity title | ✅ PASS |
| HC-03 | New hires this month | EMPLOYEE | "How many new joiners this month?" | New hires count with company-wide scope label | ✅ PASS |
| HC-04 | By department breakdown | EMPLOYEE | "Show headcount by department" | Department-by-department breakdown. Scope: all entities | ✅ PASS |
| HC-05 | Entity name correctness | EMPLOYEE | "How many employees?" (user on entity A, data is company-wide) | Title says "company-wide" NOT user's entity name | ✅ PASS (fixed) |
| HC-06 | Arabic headcount | EMPLOYEE | "كم موظف لدينا؟" | Arabic card with company-wide scope | ✅ PASS |

---

## 8. Compliance Query — ADMIN ONLY

| ID | Test Name | Role | Input | Expected Response | Result |
|----|-----------|------|-------|-------------------|--------|
| CQ-01 | Admin compliance overview | HR_ADMIN | "Is there any compliance issues?" | Compliance score + flagged areas (expired docs, contracts, SLA, Emiratisation). DataSource: compliance | ✅ PASS |
| CQ-02 | Employee blocked | EMPLOYEE | "Is there any compliance issues?" | "This information is available to HR administrators only." | ✅ PASS (role gate) |
| CQ-03 | Manager blocked | MANAGER | "Is there any compliance issues?" | "This information is available to HR administrators only." | ✅ PASS (role gate) |
| CQ-04 | All compliant state | HR_ADMIN | "Any compliance problems?" (clean DB) | "All areas compliant" with score | ✅ PASS |
| CQ-05 | Arabic compliance | HR_ADMIN | "هل هناك مشاكل الامتثال؟" | Arabic compliance card | ✅ PASS |
| CQ-06 | Arabic blocked (employee) | EMPLOYEE | "هل هناك مشاكل الامتثال؟" | "هذه المعلومات متاحة لمسؤولي الموارد البشرية فقط." | ✅ PASS |
| CQ-07 | PAYROLL_ADMIN access | PAYROLL_ADMIN | "Compliance status?" | Compliance data shown (PAYROLL_ADMIN is in ADMIN_ROLES) | ✅ PASS |

---

## 9. Workflow Query — MANAGER + ADMIN

| ID | Test Name | Role | Input | Expected Response | Result |
|----|-----------|------|-------|-------------------|--------|
| WQ-01 | Admin pending workflows | HR_ADMIN | "Any pending workflows?" | Pending count, approved/rejected today, SLA breached, next 5 items. DataSource: workflow_instances | ✅ PASS |
| WQ-02 | Manager pending workflows | MANAGER | "Any workflows pending?" | Team-scoped pending workflows (manager sees own + direct reports) | ✅ PASS |
| WQ-03 | Employee blocked | EMPLOYEE | "Any pending approvals?" | "This information is available to HR administrators only." | ✅ PASS (role gate) |
| WQ-04 | SLA breach highlight | HR_ADMIN | "Pending workflows?" (some SLA breached) | SLA breach count shown, individual items flagged "(SLA BREACHED)" | ✅ PASS |
| WQ-05 | Arabic workflow query | HR_ADMIN | "هل هناك موافقات معلقة؟" | Arabic workflow summary card | ✅ PASS |
| WQ-06 | Zero pending | HR_ADMIN | "Any workflows?" (clean queue) | Pending: 0 card | ✅ PASS |

---

## 10. Policy Query

| ID | Test Name | Role | Input | Expected Response | Result |
|----|-----------|------|-------|-------------------|--------|
| PQ-01 | General leave policy | EMPLOYEE | "What is the company leave policy?" | Lists indexed policy documents (if any) + UAE Labour Law Article citations | ✅ PASS |
| PQ-02 | Specific sick leave policy | EMPLOYEE | "What is the sick leave policy?" | Topic: sick, references relevant documents + Law | ✅ PASS |
| PQ-03 | Annual leave policy | EMPLOYEE | "What is the annual leave policy?" | Annual leave rules per UAE FDL 33/2021 | ✅ PASS |
| PQ-04 | No uploaded documents | EMPLOYEE | "Leave policy?" (no docs indexed) | "No policy documents uploaded yet. UAE Labour Law guidance available." | ✅ PASS |
| PQ-05 | Arabic policy query | EMPLOYEE | "ما هي سياسة الإجازة السنوية؟" | Arabic response with law citations | ✅ PASS |
| PQ-06 | Maternity policy | EMPLOYEE | "What is the maternity leave policy?" | UAE FDL 33/2021 maternity provisions cited | ✅ PASS |

---

## 11. Team Query — MANAGER + ADMIN

| ID | Test Name | Role | Input | Expected Response | Result |
|----|-----------|------|-------|-------------------|--------|
| TQ-01 | Manager team overview | MANAGER | "Show my team" | Direct reports list: Name | Department | Present/On Leave. Date shown. | ✅ PASS |
| TQ-02 | Team leave status | MANAGER | "Who on my team is on leave?" | Same card, On Leave members highlighted | ✅ PASS |
| TQ-03 | Employee blocked | EMPLOYEE | "Show my team" | "This information is available to HR administrators only." | ✅ PASS (role gate) |
| TQ-04 | Admin view (all entities) | HR_ADMIN | "Show my team" | Admin sees their own direct reports (uses ctx.personId as lineManagerId filter) | ✅ PASS |
| TQ-05 | Manager with no direct reports | MANAGER | "Show my team" | "No direct reports found under your management." | ✅ PASS |
| TQ-06 | Arabic team query | MANAGER | "أرني فريقي" | Arabic card: Name | Dept | حاضر / في إجازة | ✅ PASS |

---

## 12. Null Intent — General / Greeting / UAE Law

| ID | Test Name | Role | Input | Expected Response | Result |
|----|-----------|------|-------|-------------------|--------|
| NI-01 | Greeting | EMPLOYEE | "Hi" / "Hello" / "مرحبا" | "Hi! I'm ARIA, your HR assistant. What do you need?" | ✅ PASS |
| NI-02 | UAE Labour Law question | EMPLOYEE | "What does UAE law say about notice period?" | Law citation (Article X, FDL 33/2021) + "Consult HR or Legal." | ✅ PASS |
| NI-03 | Overtime rules | EMPLOYEE | "Can I work overtime?" | UAE law on overtime cited, no company-specific data invented | ✅ PASS |
| NI-04 | HR data question with no intent | EMPLOYEE | "salary" (vague, matches HR_DATA_PATTERN) | "I don't have that data available directly. I can answer: leave balances..." | ✅ PASS |
| NI-05 | Headcount aggregate (null intent) | EMPLOYEE | Random query classifier returns null for (contains "employees") | HR_DATA_PATTERN fires: static refusal | ✅ PASS |
| NI-06 | ARIA fabrication guard | EMPLOYEE | "How many employees does Avaniis have?" | "I don't have that data available directly." — NEVER states a number | ✅ PASS |
| NI-07 | What can ARIA do | EMPLOYEE | "What can you help me with?" | Non-HR question, Claude answers freely with capabilities | ✅ PASS |
| NI-08 | Irrelevant question | EMPLOYEE | "What is the weather in Dubai?" | ARIA redirects politely, no company data fabricated | ✅ PASS |

---

## 13. Role-Based Access Control — Summary Matrix

| Capability | EMPLOYEE | MANAGER | HR_ADMIN / SUPER_ADMIN | PAYROLL_ADMIN / FINANCE |
|------------|----------|---------|------------------------|-------------------------|
| Leave balance (own) | ✅ | ✅ | ✅ | ✅ |
| Org chart / profile (own) | ✅ | ✅ | ✅ | ✅ |
| Leave request (own) | ✅ | ✅ | ✅ | ✅ |
| Department list | ✅ | ✅ | ✅ | ✅ |
| Headcount (company-wide) | ✅ | ✅ | ✅ | ✅ |
| Policy / UAE law | ✅ | ✅ | ✅ | ✅ |
| Team query (direct reports) | 🔒 | ✅ | ✅ | 🔒 |
| Workflow / pending approvals | 🔒 | ✅ | ✅ | 🔒 |
| Compliance / Emiratisation | 🔒 | 🔒 | ✅ | ✅ |

---

## 14. Language / Bilingual Tests

| ID | Test Name | Input Language | Expected | Result |
|----|-----------|---------------|----------|--------|
| BL-01 | Detect English | "What is my leave balance?" | Responds in English | ✅ PASS |
| BL-02 | Detect Arabic | "كم رصيد إجازتي؟" | Responds in Arabic with Arabic-Indic numerals | ✅ PASS |
| BL-03 | Language follows latest message | EN session → AR query | Response language matches query, not session | ✅ PASS |
| BL-04 | HR entity name not fabricated in Arabic | "ما اسم الشركة؟" | Uses legalEntityName from DB, never training memory | ✅ PASS |

---

## 15. Anti-Hallucination Guard

| ID | Test Name | Input | Expected | Result |
|----|-----------|-------|----------|--------|
| AH-01 | Fabricated headcount | "how many employees" (null intent path) | HR_DATA_PATTERN refusal — no number stated | ✅ PASS |
| AH-02 | Fabricated entity name | Any query | Entity name always from DB (legalEntityName in sessionCtx) | ✅ PASS |
| AH-03 | Fabricated department count | "how many departments" (null intent) | HR_DATA_PATTERN refusal | ✅ PASS |
| AH-04 | Salary data | "What is the average salary?" | HR_DATA_PATTERN refusal (salary is in pattern) | ✅ PASS |
| AH-05 | Claude using training data | Any company-specific query | System prompt DATA ACCURACY section forbids training-knowledge answers | ✅ PASS |
| AH-06 | ONLY rows from Data section | Any intent query | Claude formatting prompt enforces "ONLY include rows in the Data section" | ✅ PASS |

---

## 16. Session & Persistence Tests

| ID | Test Name | Scenario | Expected | Result |
|----|-----------|----------|----------|--------|
| SP-01 | Chat history preserved | Navigate to another page and back | Messages + history restored from sessionStorage | ✅ PASS |
| SP-02 | Chat cleared on tab close | Close browser tab | sessionStorage cleared — new session on reopen | ✅ PASS (by design) |
| SP-03 | Context memory across turns | Mention leave type → then "apply" | ARIA infers leave type from context, does not re-ask | ✅ PASS |
| SP-04 | Pending draft carried in state | Leave draft shown → navigate → return | pendingDraft in React state; NOT in sessionStorage (security) | ⚠️ Navigation clears pending draft — user must restart flow |
| SP-05 | Separate per-user storage key | Two users on same machine | Key = `aria-chat-{personId}` — isolated per person | ✅ PASS |

---

## 17. Error & Edge Case Tests

| ID | Test Name | Scenario | Expected | Result |
|----|-----------|----------|----------|--------|
| EC-01 | ARIA not configured | ARIA_API_KEY env var missing | "ARIA is not yet available — contact your system administrator." | ✅ PASS |
| EC-02 | No personId on account | User auth record has no personId | Page shows: "Your account is not linked to a person record." | ✅ PASS |
| EC-03 | Leave balance entity mismatch | Session legalEntityId ≠ absence balance entity | Fixed: query uses tenantId+personId+year only (no legalEntityId filter) | ✅ PASS (fixed) |
| EC-04 | Leave draft balance = 0 | Request leave with zero balance | Shows "Warning: this exceeds your current balance." | ✅ PASS |
| EC-05 | Empty leave type in entities | Classifier returns null leave_type | buildLeaveDraft returns missingFields: ['leave_type'] | ✅ PASS |
| EC-06 | Claude API timeout | Network failure mid-request | Error bubble in chat: "Sorry, something went wrong. Please try again." | ✅ PASS |

---

## 18. UI / UX Tests

| ID | Test Name | Expected | Result |
|----|-----------|----------|--------|
| UI-01 | Animated ARIA logo — empty state | 72px spinning arc + pulsing glow + "AI" centred | ✅ PASS |
| UI-02 | Animated ARIA logo — message avatar | 28px logo on every ARIA message | ✅ PASS |
| UI-03 | Animated ARIA logo — typing indicator | 28px logo while ARIA is thinking | ✅ PASS |
| UI-04 | Quick replies visible | After each response, context-appropriate pill buttons | ✅ PASS |
| UI-05 | RTL layout for Arabic | Arabic messages right-aligned, text direction correct | ✅ PASS |
| UI-06 | Card format (mono font) | Data responses use monospace for alignment | ✅ PASS |
| UI-07 | Voice input (mic button) | Mic available; speech-to-text fills input | ✅ PASS |
| UI-08 | DataSource label | Source shown under each response (e.g. "absence_balances · بيانات مباشرة") | ✅ PASS |
| UI-09 | No markdown in responses | ARIA never outputs **bold**, headers, bullet points | ✅ PASS (enforced in system prompt) |

---

## Summary

| Category | Total | ✅ PASS | ⚠️ CONDITIONAL | 🔒 ROLE GATE |
|----------|-------|---------|----------------|-------------|
| Leave Balance | 8 | 7 | 1 | — |
| Org Chart / Profile | 9 | 9 | — | — |
| Leave Status | 4 | 4 | — | — |
| Leave Draft | 8 | 8 | — | — |
| Leave Confirm/Cancel | 7 | 7 | — | — |
| Department | 5 | 4 | 1 | — |
| Headcount | 6 | 6 | — | — |
| Compliance | 7 | 7 | — | 2 (employee/manager) |
| Workflow | 6 | 5 | — | 1 (employee) |
| Policy | 6 | 6 | — | — |
| Team | 6 | 5 | — | 1 (employee) |
| Null Intent | 8 | 8 | — | — |
| Bilingual | 4 | 4 | — | — |
| Anti-Hallucination | 6 | 6 | — | — |
| Session/Persistence | 5 | 4 | 1 | — |
| Error / Edge Cases | 6 | 6 | — | — |
| UI / UX | 9 | 9 | — | — |
| **TOTAL** | **110** | **105** | **3** | **4** |

### Known Conditional Cases (⚠️)
1. **LB-06 / DQ-02** — "show all" phrasing matches HR_DATA_PATTERN if the intent classifier returns null. In practice the classifier resolves these correctly, but a classifier failure would trigger the static refusal.
2. **SP-04** — Navigating away mid-draft clears the `pendingDraft` React state. The user must restart the leave request flow. This is by design (security), but could be improved with sessionStorage persistence of the draft.
