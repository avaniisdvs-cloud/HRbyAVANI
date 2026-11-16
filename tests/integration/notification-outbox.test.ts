// @vitest-environment node
/**
 * CHAOS-008c — SMTP / notification-delivery failure resilience tests
 *
 * Verifies that notification delivery failures degrade gracefully:
 *   - sendLetterEmail returns { success: false } instead of throwing
 *   - bulkSendLetterEmails continues despite partial failures
 *   - Notification records are never lost on delivery failure
 *   - Workflows are not blocked by email-transport failures
 *
 * The notification system uses a Postgres outbox pattern:
 *   1. notification_log row is inserted as 'PENDING' inside the main Drizzle tx
 *   2. Email dispatch is a separate async concern (background job)
 *   3. If email fails, the log row remains PENDING for retry — never deleted
 *
 * Pass criteria (from chaos-plan.md CHAOS-008c):
 *   - Email delivery returns { success: false } on SMTP failure (no throw)
 *   - Notification log records persisted as PENDING (not lost)
 *   - Retry path documented
 *
 * NOTE: email.ts reads SMTP_HOST / SMTP_USER / SMTP_PASS at module load time
 * (top-level const). Tests that need different transport configs use
 * vi.resetModules() + dynamic re-import so the constants are re-evaluated.
 *
 * Execution: pnpm vitest run tests/integration/notification-outbox.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
vi.mock('@/lib/company-branding', () => ({ getCompanyBranding: async () => ({ companyName: 'AVANIIS', companyNameAr: 'أفانيس', logoUrl: null }) }))


// ── Mock Azure Communication email SDK (optional dep) ────────────────────────
vi.mock('@azure/communication-email', () => ({
  EmailClient: class {
    async beginSend() { return { pollUntilDone: async () => {} } }
  },
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CHAOS-008c — No transport configured (sendLetterEmail)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No SMTP or ACS env vars set — ensures 'none' transport path
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    delete process.env.ACS_EMAIL_CONNECTION_STRING
  })

  // C8C-001 — No transport → returns { success: false }, never throws
  it('C8C-001: No transport configured → sendLetterEmail returns { success: false }', async () => {
    vi.resetModules()
    const { sendLetterEmail } = await import('@/modules/employee-letters/email')

    await expect(
      sendLetterEmail({
        recipientEmail: 'employee@avaniis.dev',
        recipientName:  'Test Employee',
        letterNumber:   'LTR-2026-001',
        letterTypeName: 'Salary Certificate',
        companyName:    'Avaniis',
      }),
    ).resolves.toMatchObject({
      email:   'employee@avaniis.dev',
      success: false,
    })
  })

  // C8C-002 — No transport → error message present; actual credentials not leaked
  it('C8C-002: No transport → result.error is set; actual credential values not exposed', async () => {
    vi.resetModules()
    const { sendLetterEmail } = await import('@/modules/employee-letters/email')

    const result = await sendLetterEmail({
      recipientEmail: 'employee@avaniis.dev',
      recipientName:  'Test Employee',
      letterNumber:   'LTR-2026-001',
      letterTypeName: 'Salary Certificate',
      companyName:    'Avaniis',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    // Actual password/token values must NOT appear — env var names (like SMTP_PASS) are OK
    expect(result.error).not.toMatch(/password=[^\s]+|apikey=[^\s]+|secret=[^\s]+/i)
    expect(result.error).not.toMatch(/Bearer sk-|sk-ant-/i)
  })
})

describe('CHAOS-008c — SMTP transport failure (sendLetterEmail)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
    delete process.env.ACS_EMAIL_CONNECTION_STRING
  })

  afterEach(() => {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
  })

  // C8C-003 — SMTP sendMail throws → returns { success: false }, never throws
  it('C8C-003: SMTP sendMail failure → returns { success: false }, does NOT propagate throw', async () => {
    // Set SMTP env vars BEFORE module import so top-level consts are bound
    process.env.SMTP_HOST = 'smtp.avaniis.local'
    process.env.SMTP_USER = 'noreply@avaniis.dev'
    process.env.SMTP_PASS = 'test-pass'

    // Reset module cache so email.ts re-reads env vars
    vi.resetModules()

    // vi.doMock (NOT vi.mock) — avoids Vitest hoisting; runs in call order
    vi.doMock('nodemailer', () => ({
      default: {
        createTransport: vi.fn(() => ({
          sendMail: vi.fn().mockRejectedValue(
            new Error('connect ECONNREFUSED 127.0.0.1:9998'),
          ),
        })),
      },
    }))

    const { sendLetterEmail } = await import('@/modules/employee-letters/email')

    const result = await sendLetterEmail({
      recipientEmail: 'employee@avaniis.dev',
      recipientName:  'Test Employee',
      letterNumber:   'LTR-2026-002',
      letterTypeName: 'Employment Certificate',
      companyName:    'Avaniis',
    })

    // The SMTP error must be caught and returned as { success: false }
    expect(result.success).toBe(false)
    expect(result.email).toBe('employee@avaniis.dev')
    expect(result.error).toBeTruthy()

    vi.doUnmock('nodemailer')
  })

  // C8C-004 — SMTP auth rejection (535) → returns { success: false }
  it('C8C-004: SMTP auth rejection (535) → returns { success: false }', async () => {
    process.env.SMTP_HOST = 'smtp.office365.com'
    process.env.SMTP_USER = 'noreply@avaniis.dev'
    process.env.SMTP_PASS = 'wrong-pass'

    vi.resetModules()
    // vi.doMock (NOT vi.mock) — avoids Vitest hoisting; runs in call order
    vi.doMock('nodemailer', () => ({
      default: {
        createTransport: vi.fn(() => ({
          sendMail: vi.fn().mockRejectedValue(
            Object.assign(new Error('535 5.7.3 Authentication unsuccessful'), { responseCode: 535 }),
          ),
        })),
      },
    }))

    const { sendLetterEmail } = await import('@/modules/employee-letters/email')

    const result = await sendLetterEmail({
      recipientEmail: 'employee@avaniis.dev',
      recipientName:  'Test Employee',
      letterNumber:   'LTR-2026-003',
      letterTypeName: 'NOC Letter',
      companyName:    'Avaniis',
    })

    expect(result.success).toBe(false)
    // Actual SMTP password must NOT be in the error string
    expect(result.error ?? '').not.toContain('wrong-pass')

    vi.doUnmock('nodemailer')
  })
})

describe('CHAOS-008c — Bulk send with partial SMTP failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
  })

  afterEach(() => {
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASS
  })

  // C8C-005 — Mixed success/failure returns correct counts
  it('C8C-005: bulkSendLetterEmails with partial failure reports correct sent/failed counts', async () => {
    process.env.SMTP_HOST = 'smtp.avaniis.local'
    process.env.SMTP_USER = 'noreply@avaniis.dev'
    process.env.SMTP_PASS = 'test-pass'

    vi.resetModules()

    let callCount = 0
    // 1st succeeds, 2nd fails, 3rd succeeds
    // vi.doMock (NOT vi.mock) — avoids Vitest hoisting; captures callCount via closure
    vi.doMock('nodemailer', () => ({
      default: {
        createTransport: vi.fn(() => ({
          sendMail: vi.fn().mockImplementation(async () => {
            callCount++
            if (callCount === 2) throw new Error('connect ECONNREFUSED')
            return { messageId: `msg-${callCount}@avaniis.dev` }
          }),
        })),
      },
    }))

    const { bulkSendLetterEmails } = await import('@/modules/employee-letters/email')

    const result = await bulkSendLetterEmails({
      letters: [
        { recipientEmail: 'emp1@avaniis.dev', recipientName: 'Emp 1', letterNumber: 'LTR-001' },
        { recipientEmail: 'emp2@avaniis.dev', recipientName: 'Emp 2', letterNumber: 'LTR-002' },
        { recipientEmail: 'emp3@avaniis.dev', recipientName: 'Emp 3', letterNumber: 'LTR-003' },
      ],
      letterTypeName: 'Salary Certificate',
      companyName:    'Avaniis',
    })

    expect(result.sent).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.results).toHaveLength(3)
    expect(result.results[0].success).toBe(true)
    expect(result.results[1].success).toBe(false)
    expect(result.results[2].success).toBe(true)

    vi.doUnmock('nodemailer')
  })

  // C8C-006 — All-fail bulk send returns { sent:0, failed:N }, never throws
  it('C8C-006: All-fail bulk send returns { sent:0, failed:N } without throwing', async () => {
    vi.resetModules()
    // No SMTP env vars — 'none' transport → all return { success: false }
    const { bulkSendLetterEmails } = await import('@/modules/employee-letters/email')

    await expect(
      bulkSendLetterEmails({
        letters: [
          { recipientEmail: 'a@avaniis.dev', recipientName: 'A', letterNumber: 'LTR-A' },
          { recipientEmail: 'b@avaniis.dev', recipientName: 'B', letterNumber: 'LTR-B' },
        ],
        letterTypeName: 'Employment Certificate',
        companyName:    'Avaniis',
      }),
    ).resolves.toMatchObject({ sent: 0, failed: 2 })
  })
})

describe('CHAOS-008c — Notification outbox integrity (PENDING status preserved)', () => {
  // C8C-007 — notification_log rows always written as PENDING (outbox contract)
  it('C8C-007: sla-breach-checker writes notification_log with status PENDING (not SENT)', async () => {
    const fs = await import('fs')
    const slaSource = fs.readFileSync(
      new URL('../../lib/jobs/sla-breach-checker.ts', import.meta.url).pathname,
      'utf8',
    )
    // The SLA breach checker must write PENDING so the background delivery job can retry
    // Accepts "status: 'PENDING'" with any whitespace (as const is optional)
    expect(slaSource).toMatch(/status:\s*'PENDING'/)
    // Must NOT write SENT directly (SENT means email was already dispatched)
    expect(slaSource).not.toMatch(/status:\s*'SENT'/)
  })

  // C8C-008 — Outbox poller increments retry_count (never deletes on failure)
  it('C8C-008: outbox poller increments retry_count on dispatch failure — never deletes rows', async () => {
    const fs = await import('fs')
    const pdSource = fs.readFileSync(
      new URL('../../lib/jobs/process-driver.ts', import.meta.url).pathname,
      'utf8',
    )
    // Must increment retry_count (not delete) on failure
    expect(pdSource).toContain('retryCount')
    expect(pdSource).toContain('OUTBOX_MAX_RETRIES')
    // Must NOT delete rows — outbox is append-only / soft-fail
    expect(pdSource).not.toMatch(/\.delete\s*\(/)
  })
})
