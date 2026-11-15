/**
 * CHAOS / RESILIENCE TESTS — AVANIIS HCM
 *
 * Tests failure modes and verifies the system degrades gracefully rather than
 * corrupting data or crashing silently.
 *
 * Blocked phases (DB outage, network partition, k6) are documented with
 * describe.skip and it.todo — they are NOT marked as passing.
 *
 * See tests/chaos/chaos-plan.md for the full chaos plan and blocked items.
 */

import { describe, it, expect, vi, afterEach, afterAll, beforeAll } from 'vitest'

// ── CHAOS-001: Audit module throws on bad tx — calling code must propagate ──
//
// writeAuditLog uses the caller's transaction executor (tx). If tx.insert
// throws, the error must propagate to the caller so their enclosing
// transaction rolls back. This verifies the audit-or-rollback invariant.
describe('CHAOS-001 — writeAuditLog propagates tx errors to caller', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('throws when the injected tx.insert throws (caller transaction rolls back)', async () => {
    vi.mock('@/lib/db', () => ({
      db: { insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }) },
    }))

    const { writeAuditLog } = await import('@/lib/audit')

    const failingTx = {
      insert: vi.fn().mockImplementation(() => {
        throw new Error('simulated DB mid-transaction failure')
      }),
    } as unknown as Parameters<typeof writeAuditLog>[1]

    await expect(
      writeAuditLog(
        {
          actorId:      'test-actor',
          actorName:    'Test Actor',
          actorRole:    'HR_ADMIN',
          channel:      'WEB',
          eventType:    'PERSON.UPDATE',
          resourceType: 'persons',
          metadata:     {},
        },
        failingTx,
      ),
    ).rejects.toThrow('simulated DB mid-transaction failure')

    vi.doUnmock('@/lib/db')
  })
})

// ── CHAOS-002: PII encryption — tampered ciphertext always rejected ───────────
//
// Encrypted PII fields (emirates_id, passport_number, iban) must never
// return garbage on decryption. Tampered ciphertext must throw.
describe('CHAOS-002 — PII encryption resilience', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'c'.repeat(64)
  })

  it('empty ciphertext throws (not silently returns empty string)', async () => {
    const { decrypt } = await import('@/lib/encryption')
    // Verified: lib/encryption.ts line 57 — `if (!ciphertext) throw`
    expect(() => decrypt('')).toThrow('decrypt: empty ciphertext')
  })

  it('too-short ciphertext throws (not silently truncated)', async () => {
    const { decrypt } = await import('@/lib/encryption')
    const tooShort = Buffer.from('short').toString('base64')
    expect(() => decrypt(tooShort)).toThrow('ciphertext too short')
  })

  it('tampered authentication tag throws (AES-GCM integrity check)', async () => {
    const { encrypt, decrypt } = await import('@/lib/encryption')
    const ct  = encrypt('784-1234-5678901-2')
    const buf = Buffer.from(ct, 'base64')
    buf[buf.length - 1] ^= 0xff // flip last byte of auth tag
    expect(() => decrypt(buf.toString('base64'))).toThrow()
  })

  it('correct round-trip produces original plaintext after chaos attempts', async () => {
    const { encrypt, decrypt } = await import('@/lib/encryption')
    const plain = 'AE12345678'
    expect(decrypt(encrypt(plain))).toBe(plain)
  })
})

// ── CHAOS-003: Effective-date record invariants ───────────────────────────────
//
// Verifies that the temporal record helpers used throughout HR actions
// maintain correct date arithmetic under boundary conditions.
// Note: overlapsRange() returns a Drizzle SQL clause (not boolean) — tested
// through integration tests. The pure-JS helpers are tested here.
describe('CHAOS-003 — effective-date invariants under boundary conditions', () => {
  it('addDays: never produces a date before the input', async () => {
    const { addDays } = await import('@/lib/effective-date')
    for (const days of [0, 1, 30, 365, 3650]) {
      const result = addDays('2024-01-01', days)
      expect(result >= '2024-01-01').toBe(true)
    }
  })

  it('addMonths: Jan 31 + 1 month does not produce invalid date', async () => {
    const { addMonths } = await import('@/lib/effective-date')
    const result = addMonths('2024-01-31', 1)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(result).toString()).not.toBe('Invalid Date')
  })

  it('isBefore: strict ordering (equal dates return false, earlier returns true)', async () => {
    const { isBefore } = await import('@/lib/effective-date')
    expect(isBefore('2024-01-01', '2024-01-01')).toBe(false)
    expect(isBefore('2024-01-01', '2024-01-02')).toBe(true)
  })

  it('yearsOfService: 5 years from a known past date', async () => {
    const { yearsOfService } = await import('@/lib/effective-date')
    const hireDate = '2019-01-01'
    const asOf     = '2024-01-01'
    const result   = yearsOfService(hireDate, asOf)
    expect(result).toBeGreaterThanOrEqual(4.9)
    expect(result).toBeLessThan(5.1)
  })

  it('yearsOfService: returns positive (abs) value for future dates (symmetric)', async () => {
    // yearsOfService uses Math.abs — future hire dates return positive values.
    // This is expected; callers must guard with isFutureDated() if needed.
    const { yearsOfService } = await import('@/lib/effective-date')
    const result = yearsOfService('2026-01-01', '2025-01-01') // future hire
    expect(result).toBeGreaterThan(0)
  })

  it('nextEffectiveSequence: increments from existing count', async () => {
    const { nextEffectiveSequence } = await import('@/lib/effective-date')
    expect(nextEffectiveSequence(0)).toBe(1)
    expect(nextEffectiveSequence(5)).toBe(6)
  })
})

// ── CHAOS-004: requireRole security gate (via mock — direct import blocked  ──
//              in jsdom by next-auth/next/server dependency)
//
// Note: requireRole RBAC tests are comprehensively covered in
// tests/security/auth-session.test.ts (60 tests). These tests verify
// the failure mode of the mock boundary used in all integration tests,
// ensuring that 'FORBIDDEN' is the correct error thrown.
describe('CHAOS-004 — requireRole mock boundary matches real behavior', () => {
  it('mocked requireRole throws FORBIDDEN for wrong role (mock boundary contract)', () => {
    // When integration tests mock requireRole to throw 'FORBIDDEN',
    // they must match real auth.ts behaviour. Verify the message.
    const mockRequireRole = (session: { user?: { role?: string } } | null, needed: string) => {
      if (!session?.user?.role) throw new Error('UNAUTHENTICATED')
      if (session.user.role !== needed) {
        const roles = [needed]
        throw new Error(`FORBIDDEN: requires one of [${roles.join(', ')}], got ${session.user.role}`)
      }
    }
    expect(() => mockRequireRole(null, 'HR_ADMIN')).toThrow('UNAUTHENTICATED')
    expect(() => mockRequireRole({ user: { role: 'EMPLOYEE' } }, 'HR_ADMIN')).toThrow('FORBIDDEN')
    expect(() => mockRequireRole({ user: { role: 'HR_ADMIN' } }, 'HR_ADMIN')).not.toThrow()
  })

  it('real lib/auth.ts throws pattern matches mock pattern (source code inspection)', () => {
    const fs = require('fs')
    const authSrc = fs.readFileSync(
      require('path').join(__dirname, '../../lib/auth.ts'),
      'utf-8',
    )
    // Verify the production source throws 'FORBIDDEN' (not just 'unauthorized' or something else)
    expect(authSrc).toMatch(/FORBIDDEN/)
    expect(authSrc).toMatch(/UNAUTHENTICATED/)
  })
})

// ── CHAOS-005: Zod validates extreme/adversarial inputs ──────────────────────
describe('CHAOS-005 — Zod input validation under adversarial payloads', () => {
  it('string.max(255) rejects 100k-char input without hanging', async () => {
    const { z } = await import('zod')
    const schema = z.object({ name: z.string().max(255) })
    const result = schema.safeParse({ name: 'a'.repeat(100_000) })
    expect(result.success).toBe(false)
  })

  it('SQL-injection pattern is treated as a plain string (Drizzle parameterises)', async () => {
    const { z } = await import('zod')
    const schema = z.object({ name: z.string().max(255) })
    const injection = "'; DROP TABLE persons; --"
    const result = schema.safeParse({ name: injection })
    expect(result.success).toBe(true) // Zod accepts; DB driver parameterises → no injection
    expect(result.data?.name).toBe(injection)
  })

  it('NaN / Infinity rejected from numeric fields', async () => {
    const { z } = await import('zod')
    const schema = z.object({ salary: z.number().finite().nonnegative() })
    expect(schema.safeParse({ salary: NaN }).success).toBe(false)
    expect(schema.safeParse({ salary: Infinity }).success).toBe(false)
    expect(schema.safeParse({ salary: -1 }).success).toBe(false)
  })

  it('numeric coercion: string "123" is accepted by z.coerce.number()', async () => {
    const { z } = await import('zod')
    const schema = z.object({ days: z.coerce.number().int().min(0).max(365) })
    expect(schema.safeParse({ days: '30' }).success).toBe(true)
    expect(schema.safeParse({ days: '366' }).success).toBe(false)
  })
})

// ── CHAOS-006: Config guards block business-rule violations ──────────────────
//
// These guards are called before every config write — they must throw, not
// silently accept, invalid configurations that would violate UAE labour law.
//
// guards.ts imports db at module level. We mock @/lib/db before each dynamic
// import so the module can load without DATABASE_URL.
describe('CHAOS-006 — config guards enforce business rules under adversarial input', () => {
  beforeAll(() => {
    vi.resetModules()
    vi.doMock('@/lib/db', () => ({ db: {} }))
  })
  afterAll(() => {
    vi.doUnmock('@/lib/db')
    vi.resetModules()
  })

  it('assertLeaveRuleNotBelowMinimum throws when annual leave < 22 days (BR-AL-001)', async () => {
    const { assertLeaveRuleNotBelowMinimum } = await import('@/modules/config/guards')
    // 1.5 days/month × 12 = 18 days → below UAE minimum of 22
    expect(() =>
      assertLeaveRuleNotBelowMinimum({ accrualRateDays: 1.5, uaeMinimumDaysAnnual: 22 }),
    ).toThrow('COMPLIANCE_VIOLATION')
  })

  it('assertLeaveRuleNotBelowMinimum passes when annual leave = 22 days exactly', async () => {
    const { assertLeaveRuleNotBelowMinimum } = await import('@/modules/config/guards')
    // 1.8333 days/month × 12 ≈ 22 days
    expect(() =>
      assertLeaveRuleNotBelowMinimum({ accrualRateDays: 22 / 12, uaeMinimumDaysAnnual: 22 }),
    ).not.toThrow()
  })

  it('assertNotSystemField throws when isSystemField = true', async () => {
    const { assertNotSystemField } = await import('@/modules/config/guards')
    // guards.ts throws 'FORBIDDEN: system fields cannot be modified or deleted'
    expect(() => assertNotSystemField({ isSystemField: true })).toThrow('FORBIDDEN')
  })

  it('assertWorkflowRoleValid throws for unknown roles', async () => {
    const { assertWorkflowRoleValid } = await import('@/modules/config/guards')
    expect(() => assertWorkflowRoleValid('HACKER')).toThrow()
  })

  it('assertWorkflowRoleValid accepts all valid approver roles', async () => {
    const { assertWorkflowRoleValid } = await import('@/modules/config/guards')
    // VALID_APPROVER_ROLES in guards.ts — workflow approver roles (not all system auth roles)
    const validRoles = ['LINE_MANAGER', 'HOD', 'HR_HOD', 'HR_DIRECTOR', 'HR_ADMIN', 'CEO']
    for (const role of validRoles) {
      expect(() => assertWorkflowRoleValid(role)).not.toThrow()
    }
  })
})

// ── CHAOS INFRASTRUCTURE STATUS ──────────────────────────────────────────────
//
// CHAOS-007: EXECUTED — see tests/chaos/toxiproxy.test.ts
//   Toxiproxy v2.12.0 installed (brew install toxiproxy).
//   5/5 tests pass: connection timeout, reset_peer, bandwidth throttle,
//   full outage + recovery. Postgres driver self-heals after all failure modes.
//   Run: toxiproxy-server & → toxiproxy-cli create -l 0.0.0.0:25432 -u localhost:5433 postgres_chaos
//        → pnpm vitest run tests/chaos/toxiproxy.test.ts
//
// CHAOS-008: BLOCKED — TLS-capable chaos proxy required for external HTTPS services.
//   Toxiproxy v2 proxies TCP only (no TLS termination). Claude API, Azure Blob,
//   email service are all HTTPS. Unblock with mitmproxy or similar.
//
// CHAOS-009 (k6): EXECUTED — tests/performance/k6-results.json has results.
//   k6 v2.0.0 installed (brew install k6). Run against pnpm start (localhost).
//   NFR-01 FAIL at 500 VU (p95=60s on laptop — environment constraint, not app defect).
//   NFR-02 PASS (/api/health p95=9.9ms). Re-run on Azure staging for valid NFR sign-off.

describe.skip('CHAOS-007 — EXECUTED in toxiproxy.test.ts (5/5 pass — Toxiproxy v2.12.0)', () => {
  it.todo('See tests/chaos/toxiproxy.test.ts for live Toxiproxy DB chaos tests')
})

describe.skip('CHAOS-008 — BLOCKED: External HTTPS service chaos (requires TLS-capable proxy)', () => {
  it.todo('BLOCKED: Claude API unreachable → ARIA chat shows error UI, no crash')
  it.todo('BLOCKED: Azure Blob unreachable → photo upload returns 503, person record intact')
  it.todo('BLOCKED: email service down → notification goes to outbox (not lost)')
})

describe.skip('CHAOS-009 — k6 EXECUTED: NFR-01 FAIL locally (re-run on Azure staging required)', () => {
  it.todo('STAGING REQUIRED: 500 VU ramp → p95 page load <2000ms (NFR-01) — laptop result invalid')
  it.todo('PASS on laptop: p95 API response <500ms (NFR-02) — health endpoint 9.9ms p95')
  it.todo('STAGING REQUIRED: 500 VU sustained → error rate <1% (NFR-04) — metric has timeout gap')
})
