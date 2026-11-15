import { describe, it, expect } from 'vitest'
import {
  daysBetween,
  addDays,
  addMonths,
  isBefore,
  yearsOfService,
  EFFECTIVE_END_OF_TIME,
  isOpenEndedEffectiveDate,
  normalizeEffectiveEndDate,
} from '@/lib/effective-date'

describe('lib/effective-date', () => {
  describe('daysBetween', () => {
    it('returns 0 for the same date', () => {
      expect(daysBetween('2024-01-01', '2024-01-01')).toBe(0)
    })

    it('returns 1 for adjacent days', () => {
      expect(daysBetween('2024-01-01', '2024-01-02')).toBe(1)
    })

    it('is symmetric (absolute value)', () => {
      expect(daysBetween('2024-01-10', '2024-01-01')).toBe(9)
    })

    it('handles month boundaries', () => {
      expect(daysBetween('2024-01-31', '2024-02-01')).toBe(1)
    })

    it('handles leap year', () => {
      expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
    })
  })

  describe('addDays', () => {
    it('adds days across month boundary', () => {
      expect(addDays('2024-01-30', 3)).toBe('2024-02-02')
    })

    it('adds 0 days returns same date', () => {
      expect(addDays('2024-06-15', 0)).toBe('2024-06-15')
    })
  })

  describe('addMonths', () => {
    it('adds 6 months', () => {
      expect(addMonths('2024-01-15', 6)).toBe('2024-07-15')
    })

    it('handles year boundary', () => {
      expect(addMonths('2024-10-01', 3)).toBe('2025-01-01')
    })
  })

  describe('isBefore', () => {
    it('returns true when a < b', () => {
      expect(isBefore('2024-01-01', '2024-12-31')).toBe(true)
    })

    it('returns false when a === b', () => {
      expect(isBefore('2024-06-01', '2024-06-01')).toBe(false)
    })

    it('returns false when a > b', () => {
      expect(isBefore('2024-12-31', '2024-01-01')).toBe(false)
    })
  })



  describe('sentinel open-ended dates', () => {
    it('uses 9999-12-31 as the open-ended sentinel', () => {
      expect(EFFECTIVE_END_OF_TIME).toBe('9999-12-31')
    })

    it('normalizes blank and legacy null end dates to the sentinel', () => {
      expect(normalizeEffectiveEndDate(null)).toBe(EFFECTIVE_END_OF_TIME)
      expect(normalizeEffectiveEndDate('')).toBe(EFFECTIVE_END_OF_TIME)
      expect(normalizeEffectiveEndDate('2026-06-30')).toBe('2026-06-30')
    })

    it('treats sentinel and legacy null as open-ended during migration', () => {
      expect(isOpenEndedEffectiveDate(EFFECTIVE_END_OF_TIME)).toBe(true)
      expect(isOpenEndedEffectiveDate(null)).toBe(true)
      expect(isOpenEndedEffectiveDate('2026-06-30')).toBe(false)
    })
  })

  describe('yearsOfService', () => {
    it('returns ~1 year for exactly 365 days', () => {
      const hire = '2023-01-01'
      const asOf = '2024-01-01'
      expect(yearsOfService(hire, asOf)).toBeCloseTo(1, 0)
    })

    it('returns ~5 years for exactly 5 years', () => {
      expect(yearsOfService('2019-01-01', '2024-01-01')).toBeCloseTo(5, 0)
    })

    it('deducts unpaid leave days', () => {
      // 2 years minus 60 unpaid days
      const gross = yearsOfService('2022-01-01', '2024-01-01')
      const net   = yearsOfService('2022-01-01', '2024-01-01', 60)
      expect(net).toBeLessThan(gross)
    })

    it('never returns negative', () => {
      // More unpaid days than total service
      expect(yearsOfService('2024-01-01', '2024-01-10', 9999)).toBeGreaterThanOrEqual(0)
    })
  })
})
