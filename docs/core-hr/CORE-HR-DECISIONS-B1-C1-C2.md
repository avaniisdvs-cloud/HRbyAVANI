# Core HR Decisions — B1 / C1 / C2

> **Status: APPROVED 2026-06-14.** Scope: Core HR stabilization / UAT readiness. Payroll is **not started**; dormant payroll code is untouched.
> Predecessor: decision note in the PPCDA/Core-HR thread; hardening baseline commit `68a3286`.

---

## B1 — `persons.isActive` semantics — **APPROVED: Option A**

**Decision:** `persons.isActive` is a **record-active / soft-delete flag** (BR-NO-DELETE). It does **NOT** mean employment-active. Employment status is owned by **`assignmentStatus`** and **`separationDate`**.

**Rules:**
1. Terminated / retired / deceased employees keep `isActive = true` and remain queryable for history, audit, reports, documents, rehire, and future final-settlement / EOSB.
2. The termination flow does **NOT** set `persons.isActive = false`.
3. Login / ESS access is blocked for separated workers via `isSeparated()` (employment status, not the record flag).

**Implementation status:** ✅ **Implemented now** — targeted auth gate (see "Auth gate behavior" below). Documented in the `persons.isActive` schema comment.

## C1 — Salary source of truth — **APPROVED: Option A**

**Decision:** **`salary_elements` is the source of truth** for salary/compensation. `persons.basicSalary` is **legacy / display fallback only** and must **not** be treated as authoritative compensation.

**Rules:**
1. Do **not** remove `persons.basicSalary` now.
2. Do **not** build salary sync now.
3. Do **not** touch Payroll or dormant payroll code.

**Implementation status:** ✅ **Documentation only now** — recorded in the `persons.basicSalary` schema comment + this note. No code change. Deprecation of the column (removing reads, eventual drop) is a future payroll-phase task once the dormant payroll/EOSB consumers migrate off it.

## C2 — Cross-year leave — **APPROVED: Option A**

**Decision:** Leave crossing calendar years must be **split by year** — each year's `absence_balances` row is debited/credited only for the portion of leave falling in that year.

**Rules:**
1. **Not implemented in this step.** Recorded as approved for a separate, controlled absence sprint.
2. Historical recalculation of existing cross-year entries must be **human-gated** (Activation Board, ledger process) and **not auto-run**.

**Implementation status:** 🕒 **Deferred to a controlled absence sprint.** Current behavior (debit-start-year) remains until then. Affected sites: `modules/absence/actions.ts` (~lines 368, 668, 1224, 1412, 1454) + a split helper in `modules/absence/services.ts`.

---

## Implementation status summary

| Item | Decision | Status now |
|---|---|---|
| B1 — `isActive` meaning + auth gate | Option A | ✅ Implemented (auth gate + docs) |
| C1 — salary source of truth | Option A | ✅ Documentation only |
| C2 — cross-year leave split | Option A | 🕒 Approved; separate future absence sprint |

## Auth gate behavior (B1)

`isSeparated(assignmentStatus, separationDate, todayIso)` (pure helper in `lib/local-login.ts`) returns true when `assignmentStatus ∈ {TERMINATED, RETIRED, DECEASED}` **or** `separationDate ≤ today`. It is applied in **both** login paths in `lib/auth.ts`:
- Credentials / LOCAL password (`authorize()`), and
- Microsoft Entra ID SSO (`signIn()` callback).

A separated worker is rejected even though `isActive = true`. **SUPER_ADMIN break-glass is exempt** (carved-out admin path). Dev demo accounts are unaffected (they bypass the DB path). The `persons` record is never modified by the gate.

## Items explicitly NOT authorized

- Payroll (any phase) — not started.
- Salary sync between `salary_elements` and `persons.basicSalary`.
- Removal of `persons.basicSalary`.
- Historical leave recalculation (C2).
- Migration application (incl. 0067) — human-gated via the ledger process.
- Changes to dormant payroll code, `payroll_results`, `salary_elements` behavior, UI, or demo accounts.

## Next step
Controlled **C2 absence sprint**: implement per-year leave splitting at the 5 balance-touch sites + a split helper, with a human-gated historical recalculation.
