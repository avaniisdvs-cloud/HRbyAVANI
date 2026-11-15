/**
 * AVANIIS HR — Structured Logger
 *
 * Privacy-safe, Vercel-native structured logging.
 *
 * In production: outputs newline-delimited JSON to stdout — Vercel captures
 *   this automatically and surfaces it in Vercel Logs / log drains.
 * In development: pretty-prints with colour-coded level prefixes.
 *
 * HARD RULES:
 *   - Never log PII (see PII_FIELDS). Values for those keys are replaced with [REDACTED].
 *   - Never log secrets, tokens, passwords, or API keys.
 *   - The `reqId` field propagates the x-request-id correlation header so a single
 *     request can be traced across multiple log lines in Vercel Logs.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info('aria', 'stream started', { reqId, durationMs: 42 })
 *   logger.error('workflow-sla', 'step failed', { reqId, stepId, error: err.message })
 */

// ── PII field names — values for these keys are always redacted ───────────────

const PII_FIELDS = new Set([
  'email',
  'emails',
  'password',
  'passwordHash',
  'token',
  'tokens',
  'secret',
  'secrets',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authToken',
  'auth_token',
  'iban',
  'bankAccount',
  'bank_account',
  'accountNumber',
  'account_number',
  'emiratesId',
  'emirates_id',
  'passportNumber',
  'passport_number',
  'nationalId',
  'national_id',
  'phone',
  'mobile',
  'mobileNumber',
  'phoneNumber',
  'dob',
  'dateOfBirth',
  'date_of_birth',
  'salary',
  'basicSalary',
  'basic_salary',
  'grossSalary',
  'gross_salary',
  'authorization',
  'cookie',
  'cookies',
  'x-api-key',
  'cron_secret',
  'cronSecret',
  'CRON_SECRET',
  'AUTH_SECRET',
  'ANTHROPIC_API_KEY',
  'FIELD_ENCRYPTION_KEY',
])

// ── Log levels ────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info:  20,
  warn:  30,
  error: 40,
  fatal: 50,
}

// Only emit logs at or above this level. In production: 'info'. In dev: 'debug'.
const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

// ── Log record shape ──────────────────────────────────────────────────────────

export interface LogRecord {
  ts:          string       // ISO-8601 timestamp
  level:       LogLevel
  svc:         string       // service/module identifier (e.g. 'aria', 'workflow-sla')
  msg:         string
  reqId?:      string       // x-request-id correlation header value
  durationMs?: number       // elapsed time for timed operations
  [key: string]: unknown    // arbitrary structured metadata
}

// ── PII redaction ─────────────────────────────────────────────────────────────

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (PII_FIELDS.has(k)) {
      result[k] = '[REDACTED]'
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      result[k] = redact(v as Record<string, unknown>)
    } else {
      result[k] = v
    }
  }
  return result
}

// ── Core emit ─────────────────────────────────────────────────────────────────

function emit(level: LogLevel, svc: string, msg: string, meta?: Record<string, unknown>): void {
  // Drop below minimum level
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return

  const raw: LogRecord = {
    ts:    new Date().toISOString(),
    level,
    svc,
    msg,
    ...meta,
  }

  const record = redact(raw as unknown as Record<string, unknown>) as unknown as LogRecord

  if (process.env.NODE_ENV === 'production') {
    // Newline-delimited JSON — Vercel Log Drain compatible
    try {
      process.stdout.write(JSON.stringify(record) + '\n')
    } catch {
      // stdout unavailable in some edge cases; fall back silently
    }
  } else {
    // Development: human-readable with colour
    const colours: Record<LogLevel, string> = {
      debug: '\x1b[36m', // cyan
      info:  '\x1b[32m', // green
      warn:  '\x1b[33m', // yellow
      error: '\x1b[31m', // red
      fatal: '\x1b[35m', // magenta
    }
    const reset = '\x1b[0m'
    const levelStr = `${colours[level]}[${level.toUpperCase()}]${reset}`
    const prefix   = `${levelStr}[${svc}]`

    const extras = meta ? Object.keys(meta).length > 0 ? meta : '' : ''

    if (level === 'error' || level === 'fatal') {
      console.error(prefix, msg, extras)
    } else if (level === 'warn') {
      console.warn(prefix, msg, extras)
    } else {
      console.log(prefix, msg, extras)
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const logger = {
  debug: (svc: string, msg: string, meta?: Record<string, unknown>) => emit('debug', svc, msg, meta),
  info:  (svc: string, msg: string, meta?: Record<string, unknown>) => emit('info',  svc, msg, meta),
  warn:  (svc: string, msg: string, meta?: Record<string, unknown>) => emit('warn',  svc, msg, meta),
  error: (svc: string, msg: string, meta?: Record<string, unknown>) => emit('error', svc, msg, meta),
  fatal: (svc: string, msg: string, meta?: Record<string, unknown>) => emit('fatal', svc, msg, meta),
}

// ── Request ID helper ─────────────────────────────────────────────────────────

/**
 * Reads the x-request-id correlation header from Next.js `headers()`.
 * Returns undefined if headers() is unavailable (e.g. outside a request context).
 *
 * Usage in a Server Action or API route:
 *   import { getReqId } from '@/lib/logger'
 *   const reqId = await getReqId()
 *   logger.info('my-module', 'doing something', { reqId })
 */
export async function getReqId(): Promise<string | undefined> {
  try {
    const { headers } = await import('next/headers')
    return (await headers()).get('x-request-id') ?? undefined
  } catch {
    return undefined
  }
}
