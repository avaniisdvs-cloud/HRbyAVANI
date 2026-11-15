# C2 Cross-Year Leave — Historical Recalculation Plan (NOT RUN)

> **Status: PLAN ONLY — do NOT auto-run.** Human-gated (Activation Board).
> Forward behavior fixed in commit (this sprint): `splitLeaveRangeByCalendarYear` + per-year balance updates at all 5 balance-touch sites. This note covers **existing** cross-year entries created BEFORE the fix.

## Problem
Before this sprint, a leave crossing calendar years (e.g. 2025-12-29 → 2026-01-02) debited the **entire** duration to the **start year's** balance (`balanceYear = startDate.slice(0,4)`). Those historical rows now disagree with the per-year model: the start year is over-debited and the end year is under-debited for the cross-year portion.

## Scope
Only `absence_entries` with `status ∈ {APPROVED, TAKEN, PENDING}` whose `startDate` and `endDate` fall in **different calendar years**, created before the fix. Same-year entries are unaffected.

## Identify affected entries (read-only)
```sql
SELECT id, person_id, absence_type_id, start_date, end_date, duration_days, status
FROM absence_entries
WHERE left(start_date::text, 4) <> left(end_date::text, 4)
  AND status IN ('APPROVED','TAKEN','PENDING')
ORDER BY start_date;
```

## Recalculation procedure (human-gated)
1. **Activation Board approval** required before any write.
2. **Backup** the `absence_balances` and `absence_entries` tables (Neon branch/snapshot).
3. For each affected entry, recompute the per-year split with `splitLeaveRangeByCalendarYear(start, end, durationDays)` and, **per spanned year**:
   - move the **end-year** portion out of the start-year balance (reduce start-year `taken`/`pending` by the end-year days) and into the end-year balance row (increase its `taken`/`pending` by those days), preserving the entry's status semantics (PENDING → pending; APPROVED/TAKEN → taken);
   - if the end-year balance row does not exist, **create/initialize it first** (or skip + report — Board decides);
   - recompute `closing_balance_days` for every touched row.
4. Capture **before/after evidence** (row counts + per-balance deltas) and attach to the ledger.
5. Record the run in `docs/environment/migration-ledger.test.md`.

## Guardrails
- **Do NOT auto-run.** No cron, no app trigger, no CLI write from this repo (DB write-guard stays in force; the target is the production-serving Neon instance).
- Idempotent: re-running must not double-shift (key off whether the end-year portion already sits in the end-year row).
- No payroll impact (leave balances are Core HR data; payroll is not started).

## Status
Forward C2 behavior: ✅ implemented + tested this sprint. Historical recalculation: 🕒 **pending Activation Board scheduling** — not part of this commit.
