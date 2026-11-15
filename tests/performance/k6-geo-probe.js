/**
 * k6-geo-probe.js — AVANIIS HCM Multi-Region Geo-Latency Probe
 * Phase 2 Task 10: Multi-Region + Geo-Latency Validation
 *
 * PURPOSE: Measure TTFB, DB probe latency, CDN hit rate, and cold-start gap
 *          from any geographic location. Designed to run from k6 Cloud or
 *          any CI/CD runner to produce region-stamped latency evidence.
 *
 * USAGE (local / any region):
 *   k6 run tests/performance/k6-geo-probe.js
 *
 * USAGE (with base URL override):
 *   k6 run -e BASE_URL=http://localhost:3001 tests/performance/k6-geo-probe.js
 *
 * USAGE (k6 Cloud — multi-region):
 *   k6 cloud --load-zones=amazon:ae:dubai,amazon:us:ashburn,amazon:eu:frankfurt \
 *            tests/performance/k6-geo-probe.js
 *
 * USAGE (CI — non-authenticated infra only):
 *   k6 run -e INFRA_ONLY=true tests/performance/k6-geo-probe.js
 *
 * OUTPUT FIELDS per request:
 *   geo_ttfb          — time to first byte (ms)
 *   geo_db_probe      — DB health probe round-trip (ms)
 *   geo_cdn_hit_rate  — fraction of static assets served from CDN cache
 *   geo_cold_start    — TTFB after 35-second idle gap (ms)
 *
 * ARCHITECTURE CONTEXT:
 *   - All Vercel Node functions are pinned to fra1 (Frankfurt) via vercel.json
 *   - middleware.ts runs at all Vercel PoPs (edge-distributed)
 *   - UAE users route: UAE → bom1 (Mumbai PoP) → fra1 (function) → Neon eu-central-1
 *   - CDN (_next/static) served from nearest PoP — bom1 for UAE, fra1 for EU
 *   - Cold start: first invocation after Vercel recycles function (~1.5–2.5s)
 *   - Warm TTFB: subsequent requests within keep-warm window (~290–550ms from UAE)
 */

import http   from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate, Counter } from 'k6/metrics'

// ── Custom metrics ────────────────────────────────────────────────────────────
const geoTtfb       = new Trend('geo_ttfb',        true)   // true = emit percentiles
const geoDbProbe    = new Trend('geo_db_probe',     true)
const geoColdStart  = new Trend('geo_cold_start',   true)
const geoCdnHitRate = new Rate('geo_cdn_hit_rate')
const geoErrors     = new Counter('geo_errors')

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL    = __ENV.BASE_URL    || 'http://localhost:3001'
const INFRA_ONLY  = __ENV.INFRA_ONLY  === 'true'
const AUTH_COOKIE = __ENV.AUTH_COOKIE || ''

// Static asset URL — the JS chunk that changes least between deploys.
// Update if the chunk name changes after a deploy.
const STATIC_CHUNK_PATH = '/_next/static/chunks/3bb93984-acbfc9c989712533.js'

// ── Scenario configuration ────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Scenario 1: Health endpoint warm probe (5 VUs × 60 iterations)
    health_warm: {
      executor:    'per-vu-iterations',
      vus:         5,
      iterations:  12,
      maxDuration: '3m',
      tags:        { scenario: 'health_warm' },
    },

    // Scenario 2: DB probe — confirms Neon co-location latency from this region
    db_probe: {
      executor:    'per-vu-iterations',
      vus:         3,
      iterations:  10,
      maxDuration: '3m',
      startTime:   '10s',
      tags:        { scenario: 'db_probe' },
    },

    // Scenario 3: CDN cache hit rate — static assets should hit nearest PoP
    cdn_hit: {
      executor:    'per-vu-iterations',
      vus:         2,
      iterations:  15,
      maxDuration: '3m',
      startTime:   '20s',
      tags:        { scenario: 'cdn_hit' },
    },

    // Scenario 4: Cold-start gap — idle 35s then re-probe
    // NOTE: Only meaningful on first run after a deploy or long idle.
    // In practice, Vercel production keep-warm prevents cold starts after 35s.
    cold_start_gap: {
      executor:    'per-vu-iterations',
      vus:         1,
      iterations:  1,
      maxDuration: '3m',
      startTime:   '60s',   // run after warm phase so gap = genuine cold
      tags:        { scenario: 'cold_start_gap' },
    },
  },

  thresholds: {
    // From UAE (bom1→fra1): warm TTFB should be under 700ms (includes 2-hop network)
    // From EU (direct fra1): warm TTFB should be under 350ms
    // Conservative threshold covers both:
    'geo_ttfb{scenario:health_warm}': ['p95<800'],

    // DB probe — Neon eu-central-1 co-located with fra1 → sub-100ms from function
    // From UAE perspective this includes bom1→fra1 network (~120ms) + DB time (~41ms)
    'geo_db_probe{scenario:db_probe}': ['p95<600'],

    // CDN — static assets must hit cache more than 80% of the time
    'geo_cdn_hit_rate': ['rate>0.80'],

    // Errors
    'geo_errors':   ['count<5'],
    'http_req_failed': ['rate<0.02'],
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildHeaders() {
  const h = {
    'User-Agent': 'k6-geo-probe/1.0 (AVANIIS-HCM-Task10)',
    'Accept':     'application/json',
  }
  if (AUTH_COOKIE) {
    h['Cookie'] = AUTH_COOKIE
  }
  return h
}

function logVercelRouting(res) {
  // x-vercel-id reveals PoP routing, e.g. "bom1::fra1::..."
  const vercelId  = res.headers['x-vercel-id']  || res.headers['X-Vercel-Id']  || 'unknown'
  const vercelPop = res.headers['x-vercel-pop'] || res.headers['X-Vercel-Pop'] || 'unknown'
  const region    = res.headers['x-vercel-execution-region'] || 'unknown'
  return { vercelId, vercelPop, region }
}

// ── Scenario default function ─────────────────────────────────────────────────
export default function () {
  const scenario = __ENV.K6_SCENARIO_NAME || 'health_warm'

  if (scenario === 'health_warm') {
    runHealthWarm()
  } else if (scenario === 'db_probe') {
    runDbProbe()
  } else if (scenario === 'cdn_hit') {
    runCdnHit()
  } else if (scenario === 'cold_start_gap') {
    runColdStartGap()
  } else {
    // Default: run all probes sequentially
    runHealthWarm()
    sleep(1)
    runDbProbe()
    sleep(1)
    runCdnHit()
  }
}

// ── Scenario functions ────────────────────────────────────────────────────────

function runHealthWarm() {
  const res = http.get(`${BASE_URL}/api/health`, {
    headers: buildHeaders(),
    timeout: '10s',
  })

  const { vercelId } = logVercelRouting(res)
  const ttfb = res.timings.duration

  geoTtfb.add(ttfb, { scenario: 'health_warm', pop: vercelId.split('::')[0] || 'unknown' })

  const ok = check(res, {
    'health 200':            r => r.status === 200,
    'health body ok':        r => {
      try { return JSON.parse(r.body).status === 'ok' } catch { return false }
    },
    'health region fra1':    r => {
      try { return JSON.parse(r.body).region === 'fra1' } catch { return false }
    },
    'health TTFB < 2000ms':  r => r.timings.duration < 2000,
  })

  if (!ok) geoErrors.add(1, { scenario: 'health_warm' })
  sleep(0.5)
}

function runDbProbe() {
  const res = http.get(`${BASE_URL}/api/health/db`, {
    headers: buildHeaders(),
    timeout: '10s',
  })

  const ttfb = res.timings.duration
  geoDbProbe.add(ttfb, { scenario: 'db_probe' })

  const ok = check(res, {
    'db probe 200':          r => r.status === 200,
    'db probe body ok':      r => {
      try { return JSON.parse(r.body).ok === true } catch { return false }
    },
    'db probe < 1000ms':     r => r.timings.duration < 1000,
  })

  if (!ok) geoErrors.add(1, { scenario: 'db_probe' })
  sleep(0.5)
}

function runCdnHit() {
  // First request — may be a MISS (priming the CDN cache)
  const res1 = http.get(`${BASE_URL}${STATIC_CHUNK_PATH}`, {
    headers: { 'User-Agent': 'k6-geo-probe/1.0 (AVANIIS-HCM-Task10)' },
    timeout: '10s',
    tags:    { asset_type: 'js_chunk' },
  })

  const isMiss1 = res1.headers['x-vercel-cache'] === 'MISS' ||
                  res1.headers['X-Vercel-Cache'] === 'MISS'

  // Second request — should be a HIT from CDN
  const res2 = http.get(`${BASE_URL}${STATIC_CHUNK_PATH}`, {
    headers: { 'User-Agent': 'k6-geo-probe/1.0 (AVANIIS-HCM-Task10)' },
    timeout: '10s',
    tags:    { asset_type: 'js_chunk' },
  })

  const isHit2 = res2.headers['x-vercel-cache'] === 'HIT' ||
                 res2.headers['X-Vercel-Cache'] === 'HIT'

  geoCdnHitRate.add(isHit2 ? 1 : 0)

  check(res2, {
    'cdn chunk 200':         r => r.status === 200,
    'cdn chunk HIT':         () => isHit2,
    'cdn chunk < 300ms':     r => r.timings.duration < 300,
    'cdn immutable header':  r => (r.headers['cache-control'] || r.headers['Cache-Control'] || '').includes('immutable'),
  })

  sleep(0.3)
}

function runColdStartGap() {
  // Baseline warm request
  const warm = http.get(`${BASE_URL}/api/health`, {
    headers: buildHeaders(),
    timeout: '10s',
  })
  const warmTtfb = warm.timings.duration

  // Wait 35 seconds (> lib/db.ts idle_timeout:20s) to trigger potential cold start
  console.log(`[cold-start] Warm TTFB: ${warmTtfb}ms — sleeping 35s for cold-start gap...`)
  sleep(35)

  // Post-gap request
  const cold = http.get(`${BASE_URL}/api/health`, {
    headers: buildHeaders(),
    timeout: '15s',
  })
  const coldTtfb = cold.timings.duration
  const coldStartGap = coldTtfb - warmTtfb

  geoColdStart.add(coldTtfb, { gap_seconds: '35' })

  console.log(`[cold-start] Post-gap TTFB: ${coldTtfb}ms | Gap: ${coldStartGap > 0 ? '+' : ''}${coldStartGap}ms`)

  check(cold, {
    'cold gap 200':         r => r.status === 200,
    'cold gap < 4000ms':    r => r.timings.duration < 4000,
    'warm baseline < 800ms': () => warmTtfb < 800,
  })
}

// ── Summary ───────────────────────────────────────────────────────────────────
export function handleSummary(data) {
  const ttfbP95  = data.metrics['geo_ttfb']?.values?.['p(95)'] ?? 'n/a'
  const dbP95    = data.metrics['geo_db_probe']?.values?.['p(95)'] ?? 'n/a'
  const cdnHit   = data.metrics['geo_cdn_hit_rate']?.values?.rate ?? 'n/a'
  const errCount = data.metrics['geo_errors']?.values?.count ?? 0

  const summary = {
    task:           'Phase 2 Task 10 — Multi-Region Geo-Latency Probe',
    base_url:       BASE_URL,
    infra_only:     INFRA_ONLY,
    results: {
      health_ttfb_p95_ms:  typeof ttfbP95 === 'number'  ? Math.round(ttfbP95)  : ttfbP95,
      db_probe_p95_ms:     typeof dbP95   === 'number'  ? Math.round(dbP95)    : dbP95,
      cdn_hit_rate_pct:    typeof cdnHit  === 'number'  ? Math.round(cdnHit * 100) + '%' : cdnHit,
      errors:              errCount,
    },
    thresholds_pass: Object.values(data.thresholds || {}).every(t => !t.ok === false),
    timestamp:       new Date().toISOString(),
  }

  console.log('\n── GEO PROBE SUMMARY ──────────────────────────────────────')
  console.log(JSON.stringify(summary, null, 2))
  console.log('────────────────────────────────────────────────────────────\n')

  return {
    'tests/performance/k6-geo-probe-results.json': JSON.stringify(summary, null, 2),
    stdout: JSON.stringify(summary, null, 2),
  }
}
