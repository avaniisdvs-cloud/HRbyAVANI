/**
 * Future-Dated Assignment Activation Cron Endpoint.
 * Called by Vercel Cron at 00:05 UAE (vercel.json schedule).
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
import { NextRequest, NextResponse } from 'next/server'
import { runFutureDatedActivation } from '@/lib/jobs/future-dated-activation'
import { logger } from '@/lib/logger'
import { reportCronFailure } from '@/lib/monitoring'
import { startTimer, SLOW_JOB_MS } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  const secret = process.env.CRON_SECRET
  return !!secret && authHeader === `Bearer ${secret}`
}

async function run(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    logger.warn('cron-future-dated-activation', 'unauthorized cron invocation')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const t = startTimer()
  const reqId = request.headers.get('x-request-id') ?? undefined

  try {
    const result = await runFutureDatedActivation()
    const durationMs = t.elapsedMs()

    const logPayload = {
      reqId,
      durationMs,
      activationDate: result.activationDate,
      candidatesFound: result.candidatesFound,
      personsFound: result.personsFound,
      activated: result.activated,
      skipped: result.skipped.length,
      errors: result.errors.length,
    }

    if (durationMs > SLOW_JOB_MS) {
      logger.warn('cron-future-dated-activation', 'slow tick', logPayload)
    } else {
      logger.info('cron-future-dated-activation', 'tick complete', logPayload)
    }

    return NextResponse.json({
      ok: true,
      ...result,
      durationMs,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const durationMs = t.elapsedMs()
    const message = err instanceof Error ? err.message : String(err)
    logger.error('cron-future-dated-activation', 'tick fatal', {
      reqId,
      durationMs,
      error: message.slice(0, 300),
    })
    reportCronFailure('future-dated-activation', err)
    return NextResponse.json({ ok: false, error: message, durationMs }, { status: 500 })
  }
}

export const GET = run
export const POST = run
