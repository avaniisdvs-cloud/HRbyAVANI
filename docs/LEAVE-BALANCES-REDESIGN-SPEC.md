# Leave (Absence) Balances — Enterprise Redesign Functional Specification

> **Status:** DRAFT — pending review/approval. **No application code to be modified until this is approved and the code freeze is lifted.**
> **Page:** Absence → Balances (`/absence/balances`)
> **Source file:** `app/(hr-admin)/absence/balances/page.tsx`
> **Export route:** `app/(hr-admin)/absence/balances/export/route.ts`
> **Author / date:** Redesign session 2026-06-05
> **Related rules:** CLAUDE.md Non-Negotiable Rules 4 (bilingual), 6 (barrels), 7 (CSS tokens), 10 (nav sync); RBAC entity-scoping.

---

## 0. Purpose & Background

The current page exposes a single **Year** dropdown plus an **"Apply"** button and renders one flat, unbounded grid of `absence_balances` rows for the selected year (per person × leave type × year), with an inline server-rendered accrual-history drill-down.

### Why "Apply" exists today
The page is a **Server Component** with no client reactivity. The Year `<select>` lives in a native HTML `<form>`; a native form cannot change the URL until submitted, so **"Apply" is simply the form submit button** — it reloads the page with `?year=<value>`, the server re-queries, and the grid re-renders. With one filter it is redundant; with ten filters it becomes a usability hazard (users change filters and forget to submit).

### Decision
**Remove "Apply"; filters auto-apply.** See §1.

### Business objective
Enable HR, Operations, Payroll, Finance, and Management to analyze leave balances by legal entity, department, project, employee, leave type, and date range — supporting workforce planning, leave-liability monitoring, expiry management, and operational reporting.

---

## 1. Final UX Behavior

### 1.1 Layout (top → bottom)
1. **Page header** — title "Absence Balances", live row count, actions: `Download CSV`, `Reset filters`. *(A `Columns` show/hide toggle is **out of Phase 1 scope** — deferred as a future enhancement.)*
2. **Summary cards strip** — 5 cards (§4). Each card reflects the **currently filtered** result set, and clicking a card applies its corresponding filter (e.g. "Negative Balances" → Balance Status = Negative). **Responsive wrapping:** cards lay out in a single row on wide screens and wrap to a 2-up grid on tablets and a 1-up stack on narrow/mobile screens (CSS flex/grid `wrap`, min card width ~180px) — never horizontally scroll or overflow.
3. **Filter bar** — responsive grid of the 10 filters (§2), in a panel that is collapsible on small screens.
4. **Active filter chips** — below the bar, one chip per non-default active filter (e.g. `Department: Finance ✕`); clicking ✕ clears that single filter. A `Clear all` shortcut mirrors `Reset filters`.
5. **Grid** — existing columns + drill-down, with status color cues and a sticky header.

### 1.2 Auto-apply rules
- **Dropdown / discrete filters** (Legal Entity, Department, Project, Leave Type, Balance Year, Balance Status, Carry-Forward Status) → **apply instantly on change**.
- **Free-text & date filters** (Employee search, Start Date, End Date) → **debounced 300–400 ms**, with in-flight request cancellation.
- **No "Apply" button.** A **`Reset filters`** control restores all defaults.
- Filter state is encoded in the **URL query string** (shareable / bookmarkable / back-button safe) — preserves the existing server-component model.

### 1.3 Empty states (must be distinct)
- **No data for year:** "No balance rows yet for {year}. They are created on first accrual." (existing copy).
- **Filters excluded everything:** "No balances match your filters." + a `Clear filters` CTA. (New — prevents users misreading an over-filtered view as "no data".)

### 1.4 Defaults
| Filter | Default |
|---|---|
| Legal Entity | All Entities (within RBAC scope) |
| Department | All Departments |
| Project | All Projects |
| Leave Type | All Leave Types |
| Employee | (empty) |
| Balance Year | Current year (`new Date().getUTCFullYear()` UTC) |
| Start Date / End Date | (empty) |
| Balance Status | All |
| Carry-Forward Status | All |

---

## 2. Filter Definitions, Business Meaning & Source

| # | Filter | Business meaning | Data source | Type |
|---|--------|------------------|-------------|------|
| 1 | **Legal Entity** | Which UAE legal entity the balance belongs to. Liability and reporting are entity-scoped. | `absence_balances.legal_entity_id` → `legal_entities` | Dropdown, RBAC-scoped |
| 2 | **Department** | Org-unit the employee currently belongs to. For org-structure analysis. | `worker_assignments.department_id` (current rows) | Dropdown |
| 3 | **Project** | Project/cost-centre the employee is assigned to. For project-level workforce/liability. | `worker_assignments.project_id` (current rows, nullable) | Dropdown |
| 4 | **Leave Type** | Annual, Sick, etc. For type-specific accrual/liability analysis. | `absence_balances.absence_type_id` → `absence_types` | Dropdown |
| 5 | **Employee** | Specific person, by name (EN/AR) or employee number. | `persons.full_name_en` / `full_name_ar` / `person_number` | Searchable typeahead |
| 6 | **Balance Year** | The accrual year the balance snapshot belongs to. | `absence_balances.balance_year` | Dropdown (year−2 … year+1) |
| 7 | **Start Date** | Lower bound of the **system/activity date range** (see §2.1). | derived (see §2.1) | Date input (debounced) |
| 8 | **End Date** | Upper bound of the system/activity date range. | derived (see §2.1) | Date input (debounced) |
| 9 | **Balance Status** | Health of the closing balance. | derived from `closing_balance_days` + carry-forward expiry | Dropdown |
| 10 | **Carry-Forward Status** | State of carried-forward days. | derived from `carried_forward_days`, `forfeited_days`, expiry | Dropdown |

### 2.1 Start Date / End Date — "System Date Range" (CONFIRMED)
Start/End Date filter the **balance record's own system/activity dates**, NOT leave-request or leave-transaction dates.

A balance row matches if **any** of the following falls within `[Start Date, End Date]`:
- `created_at` — when the balance row was created
- `updated_at` — when it was last modified/recalculated
- `last_accrual_date` — when monthly accrual last ran for it

Business reading: *"Show balances that were created, updated, recalculated, or accrued within this range."* Useful for auditing recent accrual runs, recalculations, and data-load activity. Either bound may be supplied alone (open-ended range).

> **Explicitly excluded:** these dates are NOT the leave dates an employee took. A separate "Leave Liability / Transactions" report would cover taken-leave-by-date (out of scope here, see §11 Phase 3 note).

### 2.2 Balance Status values
| Value | Rule |
|---|---|
| **Positive** | `closing_balance_days > 0` |
| **Negative** | `closing_balance_days < 0` |
| **Zero** | `closing_balance_days = 0` |
| **Expiring Soon** | `carried_forward_days > 0` AND the **derived** carry-forward expiry date is within **90 days** of "today" (UTC) AND not yet forfeited. Expiry date is computed, not stored — see expiry-resolution note below. |

> `closing_balance_days` is the application-computed stored value: `opening + accrued + carriedForward + adjusted − taken − pending − forfeited`. NULL closing is treated as "not yet computed" and excluded from Positive/Negative/Zero buckets (shown only under "All").

> **Carry-forward expiry resolution (APPROVED — see §12 Decision #1).** `absence_balances` has **no** `carry_forward_expiry_date` column; expiry is derived as `balanceYearStart + carryForwardExpiryMonths`.
> - **Phase 1 — plan-level approximation:** JOIN `absence_types.absence_plan_id → absence_plans` and use `absence_plans.carry_forward_expiry_months` as the effective expiry window. Expiry date = `make_date(balance_year, 1, 1) + carry_forward_expiry_months months`; "Expiring Soon" = that date within 90 days of today (UTC); `carry_forward_expiry_months = 0` means **never expires** (never Expiring Soon). This is computed purely in SQL via the plan JOIN — no per-person resolution.
> - **Phase 2 — exact per-person resolution:** replace the plan-level value with the per-person × per-type resolved rule from `resolveLeaveRuleSet` (`lib/leave-rule-resolver.ts`), which scores rule sets by legal entity, entity type, nationality category, and employment type (default = 24 months, BR-AL-003). **No new `carry_forward_expiry_date` column is to be added in Phase 1.**

### 2.3 Carry-Forward Status values
| Value | Rule |
|---|---|
| **Eligible** | `carried_forward_days > 0` AND the **derived** expiry date is in the future (not yet forfeited) |
| **Not Eligible** | `carried_forward_days = 0` (nothing carried) |
| **Expired** | `forfeited_days > 0` (carry-forward lapsed / forfeited) |

> "Eligible" uses the **same expiry-resolution approach** as "Expiring Soon" (§2.2):
> - **Phase 1:** plan-level expiry via the `absence_plans.carry_forward_expiry_months` JOIN; `0` months = never expires → always Eligible while `carried_forward_days > 0`.
> - **Phase 2:** exact per-person expiry via `resolveLeaveRuleSet`.
> "Not Eligible" (`= 0`) and "Expired" (`forfeited_days > 0`) are pure SQL on stored columns in both phases — no expiry resolution needed.

---

## 3. UX Detail — Filter Bar Components
- **Dropdowns** styled with design tokens only (`var(--card)`, `var(--border)`, `var(--ink-1)` …) — never raw hex (Rule 7).
- **Employee typeahead:** async, RBAC-scoped, `LIMIT 20`, matches name (EN/AR) + person number; shows `personNumber · fullNameEn`.
- **Bilingual labels:** every filter label and option must have `_en` and `_ar` (Rule 4). AR is auto-translated via the existing `lib/translation.ts` framework where applicable.
- **Chips:** render only for non-default values; each chip clears just its own filter; `Clear all` = Reset.
- **Accessibility:** all inputs labelled; date inputs keyboard-navigable; color cues paired with text/badges (not color alone).

---

## 4. Summary Card Definitions

All cards aggregate over the **same filtered WHERE clause** as the grid (one extra grouped query, run in parallel with the rows query).

| Card | Definition | Query |
|---|---|---|
| **Total Employees** | Distinct persons in the filtered set. | `COUNT(DISTINCT person_id)` |
| **Total Available Leave Days** | Sum of positive closing balances (leave still available). **Day-count metric — NOT a monetary liability value.** | `SUM(GREATEST(closing_balance_days, 0))` |
| **Expiring Leave Days** | Carry-forward **days** expiring within 90 days (day count, not money). Uses the §6.3 Phase 1 plan-level expiry predicate. | `SUM(carried_forward_days)` WHERE expiry within 90 days AND not forfeited |
| **Negative Balances** | Count of balance rows where closing < 0 (over-taken / data issues). | `COUNT(*)` WHERE `closing_balance_days < 0` |
| **Pending Leave Impact** | Total pending (requested-not-yet-approved) **days** that will reduce available balances. | `SUM(pending_days)` |

- **All card figures are day counts, not monetary amounts.** No daily-rate or salary valuation is applied here. Monetary leave-liability valuation is explicitly **out of scope** for this page and deferred to the Phase 3 "Leave Liability" report (§10). Card labels must read in "days" so HR/Finance never mistake them for currency values.
- Each card is clickable → applies its natural filter (Negative Balances → Balance Status = Negative; Expiring Leave Days → Balance Status = Expiring Soon; Pending Leave Impact → sorts by `pending_days DESC`, per §12 Decision #4 — no dedicated pending status filter in Phase 1).
- Cards must show "—" / 0 gracefully on empty result sets.
- **Responsive layout:** single row on wide screens → 2-up on tablet → 1-up stacked on narrow/mobile (flex/grid wrap, min card width ~180px); cards never overflow or horizontally scroll.
- Numbers formatted with `var(--font-mono)` for figures, consistent with the grid.

---

## 5. Edge Cases

1. **NULL `closing_balance_days`** — not yet computed; excluded from Positive/Negative/Zero, included under "All". Card sums treat NULL as 0.
2. **Multiple current assignments (CONFIRMED: match any)** — Department/Project filter matches if ANY current assignment matches; results **de-duplicated** so each `absence_balances.id` appears exactly once (`SELECT DISTINCT` on balance id, or `EXISTS` subquery to avoid join fan-out).
3. **No assignment at all** (e.g. terminated mid-year) — balance still exists; appears under "All Departments/Projects" but is excluded when a specific Department/Project is selected.
4. **Nullable Project** — persons with no project: excluded by a specific Project filter; included under "All Projects".
5. **Over-filtered → empty** — distinct empty-state message + Clear CTA (§1.3).
6. **RBAC scope vs Entity filter** — a non-SUPER_ADMIN selecting an entity they don't own must get nothing (server enforces scope first; entity dropdown is pre-scoped so this shouldn't be selectable).
7. **Crafted `?expanded=` param** — existing protection retained: only expand if the row is in the in-scope result set (prevents cross-entity probing).
8. **Year out of range** — existing Zod clamp `min(2000) max(3000)`, default current year; retained.
9. **Open-ended date range** — Start only, or End only, both valid.
10. **Expiry date unavailable** — fall back to plan standard expiry month (§2.3 note); never crash the status computation.
11. **Large result sets** — pagination required (§7); cards aggregate the full filtered set, not just the visible page.
12. **Timezone** — "today" and year boundaries computed in **UTC** (consistent with existing `getUTCFullYear()`); date filters compared as `date` (no time component).
13. **Export vs grid divergence** — export MUST inherit the exact filter set (§8); otherwise a filtered grid + unfiltered CSV silently disagree.

---

## 6. Query Logic

### 6.1 Base (direct filters — no schema change)
```
FROM absence_balances ab
  LEFT JOIN persons p       ON ab.person_id = p.id
  LEFT JOIN absence_types t ON ab.absence_type_id = t.id
WHERE ab.tenant_id = :TENANT_ID
  AND ab.balance_year = :year
  [AND ab.legal_entity_id = :entityId]            -- filter 1 / RBAC scope
  [AND ab.legal_entity_id = :scopedEntityId]      -- forced for non-SUPER_ADMIN
  [AND ab.absence_type_id = :typeId]              -- filter 4
  [AND (p.full_name_en ILIKE :q OR p.full_name_ar ILIKE :q OR p.person_number ILIKE :q)]  -- filter 5
  [AND <balance status predicate>]                -- filter 9 (SQL, not JS)
  [AND <carry-forward status predicate>]          -- filter 10 (SQL)
  [AND (ab.created_at::date BETWEEN :start AND :end
        OR ab.updated_at::date BETWEEN :start AND :end
        OR ab.last_accrual_date BETWEEN :start AND :end)]  -- filters 7/8 system date range
ORDER BY p.person_number ASC, t.type_code ASC
LIMIT :pageSize OFFSET :offset
```

### 6.2 Department / Project (Phase 2 — join, match-any, de-dup)
Use `EXISTS` to avoid join fan-out and the need for `DISTINCT`:
```
AND EXISTS (
  SELECT 1 FROM worker_assignments wa
  WHERE wa.person_id = ab.person_id
    AND wa.tenant_id = ab.tenant_id
    AND wa.is_current = true
    [AND wa.department_id = :departmentId]   -- filter 2
    [AND wa.project_id   = :projectId]       -- filter 3
)
```
- `EXISTS` guarantees each balance row appears once even with multiple current assignments (match-any semantics satisfied without duplicate rows).

### 6.3 Status predicates (must be SQL, never post-fetch JS)
- Positive: `ab.closing_balance_days > 0`
- Negative: `ab.closing_balance_days < 0`
- Zero: `ab.closing_balance_days = 0`
- CF Not Eligible: `ab.carried_forward_days = 0`
- CF Expired: `ab.forfeited_days > 0`

**Expiry-dependent predicates (Expiring Soon, CF Eligible) — APPROVED phased approach (§12 Decision #1):**

*Phase 1 — plan-level expiry via JOIN (pure SQL, no per-person resolution):*
```
JOIN absence_plans pl ON t.absence_plan_id = pl.id
-- effective expiry date for the row (NULL/0 months => never expires):
-- expiry := make_date(ab.balance_year, 1, 1) + (pl.carry_forward_expiry_months * INTERVAL '1 month')

-- Expiring Soon:
ab.carried_forward_days > 0
  AND ab.forfeited_days = 0
  AND pl.carry_forward_expiry_months > 0
  AND (make_date(ab.balance_year,1,1) + pl.carry_forward_expiry_months * INTERVAL '1 month')::date
        BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '90 days')

-- CF Eligible:
ab.carried_forward_days > 0
  AND ab.forfeited_days = 0
  AND ( pl.carry_forward_expiry_months = 0   -- never expires
        OR (make_date(ab.balance_year,1,1) + pl.carry_forward_expiry_months * INTERVAL '1 month')::date > CURRENT_DATE )
```
> `make_date`/`CURRENT_DATE` evaluated in UTC to match §5.12. `carry_forward_expiry_months = 0` ⇒ never expires (always Eligible while carried > 0; never Expiring Soon).

*Phase 2 — exact per-person expiry:* substitute the plan-level `carry_forward_expiry_months` with the per-person × per-type value resolved by `resolveLeaveRuleSet` (`lib/leave-rule-resolver.ts`). Because resolution is per-row contextual (entity/nationality/employment type), this is computed in the app/batch layer rather than a single SQL JOIN. **No `carry_forward_expiry_date` column is added in Phase 1.**

### 6.4 Summary aggregates (parallel query, same WHERE)
```
SELECT
  COUNT(DISTINCT ab.person_id)                          AS total_employees,
  SUM(GREATEST(ab.closing_balance_days, 0))             AS total_available_days,
  SUM(CASE WHEN <expiring soon> THEN ab.carried_forward_days ELSE 0 END) AS expiring_days,
  COUNT(*) FILTER (WHERE ab.closing_balance_days < 0)   AS negative_balances,
  SUM(ab.pending_days)                                  AS pending_impact
FROM absence_balances ab ... <same joins/WHERE minus pagination>
```
> `<expiring soon>` reuses the **§6.3 Phase 1 plan-level expiry predicate** (JOIN `absence_plans`); Phase 2 swaps in the per-person resolved value. `total_available_days` and `expiring_days` are **day counts**, not monetary values (§4).

### 6.5 Indexes (Phase 2 migration — next clean slot **0065** as of 2026-06-12; verify folder before assigning)
- `absence_balances (tenant_id, balance_year, legal_entity_id, absence_type_id)` — composite for the common filtered path.
- Ensure `worker_assignments (person_id, is_current)` (and ideally `(department_id)`, `(project_id)`) are indexed for the EXISTS subquery.
- **No schema column changes required.** All filters map to existing columns.

---

## 7. Performance Considerations
- **Pagination required** — current page fetches all rows for the year unbounded (~500 employees × ~8 types ≈ 4,000 rows). Add server-side pagination (keyset preferred, or LIMIT/OFFSET).
- **Debounce** employee/date filters (300–400 ms) + cancel in-flight to avoid request storms from auto-apply.
- **Parallelize** rows query + summary aggregate query (`Promise.all`).
- **SQL-side filtering** for status / carry-forward (never fetch-then-filter — would break counts, cards, and pagination).
- **Cache** filter option lists (entities/departments/projects/types) — they change rarely; fetch server-side at render and pass as props.
- **EXISTS over JOIN+DISTINCT** for dept/project to avoid fan-out.
- Server-component model retained; if filter interactivity feels sluggish at scale, isolate only the filter bar as a small client island that pushes state to the URL via `router.replace`.

---

## 8. Export Behavior
- **Current:** `/absence/balances/export` accepts only `year`.
- **Required:** export MUST accept and apply the **full active filter set** (entity, department, project, leave type, employee, year, start/end date, balance status, carry-forward status) so the CSV equals the on-screen grid.
- Export is **RBAC-scoped identically** to the page (no broader data than the user can see on screen).
- Export ignores pagination (exports the full filtered set) and includes the same columns **plus the computed `Balance Status` and `Carry-Forward Status` label columns — these are REQUIRED, not optional** (Payroll/Finance reconciliation depends on them). The computed columns use the same §6.3 logic as the grid (Phase 1 plan-level expiry).
- Filenames should encode the year and key filters for traceability (e.g. `absence-balances_2026_entity-X.csv`).

---

## 9. Security / RBAC Considerations
- Allowed roles unchanged: `HR_ADMIN`, `HR_DIRECTOR`, `PAYROLL_ADMIN`, `MANAGER`, `SUPER_ADMIN`, `FINANCE`; others redirected to role home.
- **Entity scope is enforced server-side first:** non-`SUPER_ADMIN` users are forced to `legal_entity_id = session.user.legalEntityId`. The Legal Entity dropdown is pre-scoped so out-of-scope entities are not selectable.
- **Employee typeahead API** must call `auth()` + role check and be entity-scoped (cannot enumerate persons outside scope).
- **Filter option lists** (departments/projects/entities) must be scoped — never leak other entities' org structure.
- **Drill-down protection retained** — expand only in-scope rows (anti-probing).
- Page is **read-only** → no `db.transaction`/`audit.log` writes, no PII decryption beyond what's already displayed. No new PII surfaced (names/numbers already shown). Confirm no encrypted fields are added to filters/export.
- **`tenant_id`** enforced on every query (Rule 9).
- All new user-facing strings **bilingual** (Rule 4); if nav changes, update **both** `config/workspace-nav.ts` and `config/admin-nav.ts` (Rule 10).

---

## 10. Phase 1 & Phase 2 Implementation Plan

### Phase 1 — High value, low risk (NO schema change)
1. Remove "Apply"; implement auto-apply (instant dropdowns; debounced employee/date) via URL params.
2. Add `Reset filters` + active-filter chips + distinct empty states.
3. Add **direct filters:** Legal Entity (RBAC-scoped), Leave Type, Balance Year (existing), Balance Status, Carry-Forward Status, Employee search (typeahead API).
4. Add **summary cards** (5) with parallel aggregate query; cards clickable to apply filters.
5. Make **CSV export inherit filters**.
6. Status/carry-forward predicates implemented in SQL.
7. Bilingual labels; tokens-only styling.

### Phase 2 — Structural
1. **Department + Project filters** via `worker_assignments` EXISTS subquery (match-any, de-dup).
2. **System date-range filter** (created_at / updated_at / last_accrual_date).
3. **Pagination** (keyset/LIMIT-OFFSET).
4. **Index migration** at the next clean slot (**0065** as of 2026-06-12 — §6.5; verify folder before assigning). WIP `_wip_` migrations 0055–0057/0060 are NOT applied; 0061 status unrecorded; 0062–0064 ARE applied to DEV/UAT (ledger SSOT: `docs/environment/migration-ledger.test.md`).
5. Confirm carry-forward **expiry date** derivation from absence-plan rules for "Expiring Soon"/"Eligible".

### Phase 3 — Optional (separate report, out of current scope)
- "Leave Liability" analytics: monetary valuation `closing_balance_days × daily rate` per entity/department/project; taken-leave-by-date transactions report. Recommended as its own page rather than overloading this grid.

---

## 11. QA Test Scenarios

### Functional
1. Default load → current year, All filters, grid + cards populate; no "Apply" button present.
2. Change Leave Type dropdown → grid + cards update **instantly**, no submit.
3. Type in Employee search → updates after debounce; matches by EN name, AR name, and person number.
4. Set Start/End date → after debounce, only balances whose created/updated/last_accrual fall in range appear; verify open-ended (start-only, end-only).
5. Balance Status = Negative → only closing < 0 rows; Negative Balances card count matches grid count.
6. Balance Status = Expiring Soon → only carry-forward expiring within 90 days, not forfeited.
7. Carry-Forward Status = Expired → only `forfeited_days > 0`.
8. Department filter (Phase 2) → person with 2 current assignments in matching dept appears **once** (no duplicate rows).
9. Project filter (Phase 2) → person with null project excluded; "All Projects" includes them.
10. Reset filters → all defaults restored, URL cleared, cards recomputed.
11. Active chips → each chip's ✕ clears only its filter; Clear all = Reset.
12. CSV export → downloaded rows exactly match the on-screen filtered set (including dept/project/date/status filters).
13. Empty due to filters → "No balances match your filters" + Clear CTA (distinct from "no data for year").
14. Drill-down still expands accrual history for in-scope rows.

### RBAC / Security
15. HR_ADMIN (entity-scoped) cannot see or select other entities; URL-tampering `legal_entity_id` of another entity returns nothing.
16. Employee typeahead never returns out-of-scope persons.
17. Department/Project option lists scoped to caller's entity.
18. Crafted `?expanded=<other-entity-row>` does not expand.
19. EMPLOYEE / disallowed roles redirected to role home.

### Performance
20. 4,000-row dataset → first paint within target; pagination limits payload.
21. Rapid filter changes → debounced, in-flight requests cancelled, no request storm.
22. Summary aggregate query runs in parallel (not serial) with rows query.
23. Status/dept filters resolved in SQL (verify via query log — no full-table fetch then JS filter).

### Data correctness
24. Card sums tie out to manual SUM over filtered rows (available days, expiring days, pending).
25. NULL closing_balance handled (excluded from P/N/Z, counted as 0 in sums).
26. UTC year/today boundaries (no off-by-one at month/year edge).

---

## 12. Open Items — Decision Table

> **STATUS: APPROVED 2026-06-05.** All items below are confirmed decisions (not open proposals). The "Recommended decision" column now records the **approved** decision. Implementation must follow these.

> **Schema finding (verified 2026-06-05, read-only):** `absence_balances` has **no carry-forward expiry-date column**. Expiry is computed at runtime as `balanceYearStart + carryForwardExpiryMonths` (`computeCarryForwardExpiry`, `modules/absence/services.ts:106`). `carryForwardExpiryMonths` is **resolved per person × leave type** via `resolveLeaveRuleSet` (`lib/leave-rule-resolver.ts:236`), which scores rule sets by legal entity, entity type, nationality category, and employment type. Default rule = **24 months** (BR-AL-003); most other rule sets = **0** (never expires). `absence_plans.carryForwardExpiryMonths` (foundation.ts:830) exists but is only the plan-level fallback, not necessarily the effective value for a given person.

| # | Item | Current assumption in spec | Risk if not confirmed | Recommended decision | Build impact |
|---|------|---------------------------|----------------------|---------------------|--------------|
| 1 | **Carry-forward expiry source** for "Expiring Soon" / "Eligible" / 90-day window | §2.3/§6.3 originally implied a simple SQL predicate on stored fields | **HIGH** — expiry is per-person resolved, not a column; a naive SQL `WHERE` would be wrong (wrong/zero employees flagged → liability mis-stated). Pure-SQL filtering as originally written is **not achievable**. | **APPROVED.** **Phase 1 — plan-level approximation:** JOIN `absence_types.absence_plan_id → absence_plans` and use `absence_plans.carry_forward_expiry_months`; expiry = `make_date(balance_year,1,1) + carry_forward_expiry_months months`, compare to `CURRENT_DATE + 90d`; `0` months = never expires. **Phase 2 — exact per-person resolution** via `resolveLeaveRuleSet` (app/batch layer), after deeper rule-resolution support. **No `carry_forward_expiry_date` column is added in Phase 1.** | Phase 1: extra JOIN to `absence_plans`; status predicate is a date expression. Phase 2: app-layer per-person resolution (no schema column in Phase 1). Affects §2.2, §2.3, §6.3, §6.4, card "Expiring Leave Days". |
| 2 | **Carry-forward CF "Eligible" definition** | "carried_forward_days > 0 AND expiry in future" | MEDIUM — same per-person expiry dependency as #1 | Same approach as #1 (plan-level in Phase 1). "Not Eligible" (`= 0`) and "Expired" (`forfeited_days > 0`) are safe as pure SQL. | Inherits #1. |
| 3 | **Pagination style & page size** | §7 says keyset preferred, else LIMIT/OFFSET | LOW — both work; offset is simpler but slower deep in large sets | LIMIT/OFFSET, default **50 rows/page**, for Phase 1 simplicity; revisit keyset only if datasets exceed ~10k rows. | Minor; both Server-Component friendly. |
| 4 | **"Pending Leave Impact" card interaction** | §4 says clickable; unclear if it filters | LOW — cosmetic | Card displays `SUM(pending_days)`; clicking sorts by `pending_days DESC` (no dedicated status). No pending-only filter in Phase 1. | Trivial. |
| 5 | **Migration slot number** | §6.5/§10 originally assumed **0058** | MEDIUM — WIP `_wip_` migrations 0055–0057/0060–0061 exist unapplied; collision risk | **APPROVED.** Do **not** hard-code 0058. Re-check the latest migration number by listing `drizzle/migrations/` at **Phase 2 build time** and take the next free slot. | Phase 2 only; no Phase 1 impact. |
| 6 | **"Match any current assignment" + `is_current` semantics** | §6.2 uses `wa.is_current = true` | MEDIUM — for terminated/historical staff, `is_current` may exclude them entirely; "current" vs "during balance year" diverge | **APPROVED.** Department/Project filters use **current assignments only** (`is_current = true`), **match-any** (balance appears if ANY current assignment matches the selected Department/Project), with **de-duplication** so each balance row appears once (via `EXISTS`). Terminated/inactive employees appear **only when filters are set to All**, unless they still have a current assignment record. | Phase 2; matches existing assignment model. |
| 7 | **Half-pay / no-pay leave types in liability sums** | "Total Available Leave Days" sums all positive closings | MEDIUM — summing no-pay/half-pay days alongside full-pay overstates monetary liability | Phase 1: card counts **days** (not money), so summing is acceptable; label as "days", not "liability value". Defer monetary valuation to Phase 3 liability report. | None Phase 1; clarify card label. |

---

*End of specification. Awaiting review/approval before lifting code freeze.*
