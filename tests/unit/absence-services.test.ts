import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * S5-02 / S5-07 — Pure-helper unit tests for the absence balance engine.
 * These exercise pure functions in modules/absence/services.ts — but the
 * module imports lib/db transitively, so we stub the DB to avoid the
 * connection check at import time.
 */

// Chainable mock builder used by the comp-leave tests below. Each `from()`
// call records the table reference so the test can assert on read paths.
type DbResult = unknown[]
const mockState: {
  fromQueue:    DbResult[]
  insertReturn: DbResult
  insertCalls:  Array<{ table: unknown; values: unknown }>
  updateCalls:  Array<{ table: unknown; values: unknown }>
} = { fromQueue: [], insertReturn: [], insertCalls: [], updateCalls: [] }

const buildSelect = () => ({
  from:    () => buildSelect(),
  leftJoin: () => buildSelect(),
  where:   () => buildSelect(),
  orderBy: () => buildSelect(),
  limit:   () => Promise.resolve(mockState.fromQueue.shift() ?? []),
})

const buildInsert = (table: unknown) => ({
  values: (vals: unknown) => {
    mockState.insertCalls.push({ table, values: vals })
    return {
      returning: () => Promise.resolve(mockState.insertReturn),
      onConflictDoNothing: () => Promise.resolve(undefined),
    }
  },
})

const buildUpdate = (table: unknown) => ({
  set: (vals: unknown) => {
    mockState.updateCalls.push({ table, values: vals })
    return { where: () => Promise.resolve(undefined) }
  },
})

const mockDb = {
  select:      () => buildSelect(),
  insert:      (table: unknown) => buildInsert(table),
  update:      (table: unknown) => buildUpdate(table),
  transaction: async (fn: (tx: unknown) => Promise<void>) => {
    await fn(mockDb)
  },
  query: {},
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn(), diffFields: () => [] }))

const {
  computeClosingBalance,
  monthsBetween,
  computeMonthlyAccrualDays,
  computeCarryForwardExpiry,
  computeRequestDurationDays,
  rangesOverlap,
  firstOfNextMonth,
  grantCompensatoryLeaveCredit,
  splitLeaveRangeByCalendarYear,
} = await import('@/modules/absence/services')

describe('computeClosingBalance — BR-AL-002 ledger arithmetic', () => {
  it('opening + accrued + carryForward + adjusted - taken - pending - forfeited', () => {
    const closing = computeClosingBalance({
      openingBalanceDays: 5,
      accruedDays:        2.5,
      takenDays:          1,
      pendingDays:        1.5,
      adjustedDays:       0.5,
      carriedForwardDays: 7,
      forfeitedDays:      0,
    })
    // 5 + 2.5 + 7 + 0.5 - 1 - 1.5 - 0 = 12.5
    expect(closing).toBe(12.5)
  })

  it('rounds to 2 decimal places', () => {
    const closing = computeClosingBalance({
      openingBalanceDays: 1 / 3,
      accruedDays: 0,
      takenDays: 0,
      pendingDays: 0,
      adjustedDays: 0,
      carriedForwardDays: 0,
      forfeitedDays: 0,
    })
    expect(closing).toBe(0.33)
  })

  it('pendingDays is subtracted (no double-spend)', () => {
    const a = computeClosingBalance({
      openingBalanceDays: 22, accruedDays: 0, takenDays: 0,
      pendingDays: 5, adjustedDays: 0, carriedForwardDays: 0, forfeitedDays: 0,
    })
    const b = computeClosingBalance({
      openingBalanceDays: 22, accruedDays: 0, takenDays: 5,
      pendingDays: 0, adjustedDays: 0, carriedForwardDays: 0, forfeitedDays: 0,
    })
    expect(a).toBe(b)
  })
})

describe('monthsBetween — BR-AL-002 (calendar month = 30 days)', () => {
  it('30 days = 1 month', () => {
    expect(monthsBetween('2026-01-01', '2026-01-31')).toBe(1)
  })
  it('365 days ≈ 12 months', () => {
    expect(monthsBetween('2026-01-01', '2027-01-01')).toBe(12)
  })
  it('zero days = 0 months', () => {
    expect(monthsBetween('2026-04-01', '2026-04-01')).toBe(0)
  })
  it('flooring: 29 days = 0 months', () => {
    expect(monthsBetween('2026-01-01', '2026-01-29')).toBe(0)
  })
})

describe('computeMonthlyAccrualDays — BR-AL-001', () => {
  const baseRule = { accrualFrequency: 'MONTHLY' as const, isProRated: true, minServiceMonths: 6 }

  it('30 day annual entitlement → 2.5 days/month', () => {
    expect(computeMonthlyAccrualDays(baseRule, 30, 12)).toBe(2.5)
  })

  it('returns 0 below minServiceMonths floor', () => {
    expect(computeMonthlyAccrualDays(baseRule, 30, 3)).toBe(0)
  })

  it('returns 0 for non-monthly frequencies', () => {
    expect(computeMonthlyAccrualDays(
      { accrualFrequency: 'ANNUALLY', isProRated: false, minServiceMonths: 0 },
      30, 12,
    )).toBe(0)
  })
})

describe('computeCarryForwardExpiry — BR-AL-003', () => {
  it('zero months = no expiry', () => {
    expect(computeCarryForwardExpiry('2026-01-01', 0)).toBeNull()
  })
  it('24 months = 2026-01-01 + 24 months = 2028-01-01', () => {
    expect(computeCarryForwardExpiry('2026-01-01', 24)).toBe('2028-01-01')
  })
})

describe('computeRequestDurationDays', () => {
  it('inclusive single-day = 1', () => {
    expect(computeRequestDurationDays('2026-04-01', '2026-04-01', false)).toBe(1)
  })
  it('half-day always = 0.5', () => {
    expect(computeRequestDurationDays('2026-04-01', '2026-04-01', true)).toBe(0.5)
  })
  it('5-day request', () => {
    expect(computeRequestDurationDays('2026-04-01', '2026-04-05', false)).toBe(5)
  })
})

describe('rangesOverlap — BR-SL-003 / overlap guard', () => {
  it('disjoint ranges do not overlap', () => {
    expect(rangesOverlap('2026-01-01', '2026-01-05', '2026-02-01', '2026-02-05')).toBe(false)
  })
  it('contained ranges overlap', () => {
    expect(rangesOverlap('2026-01-01', '2026-01-31', '2026-01-10', '2026-01-15')).toBe(true)
  })
  it('boundary-touching ranges overlap (single shared day)', () => {
    expect(rangesOverlap('2026-01-01', '2026-01-05', '2026-01-05', '2026-01-10')).toBe(true)
  })
  it('reversed-input does not crash (symmetric on inputs that are valid ranges)', () => {
    expect(rangesOverlap('2026-01-10', '2026-01-15', '2026-01-12', '2026-01-13')).toBe(true)
  })
})

describe('firstOfNextMonth', () => {
  it('returns the 1st of the next calendar month', () => {
    expect(firstOfNextMonth('2026-04-15')).toBe('2026-05-01')
  })
  it('handles Dec → Jan', () => {
    expect(firstOfNextMonth('2026-12-31')).toBe('2027-01-01')
  })
})

// GAP-N06 FIX (FIX-S9-05) — compensatory leave credit for public-holiday work.
// BR-PH-003 / Article 26 FDL 33/2021.
describe('grantCompensatoryLeaveCredit — public-holiday compensation', () => {
  const PERSON_ID = '00000000-0000-0000-0000-000000000aaa'
  const ACTOR_ID  = '00000000-0000-0000-0000-000000000bbb'
  const PERSON_ROW = [{
    id: PERSON_ID,
    legalEntityId:       '11111111-1111-1111-1111-111111111111',
    hireDate:            '2024-01-01',
    nationalityCategory: 'EXPAT',
    employmentType:      'FULL_TIME',
  }]
  const HOLIDAY_ROW = [{ holidayCode: 'UAE-2026-ND1', holidayNameEn: 'UAE National Day' }]
  const COMP_TYPE_ROW = [{ id: '80000000-0000-0000-0000-000000000010' }]
  const NEW_BALANCE_ROW = [{ id: '99999999-9999-9999-9999-999999999999' }]

  function resetMock() {
    mockState.fromQueue = []
    mockState.insertReturn = []
    mockState.insertCalls = []
    mockState.updateCalls = []
  }

  it('throws when date is not a confirmed public holiday', async () => {
    resetMock()
    // 1st select = person lookup → person found
    // 2nd select = publicHolidays lookup → empty (not a holiday)
    mockState.fromQueue = [PERSON_ROW, []]
    await expect(
      grantCompensatoryLeaveCredit(PERSON_ID, '2026-04-15', 8, ACTOR_ID),
    ).rejects.toThrow(/not a confirmed public holiday/)
  })

  it('throws when person not found', async () => {
    resetMock()
    mockState.fromQueue = [[]] // empty person lookup
    await expect(
      grantCompensatoryLeaveCredit(PERSON_ID, '2026-12-02', 8, ACTOR_ID),
    ).rejects.toThrow(/person not found/)
  })

  it('throws when COMP absence type is not seeded', async () => {
    resetMock()
    // person → holiday (confirmed) → COMP type missing
    mockState.fromQueue = [PERSON_ROW, HOLIDAY_ROW, []]
    await expect(
      grantCompensatoryLeaveCredit(PERSON_ID, '2026-12-02', 8, ACTOR_ID),
    ).rejects.toThrow(/COMP absence type not seeded/)
  })

  it('grants 1 comp leave day with COMP type + audit row inserts (BR-PH-003)', async () => {
    resetMock()
    // person → holiday → COMP type → existing balance (empty = INSERT path)
    mockState.fromQueue = [PERSON_ROW, HOLIDAY_ROW, COMP_TYPE_ROW, []]
    mockState.insertReturn = NEW_BALANCE_ROW

    const result = await grantCompensatoryLeaveCredit(
      PERSON_ID, '2026-12-02', 8, ACTOR_ID,
    )

    expect(result.daysGranted).toBe(1)
    expect(result.holidayCode).toBe('UAE-2026-ND1')
    expect(result.balanceId).toBe('99999999-9999-9999-9999-999999999999')

    // Verify the inserted balance row has adjustedDays = 1 (BR-PH-003 grant).
    const balanceInsert = mockState.insertCalls[0]
    expect(balanceInsert).toBeDefined()
    const inserted = balanceInsert.values as { adjustedDays: string; balanceYear: number }
    expect(inserted.adjustedDays).toBe('1')
    expect(inserted.balanceYear).toBe(2026)
  })

  it('updates the existing balance row when one is already present for the year', async () => {
    resetMock()
    const EXISTING_BALANCE = [{
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      openingBalanceDays: '0', accruedDays: '0', takenDays: '0',
      pendingDays: '0', adjustedDays: '2', carriedForwardDays: '0', forfeitedDays: '0',
    }]
    // person → holiday → COMP type → existing balance present (UPDATE path)
    mockState.fromQueue = [PERSON_ROW, HOLIDAY_ROW, COMP_TYPE_ROW, EXISTING_BALANCE]

    await grantCompensatoryLeaveCredit(PERSON_ID, '2026-12-02', 8, ACTOR_ID)

    expect(mockState.updateCalls.length).toBeGreaterThanOrEqual(1)
    const updated = mockState.updateCalls[0].values as { adjustedDays: string }
    // 2 (existing) + 1 (granted) = 3
    expect(updated.adjustedDays).toBe('3')
  })
})

// ── C2: cross-year leave split ─────────────────────────────────────────────────

describe('splitLeaveRangeByCalendarYear — C2 cross-year split', () => {
  it('C2-1: same-year leave returns a single portion (unchanged behavior)', () => {
    const out = splitLeaveRangeByCalendarYear('2026-03-01', '2026-03-05', 5)
    expect(out).toEqual([{ year: 2026, days: 5 }])
  })

  it('C2-2: Dec→Jan leave splits into two per-year portions', () => {
    // 2025-12-29..2026-01-02 = 5 inclusive days → Dec 29,30,31 (3) + Jan 1,2 (2)
    const out = splitLeaveRangeByCalendarYear('2025-12-29', '2026-01-02', 5)
    expect(out).toEqual([{ year: 2025, days: 3 }, { year: 2026, days: 2 }])
    expect(out.reduce((s, p) => s + p.days, 0)).toBe(5)
  })

  it('C2-3: leap-year span counts Feb 29 (2024 is a leap year)', () => {
    // 2024-02-27..2024-03-01 inclusive = 27,28,29,1 March → 4 days, single year
    const out = splitLeaveRangeByCalendarYear('2024-02-27', '2024-03-01', 4)
    expect(out).toEqual([{ year: 2024, days: 4 }])
    // a span crossing 2024→2025 keeps the leap day in 2024's portion
    const cross = splitLeaveRangeByCalendarYear('2024-12-30', '2025-01-01', 3)
    expect(cross).toEqual([{ year: 2024, days: 2 }, { year: 2025, days: 1 }])
  })

  it('C2-4: half-day leave returns a single 0.5 portion', () => {
    const out = splitLeaveRangeByCalendarYear('2026-06-10', '2026-06-10', 0.5, true)
    expect(out).toEqual([{ year: 2026, days: 0.5 }])
  })

  it('C2-5: multi-year span (3 calendar years) splits into three portions summing to total', () => {
    // 2025-12-31 .. 2027-01-01 → 2025:1, 2026:365, 2027:1  (2026 not leap)
    const out = splitLeaveRangeByCalendarYear('2025-12-31', '2027-01-01', 367)
    expect(out).toEqual([
      { year: 2025, days: 1 },
      { year: 2026, days: 365 },
      { year: 2027, days: 1 },
    ])
    expect(out.reduce((s, p) => s + p.days, 0)).toBe(367)
  })

  it('C2-6: rejects end before start', () => {
    expect(() => splitLeaveRangeByCalendarYear('2026-02-01', '2026-01-01', 1)).toThrow()
  })
})

// ── C2: all balance-touch sites route through the per-year split (source check) ─

describe('C2 — absence balance writes use the per-year split (source inspection)', () => {
  const src = readFileSync(join(process.cwd(), 'modules/absence/actions.ts'), 'utf8')

  it('C2-7: approve/reject/cancel use applyLeaveBalanceSplitTx', () => {
    const calls = src.match(/applyLeaveBalanceSplitTx\(/g) ?? []
    // helper definition + 3 call sites (approve, reject, cancel)
    expect(calls.length).toBeGreaterThanOrEqual(4)
  })

  it('C2-8: the gate and reserve paths use splitLeaveRangeByCalendarYear', () => {
    const calls = src.match(/splitLeaveRangeByCalendarYear\(/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(2)  // gate + reserve
  })

  it('C2-9: no balance row is keyed by start-year-only (startDate.slice for balanceYear)', () => {
    // The old single-year pattern `balanceYear, Number(row.startDate.slice(0,4))`
    // must be gone — balances are now keyed by the split portion's year.
    expect(src).not.toMatch(/balanceYear,\s*Number\(\s*(?:row|data)\.startDate\.slice\(0,\s*4\)\)/)
  })
})
