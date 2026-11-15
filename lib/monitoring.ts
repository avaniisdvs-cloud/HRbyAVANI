/**
 * Central error-capture / monitoring abstraction (production-readiness foundation).
 *
 * ADDITIVE & SAFE: this module is an integration POINT only. It is intentionally
 * NOT yet wired into existing call sites (that wiring is a separate, reviewed
 * change — see docs/environment/MONITORING-READINESS.md). Importing and calling
 * it is always safe:
 *   - No external dependency, no secret, no network call by default.
 *   - No-op fallback when no provider is registered: in dev it logs to console;
 *     in production it logs a STRUCTURED error line (so Vercel/Azure platform logs
 *     still capture it) — it never throws and never crashes a request.
 *
 * To activate a real provider (Sentry / Datadog / Azure Application Insights),
 * call registerMonitoringProvider() ONCE at server bootstrap with an adapter.
 */

export type MonitorSeverity = 'fatal' | 'error' | 'warning' | 'info'

export interface MonitorContext {
  /** Logical area, e.g. 'cron:email-dispatch', 'payroll', 'auth'. */
  scope?: string
  /** Non-PII tags only (role, route, jobName, status). NEVER PII or secrets. */
  tags?: Record<string, string | number | boolean | undefined>
}

export interface MonitoringProvider {
  captureException(error: unknown, context?: MonitorContext): void
  captureMessage(message: string, severity: MonitorSeverity, context?: MonitorContext): void
}

let provider: MonitoringProvider | null = null

/** Register a real provider adapter at bootstrap. Idempotent (last wins). */
export function registerMonitoringProvider(p: MonitoringProvider): void {
  provider = p
}

function isProd(): boolean {
  return process.env.NODE_ENV === 'production'
}

function noopCapture(kind: 'exception' | 'message', payload: unknown, ctx?: MonitorContext): void {
  // Structured single-line log so platform log aggregation can alert on it even
  // before an external provider is wired. Never throws.
  try {
    const line = JSON.stringify({
      monitor: kind,
      scope: ctx?.scope,
      tags: ctx?.tags,
      payload: payload instanceof Error ? { name: payload.name, message: payload.message } : payload,
      provider: process.env.MONITORING_PROVIDER ?? 'none',
    })
    // eslint-disable-next-line no-console
    if (isProd()) console.error(`[MONITOR] ${line}`)
    else console.warn(`[MONITOR:dev] ${line}`)
  } catch {
    /* never let monitoring break the caller */
  }
}

/** Capture an exception. Safe to call anywhere; no-ops to structured logs if unconfigured. */
export function captureException(error: unknown, context?: MonitorContext): void {
  if (provider) {
    try { provider.captureException(error, context); return } catch { /* fall through to noop */ }
  }
  noopCapture('exception', error, context)
}

/** Capture a message/event. */
export function captureMessage(message: string, severity: MonitorSeverity = 'info', context?: MonitorContext): void {
  if (provider) {
    try { provider.captureMessage(message, severity, context); return } catch { /* fall through */ }
  }
  noopCapture('message', { message, severity }, context)
}

/** Convenience for cron-job failures (Workstream 2 — cron failure visibility). */
export function reportCronFailure(jobName: string, error: unknown): void {
  captureException(error, { scope: `cron:${jobName}`, tags: { jobName, kind: 'cron-failure' } })
}
