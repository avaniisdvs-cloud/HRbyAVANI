/**
 * Email Dispatch Cron Endpoint.
 * Delivers QUEUED email_messages rows through the admin-selected provider.
 * Called by Vercel Cron (vercel.json schedule).
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * This fills the historical gap where queued notifications were never dispatched.
 * Sending is fully decoupled from the originating business transaction.
 */
import { NextRequest, NextResponse } from 'next/server'
import { dispatchBatch } from '@/modules/communication'
import { logger } from '@/lib/logger'
import { reportCronFailure } from '@/lib/monitoring'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  const secret = process.env.CRON_SECRET
  return !!secret && authHeader === `Bearer ${secret}`
}

async function run(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    logger.warn('cron-email-dispatch', 'unauthorized cron invocation')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await dispatchBatch(50)
    logger.info('cron-email-dispatch', 'tick complete', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('cron-email-dispatch', 'tick failed', { error: msg })
    reportCronFailure('email-dispatch', err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export const POST = run
// Allow GET so Vercel Cron (which issues GET) and manual checks both work.
export const GET = run
