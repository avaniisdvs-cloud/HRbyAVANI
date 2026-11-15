# 19 — EFFECTIVE-DATING / DATE-TRACKING DISCOVERY AUDIT

> **Audit date:** 2026-06-06
> **Mode:** DISCOVERY ONLY — no code/schema/migration was changed (code freeze in effect).
> **Benchmark:** Oracle Fusion HCM DateTrack / SAP SuccessFactors Employee Central (see companion doc `20-ORACLE-FUSION-DATETRACK-REFERENCE.md`).
> **Method:** Read-only inspection of schema, migrations, services, queries, API routes, UI pages, cron/jobs, and tests. Every claim below carries a `file:line` citation verified against the codebase at audit time.

---

## 0. HOW CODEX SHOULD USE THIS DOC

This is the authoritative handoff for any remediation of effective-dating across **Core HR, Payroll, Leave, Workflow, Reporting**. Load order for a remediation session:
1. This file (`19`) — findings + risk register.
2. `20-ORACLE-FUSION-DATETRACK-REFERENCE.md` — the target architecture.
3. `04-DATABASE-MODEL.md` + `drizzle/schema/foundation.ts` — current schema.
4. `11-DO-NOT-BREAK-RULES.md` — invariants you must not violate.

**Do NOT start fixing without Product Owner answers to §20 below.** The architecture decision (auto-activation? retro payroll? as-of reporting?) changes the entire remediation scope.

---

## 1. ONE-PARAGRAPH VERDICT

Avaniis has a **genuine close-and-open effective-dating engine for `worker_assignments` and `salary_elements`** that runs in production (transfer/promotion/grade/salary changes). This is well above audit-log-only. BUT it is incomplete across the four required layers (Schema / Write / Read / Integrity): **future-dated rows never auto-activate**, **backdated corrections overwrite instead of splitting history**, **no screen/API/report supports as-of-date** (the `effectiveOn()` helper is dead code), **payroll has no retro and no mid-period proration**, **leave balances are a single mutable row**, and **the database enforces none of the timeline invariants** (no overlap/one-current/date-order constraints).

**Final verdict: NOT ENTERPRISE READY UNTIL FIXED.** Safe today only with operational restrictions (no future-dating reliance, no backdated corrections, manual payroll review on mid-period changes, no trusted historical reporting).

**Readiness scores:** Data model 68 · Service logic 55 · Reporting 30 · Payroll 35 · **Overall 45 / 100.**
**Architecture maturity:** Level 4 data model / functionally Level 3 (out of 5).

---

## 2. WHAT EXISTS AND WORKS (evidence)

| Capability | Evidence |
|---|---|
| Close+open on assignments (UPDATE/CORRECTION/FUTURE_DATED modes, effectiveSequence, correctsRowId) | `modules/core-hr/worker-assignments/services.ts:292-593`; schema `drizzle/schema/foundation.ts:715-773`; migration `0031_action_mode_effective_sequence.sql` |
| Close+open on salary | `modules/payroll/actions.ts:1008-1064`; schema `foundation.ts:1176-1208` |
| Close+open on payroll/work-schedule/leave-plan enrolments | `modules/payroll/payroll-assignment-actions.ts:43-100`; migration `0035_priority_d_enrollment_history.sql` |
| Payroll selects salary by **pay-period** date window | `modules/payroll/actions.ts:350-362` |
| Leave eligibility tier + rule set resolved **as-of leave start date** | `lib/leave-rule-resolver.ts:236-289`; `modules/absence/services.ts:210` |
| Employment-action before/after snapshots + approval trail | `foundation.ts:775-814` (`employment_actions`) |
| Immutable audit trail (separate from date-tracking) | `lib/audit.ts`; migration `0005_sprint5...audit_immutable` |
| Person/assignment full history shown in UI | `app/(hr-admin)/persons/[id]/page.tsx:142-147` (no `isCurrent` filter) |
| MDM history WRITE logic live | `lib/mdm-history.ts:43-287` (grade/dept/location/job/position) |

---

## 3. GAPS / DANGEROUS AREAS (the remediation backlog)

### P0 — can corrupt history, payroll, hierarchy, or future-dated state
1. **Future-dated activation MISSING.** `services.ts:409` comment claims "a nightly cron job promotes the future row" — **no such job exists.** `vercel.json` crons = `workflow-sla`, `email-dispatch` only. `lib/jobs/future-dated-validator.ts:46-202` only **detects** conflicts; it never flips `isCurrent` or closes the current row. **Consequence:** a FUTURE_DATED row stays `isCurrent=false` forever, and on its effective date a date-range read sees **two open rows** (old row was never closed → `effectiveEndDate=null` on both).
2. **No DB integrity constraints.** No `EXCLUDE USING gist (… daterange …)`, no partial-UNIQUE on `WHERE is_current=true`, no `(person_id, effective_start_date)` uniqueness, no `effective_end >= effective_start` CHECK (except `contracts` term-max, migration `0003:41-43`). Partial indexes `WHERE is_current=true` exist for lookup only (`migration 0035:96-106`) and are **non-unique**. All invariants live solely in app code → a bug, bulk import (`modules/core-hr/bulk-import/import-engine.ts`), or manual SQL can corrupt the timeline with no backstop.
3. **Retro payroll MISSING.** `modules/payroll/actions.ts:429` → `retroPay:'0'` hard-coded. No recalc of closed periods.
4. **Mid-period proration MISSING.** `modules/payroll/actions.ts:373` uses `.find()` → first matching salary slice only; no day-weighting across two slices in one period.
5. **CORRECTION mode does not split periods.** `services.ts:308-404` updates the current row in place (before/after captured in audit only); a backdated correction effective inside a closed period does not re-segment history.
6. **Manager resolved as current, not as-of.** `lib/workflow-hierarchy.ts:50-98` (`loadPerson`) filters `isCurrent=true` only; `modules/absence/actions.ts:793-801` same. Dated transactions route to the wrong manager.

### P1 — wrong reports / approvals / period values
7. **EOSB uses today + current salary.** `modules/payroll/calculation-engine.ts:98-104`; `modules/payroll/queries.ts:521-566` read `persons.basicSalary` + `new Date()`.
8. **`absence_balances` single mutable row** (`foundation.ts:916-936`) — year-scoped, no `effective_start/end`; cannot reconstruct balance at approval time after later adjustment (partial mitigation: `absence_entries.balanceBefore/After` snapshot, `modules/absence/actions.ts:746-758`).
9. **No as-of read anywhere.** `lib/effective-date.ts` exports `effectiveOn()` + `effectiveOnLatestOrder()` with **ZERO usages** in `modules/` or `app/`. No UI date-picker, no API/report as-of parameter.
10. **Historical-name resolution bug.** Historical assignment rows join to **current** master tables → a renamed department shows its new name on old records. `modules/profile/actions.ts:160-174`.
11. **Leave gender/active checks use today**, not leave-date. `modules/absence/actions.ts:296,139`.
12. **Org chart current-only.** `lib/jobs/org-chart-snapshot.ts:28-36`; `app/(hr-admin)/org-chart/page.tsx` — `org_hierarchy_snapshots` is a current cache, no as-of reconstruction.
13. **`persons` core attributes overwritten** (status, separationDate, denormalized `basicSalary`) — history only in `audit_log`. `foundation.ts:155-310`.

### P2 — data exists but not exposed
14. **MDM history tables written but NEVER read.** `lib/mdm-history.ts` writes them; **0 reads** anywhere. Dormant.
15. **`leave_plan_enrolments` effective dating unused** in balance lookups (`leave-plan-enrolment-actions.ts` writes it; `modules/absence/actions.ts` doesn't join it).
16. **Stale comments** mislead: `app/(hr-admin)/pending-changes/actions.ts:223` says salary uses `FUTURE_DATED`, but `payroll/actions.ts:1036` writes `actionMode:'UPDATE'`.

---

## 4. SCENARIO BEHAVIOR (current system, evidence-based)

| Scenario | Current behavior |
|---|---|
| **Future manager change (Mgr B eff 01-Aug-2026)** | FUTURE_DATED row created `isCurrent=false` (`services.ts:410-494`); old row **not** closed; **no activation** → on 01-Aug both rows open; UI/approval/org-chart still show Mgr A (all read `isCurrent`). **Risk of two active rows: YES.** |
| **Future salary (12,000 eff 01-Aug-2026)** | Entered `mode:'UPDATE'` future start (`payroll/actions.ts:1008-1045`). Payroll reads by period (`actions.ts:350-362`) so pre-Aug uses 10,000 and post-Aug uses 12,000 **correctly** — but no cron activates, current row not auto-closed → risk of overlapping open salary slices. |
| **Backdated dept transfer (Dept B from April, entered July)** | If via CORRECTION: in-place overwrite, **no split** of Jan–Mar / Apr–Jun. If via UPDATE: only splits at entry date, not April. Historical Jan–Mar correctness **not guaranteed**. |
| **Backdated salary correction (11,000 eff April, entered June)** | Close+insert possible, but **no retro recalc** of April/May payroll (`retroPay:'0'`). Audit captures change; arrears not computed. |
| **Same-day dept + manager change** | `effectiveSequence` column exists (`foundation.ts:767`) but write path doesn't set >1; **no DB enforcement** of one-latest-row-per-day; reports could duplicate. No test coverage. |

---

## 5. DB INTEGRITY MATRIX (summary)

| Table | ES/EE | End conv. | Overlap constraint | One-current constraint | Date-order CHECK | Status |
|---|---|---|---|---|---|---|
| worker_assignments | Y/Y | NULL | ❌ | ❌ (non-unique partial idx) | ❌ | 🔴 P0 |
| salary_elements | Y/Y | NULL | ❌ | ❌ | ❌ | 🔴 P0 |
| payroll_assignments | Y/Y | NULL | ❌ | ❌ | ❌ | 🔴 P0 |
| work_schedule_assignments | Y/Y | NULL | ❌ | ❌ | ❌ | 🔴 P0 |
| leave_plan_enrolments | Y/Y | NULL | ❌ | ❌ | ❌ | 🔴 P0 |
| contracts | Y/Y | mandatory end | ❌ | ❌ | ✅ term-max only (`0003:41-43`) | 🟡 P1 |
| absence_balances | year-scoped | — | – | ✅ natural-key unique (`0006:60-61`) | ✅ non-neg (`0058`) | 🟢 but not date-tracked |
| grade/dept/location/job/position_history | validFrom/validTo | NULL | append-only | – | ❌ no `validTo>=validFrom` | 🟢 low (but dormant reads) |

No `daterange`/`tstzrange`/`EXCLUDE` anywhere. No sentinel date (`4712-12-31`); all open ends = `NULL`.

---

## 6. TEST COVERAGE

**Present:** UPDATE close+open (`tests/unit/transfer-apply-outcome.test.ts:72,88`; `tests/integration/employment-actions.test.ts:240,326,362,385`); leave overlap + balance lifecycle (`tests/unit/absence-services.test.ts:165-178`; `tests/integration/leave-cycle.test.ts:425-929`); payroll-run overlap (`tests/unit/w2-payroll-wps.test.ts:110-124`); date utils (`tests/lib/effective-date.test.ts:67-88`).

**MISSING (no tests):** CORRECTION mode · FUTURE_DATED mode + activation · effectiveSequence/same-day · salary_elements effective dating + period-historical salary · duplicate-current-row prevention on worker_assignments · as-of/point-in-time queries · retro payroll + proration · leave balance effective dating. `salary_elements` appears in **0** effective-dating tests. Overall temporal coverage ≈ **25–35%**.

---

## 7. REMEDIATION BACKLOG (categories only — NOT a fix plan; awaiting PO sign-off)

| # | Category | Targets |
|---|---|---|
| R1 | Future-dated activation job (close current + flip future on effective date) | new job; `services.ts`; `vercel.json` |
| R2 | DB integrity constraints (partial-unique on is_current, EXCLUDE gist daterange, date-order CHECK) | new migration (next slot **0062+**, verify folder) |
| R3 | Retro payroll engine + mid-period proration | `modules/payroll/actions.ts`, `calculation-engine.ts` |
| R4 | As-of EOSB (period-historical salary + as-of date) | `calculation-engine.ts`, `queries.ts` |
| R5 | Retro period-splitting for CORRECTION | `services.ts:308-404` |
| R6 | As-of manager resolution | `lib/workflow-hierarchy.ts`, `modules/absence/actions.ts` |
| R7 | Date-tracked absence balance ledger | `foundation.ts:916-936` + migration |
| R8 | As-of read/query layer (wire `effectiveOn`) + UI date picker + point-in-time master joins | `lib/effective-date.ts`, persons page, reports, `modules/profile/actions.ts:160-174` |
| R9 | Wire MDM history reads (or remove) | `lib/mdm-history.ts` consumers |
| R10 | Temporal test suite | `tests/` |

**Migration safety reminder:** journal covers 0000–0039; 0040–0054 are manual SQL; WIP `_wip_` migrations (0055–0061) NOT applied to Neon. Apply+verify any new constraint migration in Test first. DB write guard `guard-db-write.js` blocks writes against Neon.

---

## 8. QUESTIONS FOR PRODUCT OWNER (blockers before remediation)

1. **Future-dating:** Is operational auto-activation required for go-live, or will HR enter changes on/after the effective date?
2. **Retro payroll:** Must the system compute arrears for closed periods, or is retro handled manually/off-cycle? (UAE WPS implications.)
3. **As-of reporting:** Is arbitrary-date reconstruction (assignment/manager/salary/org chart on any past date) a required product capability, or is the per-person history list sufficient?
4. **Manager-as-of:** For approvals on dated transactions, route to manager as of effective date, request date, or today?
5. **Person-level history:** Must status/salary at-a-date be reproducible from a date-tracked structure, or is the audit log acceptable as the legal record?
6. **Master-data history:** Should renamed departments/jobs show their historical name on past records (requires reading `*_history`), or is current-name display acceptable?

---

## 9. CLOSURE RECORD — Remediation status as of 2026-06-12

Remediation developed on the historical branch `feat/effective-dating-phase-1` (Phases 1, 2A–2D), now in the **certified baseline `main @ f5246642c8eee54d35d3cb09ba4e6f3e5abf8c0a`** (merged 2026-06-12). Design + evidence: `docs/effective-dating/00-EFFECTIVE-DATING-IMPLEMENTATION.md`. Phase 2D-3 certified PASS 11/11 (`docs/effective-dating/ed-2d-3-future-bounded-retro-split.md`). 83/83 effective-dating unit tests green (2026-06-12). Independent revalidation score: **72/100** (up from 45/100).

| Gap | Status | Evidence |
|---|---|---|
| P0-1 Future-dated activation missing | **CLOSED** | `lib/jobs/future-dated-activation.ts` + cron (`398ae2e`); runbook `docs/effective-dating/RUNBOOK-future-dated-activation.md` |
| P0-2 No DB integrity constraints | **CLOSED** | Migrations 0063 + 0064 (`a34b3bd`, `236036f`) — applied + verified live in DEV/UAT Neon 2026-06-12 (`docs/effective-dating/01-ED-CLOSURE-VERIFICATION-2026-06-12.md`); future isolated Production Environment ledger: pending (see Definitions, `environment-governance.md`) |
| P0-3 CORRECTION overwrites history | **CLOSED** | Retro split `retroSplitAssignmentTx` (`d4a986f`); CORRECTION restricted to HR_DIRECTOR/SUPER_ADMIN with audit |
| P0-4 Retro payroll missing | **OPEN** — pending PO Q2 | `retroPay` still not computed |
| P0-5 Mid-period proration missing | **OPEN** — pending PO Q2 | No proration in calculation engine |
| P0-6 Manager resolved as current not as-of | **CLOSED** | `lib/workflow-routing.ts`, `lib/workflow-hierarchy.ts` (`fd80337`, `236036f`) |
| P1-7 EOSB as-of | **OPEN** — pending PO Q3 | `calculation-engine.ts` still uses today + current salary |
| P1-8 Absence balance date-tracking | **OPEN** — pending PO Q5 | Single mutable row unchanged |
| P1-9 No as-of reads | **CLOSED (backend)** | `lib/as-of-query.ts` + Phase 2B consumers; UI date-picker still deferred |
| P1-10 Historical-name resolution | **CLOSED** | MDM history reads active (`af71383`) |
| P1-11 Leave checks as-of date | **OPEN** | Out of Phase 1–2D scope |
| P1-12 Org chart as-of | **OPEN** | `build-tree.ts` still `is_current = true` only |
| P1-13 Persons attribute overwrite | **OPEN** | Structural redesign deferred |
| P2-14 MDM history never read | **CLOSED** | `af71383` |
| P2-15 Enrolment effective dating unused | **CLOSED (partial)** | As-of enrolment reads (`b3803c4`); no payroll recalc |
| P2-16 Stale comments | **CLOSED** | `236036f`, `398ae2e` |
