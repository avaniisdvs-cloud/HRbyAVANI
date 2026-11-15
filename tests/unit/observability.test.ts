/**
 * AVANIIS HCM — Observability Infrastructure Tests
 *
 * Tests the core observability layer introduced in Phase 2 Task 7:
 *   lib/logger.ts    — structured logging, PII redaction, level filtering
 *   lib/telemetry.ts — timers, withTiming, buildServerTiming, thresholds
 *   app/api/health   — liveness probe (/api/health) and DB readiness probe (/api/health/db)
 *   middleware.ts    — x-request-id correlation header generation and propagation
 *
 * Tests:
 *   OBS-001: logger exports all 5 level methods (debug, info, warn, error, fatal)
 *   OBS-002: logger emits valid JSON to stdout with required fields in production mode
 *   OBS-003: logger redacts email field
 *   OBS-004: logger redacts iban / bankAccount / accountNumber fields
 *   OBS-005: logger redacts salary / basicSalary / grossSalary fields
 *   OBS-006: logger redacts password / passwordHash fields
 *   OBS-007: logger redacts token / accessToken / refreshToken / authToken fields
 *   OBS-008: logger redacts AUTH_SECRET / ANTHROPIC_API_KEY / FIELD_ENCRYPTION_KEY / apiKey fields
 *   OBS-009: logger redacts emirates_id / passport_number / national_id / emiratesId fields
 *   OBS-010: logger redacts phone / mobile / mobileNumber / phoneNumber fields
 *   OBS-011: logger redacts cookie / cookies / authorization / x-api-key fields
 *   OBS-012: logger redacts nested PII fields in sub-objects (deep redaction)
 *   OBS-013: logger passes non-PII fields (reqId, durationMs, stepId, count) through unchanged
 *   OBS-014: logger includes reqId field in JSON output when provided
 *   OBS-015: debug level is suppressed when LOG_LEVEL=info (level filter works)
 *   OBS-016: startTimer().elapsed() returns a non-negative float
 *   OBS-017: startTimer().elapsedMs() returns a non-negative integer (rounded)
 *   OBS-018: elapsed time increases monotonically over successive calls
 *   OBS-019: withTiming() returns the awaited function result unchanged
 *   OBS-020: withTiming() durationMs is a non-negative integer
 *   OBS-021: buildServerTiming() formats single entry as "name;dur=N"
 *   OBS-022: buildServerTiming() formats multiple entries comma-separated
 *   OBS-023: buildServerTiming() empty object returns empty string
 *   OBS-024: SLOW_PAGE_MS is below NFR-01 threshold (2 000ms)
 *   OBS-025: SLOW_API_MS is below NFR-02 threshold (500ms)
 *   OBS-026: all six threshold constants are positive integers
 *   OBS-027: GET /api/health returns HTTP 200
 *   OBS-028: GET /api/health body has status:'ok'
 *   OBS-029: GET /api/health body has ISO-8601 timestamp
 *   OBS-030: GET /api/health body has responseMs field (number ≥ 0)
 *   OBS-031: GET /api/health response has Cache-Control: no-store
 *   OBS-032: GET /api/health/db returns HTTP 200 when DB is reachable
 *   OBS-033: GET /api/health/db body has status:'ok' and numeric dbMs on success
 *   OBS-034: GET /api/health/db returns HTTP 503 when DB throws
 *   OBS-035: GET /api/health/db 503 body has generic error message — no connection string
 *   OBS-036: GET /api/health/db 503 body has numeric dbMs field
 *   OBS-037: middleware.ts generates x-request-id UUID when header is absent
 *   OBS-038: middleware.ts preserves existing x-request-id — does not overwrite
 *   OBS-039: middleware.ts echoes x-request-id in all response branches
 *   OBS-040: /api/health is in the middleware public-routes list (no auth required)
 *   OBS-041: /api/health uses startTimer() for responseMs measurement
 *   OBS-042: /api/health/db uses startTimer() for dbMs measurement
 *   OBS-043: /api/health/db logs DB errors via logger.error
 *   OBS-044: /api/health/db never exposes raw connection-string keywords in error body
 *   OBS-045: /api/health sets force-dynamic to prevent Vercel caching
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs   from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

// ─────────────────────────────────────────────────────────────────────────────
// Mock registrations — vi.mock() is hoisted to before all imports by Vitest.
// Factories run lazily on first import, so module-scope variables referenced
// inside the factory (dbExecuteMock) are fully initialised by that point.
// ─────────────────────────────────────────────────────────────────────────────

// Minimal NextResponse / NextRequest stand-ins so route handlers work in jsdom.
vi.mock('next/server', () => {
  class MockHeaders {
    private _m = new Map<string, string>()
    set(k: string, v: string) { this._m.set(k, v) }
    get(k: string): string | null { return this._m.get(k) ?? null }
  }

  class MockNextResponse {
    private _body: unknown
    readonly status: number
    readonly headers = new MockHeaders()

    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this._body  = body
      this.status = init?.status ?? 200
      if (init?.headers) {
        for (const [k, v] of Object.entries(init.headers)) this.headers.set(k, v)
      }
    }

    async json() { return this._body }

    static json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new MockNextResponse(data, init)
    }

    static next()             { return new MockNextResponse(null) }
    static redirect(_u: unknown) { return new MockNextResponse(null, { status: 307 }) }
  }

  return { NextResponse: MockNextResponse }
})

// Controllable DB mock: tests set dbExecuteMock.mockResolvedValue / mockRejectedValue.
const dbExecuteMock = vi.fn()
vi.mock('@/lib/db', () => ({
  db: { execute: (...args: unknown[]) => dbExecuteMock(...args) },
}))

// sql is used as a tagged template literal: sql`SELECT 1`
// Tagged template literals call the function directly, so sql must be callable.
vi.mock('drizzle-orm', () => ({
  sql: vi.fn(() => ({})),
}))

// ─────────────────────────────────────────────────────────────────────────────
// Top-level imports (run after vi.mock factories are registered).
// NOTE: @/lib/logger is NOT mocked — tests exercise the real implementation.
// ─────────────────────────────────────────────────────────────────────────────

const { logger } = await import('@/lib/logger')

const {
  startTimer,
  withTiming,
  buildServerTiming,
  SLOW_PAGE_MS,
  SLOW_API_MS,
  SLOW_QUERY_MS,
  SLOW_ARIA_MS,
  SLOW_JOB_MS,
  SLOW_OUTBOX_TICK_MS,
} = await import('@/lib/telemetry')

// Health route handlers — next/server + @/lib/db are mocked at this point.
const { GET: getHealth }   = await import('@/app/api/health/route')
const { GET: getDbHealth } = await import('@/app/api/health/db/route')

// ─────────────────────────────────────────────────────────────────────────────
// § 1 — lib/logger.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Captures the JSON line(s) emitted to process.stdout when the logger runs in
 * production mode.  Temporarily overrides NODE_ENV and mocks stdout.write.
 */
function captureProductionLog(fn: () => void): Record<string, unknown> {
  const origEnv = process.env.NODE_ENV
  ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'

  const chunks: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
    chunks.push(String(data))
    return true
  })

  try {
    fn()
  } finally {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = origEnv
    spy.mockRestore()
  }

  const line = chunks.join('').trim()
  expect(line.length, 'expected at least one stdout write').toBeGreaterThan(0)
  return JSON.parse(line) as Record<string, unknown>
}

describe('lib/logger.ts', () => {
  describe('OBS-001: exported API', () => {
    it('exports all 5 level methods', () => {
      expect(typeof logger.debug).toBe('function')
      expect(typeof logger.info ).toBe('function')
      expect(typeof logger.warn ).toBe('function')
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.fatal).toBe('function')
    })
  })

  describe('OBS-002: log record shape', () => {
    it('emits valid JSON with ts, level, svc, msg fields', () => {
      const rec = captureProductionLog(() =>
        logger.info('obs-test', 'shape check', { count: 5 }),
      )
      expect(rec.level).toBe('info')
      expect(rec.svc  ).toBe('obs-test')
      expect(rec.msg  ).toBe('shape check')
      expect(typeof rec.ts).toBe('string')
      expect(() => new Date(rec.ts as string).toISOString()).not.toThrow()
    })
  })

  describe('OBS-003–011: PII redaction', () => {
    it('OBS-003: redacts email', () => {
      const rec = captureProductionLog(() =>
        logger.info('test', 'msg', { email: 'user@avaniis.dev' }),
      )
      expect(rec.email).toBe('[REDACTED]')
    })

    it('OBS-004: redacts iban, bankAccount, accountNumber', () => {
      const rec = captureProductionLog(() =>
        logger.info('test', 'msg', {
          iban:          'AE070331234567890123456',
          bankAccount:   'ACC-001',
          accountNumber: '12345678',
        }),
      )
      expect(rec.iban         ).toBe('[REDACTED]')
      expect(rec.bankAccount  ).toBe('[REDACTED]')
      expect(rec.accountNumber).toBe('[REDACTED]')
    })

    it('OBS-005: redacts salary, basicSalary, grossSalary', () => {
      const rec = captureProductionLog(() =>
        logger.info('test', 'msg', {
          salary:      15000,
          basicSalary: 12000,
          grossSalary: 16500,
        }),
      )
      expect(rec.salary     ).toBe('[REDACTED]')
      expect(rec.basicSalary).toBe('[REDACTED]')
      expect(rec.grossSalary).toBe('[REDACTED]')
    })

    it('OBS-006: redacts password and passwordHash', () => {
      const rec = captureProductionLog(() =>
        logger.info('test', 'msg', { password: 'secret123', passwordHash: 'bcrypt$2a$hash' }),
      )
      expect(rec.password    ).toBe('[REDACTED]')
      expect(rec.passwordHash).toBe('[REDACTED]')
    })

    it('OBS-007: redacts token, accessToken, refreshToken, authToken', () => {
      const rec = captureProductionLog(() =>
        logger.info('test', 'msg', {
          token:        'tok-abc',
          accessToken:  'at-xyz',
          refreshToken: 'rt-xyz',
          authToken:    'auth-xyz',
        }),
      )
      expect(rec.token       ).toBe('[REDACTED]')
      expect(rec.accessToken ).toBe('[REDACTED]')
      expect(rec.refreshToken).toBe('[REDACTED]')
      expect(rec.authToken   ).toBe('[REDACTED]')
    })

    it('OBS-008: redacts AUTH_SECRET, ANTHROPIC_API_KEY, FIELD_ENCRYPTION_KEY, apiKey, api_key', () => {
      const rec = captureProductionLog(() =>
        logger.info('test', 'msg', {
          AUTH_SECRET:          'auth-secret-value',
          ANTHROPIC_API_KEY:    'sk-ant-xxxxx',
          FIELD_ENCRYPTION_KEY: 'aabbccdd',
          apiKey:               'api-key-val',
          api_key:              'api-key-val-2',
        }),
      )
      expect(rec.AUTH_SECRET         ).toBe('[REDACTED]')
      expect(rec.ANTHROPIC_API_KEY   ).toBe('[REDACTED]')
      expect(rec.FIELD_ENCRYPTION_KEY).toBe('[REDACTED]')
      expect(rec.apiKey              ).toBe('[REDACTED]')
      expect(rec.api_key             ).toBe('[REDACTED]')
    })

    it('OBS-009: redacts emiratesId, emirates_id, passport_number, national_id', () => {
      const rec = captureProductionLog(() =>
        logger.info('test', 'msg', {
          emiratesId:      '784-1234-5678901-2',
          emirates_id:     '784-1234-5678901-2',
          passport_number: 'A12345678',
          national_id:     'NID-001',
        }),
      )
      expect(rec.emiratesId     ).toBe('[REDACTED]')
      expect(rec.emirates_id    ).toBe('[REDACTED]')
      expect(rec.passport_number).toBe('[REDACTED]')
      expect(rec.national_id    ).toBe('[REDACTED]')
    })

    it('OBS-010: redacts phone, mobile, mobileNumber, phoneNumber', () => {
      const rec = captureProductionLog(() =>
        logger.info('test', 'msg', {
          phone:        '+971501234567',
          mobile:       '+971501234567',
          mobileNumber: '+971501234567',
          phoneNumber:  '+971501234567',
        }),
      )
      expect(rec.phone       ).toBe('[REDACTED]')
      expect(rec.mobile      ).toBe('[REDACTED]')
      expect(rec.mobileNumber).toBe('[REDACTED]')
      expect(rec.phoneNumber ).toBe('[REDACTED]')
    })

    it('OBS-011: redacts cookie, cookies, authorization, x-api-key', () => {
      const rec = captureProductionLog(() =>
        logger.info('test', 'msg', {
          cookie:        '__Secure-authjs.session-token=xxx',
          cookies:       { session: 'yyy' },
          authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9',
          'x-api-key':   'xak-abc',
        }),
      )
      expect(rec.cookie       ).toBe('[REDACTED]')
      expect(rec.cookies      ).toBe('[REDACTED]')
      expect(rec.authorization).toBe('[REDACTED]')
      expect(rec['x-api-key'] ).toBe('[REDACTED]')
    })

    it('OBS-012: deeply redacts PII in nested objects', () => {
      const rec = captureProductionLog(() =>
        logger.info('test', 'msg', {
          user: {
            id:       'uuid-001',
            email:    'nested@avaniis.dev',        // PII — must be redacted
            name:     'Test User',                  // safe — must pass through
            bankInfo: {
              iban:   'AE070331234567890123456',    // nested PII
              branch: 'BRANCH-001',                  // safe
            },
          },
        }),
      )
      const user     = rec.user     as Record<string, unknown>
      const bankInfo = user.bankInfo as Record<string, unknown>
      expect(user.id      ).toBe('uuid-001')
      expect(user.name    ).toBe('Test User')
      expect(user.email   ).toBe('[REDACTED]')
      expect(bankInfo.branch).toBe('BRANCH-001')
      expect(bankInfo.iban  ).toBe('[REDACTED]')
    })

    it('OBS-013: passes non-PII fields through unchanged', () => {
      const rec = captureProductionLog(() =>
        logger.info('workflow', 'step approved', {
          reqId:      'req-uuid-001',
          durationMs: 123,
          stepId:     'step-uuid-002',
          count:      42,
          region:     'fra1',
        }),
      )
      expect(rec.reqId     ).toBe('req-uuid-001')
      expect(rec.durationMs).toBe(123)
      expect(rec.stepId    ).toBe('step-uuid-002')
      expect(rec.count     ).toBe(42)
      expect(rec.region    ).toBe('fra1')
    })

    it('OBS-014: includes reqId in JSON output', () => {
      const rec = captureProductionLog(() =>
        logger.info('aria', 'stream started', { reqId: 'corr-id-abc123' }),
      )
      expect(rec.reqId).toBe('corr-id-abc123')
    })
  })

  describe('OBS-015: level filtering', () => {
    it('suppresses debug messages when LOG_LEVEL=info', async () => {
      // Fresh module with LOG_LEVEL=info set before evaluation so MIN_LEVEL='info'.
      vi.resetModules()
      const origLogLevel = process.env.LOG_LEVEL
      process.env.LOG_LEVEL = 'info'

      const { logger: fresh } = await import('@/lib/logger')

      const chunks: string[] = []
      const origEnv = process.env.NODE_ENV
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
        chunks.push(String(data))
        return true
      })

      try {
        fresh.debug('test', 'debug-should-be-suppressed')
        fresh.info ('test', 'info-should-appear')
      } finally {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = origEnv
        spy.mockRestore()
        if (origLogLevel === undefined) delete process.env.LOG_LEVEL
        else process.env.LOG_LEVEL = origLogLevel
        vi.resetModules()
      }

      const output = chunks.join('')
      expect(output).not.toContain('debug-should-be-suppressed')
      expect(output).toContain('info-should-appear')
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// § 2 — lib/telemetry.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('lib/telemetry.ts', () => {
  describe('OBS-016–018: startTimer()', () => {
    it('OBS-016: elapsed() returns a non-negative float', () => {
      const t = startTimer()
      const ms = t.elapsed()
      expect(typeof ms).toBe('number')
      expect(ms).toBeGreaterThanOrEqual(0)
    })

    it('OBS-017: elapsedMs() returns a non-negative integer', () => {
      const t = startTimer()
      const ms = t.elapsedMs()
      expect(typeof ms).toBe('number')
      expect(ms).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(ms)).toBe(true)
    })

    it('OBS-018: elapsed time is monotonically non-decreasing', async () => {
      const t = startTimer()
      const first = t.elapsed()
      await new Promise(r => setTimeout(r, 5))
      const second = t.elapsed()
      expect(second).toBeGreaterThanOrEqual(first)
    })
  })

  describe('OBS-019–020: withTiming()', () => {
    it('OBS-019: returns the function result unchanged', async () => {
      const { result } = await withTiming(async () => 'hello-world')
      expect(result).toBe('hello-world')
    })

    it('OBS-019b: returns complex object results unchanged', async () => {
      const obj = { id: 'uuid-001', count: 7 }
      const { result } = await withTiming(async () => obj)
      expect(result).toBe(obj)
    })

    it('OBS-020: durationMs is a non-negative integer', async () => {
      const { durationMs } = await withTiming(async () => null)
      expect(typeof durationMs).toBe('number')
      expect(durationMs).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(durationMs)).toBe(true)
    })

    it('OBS-020b: durationMs reflects real elapsed time for a delayed operation', async () => {
      const { durationMs } = await withTiming(
        () => new Promise<void>(r => setTimeout(r, 20)),
      )
      expect(durationMs).toBeGreaterThan(0)
    })
  })

  describe('OBS-021–023: buildServerTiming()', () => {
    it('OBS-021: formats a single entry as "name;dur=N"', () => {
      expect(buildServerTiming({ db: 23 })).toBe('db;dur=23')
    })

    it('OBS-022: formats multiple entries comma-separated', () => {
      expect(buildServerTiming({ db: 23, aria: 1420, total: 1498 }))
        .toBe('db;dur=23, aria;dur=1420, total;dur=1498')
    })

    it('OBS-023: empty object returns empty string', () => {
      expect(buildServerTiming({})).toBe('')
    })
  })

  describe('OBS-024–026: threshold constants', () => {
    it('OBS-024: SLOW_PAGE_MS is below NFR-01 threshold (2 000ms)', () => {
      expect(SLOW_PAGE_MS).toBeGreaterThan(0)
      expect(SLOW_PAGE_MS).toBeLessThan(2_000)
    })

    it('OBS-025: SLOW_API_MS is below NFR-02 threshold (500ms)', () => {
      expect(SLOW_API_MS).toBeGreaterThan(0)
      expect(SLOW_API_MS).toBeLessThan(500)
    })

    it('OBS-026: all six threshold constants are positive integers', () => {
      const constants: [string, number][] = [
        ['SLOW_PAGE_MS',        SLOW_PAGE_MS       ],
        ['SLOW_API_MS',         SLOW_API_MS        ],
        ['SLOW_QUERY_MS',       SLOW_QUERY_MS      ],
        ['SLOW_ARIA_MS',        SLOW_ARIA_MS       ],
        ['SLOW_JOB_MS',         SLOW_JOB_MS        ],
        ['SLOW_OUTBOX_TICK_MS', SLOW_OUTBOX_TICK_MS],
      ]
      for (const [name, value] of constants) {
        expect(Number.isInteger(value), `${name} should be an integer`).toBe(true)
        expect(value, `${name} should be positive`).toBeGreaterThan(0)
      }
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// § 3 — GET /api/health  (liveness probe)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/health (liveness probe)', () => {
  it('OBS-027: returns HTTP 200', async () => {
    const res = await getHealth()
    expect(res.status).toBe(200)
  })

  it('OBS-028: body has status:"ok"', async () => {
    const body = await (await getHealth()).json() as Record<string, unknown>
    expect(body.status).toBe('ok')
  })

  it('OBS-029: body has ISO-8601 timestamp', async () => {
    const body = await (await getHealth()).json() as Record<string, unknown>
    expect(typeof body.timestamp).toBe('string')
    expect(() => new Date(body.timestamp as string).toISOString()).not.toThrow()
  })

  it('OBS-030: body has numeric responseMs ≥ 0', async () => {
    const body = await (await getHealth()).json() as Record<string, unknown>
    expect(typeof body.responseMs).toBe('number')
    expect(body.responseMs as number).toBeGreaterThanOrEqual(0)
  })

  it('OBS-031: response has Cache-Control: no-store', async () => {
    const res = await getHealth()
    const cc  = res.headers.get('Cache-Control')
    expect(cc).toBeTruthy()
    expect(cc).toContain('no-store')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// § 4 — GET /api/health/db  (DB readiness probe)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/health/db (DB readiness probe)', () => {
  beforeEach(() => { dbExecuteMock.mockReset() })

  it('OBS-032: returns HTTP 200 when DB is reachable', async () => {
    dbExecuteMock.mockResolvedValue([{ '?column?': 1 }])
    const res = await getDbHealth()
    expect(res.status).toBe(200)
  })

  it('OBS-033: 200 body has status:"ok" and numeric dbMs', async () => {
    dbExecuteMock.mockResolvedValue([{ '?column?': 1 }])
    const body = await (await getDbHealth()).json() as Record<string, unknown>
    expect(body.status          ).toBe('ok')
    expect(typeof body.dbMs     ).toBe('number')
    expect(body.dbMs as number  ).toBeGreaterThanOrEqual(0)
  })

  it('OBS-034: returns HTTP 503 when DB throws', async () => {
    dbExecuteMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'))
    const res = await getDbHealth()
    expect(res.status).toBe(503)
  })

  it('OBS-035: 503 body has generic error message — does not expose connection string', async () => {
    const connString = 'postgres://user:password@neon.tech/db'
    dbExecuteMock.mockRejectedValue(new Error(`Cannot connect to ${connString}`))
    const body = await (await getDbHealth()).json() as Record<string, unknown>
    // Generic message only
    expect(body.error).toBe('Database unavailable')
    // Raw credentials must never appear
    const serialised = JSON.stringify(body)
    expect(serialised).not.toContain(connString)
    expect(serialised).not.toContain('password')
  })

  it('OBS-036: 503 body has numeric dbMs field', async () => {
    dbExecuteMock.mockRejectedValue(new Error('timeout'))
    const body = await (await getDbHealth()).json() as Record<string, unknown>
    expect(typeof body.dbMs   ).toBe('number')
    expect(body.dbMs as number).toBeGreaterThanOrEqual(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// § 5 — middleware.ts — x-request-id correlation (source inspection)
// ─────────────────────────────────────────────────────────────────────────────
// The Edge middleware cannot be instantiated in a jsdom/Node vitest context
// (depends on next-auth's Edge imports). Correct behaviour is verified by
// precise static analysis of the middleware source — the same technique used
// for aria-route-access.test.ts and other source-inspection tests.

const middlewareSrc = fs.readFileSync(path.join(ROOT, 'middleware.ts'), 'utf-8')

describe('middleware.ts — x-request-id correlation (OBS-037–040)', () => {
  it('OBS-037: generates x-request-id UUID when header is absent', () => {
    // crypto.randomUUID() is the fallback path
    expect(middlewareSrc).toContain('crypto.randomUUID()')
    // Pattern: req.headers.get('x-request-id') ?? crypto.randomUUID()
    expect(middlewareSrc).toMatch(
      /headers\.get\(['"]x-request-id['"]\)\s*\?\?\s*crypto\.randomUUID\(\)/,
    )
  })

  it('OBS-038: preserves existing x-request-id — uses ?? not unconditional assignment', () => {
    // Nullish-coalescing means existing header is reused, new UUID is only generated if absent
    const reusePattern = /req\.headers\.get\(['"]x-request-id['"]\)\s*\?\?\s*crypto\.randomUUID\(\)/
    expect(reusePattern.test(middlewareSrc)).toBe(true)
    // Must NOT unconditionally overwrite with a fresh UUID
    expect(middlewareSrc).not.toMatch(/reqId\s*=\s*crypto\.randomUUID\(\)\s*;/)
  })

  it('OBS-039: echoes x-request-id in response headers across all branches', () => {
    // Every response site must call res.headers.set('x-request-id', reqId)
    const setMatches = middlewareSrc.match(
      /res\.headers\.set\(['"]x-request-id['"],\s*reqId\)/g,
    ) ?? []
    // There are at least 4 distinct response sites: public, unauthenticated
    // redirect, role-gate redirect, and authenticated passthrough.
    expect(setMatches.length).toBeGreaterThanOrEqual(4)
  })

  it('OBS-039b: authenticated passthrough injects x-request-id into downstream request headers', () => {
    // requestHeaders.set() threads the correlation ID through to Server Actions and API routes
    expect(middlewareSrc).toContain("requestHeaders.set('x-request-id', reqId)")
  })

  it('OBS-040: /api/health is in the public-routes list (no auth gate)', () => {
    expect(middlewareSrc).toMatch(
      /pathname\.startsWith\(['"]\/api\/health['"]\)/,
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// § 6 — Source completeness checks
// ─────────────────────────────────────────────────────────────────────────────

const healthSrc   = fs.readFileSync(path.join(ROOT, 'app/api/health/route.ts'),     'utf-8')
const healthDbSrc = fs.readFileSync(path.join(ROOT, 'app/api/health/db/route.ts'), 'utf-8')

describe('Observability source completeness (OBS-041–045)', () => {
  it('OBS-041: /api/health uses startTimer() for responseMs measurement', () => {
    expect(healthSrc).toContain('startTimer()')
    expect(healthSrc).toContain('t.elapsedMs()')
    expect(healthSrc).toContain('responseMs')
  })

  it('OBS-042: /api/health/db uses startTimer() for dbMs measurement', () => {
    expect(healthDbSrc).toContain('startTimer()')
    expect(healthDbSrc).toContain('t.elapsedMs()')
    expect(healthDbSrc).toContain('dbMs')
  })

  it('OBS-043: /api/health/db logs DB errors via logger.error', () => {
    expect(healthDbSrc).toContain("logger.error('health-db'")
  })

  it('OBS-044: /api/health/db error body uses a generic message, not the raw error', () => {
    // The 503 response must contain a hardcoded generic string
    expect(healthDbSrc).toContain("'Database unavailable'")
    // The error body builder must NOT reference the raw `message` variable
    // Locate the NextResponse.json block in the catch handler
    const catchIdx  = healthDbSrc.indexOf('catch (err)')
    const jsonStart = healthDbSrc.indexOf('NextResponse.json', catchIdx)
    const jsonEnd   = healthDbSrc.indexOf('})', jsonStart)
    const jsonBlock = healthDbSrc.slice(jsonStart, jsonEnd + 2)
    expect(jsonBlock).not.toContain('message')
  })

  it('OBS-045: /api/health and /api/health/db set force-dynamic (no Vercel caching)', () => {
    expect(healthSrc  ).toContain("export const dynamic = 'force-dynamic'")
    expect(healthDbSrc).toContain("export const dynamic = 'force-dynamic'")
  })
})
