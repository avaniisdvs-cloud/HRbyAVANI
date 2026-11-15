# Core HR Performance Validation Checklist

> Complements `docs/environment/CORE-HR-PERFORMANCE-READINESS.md`. The executable
> synthetic smoke (`pnpm perf:core-hr:smoke`) is green; **full closure requires a
> production-like, DB-backed run** (k6 in `tests/performance/`) against realistic
> headcount + concurrency.

## 1. Executable smoke (available now, CI-safe)
- [ ] `pnpm perf:core-hr:smoke` → exit 0, all checks within thresholds
- [ ] `PERF_SMOKE_HEADCOUNT=20000 pnpm perf:core-hr:smoke` → still within FAIL thresholds
- Note: synthetic/in-memory; algorithmic regression guard only — **not** a load test.

## 2. Production-like run (required for full closure — P1)
Prerequisite: an Azure staging/prod-like environment with realistic seeded data.
- [ ] Seed/clone dataset at target headcount (≤500 employees; test headroom 2–5×)
- [ ] Run k6 (`tests/performance/k6-load-test.js`, `k6-soak-test.js`)
- [ ] Capture p50 / p95 / p99 latency + error rate per endpoint

## 3. Focus areas + target thresholds (tune per SLO)
| Area | Endpoint(s) | Target p95 | Result |
|---|---|---|---|
| People search | `/persons`, directory | ≤ 800 ms | ☐ |
| Reports | `/reports`, dashboards | ≤ 1500 ms | ☐ |
| Approvals queue | `/approvals` | ≤ 800 ms | ☐ |
| Absence calendar | `/absence/calendar` | ≤ 1000 ms | ☐ |
| Exports (CSV) | report export | ≤ 3000 ms (or stream) | ☐ |
| Auth/login | sign-in + callback | ≤ 1500 ms | ☐ |

> Thresholds are starting targets — confirm against the agreed SLO before sign-off.

## 4. Production-like data requirement
- [ ] Dataset representative of real distribution (departments, managers, multi-year leave)
- [ ] Concurrency models real usage (concurrent logins + approvals)
- [ ] Large-export path validated; add pagination/streaming where any full-set query
      exceeds target (e.g. `reports/page.tsx` CSV path)

## 5. Sign-off
| Item | Owner | Status |
|---|---|---|
| Synthetic smoke green | Eng | ☐ |
| Prod-like load run executed | IT | ☐ |
| Thresholds met / exceptions accepted | IT + Business | ☐ |
