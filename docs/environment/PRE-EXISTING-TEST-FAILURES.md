# Release Cleanliness Register — Test Notes

> Historical traceability note. The Core HR readiness work and its sibling fixes
> are now merged to `main`; the full unit + security suites are green on `main`.

## PTF-1 — `approval-detail-ux.test.ts` LBS-001 / LBS-002 — ✅ RESOLVED

| Field | Detail |
|---|---|
| **Tests** | `LBS-001`, `LBS-002` (source-inspection of `modules/absence/actions.ts`) |
| **Status** | **RESOLVED on `main`.** |
| **Type** | Stale source-inspection assertion — never a functional defect. |

### History
The assertions inspected `modules/absence/actions.ts` for the leave-balance snapshot
literals. The absence refactor `648b20d` ("split cross-year leave balances by calendar
year") changed the snapshot from `String(available)` to the multi-year aggregate
(`aggBefore` / `aggBefore - aggReserved`). On the long-lived `hardening/corehr-score-90-plus`
branch the test wasn't updated to the refactored variables, so the assertions failed there.
On the earlier `origin/main` base (before `648b20d` landed) the original assertions matched
and passed — so the failure was branch-state-specific, not a functional defect.

### Resolution
`648b20d` and its accompanying test refresh were merged to `main` via **PR #8**
("Absence: split cross-year leave balances by calendar year", merge commit `0774624c`):
- `modules/absence/actions.ts` carries the `aggBefore`/`aggReserved` snapshot.
- `tests/unit/approval-detail-ux.test.ts` LBS-001/LBS-002 were refreshed to resilient
  matchers (field + source variable, not exact arithmetic), so future safe refactors
  won't re-break them.

Post-merge `main` CI (through merge commits `0774624c` and `1334a13c`) is green, including
`approval-detail-ux.test.ts`. **No further action required.** This entry is retained for
historical traceability only.
