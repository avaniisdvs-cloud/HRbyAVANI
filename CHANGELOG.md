# CHANGELOG — AVANIIS HR

All notable changes to the AVANIIS HR platform. Dates are commit dates. Maintain newest-first.
Format: grouped by date range / release theme. Full detail: `git log` and `docs/project-memory/`.

---

## 2026-06-12 — Baseline Unification & Foundation Certification (`f524664`)

- **Certified baseline:** `main @ f5246642c8eee54d35d3cb09ba4e6f3e5abf8c0a` — single SHA across main/origin/feature branch; deployed as `dpl_AWMmbN75xje7XLub5FBWMu8cRSkX` → http://localhost:3001 (Ready; 3 crons live).
- Merge `3ba7c7d`: unified main (Employees master-detail redesign `ff41a98`, CI test stabilization, listPersons auth fix `c453654`) with the effective-dating branch (2D-3 certified files, activation cron, email platform). Conflicts resolved per board priority.
- `9390788`: Employee History report + nav (both files) + tests committed; E2E logbook updated.
- `f524664`: test reconciliation — guardrail-aware SEC-CRED check, drizzle `relations` mock, WCAG static baseline 307→348 (ratchet preserved).
- Validation at the SHA: 0 TS errors, production build pass, 164/164 test files (3,076 tests), 83/83 ED tests.
- Live-DB closure verification (`57e5b1d`): 0063/0064 constraints + invariants verified in Neon; stale 0062 ledger status corrected to `applied`.
- Duplicate tree `AVANIIS_HR_SYS_PHASE1_CLEAN/` relocated out of the repo (zero unique content); `AGENTS.md` regenerated from CLAUDE.md.

## 2026-06-07 → 2026-06-12 — Effective-Dating Remediation (branch `feat/effective-dating-phase-1`)

### Added
- **Phase 1 — DB integrity foundations** (`a34b3bd`): migration `0063_effective_dating_integrity.sql` — sentinel `9999-12-31` backfill + defaults, date-order CHECK constraints, EXCLUDE-USING-gist overlap prevention, partial-UNIQUE one-current constraints, as-of indexes across 10 effective-dated tables.
- **Phase 1 — Future-dated activation** (`398ae2e`): nightly cron `lib/jobs/future-dated-activation.ts` + `/api/cron/future-dated-activation` (vercel.json `5 20 * * *`); activates matured future worker assignments idempotently with error firewall and audit logging.
- **Phase 2A — As-of query engine** (`68ccc84`): `lib/as-of-query.ts` — temporal read engine, 10 table adapters.
- **Phase 2B-1…2B-5** (`9d7494a`, `fd80337`, `b3803c4`, `8f47bb4`, `af71383`): as-of reads wired for worker assignments, workflow manager routing, leave plan enrolments, pending changes, historical MDM labels.
- **Phase 2C-1/2C-2** (`ea02b65`, `97d5445`): future-dated assignment timeline + future-assignment cancellation repair (sentinel extension).
- **Phase 2D-1/2D-2/2D-3** (`def377d`, `d4a986f`, `236036f`): retro slice resolver, historical retro split (period splitting, never overwrite), future-bounded retro split — certified PASS 11/11 (`docs/effective-dating/ed-2d-3-future-bounded-retro-split.md`). Migration `0064_worker_assignment_active_timeline.sql` (INACTIVE rows excluded from active-timeline enforcement).
- **Employee History report**: `app/(hr-admin)/reports/employee-history/` + `modules/reports/employee-history.ts` (see `docs/reports/EMPLOYEE-HISTORY-REPORT.md`).

### Known remaining gaps (deliberate, pending Product-Owner decisions Q20.2/Q20.3/Q20.5)
- Retro payroll / arrears for closed periods; mid-period proration; as-of EOSB; date-tracked absence balances; as-of org chart.

## 2026-06-06 → 2026-06-12 — Email Communication Platform
- Admin-configurable Graph API / SMTP email platform (`34676c7`): `modules/communication/`, `/settings/communication`, migration `0062_email_platform.sql` (additive, idempotent — apply status tracked in `docs/environment/migration-ledger.*.md`).
- Workflow email action links + allowlist delivery mode (`34af393`); dispatcher cron `/api/cron/email-dispatch` (daily on Vercel Hobby — `7495f27`, `3a3866a`).
- Docs: `docs/EMAIL-COMMUNICATION-PLATFORM.md`.

## 2026-06-04 → 2026-06-06 — Governance & Audit
- Project-memory documentation package (21 docs) at `docs/project-memory/2026-06-04/`; CLAUDE.md reduced 164KB → 8KB.
- Requirements baseline v1.0 (`3a00c1c`): consolidated HR requirements + UAE labour-law compliance package (dual-located in `docs/` and `DOC/Business requirements/`).
- Effective-dating discovery audit (45/100) + Oracle Fusion DateTrack benchmark (`ca063a5`) — docs 19/20.
- W0–W3 QA/QC reports, UAT package, open-points register (`e468a02`).
- Environment governance + migration ledgers (Test/Production) at `docs/environment/`.

## 2026-06-04 → 2026-06-05 — ARIA & Auth
- Provider-independent LLM control plane + capability registry (`b70c686`); ARIA Administration Handbook (SSOT) at `docs/aria/ARIA-ADMINISTRATION-HANDBOOK.md`.
- Conversational Transfer + Promotion via chat (Phase 4: `615deab`…`678e996`); Executive Summary capability (Phase 5: `88e4e37`).
- Identity-based LOCAL login for non-corporate-email users (`c67ef3c`) — see `docs/auth/LOCAL-LOGIN.md`; MFA step-up deferral tracked as OP-001 in `docs/OPEN-POINTS.md`.
- Leave Balances page enterprise redesign (`ae8a5d9`) — spec: `docs/LEAVE-BALANCES-REDESIGN-SPEC.md`.

## 2026-06-01 → 2026-06-04 — Migration Factory V2
- Migration Framework V2: 9-step production wizard, factory UI, source-file ingestion, workbook builders (`35bf964`…`2059107`).
- False-success bug fixed — zero-write detection (`9dd55c6`); incident record `docs/migration-factory/11-incident-workflow-v2-seed-skipped.md`.
- Full design/governance suite: `docs/migration-factory/00–11`.

## 2026-06-02 → 2026-06-03 — Workflow Intelligence Platform (Phases A–D)
- Read model + intelligence view (`94d066c`), shared services + universal timeline + CWE-639 authorization fix (`cc58f30`), Workflow Operations console (`2aa1f8f`), unified `/approvals` for all roles + requester visibility (`782cf0b`, `a2e6cc4`).
- Architecture docs: `docs/architecture/` (blueprint + phase B/C/D design reviews).

## 2026-05-29 → 2026-06-03 — Leave hardening
- Immutable balance snapshot at submission, fail-closed balance gate BR-LV-BAL-001 (`5a385fe`, `d0f0cc4`); workflow close/recall on leave cancel (`40433f5`).

## 2026-05-01 → 2026-05-28 — Phase 1 MVP build-out
- Workflow Engine v2 (hybrid hierarchy, condition trees, UAE SLA, approvals inbox) — 2026-05-01.
- Master Data Management: 9 entities full CRUD + history drawers — 2026-05-01.
- ARIA AI agent: admin configuration, streaming, ARIA OS, floating widget — May 2026.
- Reports & dashboards, role-based navigation, ESS (19 routes), insurance, timesheets, payroll schema/UI, observability, cloud-storage abstraction — May 2026.
- Auto-translate EN→AR framework (`lib/translation.ts`) — see `docs/TRANSLATION-FRAMEWORK.md`.

## 2026-04-30 — Baseline
- `3582ede` INIT|20260430|baseline.

---
*Created 2026-06-12 as part of the documentation remediation programme (Enterprise Readiness Review). Update on every release-worthy change.*
