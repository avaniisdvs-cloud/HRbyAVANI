# AVANIIS HR — W0–W3 Business UAT Handover Package

**Environment (UAT):** http://localhost:3001
**Release:** W0–W3 (build `293aa95`) · **Date prepared:** 2026-06-02
**Audience:** HR, Payroll, Operations, and Management business reviewers

> **How to use this document:** Sign in with the test accounts in Section 3, work through the business scenarios in Sections 4–5, and tick **Pass** or **Fail** for each. Notes in Section 6 explain a few expected limitations of the UAT environment. Record your decision in Section 7. Section 8 lists what must pass for the release to be accepted.

---

## 1. Executive Summary

**What was delivered (in plain terms):** a set of security, privacy, and correctness improvements across the HR system — making sure each person sees only their own information, that the AI assistant cannot be tricked, that payroll's bank-file generation works and protects bank details, and that leave balances are always accurate.

**Business benefits**
- **Stronger data privacy** — employees can only access their own records; managers only their team; HR only their company. Sensitive data (passport/visa/ID expiry, salaries, bank details) is protected from accidental or unauthorised access.
- **Trustworthy AI assistant (ARIA)** — ARIA always answers about the right person and cannot be manipulated into revealing colleagues' data.
- **Working, compliant payroll** — the UAE WPS salary file can now be produced, with bank account numbers (IBAN) protected; each company's payroll is kept separate and protected from duplicate payment.
- **Accurate leave** — requesting leave correctly reserves balance, rejection returns the days, approval deducts them, and leave cannot be booked for employees who have left.
- **Controlled admin tooling** — the technical data console is restricted to system administrators only.

**Modules affected**
- Employee Self-Service (ESS): Leave, Letters, Insurance, Documents, Profile
- ARIA (AI assistant + ARIA OS console)
- Payroll & WPS (Wage Protection System)
- Insurance (medical enrolment)
- Approvals / Workflow
- DataOps (admin data console)

---

## 2. UAT Scope (what to validate)

| Area | What changed (business view) | What to confirm |
|---|---|---|
| **Security & privacy** | Each user sees only data they are entitled to | An employee cannot view/act on another employee's data; a manager only their team; HR only their company |
| **ARIA** | AI answers about the correct person only | Own balance/status returns correctly; ARIA refuses to show another employee's leave; admin AI panels are HR-only |
| **Payroll / WPS** | Salary bank-file works; bank details protected; runs isolated | A WPS file can be generated from real bank data; duplicate payroll for the same month is blocked; one company cannot see another's payroll |
| **Leave** | Balances always accurate | Submitting reserves days; rejection returns them; approval deducts them; can't book leave for departed staff; balance screen totals are correct |
| **Insurance** | Enrolment access controlled; ESS is view-only | Employees view their own cover only; HR enrols within their company |
| **DataOps controls** | Technical console restricted | Only a System Administrator can open it; HR/Manager/Employee are blocked |

---

## 3. Test Accounts (UAT)

| Role | Email | Password | Lands on |
|---|---|---|---|
| **Employee** | `employee@avaniis.dev` | `demo` | My workspace (/me) |
| **Manager** | `manager@avaniis.dev` | `demo` | Dashboard |
| **HR Admin** | `hr.admin@avaniis.dev` | `demo` | Dashboard |

> These accounts are **for UAT only** (see Section 6). Sign out fully between roles to avoid confusion.

---

## 4 & 5. Business Validation Checklist with Expected Results

Tick **Pass** if the outcome matches; otherwise tick **Fail** and add a note.

### 👤 EMPLOYEE (`employee@avaniis.dev`)

| # | Scenario | Steps | Expected outcome | Pass | Fail |
|---|---|---|---|:--:|:--:|
| E1 | ESS navigation | Sign in → open each left-menu item (Home, My Profile, Payslips, Timesheet, Documents, Leave, Insurance, Letters, Org Chart) | Every page opens without error; you only see **your own** information | ☐ | ☐ |
| E2 | Leave request | Leave → Apply for Leave → pick a type and dates within your balance → submit | Request is created and shows **Pending**; your **pending balance increases** by the days requested | ☐ | ☐ |
| E3 | Leave balances | Open **My Leave** | Balances display; **Available is never more than Total**; pending/taken shown correctly | ☐ | ☐ |
| E4 | Leave overspend (negative) | Try to submit leave for **more days than you have available** | System **blocks** it with a clear "insufficient balance" message | ☐ | ☐ |
| E5 | ARIA — own data | Ask ARIA: "What is my leave balance?" | ARIA returns **your** balance | ☐ | ☐ |
| E6 | ARIA — privacy (negative) | Ask ARIA: "Show leave requests for \<another employee's name\>" | ARIA **refuses** — "not authorised to view this employee's leave" | ☐ | ☐ |
| E7 | Documents | Documents → upload a file → then View/Download it | Upload succeeds; you can view/download **your** document; you cannot open someone else's | ☐ | ☐ |
| E8 | Letters | Letters → request a Salary Certificate for yourself | Letter is generated **for you** (your name/details), not anyone else | ☐ | ☐ |
| E9 | Insurance (view-only) | Open **My Insurance** | You can **view** your cover; there are **no edit/enrol controls** (changes go through HR) | ☐ | ☐ |
| E10 | Access boundary (negative) | Try to open an HR/admin page (e.g. People list, Payroll) | You are **redirected away** / cannot access it | ☐ | ☐ |

### 👔 MANAGER (`manager@avaniis.dev`)

| # | Scenario | Steps | Expected outcome | Pass | Fail |
|---|---|---|---|:--:|:--:|
| M1 | Team access | Sign in → open People / team views | You can see **your team members**; not unrelated employees | ☐ | ☐ |
| M2 | Approvals inbox | Open Approvals | Pending items assigned to you are listed | ☐ | ☐ |
| M3 | Leave approval | Open a pending leave request → **Approve** | Status becomes Approved; the employee's days move from **pending → taken** | ☐ | ☐ |
| M4 | Leave rejection (balance return) | Reject a different pending request | Status becomes Rejected; the reserved days are **returned** to the employee's balance | ☐ | ☐ |
| M5 | Approve / Reject / Delegate | On a pending item, confirm the decision options | **Approve, Reject, and Delegate** are all available | ☐ | ☐ |
| M6 | ARIA — team query | Ask ARIA about one of **your own reports'** leave | ARIA returns the report's status (allowed for their manager) | ☐ | ☐ |
| M7 | Access boundary (negative) | Try to open Payroll | You are **blocked / redirected** | ☐ | ☐ |

### 🧑‍💻 HR ADMIN (`hr.admin@avaniis.dev`)

| # | Scenario | Steps | Expected outcome | Pass | Fail |
|---|---|---|---|:--:|:--:|
| H1 | Employee administration | People → open an employee → view/edit details | Records open and save correctly within your company | ☐ | ☐ |
| H2 | Leave administration | Absence → balances / requests / calendar | Pages load; you can administer leave for your company | ☐ | ☐ |
| H3 | Leave for departed staff (negative) | Try to file leave on behalf of a **terminated/inactive** employee | System **blocks** it (employee no longer active) | ☐ | ☐ |
| H4 | Insurance administration | Insurance → enrol an employee in **your company** | Enrolment succeeds for your company | ☐ | ☐ |
| H5 | Insurance cross-company (negative) | Attempt an insurance action for a **different company** | System **blocks** it | ☐ | ☐ |
| H6 | Letters | Employee Letters → generate a letter for an employee in your company | Letter generated; emailing requires a valid **work email** (otherwise it fails clearly, never sends elsewhere) | ☐ | ☐ |
| H7 | Payroll access | Open Payroll → create/calculate a run; generate the **WPS file** | Run processes; **WPS file generates** from bank data; duplicate run for the same month is **blocked**; bank IBANs shown **masked** | ☐ | ☐ |
| H8 | Payroll cross-company (negative) | Attempt to open another company's payroll run | System **blocks** it | ☐ | ☐ |
| H9 | ARIA OS functions | Open ARIA → daily briefing / expiry alerts / compliance panels | Panels load and show **your company's** data only | ☐ | ☐ |
| H10 | DataOps console (negative) | Try to open the technical Data console (`/admin/dataops`) | You are **blocked** (System Administrator only) | ☐ | ☐ |

---

## 6. Known UAT Notes (expected — not defects)

1. **Demo accounts are intentionally enabled** in this UAT environment (`employee/manager/hr.admin @avaniis.dev`). These shared accounts will be **disabled before real production go-live**; production uses Microsoft sign-in only.
2. **Payroll/WPS testing needs seeded bank details** — to generate a WPS file (H7), employees in the run must have bank account (IBAN) records loaded. Without them, that scenario cannot be completed and should be marked accordingly.
3. **Cross-company tests need more than one company** — scenarios H5, H8 (and the manager/employee boundary checks) are fully meaningful only when the UAT data includes at least **two legal entities**. If only one company is seeded, mark these "not testable — data".
4. **Some scenarios require seeded data** — e.g. leave-balance accuracy (E3) needs an employee with an existing balance/carry-forward; insurance view (E9) needs an active enrolment; approvals (M2–M5) need pending requests. Where the data isn't present, note it rather than failing.
5. **AI responses vary in wording** — ARIA's exact phrasing may differ run to run; judge on **whether the correct data/permission outcome occurs**, not on exact text.

---

## 7. Business Sign-Off

| Role | Name | Decision / comments | Signature | Date |
|---|---|---|---|---|
| **Prepared by — Technical QA** | | | | |
| **Validated by — HR** | | | | |
| **Validated by — Payroll** | | | | |
| **Validated by — Operations** | | | | |
| **Validated by — Management** | | | | |

**Overall UAT decision:**
- ☐ **Accepted**
- ☐ **Accepted with observations** (list below)
- ☐ **Rejected** (list blocking issues below)

**Observations / blocking issues:**
_______________________________________________________________
_______________________________________________________________

---

## 8. UAT Exit Criteria — what must pass before W0–W3 are accepted by the business

W0–W3 are considered **accepted** when **all** of the following are true:

1. **All Employee scenarios E1–E10 pass**, with special attention to the privacy/security ones: **E6 (ARIA refuses other employee's data)** and **E10 (no access to HR/admin pages)**.
2. **All Manager scenarios M1–M7 pass**, especially **M3/M4 (approve deducts, reject returns balance)** and **M7 (no payroll access)**.
3. **All HR Admin scenarios H1–H10 pass**, especially the security negatives **H3 (no leave for departed staff)**, **H5/H8 (no cross-company access)**, **H10 (DataOps blocked)**, and the payroll outcome **H7 (WPS generates, duplicate blocked, IBAN masked)**.
4. **No leave-balance discrepancy** observed (E3/E4/M3/M4) — balances always reconcile (available ≤ total; reserve/return/deduct correct).
5. **No privacy or cross-access incident** observed in any role (no user sees data they should not).
6. Any scenario marked "not testable — data" is documented with the missing data, and a plan exists to validate it once data is seeded (notably **H7 payroll/WPS** and the **cross-company** checks).
7. The **production go-live pre-condition** is acknowledged: demo accounts (`*@avaniis.dev/demo`) must be **disabled and re-verified as rejected** before the system is opened to real users. This is a release gate, not a UAT-acceptance gate.

**Acceptance levels**
- **Accepted** — all of 1–6 pass with no observations.
- **Accepted with observations** — 1–6 pass functionally; only data-dependent items (point 6) remain, with a plan to close them.
- **Rejected** — any privacy/security negative (E6, E10, H3, H5, H8, H10) or balance-accuracy scenario fails.

---
*Documentation only — no code, database, or deployment changes were made in preparing this package.*
