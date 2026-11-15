import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * S5-Q13 — Integration tests for the DB-aware absence balance engine
 * (`accrueMonthlyBalance`, `enforceCarryForwardExpiry`).
 *
 * Mirrors the proxy-based DB mock pattern from
 * tests/integration/absence-actions.test.ts. The pure helpers
 * (computeClosingBalance, etc.) are covered by tests/unit/absence-services.test.ts;
 * this file targets the tx + audit + idempotency contract.
 */

let queryQueue: unknown[][] = []
let callIndex   = 0

const insertSpy    = vi.fn()
const valuesSpy    = vi.fn()
const returningSpy = vi.fn()
const setSpy       = vi.fn()
const whereSpy     = vi.fn()
const auditSpy     = vi.fn()

function makeProxy(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_, prop: string) {
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
    values: vi.fn((payload: unknown) => {
      valuesSpy(payload)
      return {
        returning: vi.fn((spec: unknown) => {
          returningSpy(spec)
          return Promise.resolve(returnRows)
        }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(returnRows).then(resolve),
      }
    }),
  }
}
function makeUpdateChain() {
  return {
    set: vi.fn((payload: unknown) => {
      setSpy(payload)
      return { where: vi.fn((cond: unknown) => { whereSpy(cond); return Promise.resolve() }) }
    }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select:      vi.fn(() => makeProxy()),
  insert:      vi.fn(() => makeInsertChain([])),
  update:      vi.fn(() => makeUpdateChain()),
  transaction: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown) => { auditSpy(event); return Promise.resolve() }),
  diffFields: () => [],
}))
vi.mock('@/drizzle/schema', () => ({
  absenceBalances:  { id: {}, tenantId: {}, personId: {}, absenceTypeId: {}, balanceYear: {}, carriedForwardDays: {} },
  absenceTypes:     { id: {}, tenantId: {}, typeCode: {} },
  persons:          { id: {}, tenantId: {} },
  legalEntities:    { id: {} },
  leaveRuleSets:    { id: {}, tenantId: {}, isActive: {}, effectiveFrom: {}, effectiveTo: {} },
  leaveRuleLines:   { id: {}, leaveRuleSetId: {}, absenceTypeCode: {}, isActive: {} },
}))
vi.mock('drizzle-orm', () => ({
  eq:     () => ({}),
  and:    (...a: unknown[]) => a,
  or:     (...a: unknown[]) => a,
  isNull: () => ({}),
  lte:    () => ({}),
  gte:    () => ({}),
  desc:   () => ({}),
  count:  () => ({}),
  sql:    Object.assign(() => ({}), { raw: () => ({}) }),
}))

const { accrueMonthlyBalance, enforceCarryForwardExpiry } =
  await import('@/modules/absence/services')

const PERSON_1 = '00000000-0000-0000-0000-000000000001'
const TYPE_ANN = '00000000-0000-0000-0000-0000000000aa'
const ENTITY_A = '00000000-0000-0000-0000-0000000000a1'

const personRow = {
  id: PERSON_1, legalEntityId: ENTITY_A, hireDate: '2024-01-01',
  nationalityCategory: 'EXPAT', employmentType: 'FULL_TIME',
}

const annualTypeRow = {
  id: TYPE_ANN, typeCode: 'ANNUAL', typeNameEn: 'Annual', typeNameAr: 'سنوي',
}

beforeEach(() => {
  queryQueue = []
  callIndex  = 0
  vi.clearAllMocks()
  insertSpy.mockClear(); valuesSpy.mockClear(); returningSpy.mockClear()
  setSpy.mockClear(); whereSpy.mockClear(); auditSpy.mockClear()
  mockDb.select.mockImplementation(() => makeProxy())
  mockDb.insert.mockImplementation(() => makeInsertChain([]))
  mockDb.update.mockImplementation(() => makeUpdateChain())
})

// ─────────────────────────────────────────────────────────────────────────
// accrueMonthlyBalance
// ─────────────────────────────────────────────────────────────────────────

describe('accrueMonthlyBalance — DB contract (S5-Q13)', () => {
  it('returns skipped=true when person not found', async () => {
    queryQueue = [[]]            // persons read → empty
    const r = await accrueMonthlyBalance(PERSON_1, TYPE_ANN, '2026-04-15')
    expect(r.skipped).toBe(true)
    expect(r.skipReason).toBe('person not found')
  })

  it('returns skipped=true when absence type not found', async () => {
    queryQueue = [[personRow], []]  // persons row, then absenceTypes empty
    const r = await accrueMonthlyBalance(PERSON_1, TYPE_ANN, '2026-04-15')
    expect(r.skipped).toBe(true)
    expect(r.skipReason).toBe('absence type not found')
  })

  it('returns skipped=true when service months below tier minimum', async () => {
    // Hire date 2026-04-01 → 0 service months at 2026-04-15.
    queryQueue = [
      [{ ...personRow, hireDate: '2026-04-01' }],
      [annualTypeRow],
      // resolveLeaveRuleSet: persons+legalEntities lookup
      [{ legalEntityId: ENTITY_A, entityType: 'MAINLAND', nationalityCategory: 'EXPAT', employmentType: 'FULL_TIME' }],
      // resolveLeaveRuleSet: leaveRuleSets list (empty → falls to DEFAULT_LINES)
      [],
    ]
    const r = await accrueMonthlyBalance(PERSON_1, TYPE_ANN, '2026-04-15')
    expect(r.skipped).toBe(true)
    expect(r.skipReason).toBe('serviceMonths below tier minimum')
  })

  it('first-month INSERT path: writes balance row + audit (Hard Rule 1)', async () => {
    // Pre-tx reads: persons, absenceTypes, resolveLeaveRuleSet (persons+legalEntities lookup), leaveRuleSets list
    queryQueue = [
      [personRow],
      [annualTypeRow],
      [{ legalEntityId: ENTITY_A, entityType: 'MAINLAND', nationalityCategory: 'EXPAT', employmentType: 'FULL_TIME' }],
      [],
    ]

    // Inside-tx reads: existing balance row (S5-Q6 — read inside tx). Empty → INSERT path.
    const txQueues: unknown[][] = [[]]
    let txIdx = 0
    function makeTxProxy(): unknown {
      return new Proxy({} as Record<string, unknown>, {
        get(_, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: unknown[]) => unknown) =>
              Promise.resolve(txQueues[txIdx++] ?? []).then(resolve)
          }
          return () => makeTxProxy()
        },
      })
    }
    const tx = {
      select: vi.fn(() => makeTxProxy()),
      insert: vi.fn(() => { insertSpy({}); return makeInsertChain([{ id: 'bal-new' }]) }),
      update: vi.fn(() => makeUpdateChain()),
    }
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await accrueMonthlyBalance(PERSON_1, TYPE_ANN, '2026-04-15')

    expect(r.skipped).toBe(false)
    expect(r.daysAccrued).toBeGreaterThan(0)
    // INSERT path used; valuesSpy got the row payload.
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({
      personId: PERSON_1,
      absenceTypeId: TYPE_ANN,
      balanceYear: 2026,
    }))
    // Audit row emitted inside the same tx (S5-Q6 + Hard Rule 1).
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType:   'ABSENCE_BALANCE.ACCRUED',
      actorRole:   'SUPER_ADMIN',
      channel:     'SYSTEM',
      resourceType: 'absence_balances',
    }))
  })

  it('subsequent-month UPDATE path: increments accrued + writes audit', async () => {
    queryQueue = [
      [personRow],
      [annualTypeRow],
      [{ legalEntityId: ENTITY_A, entityType: 'MAINLAND', nationalityCategory: 'EXPAT', employmentType: 'FULL_TIME' }],
      [],
    ]

    // Existing balance for 2026 with last_accrual_date = 2026-03-01.
    const existingBalance = {
      id: 'bal-1',
      openingBalanceDays: '0', accruedDays: '5', takenDays: '0',
      pendingDays: '0', adjustedDays: '0', carriedForwardDays: '0', forfeitedDays: '0',
      lastAccrualDate: '2026-03-01', balanceYear: 2026,
    }
    const txQueues: unknown[][] = [[existingBalance]]
    let txIdx = 0
    function makeTxProxy(): unknown {
      return new Proxy({} as Record<string, unknown>, {
        get(_, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: unknown[]) => unknown) =>
              Promise.resolve(txQueues[txIdx++] ?? []).then(resolve)
          }
          return () => makeTxProxy()
        },
      })
    }
    const tx = {
      select: vi.fn(() => makeTxProxy()),
      insert: vi.fn(() => makeInsertChain([])),
      update: vi.fn(() => makeUpdateChain()),
    }
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await accrueMonthlyBalance(PERSON_1, TYPE_ANN, '2026-04-15')

    expect(r.skipped).toBe(false)
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
      lastAccrualDate: '2026-04-01',
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'ABSENCE_BALANCE.ACCRUED',
      resourceId: 'bal-1',
    }))
  })

  it('idempotency: same-month re-trigger is a no-op (no audit row)', async () => {
    queryQueue = [
      [personRow],
      [annualTypeRow],
      [{ legalEntityId: ENTITY_A, entityType: 'MAINLAND', nationalityCategory: 'EXPAT', employmentType: 'FULL_TIME' }],
      [],
    ]

    // Existing balance with last_accrual_date already at 2026-04-01 (= the accrual month).
    const existingBalance = {
      id: 'bal-1', openingBalanceDays: '0', accruedDays: '7.5',
      takenDays: '0', pendingDays: '0', adjustedDays: '0',
      carriedForwardDays: '0', forfeitedDays: '0',
      lastAccrualDate: '2026-04-01', balanceYear: 2026,
    }
    const txQueues: unknown[][] = [[existingBalance]]
    let txIdx = 0
    function makeTxProxy(): unknown {
      return new Proxy({} as Record<string, unknown>, {
        get(_, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: unknown[]) => unknown) =>
              Promise.resolve(txQueues[txIdx++] ?? []).then(resolve)
          }
          return () => makeTxProxy()
        },
      })
    }
    const tx = {
      select: vi.fn(() => makeTxProxy()),
      insert: vi.fn(() => makeInsertChain([])),
      update: vi.fn(() => makeUpdateChain()),
    }
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await accrueMonthlyBalance(PERSON_1, TYPE_ANN, '2026-04-15')

    expect(r.skipped).toBe(true)
    expect(r.skipReason).toBe('already accrued for this month')
    expect(r.newAccruedDays).toBe(7.5)
    // No audit row emitted (the audit lives behind the existing-row branch).
    expect(auditSpy).not.toHaveBeenCalled()
    // No UPDATE call (the early return short-circuits before the write).
    expect(setSpy).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// enforceCarryForwardExpiry
// ─────────────────────────────────────────────────────────────────────────

describe('enforceCarryForwardExpiry — BR-AL-003 (S5-Q13)', () => {
  it('returns [] when person not found', async () => {
    queryQueue = [[]]
    const r = await enforceCarryForwardExpiry(PERSON_1, '2026-04-15')
    expect(r).toEqual([])
  })

  it('forfeits expired carry-forward and writes audit', async () => {
    // Window for 2024 balance: yearStart 2024-01-01 + 24mo = 2026-01-01 → expired by 2026-04-15.
    const expiredBalance = {
      bal: {
        id: 'bal-2024',
        openingBalanceDays: '0', accruedDays: '30',
        takenDays: '20', pendingDays: '0', adjustedDays: '0',
        carriedForwardDays: '10', forfeitedDays: '0',
        absenceTypeId: TYPE_ANN, balanceYear: 2024,
      },
      type: { typeCode: 'ANNUAL' },
    }

    queryQueue = [
      [personRow],
      [expiredBalance],
      // resolveLeaveRuleSet: persons+legalEntities lookup → falls to DEFAULT_LINES (24mo expiry)
      [{ legalEntityId: ENTITY_A, entityType: 'MAINLAND', nationalityCategory: 'EXPAT', employmentType: 'FULL_TIME' }],
      // leaveRuleSets list → empty
      [],
    ]
    const tx = { select: vi.fn(() => makeProxy()), insert: vi.fn(() => makeInsertChain([])), update: vi.fn(() => makeUpdateChain()) }
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await enforceCarryForwardExpiry(PERSON_1, '2026-04-15')

    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      balanceId:             'bal-2024',
      personId:              PERSON_1,
      absenceTypeId:         TYPE_ANN,
      expiredDays:           10,
      newCarriedForwardDays: 0,
    })
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
      carriedForwardDays: '0',
      forfeitedDays:      '10',
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType:    'ABSENCE_BALANCE.CARRY_FORWARD_EXPIRED',
      resourceId:   'bal-2024',
    }))
  })

  it('skips rows whose expiry window is still open', async () => {
    // 2025 balance: yearStart 2025-01-01 + 24mo = 2027-01-01 → window still open at 2026-04-15.
    const openBalance = {
      bal: {
        id: 'bal-2025',
        openingBalanceDays: '0', accruedDays: '30',
        takenDays: '0', pendingDays: '0', adjustedDays: '0',
        carriedForwardDays: '10', forfeitedDays: '0',
        absenceTypeId: TYPE_ANN, balanceYear: 2025,
      },
      type: { typeCode: 'ANNUAL' },
    }
    queryQueue = [
      [personRow],
      [openBalance],
      [{ legalEntityId: ENTITY_A, entityType: 'MAINLAND', nationalityCategory: 'EXPAT', employmentType: 'FULL_TIME' }],
      [],
    ]
    const r = await enforceCarryForwardExpiry(PERSON_1, '2026-04-15')
    expect(r).toEqual([])
    expect(setSpy).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })
})
