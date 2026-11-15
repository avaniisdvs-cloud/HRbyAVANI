import { describe, it, expect, vi, beforeEach } from 'vitest'
// QA-Audit-S4-Q6 — single source of truth for the test tenant.
import { TENANT_ID as TENANT } from '@/lib/constants'

/**
 * Tests for modules/config/guards.ts (S2-08 / D-09).
 * Covers the six domain guardrails called from every config Server Action.
 *
 * Mocking strategy mirrors tests/lib/config-resolver.test.ts: a Proxy-based
 * Drizzle stub that lets each test push the next query result into a queue.
 */

// ── Drizzle query stub ─────────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex = 0

const makeProxy = (): unknown => new Proxy({} as Record<string, unknown>, {
  get(_: Record<string, unknown>, prop: string) {
    if (prop === 'then') {
      return (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(queryQueue[callIndex++] ?? []).then(resolve, reject)
    }
    if (prop === 'catch')   return (fn: (e: unknown) => unknown) => Promise.resolve(queryQueue[callIndex++] ?? []).catch(fn)
    if (prop === 'finally') return (fn: () => unknown) => Promise.resolve(queryQueue[callIndex++] ?? []).finally(fn)
    if (prop === 'limit')   return () => Promise.resolve(queryQueue[callIndex++] ?? [])
    return () => makeProxy()
  },
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = { select: vi.fn() }

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/drizzle/schema', () => ({
  customFieldDefinitions: {},
  notificationTemplates:  {},
}))
vi.mock('drizzle-orm', () => ({
  eq:    () => ({}),
  and:   (...a: unknown[]) => a,
  count: () => ({ as: () => ({}) }),
}))

const {
  assertNotSystemField,
  assertLeaveRuleNotBelowMinimum,
  assertMaxCustomFields,
  assertWorkflowRoleValid,
  assertEscalationRoleHigher,
  assertPlaceholdersValid,
} = await import('@/modules/config/guards')

beforeEach(() => {
  callIndex = 0
  queryQueue = []
  vi.clearAllMocks()
  mockDb.select.mockImplementation(() => makeProxy())
})

// ─────────────────────────────────────────────────────────────────────────────

describe('assertNotSystemField', () => {
  it('throws when isSystemField is true', () => {
    expect(() => assertNotSystemField({ isSystemField: true })).toThrow(/system fields/i)
  })

  it('does not throw when isSystemField is false', () => {
    expect(() => assertNotSystemField({ isSystemField: false })).not.toThrow()
  })

  it('does not throw when isSystemField is undefined or null', () => {
    expect(() => assertNotSystemField({})).not.toThrow()
    expect(() => assertNotSystemField({ isSystemField: null })).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('assertLeaveRuleNotBelowMinimum (BR-AL-001)', () => {
  it('throws when annual entitlement is below UAE minimum', () => {
    // 1.5 days/month × 12 = 18 < 22
    expect(() =>
      assertLeaveRuleNotBelowMinimum({
        accrualRateDays: 1.5,
        uaeMinimumDaysAnnual: 22,
      }),
    ).toThrow(/BR-AL-001/)
  })

  it('does not throw when annual entitlement equals UAE minimum', () => {
    // 22 / 12 = 1.8333... so 1.8333 × 12 = 21.9996 < 22 — use exact fraction
    expect(() =>
      assertLeaveRuleNotBelowMinimum({
        accrualRateDays: 22 / 12,
        uaeMinimumDaysAnnual: 22,
      }),
    ).not.toThrow()
  })

  it('does not throw when annual entitlement exceeds UAE minimum', () => {
    // 2.5 × 12 = 30 > 22
    expect(() =>
      assertLeaveRuleNotBelowMinimum({
        accrualRateDays: 2.5,
        uaeMinimumDaysAnnual: 22,
      }),
    ).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('assertWorkflowRoleValid', () => {
  it.each([
    'LINE_MANAGER', 'HOD', 'HR_DIRECTOR', 'HR_ADMIN', 'CEO',
  ])('accepts %s', (role) => {
    expect(() => assertWorkflowRoleValid(role)).not.toThrow()
  })

  it('throws for an unknown role', () => {
    expect(() => assertWorkflowRoleValid('CFO')).toThrow(/INVALID_ROLE/)
  })

  it('throws for a typo / casing mismatch', () => {
    expect(() => assertWorkflowRoleValid('hr_admin')).toThrow(/INVALID_ROLE/)
  })

  it('throws on empty string', () => {
    expect(() => assertWorkflowRoleValid('')).toThrow(/INVALID_ROLE/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('assertEscalationRoleHigher', () => {
  it('throws when escalation rank equals step rank', () => {
    expect(() =>
      assertEscalationRoleHigher('HR_ADMIN', 'HR_ADMIN'),
    ).toThrow(/INVALID_ESCALATION/)
  })

  it('throws when escalation rank is below step rank (HR_ADMIN → HOD)', () => {
    expect(() =>
      assertEscalationRoleHigher('HR_ADMIN', 'HOD'),
    ).toThrow(/INVALID_ESCALATION/)
  })

  it('does not throw when escalation rank is strictly higher (LINE_MANAGER → HOD)', () => {
    expect(() =>
      assertEscalationRoleHigher('LINE_MANAGER', 'HOD'),
    ).not.toThrow()
  })

  it('does not throw at the top of the ladder (HR_ADMIN → CEO)', () => {
    expect(() =>
      assertEscalationRoleHigher('HR_ADMIN', 'CEO'),
    ).not.toThrow()
  })

  it('throws when either side is an unknown role', () => {
    expect(() =>
      assertEscalationRoleHigher('CFO', 'CEO'),
    ).toThrow(/INVALID_ROLE/)
    expect(() =>
      assertEscalationRoleHigher('LINE_MANAGER', 'CFO'),
    ).toThrow(/INVALID_ROLE/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('assertPlaceholdersValid', () => {
  it('does not throw when body has no placeholders', async () => {
    queryQueue = [[]]   // template lookup returns nothing — fine, no tokens to validate
    await expect(
      assertPlaceholdersValid('Hello world, welcome.', 'LEAVE_REQUEST'),
    ).resolves.toBeUndefined()
  })

  it('throws when body uses a token not in availableVarsJson', async () => {
    queryQueue = [[
      { vars: ['employeeName', 'leaveType'] },
    ]]
    await expect(
      assertPlaceholdersValid(
        'Hi {{employeeName}}, your {{unknownToken}} is approved.',
        'LEAVE_REQUEST',
      ),
    ).rejects.toThrow(/INVALID_PLACEHOLDER.*unknownToken/)
  })

  it('does not throw when every token is in availableVarsJson', async () => {
    queryQueue = [[
      { vars: ['employeeName', 'leaveType', 'startDate'] },
    ]]
    await expect(
      assertPlaceholdersValid(
        'Hi {{employeeName}}, your {{leaveType}} from {{startDate}} is approved.',
        'LEAVE_REQUEST',
      ),
    ).resolves.toBeUndefined()
  })

  it('handles availableVarsJson stored as an object (keys = allowed tokens)', async () => {
    queryQueue = [[
      { vars: { employeeName: 'string', leaveType: 'string' } },
    ]]
    await expect(
      assertPlaceholdersValid('Hi {{employeeName}}.', 'LEAVE_REQUEST'),
    ).resolves.toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('assertMaxCustomFields (50-field cap)', () => {
  it('throws at exactly 50 active custom fields', async () => {
    queryQueue = [[{ total: 50 }]]
    await expect(
      assertMaxCustomFields('persons', TENANT),
    ).rejects.toThrow(/LIMIT_EXCEEDED/)
  })

  it('throws when above the cap (defensive)', async () => {
    queryQueue = [[{ total: 51 }]]
    await expect(
      assertMaxCustomFields('persons', TENANT),
    ).rejects.toThrow(/LIMIT_EXCEEDED/)
  })

  it('does not throw at 49 active custom fields', async () => {
    queryQueue = [[{ total: 49 }]]
    await expect(
      assertMaxCustomFields('persons', TENANT),
    ).resolves.toBeUndefined()
  })

  it('does not throw on a fresh entity type (count = 0)', async () => {
    queryQueue = [[{ total: 0 }]]
    await expect(
      assertMaxCustomFields('positions', TENANT),
    ).resolves.toBeUndefined()
  })
})
