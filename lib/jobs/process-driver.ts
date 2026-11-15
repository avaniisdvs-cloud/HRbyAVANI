/**
 * TD-09 — Background process driver.
 *
 * Single entry point that activates all long-running background jobs:
 *   1. Document-expiry cron  — daily 07:00 UAE (03:00 UTC)
 *   2. SLA-breach cron       — every 30 minutes
 *   3. Events outbox poller  — every 10 seconds, processes undelivered
 *      domain events emitted via the transactional outbox pattern.
 *
 * Import and call `startProcessDriver()` once from your server entry
 * (e.g. a custom Next.js server, a standalone `worker.ts`, or an
 * `instrumentation.ts` hook when using Next.js 14 instrumentation).
 *
 * All jobs are idempotent — safe to restart on crash/deploy.
 */

import cron from 'node-cron'
import { isNull, lte, sql } from 'drizzle-orm'
import { db }   from '@/lib/db'
import { events } from '@/drizzle/schema'
import { logger } from '@/lib/logger'
import { startTimer, SLOW_OUTBOX_TICK_MS } from '@/lib/telemetry'
import { startDocumentExpiryCron }       from './document-expiry-checker'
import { startSlaBreachCron }            from './sla-breach-checker'
import { startOrgChartSnapshotCron }     from './org-chart-snapshot'
import { startInsuranceRenewalCron }     from './insurance-renewal-checker'
import { startFutureDatedValidatorCron } from './future-dated-validator'
import { startFutureDatedActivationCron } from './future-dated-activation'

// ── Event payload types ───────────────────────────────────────────────────────

interface AriaLeaveRecommendationPayload {
  requestId:     string
  personId:      string
  legalEntityId: string
}

// ── Outbox poller ─────────────────────────────────────────────────────────────

const OUTBOX_POLL_MS        = 10_000   // 10 s poll interval
const OUTBOX_MAX_RETRIES    = 5        // give up after 5 attempts
const OUTBOX_BATCH_SIZE     = 50       // rows per tick

// ── Event dispatcher ──────────────────────────────────────────────────────────

async function dispatchEvent(row: { eventType: string; payload: unknown }): Promise<void> {
  if (row.eventType === 'ARIA.LEAVE_RECOMMENDATION') {
    const p = row.payload as AriaLeaveRecommendationPayload
    if (!p?.requestId) return
    // Hard Rule 8: import through module barrel
    const { generateLeaveRecommendation } = await import('@/modules/aria')
    await generateLeaveRecommendation(p.requestId)
  }
  // Other event types: no-op for now (Phase 2 will add webhook/email dispatch)
}

/**
 * Dispatches unprocessed outbox events.
 *
 * Current event types are informational — they confirm that a domain
 * write occurred atomically alongside the outbox row. Phase 2 will
 * add webhook/email dispatch here; for now the poller simply marks
 * them processed so the table doesn't grow unbounded.
 *
 * Retry logic: rows with `retry_count >= OUTBOX_MAX_RETRIES` are
 * stamped with `processed_at` and an `error_text` note so they are
 * visible to ops but stop clogging the `idx_events_unprocessed` index.
 */
async function pollOutbox(): Promise<void> {
  const t = startTimer()

  try {
    const now = new Date()

    // Fetch unprocessed rows (includes permanently-failed ones so we
    // can stamp them and remove them from the hot index path).
    const rows = await db
      .select({ id: events.id, eventType: events.eventType, retryCount: events.retryCount, payload: events.payload })
      .from(events)
      .where(isNull(events.processedAt))
      .limit(OUTBOX_BATCH_SIZE)

    if (rows.length === 0) return

    // OBS-005: log queue depth so ops can detect backlog build-up
    const maxRetryRows = rows.filter(r => r.retryCount >= OUTBOX_MAX_RETRIES).length
    if (rows.length >= OUTBOX_BATCH_SIZE) {
      logger.warn('outbox-poller', 'queue at batch limit — possible backlog', {
        queueDepth: rows.length, maxRetryRows,
      })
    }

    const ids        = rows.map(r => r.id)
    const failedIds  = rows.filter(r => r.retryCount >= OUTBOX_MAX_RETRIES).map(r => r.id)
    const actionable = rows.filter(r => r.retryCount < OUTBOX_MAX_RETRIES)

    // Dispatch actionable events.
    for (const row of actionable) {
      try {
        await dispatchEvent(row)
      } catch (err) {
        // Per-row failures increment retry_count; the next tick retries.
        await db
          .update(events)
          .set({
            retryCount: sql`${events.retryCount} + 1`,
            errorText:  err instanceof Error ? err.message : String(err),
          })
          .where(sql`${events.id} = ${row.id}`)
      }
    }

    // Stamp all successfully-dispatched rows + permanently-failed rows.
    const processedIds = [
      ...actionable.map(r => r.id).filter(id => !failedIds.includes(id)),
      ...failedIds,
    ]

    if (processedIds.length > 0) {
      await db
        .update(events)
        .set({
          processedAt: now,
          errorText: sql`
            CASE
              WHEN ${events.retryCount} >= ${OUTBOX_MAX_RETRIES}
              THEN COALESCE(${events.errorText}, 'max retries exceeded')
              ELSE NULL
            END
          `,
        })
        .where(sql`${events.id} = ANY(${sql.raw(`ARRAY[${processedIds.map(id => `'${id}'::uuid`).join(',')}]`)})`)
    }
    const durationMs = t.elapsedMs()
    if (durationMs > SLOW_OUTBOX_TICK_MS) {
      logger.warn('outbox-poller', 'slow tick', { durationMs })
    }
  } catch (err) {
    // Log but never crash the driver — next tick will retry.
    const durationMs = t.elapsedMs()
    logger.error('outbox-poller', 'tick error', {
      durationMs,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    })
  }
}

// ── Driver entry point ────────────────────────────────────────────────────────

let started = false

export function startProcessDriver(): void {
  if (started) return
  started = true

  // 1. Document expiry — daily 07:00 UAE (03:00 UTC)
  startDocumentExpiryCron()

  // 2. SLA breach checker — every 30 minutes
  startSlaBreachCron()

  // 3. Events outbox poller — every 10 seconds
  const outboxCron = cron.schedule('*/10 * * * * *', () => {
    void pollOutbox()
  })
  outboxCron.start()

  // 4. Org chart snapshot recompute — hourly (warms up on start)
  startOrgChartSnapshotCron()

  // 5. Insurance renewal alerts — daily 07:30 UAE (03:30 UTC)
  startInsuranceRenewalCron()

  // 6. Future-dated change validator — nightly 23:00 UAE (19:00 UTC)
  startFutureDatedValidatorCron()

  // 7. Future-dated assignment activation - daily 00:05 UAE (20:05 UTC)
  startFutureDatedActivationCron()

  logger.info('process-driver', 'all background jobs started', {
    jobs: ['document-expiry', 'sla-breach', 'outbox-poller', 'org-chart-snapshot', 'insurance-renewal', 'future-dated-validator', 'future-dated-activation'],
  })
}
