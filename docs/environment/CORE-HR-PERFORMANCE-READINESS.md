# Core HR Performance Readiness

> Status: **Partially closed** — executable local/CI smoke added; full closure pending production-like, DB-backed load test (blocker P-8).

This document records the performance readiness posture for the Core HR-only
production release and the executable checks that back it.

## What exists now

### 1. Executable algorithmic smoke (local/CI-safe)
`scripts/core-hr-performance-smoke.mjs` — run with:

```bash
pnpm perf:core-hr:smoke                      # default 5,000 employees
PERF_SMOKE_HEADCOUNT=20000 pnpm perf:core-hr:smoke
node scripts/core-hr-performance-smoke.mjs --headcount 10000
```

It is **safe**: no database, no network, no production data. It generates
synthetic data in memory and times the algorithmic shapes that dominate
high-volume Core HR surfaces, with per-check WARN/FAIL thresholds and a non-zero
exit on FAIL (so CI can gate a regression):

| Check | Represents |
|---|---|
| `org-chart-build` | Org chart parent→children map |
| `reporting-chains` | Manager-chain walks (org chart / approvals routing) |
| `people-search` | `/persons`, directory search filter |
| `sort-and-paginate` | Employee/person list & grid pages |
| `approvals-queue` | Approvals queue filter + group |
| `absence-calendar-bucket` | Absence calendar day bucketing |
| `csv-export-full` | Reports / full-set CSV export |

This catches algorithmic regressions (e.g. an accidental O(n²) in list/search/
export) before they reach a load test. It is **not** a substitute for a
DB-backed test.

### 2. Existing k6 load harness
`tests/performance/` contains k6 scripts (`k6-load-test.js`, `k6-soak-test.js`,
`k6-geo-probe.js`) and a `soak-test-runbook.md`. These are the vehicle for the
production-like execution below.

## What remains pending (P-8 — for full closure)

Run against a **production-faithful** dataset and concurrency, NOT synthetic
in-memory data:

- [ ] Seed/clone a dataset at realistic headcount (target ≤ 500 employees for
      this client; test headroom at 2–5×).
- [ ] k6 load test: concurrent logins, people list/search, approvals, absence
      calendar, large report/CSV export.
- [ ] Capture p50/p95/p99 latency + error rate per endpoint; record against SLOs.
- [ ] Add pagination/streaming where any full-set query exceeds target
      (`reports/page.tsx` CSV path called out in P-8).
- [ ] Re-run on the isolated Azure production-equivalent environment (P-1).

Until those are executed and recorded, performance remains **partially closed**.
