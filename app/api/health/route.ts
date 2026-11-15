/**
 * Health check endpoint — PERF-01 / NFR-05 / OBS-001
 *
 * Used by:
 *   • Vercel uptime checks
 *   • Azure load balancer probe
 *   • Uptime monitoring (e.g. Azure Monitor, Grafana, Better Uptime)
 *   • k6 NFR-02 baseline latency measurement
 *
 * Shallow liveness check — returns 200 when the application server is responsive.
 * Does NOT probe the database here; use /api/health/db for a DB-coupled readiness check.
 *
 * Public route — no authentication required (listed in middleware.ts isPublic).
 */
import { NextResponse } from 'next/server'
import { startTimer } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'  // never cache; always fresh

export function GET() {
  const t = startTimer()

  return NextResponse.json(
    {
      status:       'ok',
      timestamp:    new Date().toISOString(),
      version:      process.env.npm_package_version ?? 'unknown',
      region:       process.env.VERCEL_REGION ?? process.env.VERCEL_ENV ?? 'local',
      responseMs:   t.elapsedMs(),
    },
    {
      status:  200,
      headers: {
        // Prevent proxies from caching health responses
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  )
}
