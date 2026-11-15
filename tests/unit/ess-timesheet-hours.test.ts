import { describe, it, expect } from 'vitest'

// Mirrors the computation in app/(employee)/me/page.tsx:
// hoursThisWeek = Math.round(parseFloat(weekSchedule[0]?.totalHoursPerWeek ?? '0') * 10) / 10
function computeWeeklyHours(totalHoursPerWeek: string | null | undefined): number {
  return Math.round(parseFloat(totalHoursPerWeek ?? '0') * 10) / 10
}

describe('ESS dashboard — hoursThisWeek from work schedule', () => {
  it('TSH-001: returns 0 when no schedule row exists', () => {
    expect(computeWeeklyHours(undefined)).toBe(0)
    expect(computeWeeklyHours(null)).toBe(0)
  })

  it('TSH-002: returns exact hours for a whole-number schedule (UAE 48h/week)', () => {
    expect(computeWeeklyHours('48.00')).toBe(48)
  })

  it('TSH-003: returns exact hours for a standard 40h schedule', () => {
    expect(computeWeeklyHours('40.00')).toBe(40)
  })

  it('TSH-004: returns rounded value for fractional schedules (37.5h part-time)', () => {
    expect(computeWeeklyHours('37.50')).toBe(37.5)
  })

  it('TSH-005: rounds to 1 decimal for non-round values', () => {
    expect(computeWeeklyHours('38.33')).toBe(38.3)
  })
})
