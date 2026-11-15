# Performance & Load-Testing Readiness Pack

> **Status: PARTIALLY CLOSED.** Plan, scenarios, checklists, and thresholds exist. **Full closure requires execution against production-like data volumes** (not real production data) with evidence — pending.

## 1. Scope & risk areas (from source review)
- **Reports/exports** (`reports/page.tsx`): filter-then-render with CSV export — full-set queries; risk at high headcount. Check pagination/streaming for large exports.
- **Dashboards**: aggregate counts (`select count(*) …`) per role — watch fan-out.
- **Org chart** (`/org-chart`): hierarchy build — watch recursion/N+1 on large trees.
- **Persons list** (`/persons`): list + filters — confirm server-side pagination.
- **Approvals / workflow_intelligence_view**: LATERAL joins + subqueries — verify plan at volume.

## 2. Realistic HR data volumes (test targets)
| Entity | Small | Target | Stress |
|---|---|---|---|
| Persons | 500 | 5,000 | 20,000 |
| Departments | 50 | 300 | 1,000 |
| Absence entries | 2,000 | 50,000 | 250,000 |
| Workflow instances | 500 | 10,000 | 50,000 |
| Documents | 1,000 | 25,000 | 100,000 |
Generate synthetic data in a **production-like (NOT production)** DB; never use real PII.

## 3. Scenarios
1. Dashboard load (each role) cold + warm.
2. Persons list: page 1, deep page, with filters + search.
3. Reports: each report render + CSV export at Target + Stress volumes.
4. Approvals inbox + `workflow_intelligence_view` query at Target volume.
5. Concurrent users: 50 / 200 / 500 concurrent reads; 20 concurrent approval decisions.
6. Org chart render for a 5,000-person hierarchy.

## 4. Acceptance thresholds (initial; tune with business)
- p95 page TTFB ≤ 800 ms (warm); ≤ 2.5 s cold.
- Report render ≤ 3 s at Target; CSV export ≤ 10 s at Target (else stream/paginate).
- No single query > 1 s at Target (capture `EXPLAIN ANALYZE` for outliers).
- Error rate < 0.1% under concurrent load; no 5xx.

## 5. N+1 / unbounded-query review checklist
- [ ] Every list route has server-side pagination (LIMIT/OFFSET or keyset).
- [ ] No per-row query inside a `.map()` over a result set (batch/join instead).
- [ ] Exports stream or cap rows; large exports are async/queued if needed.
- [ ] `workflow_intelligence_view` consumers filter by tenant + status (indexed).
- [ ] Dashboard aggregates use indexed columns; no full scans on hot paths.

## 6. How to run (local/CI-safe smoke; full run is pending prod-like data)
- Lightweight smoke (no new heavy deps): the `uat` Playwright project records per-page timings; `softAssertPageHealth` captures 5xx. Use it as a **functional perf smoke** against the local DB (seeded volume).
- Full load test (separate effort): use k6/Artillery against a production-like environment; do NOT add the dependency until the load-test effort is scheduled. Capture p50/p95/p99 + `EXPLAIN ANALYZE` for the §1 hot paths.

## 7. Closure criteria
- [ ] Production-like dataset generated (Target + Stress).
- [ ] Scenarios executed; thresholds (§4) met or exceptions accepted.
- [ ] Hot-path `EXPLAIN ANALYZE` reviewed; pagination gaps fixed.
- [ ] Evidence attached to the go-live record.
