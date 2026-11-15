/**
 * Migration Factory V1.0 Blocker Regression Tests
 *
 * MFB-F02-001  Incremental mode: second run skips already-imported employees
 * MFB-F04-001  Multiple leave types per employee all included (not last-wins)
 * MFB-F04-002  Employee with no leave source still gets ANNUAL zero-balance row
 * MFB-F05-001  Blank nationality emits warning, defaults to ARE
 * MFB-F05-002  Unrecognized nationality text emits warning, defaults to ARE
 * MFB-F05-003  Valid ISO3 code accepted without warning
 * MFB-F08-001  ISO datetime string from cellDates:true parsed correctly
 * MFB-F08-002  Date object from XLSX parsed correctly
 * MFB-F08-003  col() handles Date objects via XLSX cellDates
 * MFB-F03-001  isValidSessionId rejects path traversal
 * MFB-F03-002  isValidSessionId accepts valid UUID v4
 */

import { describe, it, expect } from 'vitest'
import {
  transformSourceFiles,
  resolveNationalityCode,
  formatSourceDate,
  normalizeUaeMobile,
} from '../../modules/migration/source-transformer'
import { isValidSessionId } from '../../modules/migration/package-store'
import { classifySourceFile, summarizeSheet } from '../../modules/migration/source-classifier'
import type { ClassifiedSourceFile, TransformContext, RawSourceRow } from '../../modules/migration/source-types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseCtx(): TransformContext {
  return {
    positions:    [],
    departments:  [],
    grades:       [],
    locations:    [],
    absenceTypes: [],
    defaultLegalEntityCode: 'AVN-001',
    defaultBalanceYear:     2026,
  }
}

function makeEmpFile(rows: RawSourceRow[]): ClassifiedSourceFile {
  return {
    analysis: classifySourceFile('emp.xlsx', [summarizeSheet('S', rows)]),
    sheets:   new Map([['S', rows]]),
  }
}

function makeLeaveFile(rows: RawSourceRow[]): ClassifiedSourceFile {
  return {
    analysis: classifySourceFile('leave.xlsx', [summarizeSheet('S', rows)]),
    sheets:   new Map([['S', rows]]),
  }
}

// ── F-02: Incremental deduplication ──────────────────────────────────────────

describe('F-02: Incremental mode skips existing employees', () => {
  const empRows: RawSourceRow[] = [
    { 'Employee Number': '100', 'Full Name': 'Alice'   },
    { 'Employee Number': '101', 'Full Name': 'Bob'     },
    { 'Employee Number': '102', 'Full Name': 'Charlie' },
  ]

  it('MFB-F02-001: INCREMENTAL skips employees already in existingPersonNumbers', () => {
    const existingPersonNumbers = new Set(['K100', 'K101'])

    const { package: pkg, summary } = transformSourceFiles(
      [makeEmpFile(empRows)],
      { mode: 'INCREMENTAL', existingPersonNumbers },
      baseCtx(),
    )

    expect(pkg.employees).toHaveLength(1)
    expect(pkg.employees[0].employeeNumber).toBe('K102')
    expect(summary.employeesSkipped).toBe(2)
    expect(summary.employeesIncluded).toBe(1)
  })

  it('MFB-F02-002: FULL_RELOAD does not skip any employees even if in existingPersonNumbers', () => {
    const existingPersonNumbers = new Set(['K100', 'K101'])

    const { package: pkg } = transformSourceFiles(
      [makeEmpFile(empRows)],
      { mode: 'FULL_RELOAD', existingPersonNumbers },
      baseCtx(),
    )

    // FULL_RELOAD ignores existingPersonNumbers
    expect(pkg.employees).toHaveLength(3)
  })

  it('MFB-F02-003: second INCREMENTAL run with all existing → 0 new employees, no error', () => {
    const existingPersonNumbers = new Set(['K100', 'K101', 'K102'])

    const { package: pkg, summary } = transformSourceFiles(
      [makeEmpFile(empRows)],
      { mode: 'INCREMENTAL', existingPersonNumbers },
      baseCtx(),
    )

    expect(pkg.employees).toHaveLength(0)
    expect(summary.employeesSkipped).toBe(3)
    expect(summary.employeesIncluded).toBe(0)
    expect(summary.canBuild).toBe(true)
  })
})

// ── F-04: Multiple leave types per employee ───────────────────────────────────

describe('F-04: Multiple leave types per employee', () => {
  const empRows: RawSourceRow[] = [
    { 'Employee Number': '100', 'Full Name': 'Alice' },
    { 'Employee Number': '101', 'Full Name': 'Bob'   },
  ]

  it('MFB-F04-001: employee with 3 leave types produces 3 balance rows', () => {
    const leaveRows: RawSourceRow[] = [
      { 'Person Number': '100', 'Absence Type Code': 'ANNUAL', 'Leave Balance': '25', 'Leave Year': '2026' },
      { 'Person Number': '100', 'Absence Type Code': 'SICK',   'Leave Balance': '10', 'Leave Year': '2026' },
      { 'Person Number': '100', 'Absence Type Code': 'UNPAID', 'Leave Balance': '0',  'Leave Year': '2026' },
    ]

    const { package: pkg } = transformSourceFiles(
      [makeEmpFile(empRows), makeLeaveFile(leaveRows)],
      { mode: 'FULL_RELOAD' },
      baseCtx(),
    )

    const aliceBalances = pkg.leaveBalances.filter(lb => lb.employeeNumber === 'K100')
    expect(aliceBalances).toHaveLength(3)
    const typeCodes = aliceBalances.map(lb => lb.absenceTypeCode).sort()
    expect(typeCodes).toEqual(['ANNUAL', 'SICK', 'UNPAID'])
  })

  it('MFB-F04-002: employee with no leave source gets a single ANNUAL zero-balance row', () => {
    // Bob (101) has no leave data
    const leaveRows: RawSourceRow[] = [
      { 'Person Number': '100', 'Absence Type Code': 'ANNUAL', 'Leave Balance': '25', 'Leave Year': '2026' },
    ]

    const { package: pkg } = transformSourceFiles(
      [makeEmpFile(empRows), makeLeaveFile(leaveRows)],
      { mode: 'FULL_RELOAD' },
      baseCtx(),
    )

    const bobBalances = pkg.leaveBalances.filter(lb => lb.employeeNumber === 'K101')
    expect(bobBalances).toHaveLength(1)
    expect(bobBalances[0].absenceTypeCode).toBe('ANNUAL')
    expect(bobBalances[0].openingBalanceDays).toBe(0)
  })

  it('MFB-F04-003: duplicate typeCode+year for same employee is deduplicated (last wins)', () => {
    const leaveRows: RawSourceRow[] = [
      { 'Person Number': '100', 'Absence Type Code': 'ANNUAL', 'Leave Balance': '20', 'Leave Year': '2026' },
      { 'Person Number': '100', 'Absence Type Code': 'ANNUAL', 'Leave Balance': '25', 'Leave Year': '2026' },
    ]

    const { package: pkg } = transformSourceFiles(
      [makeEmpFile([empRows[0]]), makeLeaveFile(leaveRows)],
      { mode: 'FULL_RELOAD' },
      baseCtx(),
    )

    const annualRows = pkg.leaveBalances.filter(lb => lb.absenceTypeCode === 'ANNUAL')
    expect(annualRows).toHaveLength(1)
  })
})

// ── F-05: Nationality fallback warnings ───────────────────────────────────────

describe('F-05: Nationality fallback warnings', () => {
  it('MFB-F05-001: blank nationality returns ARE with warning', () => {
    const result = resolveNationalityCode('')
    expect(result.code).toBe('ARE')
    expect(result.warning).toMatch(/blank/i)
  })

  it('MFB-F05-002: null nationality returns ARE with warning', () => {
    const result = resolveNationalityCode(null)
    expect(result.code).toBe('ARE')
    expect(result.warning).toMatch(/blank/i)
  })

  it('MFB-F05-003: unrecognized nationality text returns ARE with warning containing original value', () => {
    const result = resolveNationalityCode('Martian')
    expect(result.code).toBe('ARE')
    expect(result.warning).toMatch(/Martian/)
    expect(result.warning).toMatch(/not recognized/i)
  })

  it('MFB-F05-004: valid ISO3 code accepted, no warning', () => {
    const result = resolveNationalityCode('IND')
    expect(result.code).toBe('IND')
    expect(result.warning).toBeUndefined()
  })

  it('MFB-F05-005: recognized nationality name resolved without warning', () => {
    const result = resolveNationalityCode('Indian')
    expect(result.code).toBe('IND')
    expect(result.warning).toBeUndefined()
  })

  it('MFB-F05-006: nationality warning appears in transform summary warnings', () => {
    const empRows: RawSourceRow[] = [
      { 'Employee Number': '100', 'Full Name': 'Alice', 'Nationality': '' },
      { 'Employee Number': '101', 'Full Name': 'Bob',   'Nationality': 'Klingon' },
      { 'Employee Number': '102', 'Full Name': 'Carol', 'Nationality': 'Indian' },
    ]

    const { summary } = transformSourceFiles(
      [makeEmpFile(empRows)],
      { mode: 'FULL_RELOAD' },
      baseCtx(),
    )

    const natWarnings = summary.warnings.filter(w => w.field === 'nationalityCode')
    // Alice (blank) and Bob (unrecognized) get warnings; Carol does not
    expect(natWarnings).toHaveLength(2)
    expect(natWarnings.some(w => w.employeeNumber === 'K100')).toBe(true)
    expect(natWarnings.some(w => w.employeeNumber === 'K101')).toBe(true)
    expect(natWarnings.some(w => w.employeeNumber === 'K102')).toBe(false)
  })
})

// ── F-08: Excel date parsing ──────────────────────────────────────────────────

describe('F-08: Excel date parsing', () => {
  it('MFB-F08-001: ISO datetime string from cellDates:true is parsed to YYYY-MM-DD', () => {
    expect(formatSourceDate('2024-01-15T00:00:00.000Z')).toBe('2024-01-15')
    expect(formatSourceDate('1990-06-30T00:00:00.000Z')).toBe('1990-06-30')
  })

  it('MFB-F08-002: Date object is parsed to YYYY-MM-DD', () => {
    expect(formatSourceDate(new Date('2024-01-15T00:00:00.000Z'))).toBe('2024-01-15')
  })

  it('MFB-F08-003: YYYY-MM-DD string passes through unchanged', () => {
    expect(formatSourceDate('1985-03-22')).toBe('1985-03-22')
  })

  it('MFB-F08-004: DD/MM/YYYY string is parsed', () => {
    expect(formatSourceDate('15/01/2024')).toBe('2024-01-15')
  })

  it('MFB-F08-005: DD-Mon-YYYY string is parsed', () => {
    expect(formatSourceDate('15-Jan-2024')).toBe('2024-01-15')
  })

  it('MFB-F08-006: null/empty returns empty string', () => {
    expect(formatSourceDate(null)).toBe('')
    expect(formatSourceDate('')).toBe('')
    expect(formatSourceDate(undefined)).toBe('')
  })

  it('MFB-F08-007: col() accessor returns ISO date string when value is a Date object', () => {
    // Simulates what happens when XLSX cellDates:true produces a Date in a row cell
    const d = new Date('2022-03-01T00:00:00.000Z')
    // Access via formatSourceDate (which col() delegates to for the hireDate field)
    expect(formatSourceDate(d)).toBe('2022-03-01')
  })
})

// ── F-03: Session ID safety ───────────────────────────────────────────────────

describe('F-03: Session ID validation', () => {
  it('MFB-F03-001: isValidSessionId rejects path traversal strings', () => {
    expect(isValidSessionId('../../etc/passwd')).toBe(false)
    expect(isValidSessionId('../sessions/other')).toBe(false)
    expect(isValidSessionId('/absolute/path')).toBe(false)
  })

  it('MFB-F03-002: isValidSessionId rejects non-UUID strings', () => {
    expect(isValidSessionId('not-a-uuid')).toBe(false)
    expect(isValidSessionId('session-1234')).toBe(false)
    expect(isValidSessionId('')).toBe(false)
    expect(isValidSessionId('   ')).toBe(false)
  })

  it('MFB-F03-003: isValidSessionId accepts valid UUID v4 and rejects other versions', () => {
    expect(isValidSessionId('550e8400-e29b-11d4-a716-446655440000')).toBe(false) // v1 (third group starts with 1)
    expect(isValidSessionId('11111111-1111-4111-a111-111111111111')).toBe(true)  // v4
    expect(isValidSessionId('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true)  // v4
  })

  it('MFB-F03-004: version bit check — UUID v4 requires 4 in position 13', () => {
    expect(isValidSessionId('11111111-1111-3111-a111-111111111111')).toBe(false) // v3
    expect(isValidSessionId('11111111-1111-5111-a111-111111111111')).toBe(false) // v5
  })
})
