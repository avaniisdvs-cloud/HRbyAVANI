/**
 * AVANIIS HR — Performance Telemetry Helpers
 *
 * Lightweight timing utilities for measuring critical path latency.
 * No external dependencies — uses `performance.now()` which is available in
 * both Node.js and Vercel Edge runtimes.
 *
 * Usage:
 *   const t = startTimer()
 *   await someOperation()
 *   const ms = t.elapsed()
 *   logger.info('aria', 'stream complete', { durationMs: ms })
 *
 * Threshold constants define when to emit WARN vs INFO log entries.
 */

// ── Thresholds (milliseconds) ─────────────────────────────────────────────────

/** Page / full SSR request: warn if p95 approaches the 2 000ms NFR-01 threshold */
export const SLOW_PAGE_MS = 1_500

/** API endpoint: warn if approaching the 500ms NFR-02 threshold */
export const SLOW_API_MS = 400

/** DB query: warn if a single query takes more than this */
export const SLOW_QUERY_MS = 200

/** ARIA/AI stream first-token latency */
export const SLOW_ARIA_MS = 3_000

/** Background job / cron tick */
export const SLOW_JOB_MS = 5_000

/** Outbox poller single tick */
export const SLOW_OUTBOX_TICK_MS = 2_000

// ── Timer ─────────────────────────────────────────────────────────────────────

export interface Timer {
  /** Returns elapsed milliseconds (float) since the timer was started. */
  elapsed: () => number
  /** Returns elapsed milliseconds rounded to the nearest integer. */
  elapsedMs: () => number
}

/**
 * Creates a high-resolution timer using `performance.now()`.
 *
 * @example
 *   const t = startTimer()
 *   await doWork()
 *   logger.info('svc', 'done', { durationMs: t.elapsedMs() })
 */
export function startTimer(): Timer {
  const start = performance.now()
  return {
    elapsed:   () => performance.now() - start,
    elapsedMs: () => Math.round(performance.now() - start),
  }
}

// ── withTiming wrapper ────────────────────────────────────────────────────────

/**
 * Executes an async function and returns its result alongside the elapsed time.
 *
 * @example
 *   const { result, durationMs } = await withTiming(() => db.select(...))
 *   if (durationMs > SLOW_QUERY_MS) logger.warn('db', 'slow query', { durationMs })
 */
export async function withTiming<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const t = startTimer()
  const result = await fn()
  return { result, durationMs: t.elapsedMs() }
}

// ── Server-Timing header builder ──────────────────────────────────────────────

/**
 * Builds a W3C `Server-Timing` header value from named durations.
 * Vercel Dev Tools and Chrome DevTools display these in the Network panel.
 *
 * @example
 *   const serverTiming = buildServerTiming({ db: 23, aria: 1420, total: 1498 })
 *   // → "db;dur=23, aria;dur=1420, total;dur=1498"
 *   headers.set('Server-Timing', serverTiming)
 */
export function buildServerTiming(timings: Record<string, number>): string {
  return Object.entries(timings)
    .map(([name, dur]) => `${name};dur=${dur}`)
    .join(', ')
}
