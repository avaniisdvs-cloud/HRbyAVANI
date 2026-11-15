# AVANIIS HCM — k6 Load Test: Setup, Results & Staging Runbook

> Last updated: 2026-05-22  
> k6 v2.0.0 installed: `/opt/homebrew/bin/k6`  
> NFR sign-off environment: **Vercel (fra1) + Neon (eu-central-1)**  
> **NFR STATUS: ✅ ALL 5 THRESHOLDS PASS — SIGN-OFF ISSUED (commit a01dc1b)**

---

## Current status

| Environment | NFR-01 (p95 < 2000ms) | NFR-02 (p95 < 500ms) | NFR-04 (error < 1%) | Valid for sign-off? |
|---|---|---|---|---|
| MacBook laptop (2026-05-21) | ❌ FAIL — 60,001ms | ✅ PASS — 9.9ms | ✅ 0% | **NO** |
| Vercel fra1 run 1 (2026-05-22, commit 3cd34db) | ❌ FAIL — 2,987ms | ✅ 289ms | ✅ 0.45% | NO |
| **Vercel fra1 run 2 (2026-05-22, commit a01dc1b)** | **✅ PASS — 1,143ms** | **✅ 294ms** | **✅ 0.0%** | **✅ YES — SIGNED OFF** |

**Laptop failure reason:** CPU co-location — k6 runner and Next.js server compete on the same MacBook cores. Not an application defect.

**Run 1 failure reason:** 6 sequential DB queries on dashboard held Neon connections simultaneously at 480-500 VU. Fixed by Promise.all parallelisation in commit a01dc1b.

---

## Fixes applied to reach NFR sign-off

| Commit | File | Fix | Impact |
|---|---|---|---|
| `70a9459` | `lib/db.ts` | `max:1` pool + `ssl:require` + `idle_timeout:20s` for production | Prevented Neon connection exhaustion |
| `3cd34db` | `vercel.json` | `"regions": ["fra1"]` — co-locate with Neon eu-central-1 | DB latency 100ms → <5ms; dashboard warm TTFB 1.73s → 0.44s |
| `a01dc1b` | `app/(hr-admin)/dashboard/page.tsx` | `Promise.all` — parallelise 6 sequential DB queries | Connection hold time 6× → 1×; zero timeouts at 500 VU |

---

## k6 metric fix (applied 2026-05-21)

Previous version under-reported errors — timeouts have `status=0`, which is not `>= 400`:

```js
// BEFORE (wrong — misses timeouts)
errorRate.add(res.status >= 400)

// AFTER (correct — status=0 means connection failure/timeout)
errorRate.add(res.status === 0 || res.status >= 400)
```

Both `loadPage()` and `apiCall()` helpers are fixed in `tests/performance/k6-load-test.js`.  
Explicit `timeout: '10s'` (pages) and `timeout: '5s'` (API) are also set so tests fail fast.

---

## Staging run — exact commands

### Step 1: Obtain staging AUTH_COOKIE

```bash
# Option A — browser (preferred for one-off)
# 1. Open https://staging.avaniis.dev in Chrome
# 2. Sign in with the staging HR Admin SSO account (d.kethari@avaniis.example or staging equivalent)
# 3. DevTools (F12) → Application → Storage → Cookies → https://staging.avaniis.dev
# 4. Copy: authjs.session-token=<value>
# 5. Also copy: authjs.csrf-token=<value>

# Option B — staging Playwright setup (CI-safe)
# Run the auth setup against staging:
PLAYWRIGHT_BASE_URL=https://staging.avaniis.dev \
  pnpm playwright test --project=setup-hr-admin

# Then extract from storageState:
AUTH=$(cat tests/e2e/auth/hr-admin.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
parts=['='.join([c['name'],c['value']]) for c in d.get('cookies',[])]
print('; '.join(parts))
")
echo "Cookie: ${AUTH:0:80}..."  # preview first 80 chars
```

### Step 2: Run k6 against staging

```bash
# Full run — saves results to tests/performance/k6-results-staging.json
k6 run \
  -e BASE_URL=https://staging.avaniis.dev \
  -e "AUTH_COOKIE=${AUTH}" \
  --out json=tests/performance/k6-results-staging.json \
  tests/performance/k6-load-test.js

# Expected exit code:
#   0  = all thresholds pass → update verdict to READY
#   99 = one or more thresholds breached → investigate, do NOT mark READY
```

### Step 3: Validate results

```bash
# Quick summary (printed by handleSummary)
cat tests/performance/k6-results-staging.json | python3 -m json.tool

# All six thresholds must show PASS:
#   NFR-01 status: PASS   (page_load_p95_ms < 2000)
#   NFR-02 status: PASS   (api_resp_p95_ms  < 500)
#   NFR-04 status: PASS   (error_rate       < 0.01)
#   checks rate  : > 0.95 (95% of check assertions pass)
```

---

## Thresholds — READY criteria

All five thresholds must pass (k6 exit code 0):

| Threshold | Metric | Required value |
|---|---|---|
| NFR-01 | `http_req_duration{type:page}` p95 | `< 2000ms` |
| NFR-02 | `http_req_duration{type:api}` p95 | `< 500ms` |
| NFR-04 | `error_rate` (incl. timeouts) | `< 1%` |
| Overall p95 | `http_req_duration` p95 | `< 3000ms` |
| Check pass rate | `checks` rate | `> 95%` |

A single threshold breach = k6 exits with code 99 = **NOT READY**.

---

## Workload model

| Stage | VUs | Duration | Purpose |
|---|---|---|---|
| Ramp | 0 → 50 | 30s | Warm pools |
| Ramp | 50 → 200 | 60s | Medium load |
| Sustain | 200 → 500 | 120s | NFR-04 target |
| Ramp down | 500 → 0 | 30s | Graceful stop |

**Pages tested:** `/dashboard` (complex SSR), `/persons` (paginated DB), `/absence` (leave rules), `/org-chart` (recursive CTE)  
**API tested:** `/api/health` (lightweight), `/api/org-chart` (recursive CTE, JSON)

---

## Result file locations

| File | Purpose |
|---|---|
| `tests/performance/k6-results.json` | Latest laptop run (not valid for sign-off) |
| `tests/performance/k6-results-staging.json` | Staging run result (required for READY) |

Both files are gitignored (build artifacts). Store the staging result as a CI artifact or copy into QA documentation.

---

## CI integration (after staging is live)

```yaml
# .github/workflows/nfr-load-test.yml
name: NFR Load Test (Staging)
on:
  workflow_dispatch:        # manual trigger only
  schedule:
    - cron: '0 2 * * 1'    # weekly Monday 2am UAE time (off-peak)

jobs:
  k6-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/setup-k6-action@v1
      - name: Run k6 load test
        env:
          BASE_URL:    ${{ secrets.STAGING_URL }}
          AUTH_COOKIE: ${{ secrets.STAGING_AUTH_COOKIE }}
        run: |
          k6 run \
            -e BASE_URL="$BASE_URL" \
            -e "AUTH_COOKIE=$AUTH_COOKIE" \
            --out json=tests/performance/k6-results-staging.json \
            tests/performance/k6-load-test.js
      - uses: actions/upload-artifact@v4
        with:
          name: k6-staging-results
          path: tests/performance/k6-results-staging.json
```
