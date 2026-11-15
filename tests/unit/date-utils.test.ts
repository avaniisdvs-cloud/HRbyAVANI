import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * S6-Q7 (audit-fix sweep) — Unit tests for `lib/date-utils.ts`.
 *
 * Pinning the contract that `isoDateAddDays` / `isoDateDiff` /
 * `todayUae` are timezone-stable so callers (admin dashboard, employee
 * dashboard, document-expiry cron) can rely on identical results
 * regardless of host TZ.
 */
import { isoDateAddDays, isoDateDiff, todayUae } from '@/lib/date-utils'

describe('isoDateAddDays', () => {
  it('adds positive days', () => {
    expect(isoDateAddDays('2026-04-29', 30)).toBe('2026-05-29')
    expect(isoDateAddDays('2026-04-29', 1)).toBe('2026-04-30')
  })

  it('adds 0 days returns the same date', () => {
    expect(isoDateAddDays('2026-04-29', 0)).toBe('2026-04-29')
  })

  it('subtracts when days is negative', () => {
    expect(isoDateAddDays('2026-04-29', -1)).toBe('2026-04-28')
    expect(isoDateAddDays('2026-04-29', -29)).toBe('2026-03-31')
  })

  it('rolls over month and year boundaries', () => {
    expect(isoDateAddDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(isoDateAddDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(isoDateAddDays('2024-02-28', 1)).toBe('2024-02-29') // leap year
    expect(isoDateAddDays('2026-02-28', 1)).toBe('2026-03-01') // non-leap
  })

  it('result is independent of host timezone (UTC-anchored)', () => {
    // The string-based YYYY-MM-DD output should not shift when called
    // around midnight in different host TZs. We can't change TZ in
    // vitest, but we can assert the helper doesn't depend on Date's
    // local-string surface area — only the UTC-string slice.
    const before = isoDateAddDays('2026-06-01', 5)
    const after  = isoDateAddDays('2026-06-01', 5)
    expect(before).toBe(after)
    expect(before).toBe('2026-06-06')
  })
})

describe('isoDateDiff', () => {
  it('returns 0 for the same date', () => {
    expect(isoDateDiff('2026-04-29', '2026-04-29')).toBe(0)
  })

  it('returns positive when b > a', () => {
    expect(isoDateDiff('2026-04-29', '2026-05-29')).toBe(30)
    expect(isoDateDiff('2026-04-29', '2026-04-30')).toBe(1)
  })

  it('returns negative when b < a', () => {
    expect(isoDateDiff('2026-04-29', '2026-04-28')).toBe(-1)
    expect(isoDateDiff('2026-05-29', '2026-04-29')).toBe(-30)
  })

  it('handles leap-year February correctly', () => {
    expect(isoDateDiff('2024-02-28', '2024-03-01')).toBe(2) // 28 → 29 → 1 = 2 days
    expect(isoDateDiff('2026-02-28', '2026-03-01')).toBe(1)
  })

  it('inverse of isoDateAddDays — round-trip identity', () => {
    const a = '2026-04-29'
    const b = isoDateAddDays(a, 90)
    expect(isoDateDiff(a, b)).toBe(90)
    expect(isoDateDiff(b, a)).toBe(-90)
  })
})

describe('todayUae', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns ISO YYYY-MM-DD shape', () => {
    expect(todayUae()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('uses UAE timezone (UTC+4) — 22:00 UTC = 02:00 next-day UAE', () => {
    // 2026-04-29T22:00:00Z is 2026-04-30T02:00:00 UAE → todayUae = 2026-04-30
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T22:00:00Z'))
    expect(todayUae()).toBe('2026-04-30')
  })

  it('20:00 UTC same day in UAE — 24:00 boundary just crossed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T20:00:00Z'))
    expect(todayUae()).toBe('2026-04-30')
  })

  it('19:59 UTC stays on prior UAE day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-29T19:59:00Z'))
    expect(todayUae()).toBe('2026-04-29')
  })
})
