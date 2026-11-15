# AVANIIS HR — W0–W3 Manual UAT Script (Remaining 38 Tests)

**Environment (UAT):** http://localhost:3001 · **Build:** `293aa95`
**Audience:** business testers (HR, Payroll, Operations, Managers) — with a few items routed to a technical/security tester.
**Purpose:** execute the 38 W0–W3 tests that could not be auto-validated. The other 10 (login, navigation, role access, DataOps block, RTL) already passed.

> **How to use:** Work top to bottom within each section. Use the exact account named in each test. Sign out fully between roles. Tick **Pass / Fail / Blocked**, capture the requested screenshot, and log any failure in Section 9. If a test's prerequisite data isn't available, tick **Blocked** and note the missing data.

## Test accounts
| Alias | Account | Password | Company |
|---|---|---|---|
| **EMP-A** | employee@avaniis.dev | demo | Company A |
| **MGR-A** | manager@avaniis.dev | demo | Company A (manages EMP-A) |
| **HR-A** | hr.admin@avaniis.dev | demo | Company A |
| **HR-B** | _(to be provisioned)_ | _UAT setup_ | **Company B** (second legal entity) |
| **EMP-B** | _(to be provisioned)_ | _UAT setup_ | Company B |

## Prerequisite-data legend (set up before testing)
| Flag | Meaning |
|---|---|
| 🏢 | Needs a **second legal entity** (Company B) with at least one HR + employee |
| 🏦 | Needs **seeded bank details (IBAN)** on the run's employees |
| 📋 | Needs an existing **pending leave request** |
| 🚫 | Needs a **terminated / inactive** employee |
| ➕ | Needs an employee with a **carry-forward and/or adjustment** in this year's balance |
| 🧪 | Needs an employee with a **leave balance / entitlement** loaded |
| 🔧 | **Technical/security tester required** (uses browser DevTools to send a tampered request) — not a click-through business test. Route to IT/Security. |
| 🔗 | Needs a **letter signing link/token** for a specific person's letter |
| 💳 | Needs an **active payroll definition** for the company |

**UAT data setup owner:** ____________________  (please confirm 🏢/🏦/📋/🚫/➕/🧪/💳 data is loaded before the session)

---

## 1. Security / Authorization

### [SEC-02] ARIA cannot be impersonated 🔧
- **Account:** EMP-A (technical tester drives it)
- **Prereq:** none
- **Steps (technical):** Logged in as EMP-A, open browser DevTools → Console. Trigger an ARIA chat message but tamper the request so the "session context" claims a different person/role (e.g. another employee's ID and role HR_ADMIN).
- **Expected:** ARIA acts only as **EMP-A** — the tampered identity is ignored; no other person's data is returned and no admin function is unlocked.
- **Evidence:** screenshot of the response showing only EMP-A's data.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [SEC-03] Cannot generate a letter for someone else 🔧
- **Account:** EMP-A (technical tester)
- **Prereq:** another employee's ID
- **Steps (technical):** As EMP-A, submit a letter request but tamper the request to use **another employee's ID**.
- **Expected:** the letter is produced **for EMP-A only** (their own details), never for the other person.
- **Evidence:** screenshot of the generated letter showing EMP-A's name.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [SEC-04] Cannot read another employee's insurance 🔧
- **Account:** EMP-A (technical tester)
- **Prereq:** another employee's ID
- **Steps (technical):** As EMP-A, request insurance enrolment data using **another employee's ID** via a tampered request.
- **Expected:** **Access denied** — no other employee's enrolment/premium data is returned.
- **Evidence:** screenshot of the "forbidden"/empty response.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [SEC-06] HR cannot enrol/cancel insurance for another company 🏢 🔧
- **Account:** HR-B
- **Prereq:** Company B HR account; a Company A employee ID
- **Steps:** As HR-B, attempt an insurance enrolment/cancellation that targets a **Company A** employee/entity (via the UI if possible, otherwise a tampered request).
- **Expected:** **Blocked** — HR-B can only act within Company B.
- **Evidence:** screenshot of the denial.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [SEC-07] HR cannot open another company's payroll run 🏢
- **Account:** HR-A
- **Prereq:** a payroll run that belongs to **Company B** (note its on-screen link/URL)
- **Steps:** As HR-A, paste/open the **Company B** payroll run link directly in the browser.
- **Expected:** HR-A is **redirected away / cannot view** Company B's salary data.
- **Evidence:** screenshot showing the redirect / no access.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

---

## 2. ARIA

### [ARIA-01] Employee sees only own data 🧪
- **Account:** EMP-A
- **Prereq:** EMP-A has a leave balance loaded
- **Steps:** Open ARIA → ask "What is my leave balance?"
- **Expected:** ARIA returns **EMP-A's own** balance, correctly.
- **Evidence:** screenshot of ARIA's answer.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [ARIA-02] ARIA refuses another employee's leave
- **Account:** EMP-A
- **Prereq:** know a colleague's name
- **Steps:** Open ARIA → ask "Show the leave requests for \<colleague's name\>."
- **Expected:** ARIA **refuses** — message like "you are not authorised to view this employee's leave."
- **Evidence:** screenshot of the refusal.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [ARIA-03] Manager can see a direct report's status
- **Account:** MGR-A
- **Prereq:** EMP-A reports to MGR-A and has leave history
- **Steps:** Open ARIA → ask about **EMP-A's** leave status.
- **Expected:** ARIA returns EMP-A's status (allowed for their manager).
- **Evidence:** screenshot.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [ARIA-04] Leave submission via ARIA 🧪
- **Account:** EMP-A
- **Prereq:** EMP-A has balance; **this creates a leave record** — cancel it afterwards
- **Steps:** Open ARIA → "I want to take annual leave from \<date\> to \<date\>" → confirm ("yes") when ARIA asks.
- **Expected:** a leave request is created **for EMP-A** with the right dates, status Pending. *(Cleanup: cancel the request after the test.)*
- **Evidence:** screenshot of confirmation + the request in My Leave.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [ARIA-05] Employee cannot reach HR AI panels
- **Account:** EMP-A
- **Prereq:** none
- **Steps:** Confirm EMP-A has no access to the ARIA OS admin panels (expiry alerts, compliance, people stats) — they should not appear in the employee's ARIA.
- **Expected:** HR-only AI panels are **not available** to EMP-A.
- **Evidence:** screenshot of EMP-A's ARIA (no admin panels).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [ARIA-08] HR OS briefing works
- **Account:** HR-A
- **Prereq:** none
- **Steps:** Open ARIA (OS) → view the daily briefing / expiry alerts / compliance panels.
- **Expected:** panels load and show **Company A** data only.
- **Evidence:** screenshot of the OS panels.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

---

## 3. ESS Letters

### [LET-01] Employee requests own letter 🧪
- **Account:** EMP-A
- **Prereq:** a self-requestable letter type configured (e.g. Salary Certificate)
- **Steps:** Letters → Request a Letter → choose Salary Certificate → submit.
- **Expected:** letter generated **for EMP-A**, with EMP-A's details; status shown clearly (Submitted/Ready).
- **Evidence:** screenshot of the generated letter.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [LET-03] HR generates a letter for a same-company employee
- **Account:** HR-A
- **Prereq:** a Company A employee
- **Steps:** Employee Letters → generate a letter for a **Company A** employee.
- **Expected:** letter generated successfully.
- **Evidence:** screenshot.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [LET-06] Only the letter's owner can sign it 🔗
- **Account:** EMP-A (then a different employee)
- **Prereq:** a signing link issued for **EMP-A's** letter
- **Steps:** (a) As EMP-A, open the signing link and sign → succeeds. (b) As a **different** employee, open **EMP-A's** signing link and try to sign.
- **Expected:** (a) EMP-A signs successfully; (b) the other employee is **denied** ("not authorised to sign this document").
- **Evidence:** screenshots of both outcomes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [LET-08] Letter email goes to the employee's work email
- **Account:** HR-A
- **Prereq:** one employee **with** a work email, and one **without**
- **Steps:** (a) Email a letter to an employee who has a work email. (b) Email a letter to an employee with **no** work email on record.
- **Expected:** (a) sent to the employee's work email; (b) the send **fails with a clear message** and is **not** sent to any default/other address.
- **Evidence:** screenshots of both outcomes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

---

## 4. Insurance

### [INS-01] Employee insurance is view-only 🧪
- **Account:** EMP-A
- **Prereq:** EMP-A has an active enrolment
- **Steps:** Open My Insurance.
- **Expected:** EMP-A can **view** their cover and dependents; there are **no edit/enrol/cancel controls** (changes go through HR).
- **Evidence:** screenshot of the read-only page.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [INS-02] Employee cannot read another's enrolment 🔧
- **Account:** EMP-A (technical tester)
- **Prereq:** another employee's ID
- **Steps (technical):** As EMP-A, request the active enrolment using **another employee's ID** via a tampered request.
- **Expected:** **Access denied** — no other enrolment data returned.
- **Evidence:** screenshot of denial.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [INS-03] Payroll Admin can read enrolments (for premiums)
- **Account:** a **Payroll Admin** account (if available)
- **Prereq:** Payroll Admin account; an employee with an enrolment
- **Steps:** As Payroll Admin, view an employee's insurance enrolment (premium info).
- **Expected:** allowed — Payroll Admin can read enrolments for premium processing.
- **Evidence:** screenshot.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [INS-04] HR enrols a same-company employee
- **Account:** HR-A
- **Prereq:** a Company A employee + a plan
- **Steps:** Insurance → enrol a **Company A** employee in a plan.
- **Expected:** enrolment succeeds for Company A.
- **Evidence:** screenshot.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [INS-05] HR cannot enrol/cancel for another company 🏢 🔧
- **Account:** HR-B
- **Prereq:** Company B HR; a Company A employee
- **Steps:** As HR-B, attempt enrol/cancel/extend targeting a **Company A** employee/entity.
- **Expected:** **Blocked** on every action.
- **Evidence:** screenshot of denial.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

---

## 5. Payroll / WPS

### [PAY-01] Create a payroll run 💳
- **Account:** HR-A (or Payroll Admin)
- **Prereq:** active payroll definition for Company A
- **Steps:** Payroll → New Run → choose Company A, period, REGULAR → create.
- **Expected:** run created as **Draft** with a run number (e.g. PR-0000xx).
- **Evidence:** screenshot of the created run.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [PAY-02] Duplicate month is blocked 💳
- **Account:** HR-A
- **Prereq:** the run from PAY-01 exists
- **Steps:** Try to create a **second REGULAR run** for Company A covering the **same month**.
- **Expected:** **Blocked** — "a payroll run already covers an overlapping period."
- **Evidence:** screenshot of the block message.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [PAY-03] Each company numbers runs independently 🏢 💳
- **Account:** HR-B
- **Prereq:** Company B payroll definition
- **Steps:** Create the **first** REGULAR run for **Company B**.
- **Expected:** succeeds even if Company A already has the same run number (e.g. both PR-000001) — **no collision/error**.
- **Evidence:** screenshot of Company B run created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [PAY-04] WPS file generates from bank data 🏦 💳
- **Account:** HR-A
- **Prereq:** run employees have **seeded bank details (IBAN)**
- **Steps:** Calculate the run → approve it → **Generate WPS SIF**.
- **Expected:** WPS file generates successfully (status SIF Generated); validation passes.
- **Evidence:** screenshot of the SIF-generated status.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [PAY-05] Bank account numbers are protected (masked) 🏦
- **Account:** HR-A
- **Prereq:** PAY-04 completed
- **Steps:** Open the WPS preview/records.
- **Expected:** IBANs are shown **masked** (e.g. AE07••••••3456) — the full number is not displayed/stored in the clear.
- **Evidence:** screenshot of masked IBAN.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [PAY-06] Missing bank details fail clearly 💳
- **Account:** HR-A
- **Prereq:** at least one employee in the run **without** bank details
- **Steps:** Generate WPS for a run that includes a no-bank employee.
- **Expected:** that employee's record **fails with a clear reason** (valid IBAN required) — not a silent/blank file.
- **Evidence:** screenshot of the per-employee error.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [PAY-07] HR cannot open another company's run 🏢
- **Account:** HR-A
- **Prereq:** a Company B run link
- **Steps:** As HR-A, open the **Company B** run link directly.
- **Expected:** **Blocked / redirected** (same as SEC-07).
- **Evidence:** screenshot.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [PAY-08] Cannot process another company's run 🏢 💳
- **Account:** HR-A
- **Prereq:** a Company B run
- **Steps:** As HR-A, attempt to calculate/lock/approve/reject/confirm/generate-WPS on a **Company B** run.
- **Expected:** **Blocked** on every action.
- **Evidence:** screenshot.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

---

## 6. Leave Balance

> Tests LV-01/04/05/06 create and change real leave records — **clean up** (cancel) test requests afterward where possible. Approvals (LV-04/05) require a manager/HR approver.

### [LV-01] Submitting reserves balance 🧪
- **Account:** EMP-A
- **Prereq:** EMP-A has an annual-leave balance
- **Steps:** Note current balance → Apply for Leave (within balance) → submit → re-check balance.
- **Expected:** request is **Pending**; **Pending days increase** by the amount requested; Available reduces accordingly.
- **Evidence:** before/after balance screenshots.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [LV-02] Overspend is blocked 🧪
- **Account:** EMP-A
- **Prereq:** known remaining balance
- **Steps:** Try to submit leave for **more days than Available**.
- **Expected:** **Blocked** — "insufficient balance."
- **Evidence:** screenshot of the block.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [LV-04] Rejection returns the balance 📋
- **Account:** MGR-A or HR-A (approver)
- **Prereq:** a pending request from EMP-A
- **Steps:** Note EMP-A's pending balance → **Reject** the request → re-check.
- **Expected:** status Rejected; the reserved **days are returned** (pending decreases back).
- **Evidence:** before/after balance screenshots.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [LV-05] Approval deducts the balance 📋
- **Account:** MGR-A or HR-A (approver)
- **Prereq:** a pending request from EMP-A
- **Steps:** **Approve** the request → check EMP-A's balance.
- **Expected:** status Approved; days move from **Pending → Taken** (not double-counted).
- **Evidence:** before/after balance screenshots.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [LV-06] Cancelling a pending request releases balance 📋
- **Account:** EMP-A
- **Prereq:** a pending request by EMP-A
- **Steps:** Cancel the pending request → check balance.
- **Expected:** the reserved days are **released** back to Available.
- **Evidence:** before/after balance screenshots.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [LV-07] Cannot file leave for a departed employee 🚫
- **Account:** HR-A
- **Prereq:** a **terminated/inactive** employee in Company A
- **Steps:** Try to file a leave request on behalf of the terminated employee.
- **Expected:** **Blocked** — employee is no longer active.
- **Evidence:** screenshot of the block.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [LV-08] Balance screen totals are correct ➕
- **Account:** EMP-A (an employee with carry-forward/adjustment)
- **Prereq:** balance includes a carry-forward and/or adjustment
- **Steps:** Open My Leave → read the balance card.
- **Expected:** **Available is never greater than Total**; the progress bar is not overflowing; Total includes opening + accrued + carried-forward + adjustments.
- **Evidence:** screenshot of the balance card.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

---

## 7. Approvals / Regression

### [REG-05] Approve / Reject / Delegate available 📋
- **Account:** MGR-A or HR-A
- **Prereq:** a pending approval assigned to the approver
- **Steps:** Open the pending approval item.
- **Expected:** **Approve, Reject, and Delegate** options are all present and work.
- **Evidence:** screenshot of the decision panel.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [REG-06] ARIA handles questions gracefully
- **Account:** HR-A
- **Prereq:** none
- **Steps:** Ask ARIA a general HR question.
- **Expected:** ARIA responds; if the AI service is temporarily unavailable it shows a **friendly message** (no crash/blank page).
- **Evidence:** screenshot.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

### [REG-07] Document upload + view/download; cross-user denied
- **Account:** EMP-A (then a different employee)
- **Prereq:** none
- **Steps:** (a) As EMP-A, upload a document, then View and Download it. (b) As a **different** employee, attempt to open EMP-A's document link.
- **Expected:** (a) upload + view + download work for EMP-A; (b) the other employee is **denied**.
- **Evidence:** screenshots of both.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked

---

## 8. Test summary

| Section | Tests | Pass | Fail | Blocked |
|---|---|---|---|---|
| 1. Security / Authorization | SEC-02,03,04,06,07 (5) | | | |
| 2. ARIA | ARIA-01,02,03,04,05,08 (6) | | | |
| 3. ESS Letters | LET-01,03,06,08 (4) | | | |
| 4. Insurance | INS-01,02,03,04,05 (5) | | | |
| 5. Payroll / WPS | PAY-01–08 (8) | | | |
| 6. Leave Balance | LV-01,02,04,05,06,07,08 (7) | | | |
| 7. Approvals / Regression | REG-05,06,07 (3) | | | |
| **Total** | **38** | | | |

---

## 9. Defect Logging Template

Copy one block per defect found.

```
Defect ID:        DEF-W0W3-___
Linked Test ID:   ___ (e.g. PAY-04)
Date / Tester:    ___ / ___
Severity:         Sev-1 (critical) | Sev-2 (high) | Sev-3 (medium) | Sev-4 (low)
Environment:      UAT  build 293aa95
Account used:     ___ (e.g. HR-A)
Steps to reproduce:
  1.
  2.
  3.
Expected result:  ___
Actual result:    ___
Screenshot/evidence: ___ (attach file name/link)
Suspected area:   Security | ARIA | Letters | Insurance | Payroll/WPS | Leave | Approvals
Assigned owner:   ___
Status:           Open | In progress | Fixed | Retested-Pass | Closed
```

**Severity guide (business):**
- **Sev-1:** data privacy breach / wrong person's data exposed / payroll pays wrong or twice / security control bypassed.
- **Sev-2:** core flow blocked (cannot submit leave, cannot generate WPS) or balance/amount incorrect.
- **Sev-3:** functional issue with a workaround.
- **Sev-4:** cosmetic / wording / minor display.

---

## 10. UAT Exit Criteria — W0–W3 accepted by business when ALL are true

1. **No open Sev-1 or Sev-2 defects.**
2. **Payroll / WPS accepted** — PAY-04 (WPS generates), PAY-05 (IBAN masked), PAY-02 (no duplicate run), PAY-06 (missing-bank fails clearly) all **Pass**.
3. **Leave balance verified** — LV-01, LV-04, LV-05, LV-06, LV-08 all **Pass** (reserve / return / deduct / release / correct totals), and LV-02 overspend is blocked.
4. **Security negative tests pass** — SEC-02/03/04/06/07, ARIA-02/05, INS-02/05, LET-06, PAY-07/08 all **Pass** (access denied / no data leakage / no cross-company / no impersonation). *(🔧 items signed off by the technical/security tester.)*
5. **Business sign-off recorded** — HR, Payroll, Operations, and Management have reviewed results and signed the handover (`docs/qa-qc/w0-w3-business-uat-handover.md`, Section 7).
6. **Any Blocked test has a documented reason** (missing data) and a plan to complete once the data (🏢/🏦/📋/🚫/➕/💳) is seeded.

> **Separate production go-live gate (not a UAT-acceptance item):** before opening to real users, **disable the demo accounts** (`*@avaniis.dev/demo`) and re-verify they are rejected — see `docs/qa-qc/w0-w3-production-signoff.md` (SEC-09).

---
*Documentation only — no code, database, or deployment changes were made.*
