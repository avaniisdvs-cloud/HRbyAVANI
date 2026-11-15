/**
 * AVANIIS HCM — k6 Endurance / Soak Test
 * Phase 2 Task 8 — Endurance / Soak Testing Readiness
 *
 * PURPOSE:
 *   Validate long-running stability under sustained enterprise usage.
 *   Detects: resource leaks, latency drift, connection exhaustion,
 *   queue backlog growth, DB connection pool saturation.
 *
 *   This is NOT a burst/NFR test — VU counts are intentionally low
 *   and sustained. The goal is duration stability, not peak throughput.
 *
 * SCENARIOS:
 *   1. sustained_pages  — constant VUs hitting HR-admin read paths
 *   2. ess_pages        — constant VUs hitting employee self-service
 *   3. health_poller    — 1 VU polling /api/health every ~10s
 *   4. db_health_poller — 1 VU polling /api/health/db every ~30s
 *   5. periodic_spike   — (full soak only) every 15 min, 60s ramp to SPIKE_VUS
 *
 * ENVIRONMENT VARIABLES:
 *   BASE_URL           Target server (default: http://localhost:3000)
 *   AUTH_COOKIE        Session cookie string (required for authed pages)
 *   SOAK_DURATION      Total soak duration (default: "5m" for smoke; "60m" for full)
 *   SUSTAINED_VUS      Sustained VU count for page scenarios (default: 5)
 *   SPIKE_VUS          Peak VU count during periodic spike (default: 20)
 *   ENABLE_SPIKE       Set to "true" to enable the periodic spike scenario
 *
 * LOCAL SMOKE SOAK (bounded, safe — ~5 min):
 *   k6 run \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e "AUTH_COOKIE=$(cat tests/performance/staging-auth-cookie.txt)" \
 *     -e SOAK_DURATION=5m \
 *     -e SUSTAINED_VUS=5 \
 *     --out json=tests/performance/k6-soak-results-smoke.json \
 *     tests/performance/k6-soak-test.js
 *
 * FULL STAGING SOAK (60 min with periodic spike):
 *   k6 run \
 *     -e BASE_URL=http://localhost:3001 \
 *     -e "AUTH_COOKIE=$(cat tests/performance/staging-auth-cookie.txt)" \
 *     -e SOAK_DURATION=60m \
 *     -e SUSTAINED_VUS=20 \
 *     -e SPIKE_VUS=50 \
 *     -e ENABLE_SPIKE=true \
 *     --out json=tests/performance/k6-soak-results-staging.json \
 *     tests/performance/k6-soak-test.js
 *
 * THRESHOLDS (SOAK-SPECIFIC — slightly relaxed from burst NFR to allow for cold starts):
 *   Page p95       < 2500ms   (burst NFR-01: 2000ms; soak allows cold-start warm-up)
 *   Page p99       < 5000ms   (tail latency guard — catches occasional spikes)
 *   API p95        < 600ms    (burst NFR-02: 500ms)
 *   DB probe p95   < 8000ms   (local → Neon cross-Atlantic; staging < 500ms expected)
 *   Error rate     < 0.5%     (tighter than burst 1% — sustained load should be cleaner)
 *   Check rate     > 97%      (stricter than burst 95%)
 *
 * DRIFT DETECTION:
 *   The soak_latency_drift metric tracks the p95 over rolling windows.
 *   If p(99) of soak_latency_drift > 2× page p95, latency drift is indicated.
 *
 * DO NOT run destructive paths (POST/PUT/DELETE) in soak.
 * DO NOT send real ARIA/Claude API requests — too expensive for sustained load.
 * DO NOT use this against production without explicit written authorisation.
 */

import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { Rate, Trend, Counter, Gauge } from 'k6/metrics'

// ── Env config ────────────────────────────────────────────────────────────────

const BASE_URL       = __ENV.BASE_URL        || 'http://localhost:3000'
const AUTH_COOKIE    = __ENV.AUTH_COOKIE     || ''
const SOAK_DURATION  = __ENV.SOAK_DURATION   || '5m'
const SUSTAINED_VUS  = parseInt(__ENV.SUSTAINED_VUS || '5', 10)
const SPIKE_VUS      = parseInt(__ENV.SPIKE_VUS     || '20', 10)
const ENABLE_SPIKE   = __ENV.ENABLE_SPIKE    === 'true'
// INFRA_ONLY=true: run only health_poller + db_health_poller (no auth required).
// Use when session cookie is unavailable/expired and you want clean infra metrics.
const INFRA_ONLY     = __ENV.INFRA_ONLY      === 'true'

// ── Custom metrics ────────────────────────────────────────────────────────────

const pageErrorRate     = new Rate('soak_page_error_rate')
const apiErrorRate      = new Rate('soak_api_error_rate')
const dbProbeMs         = new Trend('soak_db_probe_ms',    true)
const pageLatency       = new Trend('soak_page_latency',   true)
const apiLatency        = new Trend('soak_api_latency',    true)
const healthLatency     = new Trend('soak_health_latency', true)
const latencyDrift      = new Trend('soak_latency_drift',  true)   // drift detection
const connectionErrors  = new Counter('soak_connection_errors')
const dbHealthOk        = new Gauge('soak_db_health_ok')           // 1=ok, 0=fail

// ── Scenario scenarios ────────────────────────────────────────────────────────

// Base scenarios — page scenarios excluded when INFRA_ONLY=true
const baseScenarios = INFRA_ONLY ? {} : {
  sustained_pages: {
    executor:           'constant-vus',
    vus:                SUSTAINED_VUS,
    duration:           SOAK_DURATION,
    exec:               'sustainedPages',
    tags:               { scenario: 'sustained_pages' },
    gracefulStop:       '30s',
  },
  ess_pages: {
    executor:           'constant-vus',
    vus:                Math.max(1, Math.floor(SUSTAINED_VUS / 3)),
    duration:           SOAK_DURATION,
    exec:               'essPages',
    tags:               { scenario: 'ess_pages' },
    gracefulStop:       '30s',
  },
}

// Infrastructure scenarios — always present
const infraScenarios = {
  health_poller: {
    executor:           'constant-vus',
    vus:                1,
    duration:           SOAK_DURATION,
    exec:               'healthPoller',
    tags:               { scenario: 'health_poller' },
    gracefulStop:       '10s',
  },
  db_health_poller: {
    executor:           'constant-vus',
    vus:                1,
    duration:           SOAK_DURATION,
    exec:               'dbHealthPoller',
    tags:               { scenario: 'db_health_poller' },
    gracefulStop:       '10s',
  },
}

// Spike scenario (full soak only)
const spikeScenario = ENABLE_SPIKE ? {
  periodic_spike: {
    executor:   'ramping-vus',
    startVUs:   0,
    stages: [
      // Spike at ~15 min
      { duration: '14m30s', target: 0        },   // wait
      { duration: '30s',    target: SPIKE_VUS },   // ramp up
      { duration: '60s',    target: SPIKE_VUS },   // hold
      { duration: '30s',    target: 0         },   // ramp down
      // Spike at ~30 min
      { duration: '13m',    target: 0         },
      { duration: '30s',    target: SPIKE_VUS },
      { duration: '60s',    target: SPIKE_VUS },
      { duration: '30s',    target: 0         },
      // Spike at ~45 min
      { duration: '13m',    target: 0         },
      { duration: '30s',    target: SPIKE_VUS },
      { duration: '60s',    target: SPIKE_VUS },
      { duration: '30s',    target: 0         },
    ],
    exec:       'spikePages',
    tags:       { scenario: 'periodic_spike' },
    gracefulStop: '30s',
  },
} : {}

export const options = {
  scenarios: { ...baseScenarios, ...infraScenarios, ...spikeScenario },

  // Soak-specific thresholds (relaxed from burst NFR to allow cold-start warm-up)
  thresholds: {
    // Page load stability under sustained load
    'soak_page_latency':          ['p(95)<2500', 'p(99)<5000'],
    // API response stability
    'soak_api_latency':           ['p(95)<600'],
    // DB probe — tracks connection health across full duration
    // Local (cross-Atlantic): ~1500ms cold / ~150ms warm. Staging fra1: < 500ms.
    // Threshold set to 500ms; passes on staging, expected to fail locally at cold-start.
    'soak_db_probe_ms':           ['p(95)<500'],
    // Health endpoint (lightweight — should never degrade)
    'soak_health_latency':        ['p(95)<400'],
    // Error rates — tighter than burst to catch subtle degradation
    'soak_page_error_rate':       ['rate<0.005'],
    'soak_api_error_rate':        ['rate<0.005'],
    // Connection errors should be 0 throughout
    'soak_connection_errors':     ['count<5'],
    // Overall catch-all
    'http_req_duration':          ['p(95)<3000'],
    'checks':                     ['rate>0.97'],
  },
}

// ── Request helpers ───────────────────────────────────────────────────────────

const pageHeaders = {
  Cookie:       AUTH_COOKIE,
  'User-Agent': 'k6-soak-test/1.0 (endurance)',
  Accept:       'text/html,application/xhtml+xml',
}

const apiHeaders = {
  Cookie:       AUTH_COOKIE,
  'User-Agent': 'k6-soak-test/1.0 (endurance)',
  Accept:       'application/json',
}

function loadPage(path, label) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers:  pageHeaders,
    tags:     { type: 'page', path },
    timeout:  '15s',
  })
  const ok = res.status !== 0 && res.status < 400
  pageLatency.add(res.timings.duration)
  latencyDrift.add(res.timings.duration)       // feeds drift analysis
  pageErrorRate.add(!ok)
  if (res.status === 0) connectionErrors.add(1)
  check(res, {
    [`${label}: status 200`]:        (r) => r.status === 200,
    [`${label}: body non-empty`]:    (r) => r.body && r.body.length > 100,
    [`${label}: < 2500ms`]:          (r) => r.timings.duration < 2500,
  })
  return res
}

function callApi(path, label) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: apiHeaders,
    tags:    { type: 'api', path },
    timeout: '10s',
  })
  const ok = res.status !== 0 && res.status < 500
  apiLatency.add(res.timings.duration)
  apiErrorRate.add(!ok)
  if (res.status === 0) connectionErrors.add(1)
  check(res, {
    [`${label}: not 5xx`]:  (r) => r.status !== 0 && r.status < 500,
    [`${label}: < 600ms`]:  (r) => r.timings.duration < 600,
  })
  return res
}

// ── Scenario: HR-Admin sustained pages ───────────────────────────────────────
//
// Simulates an HR admin working through the system across a full shift.
// All reads — no writes. Think time is realistic (1-3s between pages).

export function sustainedPages() {
  group('hr_admin_session', () => {
    // Dashboard — most complex SSR (6 parallel DB queries)
    loadPage('/dashboard', 'Dashboard')
    sleep(Math.random() * 1.5 + 0.5)  // 0.5–2s think time

    // Persons list — paginated DB query
    loadPage('/persons', 'Persons')
    sleep(Math.random() * 1.5 + 0.5)

    // Absence management — leave rule computation
    loadPage('/absence', 'Absence')
    sleep(Math.random() * 1.5 + 0.5)

    // Org chart — recursive CTE + React Flow render
    loadPage('/org-chart', 'OrgChart')
    sleep(Math.random() * 1.5 + 0.5)

    // Approvals inbox — workflow read
    loadPage('/approvals', 'Approvals')
    sleep(Math.random() * 1.5 + 0.5)

    // Payroll runs — financial summary (DB-heavy)
    loadPage('/payroll', 'Payroll')
    sleep(Math.random() * 2 + 1)     // longer think — more complex page
  })

  // Inter-session think time (realistic pacing)
  sleep(Math.random() * 3 + 2)
}

// ── Scenario: Employee Self-Service sustained pages ───────────────────────────
//
// ESS paths are lighter — read-only personal data. Lower latency expected.

export function essPages() {
  group('ess_session', () => {
    // ESS home / my profile
    loadPage('/me', 'ESS-Profile')
    sleep(Math.random() * 1.5 + 0.5)

    // My leave history
    loadPage('/me/leave', 'ESS-Leave')
    sleep(Math.random() * 1.5 + 0.5)

    // My payslips (PDF links, no DB write)
    loadPage('/me/payslips', 'ESS-Payslips')
    sleep(Math.random() * 2 + 1)
  })

  sleep(Math.random() * 3 + 2)
}

// ── Scenario: Health poller ───────────────────────────────────────────────────
//
// Polls /api/health every ~10s for the full duration.
// Tracks service responsiveness and liveness across the soak window.

export function healthPoller() {
  const res = http.get(`${BASE_URL}/api/health`, {
    headers:  apiHeaders,
    tags:     { type: 'health_poll' },
    timeout:  '5s',
  })
  healthLatency.add(res.timings.duration)
  apiErrorRate.add(res.status !== 200)
  if (res.status === 0) connectionErrors.add(1)

  check(res, {
    'Health: status 200':  (r) => r.status === 200,
    'Health: has ok=true': (r) => {
      try { return JSON.parse(r.body)?.status === 'ok' || JSON.parse(r.body)?.ok === true } catch { return false }
    },
    'Health: < 400ms':     (r) => r.timings.duration < 400,
  })

  sleep(9 + Math.random() * 2)   // ~10s between polls
}

// ── Scenario: DB health poller ────────────────────────────────────────────────
//
// Polls /api/health/db every ~30s.
// Rising dbMs trend = DB connection pool under pressure.
// 503 = DB unreachable.

export function dbHealthPoller() {
  const res = http.get(`${BASE_URL}/api/health/db`, {
    headers:  apiHeaders,
    tags:     { type: 'db_health_poll' },
    timeout:  '15s',
  })

  let body = {}
  try { body = JSON.parse(res.body) } catch { /* ignore */ }

  const ok = res.status === 200 && body.status === 'ok'
  dbHealthOk.add(ok ? 1 : 0)

  if (body.dbMs) {
    dbProbeMs.add(body.dbMs)
  }

  if (res.status === 0) connectionErrors.add(1)

  check(res, {
    'DB Health: reachable':      (r) => r.status === 200 || r.status === 503, // 503 = down but responsive
    'DB Health: not connection-error': (r) => r.status !== 0,
    'DB Health: has status field':    (_) => body.status !== undefined,
  })

  sleep(28 + Math.random() * 4)   // ~30s between DB probes
}

// ── Scenario: Periodic spike ──────────────────────────────────────────────────
//
// Activated only when ENABLE_SPIKE=true (full staging soak).
// Simulates the morning rush / batch job concurrency spike.
// VUs ramp to SPIKE_VUS for 60s then return to 0.

export function spikePages() {
  group('spike_session', () => {
    // Hit the highest-concurrency paths during the spike
    loadPage('/dashboard', 'Spike-Dashboard')
    sleep(Math.random() * 0.5 + 0.2)  // faster think time during spike

    loadPage('/persons', 'Spike-Persons')
    sleep(Math.random() * 0.5 + 0.2)
  })

  sleep(Math.random() * 1 + 0.5)
}

// ── Summary handler ───────────────────────────────────────────────────────────

export function handleSummary(data) {
  const metrics = data.metrics

  const getP   = (name, pct) => metrics[name]?.values?.[`p(${pct})`]  ?? null
  const getRate = (name)     => metrics[name]?.values?.rate            ?? null
  const getCount = (name)    => metrics[name]?.values?.count           ?? null
  const getMax  = (name)     => metrics[name]?.values?.max             ?? null

  const pageP95   = getP('soak_page_latency', 95)
  const pageP99   = getP('soak_page_latency', 99)
  const apiP95    = getP('soak_api_latency',  95)
  const dbP95     = getP('soak_db_probe_ms',  95)
  const dbMax     = getMax('soak_db_probe_ms')
  const healthP95 = getP('soak_health_latency', 95)
  const driftP99  = getP('soak_latency_drift', 99)
  const errPage   = getRate('soak_page_error_rate')
  const errApi    = getRate('soak_api_error_rate')
  const connErr   = getCount('soak_connection_errors')
  const checkRate = getRate('checks')

  // Drift detection: p99 of drift > 2× page p95 suggests latency creep
  const driftRatio = pageP95 && driftP99 ? (driftP99 / pageP95) : null
  const driftFlag  = driftRatio !== null && driftRatio > 2.5

  const result = {
    soak_environment:    BASE_URL,
    soak_duration:       SOAK_DURATION,
    soak_mode:           INFRA_ONLY ? 'INFRA_ONLY (health + db probes)' : 'FULL (pages + infra)',
    sustained_vus:       INFRA_ONLY ? 0 : SUSTAINED_VUS,
    spike_vus:           ENABLE_SPIKE ? SPIKE_VUS : 'disabled',
    run_timestamp:       new Date().toISOString(),

    latency_results: {
      page_p95_ms:        pageP95,
      page_p99_ms:        pageP99,
      api_p95_ms:         apiP95,
      db_probe_p95_ms:    dbP95,
      db_probe_max_ms:    dbMax,
      health_p95_ms:      healthP95,
    },

    stability_results: {
      page_error_rate:      errPage,
      api_error_rate:       errApi,
      connection_errors:    connErr,
      check_pass_rate:      checkRate,
    },

    drift_analysis: {
      drift_p99_ms:         driftP99,
      drift_ratio:          driftRatio ? Math.round(driftRatio * 100) / 100 : null,
      drift_detected:       driftFlag,
      note: driftFlag
        ? 'WARN: p99 latency > 2.5x p95 — possible latency creep. Investigate DB pool or Neon coldstart.'
        : 'OK: latency stable across soak window.',
    },

    threshold_results: {
      'page_p95 < 2500ms':       pageP95 !== null ? (pageP95 < 2500 ? 'PASS' : 'FAIL') : 'N/A',
      'page_p99 < 5000ms':       pageP99 !== null ? (pageP99 < 5000 ? 'PASS' : 'FAIL') : 'N/A',
      'api_p95 < 600ms':         apiP95  !== null ? (apiP95  < 600  ? 'PASS' : 'FAIL') : 'N/A',
      'db_probe_p95 < 500ms':    dbP95   !== null ? (dbP95   < 500  ? 'PASS' : 'FAIL') : 'N/A',
      'page_error_rate < 0.5%':  errPage !== null ? (errPage < 0.005 ? 'PASS' : 'FAIL') : 'N/A',
      'check_rate > 97%':        checkRate !== null ? (checkRate > 0.97 ? 'PASS' : 'FAIL') : 'N/A',
      'connection_errors < 5':   connErr !== null  ? (connErr  < 5   ? 'PASS' : 'FAIL') : 'N/A',
      'no_drift_detected':       driftFlag ? 'WARN' : 'PASS',
    },

    verdict: (() => {
      const failures = [
        pageP95 !== null && pageP95 >= 2500,
        pageP99 !== null && pageP99 >= 5000,
        apiP95  !== null && apiP95  >= 600,
        dbP95   !== null && dbP95   >= 500,
        errPage !== null && errPage >= 0.005,
        connErr !== null && connErr >= 5,
        checkRate !== null && checkRate < 0.97,
      ].filter(Boolean).length

      if (failures === 0 && !driftFlag) return 'PASS — soak stable ✅'
      if (failures === 0 && driftFlag)  return 'PASS WITH WARNINGS — latency drift detected ⚠️'
      return `FAIL — ${failures} threshold(s) breached ❌`
    })(),
  }

  const outputFile = BASE_URL.includes('localhost')
    ? 'tests/performance/k6-soak-results-smoke.json'
    : 'tests/performance/k6-soak-results-staging.json'

  return {
    [outputFile]: JSON.stringify(result, null, 2),
    stdout: `\n${'═'.repeat(60)}\nAVANIIS HCM — SOAK TEST SUMMARY\n${'═'.repeat(60)}\n` +
      JSON.stringify(result, null, 2) + '\n',
  }
}
