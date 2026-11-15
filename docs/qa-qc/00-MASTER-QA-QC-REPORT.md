# AVANIIS HR — Master QA/QC Report & Enterprise-Grade Open-Points Register

**Product:** AVANIIS HR (Avaniis / Avaniis) · **Environment:** http://localhost:3001 · **Build under review:** `293aa95`
**Prepared by:** Claude Code (Technical QA) · **Date:** 2026-06-02 · **Status of this document:** consolidated master report

> **What this document is.** A single, comprehensive record of the QA/QC engagement: your requirements at each step, what I did and found, what has been fixed and deployed, and — most importantly — the **complete register of open points (gaps) that must be closed to make this an enterprise-grade application.** It supersedes nothing; it ties the detailed artifacts together (see Section 11).

---

## 1. Executive Summary

- A **whole-application QA/QC gap analysis** was run, then **independently re-verified** (every finding re-checked against live source, with a deliberate effort to *disprove* it).
- **115 findings** were assessed → **94 are real** (CONFIRMED/PARTIAL), **15 already-fixed**, **4 false-positive**, **2 need a business decision**.
- Real-defect severity: **3 CRITICAL · 12 HIGH · 39 MEDIUM · 40 LOW**.
- **Waves W0–W3 were implemented, tested, and deployed** to UAT, closing **18 findings** — **all 3 CRITICAL and 7 of 12 HIGH** — with full automated test coverage and zero regressions.
- **76 real findings remain open** (5 HIGH · 33 MEDIUM · 38 LOW), grouped into proposed waves **W4–W7** plus deferred payroll-calc and leave items.
- **Two release gates remain before true production go-live:** (a) **SEC-09** — disable demo accounts; (b) execute the **38-item manual UAT** (forged-arg security, cross-entity, write-flows, payroll/WPS) and record business sign-off.

**Enterprise-grade verdict:** the application is **UAT-ready and materially safer** after W0–W3 (the most dangerous authorization/PII/payroll defects are closed), but it is **not yet enterprise-grade-complete** — the open-points register in Section 7 and the readiness assessment in Section 8 define exactly what remains.

---

## 2. Engagement Timeline — Your Requirements ↔ My Response

| # | Your requirement | My response / deliverable |
|---|---|---|
| 1 | "Identify any gaps — missing validation, broken edge cases, UI inconsistencies" (whole app, phased) | 3-phase parallel gap analysis across all modules → surfaced findings across Core-HR, transactional engines, and cross-cutting/security |
| 2 | "Reality-check the findings — prove which are real before accepting" | 9 parallel skeptical verifiers + synthesis (workflow `wf_7da152c6`); produced the verified findings report with classifications + dependency-safe fix waves |
| 3 | "Start verified fixes safely" — approved W0→W3, stop after W3 | Implemented W0 (guards), W1 (authorization/PII), W2 (payroll/WPS/IBAN/entity), W3 (leave) with targeted tests; committed each wave |
| 4 | "Deployment readiness verification" | Confirmed clean tree, commits, migration 0055 staged, full validation suite, no blockers |
| 5 | "Deploy and verify production" | Pushed `main`, verified Vercel deployment Ready, aliases promoted, health/DB live |
| 6 | "Apply + verify migration 0055" | You applied it in Neon; verified `uq_payroll_run_number_per_entity` present, global unique dropped |
| 7 | "Create production smoke-test checklist" | `w0-w3-production-smoke-checklist.md` |
| 8 | Priority-1, Priority-2, and Final-Regression validation | Code + safe-probe verification; classified each test; recorded results |
| 9 | "Authenticated production validation with demo accounts" | Logged in via demo accounts (read-only); 10 PASS, 0 FAIL, 38 NOT TESTABLE; **discovered SEC-09** |
| 10 | UAT sign-off, business handover, manual UAT script | `w0-w3-production-signoff.md`, `w0-w3-business-uat-handover.md`, `w0-w3-manual-uat-script.md` |
| 11 | **"Comprehensive QA/QC report with gaps/open points to close for enterprise-grade"** | **This document** |

---

## 3. Scope & Method

- **Coverage:** every major module — Core-HR (persons, departments, positions, org chart, assignments, schedules, MDM), Absence/Leave, Payroll/WPS/EOSB/GPSSA/DEWS, Timesheets, Workflow/Approvals, Auth/RBAC, DataOps, Documents/Storage, ARIA, Notifications, Employee Letters, Insurance, Compliance, Reports, ESS.
- **Verification rigour:** each finding was re-checked against the deployed source with file:line evidence; verifiers were instructed to refute. This flipped several original findings (e.g. "insurance doesn't end at notice period" → FALSE_POSITIVE; "divergent person-update hole" → dead code; calendar-day leave → business decision).
- **Validation tiers executed:** automated (typecheck/unit/integration/build) → deployment verification → public probes → authenticated read-only (demo accounts). Browser-driven UI, cross-entity, write-flow, and forged-payload tests are deferred to manual UAT (no browser/2nd entity/seed data available to the agent).

---

## 4. Findings Ledger (verified)

| Classification | Count |
|---|---:|
| CONFIRMED_REAL | 79 |
| PARTIALLY_REAL | 15 |
| ALREADY_FIXED (prior fixes still holding) | 15 |
| FALSE_POSITIVE | 4 |
| NEEDS_BUSINESS_DECISION | 2 |
| **Total assessed** | **115** |

**Real defects (94) by severity:** 3 CRITICAL · 12 HIGH · 39 MEDIUM · 40 LOW.
**Closed in W0–W3 (18):** 3 CRITICAL · 7 HIGH · 5 MEDIUM · 3 LOW.
**Open (76):** **5 HIGH · 33 MEDIUM · 38 LOW** (+ 2 business decisions).

Full per-finding evidence: `docs/qa-qc/findings-reality-check-2026-06-02.md`.

---

## 5. What Was Delivered & Closed (W0–W3)

| Wave | Commit | Findings closed |
|---|---|---|
| **W0 Foundation** | `e9a205d` | Shared guards: `deriveActorIdentity`, `assertSameEntity`, `assertSelfOrTeam`, `assertActivePersonTarget` (+18 unit tests) |
| **W1 Authorization + PII** | `12d06d1` | P3-A1, P3-A2, P3-A3, P3-A4, P3-A5, P3-A6, P3-A7, P3-D1, P3-L-BRIEFING-NOGATE, P3-M-FALLBACK-EMAIL (10) |
| **W2 Payroll/WPS/IBAN/entity** | `0390281` | P2-P1, P2-P2, P2-P3, P2-P4, P2-P5 (5) + migration 0055 |
| **W3 Leave** | `293aa95` | P2-L1, P2-L3, P2-L4 (3) |

**Quality gates met every wave:** 0 TS errors · 61 targeted + 1440 unit + 29 integration tests pass · build 120 pages · committed only after validation.

---

## 6. Production Deployment & Validation Status

- **Deployed:** `293aa95` live on `avaniishcm.vercel.app` (Vercel `dpl_33exZmaPTxV5xTLArXR6Hj3gg8oi`, Ready, fra1). **Migration 0055 applied & verified** in Neon.
- **Live checks PASS:** health 200, DB 200, edge auth-gate (307→sign-in), RTL (ar→dir=rtl), role-based landing/redirects, **cross-role denial** (EMPLOYEE/MANAGER blocked from HR/admin/payroll), **DataOps restricted** to SUPER_ADMIN.
- **Authenticated demo-account result:** 10 PASS · 0 FAIL · 38 NOT TESTABLE (tooling/data limits). No functional defect found.

---

## 7. 🔴 OPEN-POINTS REGISTER — Gaps to Close for Enterprise-Grade

> This is the actionable heart of the report. Each item is a verified real defect (or decision) that remains **open**. Full evidence per ID is in the reality-check report. Recommended grouping = the dependency-safe waves W4–W7 + deferred items.

### 7.0 Release gate (configuration, not code) — **must close before real go-live**
| ID | Sev | Gap | Action to close |
|---|---|---|---|
| **SEC-09** | HIGH (prod) | Demo accounts (`*@avaniis.dev/demo`) enabled in the environment (`ENABLE_DEV_ACCOUNTS=true`) — bypasses SSO/MFA | Unset `ENABLE_DEV_ACCOUNTS` in Vercel Production → redeploy → verify demo logins rejected |

### 7.1 Open HIGH (5) — fix first
| ID | Gap | Closing fix |
|---|---|---|
| **P2-T3** | No self-approval guard — submitter can be their own approver | Exclude initiator from approval chain; assert actor ≠ initiator in `takeWorkflowAction` |
| **P2-T5** | `createManualAttendance`/`approveManualAttendance` have no entity scoping; `attendance_records` has no `legal_entity_id` | Add entity column + scope guard (schema + action) |
| **P1-H7** | `assignWorkSchedule` trusts caller-supplied `legalEntityId`/`workScheduleId` (no validation) | Validate schedule belongs to the person's entity; reuse `assertSameEntity` |
| **P3-D2** | `feature_permissions` matrix never enforced at runtime (no resolver) | Build `requirePermission(feature,action)` resolver and wire gates — or formally mark the matrix advisory and correct the docs |
| **P3-D3** | DataOps writes bypass PII encryption, effective-date, and the main audit log; hard-DELETE HR rows | Restrict DataOps writes on PII tables; route through encryption/effective-date or block; mirror to main audit |

### 7.2 Open MEDIUM (33) — grouped by theme
**Workflow / Timesheet / Attendance (W4)**
`P2-T1` timesheet hours bounds / overtime numeric overflow · `P2-T2` workflow can activate with zero/unresolvable approvers · `P2-T4` terminated manager can be an approver · `P2-M(getPersonSchedule null)` defaults 8h + weekend/holiday mis-scored · `P2-M(attendance dup)` no unique (person,date) → duplicate rows · `P2-M(delegate self/cycle)` self/multi-hop delegation not blocked · `P2-L(delegate raw text)` delegate target is free-text id/email.

**MDM / Org / Schedule (W5)**
`P1-H5` department parent cycle not prevented · `P1-H6` `createPosition` no transaction + no cycle check · `P1-H8a` no `scheduleCode` uniqueness · `P1-H8b` no single-`isDefault` schedule guard · `P1-H9` schedule sync silently no-ops without current assignment · `P1-M(multi-isCurrent)` no guard on single current schedule row · `P1-M(WS MDM tx)` work-schedule CRUD not transactional · `P1-M(hiring/transfer scope)` requests not entity/existence validated · `P1-M(transfer user.id)` vacant-position transfer mis-keys `personId` · `P1-L(position)` `updatePerson` silently drops position/dept/grade/location edits · `P1-L(status)` edit form offers non-enum `INACTIVE` status · `P1-L(disable/enable/correct audit)` bare write+audit outside tx.

**Persons / Data integrity (W5/W7)**
`P1-H2` `getPerson` unguarded on edit page (can crash render) · `P1-H4` no uniqueness on Emirates ID / passport / employee code.

**Payroll calculation correctness (deferred from W2 — needs finance sign-off)**
`P2-M-DEWS-GPSSA-YTD` DEWS/GPSSA never persisted, YTD = current period only · `P2-M-PRORATION` no mid-period proration · `P2-M-EOSB-UNPAID` EOSB ignores unpaid leave · `P2-M-MEDICAL` medical deduction /12 hardcoded + dead employer-cost ternary.

**Leave (deferred from W3)**
`P2-M-cross-year` Dec→Jan leave debits only the start-year balance.

**Documents / DataOps / Insurance rules (W6)**
`P3-M(MIME)` client-declared MIME only, no `nosniff` → stored-XSS vector · `P3-M(SQL-validator)` blocklist-based SQL validator bypassable · `P3-M-DOWNLOAD-SCOPE` HR letter download not entity-scoped · `P3-H3` employee-level premium override unimplemented (business rule) · `P3-H4` auto-plan-change-on-promotion unwired (business rule) · `P3-M-contractor-bypass` contractor exclusion bypassable via explicit planId · `P3-M-dependent-double-enrol` no per-dependent duplicate guard.

### 7.3 Open LOW (38) — grouped by theme
**Bilingual / UI consistency (W7):** `P2-L(approval bilingual)`, `P2-L-ESS-bilingual`, `P3-L(document-bilingual)`, `P3-L-LETTER-BILINGUAL`, `P3-L-insurance-bilingual`, `P1-L(org-chart EN)`, `P2-L(resourceLabel)`, `P2-L(BR-29 delegate)` (Delegate hidden by default), `P2-L-ERRORS` (raw errors / English status labels).
**Validation / dead state (W5/W7):** `P1-M(dates)` DOB/visa/passport sanity, `P1-L(self-mgr)` self/cycle manager, `P1-M(assignmentReason)` free-text-as-enum, `P1-M(scheduleNameAr)` nullable Arabic, `P2-L-RECALLED` dead status, `P2-M(exception validation)`, `P2-M(SLA deadline)` no min-bound.
**Schedule/org integrity (W5):** `P1-H1` orphaned `work_schedule_id`, `P1-H10` schedule-source badge mislabel, `P1-M(head revalidate)`, `P1-M(getDepartmentHead)` active/tenant filter, `P1-M(org-tree cycle)`, `P1-M(FK SQL-only)`, `P1-L(correctWS)`, `P1-L(revalidatePath)`.
**Payroll/leave low (deferred):** `P2-M-NET-FLOOR` hides negative net, `P2-M-EOSB-PROVISION` formula non-standard, `P2-L-CURRENCY` AED hardcoded, `P2-L-NO-WPS-DOWNLOAD` no SIF file export, `P2-M-resubmit` rejected re-submit no re-check, `P2-M-decide-double-tx` idempotent double-write.
**Cross-cutting (W6):** `P3-M-OUTBOX-DUP` notification duplicate dispatch, `P3-M-LETTERNUM-RACE` letter-number race, `P3-M-backdate-grace-hardcoded`, `P3-M-profile-audit-bug`, `P3-M(idle-timeout)` no 15-min idle, `P3-L-ARIA-STREAM` mid-stream errors, `storage-local-in-prod` local storage allowed in prod, `COMPLIANCE-ENGINE` no runtime BR-xx evaluation engine (only editor).

### 7.4 Business decisions required (2) — block correctness sign-off, not code
| ID | Decision needed |
|---|---|
| **P2-L2** | Is annual-leave duration **calendar-day** (current `BR-AL-002`) or **working-day** (exclude weekends/holidays)? |
| **P2-M-GCC-EOSB** | Are **GCC nationals** excluded from expat EOSB and treated under GPSSA/home-country pension? |

### 7.5 Manual UAT runtime confirmation (38 tests) — open until executed
The deployed W0–W3 guards are code-verified but **not runtime-confirmed in production** for the forged-argument security tests, cross-entity tests, leave write-flows, payroll/WPS end-to-end, and letters/insurance flows. Execute `docs/qa-qc/w0-w3-manual-uat-script.md` (needs a browser, two legal entities, and seeded data).

---

## 8. Enterprise-Grade Readiness Assessment

| Dimension | Status after W0–W3 | Gap to enterprise-grade |
|---|---|---|
| **AuthN / session** | SSO + MFA-by-CA; absolute 30-min timeout | SEC-09 (disable demo accounts); `P3-M(idle-timeout)` 15-min idle not implemented |
| **AuthZ (RBAC)** | requireRole + re-derived identity + self/team/entity guards (W0/W1) | `P3-D2` feature_permissions not enforced; `P2-T3` self-approval; `P2-T5`/`P1-H7` remaining scope gaps |
| **Data privacy / PII** | IBAN sourced from encrypted master + masked; IDOR closed on key reads | `P3-D3` DataOps PII-write bypass; `P3-M(MIME)` stored-XSS; `P1-H4` no PII uniqueness |
| **Payroll correctness / compliance** | WPS functional, entity-isolated, no duplicate runs | Calc set (DEWS/GPSSA/YTD, proration, EOSB unpaid, medical), currency, SIF download, EOSB provision — need finance sign-off |
| **Leave integrity** | Reserve/release/deduct ledger now consistent; terminated-target blocked | `P2-M-cross-year`; calendar-vs-working-day decision (`P2-L2`) |
| **Data integrity (DB)** | Per-entity run-number uniqueness (0055) | Uniqueness/cycle/transactional-audit gaps in MDM/org/schedule (W5); attendance dedup; letter-number race |
| **Concurrency** | Advisory locks on leave + payroll run number | Outbox dedup, multi-isCurrent guard, delegation cycles |
| **Observability / audit** | INSERT-only audit on writes | DataOps writes bypass main audit (`P3-D3`); compliance-engine evaluation absent |
| **Internationalisation** | Core bilingual + RTL live | Several English-only surfaces (letters/insurance/approvals/ESS leave) — W7 |
| **Testing** | Strong unit/integration; W0–W3 covered | Manual UAT (38) outstanding; E2E for new guards recommended |
| **Ops / config** | Vercel + Neon, migration discipline | Demo accounts in prod; storage-local-in-prod guard; blob storage end-to-end still a production blocker |

---

## 9. Recommended Roadmap to Enterprise-Grade

1. **Release gate (now):** close **SEC-09**; execute the **38-item manual UAT**; record business sign-off. → clears UAT/go-live for the W0–W3 scope.
2. **Decisions:** resolve **P2-L2** and **P2-M-GCC-EOSB** with HR/Finance so payroll & leave correctness items can be specified.
3. **W4 — Workflow/Timesheet/Attendance integrity** (2 HIGH + mediums): self-approval guard, attendance entity-scope, timesheet bounds, workflow-activation validation, terminated-approver filter, delegation cycles.
4. **W5 — MDM/Org/Schedule integrity** (1 HIGH + mediums/lows): `assignWorkSchedule` validation, schedule uniqueness/single-default, position-create transaction+cycle, department parent cycle, PII uniqueness, `getPerson` edit-page guard, transactional audit across disable/enable/correct.
5. **W6 — Documents/Storage/DataOps/Insurance-rules** (2 HIGH + mediums): `feature_permissions` enforcement, DataOps write governance, MIME/nosniff, SQL-validator hardening, insurance business rules (premium override, auto-plan, contractor bypass, dependent dup), outbox dedup, idle-timeout, storage-prod guard.
6. **W2/W3 deferred correctness** (with finance sign-off): DEWS/GPSSA/YTD, proration, EOSB unpaid, medical, currency, net-floor, SIF download; cross-year leave.
7. **W7 — UI/bilingual/consistency cleanup** (lows): bilingual completion, validation polish, dead-state/label cleanups, ARIA streaming error frame.
8. **Cross-cutting:** add E2E coverage for the new authorization guards; resolve the standing production blocker (blob storage end-to-end) noted in project memory.

Each wave should follow the same discipline used in W0–W3: dependency-safe grouping, targeted automated tests, typecheck+build, commit-after-validation, and a manual UAT pass for the runtime/security items.

---

## 10. Risk Posture Snapshot

- **Materially reduced:** the 3 CRITICAL and the most dangerous HIGH authorization/PII/payroll defects are **closed and deployed**.
- **Residual HIGH risk (open):** self-approval (`P2-T3`), attendance entity-scope (`P2-T5`), schedule entity-trust (`P1-H7`), unenforced permission matrix (`P3-D2`), DataOps PII-write bypass (`P3-D3`) — none reachable by a normal employee through the UI, but they are real and should be scheduled next (W4/W5/W6).
- **Highest *operational* risk right now:** **SEC-09** (demo accounts) for any non-UAT exposure.

---

## 11. Artifact Index (all under `docs/qa-qc/`)
| File | Purpose |
|---|---|
| `00-MASTER-QA-QC-REPORT.md` | **This document** — master report + open-points register |
| `findings-reality-check-2026-06-02.md` | Verified findings (per-ID evidence) + dependency-safe fix waves |
| `w0-w3-production-smoke-checklist.md` | Full smoke checklist (all roles) |
| `w0-w3-production-execution-report.md` | Authenticated demo-account execution results (10 PASS / 38 NOT TESTABLE) |
| `w0-w3-production-signoff.md` | UAT sign-off + SEC-09 + production go-live caveat |
| `w0-w3-business-uat-handover.md` | Business-user UAT handover package |
| `w0-w3-manual-uat-script.md` | Step-by-step manual script for the 38 remaining tests |

**Git note:** the W0–W3 code is committed (`e9a205d`→`293aa95`, on `origin/main`). The `docs/qa-qc/` artifacts (except the reality-check report, which shipped with W0) are currently **untracked** — request a commit when you want them versioned.

---

## 12. Sign-Off

| Role | Name | Decision | Date |
|---|---|---|---|
| Technical QA (prepared) | Claude Code | W0–W3 delivered; 76 findings open; roadmap above | 2026-06-02 |
| Engineering lead | | | |
| HR | | | |
| Payroll / Finance | | | |
| Security / IT | | | |
| Management | | | |

**Overall program status:** ☐ Enterprise-grade accepted · ☐ Accepted for UAT with open-points roadmap · ☐ Not accepted

*This report is documentation only — no code, database, or deployment changes were made in producing it.*
