# Foundation Stewardship Closure Record v1.0

> Permanent governance artifact. Future auditors may rely on this without re-investigating source.
> Issued by the Enterprise Foundation Stewardship Closure Board · 2026-06-12.

| Field | Value |
|---|---|
| Foundation Baseline | `f5246642c8eee54d35d3cb09ba4e6f3e5abf8c0a` |
| Stewardship Commit | `c0667cc` |
| Scope | P2-T3, P1-H4, P3-D2 (additive foundation controls) |
| Validation | typecheck 0 errors · full suite 167 files / 3107 passed / 0 failed · build pass |
| Freeze Compliance | COMPLIANT — additive only, no frozen model altered |

## State model (every item rated on four independent axes)

| Item | Designed | Implemented | Validated | Operationally Active | Closure |
|---|---|---|---|---|---|
| **P2-T3** Self-approval prevention | ✅ | ✅ | ✅ | ✅ **ACTIVE** (runs in `takeWorkflowAction`; all decisions route through it) | **CLOSED** |
| **P1-H4** Identity uniqueness | ✅ | ✅ | ✅ | ✅ **FULLY ACTIVE** (2026-06-12: 0065 applied to Neon, 71 hashes backfilled, 0 duplicates, 3 unique indexes live, `IDENTITY_UNIQUENESS_ENFORCEMENT=true` local+Vercel, production deployment `o210xdulx` Ready and aliased to avaniishcm.vercel.app) | **CLOSED** |
| **P3-D2** Runtime permission enforcement | ✅ | ✅ | ✅ | ✅ **ACTIVE** mechanism, enforcing at 3 wired entry points; broad rollout incremental | **CLOSED WITH CONDITIONS** |

---

## P2-T3 — Workflow Self-Approval Prevention

- **Original risk:** a participant could be the decision-maker on their own request — a segregation-of-duties failure that would taint every future approval-bearing program (payroll runs, comp changes, talent actions).
- **Solution:** identity-based SoD guard evaluated before any decision branch in the single approval chokepoint; blocks self-approve, self-reject-from-queue, delegate-to-initiator, delegate-to-self; SYSTEM actor exempt for policy-driven SLA actions.
- **Evidence:** `lib/workflow-guards.ts`; `lib/workflow-engine.ts` guard at decision entry; blocked attempts recorded as `WORKFLOW.SELF_APPROVAL_BLOCKED` in the immutable audit log; all decision UIs/APIs route through `takeWorkflowAction` (verified: no direct step-status writes outside the engine).
- **Tests:** `tests/unit/workflow-self-approval-guard.test.ts` (self/manager/privileged-no-exemption/delegate-abuse/SYSTEM-exempt/no-initiator/source-wiring).
- **Operational dependencies:** none — active on the certified baseline.
- **Residual risk:** none material. **Closure: CLOSED.**

## P1-H4 — Identity Uniqueness Protection

- **Original risk:** duplicate employee identity (Emirates ID, passport, employee code) would corrupt payroll master data, WPS keying, GPSSA records, and any downstream program keyed on a unique worker.
- **Solution:** employee_code case-insensitive uniqueness (app + DB); Emirates ID / passport uniqueness via deterministic keyed HMAC hash columns (encryption-compatible) with partial UNIQUE indexes and in-transaction pre-checks.
- **Evidence:** `lib/identity-hash.ts`, `lib/identity-uniqueness.ts`, schema hash columns, `drizzle/migrations/0065_identity_uniqueness.sql` (additive), `scripts/backfill-identity-hashes.mjs` (guarded, duplicate-count report).
- **Tests:** `tests/unit/identity-uniqueness.test.ts` (determinism, normalisation, additivity, source-wiring, schema).
- **Operational dependencies (ACTIVATION SEQUENCE — REQUIRED for EID/passport):**
  1. Apply `0065` to DEV/UAT via the migration-ledger process (currently `pending`).
  2. Run `scripts/backfill-identity-hashes.mjs REPORT_ONLY=true`; resolve any reported duplicate groups.
  3. Run the backfill in write mode to populate hashes.
  4. Set `IDENTITY_UNIQUENESS_ENFORCEMENT=true` (currently unset).
  5. Record post-apply verification in the ledger.
- **Residual risk:** until the sequence completes, **EID/passport duplicates remain possible** (employee_code duplicates are already prevented). **Closure: CLOSED WITH CONDITIONS** — code complete and validated; EID/passport protection is NOT operationally active.

## P3-D2 — Runtime Permission Enforcement

- **Original risk:** role-only security cannot express per-feature, per-action governance; future programs would each reinvent fine-grained access control or ship gaps.
- **Solution:** `requirePermission()` resolver over the admin-managed `feature_permissions` matrix; runs after (never replaces) `requireRole`; legacy-allow when unconfigured; fail-closed on backend error; cache-coherent on matrix save.
- **Evidence:** `lib/permissions.ts`; wired at `createPerson`, `updatePerson`, `listHistoryEmployees`; `invalidatePermissionCache` on `saveFeaturePermissions`.
- **Tests:** `tests/security/permission-resolver.test.ts` (deny/allow/legacy-allow/non-matrixed/cache/wiring/never-widens).
- **Operational dependencies:** mechanism active. Broad adoption (remaining action surfaces) is incremental; recommend upgrading denial logging to an audit event during rollout.
- **Residual risk:** actions not yet wired rely on `requireRole` alone (their pre-existing posture — no regression). **Closure: CLOSED WITH CONDITIONS** — mechanism complete and enforcing; coverage expands per program.

---

## Future Program Impact

| Program | Status | Rationale |
|---|---|---|
| Payroll | **SAFE WITH CONDITIONS** | Must complete the P1-H4 activation sequence before payroll master-data load; inherits P2-T3 automatically on its approval flows; wire P3-D2 on payroll actions. |
| Talent / Recruitment / Learning / Succession / Workforce Planning | **SAFE** | Depend on certified identity + approvals; P2-T3 active, P3-D2 mechanism available; no EID/passport-uniqueness dependency at load time. |
| Compensation | **SAFE WITH CONDITIONS** | Comp-change approvals inherit P2-T3; if keyed on unique identity, complete P1-H4 activation first. |
| AI Programs | **SAFE** | Continue the governed-read + RBAC pattern; wire P3-D2 on any new privileged capability. |

## Residual Risk Register

| ID | Risk | Severity | Owner | Clears when |
|---|---|---|---|---|
| RR-1 | EID/passport duplicates possible until 0065 applied + flag enabled | Medium | Payroll program / Ops | activation sequence complete |
| RR-2 | P3-D2 not yet on all action surfaces | Low | Each owning program | incremental wiring |
| RR-3 | P3-D2 denials logged but not audited | Low | Stewardship | denial→audit-event upgrade |

## Foundation Freeze Compliance

COMPLIANT. Additive only: 2 nullable columns, new pure libraries, additive migration, second security layer atop an untouched `requireRole`. No frozen model, contract, or certified assumption altered.
