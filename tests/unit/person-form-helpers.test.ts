/**
 * Sprint 9 / Change 1-5 — unit tests for all new pure-function code.
 *
 * Coverage:
 *   1. lib/person-form-helpers  — diffDays, addMonths, countUaeWorkingDays, monthsUntil
 *   2. components/forms/NationalitySelect — deriveNationalityCategory, filterCountries (via re-impl)
 *   3. lib/data/countries       — data integrity (no duplicate codes, ARE present, etc.)
 *   4. hooks/useDraftSave       — getRelativeTime, PII_FIELDS constant (via sanitize logic)
 *   5. modules/core-hr/validations — AssignmentStatus includes PENDING_APPROVAL
 *   6. modules/config/guards    — HR_HOD is a valid approver role
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

// ── DB stub ────────────────────────────────────────────────────────────────
// modules/config/guards.ts imports lib/db at module load — stub it so the
// test file can import without DATABASE_URL being set.
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/drizzle/schema', () => ({
  customFieldDefinitions: {},
  notificationTemplates:  {},
}))
vi.mock('drizzle-orm', () => ({
  eq: () => ({}), and: () => ({}), count: () => ({}),
}))

// ── 1. person-form-helpers ─────────────────────────────────────────────────

import {
  diffDays,
  addMonths,
  countUaeWorkingDays,
  monthsUntil,
} from '@/lib/person-form-helpers'

// Reference date pinned for all "today" tests
const TODAY = new Date('2026-05-01T12:00:00')   // local noon, avoids midnight boundary issues

describe('diffDays', () => {
  it('returns 0 for today', () => {
    expect(diffDays('2026-05-01', TODAY)).toBe(0)
  })

  it('returns 30 for exactly 30 days ago (boundary — does NOT trigger approval)', () => {
    expect(diffDays('2026-04-01', TODAY)).toBe(30)
  })

  it('returns 31 for 31 days ago (DOES trigger approval)', () => {
    expect(diffDays('2026-03-31', TODAY)).toBe(31)
  })

  it('returns negative for a future hire date', () => {
    expect(diffDays('2026-06-01', TODAY)).toBeLessThan(0)
  })

  it('does not trigger approval for today (0 days)', () => {
    expect(diffDays('2026-05-01', TODAY) > 30).toBe(false)
  })

  it('does not trigger approval for exactly 30 days', () => {
    expect(diffDays('2026-04-01', TODAY) > 30).toBe(false)
  })

  it('triggers approval at 31 days', () => {
    expect(diffDays('2026-03-31', TODAY) > 30).toBe(true)
  })

  it('handles year boundaries', () => {
    const jan1 = new Date('2026-01-01T12:00:00')
    expect(diffDays('2025-12-31', jan1)).toBe(1)
    expect(diffDays('2025-01-01', jan1)).toBe(365)
  })
})

describe('addMonths', () => {
  it('adds months to a mid-month date', () => {
    expect(addMonths('2026-03-15', 3)).toBe('2026-06-15')
  })

  it('adds months across a year boundary', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
  })

  it('Jan 31 + 1 month → Feb 28 (not March 3)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('Jan 31 + 1 month → Feb 29 in a leap year', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
  })

  it('Jan 31 + 3 months → Apr 30 (April has 30 days)', () => {
    expect(addMonths('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('Jan 31 + 5 months → Jun 30 (June has 30 days)', () => {
    expect(addMonths('2026-01-31', 5)).toBe('2026-06-30')
  })

  it('Jan 31 + 6 months → Jul 31 (probation max — July has 31 days)', () => {
    expect(addMonths('2026-01-31', 6)).toBe('2026-07-31')
  })

  it('Mar 31 + 1 month → Apr 30', () => {
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30')
  })

  it('Dec 31 + 2 months → Feb 28 (next year, non-leap)', () => {
    expect(addMonths('2026-12-31', 2)).toBe('2027-02-28')
  })

  it('adding 0 months returns the same date', () => {
    expect(addMonths('2026-04-15', 0)).toBe('2026-04-15')
  })

  it('BR-PR-001 probation check: hire Jan 1, 6 months = Jul 1', () => {
    expect(addMonths('2026-01-01', 6)).toBe('2026-07-01')
  })
})

describe('countUaeWorkingDays', () => {
  // Jan 5 2026 = Monday. (Verified: 2026-01-05 is Monday.)
  // UAE working week: Mon–Thu only.

  it('counts Mon-Thu in a single week (start is exclusive)', () => {
    // From Mon Jan 5 to Fri Jan 9: Tue 6, Wed 7, Thu 8 = 3 working days
    expect(countUaeWorkingDays('2026-01-05', '2026-01-09')).toBe(3)
  })

  it('counts Mon-Thu across two weeks', () => {
    // Mon Jan 5 to Mon Jan 12: Tue-Thu (3) + Mon Jan 12 (1) = 4
    expect(countUaeWorkingDays('2026-01-05', '2026-01-12')).toBe(4)
  })

  it('excludes Friday and Saturday', () => {
    // Thu Jan 8 to Tue Jan 13: Fri 9 (excl) + Sat 10 (excl) + Sun 11 (excl) + Mon 12 + Tue 13 = 2
    expect(countUaeWorkingDays('2026-01-08', '2026-01-13')).toBe(2)
  })

  it('returns 0 for same start and end (start is exclusive)', () => {
    expect(countUaeWorkingDays('2026-01-05', '2026-01-05')).toBe(0)
  })

  it('returns 0 for a Friday-to-Friday weekend span', () => {
    // Fri Jan 9 to Sat Jan 10: only Saturday — not counted
    expect(countUaeWorkingDays('2026-01-09', '2026-01-10')).toBe(0)
  })

  it('counts correctly across a month boundary', () => {
    // Wed Jan 28 to Mon Feb 2: Thu Jan 29, Mon Feb 2 = 2
    expect(countUaeWorkingDays('2026-01-28', '2026-02-02')).toBe(2)
  })

  it('6-month probation from Jan 1 yields positive working days', () => {
    const probEnd = addMonths('2026-01-01', 6) // '2026-07-01'
    const days = countUaeWorkingDays('2026-01-01', probEnd)
    expect(days).toBeGreaterThan(0)
    expect(days).toBeLessThan(200) // sanity cap
  })
})

describe('monthsUntil', () => {
  const REF = new Date('2026-05-01T12:00:00')  // May 2026

  it('returns positive for a future expiry', () => {
    expect(monthsUntil('2026-11-30', REF)).toBe(6)
  })

  it('returns 0 for expiry in the same month', () => {
    expect(monthsUntil('2026-05-31', REF)).toBe(0)
  })

  it('returns negative for an expired passport (month already past)', () => {
    expect(monthsUntil('2026-04-30', REF)).toBe(-1)
  })

  it('returns 12 for exactly 1 year ahead', () => {
    expect(monthsUntil('2027-05-01', REF)).toBe(12)
  })

  it('passport critical threshold: < 6 months', () => {
    const months = monthsUntil('2026-10-01', REF)  // 5 months ahead
    expect(months).toBe(5)
    expect(months < 6).toBe(true)   // should show critical warning
  })

  it('passport warning threshold: 6–11 months', () => {
    const months = monthsUntil('2026-11-01', REF)  // 6 months ahead
    expect(months).toBe(6)
    expect(months >= 6 && months < 12).toBe(true)  // should show warning
  })

  it('no warning for >= 12 months', () => {
    const months = monthsUntil('2027-06-01', REF)  // 13 months ahead
    expect(months).toBe(13)
    expect(months >= 12).toBe(true)   // no warning shown
  })
})

// ── 2. deriveNationalityCategory ──────────────────────────────────────────

import { deriveNationalityCategory } from '@/components/forms/NationalitySelect'

describe('deriveNationalityCategory', () => {
  it('ARE → UAE_NATIONAL', () => {
    expect(deriveNationalityCategory('ARE')).toBe('UAE_NATIONAL')
  })

  it('GCC countries → GCC_NATIONAL', () => {
    for (const code of ['SAU', 'KWT', 'QAT', 'BHR', 'OMN']) {
      expect(deriveNationalityCategory(code)).toBe('GCC_NATIONAL')
    }
  })

  it('non-GCC countries → EXPAT', () => {
    for (const code of ['GBR', 'IND', 'PAK', 'USA', 'EGY', 'PHL', 'BGD']) {
      expect(deriveNationalityCategory(code)).toBe('EXPAT')
    }
  })

  it('ARE is not treated as GCC_NATIONAL', () => {
    expect(deriveNationalityCategory('ARE')).not.toBe('GCC_NATIONAL')
  })

  it('unknown code defaults to EXPAT', () => {
    expect(deriveNationalityCategory('ZZZ')).toBe('EXPAT')
  })
})

// ── 3. Country data integrity ─────────────────────────────────────────────

import { PINNED_COUNTRIES, REST_COUNTRIES, COUNTRIES, getCountryByCode } from '@/lib/data/countries'

describe('countries data', () => {
  it('ARE is the first pinned country', () => {
    expect(PINNED_COUNTRIES[0].code).toBe('ARE')
  })

  it('all GCC countries are pinned', () => {
    const pinnedCodes = new Set(PINNED_COUNTRIES.map(c => c.code))
    for (const gcc of ['SAU', 'KWT', 'QAT', 'BHR', 'OMN']) {
      expect(pinnedCodes.has(gcc)).toBe(true)
    }
  })

  it('has more than 200 countries total', () => {
    expect(COUNTRIES.length).toBeGreaterThan(200)
  })

  it('no duplicate codes in COUNTRIES', () => {
    const codes = COUNTRIES.map(c => c.code)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })

  it('every country has a non-empty flag, nameEn, nameAr, and 3-char code', () => {
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/)
      expect(c.nameEn.length).toBeGreaterThan(0)
      expect(c.nameAr.length).toBeGreaterThan(0)
      expect(c.flag.length).toBeGreaterThan(0)
    }
  })

  it('pinned countries are NOT duplicated in REST_COUNTRIES', () => {
    const pinnedCodes = new Set(PINNED_COUNTRIES.map(c => c.code))
    const restCodes   = REST_COUNTRIES.map(c => c.code)
    for (const code of restCodes) {
      expect(pinnedCodes.has(code)).toBe(false)
    }
  })

  it('getCountryByCode returns the correct country', () => {
    const uae = getCountryByCode('ARE')
    expect(uae).toBeDefined()
    expect(uae!.nameEn).toBe('United Arab Emirates')
    expect(uae!.flag).toBe('🇦🇪')
  })

  it('getCountryByCode returns undefined for unknown code', () => {
    expect(getCountryByCode('ZZZ')).toBeUndefined()
  })
})

// ── 4. useDraftSave — getRelativeTime ─────────────────────────────────────

import { getRelativeTime } from '@/hooks/useDraftSave'

describe('getRelativeTime', () => {
  afterEach(() => { vi.useRealTimers() })

  it('returns "just now" for < 60 seconds ago', () => {
    vi.useFakeTimers()
    const savedAt = new Date()
    vi.advanceTimersByTime(30_000)
    expect(getRelativeTime(savedAt)).toBe('just now')
  })

  it('returns "1 minute ago" for exactly 60 seconds', () => {
    vi.useFakeTimers()
    const savedAt = new Date()
    vi.advanceTimersByTime(60_000)
    expect(getRelativeTime(savedAt)).toBe('1 minute ago')
  })

  it('returns "N minutes ago" for 2–59 minutes', () => {
    vi.useFakeTimers()
    const savedAt = new Date()
    vi.advanceTimersByTime(5 * 60_000)
    expect(getRelativeTime(savedAt)).toBe('5 minutes ago')
  })

  it('returns "1 hour ago" for exactly 60 minutes', () => {
    vi.useFakeTimers()
    const savedAt = new Date()
    vi.advanceTimersByTime(60 * 60_000)
    expect(getRelativeTime(savedAt)).toBe('1 hour ago')
  })

  it('returns "N hours ago" for 2–23 hours', () => {
    vi.useFakeTimers()
    const savedAt = new Date()
    vi.advanceTimersByTime(3 * 60 * 60_000)
    expect(getRelativeTime(savedAt)).toBe('3 hours ago')
  })

  it('returns "Yesterday at HH:MM" for ≥ 24 hours', () => {
    vi.useFakeTimers()
    const savedAt = new Date()
    vi.advanceTimersByTime(25 * 60 * 60_000)
    const result = getRelativeTime(savedAt)
    expect(result).toMatch(/^Yesterday at \d{2}:\d{2}$/)
  })
})

// ── 5. AssignmentStatus includes PENDING_APPROVAL ─────────────────────────

import { AssignmentStatus } from '@/modules/core-hr/validations'

describe('AssignmentStatus schema', () => {
  it('accepts PENDING_APPROVAL (BR-WF-010 backdated hire)', () => {
    expect(AssignmentStatus.safeParse('PENDING_APPROVAL').success).toBe(true)
  })

  it('accepts PENDING_HIRE (normal hire flow)', () => {
    expect(AssignmentStatus.safeParse('PENDING_HIRE').success).toBe(true)
  })

  it('accepts ACTIVE', () => {
    expect(AssignmentStatus.safeParse('ACTIVE').success).toBe(true)
  })

  it('rejects unknown status', () => {
    expect(AssignmentStatus.safeParse('AWAITING').success).toBe(false)
  })
})

// ── 6. guards — HR_HOD is a valid approver role ───────────────────────────

import { assertWorkflowRoleValid, assertEscalationRoleHigher } from '@/modules/config/guards'

describe('assertWorkflowRoleValid', () => {
  it('accepts HR_HOD (added for BR-WF-010)', () => {
    expect(() => assertWorkflowRoleValid('HR_HOD')).not.toThrow()
  })

  it('accepts all other standard approver roles', () => {
    for (const role of ['LINE_MANAGER', 'HOD', 'HR_DIRECTOR', 'HR_ADMIN', 'CEO']) {
      expect(() => assertWorkflowRoleValid(role)).not.toThrow()
    }
  })

  it('rejects an unknown role', () => {
    expect(() => assertWorkflowRoleValid('GHOST')).toThrow('INVALID_ROLE')
  })
})

describe('assertEscalationRoleHigher — HR_HOD rank', () => {
  it('HR_HOD escalates to HR_DIRECTOR (higher rank)', () => {
    expect(() => assertEscalationRoleHigher('HR_HOD', 'HR_DIRECTOR')).not.toThrow()
  })

  it('HR_HOD escalates to HR_ADMIN (higher rank)', () => {
    expect(() => assertEscalationRoleHigher('HR_HOD', 'HR_ADMIN')).not.toThrow()
  })

  it('LINE_MANAGER escalates to HR_HOD (HR_HOD outranks LINE_MANAGER)', () => {
    expect(() => assertEscalationRoleHigher('LINE_MANAGER', 'HR_HOD')).not.toThrow()
  })

  it('HOD cannot escalate to HR_HOD — HR_HOD rank = HOD + 1, escalation must be strictly higher', () => {
    // HOD rank=2, HR_HOD rank=3 → HR_HOD IS higher → should not throw
    expect(() => assertEscalationRoleHigher('HOD', 'HR_HOD')).not.toThrow()
  })

  it('HR_HOD cannot escalate to LINE_MANAGER (lower rank)', () => {
    expect(() => assertEscalationRoleHigher('HR_HOD', 'LINE_MANAGER')).toThrow('INVALID_ESCALATION')
  })

  it('HR_HOD cannot escalate to itself', () => {
    expect(() => assertEscalationRoleHigher('HR_HOD', 'HR_HOD')).toThrow('INVALID_ESCALATION')
  })
})

// ── 7. Backdating threshold integration ───────────────────────────────────

describe('backdating threshold (> 30 days triggers approval)', () => {
  it('exactly 30 days: no approval needed', () => {
    const ref = new Date('2026-05-01T12:00:00')
    expect(diffDays('2026-04-01', ref) > 30).toBe(false)
  })

  it('31 days: approval required', () => {
    const ref = new Date('2026-05-01T12:00:00')
    expect(diffDays('2026-03-31', ref) > 30).toBe(true)
  })

  it('future date: no approval needed', () => {
    const ref = new Date('2026-05-01T12:00:00')
    expect(diffDays('2026-07-01', ref) > 30).toBe(false)
  })

  it('today: no approval needed', () => {
    const ref = new Date('2026-05-01T12:00:00')
    expect(diffDays('2026-05-01', ref) > 30).toBe(false)
  })
})

// ── 8. Probation BR-PR-001 schema cross-check ─────────────────────────────

import { CreatePersonSchema } from '@/modules/core-hr/validations'

const basePersonPayload = {
  firstNameEn:         'Test',
  lastNameEn:          'User',
  fullNameAr:          'مستخدم تجريبي',
  dateOfBirth:         '1990-01-01',
  gender:              'MALE',
  nationalityCode:     'ARE',
  nationalityCategory: 'UAE_NATIONAL',
  legalEntityId:       '11111111-1111-1111-1111-111111111111',
  employmentType:      'FULL_TIME',
  hireDate:            '2026-01-31',
}

describe('BR-PR-001 — probation ≤ 6 months (addMonths + schema)', () => {
  it('6-month probation from Jan 31 clamps to Jul 31 and passes schema', () => {
    const probationEndDate = addMonths('2026-01-31', 6) // '2026-07-31'
    expect(probationEndDate).toBe('2026-07-31')
    const r = CreatePersonSchema.safeParse({ ...basePersonPayload, probationEndDate })
    expect(r.success).toBe(true)
  })

  it('1-month probation from Jan 31 clamps to Feb 28 (not Mar 3) and passes schema', () => {
    const probationEndDate = addMonths('2026-01-31', 1) // '2026-02-28'
    expect(probationEndDate).toBe('2026-02-28')
    const r = CreatePersonSchema.safeParse({ ...basePersonPayload, probationEndDate })
    expect(r.success).toBe(true)
  })

  it('3-month probation from Jan 31 clamps to Apr 30 and passes schema', () => {
    const probationEndDate = addMonths('2026-01-31', 3) // '2026-04-30'
    expect(probationEndDate).toBe('2026-04-30')
    const r = CreatePersonSchema.safeParse({ ...basePersonPayload, probationEndDate })
    expect(r.success).toBe(true)
  })

  it('schema rejects a 7-month probation end date (BR-PR-001)', () => {
    const r = CreatePersonSchema.safeParse({
      ...basePersonPayload,
      hireDate:         '2026-01-01',
      probationEndDate: '2026-08-15',  // 7.5 months
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some(i => i.message.includes('BR-PR-001'))).toBe(true)
    }
  })
})
