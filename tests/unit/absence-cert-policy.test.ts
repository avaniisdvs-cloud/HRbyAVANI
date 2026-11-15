/**
 * GAP-M01 FIX (FIX-S9-01) — sick-leave medical-cert policy unit tests.
 *
 * Pure-helper coverage for `isMedicalCertRequired` across the three
 * configurable thresholds (0 / 2 / 3) plus non-sick leave types.
 *
 * BR-SL-002: Article 31, FDL 33/2021 — UAE minimum is Day 1 (threshold=0).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

const { isMedicalCertRequired } = await import('@/lib/absence-cert-policy')

describe('isMedicalCertRequired — configurable threshold (GAP-M01)', () => {
  describe('threshold = 0 (Day 1 — UAE Labour Law minimum)', () => {
    it('1 day sick leave requires cert', () => {
      expect(isMedicalCertRequired('SICK', 1, 0)).toBe(true)
    })
    it('3 days sick leave requires cert', () => {
      expect(isMedicalCertRequired('SICK', 3, 0)).toBe(true)
    })
  })

  describe('threshold = 2 (Avaniis policy)', () => {
    it('1 day sick leave: cert NOT required', () => {
      expect(isMedicalCertRequired('SICK', 1, 2)).toBe(false)
    })
    it('2 days sick leave: cert NOT required (at threshold, not exceeding)', () => {
      expect(isMedicalCertRequired('SICK', 2, 2)).toBe(false)
    })
    it('3 days sick leave: cert required (exceeds threshold of 2)', () => {
      expect(isMedicalCertRequired('SICK', 3, 2)).toBe(true)
    })
  })

  describe('threshold = 3', () => {
    it('3 days sick leave: cert NOT required (at threshold)', () => {
      expect(isMedicalCertRequired('SICK', 3, 3)).toBe(false)
    })
    it('4 days sick leave: cert required', () => {
      expect(isMedicalCertRequired('SICK', 4, 3)).toBe(true)
    })
  })

  describe('non-sick leave types', () => {
    it('annual leave never requires cert regardless of threshold', () => {
      expect(isMedicalCertRequired('ANNUAL', 10, 0)).toBe(false)
    })
    it('maternity leave never requires cert', () => {
      expect(isMedicalCertRequired('MATERNITY', 60, 0)).toBe(false)
    })
  })
})
