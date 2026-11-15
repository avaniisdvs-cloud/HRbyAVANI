import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * COV-01 — Integration tests for `updateComplianceRule`.
 *
 * Pinning the riskiest invariants:
 *   • RBAC gate — SUPER_ADMIN only; all other roles rejected (Hard Rule 8)
 *   • GOVERNANCE_LOCK — isOverridable=false rows are immutable via the UI
 *   • NOT_FOUND — nonexistent ruleId throws descriptive error
 *   • changeReason mandatory — min 10 chars enforced by Zod
 *   • Hard Rule 1 — audit row written inside the same tx as the update
 *   • Partial update — only supplied fields are patched
 */

// ── Shared queue + spies ───────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex = 0

const insertSpy = vi.fn()
const valuesSpy = vi.fn()
const updateSpy = vi.fn()
const setSpy    = vi.fn()
const auditSpy  = vi.fn()

function makeProxy(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_: Record<string, unknown>, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(queryQueue[callIndex++] ?? []).then(resolve, reject)
      }
      return () => makeProxy()
    },
  })
}

function makeUpdateChain() {
  return {
    set: vi.fn((payload: unknown) => {
      setSpy(payload)
      return { where: vi.fn(() => Promise.resolve()) }
    }),
  }
}

function makeInsertChain() {
  return {
    values: vi.fn((payload: unknown) => {
      valuesSpy(payload)
      return { returning: vi.fn(() => Promise.resolve([{ id: 'new-id' }])) }
    }),
  }
}

function buildTx() {
  return {
    select: vi.fn(() => makeProxy()),
    update: vi.fn(() => { updateSpy('called'); return makeUpdateChain() }),
    insert: vi.fn(() => { insertSpy('called'); return makeInsertChain() }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select:      vi.fn(() => makeProxy()),
  update:      vi.fn(() => makeUpdateChain()),
  insert:      vi.fn(() => makeInsertChain()),
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(buildTx())),
}

const session = {
  user: {
    id:            '00000000-0000-0000-0000-000000000001',
    name:          'Super Admin',
    role:          'SUPER_ADMIN',
    legalEntityId: '11111111-1111-1111-1111-111111111111',
  },
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown, tx?: unknown) => { auditSpy(event, tx); return Promise.resolve() }),
  diffFields: () => [],
}))
vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(async (roles: string[]) => {
    if (!roles.includes(session.user.role)) {
      throw new Error(`FORBIDDEN: requires one of [${roles.join(', ')}], got ${session.user.role}`)
    }
    return session.user
  }),
}))
vi.mock('@/drizzle/schema', () => ({
  complianceRules: {
    id: {}, tenantId: {}, ruleId: {}, legalEntityId: {},
    descriptionEn: {}, descriptionAr: {}, formula: {}, isActive: {},
    isOverridable: {}, sunsetDate: {}, notes: {},
  },
}))
vi.mock('@/lib/constants', () => ({ TENANT_ID: 'tenant-1' }))
vi.mock('drizzle-orm', () => ({
  and:    (...a: unknown[]) => a,
  eq:     () => ({}),
}))

const { updateComplianceRule } = await import('@/modules/compliance/actions')

const RULE_ID = '00000000-0000-0000-0000-000000000099'

const validInput = {
  ruleId:        RULE_ID,
  changeReason:  'Updated per law amendment 2026',
  descriptionEn: 'New description text',
  isActive:      true,
}

const overridableRow = {
  id:            RULE_ID,
  ruleId:        'BR-AL-001',
  legalEntityId: '11111111-1111-1111-1111-111111111111',
  descriptionEn: 'Old description',
  formula:       {},
  isActive:      true,
  sunsetDate:    null,
  notes:         null,
  isOverridable: true,
}

beforeEach(() => {
  queryQueue = []
  callIndex  = 0
  vi.clearAllMocks()
  session.user.role = 'SUPER_ADMIN'
})

// ── RBAC gate ──────────────────────────────────────────────────────────────

describe('updateComplianceRule — RBAC (Hard Rule 8)', () => {
  it.each(['HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE', 'FINANCE'])(
    'rejects %s with FORBIDDEN',
    async (role) => {
      session.user.role = role
      await expect(updateComplianceRule(validInput)).rejects.toThrow(/do not have permission|You can only/i)
      expect(updateSpy).not.toHaveBeenCalled()
      expect(auditSpy).not.toHaveBeenCalled()
    },
  )

  it('allows SUPER_ADMIN', async () => {
    session.user.role = 'SUPER_ADMIN'
    queryQueue = [[overridableRow]]
    const result = await updateComplianceRule(validInput)
    expect(result.id).toBe(RULE_ID)
  })
})

// ── Validation ─────────────────────────────────────────────────────────────

describe('updateComplianceRule — Zod validation', () => {
  it('rejects changeReason shorter than 10 characters', async () => {
    await expect(updateComplianceRule({ ...validInput, changeReason: 'too short' }))
      .rejects.toThrow()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects ruleId that is not a UUID', async () => {
    await expect(updateComplianceRule({ ...validInput, ruleId: 'not-a-uuid' }))
      .rejects.toThrow()
  })
})

// ── NOT_FOUND ──────────────────────────────────────────────────────────────

describe('updateComplianceRule — NOT_FOUND', () => {
  it('throws when the rule does not exist in the database', async () => {
    queryQueue = [[]] // empty SELECT result
    await expect(updateComplianceRule(validInput)).rejects.toThrow(/could not be found/i)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })
})

// ── GOVERNANCE_LOCK ────────────────────────────────────────────────────────

describe('updateComplianceRule — governance lock', () => {
  it('throws GOVERNANCE_LOCK for non-overridable rules (law-tied constants)', async () => {
    queryQueue = [[{ ...overridableRow, isOverridable: false, ruleId: 'BR-AL-001' }]]
    await expect(updateComplianceRule(validInput)).rejects.toThrow(/locked and cannot be modified/i)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })
})

// ── Happy path ─────────────────────────────────────────────────────────────

describe('updateComplianceRule — happy path', () => {
  it('updates the rule and writes COMPLIANCE_RULE.UPDATED audit inside the tx', async () => {
    queryQueue = [[overridableRow]]
    const result = await updateComplianceRule(validInput)

    expect(result.id).toBe(RULE_ID)
    expect(updateSpy).toHaveBeenCalled()

    const patch = setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(patch.descriptionEn).toBe('New description text')
    expect(patch.isActive).toBe(true)
    expect(patch.updatedBy).toBe(session.user.id)

    // Hard Rule 1: audit written inside tx (second arg is tx object)
    expect(auditSpy).toHaveBeenCalledOnce()
    const [event, tx] = auditSpy.mock.calls[0]
    expect((event as { eventType: string }).eventType).toBe('COMPLIANCE_RULE.UPDATED')
    expect((event as { resourceType: string }).resourceType).toBe('compliance_rules')
    expect((event as { resourceId: string }).resourceId).toBe(RULE_ID)
    expect((event as { channel: string }).channel).toBe('WEB')
    expect((event as { metadata: { changeReason: string } }).metadata.changeReason)
      .toBe('Updated per law amendment 2026')
    expect(tx).toBeDefined()
  })

  it('only patches fields explicitly provided (partial update)', async () => {
    queryQueue = [[overridableRow]]
    await updateComplianceRule({
      ruleId:       RULE_ID,
      changeReason: 'Activating rule per Q2 review',
      isActive:     false,
    })
    const patch = setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(patch.isActive).toBe(false)
    // descriptionEn was not in input — should not appear in patch
    expect(patch.descriptionEn).toBeUndefined()
  })

  it('accepts sunsetDate as null (explicit null clears the field)', async () => {
    queryQueue = [[{ ...overridableRow, sunsetDate: '2030-12-31' }]]
    await updateComplianceRule({
      ruleId:       RULE_ID,
      changeReason: 'Removing sunset date after law clarification',
      sunsetDate:   null,
    })
    const patch = setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(patch.sunsetDate).toBeNull()
  })
})
