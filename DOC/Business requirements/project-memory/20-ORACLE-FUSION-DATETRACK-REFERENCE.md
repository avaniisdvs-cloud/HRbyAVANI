# 20 — ORACLE FUSION HCM DATETRACK REFERENCE (BENCHMARK)

> **Purpose:** The target architecture Avaniis is benchmarked against in `19-EFFECTIVE-DATING-AUDIT.md`.
> This is reference/education material — Oracle Fusion behavior — not a description of Avaniis.
> Use it to understand *what enterprise-grade effective dating means* before remediating.

---

## PART 1 — MECHANICS OF DATE EFFECTIVITY

### 1.1 Why tier-1 ERPs use continuous effectivity (not row-overwrite, not audit logs)
A date-tracked table stores a **function of time**: `value = f(date)`. It is a set of non-overlapping, gap-free time segments per business key — not a single mutable state row.

- **Retroactive payroll:** pay is a time-integral over a period. A backdated change must let the engine reconstruct what *was* in force per day and recompute closed periods. Audit logs record "field changed when keyed" — they cannot answer "the legally-in-force salary for work done on 12-April" without fragile reverse-engineering. Date effectivity answers it with `WHERE :payroll_date BETWEEN effective_start_date AND effective_end_date`.
- **Statutory compliance:** regulators demand reproducible point-in-time answers ("headcount on fiscal year-end", "legal employer on incident date") that must return the **same answer in 7 years**. Overwrite destroys this; audit diffs are legally weak. Effective dating makes the historical record first-class and directly queryable.
- **Predictive analytics:** future-dated rows physically coexist (`effective_start_date > sysdate`), enabling forward org/headcount modeling and time-in-state analytics. Overwrite has no future; audit logs have no committed future.

**Summary:** audit logs answer *"what changed and by whom"*; effective dating answers *"what was true on date D"* — only the second supports retro payroll, statutory reproducibility, and forward modeling.

### 1.2 Row-versioning lifecycle
Physical signature of a date-tracked table:
- Stable business surrogate key across versions (`PERSON_ID`, `ASSIGNMENT_ID`).
- Per-row PK typically `(<surrogate_id>, EFFECTIVE_START_DATE)`.
- `EFFECTIVE_START_DATE`, `EFFECTIVE_END_DATE` (closed-closed segment).
- `EFFECTIVE_LATEST_CHANGE` / effective-sequence for same-day ordering.
- **Invariant:** per key, segments are contiguous and non-overlapping, last segment ends at the **Sentinel Date 31-DEC-4712**.

**UPDATE/CORRECTION ("Correct"):** fix value *within the current segment boundaries*. No new row; time geometry preserved, content rewritten. For data-entry fixes.

**UPDATE/UPDATE ("Update" — real business event, splits timeline):** change effective `D` →
```
Row A: ID=100 ESD=01-JAN-2024 EED=31-MAY-2024 SAL=10000   (old slice end-dated to D-1)
Row B: ID=100 ESD=01-JUN-2024 EED=31-DEC-4712 SAL=12000   (new open slice)
```

**Future-dated entry:** new row committed immediately with `ESD` in the future; activation is **implicit** via the date predicate (no flag to flip, no cron required) — any as-of query >= ESD resolves to it.

**Same-day sequence override:** two events on the same date are ordered by `EFFECTIVE_SEQUENCE` so retro pay and reconstruction are deterministic. Point-in-time queries pick `MAX(effective_sequence)` / `EFFECTIVE_LATEST_CHANGE='Y'`.

### 1.3 Sentinel date 31-DEC-4712 (vs NULL)
- A real terminal value keeps as-of predicates a pure indexable range (`:d BETWEEN ESD AND EED`) instead of `(EED IS NULL OR :d <= EED)` which defeats B-tree range access and worsens CBO cardinality.
- Enables range/interval partitioning on `EFFECTIVE_END_DATE`: live rows cluster in the sentinel partition → partition pruning on the hot current-state path.
- Makes contiguity checks arithmetic (`prev.EED + 1 = next.ESD`), never null-aware.

> **Avaniis delta:** uses `NULL` for open ends, not a sentinel — see `19` §5. This is why the dead `effectiveOn()` helper has to emit `OR IS NULL`.

---

## PART 2 — KEY DATETRACKED OBJECTS (the `_F` spine)

> Format: Table → surrogate key → DateTrack columns → entity. `_F`=date-tracked, `_F_TL`=date-tracked translation, `_M`=master/anchor. Only genuinely date-tracked / verified Fusion objects listed; module families that are large are marked `[bounded]` rather than padded with invented names.

### PER_ — Global HR / Worker
- **PER_ALL_PEOPLE_F** — `PERSON_ID` — ESD/EED — date-tracked person attributes; anchored by non-tracked **PER_PERSONS**.
- **PER_PERSON_NAMES_F** / **_F_TL** — `PERSON_NAME_ID` (+LANGUAGE) — ESD/EED — names by NAME_TYPE; legal-name changes time-sliced.
- **PER_PEOPLE_LEGISLATIVE_F** — `PERSON_LEGISLATIVE_ID` — ESD/EED — sex/marital/education driving statutory logic.
- **PER_PERSON_TYPE_USAGES_M** — `PERSON_TYPE_USAGE_ID` — ESD/EED — worker-type transitions over time.
- **PER_ALL_ASSIGNMENTS_M** — `ASSIGNMENT_ID` — ESD/EED + `EFFECTIVE_SEQUENCE` + `EFFECTIVE_LATEST_CHANGE` — **the core object**: job/position/grade/org/location/manager-drivers/FTE/status/payroll/legal-employer/BU.
- **PER_ASSIGNMENT_SUPERVISORS_F** — `ASSIGNMENT_SUPERVISOR_ID` — ESD/EED — manager by MANAGER_TYPE; "who was X's manager on D".
- **PER_PERIODS_OF_SERVICE** — `PERIOD_OF_SERVICE_ID` — `DATE_START`/`ACTUAL_TERMINATION_DATE` envelope (not `_F`).
- **PER_ADDRESSES_F** — `ADDRESS_ID` — ESD/EED — residence-on-date drives tax jurisdiction.
- **PER_VISAS_PERMITS_F** — `VISA_PERMIT_ID` — ESD/EED — work authorization in force on a date.
- **PER_CONTRACTS_F** — `CONTRACT_ID` — ESD/EED — employment contract governing notice/term.
- `[bounded]` Extra-info `*_EXTRA_INFO_F` (e.g. PER_PEOPLE_EXTRA_INFO_F, PER_ASSIGNMENT_EXTRA_INFO_F) follow `<id>+ESD/EED`.

### Workforce structures (PER_/HR_)
- **HR_ORGANIZATION_UNITS_F** / **_F_TL** — `ORGANIZATION_ID` — ESD/EED — departments/divisions/legal entities/BUs as orgs.
- **HR_ORG_UNIT_CLASSIFICATIONS_F** — `ORG_CLASSIFICATION_ID` — ESD/EED — Legal Employer / PSU / TRU classifications per period.
- **PER_ALL_POSITIONS_M** / **HR_ALL_POSITIONS_F** (+ _F_TL) — `POSITION_ID` — ESD/EED — positions, reports-to, budget.
- **PER_JOBS_F** / **_F_TL** — `JOB_ID` — ESD/EED.
- **PER_GRADES_F** / **_F_TL**, **PER_GRADE_STEPS_F**, **PER_GRADE_RATES_F**, **PER_RATES_F**, **PER_RATE_VALUES_F** — grade ladders/rate ranges per date (compa-ratio basis).
- **PER_LOCATION_DETAILS_F** — `LOCATION_DETAILS_ID` — ESD/EED — location detail (tax jurisdiction).
- Hierarchies = **FND_TREE / FND_TREE_NODE** with effective-dated **TREE_VERSION**.

### Compensation & Benefits (CMP_/BEN_)
- **CMP_SALARY** — `SALARY_ID` — `DATE_FROM`/`DATE_TO` — base salary records (new action end-dates prior).
- **BEN_PGM_F / BEN_PL_F / BEN_PL_TYP_F / BEN_OPT_F** — program/plan/type/option setup, ESD/EED.
- **BEN_PRTT_ENRT_RSLT_F** — `PRTT_ENRT_RSLT_ID` — ESD/EED — core enrollment result (coverage in force on date).
- **BEN_ELIG_PER_F / BEN_ELIG_PER_OPT_F** — eligibility over time. **BEN_ENRT_RT_F** — enrollment rates.
- `[bounded]` BEN_ is a large `_F` family (dependents, beneficiaries, premiums) all `<id>+ESD/EED`.

### Payroll (PAY_)
- **PAY_PAY_RELATIONSHIPS_DN** — `PAYROLL_RELATIONSHIP_ID` — START/END — calc-aggregation anchor.
- **PAY_ASSIGNED_PAYROLLS_F** — `ASSIGNED_PAYROLL_ID` — ESD/EED — payroll-definition assignment.
- **PAY_ELEMENT_TYPES_F** (+_F_TL), **PAY_INPUT_VALUES_F** (+_F_TL) — element & input-value defs.
- **PAY_ELEMENT_ENTRIES_F** — `ELEMENT_ENTRY_ID` — ESD/EED — transactional pay input over time.
- **PAY_ELEMENT_ENTRY_VALUES_F** — `ELEMENT_ENTRY_VALUE_ID` — ESD/EED — the amount in force on a date.
- **PAY_ELEMENT_LINKS_F / PAY_LINK_INPUT_VALUES_F** — eligibility links.
- **Calculation Cards (DIR):** **PAY_DIR_CARDS_F / PAY_DIR_CARD_COMPONENTS_F / PAY_DIR_CARD_COMP_DTLS_F / PAY_DIR_COMP_VALUES_F** — statutory/tax setup per date.
- **PAY_COST_ALLOCATIONS_F / PAY_COST_ALLOC_ACCOUNTS_F** — costing distribution over time.
- **PAY_PAYROLLS_F** (+_F_TL) — payroll definitions.
- **NOT date-tracked (immutable facts):** PAY_PAYROLL_ACTIONS, PAY_PAYROLL_REL_ACTIONS, PAY_RUN_RESULTS, PAY_RUN_RESULT_VALUES, PAY_RUN_BALANCES. **Design rule: inputs are date-tracked (retro-correctable); outputs are stamped immutable facts.**

### Absence / Time / Talent (ANC_/HWM_/HRT_)
- **ANC_ABSENCE_PLANS_F** (+_F_TL), **ANC_ABSENCE_TYPES_F** (+_F_TL) — plan/type defs per date.
- **ANC_PER_ABS_ENTRIES** — START/END absence events (not `_F`).
- **ANC_PER_PLAN_ENRT** + accrual detail — date-effective enrollment; computed balances stamped.
- **HWM_** time records — timestamped events (not `_F`).
- **HRT_PROFILES_B / HRT_PROFILE_ITEMS** — talent content with validity ranges (not `_F`-split). Goal/performance = cycle-scoped, **not** date-tracked.

---

## PART 3 — TEMPORAL SQL PATTERNS (defensive)

### 3.1 Point-in-time snapshot (one row/worker, no Cartesian explosion)
Rule: **every date-tracked table gets its own `BETWEEN :as_of` predicate.**
```sql
SELECT papf.person_id, ppnf.full_name, paam.assignment_id, pjf.name job, houf.name dept
FROM   per_all_people_f papf
JOIN   per_person_names_f ppnf ON ppnf.person_id=papf.person_id AND ppnf.name_type='GLOBAL'
       AND :as_of BETWEEN ppnf.effective_start_date AND ppnf.effective_end_date
JOIN   per_all_assignments_m paam ON paam.person_id=papf.person_id AND paam.assignment_type='E'
       AND paam.effective_latest_change='Y'
       AND :as_of BETWEEN paam.effective_start_date AND paam.effective_end_date
LEFT JOIN per_jobs_f pjf ON pjf.job_id=paam.job_id
       AND :as_of BETWEEN pjf.effective_start_date AND pjf.effective_end_date
LEFT JOIN hr_organization_units_f houf ON houf.organization_id=paam.organization_id
       AND :as_of BETWEEN houf.effective_start_date AND houf.effective_end_date
WHERE :as_of BETWEEN papf.effective_start_date AND papf.effective_end_date
  AND paam.primary_assignment_flag='Y' AND paam.assignment_status_type='ACTIVE_ASSIGN';
```

### 3.2 Delta / mid-period change detection (self-join to predecessor)
```sql
SELECT curr.person_id, curr.assignment_id, curr.effective_start_date change_date,
       prev.job_id old_job, curr.job_id new_job, prev.organization_id old_org, curr.organization_id new_org
FROM per_all_assignments_m curr
LEFT JOIN per_all_assignments_m prev
  ON prev.assignment_id=curr.assignment_id
 AND prev.effective_end_date=curr.effective_start_date-1   -- contiguous predecessor
 AND prev.effective_latest_change='Y'
WHERE curr.effective_latest_change='Y' AND curr.assignment_type='E'
  AND curr.effective_start_date BETWEEN :win_start AND :win_end
  AND (NVL(prev.job_id,-1)<>NVL(curr.job_id,-1) OR NVL(prev.organization_id,-1)<>NVL(curr.organization_id,-1));
```

### 3.3 Three common errors → defensive mitigation
1. **Missing per-table date predicate / no latest-change** → inflated headcount/Cartesian. *Fix:* one `BETWEEN :as_of` per `_F` table + `EFFECTIVE_LATEST_CHANGE='Y'` + `PRIMARY_ASSIGNMENT_FLAG='Y'`. Audit: count `_F` tables == count `BETWEEN`s.
2. **Summing date-tracked inputs as if facts** → duplicate payouts (multiple slices per period). *Fix:* report paid money from immutable `PAY_RUN_RESULT_VALUES` scoped to a specific `PAYROLL_ACTION_ID`; never `SUM()` input slices.
3. **NULL/sentinel & boundary off-by-one** → dropped current rows or one-day overlaps. *Fix:* standardize sentinel `TO_DATE('4712/12/31','YYYY/MM/DD')`, closed-closed `BETWEEN`, contiguity `prev.EED=curr.ESD-1`, overlap `ESD<=:win_end AND EED>=:win_start`. ETL assertion: per key `MAX(EED)=sentinel` and zero gaps.

> **Mental model:** a date-tracked table is a piecewise-constant function of time per key. Reads evaluate at a point (one BETWEEN/table) or over an interval (overlap + predecessor join); writes preserve contiguity to the sentinel; never blur date-tracked input with stamped result.
