# W0–W3 Production Smoke Test Checklist

**Target:** http://localhost:3001 (commit `293aa95`) · **Migration 0055:** applied
**Auth:** Microsoft SSO (dev creds stripped in prod). Provision real Entra ID test users per role below.
**Forged/negative tests** can't be done by clicking the UI (the UI always sends correct values) — drive the Server Action / route directly via **browser DevTools console `fetch(...)`** or **curl with a captured session cookie** (`__Secure-authjs.session-token`). Never paste cookies into chat/issues.

**Test users needed:** EMPLOYEE-A, MANAGER-A (manages EMPLOYEE-A), HR_ADMIN-A, HR_DIRECTOR-A, PAYROLL_ADMIN-A, FINANCE-A, SUPER_ADMIN — all in **Entity A**; plus EMPLOYEE-B / HR_ADMIN-B in **Entity B** (for cross-entity tests). EMPLOYEE-X = an employee NOT in MANAGER-A's team.

Legend: ✅ pass · ❌ fail · ⏭️ skipped/blocked.

---

## 1. Security / Authorization (cross-cutting identity & entity)

| # | Role | Steps | Expected | Result |
|---|------|-------|----------|:---:|
| SEC-01 | EMPLOYEE-A | Normal sign-in → land on `/me` | Authenticated session; no errors | ☐ |
| SEC-02 | EMPLOYEE-A | DevTools: invoke `sendAriaMessage` (or any action) with a **forged sessionCtx** `{personId: EMPLOYEE-X, role:'HR_ADMIN', legalEntityId: ENTITY_B}` | Server re-derives identity from session; acts only as EMPLOYEE-A; forged role/person/entity ignored | ☐ |
| SEC-03 | EMPLOYEE-A | Call `requestLetter` with `personId = EMPLOYEE-X` | Letter generated for **EMPLOYEE-A only** (own id forced); never for EMPLOYEE-X | ☐ |
| SEC-04 | EMPLOYEE-A | Call `getPersonEnrolments(EMPLOYEE-X)` (insurance) | **FORBIDDEN** / no data (IDOR blocked) | ☐ |
| SEC-05 | MANAGER-A | Call `getPersonEnrolments(EMPLOYEE-A)` (own report) then `(EMPLOYEE-X)` (not a report) | Report ✅ allowed; non-report ❌ FORBIDDEN | ☐ |
| SEC-06 | HR_ADMIN-A | Attempt insurance enrol / cancel with `legalEntityId = ENTITY_B` | **FORBIDDEN** (cross-entity write blocked) | ☐ |
| SEC-07 | HR_ADMIN-A | Open Entity-B payroll run id in URL `/payroll/runs/<B-run-id>` | Redirected away / not visible (cross-entity disclosure blocked) | ☐ |
| SEC-08 | SUPER_ADMIN | Same Entity-B payroll run id | Visible (SUPER_ADMIN bypass) | ☐ |
| SEC-09 | — | Confirm `ENABLE_DEV_ACCOUNTS` is **unset** in Vercel prod env; try dev creds (`*@avaniis.dev / demo`) | Dev login rejected in production | ☐ |

---

## 2. ARIA

| # | Role | Steps | Expected | Result |
|---|------|-------|----------|:---:|
| ARIA-01 | EMPLOYEE-A | Ask ARIA "what is my leave balance?" | Returns **own** balance; no error | ☐ |
| ARIA-02 | EMPLOYEE-A | Ask ARIA "show leave requests for \<EMPLOYEE-X name\>" | Politely refused — "not authorised to view this employee's leave" (P3-A2) | ☐ |
| ARIA-03 | MANAGER-A | Ask ARIA for EMPLOYEE-A's (own report) leave status | Allowed (relationship-scoped) | ☐ |
| ARIA-04 | EMPLOYEE-A | Confirm a leave draft via ARIA ("yes") | Leave submitted **for EMPLOYEE-A** with correct entity; pending approval | ☐ |
| ARIA-05 | EMPLOYEE-A | Invoke `getExpiryAlerts` / `getComplianceData` / `getPeopleStats` directly | **FORBIDDEN** (OS-role required, P3-A3) | ☐ |
| ARIA-06 | HR_ADMIN-A | Open ARIA OS console; load expiry alerts | Loads; shows **only Entity-A** employees' expiry (entity-scoped) | ☐ |
| ARIA-07 | EMPLOYEE-A | Invoke `generateDailyBriefing` directly | **FORBIDDEN** (privileged role required) | ☐ |
| ARIA-08 | HR_ADMIN-A | ARIA OS daily briefing on home panel | Renders briefing text normally | ☐ |

---

## 3. ESS Letters

| # | Role | Steps | Expected | Result |
|---|------|-------|----------|:---:|
| LET-01 | EMPLOYEE-A | ESS → request a Salary Certificate for self | Generated with EMPLOYEE-A's data; PDF available/queued | ☐ |
| LET-02 | EMPLOYEE-A | Forge `requestLetter` with another `personId` | Bound to self; never produces another person's letter (P3-A5) | ☐ |
| LET-03 | HR_ADMIN-A | Generate a letter for an Entity-A employee | Allowed | ☐ |
| LET-04 | HR_ADMIN-A | Generate a letter for an **Entity-B** employee | **FORBIDDEN** (entity-scoped, P3-A5) | ☐ |
| LET-05 | EMPLOYEE-A | Open own signing link `/letters/sign/<token>` and sign | Sign succeeds (subject match) | ☐ |
| LET-06 | EMPLOYEE-X | Open EMPLOYEE-A's signing link and attempt to sign | **"Not authorised to sign this document"** (fail-closed, P3-A4) | ☐ |
| LET-07 | HR_ADMIN-A | Email a letter to an employee **with no work email on record** | Send **fails** with a clear message; PII never sent to a default mailbox (P3-M-FALLBACK-EMAIL) | ☐ |
| LET-08 | HR_ADMIN-A | Email a letter to an employee **with** a work email | Sent to the employee's address | ☐ |

---

## 4. Insurance

| # | Role | Steps | Expected | Result |
|---|------|-------|----------|:---:|
| INS-01 | EMPLOYEE-A | ESS → My Insurance (read-only) | Shows own enrolment; no mutation controls | ☐ |
| INS-02 | EMPLOYEE-A | Call `getActiveEnrolment(EMPLOYEE-X)` | **FORBIDDEN** (IDOR, P3-A6) | ☐ |
| INS-03 | PAYROLL_ADMIN-A | Read another employee's enrolment (premium work) | Allowed (trusted broad-read) | ☐ |
| INS-04 | HR_ADMIN-A | Enrol an Entity-A employee | Allowed | ☐ |
| INS-05 | HR_ADMIN-A | Enrol/cancel/extend/update-card with `legalEntityId = ENTITY_B` | **FORBIDDEN** for each (P3-A7) | ☐ |
| INS-06 | HR_DIRECTOR-A | Grant contractor exception for Entity-B | **FORBIDDEN** (cross-entity) | ☐ |

---

## 5. Payroll / WPS

| # | Role | Steps | Expected | Result |
|---|------|-------|----------|:---:|
| PAY-01 | PAYROLL_ADMIN-A | Create a REGULAR run for Entity A, period P | Created (DRAFT) with run number `PR-00000N` | ☐ |
| PAY-02 | PAYROLL_ADMIN-A | Create a **second REGULAR run** for Entity A, **overlapping period P** | **Rejected** — "already covers an overlapping period" (P2-P5) | ☐ |
| PAY-03 | PAYROLL_ADMIN-B | Create the first REGULAR run for **Entity B** | Succeeds; may legitimately get `PR-000001` even if Entity A also has `PR-000001` (P2-P4, no collision) | ☐ |
| PAY-04 | PAYROLL_ADMIN-A | Calculate run → approve → **Generate WPS SIF** (employees have encrypted bank details seeded) | SIF generated; status `SIF_GENERATED`; validation passes (bank details sourced from `person_bank_details`, P2-P1) | ☐ |
| PAY-05 | PAYROLL_ADMIN-A | Inspect a `wps_sif_records` row (via authorized view / DataOps) | IBAN stored **masked** (e.g. `AE07…3456`); no full plaintext IBAN at rest (P2-P2) | ☐ |
| PAY-06 | PAYROLL_ADMIN-A | Generate WPS when an employee has **no bank details** | That record fails validation with a clear reason (not a silent empty SIF) | ☐ |
| PAY-07 | HR_ADMIN-A | Open an **Entity-B** run via `/payroll/runs/<B-id>` | Blocked (P2-P3) | ☐ |
| PAY-08 | PAYROLL_ADMIN-A | calculate/lock/approve/reject/confirm an Entity-B run by id | Blocked on each (entity assert on all run-by-id actions, P2-P3) | ☐ |

---

## 6. Leave Balance

| # | Role | Steps | Expected | Result |
|---|------|-------|----------|:---:|
| LV-01 | EMPLOYEE-A | Submit an annual-leave request within balance | Submitted PENDING; **pendingDays increases** by the duration | ☐ |
| LV-02 | EMPLOYEE-A | Submit a **second** pending request whose days exceed remaining (available − pending) | **Blocked** — INSUFFICIENT_BALANCE (no overspend, P2-L1) | ☐ |
| LV-03 | EMPLOYEE-A | Fire **two concurrent** submits for non-overlapping dates that together exceed balance | Exactly one succeeds; the other blocked (per-person advisory lock, P2-L1) | ☐ |
| LV-04 | MANAGER-A / HR_ADMIN-A | **Reject** a pending request | Status REJECTED **and pendingDays released** (balance restored, P2-L1) | ☐ |
| LV-05 | MANAGER-A / HR_ADMIN-A | **Approve** a pending request | pendingDays → takenDays (balance moved, not double-counted) | ☐ |
| LV-06 | EMPLOYEE-A | **Cancel** a pending request | pendingDays released | ☐ |
| LV-07 | HR_ADMIN-A | File leave **on behalf of a terminated/inactive employee** | **Blocked** — PERSON_INACTIVE (P2-L3) | ☐ |
| LV-08 | EMPLOYEE-A (with carry-forward and/or adjustment) | Open ESS → My Leave | "Total" includes opening + accrued + carried-forward + adjusted; **available ≤ total**; progress bar not clamped/overflowing (P2-L4) | ☐ |

---

## 7. DataOps

| # | Role | Steps | Expected | Result |
|---|------|-------|----------|:---:|
| DO-01 | SUPER_ADMIN | Open `/admin/dataops`; run a SELECT; view schema/audit/saved-queries | All work normally | ☐ |
| DO-02 | HR_ADMIN-A | `fetch` `/api/dataops/execute` (SELECT) directly | **403 Forbidden** (in-handler gate, P3-D1) | ☐ |
| DO-03 | HR_ADMIN-A | `fetch` `/api/dataops/nl2sql`, `/schema`, `/audit`, `/saved-queries` (GET+POST), `/tables/.../rows` (GET) | **403** on every one (P3-D1) | ☐ |
| DO-04 | EMPLOYEE-A | Same direct calls as DO-03 | **403/redirect** on every one | ☐ |

---

## 8. General Regression

| # | Role | Steps | Expected | Result |
|---|------|-------|----------|:---:|
| REG-01 | — | `/api/health` and `/api/health/db` | Both **200**; region `fra1` | ☐ |
| REG-02 | — | `/sign-in` loads | 200, renders, SSO button present | ☐ |
| REG-03 | EMPLOYEE-A | Navigate ESS: profile, payslips, documents, timesheet, org chart | All load, no 500s | ☐ |
| REG-04 | HR_ADMIN-A | Navigate: dashboard, persons list + detail + edit, approvals inbox, master-data | All load, no Server-Component render errors | ☐ |
| REG-05 | MANAGER-A | Approvals inbox shows the canonical **Approve / Reject / Delegate** actions | Present and functional | ☐ |
| REG-06 | HR_ADMIN-A | ARIA chat answers a general HR question | Responds; graceful message if AI unavailable (no crash) | ☐ |
| REG-07 | EMPLOYEE-A | Upload a document in ESS, then View/Download it | Upload + retrieval work; access denied for cross-user doc | ☐ |
| REG-08 | — | Spot-check Arabic locale on a couple of pages | RTL renders; no layout break | ☐ |

---

**Sign-off:** Tester ______________  Date __________  Build `293aa95`  Overall: ☐ PASS  ☐ FAIL
**Notes / defects:**
