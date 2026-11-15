/**
 * k6 Load Test Script — NFR-01, NFR-02, NFR-04
 *
 * Prerequisites:
 *   brew install k6                   (macOS — v2.0.0 installed)
 *   apt install k6                    (Ubuntu/CI)
 *
 * Staging usage (the ONLY valid environment for NFR sign-off):
 *   k6 run \
 *     -e BASE_URL=http://localhost:3001 \
 *     -e "AUTH_COOKIE=$(cat tests/performance/staging-auth-cookie.txt)" \
 *     --out json=tests/performance/k6-results-staging.json \
 *     tests/performance/k6-load-test.js
 *
 * Auth cookie — obtain via Playwright extraction script:
 *   npx tsx scripts/extract-staging-cookie.ts
 *   # Saves cookie string to tests/performance/staging-auth-cookie.txt automatically
 *
 * Or manually from staging browser session:
 *   1. Open http://localhost:3001/sign-in in Chrome
 *   2. Sign in with hr.admin@avaniis.dev / demo (dev account)
 *   3. DevTools → Application → Cookies → copy all three authjs.* values
 *   4. Pass as: AUTH_COOKIE="__Secure-authjs.session-token=<value>"
 *
 * DO NOT run this against localhost for NFR sign-off. Local laptop results
 * are invalid due to CPU co-location with the test runner.
 *
 * NFR targets:
 *   NFR-01: page load     < 2000ms p95
 *   NFR-02: API response  < 500ms  p95
 *   NFR-04: error rate    < 1%     at 500 VUs (including timeouts)
 */

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

// ── Custom metrics ─────────────────────────────────────────────────────────────

const pageLoadP95  = new Trend('page_load_p95',  true)
const apiRespP95   = new Trend('api_resp_p95',   true)
const errorRate    = new Rate('error_rate')

// ── Test configuration ─────────────────────────────────────────────────────────

export const options = {
  stages: [
    { duration: '30s',  target: 50  }, // ramp to 50 VUs
    { duration: '60s',  target: 200 }, // ramp to 200 VUs
    { duration: '120s', target: 500 }, // sustain 500 VUs (NFR-04)
    { duration: '30s',  target: 0   }, // ramp down
  ],
  thresholds: {
    // NFR-01: page load < 2000ms p95
    'http_req_duration{type:page}': ['p(95)<2000'],
    // NFR-02: API response < 500ms p95
    'http_req_duration{type:api}':  ['p(95)<500'],
    // NFR-04: error rate < 1% — NOW includes timeouts (status=0) and 4xx/5xx
    'error_rate':                   ['rate<0.01'],
    // Overall p95 guard (catches pages not tagged as 'page')
    'http_req_duration':            ['p(95)<3000'],
    // At least 95% of checks must pass (status 200, timing targets)
    'checks':                       ['rate>0.95'],
  },
}

const BASE_URL    = __ENV.BASE_URL    || 'http://localhost:3000'
const AUTH_COOKIE = __ENV.AUTH_COOKIE || ''

const headers = {
  Cookie:       AUTH_COOKIE,
  'User-Agent': 'k6-nfr-test/1.0',
  Accept:       'text/html,application/json',
}

// ── Scenario helpers ──────────────────────────────────────────────────────────

function loadPage(path) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers,
    tags:    { type: 'page' },
    timeout: '10s',
  })
  pageLoadP95.add(res.timings.duration)
  // FIX: status=0 means request failed (timeout/connection refused) — count as error
  // Previous version only counted status>=400, missing timeouts entirely.
  errorRate.add(res.status === 0 || res.status >= 400)
  return res
}

function apiCall(path) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { ...headers, Accept: 'application/json' },
    tags:    { type: 'api' },
    timeout: '5s',
  })
  apiRespP95.add(res.timings.duration)
  // FIX: same timeout-counting fix applied to API calls
  errorRate.add(res.status === 0 || res.status >= 400)
  return res
}

// ── Main VU scenario ─────────────────────────────────────────────────────────
// Simulates a realistic HR Admin session covering the highest-traffic pages.
// VUs rotate through the scenario with think time between page loads.

export default function () {
  // NFR-02 — lightweight health check first (validates server is responsive)
  const healthRes = apiCall('/api/health')
  check(healthRes, {
    'Health: status 200':       (r) => r.status === 200,
    'Health: < 500ms (NFR-02)': (r) => r.timings.duration < 500,
  })
  sleep(0.3)

  // NFR-01 — Page load: Dashboard (highest traffic, complex SSR)
  const dashRes = loadPage('/dashboard')
  check(dashRes, {
    'Dashboard: status 200':        (r) => r.status === 200,
    'Dashboard: < 2000ms (NFR-01)': (r) => r.timings.duration < 2000,
  })
  sleep(0.5)

  // NFR-01 — Page load: Persons list (paginated DB query)
  const personsRes = loadPage('/persons')
  check(personsRes, {
    'Persons: status 200':        (r) => r.status === 200,
    'Persons: < 2000ms (NFR-01)': (r) => r.timings.duration < 2000,
  })
  sleep(0.5)

  // NFR-01 — Page load: Absence management (leave rule computation)
  const absenceRes = loadPage('/absence')
  check(absenceRes, {
    'Absence: status 200':        (r) => r.status === 200,
    'Absence: < 2000ms (NFR-01)': (r) => r.timings.duration < 2000,
  })
  sleep(0.5)

  // NFR-01 — Page load: Org chart (recursive CTE + xyflow render)
  const orgRes = loadPage('/org-chart')
  check(orgRes, {
    'OrgChart: status 200':        (r) => r.status === 200,
    'OrgChart: < 2000ms (NFR-01)': (r) => r.timings.duration < 2000,
  })
  sleep(0.5)

  // NFR-02 — API: Search endpoint (DB-backed typeahead, representative API read)
  // Note: /api/org-chart does not exist as a REST endpoint — org chart data is
  // fetched via Next.js Server Actions/RSC, not a standalone API route.
  // /api/search is the correct representative DB-backed API endpoint.
  const searchRes = apiCall('/api/search?q=test')
  check(searchRes, {
    'Search API: not 5xx':    (r) => r.status < 500,
    'Search API: < 800ms':    (r) => r.timings.duration < 800,
  })
  sleep(0.3)

  // Think time between full scenario iterations (1–3s)
  sleep(Math.random() * 2 + 1)
}

// ── Summary handler ──────────────────────────────────────────────────────────

export function handleSummary(data) {
  const duration   = data.metrics['http_req_duration']
  const pageLoad   = data.metrics['http_req_duration{type:page}']
  const apiResp    = data.metrics['http_req_duration{type:api}']
  const errRate    = data.metrics['error_rate']?.values?.rate ?? 1
  const checkRate  = data.metrics['checks']?.values?.rate ?? 0

  const nfr01p95   = pageLoad?.values?.['p(95)'] ?? 9999
  const nfr02p95   = apiResp?.values?.['p(95)']  ?? 9999
  const peakVus    = data.metrics['vus']?.values?.max ?? 0

  const summary = {
    run_environment: __ENV.BASE_URL || 'http://localhost:3000',
    nfr_results: {
      'NFR-01 page_load_p95_ms':    nfr01p95,
      'NFR-01 threshold_ms':        2000,
      'NFR-01 status':              nfr01p95 < 2000 ? 'PASS' : 'FAIL',
      'NFR-02 api_resp_p95_ms':     nfr02p95,
      'NFR-02 threshold_ms':        500,
      'NFR-02 status':              nfr02p95 < 500 ? 'PASS' : 'FAIL',
      'NFR-04 peak_vus':            peakVus,
      'NFR-04 target_vus':          500,
      'NFR-04 error_rate':          errRate,
      'NFR-04 error_rate_threshold': 0.01,
      'NFR-04 status':              errRate < 0.01 ? 'PASS' : 'FAIL',
      'check_pass_rate':            checkRate,
      'overall_p95_ms':             duration?.values?.['p(95)'] ?? 'N/A',
    },
    // k6 thresholds breached (if any) determine the exit code
    // exit code 0 = all thresholds pass = READY for NFR sign-off
    // exit code 99 = at least one threshold breached = NOT READY
  }

  return {
    'tests/performance/k6-results.json': JSON.stringify(summary, null, 2),
    stdout: JSON.stringify(summary.nfr_results, null, 2),
  }
}
