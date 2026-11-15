# Effective-Dating Closure Verification — Live Database Evidence

**Date:** 2026-06-12 · **Method:** read-only SQL against the connected Neon database (DEV/UAT, `pg_constraint` / `pg_indexes` / `information_schema` + invariant counts), authorized for this review. No writes performed.

## 1. Constraints VERIFIED LIVE (migration 0063 + 0064 applied)

| Object | Verified definition (live) |
|---|---|
| `chk_worker_assignments_date_order` | `CHECK (effective_start_date <= effective_end_date)` |
| `chk_leave_plan_enrolments_date_order` | `CHECK (effective_start_date <= effective_end_date)` |
| `excl_worker_assignments_no_overlap` | `EXCLUDE USING gist (tenant_id =, person_id =, daterange(start,end,'[]') &&) WHERE assignment_status <> 'INACTIVE'` — **confirms 0064 variant is live** |
| `excl_salary_elements_no_overlap` | gist exclude on (tenant, person, assignment, payroll, element_code, daterange) |
| `excl_payroll_assignments_no_overlap` | gist exclude on (tenant, person, daterange) |
| `excl_work_schedule_assignments_no_overlap` | gist exclude on (tenant, person, daterange) |
| `excl_leave_plan_enrolments_no_overlap` | gist exclude on (tenant, person, absence_plan, daterange) |
| `excl_grade_history_no_overlap` | gist exclude on (tenant, grade_id, daterange(valid_from, valid_to)) — history-table family confirmed |
| `uq_worker_assignments_one_current` | partial UNIQUE (tenant, person) WHERE is_current — live |
| `uq_payroll_assignments_one_current` / `uq_work_schedule_assignments_one_current` / `uq_leave_plan_enrolments_one_current` | live |
| `idx_worker_assignments_asof` | live |

## 2. Data invariants VERIFIED LIVE (worker_assignments, pilot data)

| Invariant | Result |
|---|---|
| Exactly one current row per person | **HOLDS** — 70 `is_current=true` rows across 70 distinct persons |
| History preserved (no overwrite) | **HOLDS** — 76 total rows > 70 current (6 historical/future rows retained) |
| Cancelled futures retained for audit | **HOLDS** — 3 INACTIVE rows present, excluded from active-timeline enforcement |
| Open-ended rows use sentinel | **HOLDS** — 73 rows with `effective_end_date = '9999-12-31'` |

## 3. Activation
Cron registered (`vercel.json` → `/api/cron/future-dated-activation`, `5 20 * * *`); engine idempotent + error-firewalled (`lib/jobs/future-dated-activation.ts`); behavior covered by 8 unit tests; matured-activation commit `398ae2e`. Runbook: `RUNBOOK-future-dated-activation.md`.

## 4. Closure of previous NOT VERIFIED items
- ~~Live presence of 0063/0064 in Neon~~ → **VERIFIED APPLIED** (this document).
- Side-finding: **0062 email-platform tables are also present live** (`email_provider_settings`, `email_sender_defaults`, `email_templates`, `email_messages`, `email_delivery_events`) although `migration-ledger.test.md` listed 0062 as `pending` — ledger corrected 2026-06-12.
- Still environment-dependent (not code-verifiable): production Vercel env values (CRON_SECRET, ENABLE_DEV_ACCOUNTS) — production not yet active; tracked under production-hardening.

## 5. Effective-dating tables (authoritative list)
Effective-dated with full constraint set: `worker_assignments`, `salary_elements`, `payroll_assignments`, `work_schedule_assignments`, `leave_plan_enrolments` + history family `grade_history`, `department_history`, `location_history`, `job_history`, `position_history`.
NOT effective-dated (known, deferred): `absence_balances` (single mutable row — PO Q20.5), `persons` core attributes (audit log is legal record — PO Q20.5).
