/**
 * DB Health / Readiness Probe — OBS-002
 *
 * Checks Neon PostgreSQL connectivity with a lightweight `SELECT 1`.
 * Returns HTTP 200 on success, 503 on connection failure.
 *
 * Used by:
 *   • Observability dashboards (Vercel, uptime monitors)
 *   • Alerting — 503 triggers "Neon DB unreachable" alert
 *   • Post-deploy smoke checks
 *
 * Public route — no auth required (added to middleware isPublic check).
 * DOES NOT expose PII, schema, or query results.
 *
 * Response shape:
 *   { status: 'ok' | 'error', dbMs: number, timestamp: string, error?: string }
 */
import { NextResponse } from 'next/server'
import { sql }         from 'drizzle-orm'
import { db }          from '@/lib/db'
import { startTimer }  from '@/lib/telemetry'
import { logger }      from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET() {
  const t = startTimer()

  try {
    // Minimal liveness query — no table scan, no PII access
    await db.execute(sql`SELECT 1`)
    const dbMs = t.elapsedMs()

    logger.info('health-db', 'DB probe ok', { dbMs })

    return NextResponse.json(
      {
        status:    'ok',
        dbMs,
        timestamp: new Date().toISOString(),
        region:    process.env.VERCEL_REGION ?? process.env.VERCEL_ENV ?? 'local',
      },
      {
        status:  200,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      },
    )
  } catch (err) {
    const dbMs = t.elapsedMs()
    const message = err instanceof Error ? err.message : String(err)

    // Log connectivity failure — triggers alerting on elevated 503 rate
    logger.error('health-db', 'DB probe failed', {
      dbMs,
      // Truncate error to avoid leaking internal connection strings
      error: message.slice(0, 200),
    })

    return NextResponse.json(
      {
        status:    'error',
        dbMs,
        timestamp: new Date().toISOString(),
        // Generic message — never expose connection string or credentials
        error: 'Database unavailable',
      },
      {
        status:  503,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      },
    )
  }
}
