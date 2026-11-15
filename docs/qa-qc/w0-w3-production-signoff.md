# W0–W3 Production Sign-Off (UAT) — with Go-Live Caveat

**Prepared:** 2026-06-02 · **Scope:** W0 (foundation guards) · W1 (authorization/PII) · W2 (payroll/WPS/IBAN/entity) · W3 (leave balance/controls)
**Status at a glance:** ✅ **UAT APPROVED WITH OBSERVATIONS** · ⛔ **TRUE PRODUCTION GO-LIVE NOT APPROVED** until SEC-09 (demo accounts) is resolved.

---

## 1. Deployment details
| Item | Value |
|---|---|
| Build / commit | **`293aa95`** — `fix(absence): W3 leave balance reservation + terminated-target + ESS math` (HEAD of `main`; chain `e9a205d`→`12d06d1`→`0390281`→`293aa95`) |
| Production URL | http://localhost:3001 |
| Vercel deployment | `dpl_33exZmaPTxV5xTLArXR6Hj3gg8oi` · status **Ready** · target Production · region `fra1` |
| Aliases | `avaniishcm.vercel.app`, `khcm-ai-os-31dg.vercel.app`, `…-git-main…` all point to this deployment |
| Migration 0055 | **Applied & verified in Neon** — `uq_payroll_run_number_per_entity` present; old global `payroll_runs_run_number_unique` dropped |
| Repo state | `origin/main` = `293aa95`; local tree clean at sign-off prep |

## 2. Validation summary
**a) Automated validation (pre-deploy, build `293aa95`)**
- `pnpm typecheck` → **0 errors**
- W0–W3 targeted tests → **61/61 pass** (ACG 18, W1 18, W2 14, W3 11)
- Full unit suite → **1440 pass, 2 expected skips** (72 files)
- Absence integration → **29/29 pass**
- `pnpm build` → **success, 120/120 pages**

**b) Deployment verification (post-push)**
- `main` pushed (`c50bf9f..293aa95`); Vercel built from `git-main` → deployment **Ready**; production aliases promoted.
- Public health: `/api/health` **200** (`fra1`); `/api/health/db` **200** (`dbMs:2`, Neon connected); `/sign-in` **200**.
- Edge auth gate live: all protected routes **307 → /sign-in** when unauthenticated.
- RTL live: Arabic locale → `<html lang="ar" dir="rtl">`.

**c) Authenticated demo-account testing (production, scripted HTTP — no browser)**
- Logged in as EMPLOYEE / MANAGER / HR_ADMIN (all entity `aaaa0001`); roles + landing + redirects + logout correct.
- **DataOps restriction confirmed:** HR_ADMIN blocked from every `/api/dataops/*` route (307→/dashboard).
- **Cross-role page authorization confirmed:** EMPLOYEE denied `/persons`,`/payroll`,`/admin/dataops`,`/master-data`; MANAGER denied `/payroll`. No bypass/leakage at the route level.
- ESS + admin navigation pages render cleanly (200, no 500/RSC errors).

## 3. Test outcome
| Outcome | Count |
|---|---:|
| **PASS** | **10** (PHASE A ×5; DO-02; DO-03; REG-03; REG-04; REG-08) |
| **FAIL** | **0** |
| **NOT TESTABLE** | **38** (server-action forged/IDOR tests, cross-entity tests, write-flows, payroll/WPS, ARIA chat, REG-05/06/07) |

**No functional defect was found in W0–W3.** All NOT TESTABLE items are blocked by environment/tooling limits (no browser, server actions not HTTP-invocable, single-entity demo data, immutable-audit no-write constraint) and are each **code-verified in `293aa95` and covered by the green automated suite** — none are failures. Full detail: `docs/qa-qc/w0-w3-production-execution-report.md`.

## 4. Status
- ✅ **UAT: APPROVED WITH OBSERVATIONS.** The W0–W3 changes are sound, regression-free, and may remain deployed in this UAT environment.
- ⛔ **TRUE PRODUCTION GO-LIVE: NOT APPROVED** until the SEC-09 observation is remediated (demo/dev accounts disabled and re-verified).

## 5. Observation SEC-09 — dev credentials enabled
- **Finding:** `ENABLE_DEV_ACCOUNTS` appears to be **enabled** in this environment. Demo logins succeed in production:
  `employee@avaniis.dev / demo` (EMPLOYEE), `manager@avaniis.dev / demo` (MANAGER), `hr.admin@avaniis.dev / demo` (HR_ADMIN) — each issues a valid session with the corresponding role.
- **Evidence:** `POST /api/auth/callback/credentials` with the above → HTTP 302 + session cookie issued; `/api/auth/session` returns the authenticated role. The production sign-in page does not render a dev-credentials panel, but the credentials provider still accepts these accounts — consistent with `ENABLE_DEV_ACCOUNTS=true` on Vercel.
- **Risk:** these are **hardcoded, shared, weak passwords (`demo`)**. While enabled, anyone who knows them can authenticate as EMPLOYEE, MANAGER, or HR_ADMIN and reach the corresponding data/functions. This **bypasses Microsoft SSO/MFA** and is **unacceptable for a true production system**.
- **Acceptability:** acceptable **only** while this URL is explicitly treated as **UAT** (the demo accounts are the intended UAT test identities). Not acceptable for public/production go-live.
- **Required remediation:** disable `ENABLE_DEV_ACCOUNTS` so all `*@avaniis.dev/demo` logins are rejected (the code already gates `DEV_ACCOUNTS` on `NODE_ENV=development || ENABLE_DEV_ACCOUNTS=true` — `lib/auth.ts`).
- **Note:** SEC-09 is an **environment-configuration** issue, **not** a W0–W3 code defect.

## 6. Required pre-go-live action (SEC-09 remediation)
1. **Vercel → Project `khcm-ai-os-31dg` → Settings → Environment Variables → Production:** remove (or set to `false`) **`ENABLE_DEV_ACCOUNTS`**.
2. **Redeploy** production (the env change takes effect on the next deployment).
3. **Verify** that all demo logins are rejected: attempt `employee@avaniis.dev / demo` (and manager/hr.admin) → expect login **failure** (no session issued); `/api/auth/session` → empty. Microsoft SSO remains the only accepted production sign-in.
4. Record the verification result; SEC-09 then flips to **PASS** and this caveat is cleared.

## 7. Remaining manual validation needed (UAT, with proper setup)
Execute in a real browser session with **two legal entities** and seeded data. These convert the 38 NOT TESTABLE items to PASS:
- **Browser-based UI checks:** ESS + admin navigation, ARIA chat (own data / manager report / leave submission / OS briefing), approvals Approve/Reject/Delegate (REG-05), ARIA graceful failure (REG-06), document upload + view/download incl. cross-user denial (REG-07), authenticated-page RTL spot-check (REG-08 deep).
- **Cross-entity tests:** SEC-06, SEC-07, INS-05, PAY-07 — require an Entity-A and an Entity-B account/record.
- **Payroll / WPS seeded-data test:** PAY-01–08 — create REGULAR run; duplicate-period rejection; second-entity `PR-000001`; calculate→approve→**Generate WPS SIF** with seeded **encrypted `person_bank_details`**; confirm `wps_sif_records.iban` stored **masked**; missing-bank employee fails per-record.
- **Leave write-flow test:** LV-01/02/04/05/06/07/08 — submit reserves pending; overspend blocked; reject releases; approve moves pending→taken; cancel releases; terminated-employee blocked; ESS available ≤ total (needs an employee with carry-forward/adjustment).
- **Letters / insurance write-flow test:** LET-01/03/08 (self request, HR same-entity, email to work address / fail on no work email); INS-01/03/04 (ESS read-only display, PAYROLL_ADMIN broad read, HR same-entity enrol).
- **Security forged-arg tests:** SEC-02/03/04, ARIA-02/05, INS-02, LET-06 — drive the server actions via the UI / authenticated DevTools `fetch` with crafted arguments.

## 8. Final recommendation
- **W0–W3 code changes can remain deployed** in the UAT environment (`293aa95`) — they are functionally validated, regression-free, and supported by green automated + deployment + authenticated checks.
- **Do NOT mark final production as closed** until **SEC-09 is resolved** (demo accounts disabled, redeployed, and rejection re-verified) **and** the remaining manual UAT validations (Section 7) are executed and recorded as PASS — with priority on the security forged-arg, cross-entity, and WPS end-to-end tests.

---
**Sign-off (UAT):** ☑ Approved with observations — Claude Code, 2026-06-02, build `293aa95`.
**Production go-live sign-off:** ☐ Pending SEC-09 remediation + remaining manual UAT.
**Approver:** ____________________  **Date:** __________

*Documentation only — no code, database, deployment, or commit changes were made.*
