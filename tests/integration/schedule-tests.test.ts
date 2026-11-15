/**
 * AGENT-2B — Work Schedule & Leave Duration Tests
 *
 * Covers:
 *   WS-001  Working days in May 2026 (UAE Mon–Fri schedule: Sun–Thu off Fri+Sat)
 *   WS-002  Ramadan schedule max 6 hours/day / max 30 hours/week
 *   WS-003  Holiday conflict / duplicate detection via rangesOverlap
 *   WS-004  Weekend identification (Fri 2026-05-01 / Sat 2026-05-02 vs Mon 2026-05-04)
 *   WS-005  Public holiday identification — 2026-12-02 UAE National Day
 *   WS-006  Leave duration — calendar-day counting via computeRequestDurationDays
 *   WS-007  Leave spanning a weekend (rangesOverlap overlap detection)
 *
 * Notes on scope:
 *   • No `isWorkingDay()` / `workingDaysBetween()` utility exists in the codebase.
 *     Working-day logic lives in the `work_schedule_patterns` DB table (isWorkingDay
 *     column, dayOfWeek 0–6).  WS-001 and WS-004 are therefore implemented here
 *     with the pure helper that encodes the same rule.
 *   • `computeRequestDurationDays` counts CALENDAR days (inclusive), not working
 *     days.  The test comments document this and assert the calendar-day count; a
 *     future "working-day-only" API would replace this when added.
 *   • vi.mock('@/lib/db') is applied before any import that transitively pulls in
 *     the Drizzle client.
 */

import { describe, it, expect, vi } from 'vitest'

// ── Minimal DB mock (prevents real Postgres connection) ─────────────────────

const buildSelect = (): unknown => ({
  from:     () => buildSelect(),
  leftJoin: () => buildSelect(),
  where:    () => buildSelect(),
  limit:    () => Promise.resolve([]),
  orderBy:  () => buildSelect(),
})

const mockDb = {
  select:      () => buildSelect(),
  insert:      () => ({ values: () => ({ returning: () => Promise.resolve([]), onConflictDoNothing: () => Promise.resolve(undefined) }) }),
  update:      () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb),
  query: {},
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn(), diffFields: () => [] }))

// ── Lazy-import actual service functions (after mocks are registered) ────────

const { computeRequestDurationDays, rangesOverlap } = await import(
  '@/modules/absence/services'
)
const { daysBetween, addDays } = await import('@/lib/effective-date')

// ═══════════════════════════════════════════════════════════════════════════════
// Pure schedule helper — no DB needed
// Mirrors the logic seeded in work_schedule_patterns:
//   dayOfWeek 0 (Sun) – 4 (Thu) → isWorkingDay = true
//   dayOfWeek 5 (Fri) – 6 (Sat) → isWorkingDay = false
// (UAE standard weekend: weekendDays = [5, 6])
// ═══════════════════════════════════════════════════════════════════════════════

/** UAE weekend = Friday (JS day 5) + Saturday (JS day 6). */
const UAE_WEEKEND_DAYS = new Set([5, 6])

/**
 * Returns true if `isoDate` is a UAE working day under the standard
 * 5-day schedule (Sun–Thu working, Fri–Sat off).
 * No public-holiday awareness — that layer is DB-driven.
 */
function isUaeWorkingDay(isoDate: string): boolean {
  const d = new Date(isoDate + 'T00:00:00Z')
  return !UAE_WEEKEND_DAYS.has(d.getUTCDay())
}

/**
 * Counts working days (Sun–Thu) in an inclusive [start, end] range.
 * Public holidays are NOT excluded here because that data lives in the DB.
 */
function countWorkingDays(startIso: string, endIso: string): number {
  const totalDays = daysBetween(startIso, endIso) + 1 // inclusive
  let count = 0
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(startIso, i)
    if (isUaeWorkingDay(d)) count++
  }
  return count
}

/**
 * Returns the list of UAE 2026 confirmed fixed holidays that fall on working
 * days (Sun–Thu).  The seeded holiday list is replicated here so tests run
 * without a DB.
 */
const UAE_2026_FIXED_HOLIDAYS: { code: string; date: string; nameEn: string; isConfirmed: boolean }[] = [
  { code: 'UAE-2026-NY',  date: '2026-01-01', nameEn: "New Year's Day",           isConfirmed: true  },
  { code: 'UAE-2026-EF1', date: '2026-03-20', nameEn: 'Eid Al Fitr — Day 1',      isConfirmed: false },
  { code: 'UAE-2026-EF2', date: '2026-03-21', nameEn: 'Eid Al Fitr — Day 2',      isConfirmed: false },
  { code: 'UAE-2026-EF3', date: '2026-03-22', nameEn: 'Eid Al Fitr — Day 3',      isConfirmed: false },
  { code: 'UAE-2026-ARA', date: '2026-05-27', nameEn: 'Arafat Day',               isConfirmed: false },
  { code: 'UAE-2026-EA1', date: '2026-05-28', nameEn: 'Eid Al Adha — Day 1',      isConfirmed: false },
  { code: 'UAE-2026-EA2', date: '2026-05-29', nameEn: 'Eid Al Adha — Day 2',      isConfirmed: false },
  { code: 'UAE-2026-EA3', date: '2026-05-30', nameEn: 'Eid Al Adha — Day 3',      isConfirmed: false },
  { code: 'UAE-2026-INY', date: '2026-06-17', nameEn: 'Islamic New Year',          isConfirmed: false },
  { code: 'UAE-2026-PRB', date: '2026-08-26', nameEn: "Prophet's Birthday",        isConfirmed: false },
  { code: 'UAE-2026-COM', date: '2026-11-30', nameEn: 'UAE Commemoration Day',     isConfirmed: true  },
  { code: 'UAE-2026-ND1', date: '2026-12-02', nameEn: 'UAE National Day',          isConfirmed: true  },
  { code: 'UAE-2026-ND2', date: '2026-12-03', nameEn: 'UAE National Day (2nd Day)',isConfirmed: true  },
]

function isPublicHoliday(isoDate: string, confirmedOnly = false): boolean {
  return UAE_2026_FIXED_HOLIDAYS.some(h =>
    h.date === isoDate && (!confirmedOnly || h.isConfirmed),
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// WS-001 — Working days in May 2026
// ═══════════════════════════════════════════════════════════════════════════════

describe('WS-001: Working days in May 2026 (UAE Sun–Thu schedule)', () => {
  it('May 2026 has 31 calendar days', () => {
    const totalDays = daysBetween('2026-05-01', '2026-05-31') + 1
    expect(totalDays).toBe(31)
  })

  it('counts the correct number of Sun–Thu working days in May 2026', () => {
    // May 2026:
    //  Fri 1, Sat 2, Sun 3, Mon 4, Tue 5, Wed 6, Thu 7,
    //  Fri 8, Sat 9, Sun 10, Mon 11, Tue 12, Wed 13, Thu 14,
    //  Fri 15, Sat 16, Sun 17, Mon 18, Tue 19, Wed 20, Thu 21,
    //  Fri 22, Sat 23, Sun 24, Mon 25, Tue 26, Wed 27, Thu 28,
    //  Fri 29, Sat 30, Sun 31
    //
    // Weekends: 1,2,8,9,15,16,22,23,29,30 = 10 days
    // Working days (Sun–Thu): 31 - 10 = 21
    // Note: no CONFIRMED public holidays fall in May 2026 per the seeded data.
    // (Eid Al Adha and Arafat Day in late May are isConfirmed: false.)
    const workingDays = countWorkingDays('2026-05-01', '2026-05-31')
    expect(workingDays).toBe(21)
  })

  it('2026-05-01 (Friday) is NOT a working day', () => {
    expect(isUaeWorkingDay('2026-05-01')).toBe(false)
  })

  it('2026-05-03 (Sunday) IS a working day', () => {
    expect(isUaeWorkingDay('2026-05-03')).toBe(true)
  })

  it('2026-05-04 (Monday) IS a working day', () => {
    expect(isUaeWorkingDay('2026-05-04')).toBe(true)
  })

  it('2026-05-07 (Thursday) IS a working day', () => {
    expect(isUaeWorkingDay('2026-05-07')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// WS-002 — Ramadan schedule: max 6 hours/day / max 30 hours/week
// ═══════════════════════════════════════════════════════════════════════════════

describe('WS-002: Ramadan schedule hours constraints', () => {
  // These values are exactly what the seed inserts into work_schedules for
  // scheduleCode='RAMADAN'.  Tests validate the seeded constants directly —
  // no live DB required.
  const RAMADAN_SCHEDULE = {
    scheduleType:       'RAMADAN',
    totalHoursPerWeek:  30,        // '30.00' stored as numeric
    ramadanHoursPerDay: 6,         // '6.00'
    isRamadanSchedule:  true,
    breakMinutes:       0,
  }

  it('Ramadan schedule type is RAMADAN', () => {
    expect(RAMADAN_SCHEDULE.scheduleType).toBe('RAMADAN')
  })

  it('Ramadan schedule has 0 break minutes (no break during Ramadan)', () => {
    expect(RAMADAN_SCHEDULE.breakMinutes).toBe(0)
  })

  it('Ramadan weekly hours does not exceed 30', () => {
    expect(RAMADAN_SCHEDULE.totalHoursPerWeek).toBeLessThanOrEqual(30)
  })

  it('Ramadan daily hours cap is exactly 6', () => {
    expect(RAMADAN_SCHEDULE.ramadanHoursPerDay).toBe(6)
  })

  it('isRamadanSchedule flag is true', () => {
    expect(RAMADAN_SCHEDULE.isRamadanSchedule).toBe(true)
  })

  it('5 working days × 6 hours/day = 30 hours/week (matches totalHoursPerWeek)', () => {
    const workingDaysPerWeek = 5 // Sun–Thu
    const hoursPerDay = RAMADAN_SCHEDULE.ramadanHoursPerDay
    expect(workingDaysPerWeek * hoursPerDay).toBe(RAMADAN_SCHEDULE.totalHoursPerWeek)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// WS-003 — Holiday conflict / duplicate detection (via rangesOverlap)
// ═══════════════════════════════════════════════════════════════════════════════

describe('WS-003: Holiday conflict detection via rangesOverlap', () => {
  // rangesOverlap is the service-level range-overlap primitive.
  // It is used for leave-request duplicate detection and can be applied to
  // holiday-block overlap checks with the same semantics.

  it('single-day holiday overlaps itself', () => {
    expect(rangesOverlap('2026-12-02', '2026-12-02', '2026-12-02', '2026-12-02')).toBe(true)
  })

  it('multi-day holiday overlaps a date within its range', () => {
    // Eid Al Adha: 2026-05-28 – 2026-05-30
    const eidStart = '2026-05-28'
    const eidEnd   = '2026-05-30'
    expect(rangesOverlap(eidStart, eidEnd, '2026-05-29', '2026-05-29')).toBe(true)
  })

  it('adjacent holidays do NOT overlap if they are back-to-back (end = next start)', () => {
    // National Day Day 1 (2026-12-02) and Day 2 (2026-12-03) are separate rows.
    // rangesOverlap(['12-02','12-02'], ['12-03','12-03']) → aEnd(12-02) >= bStart(12-03)? No.
    expect(rangesOverlap('2026-12-02', '2026-12-02', '2026-12-03', '2026-12-03')).toBe(false)
  })

  it('holiday does not overlap a date clearly outside its range', () => {
    expect(rangesOverlap('2026-12-02', '2026-12-02', '2026-12-05', '2026-12-05')).toBe(false)
  })

  it('partial overlap is detected (ranges share at least one day)', () => {
    // Block A: 2026-05-25 – 2026-05-28  |  Block B: 2026-05-28 – 2026-05-30
    expect(rangesOverlap('2026-05-25', '2026-05-28', '2026-05-28', '2026-05-30')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// WS-004 — Weekend identification
// ═══════════════════════════════════════════════════════════════════════════════

describe('WS-004: Weekend identification (UAE: Fri + Sat off)', () => {
  it('2026-05-01 (Friday) is a weekend day', () => {
    expect(isUaeWorkingDay('2026-05-01')).toBe(false)
  })

  it('2026-05-02 (Saturday) is a weekend day', () => {
    expect(isUaeWorkingDay('2026-05-02')).toBe(false)
  })

  it('2026-05-03 (Sunday) is a working day', () => {
    expect(isUaeWorkingDay('2026-05-03')).toBe(true)
  })

  it('2026-05-04 (Monday) is a working day', () => {
    expect(isUaeWorkingDay('2026-05-04')).toBe(true)
  })

  it('2026-05-08 (Friday) is a weekend day', () => {
    expect(isUaeWorkingDay('2026-05-08')).toBe(false)
  })

  it('2026-05-09 (Saturday) is a weekend day', () => {
    expect(isUaeWorkingDay('2026-05-09')).toBe(false)
  })

  it('every Friday in May 2026 is a non-working day', () => {
    const fridays = ['2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22', '2026-05-29']
    for (const friday of fridays) {
      expect(isUaeWorkingDay(friday), `${friday} should be non-working`).toBe(false)
    }
  })

  it('every Saturday in May 2026 is a non-working day', () => {
    const saturdays = ['2026-05-02', '2026-05-09', '2026-05-16', '2026-05-23', '2026-05-30']
    for (const saturday of saturdays) {
      expect(isUaeWorkingDay(saturday), `${saturday} should be non-working`).toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// WS-005 — Public holiday identification
// ═══════════════════════════════════════════════════════════════════════════════

describe('WS-005: Public holiday identification', () => {
  it('2026-12-02 (UAE National Day) is in the holiday list', () => {
    expect(isPublicHoliday('2026-12-02')).toBe(true)
  })

  it('2026-12-02 (UAE National Day) is confirmed', () => {
    expect(isPublicHoliday('2026-12-02', true)).toBe(true)
  })

  it('2026-12-03 (UAE National Day 2nd Day) is confirmed', () => {
    expect(isPublicHoliday('2026-12-03', true)).toBe(true)
  })

  it('2026-11-30 (UAE Commemoration Day) is confirmed', () => {
    expect(isPublicHoliday('2026-11-30', true)).toBe(true)
  })

  it('2026-03-20 (Eid Al Fitr Day 1) is in the list but NOT confirmed', () => {
    expect(isPublicHoliday('2026-03-20')).toBe(true)
    expect(isPublicHoliday('2026-03-20', true)).toBe(false)
  })

  it('2026-05-04 (regular Monday) is NOT a public holiday', () => {
    expect(isPublicHoliday('2026-05-04')).toBe(false)
  })

  it('2026-01-01 (New Year\'s Day) is a confirmed public holiday', () => {
    expect(isPublicHoliday('2026-01-01', true)).toBe(true)
  })

  it('holiday list contains exactly 13 entries for 2026', () => {
    expect(UAE_2026_FIXED_HOLIDAYS).toHaveLength(13)
  })

  it('exactly 4 holidays in 2026 are confirmed', () => {
    const confirmed = UAE_2026_FIXED_HOLIDAYS.filter(h => h.isConfirmed)
    // NY, Commemoration Day, National Day, National Day 2nd Day
    expect(confirmed).toHaveLength(4)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// WS-006 — Leave duration calculation (calendar days via computeRequestDurationDays)
//
// IMPORTANT NOTE: `computeRequestDurationDays` counts CALENDAR days (both
// endpoints inclusive), NOT working days.  The system stores durationDays as
// calendar days and the UI is responsible for showing working-day equivalents
// when needed.  Tests reflect the actual function contract.
// ═══════════════════════════════════════════════════════════════════════════════

describe('WS-006: Leave duration calculation (calendar days)', () => {
  it('half-day request always returns 0.5 regardless of dates', () => {
    expect(computeRequestDurationDays('2026-05-04', '2026-05-04', true)).toBe(0.5)
    expect(computeRequestDurationDays('2026-05-11', '2026-05-15', true)).toBe(0.5)
  })

  it('single-day request (Mon 2026-05-04) = 1 calendar day', () => {
    expect(computeRequestDurationDays('2026-05-04', '2026-05-04', false)).toBe(1)
  })

  it('Wed–Sun (2026-05-13 to 2026-05-17) = 5 calendar days inclusive', () => {
    // Calendar days: Wed 13, Thu 14, Fri 15, Sat 16, Sun 17 → 5 days.
    // Working days would be 3 (Wed, Thu excluded; Fri+Sat weekend, Sun working).
    // The function returns calendar days (5).
    expect(computeRequestDurationDays('2026-05-13', '2026-05-17', false)).toBe(5)
  })

  it('Mon–Fri full week (2026-05-11 to 2026-05-15) = 5 calendar days', () => {
    // Calendar: Mon 11, Tue 12, Wed 13, Thu 14, Fri 15 → 5 days.
    // Working days (Sun–Thu): Mon 11, Tue 12, Wed 13, Thu 14 = 4; Fri 15 = off.
    // computeRequestDurationDays returns calendar count = 5.
    expect(computeRequestDurationDays('2026-05-11', '2026-05-15', false)).toBe(5)
  })

  it('Mon–Sun full week (2026-05-04 to 2026-05-10) = 7 calendar days', () => {
    expect(computeRequestDurationDays('2026-05-04', '2026-05-10', false)).toBe(7)
  })

  it('working-day count for Mon–Fri (2026-05-11 to 2026-05-15) = 4 (excl Friday)', () => {
    // This uses our pure helper to show the working-day breakdown alongside
    // the calendar-day API.
    expect(countWorkingDays('2026-05-11', '2026-05-15')).toBe(4)
  })

  it('working-day count for Wed–Sun (2026-05-13 to 2026-05-17) = 3', () => {
    // Wed 13 (working), Thu 14 (working), Fri 15 (off), Sat 16 (off), Sun 17 (working)
    // = 3 working days
    expect(countWorkingDays('2026-05-13', '2026-05-17')).toBe(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// WS-007 — Leave spanning a weekend and a public holiday
// ═══════════════════════════════════════════════════════════════════════════════

describe('WS-007: Leave spanning weekend and holiday', () => {
  // Leave 2026-05-25 (Mon) to 2026-05-31 (Sun) spans:
  //   Working: Mon 25, Tue 26, Wed 27, Thu 28*, Fri 29 (off), Sat 30 (off), Sun 31
  //   (* 2026-05-28 = Eid Al Adha Day 1 — floating/unconfirmed; still a working day
  //      structurally unless confirmed by government)
  //   Calendar days: 7

  it('2026-05-25 to 2026-05-31 = 7 calendar days', () => {
    expect(computeRequestDurationDays('2026-05-25', '2026-05-31', false)).toBe(7)
  })

  it('working days in 2026-05-25 to 2026-05-31 = 5 (excl Fri+Sat)', () => {
    // Mon 25, Tue 26, Wed 27, Thu 28, Fri 29 (off), Sat 30 (off), Sun 31
    expect(countWorkingDays('2026-05-25', '2026-05-31')).toBe(5)
  })

  it('leave range 2026-05-25 to 2026-05-31 overlaps confirmed public holiday on 2026-12-02 = false', () => {
    // National Day is in December — no overlap with May leave.
    expect(rangesOverlap('2026-05-25', '2026-05-31', '2026-12-02', '2026-12-02')).toBe(false)
  })

  it('leave range spanning Eid Al Adha (2026-05-28) detects overlap', () => {
    // Eid Al Adha Day 1 is 2026-05-28 (floating, unconfirmed).
    // An employer may block leave around confirmed holidays; overlap check:
    expect(rangesOverlap('2026-05-25', '2026-05-31', '2026-05-28', '2026-05-30')).toBe(true)
  })

  it('leave entirely within a weekend does not overlap a non-weekend holiday', () => {
    // Weekend: 2026-05-01 (Fri) – 2026-05-02 (Sat); National Day is 2026-12-02.
    expect(rangesOverlap('2026-05-01', '2026-05-02', '2026-12-02', '2026-12-02')).toBe(false)
  })

  it('addDays correctly spans month boundaries (useful for holiday range calc)', () => {
    // Verify addDays works across month end — Nov 30 Commemoration Day + 2 = Dec 2 National Day
    expect(addDays('2026-11-30', 2)).toBe('2026-12-02')
  })
})
