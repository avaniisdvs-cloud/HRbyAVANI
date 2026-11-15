/**
 * Document Management v2 — Unit Tests
 * DMG-001–030: taxonomy, permissions, expiry, categories
 */
import { describe, it, expect, vi } from 'vitest'

// get-employee-documents.ts imports db at module level; mock it so pure helpers
// (computeDocumentAnalytics) can be tested without a real DB connection.
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))
import {
  DOCUMENT_TYPES,
  EMPLOYEE_UPLOADABLE_TYPES,
  HR_UPLOADABLE_TYPES,
  PAYROLL_GENERATED_TYPES,
  EXPIRY_TRACKED_TYPES,
  ALL_DOCUMENT_TYPE_CODES,
  EMPLOYEE_VISIBLE_TYPES,
  getDocTypeDef,
  getDocTypeLabel,
  getDocTypeLabelAr,
  getDocTypeCategory,
  computeDocumentStatus,
  daysUntilExpiry,
  EXPIRY_WARN_DAYS,
} from '@/lib/documents/document-types'
import {
  computeDocumentAnalytics,
  type EmployeeDocumentRow,
} from '@/lib/documents/get-employee-documents'

// ── DMG-001–010: Taxonomy completeness ───────────────────────────────────────

describe('Document taxonomy', () => {
  it('DMG-001 — all entries have required fields', () => {
    for (const t of DOCUMENT_TYPES) {
      expect(t.code,       `${t.code} missing code`).toBeTruthy()
      expect(t.labelEn,    `${t.code} missing labelEn`).toBeTruthy()
      expect(t.labelAr,    `${t.code} missing labelAr`).toBeTruthy()
      expect(t.category,   `${t.code} missing category`).toBeTruthy()
      expect(t.sourceType, `${t.code} missing sourceType`).toBeTruthy()
    }
  })

  it('DMG-002 — no duplicate type codes', () => {
    const codes = DOCUMENT_TYPES.map(t => t.code)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })

  it('DMG-003 — identity documents are employee-uploadable', () => {
    const identityTypes = ['PASSPORT', 'EMIRATES_ID', 'VISA', 'DRIVING_LICENSE']
    for (const code of identityTypes) {
      expect(EMPLOYEE_UPLOADABLE_TYPES, `${code} should be employee-uploadable`)
        .toContain(code)
    }
  })

  it('DMG-004 — PAYSLIP and WPS_STATEMENT are NOT employee-uploadable', () => {
    expect(EMPLOYEE_UPLOADABLE_TYPES).not.toContain('PAYSLIP')
    expect(EMPLOYEE_UPLOADABLE_TYPES).not.toContain('WPS_STATEMENT')
  })

  it('DMG-005 — PAYSLIP and WPS_STATEMENT are payroll-generated', () => {
    expect(PAYROLL_GENERATED_TYPES).toContain('PAYSLIP')
    expect(PAYROLL_GENERATED_TYPES).toContain('WPS_STATEMENT')
  })

  it('DMG-006 — payroll-generated types are NOT HR-uploadable', () => {
    for (const code of PAYROLL_GENERATED_TYPES) {
      expect(HR_UPLOADABLE_TYPES).not.toContain(code)
    }
  })

  it('DMG-007 — expiry-tracked types include critical identity docs', () => {
    const critical = ['PASSPORT', 'EMIRATES_ID', 'VISA']
    for (const code of critical) {
      expect(EXPIRY_TRACKED_TYPES, `${code} should be expiry-tracked`).toContain(code)
    }
  })

  it('DMG-008 — WARNING_LETTER and DISCIPLINARY_ACTION are HR-only visibility', () => {
    const wl = getDocTypeDef('WARNING_LETTER')
    const da = getDocTypeDef('DISCIPLINARY_ACTION')
    expect(wl?.hrOnlyDefault).toBe(true)
    expect(da?.hrOnlyDefault).toBe(true)
  })

  it('DMG-009 — getDocTypeLabel returns friendly name', () => {
    expect(getDocTypeLabel('PASSPORT')).toBe('Passport')
    expect(getDocTypeLabel('EMIRATES_ID')).toBe('Emirates ID')
    expect(getDocTypeLabel('UNKNOWN_CODE')).toMatch(/UNKNOWN/)  // underscores replaced with spaces
  })

  it('DMG-010 — getDocTypeLabelAr returns Arabic label', () => {
    const ar = getDocTypeLabelAr('PASSPORT')
    expect(ar).toBeTruthy()
    expect(ar).not.toBe('Passport')  // must not return English
  })
})

// ── DMG-011–015: Category assignment ─────────────────────────────────────────

describe('Document categories', () => {
  it('DMG-011 — identity documents map to IDENTITY category', () => {
    expect(getDocTypeCategory('PASSPORT')).toBe('IDENTITY')
    expect(getDocTypeCategory('EMIRATES_ID')).toBe('IDENTITY')
    expect(getDocTypeCategory('VISA')).toBe('IDENTITY')
    expect(getDocTypeCategory('DRIVING_LICENSE')).toBe('IDENTITY')
  })

  it('DMG-012 — payslip maps to PAYROLL category', () => {
    expect(getDocTypeCategory('PAYSLIP')).toBe('PAYROLL')
    expect(getDocTypeCategory('WPS_STATEMENT')).toBe('PAYROLL')
  })

  it('DMG-013 — contracts map to EMPLOYMENT category', () => {
    expect(getDocTypeCategory('CONTRACT')).toBe('EMPLOYMENT')
    expect(getDocTypeCategory('OFFER_LETTER')).toBe('EMPLOYMENT')
    expect(getDocTypeCategory('PROMOTION_LETTER')).toBe('EMPLOYMENT')
  })

  it('DMG-014 — unknown codes default to SUPPORTING', () => {
    expect(getDocTypeCategory('NONEXISTENT_TYPE')).toBe('SUPPORTING')
  })

  it('DMG-015 — banking documents map to BANKING category', () => {
    expect(getDocTypeCategory('BANK_IBAN_LETTER')).toBe('BANKING')
    expect(getDocTypeCategory('SALARY_TRANSFER_LETTER')).toBe('BANKING')
  })
})

// ── DMG-016–022: Expiry status computation ────────────────────────────────────

describe('computeDocumentStatus', () => {
  const today  = new Date()
  const fmt    = (d: Date) => d.toISOString().slice(0, 10)
  const addDays = (d: Date, n: number) => {
    const r = new Date(d); r.setDate(r.getDate() + n); return r
  }

  it('DMG-016 — past date returns EXPIRED', () => {
    const past = fmt(addDays(today, -1))
    expect(computeDocumentStatus('VALID', past)).toBe('EXPIRED')
  })

  it('DMG-017 — date beyond warn threshold returns VALID', () => {
    const future = fmt(addDays(today, EXPIRY_WARN_DAYS + 5))
    expect(computeDocumentStatus('VALID', future)).toBe('VALID')
  })

  it('DMG-018 — date within warn threshold returns EXPIRING_SOON', () => {
    const soon = fmt(addDays(today, EXPIRY_WARN_DAYS - 10))
    expect(computeDocumentStatus('VALID', soon)).toBe('EXPIRING_SOON')
  })

  it('DMG-019 — today returns EXPIRING_SOON (0 days left)', () => {
    expect(computeDocumentStatus('VALID', fmt(today))).toBe('EXPIRING_SOON')
  })

  it('DMG-020 — null expiry returns original DB status', () => {
    expect(computeDocumentStatus('VALID',  null)).toBe('VALID')
    expect(computeDocumentStatus('CANCELLED', null)).toBe('CANCELLED')
  })

  it('DMG-021 — daysUntilExpiry returns correct days', () => {
    const tomorrow = fmt(addDays(today, 1))
    const days     = daysUntilExpiry(tomorrow)
    expect(days).toBe(1)
  })

  it('DMG-022 — daysUntilExpiry returns null for null input', () => {
    expect(daysUntilExpiry(null)).toBeNull()
  })
})

// ── DMG-023–030: Analytics computation ───────────────────────────────────────

describe('computeDocumentAnalytics', () => {
  const today   = new Date()
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
  const fmt     = (d: Date) => d.toISOString().slice(0, 10)

  function makeDoc(overrides: Partial<EmployeeDocumentRow>): EmployeeDocumentRow {
    return {
      id:               '00000000-0000-0000-0000-000000000001',
      source:           'PERSON_DOCUMENT',
      typeCode:         'PASSPORT',
      typeLabelEn:      'Passport',
      category:         'IDENTITY',
      title:            'Passport',
      documentNumber:   null,
      issuedDate:       null,
      expiryDate:       null,
      status:           'VALID',
      sourceType:       'EMPLOYEE',
      employeeCanReplace: true,
      hrOnlyVisibility: false,
      uploadedByName:   null,
      uploadedAt:       null,
      fileSizeBytes:    0,
      mimeType:         null,
      canView:          true,
      canDownload:      true,
      canEdit:          true,
      canDelete:        true,
      ...overrides,
    }
  }

  it('DMG-023 — counts total correctly', () => {
    const docs = [makeDoc({}), makeDoc({ id: '00000000-0000-0000-0000-000000000002' })]
    const a    = computeDocumentAnalytics(docs)
    expect(a.total).toBe(2)
  })

  it('DMG-024 — valid count excludes non-VALID docs', () => {
    const docs = [
      makeDoc({ status: 'VALID' }),
      makeDoc({ id: '00000000-0000-0000-0000-000000000002', status: 'EXPIRED' }),
    ]
    const a = computeDocumentAnalytics(docs)
    expect(a.valid).toBe(1)
    expect(a.expired).toBe(1)
  })

  it('DMG-025 — expiringSoon counts EXPIRING_SOON status', () => {
    const docs = [makeDoc({ status: 'EXPIRING_SOON' })]
    const a    = computeDocumentAnalytics(docs)
    expect(a.expiringSoon).toBe(1)
  })

  it('DMG-026 — SIGNED_LETTER source excluded from person doc counts', () => {
    const docs = [
      makeDoc({ status: 'VALID' }),
      makeDoc({ id: '00000000-0000-0000-0000-000000000002', source: 'SIGNED_LETTER', status: 'SIGNED' }),
    ]
    const a = computeDocumentAnalytics(docs)
    // total includes both sources but valid/expired only count PERSON_DOCUMENT
    expect(a.total).toBe(2)
    expect(a.valid).toBe(1)
  })

  it('DMG-027 — missing mandatory documents detected', () => {
    const docs: EmployeeDocumentRow[] = []  // no docs
    const a = computeDocumentAnalytics(docs)
    expect(a.missingMandatory.length).toBeGreaterThan(0)
    expect(a.missingMandatory).toContain('PASSPORT')
  })

  it('DMG-028 — present mandatory docs removed from missing list', () => {
    const docs = [makeDoc({ typeCode: 'PASSPORT' })]
    const a    = computeDocumentAnalytics(docs)
    expect(a.missingMandatory).not.toContain('PASSPORT')
  })

  it('DMG-029 — compliance docs include PASSPORT expiry', () => {
    const expiryDate = fmt(addDays(today, 45))
    const docs = [makeDoc({ typeCode: 'PASSPORT', expiryDate, status: 'EXPIRING_SOON' })]
    const a    = computeDocumentAnalytics(docs)
    const passportEntry = a.complianceDocs.find(c => c.typeCode === 'PASSPORT')
    expect(passportEntry).toBeDefined()
    expect(passportEntry!.daysLeft).toBeGreaterThanOrEqual(44)
    expect(passportEntry!.daysLeft).toBeLessThanOrEqual(46)
  })

  it('DMG-030 — missing compliance docs show MISSING status', () => {
    const docs: EmployeeDocumentRow[] = []
    const a   = computeDocumentAnalytics(docs)
    const passportEntry = a.complianceDocs.find(c => c.typeCode === 'PASSPORT')
    expect(passportEntry?.status).toBe('MISSING')
  })
})
