/**
 * SLA Breach Cron Endpoint — OBS-004: structured telemetry added.
 * Called by Vercel Cron every 30 minutes (vercel.json schedule).
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
import { NextRequest, NextResponse }      from 'next/server'
import { processSLABreaches }             from '@/lib/workflow-engine'
import { logger }                         from '@/lib/logger'
import { reportCronFailure }              from '@/lib/monitoring'
import { startTimer, SLOW_JOB_MS }       from '@/lib/telemetry'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  const secret = process.env.CRON_SECRET
  return !!secret && authHeader === `Bearer ${secret}`
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    logger.warn('cron-workflow-sla', 'unauthorized cron invocation')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const t     = startTimer()
  const reqId = request.headers.get('x-request-id') ?? undefined

  logger.info('cron-workflow-sla', 'tick start', { reqId })

  try {
    const result = await processSLABreaches()
    const durationMs = t.elapsedMs()

    if (durationMs > SLOW_JOB_MS) {
      logger.warn('cron-workflow-sla', 'slow tick', {
        reqId, durationMs, processed: result.processed, errors: result.errors,
      })
    } else {
      logger.info('cron-workflow-sla', 'tick complete', {
        reqId, durationMs, processed: result.processed, errors: result.errors,
      })
    }

    if (result.errors > 0) {
      logger.warn('cron-workflow-sla', 'tick had errors', {
        reqId, errors: result.errors, processed: result.processed,
      })
    }

    return NextResponse.json({
      ok:          true,
      processed:   result.processed,
      errors:      result.errors,
      durationMs,
      timestamp:   new Date().toISOString(),
    })
  } catch (err) {
    const durationMs = t.elapsedMs()
    const message    = err instanceof Error ? err.message : String(err)
    logger.error('cron-workflow-sla', 'tick fatal', {
      reqId, durationMs, error: message.slice(0, 300),
    })
    reportCronFailure('workflow-sla', err)
    return NextResponse.json({ ok: false, error: message, durationMs }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    service: 'workflow-sla-cron',
    timestamp: new Date().toISOString(),
  })
}
