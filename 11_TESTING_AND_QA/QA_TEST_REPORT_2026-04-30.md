# AVANIIS HR System — QA Test Report
**Date:** 2026-04-30  
**Sprint:** Post-Sprint 2 (Design System Complete)  
**Engineer:** QA/Performance Engineer (Claude Sonnet 4.6)  
**Scope:** Performance, Stress, Security, Accessibility, Code Quality

---

## Executive Summary

| Category | Tests Written | Passing | Failing | Status |
|----------|-------------|---------|---------|--------|
| Pre-existing unit/integration | 411 | 409 | **2** | REGRESSION |
| Security static analysis | 14 | 11 | **3** | FINDINGS |
| Auth/session behavioural | 21 | 20 | **1** | FINDING |
| Accessibility (WCAG static) | 17 | 17 | 0 | PASS |
| Performance structural | 12 | 11 | **1** | FINDING |
| Audit immutability (NFR-22) | 21 | 21 | 0 | PASS |
| **TOTAL** | **496** | **489** | **7** | — |

**New tests added this session:** 85 across 5 new test files  
**Overall pass rate:** 489 / 496 = **98.6%**  
**E2E tests (Playwright):** Configured for 6 projects (Chrome, Firefox, WebKit, Edge, Mobile Chrome, Mobile Safari). **Require live dev server + DB to execute.** Cannot run in this environment.

---

## Part 1 — Coverage Report

### Overall Coverage (v8, modules + lib only)

| Metric | Coverage |
|--------|---------|
| Statements | **59.1%** |
| Branches | **69.9%** |
| Functions | **61.1%** |
| Lines | **59.1%** |

### By Module

| Module | Stmts% | Branch% | Funcs% | Notes |
|--------|--------|--------|--------|-------|
| `modules/absence` | 85.3% | 74.3% | 83.3% | Good — uncovered: cancel edge cases, accommodation |
| `modules/core-hr` | 83.7% | 64.8% | 87.5% | Good — uncovered: updatePerson error paths |
| `modules/core-hr/bank-details` | 99.0% | 87.5% | 100% | Excellent |
| `modules/core-hr/dependents` | 100% | 75% | 100% | Excellent |
| `modules/core-hr/documents` | 98.6% | 82.4% | 100% | Excellent |
| `modules/core-hr/employment-actions` | 99.1% | 75% | 100% | Excellent |
| `modules/core-hr/contracts` | 57.8% | 57.5% | 60% | Low — terminate/amend paths |
| `modules/notification` | 88.2% | 70% | 50% | Medium — email delivery untested |
| `modules/config` | 45.6% | 77.5% | 46.7% | Low — workflow/delegation functions |
| `lib/audit` | 100% | 75% | 100% | Excellent |
| `lib/csv` | 100% | 100% | 100% | Excellent |
| `lib/date-utils` | 100% | 100% | 100% | Excellent |
| `lib/leave-rule-resolver` | 91.3% | 83.3% | 100% | Good |
| `lib/config-resolver` | 79.7% | 75% | 33.3% | Low function coverage |
| `lib/jobs/document-expiry-checker` | 86.9% | 71.4% | 75% | Good |
| `lib/jobs/sla-breach-checker` | 75.5% | 43.3% | 50% | Medium + 1 failing test |
| **Zero coverage (stubs/not yet built)** | | | | |
| `modules/aria` | 0% | 0% | 0% | Stub — Sprint 11 |
| `modules/timesheets` | 0% | 0% | 0% | Stub — Sprint 7 |
| `modules/compliance` | 0% | 0% | 0% | No tests |
| `modules/auth` (actions) | 0% | 0% | 0% | Skeleton only |
| `modules/workflow` (actions) | 0% | 0% | 0% | Skeleton — Sprint 9 |
| `lib/auth` | 0% | 0% | 0% | next-auth incompatible with jsdom |
| `lib/blob-storage` | 0% | 0% | 0% | Requires Azure credentials |

---

## Part 2 — Pre-existing Test Failures (2 regressions)

These failures existed before this QA session and are documented here.

### F-01 — SLA Breach Alert Not Created
- **File:** `tests/integration/sla-breach-checker.test.ts:142`
- **Test:** `runSlaBreachCheck — happy path > alerts a breached IN_PROGRESS instance`
- **Error:** `expected +0 to be 1` (alertsCreated returns 0 instead of 1)
- **Root cause:** Logic regression in `lib/jobs/sla-breach-checker.ts` — alert creation path returns 0 even when a breached instance is found
- **NFR impact:** NFR-05 (uptime / SLA monitoring)
- **Severity:** HIGH — SLA breaches silently go unalerted

### F-02 — DELEGATE Step Mock Missing userAccounts
- **File:** `tests/integration/workflow-actions.test.ts:341`
- **Test:** `actOnWorkflowStep — DELEGATE > happy path: writes WORKFLOW.STEP_DELEGATED audit`
- **Error:** `No "userAccounts" export is defined on the "@/drizzle/schema" mock`
- **Root cause:** `userAccounts` table added to schema after S9-03 delegation feature; `vi.mock('@/drizzle/schema')` not updated
- **NFR impact:** Workflow delegation feature (S9-03) is untested
- **Severity:** MEDIUM — test infrastructure gap, not a runtime bug

---

## Part 3 — Security Findings

### SEC-01 — NFR-10 FAIL: No Session Timeout Configured 🔴
- **NFR:** NFR-10 (session timeout: 30 min employee, 15 min admin)
- **Finding:** `lib/auth.ts` — `session: { strategy: 'jwt' }` has no `maxAge`
- **Impact:** Default Auth.js JWT TTL is **30 days**. An idle employee session never expires. An idle HR_ADMIN session never expires.
- **Fix:** Add `maxAge: 1800` (30 min) to `session` config; implement role-based timeout (900s for HR_ADMIN+)
- **Tests:** `tests/security/auth-session.test.ts`, `tests/security/security-static.test.ts`

### SEC-02 — No Content Security Policy Headers 🔴
- **NFR:** Known Gap #11 (docs/KNOWN_GAPS.md)
- **Finding:** `next.config.mjs` has no HTTP security headers configured
- **Impact:** No CSP, no X-Frame-Options, no X-Content-Type-Options, no HSTS
- **Risk:** XSS amplification, clickjacking, MIME-sniffing
- **Fix:** Add `headers()` function to `next.config.mjs` with CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Strict-Transport-Security
- **Tests:** `tests/security/security-static.test.ts`

### SEC-03 — No X-Frame-Options Header 🔴
- **Finding:** Same as SEC-02 — no security headers at all
- **Risk:** Clickjacking attacks on HR forms (salary changes, user creation)

### SEC-04 — NFR-09 PARTIAL: MFA Not Enforced at App Level 🟡
- **NFR:** NFR-09 (MFA mandatory for HR_ADMIN+)
- **Finding:** No app-level MFA enforcement. Relies entirely on Azure AD Conditional Access policies.
- **Dev credentials (NODE_ENV=development):** Have NO MFA — any HR_ADMIN account accessible with password "demo"
- **Positive finding:** Dev credentials correctly gated to `NODE_ENV === 'development'` (not `!== 'production'`), confirmed in QA-Audit-L6
- **Positive finding:** Step-up MFA JWT claim defined in `modules/core-hr/types.ts` (S3-10 scaffold)
- **Status:** Acceptable for production IF Entra ID Conditional Access MFA policy is enforced. App-level step-up deferred to Sprint 11.

### SEC-05 — sql.raw Usage (Low Risk) 🟢
- **File:** `lib/jobs/process-driver.ts:97`
- **Finding:** `sql.raw(ARRAY[${processedIds...}])` — uses raw SQL interpolation
- **Assessment:** `processedIds` is sourced exclusively from `db.select()` results (internal DB row IDs), not from user input. **Low risk.**
- **ESLint security:** 9 `security/detect-object-injection` warnings across 4 files — all are bracket-access patterns with validated keys. No injection risk.

### SEC-06 — RBAC Coverage 🟢
- **Finding:** All 26 live (non-skeleton) server action files call `requireRole()` or `auth()`
- **Exception:** `modules/notification/actions.ts` uses `auth()` pattern (not `requireRole`) — acceptable for notification ownership checks
- **Exception:** `modules/aria/actions.ts` uses `auth()` directly — acceptable, checks session before any DB write

### SEC-07 — Audit Log Immutability 🟢
- **Finding:** DB-level trigger `audit_log_immutable` (migration `0005_qa_audit_audit_immutable.sql`) raises EXCEPTION on any UPDATE or DELETE — hard backstop regardless of app-user privileges
- **Finding:** `lib/audit.ts` is INSERT-only — no UPDATE or DELETE paths exist
- **Finding:** `REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC` in migration 0001 (privilege-level protection)

---

## Part 4 — Performance Findings

### PERF-01 — /api/health Endpoint Missing 🔴
- **NFR:** NFR-02 (API response < 500ms), NFR-05 (99.9% uptime)
- **Finding:** No `app/api/health/route.ts` exists
- **Impact:** Load balancers and monitoring cannot probe liveness. k6 health check will fail. No alerting baseline.
- **Fix:** Create `app/api/health/route.ts` returning `{ status: 'ok', timestamp: Date.now() }`

### PERF-02 — NFR-01/02/04: Cannot Measure Without Live Server 🟡
- **NFR:** NFR-01 (page load < 2s p95), NFR-02 (API < 500ms p95), NFR-04 (500 CCU)
- **Status:** k6 load test script created: `tests/performance/k6-load-test.js`
- **Required action:** Run against staging environment:
  ```
  k6 run tests/performance/k6-load-test.js \
    -e BASE_URL=https://staging.avaniis.dev \
    -e AUTH_COOKIE="next-auth.session-token=<jwt>"
  ```
- **Structural checks PASS:** JWT sessions (stateless, horizontally scalable), singleton DB client, RSC pages, no N+1 patterns detected, no blocking sleeps

### PERF-03 — Potential N+1 Patterns: 0 Detected 🟢
- All server actions use set-based Drizzle queries. No loops calling `db.` found in action files.

### PERF-04 — Images Optimised 🟢
- `next.config.mjs` enables `avif` and `webp` image formats
- All pages use RSC (no full `'use client'` page.tsx outside `/auth/`)

---

## Part 5 — Accessibility Findings (NFR-17: WCAG 2.1 AA)

### A11Y-01 — Static Analysis: PASS (17/17) 🟢
- No `<img>` missing `alt` attributes
- No `<Image>` (next/image) missing `alt` props
- `<html lang={locale}>` set dynamically from locale
- `dir={direction(locale)}` set for RTL — correct Arabic layout switching
- No raw hex colours in `globals.css` (non-variable lines)
- Root layout exports metadata title
- `outline: none` on `.login-field` is safe — paired with `:focus { box-shadow: ... }` replacement

### A11Y-02 — Form Inputs: 26 Potentially Unlabelled 🟡
- 26 `<input>` elements flagged by heuristic regex
- All are multi-line JSX where `aria-label`/`id` attributes are on subsequent lines (regex limitation)
- **Cannot assess definitively without axe-core in a live browser**
- **Required action:** Run `tests/e2e/accessibility.spec.ts` against staging — axe-core will definitively flag true violations

### A11Y-03 — RTL Layout 🟢
- `lib/i18n.ts` defines `direction()`, `isRtl()`, `RTL_LOCALES: ['ar']`
- `app/layout.tsx` applies `dir={direction(locale)}` to `<html>`
- Arabic-specific `dir="rtl"` applied inline to bilingual text fields across settings, absence, workflows, org chart pages

### A11Y-04 — E2E Axe Tests: NOT EXECUTED 🟡
- `tests/e2e/accessibility.spec.ts` written and ready
- Requires live dev server + database
- Covers: Dashboard, Persons, Absence, Workflows, Settings, Sign-in pages

---

## Part 6 — NFR-14: i18n / Bilingual Completeness

### I18N-01 — Full Coverage: PASS 🟢
- English keys: **144** | Arabic keys: **144**
- Missing keys: **0**
- Untranslated fallbacks (AR == EN): **0** (100% genuinely translated)
- Top-level sections match: `app, nav, auth, common, persons, leave, payroll, orgChart, config`

### I18N-02 — RTL Implementation: PASS 🟢
- `dir="rtl"` applied on `<html>` for Arabic locale
- Bilingual fields use inline `dir="rtl" lang="ar"` for Arabic text within LTR pages
- `text-end` CSS class used for RTL text alignment in form layouts
- **Gap (Known Gap #8):** RTL layout not visually QA'd across all pages — needs browser testing

---

## Part 7 — NFR-22: Audit Log Immutability & 7-Year Retention

### AUDIT-01 — PASS (21/21 tests) 🟢

| Check | Result |
|-------|--------|
| `writeAuditLog` only calls `db.insert` | ✓ PASS |
| No UPDATE path in `lib/audit.ts` | ✓ PASS |
| No DELETE path in `lib/audit.ts` | ✓ PASS |
| Transaction executor pattern works | ✓ PASS |
| TenantId stamped on every row | ✓ PASS |
| DB trigger `audit_log_immutable` exists in migration 0005 | ✓ PASS |
| Trigger covers both UPDATE and DELETE | ✓ PASS |
| Trigger raises EXCEPTION (hard block, not warning) | ✓ PASS |
| REVOKE UPDATE,DELETE at SQL-privilege level (migration 0001) | ✓ PASS |
| `AUDIT_LOG_YEARS = 7` in retention-policy.ts | ✓ PASS |
| Employment records: 7 years (UAE Labour Law) | ✓ PASS |
| Payroll records: 7 years (UAE Federal Tax Authority) | ✓ PASS |
| `writeAuditLog` imported in all write-capable action files | ✓ PASS |
| `AUTH.SIGN_IN` audit written on every sign-in | ✓ PASS |

---

## Part 8 — Multi-Browser Configuration (NFR-19)

### BROWSER-01 — Configuration: DONE 🟢
Playwright configured for 6 projects in `playwright.config.ts`:

| Project | Engine | NFR-19 |
|---------|--------|--------|
| `chromium` | Chrome (latest) | ✓ |
| `firefox` | Firefox (latest) | ✓ |
| `webkit` | Safari | ✓ |
| `edge` | Edge (latest) | ✓ |
| `mobile-chrome` | Pixel 5 | responsive |
| `mobile-safari` | iPhone 12 | responsive |

### BROWSER-02 — Execution: BLOCKED 🟡
- Playwright E2E requires `DATABASE_URL` + running dev server
- Cannot execute in current environment (no database service)
- **Required action:** Run `pnpm test:e2e` in staging or local dev environment with seeded DB

---

## Part 9 — New Test Files Created

| File | Tests | Purpose |
|------|-------|---------|
| `tests/security/security-static.test.ts` | 14 | NFR-09, NFR-10, NFR-22, CSP, RBAC, XSS |
| `tests/security/auth-session.test.ts` | 21 | RBAC behavioural, middleware, session config |
| `tests/accessibility/wcag-static.test.ts` | 17 | WCAG 2.1 AA static analysis, NFR-14 i18n |
| `tests/performance/nfr-performance.test.ts` | 12 | NFR-01, NFR-02, NFR-04, NFR-05 structural |
| `tests/lib/audit-immutability.test.ts` | 21 | NFR-22 immutability + retention |
| `tests/e2e/accessibility.spec.ts` | 14 | NFR-17 axe-core + NFR-19 multi-browser |
| `tests/performance/k6-load-test.js` | — | k6 script for NFR-01/02/04 load testing |

---

## Part 10 — NFR Compliance Summary

| NFR | Requirement | Result | Evidence |
|-----|------------|--------|---------|
| NFR-01 | Page load < 2s p95 | 🟡 **UNTESTED** | k6 script ready; needs staging run |
| NFR-02 | API response < 500ms p95 | 🔴 **FAIL** | /api/health missing; k6 untested |
| NFR-04 | 500 concurrent users | 🟡 **UNTESTED** | k6 script ready; structural checks pass |
| NFR-05 | 99.9% uptime | 🟡 **PARTIAL** | Jobs have error handling; no SLA alert (F-01) |
| NFR-09 | MFA mandatory HR_ADMIN+ | 🟡 **PARTIAL** | Azure AD MFA needed; step-up deferred Sprint 11 |
| NFR-10 | Session timeout 30/15 min | 🔴 **FAIL** | No maxAge configured — default 30 days |
| NFR-11 | Data residency UAE | 🟡 **UNTESTED** | Infra/config concern; not testable in code |
| NFR-12 | PDPL compliance | 🟡 **PARTIAL** | Retention policy coded; compliance module 0% coverage |
| NFR-14 | Arabic + English | 🟢 **PASS** | 144/144 keys translated; RTL wired |
| NFR-17 | WCAG 2.1 AA | 🟡 **PARTIAL** | Static checks pass; axe-core needs browser |
| NFR-19 | 4 browsers | 🟡 **UNTESTED** | 6 Playwright projects configured; needs staging |
| NFR-20 | RPO 1 hour | 🟡 **UNTESTED** | Infra/backup concern; not testable in code |
| NFR-21 | RTO 4 hours | 🟡 **UNTESTED** | Infra/backup concern; not testable in code |
| NFR-22 | Audit logs 7yr immutable | 🟢 **PASS** | 21/21 tests pass; DB trigger verified |

---

## Part 11 — Priority Remediation List

### P0 — Must Fix Before Production

| ID | Issue | File | Fix |
|----|-------|------|-----|
| SEC-01 | No session maxAge (30-day default) | `lib/auth.ts:108` | Add `maxAge: 1800` to session config |
| SEC-02/03 | No security headers | `next.config.mjs` | Add CSP, X-Frame-Options, HSTS, X-Content-Type-Options |
| PERF-01 | /api/health endpoint missing | — | Create `app/api/health/route.ts` |
| F-01 | SLA breach checker returns alertsCreated=0 | `lib/jobs/sla-breach-checker.ts` | Fix alert creation logic (regression) |

### P1 — Fix Before Beta

| ID | Issue | Fix |
|----|-------|-----|
| F-02 | DELEGATE test mock missing userAccounts | Add `userAccounts` to `vi.mock('@/drizzle/schema')` in `workflow-actions.test.ts:105` |
| SEC-04 | No app-level MFA enforcement | Sprint 11: enforce step-up claim in `requireRole` for HR_ADMIN+ |
| A11Y-02 | Form label coverage unknown | Run `pnpm test:e2e` against staging with axe-core |
| COV-01 | compliance module: 0% coverage | Write PDPL compliance tests |
| COV-02 | contracts actions: 57.8% | Add terminate/amend edge case tests |

### P2 — Backlog

| ID | Issue |
|----|-------|
| PERF-02 | Run k6 NFR-01/02/04 load tests against staging |
| BROWSER-02 | Run multi-browser Playwright suite against staging |
| COV-03 | aria module: 0% (Sprint 11 scope) |
| COV-04 | timesheets module: 0% (Sprint 7 scope) |
| I18N-02 | Visual RTL QA across all pages |
| SEC-05 | Replace `sql.raw` in process-driver with parameterised `eq(events.id, sql.array(processedIds))` |

---

## Appendix — Test Execution Environment

- **Platform:** macOS Darwin 25.3.0 (ARM64)
- **Node.js:** 20.x
- **pnpm:** 9.4.0
- **Vitest:** 1.6.1
- **@vitest/coverage-v8:** 1.6.1
- **Playwright:** 1.44.0 + browsers installed (Chromium, Firefox, WebKit)
- **Database:** Not available — integration tests use in-memory mocks
- **Test run date:** 2026-04-30 16:19 UTC+4
