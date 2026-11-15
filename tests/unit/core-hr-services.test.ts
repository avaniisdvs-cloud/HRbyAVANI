/**
 * QA-Audit-H5 — Unit tests for core-hr pure helpers.
 *
 * Sprint 3 shipped ~2,400 LOC with zero coverage on its own deliverables.
 * This pack covers the pure (DB-free) functions that are the foundation
 * for every Server Action: name composition, format guards, masking,
 * role-based PII reveal, Emiratisation eligibility, and notice-period
 * derivation.
 */
import { describe, it, expect, beforeAll } from 'vitest'

// Force a deterministic encryption key for tests so encrypt/decrypt is stable.
beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64) // valid hex
  }
})

import {
  composeFullNameEn,
  maskEmiratesId,
  maskTail,
  isEmiratisationEligible,
  canSeeFullPii,
  assertEmiratesIdFormat,
  assertUaeIbanFormat,
} from '@/modules/core-hr/services'
import { deriveNoticePeriodDays } from '@/modules/core-hr/contracts/services'
import { normalizeEmiratesId } from '@/modules/core-hr/validations'

// ── composeFullNameEn ─────────────────────────────────────────────────────

describe('composeFullNameEn', () => {
  it('joins first + middle + last with single spaces', () => {
    expect(composeFullNameEn({ firstNameEn: 'Sara', middleNameEn: 'Ali', lastNameEn: 'Ahmed' }))
      .toBe('Sara Ali Ahmed')
  })

  it('omits middle name when blank or undefined', () => {
    expect(composeFullNameEn({ firstNameEn: 'Sara', lastNameEn: 'Ahmed' }))
      .toBe('Sara Ahmed')
    expect(composeFullNameEn({ firstNameEn: 'Sara', middleNameEn: '', lastNameEn: 'Ahmed' }))
      .toBe('Sara Ahmed')
    expect(composeFullNameEn({ firstNameEn: 'Sara', middleNameEn: null, lastNameEn: 'Ahmed' }))
      .toBe('Sara Ahmed')
  })

  it('trims surrounding whitespace from each part', () => {
    expect(composeFullNameEn({ firstNameEn: '  Sara ', middleNameEn: ' Ali  ', lastNameEn: '  Ahmed' }))
      .toBe('Sara Ali Ahmed')
  })

  it('ignores parts that are pure whitespace after trim', () => {
    expect(composeFullNameEn({ firstNameEn: 'Sara', middleNameEn: '   ', lastNameEn: 'Ahmed' }))
      .toBe('Sara Ahmed')
  })
})

// ── EID format + normalization (M7) ──────────────────────────────────────

describe('Emirates ID format', () => {
  it('assertEmiratesIdFormat accepts dashed canonical form', () => {
    expect(() => assertEmiratesIdFormat('784-1989-1234567-1')).not.toThrow()
  })

  it('assertEmiratesIdFormat rejects raw 15-digit form (legacy strict check)', () => {
    expect(() => assertEmiratesIdFormat('784198912345671')).toThrow(/BR-EID-001/)
  })

  it('assertEmiratesIdFormat rejects garbage', () => {
    expect(() => assertEmiratesIdFormat('not-an-eid')).toThrow(/BR-EID-001/)
    expect(() => assertEmiratesIdFormat('')).toThrow(/BR-EID-001/)
  })

  it('normalizeEmiratesId turns raw 15-digit into dashed canonical', () => {
    expect(normalizeEmiratesId('784198912345671')).toBe('784-1989-1234567-1')
  })

  it('normalizeEmiratesId returns dashed form unchanged', () => {
    expect(normalizeEmiratesId('784-1989-1234567-1')).toBe('784-1989-1234567-1')
  })

  it('normalizeEmiratesId trims surrounding whitespace', () => {
    expect(normalizeEmiratesId('  784198912345671  ')).toBe('784-1989-1234567-1')
  })

  it('normalizeEmiratesId throws on invalid format', () => {
    expect(() => normalizeEmiratesId('123-456')).toThrow(/BR-EID-001/)
  })
})

// ── IBAN format (BR-WPS-004) ──────────────────────────────────────────────

describe('UAE IBAN format', () => {
  it('accepts a valid 23-char AE IBAN', () => {
    expect(() => assertUaeIbanFormat('AE070331234567890123456')).not.toThrow()
  })

  it('rejects non-AE prefix', () => {
    expect(() => assertUaeIbanFormat('GB070331234567890123456')).toThrow(/BR-WPS-004/)
  })

  it('rejects wrong length', () => {
    expect(() => assertUaeIbanFormat('AE07033123456789')).toThrow(/BR-WPS-004/)
    expect(() => assertUaeIbanFormat('AE0703312345678901234567890')).toThrow(/BR-WPS-004/)
  })

  it('rejects non-numeric tail', () => {
    expect(() => assertUaeIbanFormat('AE07033ABCDEF0123456789')).toThrow(/BR-WPS-004/)
  })
})

// ── PII masking ───────────────────────────────────────────────────────────

describe('PII masking', () => {
  it('maskEmiratesId keeps category prefix + last digit', () => {
    expect(maskEmiratesId('784-1989-1234567-1')).toBe('784-****-*******-1')
  })

  it('maskEmiratesId returns null on null input', () => {
    expect(maskEmiratesId(null)).toBeNull()
  })

  it('maskEmiratesId returns "****" on malformed input (defensive)', () => {
    expect(maskEmiratesId('not-an-eid')).toBe('****')
  })

  it('maskTail leaves only N visible chars', () => {
    expect(maskTail('AE070331234567890123456', 4)).toBe('•••••••••••••••••••3456')
    expect(maskTail('A1234567', 4)).toBe('••••4567')
  })

  it('maskTail handles short strings safely', () => {
    expect(maskTail('AB', 4)).toBe('**')
    // Empty string is falsy → null (matches null-returning contract)
    expect(maskTail('', 4)).toBeNull()
  })

  it('maskTail returns null on null input', () => {
    expect(maskTail(null, 4)).toBeNull()
  })
})

// ── canSeeFullPii ─────────────────────────────────────────────────────────

describe('canSeeFullPii — role-based PII reveal (Security spec §2.3)', () => {
  const personRow = { id: 'person-A' } as any

  it('HR_ADMIN sees full PII', () => {
    expect(canSeeFullPii(personRow, { role: 'HR_ADMIN' })).toBe(true)
  })

  it('PAYROLL_ADMIN sees full PII', () => {
    expect(canSeeFullPii(personRow, { role: 'PAYROLL_ADMIN' })).toBe(true)
  })

  it('HR_DIRECTOR sees full PII', () => {
    expect(canSeeFullPii(personRow, { role: 'HR_DIRECTOR' })).toBe(true)
  })

  it('SUPER_ADMIN sees full PII', () => {
    expect(canSeeFullPii(personRow, { role: 'SUPER_ADMIN' })).toBe(true)
  })

  it('MANAGER does NOT see full PII (masked)', () => {
    expect(canSeeFullPii(personRow, { role: 'MANAGER' })).toBe(false)
  })

  it('EMPLOYEE does NOT see full PII for someone else', () => {
    expect(canSeeFullPii(personRow, { role: 'EMPLOYEE', viewerPersonId: 'person-B' })).toBe(false)
  })

  it('EMPLOYEE sees full PII for own record (self-access)', () => {
    expect(canSeeFullPii(personRow, { role: 'EMPLOYEE', viewerPersonId: 'person-A' })).toBe(true)
  })
})

// ── isEmiratisationEligible (BR-NAF-002) ─────────────────────────────────

describe('isEmiratisationEligible — Nafis quota counter', () => {
  it('UAE National on Nafis-target job is eligible', () => {
    expect(isEmiratisationEligible({ nationalityCategory: 'UAE_NATIONAL', jobIsEmiratisationTarget: true }))
      .toBe(true)
  })

  it('UAE National on a non-target job is not eligible', () => {
    expect(isEmiratisationEligible({ nationalityCategory: 'UAE_NATIONAL', jobIsEmiratisationTarget: false }))
      .toBe(false)
  })

  it('Expat on a Nafis-target job is not eligible', () => {
    expect(isEmiratisationEligible({ nationalityCategory: 'EXPAT', jobIsEmiratisationTarget: true }))
      .toBe(false)
  })

  it('GCC National on a Nafis-target job is not eligible', () => {
    expect(isEmiratisationEligible({ nationalityCategory: 'GCC_NATIONAL', jobIsEmiratisationTarget: true }))
      .toBe(false)
  })

  it('null jobIsEmiratisationTarget treated as not-target', () => {
    expect(isEmiratisationEligible({ nationalityCategory: 'UAE_NATIONAL', jobIsEmiratisationTarget: null }))
      .toBe(false)
  })
})

// ── deriveNoticePeriodDays — BR-NP-001 ────────────────────────────────────

describe('deriveNoticePeriodDays — BR-NP-001 service-tiered notice', () => {
  it('< 5 years service → 30 days', () => {
    expect(deriveNoticePeriodDays(0)).toBe(30)
    expect(deriveNoticePeriodDays(1)).toBe(30)
    expect(deriveNoticePeriodDays(4.99)).toBe(30)
  })

  it('5–10 years service → 60 days', () => {
    expect(deriveNoticePeriodDays(5)).toBe(60)
    expect(deriveNoticePeriodDays(7.5)).toBe(60)
    expect(deriveNoticePeriodDays(9.99)).toBe(60)
  })

  it('≥ 10 years service → 90 days', () => {
    expect(deriveNoticePeriodDays(10)).toBe(90)
    expect(deriveNoticePeriodDays(15)).toBe(90)
    expect(deriveNoticePeriodDays(40)).toBe(90)
  })

  it('handles fractional years correctly at boundaries', () => {
    expect(deriveNoticePeriodDays(4.999999)).toBe(30)
    expect(deriveNoticePeriodDays(5.0)).toBe(60)
    expect(deriveNoticePeriodDays(9.999999)).toBe(60)
    expect(deriveNoticePeriodDays(10.0)).toBe(90)
  })
})
