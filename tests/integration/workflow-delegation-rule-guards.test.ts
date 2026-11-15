import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PPCDA-01 H5/H7/H8 — guards on createDelegationRule (V2 standing delegation,
 * modules/workflow/actions.ts). This function previously created a standing
 * delegation rule with NO self-delegation check, NO date-order validation, and
 * NO cross-entity guard — so a delegator's approvals (incl. PAYROLL_RUN_APPROVAL)
 * could be routed to themselves, via a dead inverted window, or to a person in a
 * different legal entity. These tests pin the new guards.
 *
 * (Distinct from createApprovalDelegation in modules/config/actions.ts — the V1
 * function, which was already guarded and is covered by workflow-actions.test.ts.)
 *
 * Runs against a mock DB — no live Postgres connection required.
 */

let queryQueue: unknown[][] = []
let callIndex = 0

const auditSpy = vi.fn()

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

function makeInsertChain(returnRows: unknown[]) {
  return {
    values: vi.fn(() => Object.assign(Promise.resolve(returnRows), {
      returning: vi.fn(() => Promise.resolve(returnRows)),
    })),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select: vi.fn(() => makeProxy()),
  transaction: vi.fn(),
}

const session = {
  id:            '00000000-0000-0000-0000-000000000c33',
  name:          'HR Director',
  role:          'HR_DIRECTOR',
  legalEntityId: '00000000-0000-0000-0000-0000000000a1',
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown, tx?: unknown) => { auditSpy(event, tx); return Promise.resolve() }),
  diffFields: () => [],
}))
vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn((roles: string[]) => {
    if (!roles.includes(session.role)) throw new Error(`FORBIDDEN: requires one of ${roles.join(', ')}`)
    return Promise.resolve(session)
  }),
  getCurrentUser: vi.fn(() => Promise.resolve(session)),
}))
// Avoid loading the heavy workflow engine (env deps) — createDelegationRule does
// not call into it, but the module imports it at top level.
vi.mock('@/lib/workflow-engine', () => ({
  previewWorkflow: vi.fn(),
  submitWorkflow:  vi.fn(),
}))
vi.mock('@/drizzle/schema', () => ({
  persons:                { id: {}, tenantId: {}, legalEntityId: {}, isActive: {}, fullNameEn: {} },
}))
vi.mock('@/drizzle/schema/workflow-engine', () => ({
  workflowDelegationRules: { id: {}, tenantId: {}, delegatorId: {}, delegateId: {}, status: {} },
}))
vi.mock('drizzle-orm', () => ({
  eq: () => ({}), and: (...a: unknown[]) => a, count: () => ({}), desc: () => ({}),
  asc: () => ({}), max: () => ({}), sql: () => ({}), inArray: () => ({}),
}))

const { createDelegationRule } = await import('@/modules/workflow/actions')

const ENTITY_A = '00000000-0000-0000-0000-0000000000a1'
const ENTITY_B = '00000000-0000-0000-0000-0000000000b2'
const DELEGATOR = '11111111-1111-1111-1111-111111111111'
const DELEGATE  = '22222222-2222-2222-2222-222222222222'

const validInput = (overrides: Record<string, unknown> = {}) => ({
  delegatorId:    DELEGATOR,
  delegateId:     DELEGATE,
  delegationFrom: '2026-07-01',
  delegationTo:   '2026-07-31',
  ...overrides,
})

beforeEach(() => {
  queryQueue = []
  callIndex = 0
  vi.clearAllMocks()
  auditSpy.mockClear()
  session.role = 'HR_DIRECTOR'
  mockDb.select.mockImplementation(() => makeProxy())
})

describe('createDelegationRule — PPCDA-01 H5/H7/H8 guards', () => {
  it('H5: blocks self-delegation (delegator === delegate)', async () => {
    const result = await createDelegationRule(validInput({ delegateId: DELEGATOR }))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/SELF_DELEGATION/i)
  })

  it('H7: blocks an inverted date window (from > to)', async () => {
    const result = await createDelegationRule(validInput({ delegationFrom: '2026-08-01', delegationTo: '2026-07-01' }))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/INVALID_DATE_RANGE/i)
  })

  it('H8: blocks delegation across legal entities (delegate in a different entity)', async () => {
    // party lookup → delegator in entity A, delegate in entity B
    queryQueue = [[
      { id: DELEGATOR, legalEntityId: ENTITY_A, isActive: true },
      { id: DELEGATE,  legalEntityId: ENTITY_B, isActive: true },
    ]]
    const result = await createDelegationRule(validInput())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/across legal entities/i)
  })

  it('H8: blocks delegation to an inactive delegate', async () => {
    queryQueue = [[
      { id: DELEGATOR, legalEntityId: ENTITY_A, isActive: true },
      { id: DELEGATE,  legalEntityId: ENTITY_A, isActive: false },
    ]]
    const result = await createDelegationRule(validInput())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not an active person/i)
  })

  it('happy path: same-entity active delegate, valid window → success + audit', async () => {
    queryQueue = [
      // 1) party lookup — both active, same entity
      [
        { id: DELEGATOR, legalEntityId: ENTITY_A, isActive: true },
        { id: DELEGATE,  legalEntityId: ENTITY_A, isActive: true },
      ],
      // 2) circular-chain check — no existing reverse rule
      [],
    ]
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({ insert: vi.fn(() => makeInsertChain([{ id: 'deleg-rule-1' }])) }),
    )

    const result = await createDelegationRule(validInput())
    expect(result.success).toBe(true)
    expect(result.id).toBe('deleg-rule-1')
    expect(auditSpy).toHaveBeenCalledOnce()
    const event = auditSpy.mock.calls[0][0] as { eventType: string }
    expect(event.eventType).toBe('WORKFLOW.DELEGATION.CREATED')
  })

  it('SUPER_ADMIN bypasses the cross-entity guard', async () => {
    session.role = 'SUPER_ADMIN'
    queryQueue = [
      // party lookup — different entities, but SUPER_ADMIN is exempt
      [
        { id: DELEGATOR, legalEntityId: ENTITY_A, isActive: true },
        { id: DELEGATE,  legalEntityId: ENTITY_B, isActive: true },
      ],
      [], // circular-chain check
    ]
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({ insert: vi.fn(() => makeInsertChain([{ id: 'deleg-rule-2' }])) }),
    )

    const result = await createDelegationRule(validInput())
    expect(result.success).toBe(true)
    expect(result.id).toBe('deleg-rule-2')
  })

  // ── B2: transitive circular-delegation guard ────────────────────────────────
  const PERSON_C = '33333333-3333-3333-3333-333333333333'

  it('B2: blocks a direct cycle — delegate already delegates back to delegator', async () => {
    queryQueue = [
      // party lookup — both active, same entity
      [
        { id: DELEGATOR, legalEntityId: ENTITY_A, isActive: true },
        { id: DELEGATE,  legalEntityId: ENTITY_A, isActive: true },
      ],
      // active rules: DELEGATE → DELEGATOR already exists (B→A)
      [{ delegatorId: DELEGATE, delegateId: DELEGATOR }],
    ]
    const result = await createDelegationRule(validInput())  // A→B would close A→B→A
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/CIRCULAR_CHAIN/i)
  })

  it('B2: blocks a multi-hop cycle A→B→C→A (the gap the depth-1 check missed)', async () => {
    queryQueue = [
      [
        { id: DELEGATOR, legalEntityId: ENTITY_A, isActive: true },
        { id: DELEGATE,  legalEntityId: ENTITY_A, isActive: true },
      ],
      // active rules: B→C and C→A; adding A→B closes the loop
      [
        { delegatorId: DELEGATE,  delegateId: PERSON_C },
        { delegatorId: PERSON_C,  delegateId: DELEGATOR },
      ],
    ]
    const result = await createDelegationRule(validInput())
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/CIRCULAR_CHAIN/i)
  })

  it('B2: allows a non-cyclic chain (B→C exists, but no path back to A)', async () => {
    queryQueue = [
      [
        { id: DELEGATOR, legalEntityId: ENTITY_A, isActive: true },
        { id: DELEGATE,  legalEntityId: ENTITY_A, isActive: true },
      ],
      // active rules: only B→C (no edge returns to A) → adding A→B is safe
      [{ delegatorId: DELEGATE, delegateId: PERSON_C }],
    ]
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({ insert: vi.fn(() => makeInsertChain([{ id: 'deleg-rule-3' }])) }),
    )
    const result = await createDelegationRule(validInput())
    expect(result.success).toBe(true)
    expect(result.id).toBe('deleg-rule-3')
  })
})
