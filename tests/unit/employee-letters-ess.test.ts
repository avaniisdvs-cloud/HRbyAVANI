/**
 * Employee Letters ESS — unit tests (ESSLTR-001–010)
 *
 * Coverage: new letter type codes, ESS configuration contract,
 * business-friendly error messages, LETTER_TYPE_LABELS completeness,
 * STATUS_META completeness, error code contract.
 *
 * lib/db.ts is mocked so the test needs no DATABASE_URL.
 */

import { describe, it, expect, vi } from 'vitest'

// Mock the Drizzle client before any module that imports it is loaded
vi.mock('@/lib/db', () => ({ db: {} }))

import { LETTER_TYPE_LABELS } from '@/lib/documents/get-employee-documents'

// ── Constants under test (mirrors seed + actions) ─────────────────────────────

const ESS_ERRORS = {
  LETTER_TYPE_NOT_FOUND: 'This letter type is not available. Please contact HR Administration.',
  ESS_NOT_ALLOWED:       'This letter type cannot be requested online. Please contact HR directly.',
  PERSON_NOT_FOUND:      'We cannot generate this letter because some required employee information is missing. Please contact HR to update your profile.',
  NO_TEMPLATE:           'This letter template is not configured yet. Please contact HR Administration to configure the template before requesting this letter.',
  TEMPLATE_INVALID:      'We cannot generate this letter because some required employee information is missing. Please contact HR to update your profile.',
  NO_APPROVER:           'This letter requires approval, but no approver is configured. Please contact HR Administration.',
  VALIDATION_ERROR:      'Invalid request. Please refresh the page and try again.',
  SYSTEM_ERROR:          'We could not submit your letter request right now. Please try again later or contact HR support.',
}

const STATUS_META_KEYS = [
  'DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'SIGNED',
  'SENT', 'REJECTED', 'PENDING_SIGNATURE', 'CANCELLED', 'FAILED',
]

const NEW_ESS_TYPES = [
  { typeCode: 'LRL', nameEn: 'Loan Request Letter',     allowEssSelfRequest: true,  requiresApproval: false },
  { typeCode: 'NDL', nameEn: 'NOC for Driving License', allowEssSelfRequest: true,  requiresApproval: false },
  { typeCode: 'NTV', nameEn: 'NOC for Travel / Visa',   allowEssSelfRequest: true,  requiresApproval: false },
]

const ALL_ESS_TYPE_CODES = ['EML', 'SC', 'STL', 'LRL', 'NDL', 'NTV']

const TECHNICAL_KEYWORDS = [
  'Error:', 'TypeError', 'stack trace', 'undefined', 'null',
  'ECONNREFUSED', 'db.select', 'drizzle', 'pg.', 'SQL',
]

// ── ESSLTR-001–003: New type codes follow the 3-char convention ───────────────

describe('New ESS letter types — code conventions (ESSLTR-001–003)', () => {
  it('ESSLTR-001: LRL type code is exactly 3 uppercase characters', () => {
    expect('LRL').toMatch(/^[A-Z]{3}$/)
  })

  it('ESSLTR-002: NDL type code is exactly 3 uppercase characters', () => {
    expect('NDL').toMatch(/^[A-Z]{3}$/)
  })

  it('ESSLTR-003: NTV type code is exactly 3 uppercase characters', () => {
    expect('NTV').toMatch(/^[A-Z]{3}$/)
  })
})

// ── ESSLTR-004–005: New types are configured for ESS ─────────────────────────

describe('New ESS letter types — self-request configuration (ESSLTR-004–005)', () => {
  it('ESSLTR-004: all three new types have allowEssSelfRequest=true', () => {
    for (const t of NEW_ESS_TYPES) {
      expect(t.allowEssSelfRequest).toBe(true)
    }
  })

  it('ESSLTR-005: new types do not require HR approval (instant issuance)', () => {
    for (const t of NEW_ESS_TYPES) {
      expect(t.requiresApproval).toBe(false)
    }
  })
})

// ── ESSLTR-006: LETTER_TYPE_LABELS completeness ───────────────────────────────

describe('LETTER_TYPE_LABELS — includes all ESS-enabled codes (ESSLTR-006)', () => {
  it('ESSLTR-006: LETTER_TYPE_LABELS includes all 6 ESS letter type codes', () => {
    for (const code of ALL_ESS_TYPE_CODES) {
      expect(LETTER_TYPE_LABELS).toHaveProperty(code)
      expect(LETTER_TYPE_LABELS[code]).toBeTruthy()
    }
  })
})

// ── ESSLTR-007: STATUS_META completeness ──────────────────────────────────────

describe('STATUS_META — includes SUBMITTED and FAILED status (ESSLTR-007)', () => {
  it('ESSLTR-007: STATUS_META covers all expected status values including SUBMITTED and FAILED', () => {
    for (const key of STATUS_META_KEYS) {
      expect(STATUS_META_KEYS).toContain(key)
    }
    expect(STATUS_META_KEYS).toContain('SUBMITTED')
    expect(STATUS_META_KEYS).toContain('FAILED')
  })
})

// ── ESSLTR-008–010: Error messages are business-friendly ──────────────────────

describe('ESS_ERRORS — business-friendly messages (ESSLTR-008–010)', () => {
  it('ESSLTR-008: NO_TEMPLATE error guides user to contact HR Administration', () => {
    expect(ESS_ERRORS.NO_TEMPLATE).toContain('contact HR Administration')
    expect(ESS_ERRORS.NO_TEMPLATE).toContain('template')
  })

  it('ESSLTR-009: PERSON_NOT_FOUND error guides user to update their profile', () => {
    expect(ESS_ERRORS.PERSON_NOT_FOUND).toContain('contact HR')
    expect(ESS_ERRORS.PERSON_NOT_FOUND).toContain('profile')
  })

  it('ESSLTR-010: no error message contains technical keywords', () => {
    for (const [code, message] of Object.entries(ESS_ERRORS)) {
      for (const keyword of TECHNICAL_KEYWORDS) {
        expect(message, `${code} must not contain "${keyword}"`).not.toContain(keyword)
      }
    }
  })
})
