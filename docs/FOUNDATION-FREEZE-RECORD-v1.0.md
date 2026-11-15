# ENTERPRISE FOUNDATION FREEZE RECORD v1.0

> **This document is the authoritative entry point for all future programs.**
> Issued by the Enterprise Foundation Certification Board.

| Field | Value |
|---|---|
| **Certified Date** | 2026-06-12 |
| **Certified Code Baseline** | `f5246642c8eee54d35d3cb09ba4e6f3e5abf8c0a` (branch `main`) |
| **Documentation Baseline** | `3f52a96` |
| **Deployment** | `dpl_AWMmbN75xje7XLub5FBWMu8cRSkX` → http://localhost:3001 |
| **Status** | **FOUNDATION CERTIFIED** |
| **Program Status** | **CORE HR CLOSED WITH CONDITIONS** |
| **Rollback Reference** | `safety/pre-baseline-unification-20260612` (origin) |

## Foundation Stewardship Backlog (conditions of closure — additive fixes, no design reopening)

> **STEWARDSHIP UPDATE 2026-06-12 (commit `c0667cc`):** all three items implemented + validated (full suite 3107 passed, 0 failed; build pass). Closure record: `docs/FOUNDATION-STEWARDSHIP-CLOSURE-v1.0.md`. Status below reflects operational activation, which differs from implementation.

| ID | Item | Closure | Operational state |
|---|---|---|---|
| P2-T3 | Workflow self-approval guard (`lib/workflow-guards.ts` + engine decision path) | **CLOSED** | ACTIVE on baseline |
| P1-H4 | Identity uniqueness — employee_code + EID/passport keyed-hash uniqueness | **CLOSED — ACTIVATED 2026-06-12** | FULLY ACTIVE: 0065 applied to DEV/UAT Neon, 71 hashes backfilled (0 duplicates), unique indexes live, enforcement flag on (local + Vercel prod), production deployment Ready. Payroll master-data load gate satisfied. |
| P3-D2 | Runtime `requirePermission()` resolver over `feature_permissions` | **CLOSED WITH CONDITIONS** | mechanism ACTIVE + enforcing at 3 entry points; broad wiring incremental per program |

Production-hardening register (accepted technical debt — SEC-09, OP-001 MFA, DataOps PII path, blob storage, etc.): `docs/OPEN-POINTS.md`, `docs/qa-qc/00-MASTER-QA-QC-REPORT.md` §7, `docs/qa-qc/revalidation-2026-06-12.md`.

## Non-Frozen Area

- **Absence Balance Submodel** (`absence_balances`) — single-mutable-row design pending Product-Owner decision Q20.5 (doc 19). Future programs must integrate via service interfaces only and must NOT depend on its internal structure.

## Frozen Foundation Models

Employee · Assignment (effective-dated, all change modes) · Organization · Effective Dating (constraints + as-of engine + activation) · Workflow · Security (RBAC + PII encryption) · Audit (INSERT-only) · Reporting (as-of read pattern).

## Authorized Future Programs

Payroll (AUTHORIZED WITH CONDITIONS — see board resolution) · Talent · Recruitment · Learning · Compensation · Succession · Workforce Planning · Analytics · AI Expansion.

## Future Program Rules

1. **No future program may reopen certified foundation models without formal Foundation Board approval.**
2. Future programs rely on the Foundation Assumptions (board resolution Phase 7): DB-guaranteed one-current/no-overlap/sentinel; history never deleted; temporal reads via `lib/as-of-query.ts`/assignment services; writes via `db.transaction` + `audit.log` + `requireRole`; workflow integration via the existing engine; bilingual fields mandatory; migration apply state authoritative only in `docs/environment/migration-ledger.*.md`; absence-balance internals off-limits.
3. Terminology: see Definitions in `docs/environment/environment-governance.md` (Production Deployment ≠ Production Environment).

## Certification Evidence Chain

`docs/effective-dating/01-ED-CLOSURE-VERIFICATION-2026-06-12.md` (live DB) · `docs/qa-qc/revalidation-2026-06-12.md` (independent QA/QC re-verification) · `docs/effective-dating/ed-2d-3-future-bounded-retro-split.md` (2D-3 certification PASS 11/11) · `CHANGELOG.md` 2026-06-12 entry (unification + validation: 3,076 tests, 0 TS errors, build pass) · audit doc 19 §9 (closure matrix).
