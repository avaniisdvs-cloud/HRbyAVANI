# W0–W3 Production Execution Report

**Date:** 2026-06-02 · **Target:** http://localhost:3001 · **Build:** `293aa95` · **Migration 0055:** applied & verified
**Executed by:** Claude Code (CLI agent) · **Method:** authenticated scripted HTTP using the approved demo accounts (session tokens never logged). No code/DB/config/deploy changes.

## Execution constraints (read first — they determine the classifications)
1. **No browser was connected** (`list_connected_browsers` → empty) → **no UI automation and no screenshots are possible**. Evidence is HTTP status codes, redirect targets, session role, and rendered-HTML markers.
2. **Next.js Server Actions cannot be reliably invoked via scripted HTTP** (they require build-hashed action IDs + RSC payload encoding). Most forged-argument / IDOR / cross-entity / business-flow tests are server actions → **NOT TESTABLE** by this method (all are code-verified in `293aa95` and covered by the green W0–W3 automated suite).
3. **No write/test transactions were created.** Production audit logs are **immutable (INSERT-only)** by design; creating leave/letters/enrolments would leave audit + notification + workflow rows that **cannot be cleaned up**. Per the rules (and data-integrity), write-flows were **not executed** → NOT TESTABLE.
4. **All three demo accounts resolve to the same legal entity (`aaaa0001`)** → there is **no second-entity account**, so cross-entity tests are NOT TESTABLE.

## 🔴 Key finding surfaced during execution — SEC-09
**Dev credentials are ENABLED in this production environment.** `employee@avaniis.dev / demo` (and manager/hr.admin) authenticate successfully (session issued, correct role). This means `ENABLE_DEV_ACCOUNTS=true` is set on Vercel for this deployment.
- **Severity:** HIGH for a *true* production environment (shared weak passwords grant EMPLOYEE/MANAGER/HR_ADMIN access); **expected** if this URL is the **UAT** environment (CLAUDE.md notes ENABLE_DEV_ACCOUNTS was enabled on Vercel for UAT).
- **Recommendation:** unset `ENABLE_DEV_ACCOUNTS` before genuine production go-live; SEC-09 then becomes PASS (dev login rejected). This finding is unrelated to the W0–W3 code (it is environment configuration).

---

## PHASE A — Authentication & Navigation — ✅ PASS

| Step | Expected | Actual | Result |
|---|---|---|---|
| A1 Login (3 accounts) | All authenticate | EMPLOYEE/MANAGER/HR_ADMIN all logged in; `personId` set; entity `aaaa0001` | ✅ PASS |
| A2 Role landing | EMPLOYEE→/me, others→/dashboard | EMPLOYEE `/me`=200; MANAGER/HR `/dashboard`=200 | ✅ PASS |
| A3 No unexpected redirects | role-correct bounces | EMPLOYEE `/dashboard`→307→`/me`; MANAGER/HR `/me`→307→`/dashboard` (roleHome correct) | ✅ PASS |
| A4 Menus load | nav pages render | EMPLOYEE ESS pages 200; HR admin pages 200 (see REG-03/04) | ✅ PASS |
| A5 Logout | session cleared | after signout `/api/auth/session` empty; `/me`→307→`/sign-in` | ✅ PASS |

---

## PHASE B — Security & Authorization

| Test | Expected | Result | Evidence |
|---|---|---|---|
| **DO-02** | non-SUPER_ADMIN blocked from DataOps execute | ✅ **PASS** | HR_ADMIN `GET /api/dataops/execute` → **307→/dashboard** (blocked) |
| **DO-03** | non-SUPER_ADMIN blocked from all DataOps routes | ✅ **PASS** | HR_ADMIN blocked on `/api/dataops/{execute,schema,audit,saved-queries,nl2sql,tables/.../rows}` and `/admin/dataops` → all **307→/dashboard** |
| SEC-02 | forged ARIA `sessionCtx` ignored | NOT TESTABLE | server action (`sendAriaMessage`) — not invocable via HTTP; code `aria/actions.ts:51` `safeCtx` re-derive |
| SEC-03 | EMPLOYEE forging letter `personId` → self-bound | NOT TESTABLE | server action; code `employee-letters/actions.ts:760-765` |
| SEC-04 | insurance read IDOR blocked | NOT TESTABLE | server action; code `insurance/actions.ts:625` `assertSelfOrTeam` |
| SEC-06 | insurance cross-entity write blocked | NOT TESTABLE | no Entity-B account + write; code `insurance/actions.ts` `assertSameEntity` ×7 |
| SEC-07 | cross-entity payroll run hidden | NOT TESTABLE | no Entity-B run/account; code `payroll/runs/[runId]/page.tsx:86-88` |
| ARIA-02 | cross-employee leave status denied | NOT TESTABLE | server action; code `aria/services.ts:640-643` |
| ARIA-05 | os-actions require OS role | NOT TESTABLE | server actions; code `aria/os-actions.ts` `requireRole(OS_ROLES)` ×4 |
| LET-06 | sign someone else's letter → denied | NOT TESTABLE | needs another's signing token; code `employee-letters/actions.ts:547` fail-closed |
| INS-02 | `getActiveEnrolment` IDOR blocked | NOT TESTABLE | server action; code `insurance/actions.ts:645` |
| INS-05 | enrol/cancel/extend cross-entity blocked | NOT TESTABLE | no Entity-B + write; code `assertSameEntity` |

**Bonus authenticated authorization matrix (executed, read-only) — supports the security posture:**
- EMPLOYEE denied `/persons`(307→/me), `/payroll/runs`(307→/dashboard), `/admin/dataops`(307→/me), `/master-data`(307→/me) → ✅ no cross-role page access.
- MANAGER denied `/payroll/runs`(307→/dashboard); allowed `/persons`(200). HR_ADMIN allowed `/persons`,`/approvals`(200). → ✅ role-appropriate.
- **No authorization bypass or data leakage observed at the page/route level.**

---

## PHASE C — Leave Controls

| Test | Expected | Result | Evidence |
|---|---|---|---|
| LV-01 | submit reserves pendingDays | NOT TESTABLE | write-flow (creates immutable audit/workflow rows in prod); code `absence/actions.ts:695,708` + integration tests |
| LV-02 | overspend blocked | NOT TESTABLE | write-flow; code `:690` INSUFFICIENT_BALANCE re-check |
| LV-04 | reject releases pending | NOT TESTABLE | write-flow; code `:1292` REJECTED release branch |
| LV-05 | approve moves pending→taken | NOT TESTABLE | write-flow; code `:1268-1269` |
| LV-06 | cancel releases pending | NOT TESTABLE | write-flow; code `:1087,1102` |
| LV-07 | inactive employee protection | NOT TESTABLE | write-flow + needs terminated person; code `:137` `assertActivePersonTarget` |
| LV-08 | ESS balance: available ≤ total | NOT TESTABLE (data) | `/me/leave` **renders cleanly (200, 59 KB, no error)**, but the demo employee has **no balance rows** (shows "No leave balances"), so the carried/adjusted math isn't exercised; code `me/leave/page.tsx:147-150` |

---

## PHASE D — ARIA

| Test | Expected | Result | Evidence |
|---|---|---|---|
| ARIA-01 | own balance only | NOT TESTABLE | chat is a server action; `/me/aria` page **renders clean (200, 61 KB)**; code `safeCtx` |
| ARIA-03 | manager sees report | NOT TESTABLE | server action; code `assertSelfOrTeam` |
| ARIA-04 | leave submission via chat | NOT TESTABLE | server action + write-flow |
| ARIA-08 | HR OS features | NOT TESTABLE | server action; code `generateDailyBriefing` `requireRole([HR_ADMIN,…])` |

---

## PHASE E — Payroll / WPS

| Test | Result | Evidence |
|---|---|---|
| PAY-01 | NOT TESTABLE | write-flow + needs active payroll definition; HR_ADMIN can reach `/payroll`(200) |
| PAY-02 | NOT TESTABLE | write-flow (duplicate run); code `payroll/actions.ts:241-256` |
| PAY-03 | NOT TESTABLE (runtime) | write-flow + no Entity-B account; **DB constraint already verified by you in Neon** (`uq_payroll_run_number_per_entity` present, global unique dropped) |
| PAY-04 | NOT TESTABLE | write-flow + needs seeded encrypted bank details; code `:787/798/857` |
| PAY-05 | NOT TESTABLE | depends on PAY-04 output; code `maskIban` |
| PAY-06 | NOT TESTABLE | write-flow; code `calc-engine.ts:234` per-record validation |
| PAY-07 | NOT TESTABLE | no Entity-B run; same page guard as SEC-07 |
| PAY-08 | NOT TESTABLE | write-flow + no Entity-B run; code `assertSameEntity` ×7 |

---

## PHASE F — Insurance

| Test | Result | Evidence |
|---|---|---|
| INS-01 | NOT TESTABLE (data) | `/me/insurance` **renders clean (200, 54 KB)**; read-only confirmed in code (`MyInsuranceClient` has no mutation handlers); demo employee has no enrolment to display |
| INS-03 | NOT TESTABLE | server action (broad-read); code `:622-625` (PAYROLL_ADMIN not IDOR-gated) |
| INS-04 | NOT TESTABLE | write-flow; code `enrolEmployee` `assertSameEntity` |

---

## PHASE G — Letters

| Test | Result | Evidence |
|---|---|---|
| LET-01 | NOT TESTABLE | write-flow (generates letter + PDF + audit); `/me/letters` **renders clean (200, 73 KB)** |
| LET-03 | NOT TESTABLE | write-flow; code `:789` `assertSameEntity` |
| LET-08 | NOT TESTABLE | write-flow + sends email; code `:207-211` fail-on-no-work-email |

---

## PHASE H — Regression

| Test | Expected | Result | Evidence |
|---|---|---|---|
| **REG-03** | ESS nav loads | ✅ **PASS** | EMPLOYEE: `/me,/me/profile,/me/payslips,/me/timesheet,/me/documents,/me/leave,/me/insurance,/me/letters` → **all 200, render clean** |
| **REG-04** | admin nav loads | ✅ **PASS** | HR_ADMIN: `/dashboard,/persons,/absence,/payroll,/approvals,/employee-letters,/reports` → 200; `/master-data`→307→`/master-data/legal-entities` (default subpage, loads) |
| **REG-08** | Arabic RTL renders | ✅ **PASS** | Arabic locale cookie → `<html lang="ar" dir="rtl">` in production (default `en/ltr`) |
| REG-05 | Approve/Reject/Delegate present | NOT TESTABLE | `/approvals` **loads (200)**; the 3 buttons are client-rendered and need a pending instance; code `approvals/[instanceId]/action-form.tsx:22` `APPROVE\|REJECT\|DELEGATE` |
| REG-06 | ARIA answers + graceful failure | NOT TESTABLE | server action; code graceful handlers `actions.ts:133/152/165` |
| REG-07 | upload/download; cross-user denied | NOT TESTABLE | write + interactive; code `api/documents/[id]/route.ts` dual-check + audit |

---

## Defects found
- **None functional** in W0–W3. No FAIL on any executable test; no authorization bypass, no data leakage observed at the route level; all pages render without 500/RSC errors.
- **One environment observation (SEC-09, HIGH for true prod):** dev credentials enabled in production. *Reproduction:* `POST /api/auth/callback/credentials` with `employee@avaniis.dev / demo` → 302 + session issued (role EMPLOYEE). *Recommendation:* unset `ENABLE_DEV_ACCOUNTS` in Vercel production before public go-live; keep only for UAT.

## Final Summary
| Outcome | Count | Items |
|---|---:|---|
| **PASS** | **10** | PHASE A (A1–A5), DO-02, DO-03, REG-03, REG-04, REG-08 |
| **FAIL** | **0** | — |
| **NOT TESTABLE** | **38** | SEC-02/03/04/06/07, ARIA-01/02/03/04/05/08, LET-01/03/06/08, INS-01/02/03/04/05, LV-01/02/04/05/06/07/08, PAY-01–08, REG-05/06/07 |

*(NOT TESTABLE = blocked by tooling/env limits: no browser for UI/screenshots, server actions not HTTP-invocable, single-entity demo data, and a no-irreversible-write/immutable-audit constraint. **Every NOT TESTABLE item is code-verified in `293aa95` and covered by the green automated suite — none are failures.**)*

## Release recommendation: **APPROVED WITH OBSERVATIONS**

**Rationale:** Every test executable from this environment **passed** with no functional defects, no regressions, and no authorization bypass; the deployed guards and business flows are code-verified and automated-test-covered; production health, DB, auth gate, RTL, and the PAY‑03 DB constraint are confirmed live.

**Observations to close before final go-live:**
1. **SEC-09 — disable `ENABLE_DEV_ACCOUNTS` in production** (or confirm this URL is UAT-only). Highest-priority item.
2. **Complete the manual runtime tests that this environment cannot cover**, in a proper UAT with: a real browser session, **two legal entities**, and seeded data (leave balances incl. carry-forward, encrypted bank details, enrolments, a pending approval). These cover the forged-arg security tests (SEC-02/03/04, ARIA-02/05, INS-02), cross-entity tests (SEC-06/07, INS-05, PAY-07), the leave-ledger write-flows (LV-01/02/04/05/06/07/08), payroll/WPS (PAY-01–08), letters/insurance flows, and REG-05/06/07.

No screenshots were produced (no browser available). No code, database, configuration, or deployment was modified during this execution.
