/**
 * Phase A — Source file ingestion tests.
 *
 * Tests cover:
 *   SCI-001–007  Source classifier
 *   SMN-001–008  UAE mobile normalization
 *   STR-001–010  Transformer: employees / managers / leave balances / dept heads
 *   SIL-001–003  Incremental load dedup
 *   SUK-001–002  Unknown file handling
 *   SPK-001–002  71-employee full package build (synthetic data)
 */

import { describe, it, expect } from 'vitest'
import { classifySourceFile, summarizeSheet, effectiveType } from '../../modules/migration/source-classifier'
import {
  normalizeUaeMobile, formatSourceDate, resolveNationalityCode, transformSourceFiles,
} from '../../modules/migration/source-transformer'
import type {
  ClassifiedSourceFile, TransformContext, TransformOptions, SheetSummary,
} from '../../modules/migration/source-types'

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { RawSourceRow } from '../../modules/migration/source-types'

function makeFile(
  analysis: ReturnType<typeof classifySourceFile>,
  rowsBySheet: Record<string, Record<string, unknown>[]>,
): ClassifiedSourceFile {
  const sheets = new Map<string, RawSourceRow[]>()
  for (const [name, rows] of Object.entries(rowsBySheet)) {
    sheets.set(name, rows as RawSourceRow[])
  }
  return { analysis, sheets }
}

function baseContext(overrides?: Partial<TransformContext>): TransformContext {
  return {
    positions: [
      { code: 'TEC-P001', titleEn: 'Director of Technology & Innovation' },
      { code: 'TEC-P004', titleEn: 'Enterprise Systems Manager' },
      { code: 'COR-P001', titleEn: 'Chief Executive Officer & Strategic Leader' },
    ],
    departments: [
      { code: 'KPD-DP-004', nameEn: 'Technology & Digital Transformation' },
      { code: 'KPD-DP-006', nameEn: 'Corporate Services & Governance' },
    ],
    grades:       [{ code: 'KPD-G-01' }],
    locations:    [{ code: 'KPD-LOC-01' }],
    absenceTypes: [{ code: 'ANNUAL' }],
    defaultGradeCode:       'KPD-G-01',
    defaultLocationCode:    'KPD-LOC-01',
    defaultLegalEntityCode: 'AVN-001',
    defaultBalanceYear:     2026,
    ...overrides,
  }
}

function fullReloadOpts(): TransformOptions {
  return { mode: 'FULL_RELOAD' }
}

// ── SCI — Source Classifier ───────────────────────────────────────────────────

describe('Source classifier', () => {
  it('SCI-001: classifies Employee Master by required columns', () => {
    const sheets: SheetSummary[] = [{
      name: 'Sheet1',
      rowCount: 71,
      columns: ['Employee Number', 'Full Name', 'Date of Birth', 'Nationality', 'Passport Number', 'Gender'],
    }]
    const result = classifySourceFile('04 Employee Master.xlsx', sheets)
    expect(result.detectedType).toBe('EMPLOYEE_MASTER')
    expect(result.confidence).not.toBe('LOW')
    expect(result.issues).toHaveLength(0)
  })

  it('SCI-002: classifies Employee Assignments by required columns', () => {
    const sheets: SheetSummary[] = [{
      name: 'Sheet1',
      rowCount: 71,
      columns: ['Employee ID', 'Department', 'Contract Start Date', 'Assignment Category', 'Line Manager ID'],
    }]
    const result = classifySourceFile('02 Employee Assignments.xlsx', sheets)
    expect(result.detectedType).toBe('EMPLOYEE_ASSIGNMENTS')
  })

  it('SCI-003: classifies Leave Balances by required columns + file name', () => {
    const sheets: SheetSummary[] = [{
      name: 'Sheet1',
      rowCount: 71,
      columns: ['Person Number', 'Leave Balance', 'Leave Year'],
    }]
    const result = classifySourceFile('04.1 Employee Leave Balance.xlsx', sheets)
    expect(result.detectedType).toBe('LEAVE_BALANCES')
  })

  it('SCI-004: classifies Users Data by USERNAME column', () => {
    const sheets: SheetSummary[] = [{
      name: 'Sheet1',
      rowCount: 60,
      columns: ['USERNAME', 'Email', 'Role'],
    }]
    const result = classifySourceFile('06 Users Data.xlsx', sheets)
    expect(result.detectedType).toBe('USERS_DATA')
  })

  it('SCI-005: classifies Position Mapping by New Position column', () => {
    const sheets: SheetSummary[] = [{
      name: 'Sheet1',
      rowCount: 71,
      columns: ['ID', 'New Position', 'Old Position'],
    }]
    const result = classifySourceFile('05 Mapping Old Position New Position.xlsx', sheets)
    expect(result.detectedType).toBe('POSITION_MAPPING')
  })

  it('SCI-006: classifies Manager Hierarchy by Manager Employee Number column', () => {
    const sheets: SheetSummary[] = [{
      name: 'Managers',
      rowCount: 70,
      columns: ['Employee Number', 'Manager Employee Number'],
    }]
    const result = classifySourceFile('managers.xlsx', sheets)
    expect(result.detectedType).toBe('MANAGER_HIERARCHY')
  })

  it('SCI-007: returns UNKNOWN with a warning for an unrecognised file', () => {
    const sheets: SheetSummary[] = [{
      name: 'Sheet1',
      rowCount: 10,
      columns: ['Foo', 'Bar', 'Baz'],
    }]
    const result = classifySourceFile('random-export.xlsx', sheets)
    expect(result.detectedType).toBe('UNKNOWN')
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('Could not auto-classify')
  })
})

// ── SMN — Mobile Normalization ────────────────────────────────────────────────

describe('UAE mobile normalization', () => {
  it('SMN-001: passes through already-formatted +971 number', () => {
    expect(normalizeUaeMobile('+97150123456')).toBe('+97150123456')
  })

  it('SMN-002: normalizes 971 prefix to +971', () => {
    expect(normalizeUaeMobile('97150123456')).toBe('+97150123456')
  })

  it('SMN-003: normalizes 05x format to +9715x', () => {
    expect(normalizeUaeMobile('0501234567')).toBe('+971501234567')
  })

  it('SMN-004: normalizes local 9-digit starting with 5 to +971', () => {
    expect(normalizeUaeMobile('501234567')).toBe('+971501234567')
  })

  it('SMN-005: strips spaces and hyphens before normalizing', () => {
    expect(normalizeUaeMobile('050 123 4567')).toBe('+971501234567')
    // +971-50-123-4567 → stripped → +971501234567 (9 digits after +971)
    expect(normalizeUaeMobile('+971-50-123-4567')).toBe('+971501234567')
  })

  it('SMN-006: returns empty string for null / empty input', () => {
    expect(normalizeUaeMobile(null)).toBe('')
    expect(normalizeUaeMobile('')).toBe('')
    expect(normalizeUaeMobile(undefined)).toBe('')
  })

  it('SMN-007: returns original for unrecognised format (validator will flag it)', () => {
    const result = normalizeUaeMobile('+441234567890')
    expect(result).toBe('+441234567890')
  })

  it('SMN-008: normalizes local 8-digit starting with 4 (landline-like) unchanged', () => {
    // 4-starting 8-digit does not match UAE mobile pattern — returned as-is
    const result = normalizeUaeMobile('41234567')
    expect(result).toBe('41234567')
  })
})

// ── STR — Transformer core ────────────────────────────────────────────────────

describe('Source transformer — employees', () => {
  it('STR-001: builds employee rows from Employee Master', () => {
    const analysis = classifySourceFile('emp.xlsx', [summarizeSheet('Sheet1', [
      { 'Employee Number': '33', 'Full Name': 'Talal Al Gaddah', 'Nationality': 'Syrian', 'Gender': 'Male' },
    ])])
    const file = makeFile(analysis, {
      'Sheet1': [{ 'Employee Number': '33', 'Full Name': 'Talal Al Gaddah', 'Nationality': 'Syrian', 'Gender': 'Male' }],
    })
    const { package: pkg } = transformSourceFiles([file], fullReloadOpts(), baseContext())
    expect(pkg.employees).toHaveLength(1)
    expect(pkg.employees[0].employeeNumber).toBe('K33')
    expect(pkg.employees[0].fullNameEn).toBe('Talal Al Gaddah')
    expect(pkg.employees[0].nationalityCode).toBe('SYR')
    expect(pkg.employees[0].legalEntityCode).toBe('AVN-001')
  })

  it('STR-002: prefixes K to employee numbers that lack it', () => {
    const analysis = classifySourceFile('emp.xlsx', [summarizeSheet('Sheet1', [
      { 'Employee Number': '1207', 'Full Name': 'Test User' },
    ])])
    const file = makeFile(analysis, {
      'Sheet1': [{ 'Employee Number': '1207', 'Full Name': 'Test User' }],
    })
    const { package: pkg } = transformSourceFiles([file], fullReloadOpts(), baseContext())
    expect(pkg.employees[0].employeeNumber).toBe('K1207')
  })

  it('STR-003: does not double-prefix K', () => {
    const analysis = classifySourceFile('emp.xlsx', [summarizeSheet('Sheet1', [
      { 'Employee Number': 'K33', 'Full Name': 'Already Prefixed' },
    ])])
    const file = makeFile(analysis, {
      'Sheet1': [{ 'Employee Number': 'K33', 'Full Name': 'Already Prefixed' }],
    })
    const { package: pkg } = transformSourceFiles([file], fullReloadOpts(), baseContext())
    expect(pkg.employees[0].employeeNumber).toBe('K33')
  })

  it('STR-004: merges assignment data (dept, contract dates, employment type)', () => {
    const empRows = [{ 'Employee Number': '33', 'Full Name': 'Talal Al Gaddah' }]
    const asnRows = [{
      'Employee ID': '33',
      'Department': 'Technology & Digital Transformation',
      'Contract Start Date': '01-Jan-2020',
      'Contract End Date': '31-Dec-2026',
    }]
    const empAnalysis = classifySourceFile('emp.xlsx', [summarizeSheet('Emp', empRows)])
    const asnAnalysis = classifySourceFile('asn.xlsx', [summarizeSheet('Asn', asnRows)])
    const empFile = makeFile(empAnalysis, { 'Emp': empRows })
    const asnFile = makeFile(asnAnalysis, { 'Asn': asnRows })
    const { package: pkg } = transformSourceFiles([empFile, asnFile], fullReloadOpts(), baseContext())
    const emp = pkg.employees[0]
    expect(emp.departmentCode).toBe('KPD-DP-004')
    expect(emp.contractStartDate).toBe('2020-01-01')
    expect(emp.contractEndDate).toBe('2026-12-31')
  })

  it('STR-005: normalizes UAE mobile in employee output', () => {
    const rows = [{ 'Employee Number': '33', 'Full Name': 'Test', 'Work Mobile Phone Number': '0501234567' }]
    const analysis = classifySourceFile('emp.xlsx', [summarizeSheet('Sheet1', rows)])
    const file = makeFile(analysis, { 'Sheet1': rows })
    const { package: pkg, summary } = transformSourceFiles([file], fullReloadOpts(), baseContext())
    expect(pkg.employees[0].mobile).toBe('+971501234567')
    expect(summary.mobileNormalized).toBeGreaterThan(0)
  })

  it('STR-006: resolves position from POSITION_MAPPING file via per-employee ID lookup', () => {
    // Real source data pattern: employee ID → position title → code
    const empRows = [{ 'Employee Number': '1207', 'Full Name': 'Dorababu' }]
    const posRows = [{ 'ID': '1207', 'New Position': 'Enterprise Systems Manager' }]
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const posFile = makeFile(classifySourceFile('05 Mapping Old Position New Position.xlsx', [summarizeSheet('S', posRows)]), { 'S': posRows })
    const { package: pkg, summary } = transformSourceFiles([empFile, posFile], fullReloadOpts(), baseContext())
    expect(pkg.employees[0].positionCode).toBe('TEC-P004')
    expect(summary.positionsFromMapping).toBe(1)
  })

  it('STR-006b: em/en dash in position mapping title matches ASCII-hyphen DB title', () => {
    // Regression for K938 (Salma Faraji):
    // mapping file uses em dash "–" (U+2013); DB stores ASCII hyphen "-"
    const empRows = [{ 'Employee Number': '938', 'Full Name': 'Salma Faraji' }]
    const posRows = [{ 'ID': '938', 'New Position': 'Senior Portfolio Manager – CRM & Collections' }]
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const posFile = makeFile(classifySourceFile('05 Mapping Old Position New Position.xlsx', [summarizeSheet('S', posRows)]), { 'S': posRows })
    // DB title uses ASCII hyphen
    const ctx = baseContext({ positions: [{ code: 'COM-P001', titleEn: 'Senior Portfolio Manager - CRM & Collections' }] })
    const { package: pkg, summary } = transformSourceFiles([empFile, posFile], fullReloadOpts(), ctx)
    expect(pkg.employees[0].positionCode).toBe('COM-P001')
    expect(summary.positionsFromMapping).toBe(1)
  })

  it('STR-007: uses dept default when position title does not match any known code', () => {
    const empRows  = [{ 'Employee Number': '999', 'Full Name': 'Unknown Role' }]
    const asnRows  = [{ 'Employee ID': '999', 'Department': 'Technology & Digital Transformation' }]
    const posRows  = [{ 'ID': '999', 'New Position': 'Some Unknown Title' }]
    const empFile  = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const asnFile  = makeFile(classifySourceFile('asn.xlsx', [summarizeSheet('A', asnRows)]), { 'A': asnRows })
    const posFile  = makeFile(classifySourceFile('05 Mapping Old Position New Position.xlsx', [summarizeSheet('P', posRows)]), { 'P': posRows })
    const ctx      = baseContext({ departmentDefaultPositions: new Map([['KPD-DP-004', 'TEC-P009']]) })
    const { package: pkg, summary } = transformSourceFiles([empFile, asnFile, posFile], fullReloadOpts(), ctx)
    expect(pkg.employees[0].positionCode).toBe('TEC-P009')
    expect(summary.positionsFallback).toBe(1)
  })
})

// ── Dept head derivation from POSITION_CATALOG ────────────────────────────────

describe('Source transformer — dept head from position catalog', () => {
  it('DHC-001: derives dept head from "Position for HOD" = YES in position catalog', () => {
    const empRows = [
      { 'Employee Number': '33',   'Full Name': 'Talal' },   // CEO → COR-P001 (HOD of Corporate)
      { 'Employee Number': '1207', 'Full Name': 'Dorababu' }, // TEC-P004 (not HOD)
    ]
    const asnRows = [
      { 'Employee ID': '33',   'Department': 'Corporate Services & Governance', 'Position Title': 'Chief Executive Officer & Strategic Leader', 'Contract Start Date': '01-Jan-2016' },
      { 'Employee ID': '1207', 'Department': 'Technology & Digital Transformation', 'Position Title': 'Enterprise Systems Manager', 'Contract Start Date': '01-Jan-2019' },
    ]
    // Position mapping resolves each employee's position code
    const posRows = [
      { 'ID': '33',   'New Position': 'Chief Executive Officer & Strategic Leader' },
      { 'ID': '1207', 'New Position': 'Enterprise Systems Manager' },
    ]
    // Position catalog: COR-P001 is the HOD of Corporate Services
    const catRows = [
      { 'Position Code': 'COR-P001', 'Position for HOD': 'YES', 'Department': 'Corporate Services & Governance' },
      { 'Position Code': 'TEC-P004', 'Position for HOD': 'No',  'Department': 'Technology & Digital Transformation' },
    ]
    const empFile = makeFile(classifySourceFile('04 Employee Master.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const asnFile = makeFile(classifySourceFile('02 Employee Assignments.xlsx', [summarizeSheet('A', asnRows)]), { 'A': asnRows })
    const posFile = makeFile(classifySourceFile('05 Mapping Old Position New Position.xlsx', [summarizeSheet('P', posRows)]), { 'P': posRows })
    const catFile = makeFile(classifySourceFile('01 Positions Jobs Titles.xlsx', [summarizeSheet('C', catRows)]), { 'C': catRows })

    const { package: pkg } = transformSourceFiles([empFile, asnFile, posFile, catFile], fullReloadOpts(), baseContext())

    expect(pkg.deptHeads).toHaveLength(1)
    expect(pkg.deptHeads[0].departmentCode).toBe('KPD-DP-006')
    expect(pkg.deptHeads[0].headEmployeeNumber).toBe('K33')
  })

  it('DHC-002: position catalog file classifies as POSITION_CATALOG', () => {
    const catRows = [{ 'Position Code': 'COR-P001', 'Position for HOD': 'YES', 'Department': 'Corp' }]
    const analysis = classifySourceFile('01 Positions Jobs Titles.xlsx', [summarizeSheet('C', catRows)])
    expect(analysis.detectedType).toBe('POSITION_CATALOG')
  })

  it('DHC-003: deriveManagersFromDeptHead — employees report to their dept HOD, HOD reports to CEO', () => {
    const empRows = [
      { 'Employee Number': '33',   'Full Name': 'Talal CEO' },     // Corp HOD + CEO
      { 'Employee Number': '1207', 'Full Name': 'Dorababu' },      // Tech HOD
      { 'Employee Number': '500',  'Full Name': 'Tech Staff A' },  // Tech employee
      { 'Employee Number': '501',  'Full Name': 'Tech Staff B' },  // Tech employee
    ]
    const asnRows = [
      { 'Employee ID': '33',   'Department': 'Corporate Services & Governance',     'Position Title': 'CEO',                          'Line Manager ID': '', 'Contract Start Date': '01-Jan-2016' },
      { 'Employee ID': '1207', 'Department': 'Technology & Digital Transformation', 'Position Title': 'Director of Technology & Innovation', 'Line Manager ID': '33', 'Contract Start Date': '01-Jan-2019' },
      { 'Employee ID': '500',  'Department': 'Technology & Digital Transformation', 'Position Title': 'IT Support Specialist',        'Line Manager ID': '33', 'Contract Start Date': '01-Jan-2021' },
      { 'Employee ID': '501',  'Department': 'Technology & Digital Transformation', 'Position Title': 'IT Support Specialist',        'Line Manager ID': '33', 'Contract Start Date': '01-Jan-2022' },
    ]
    const posRows = [
      { 'ID': '33',   'New Position': 'Chief Executive Officer & Strategic Leader' },
      { 'ID': '1207', 'New Position': 'Director of Technology & Innovation' },
      { 'ID': '500',  'New Position': 'IT Support Specialist' },
      { 'ID': '501',  'New Position': 'IT Support Specialist' },
    ]
    const catRows = [
      { 'Position Code': 'COR-P001', 'Position for HOD': 'YES', 'Department': 'Corporate Services & Governance' },
      { 'Position Code': 'TEC-P001', 'Position for HOD': 'YES', 'Department': 'Technology & Digital Transformation' },
      { 'Position Code': 'TEC-P009', 'Position for HOD': 'No',  'Department': 'Technology & Digital Transformation' },
    ]
    const files = [
      makeFile(classifySourceFile('04 Employee Master.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows }),
      makeFile(classifySourceFile('02 Employee Assignments.xlsx', [summarizeSheet('A', asnRows)]), { 'A': asnRows }),
      makeFile(classifySourceFile('05 Mapping Old Position New Position.xlsx', [summarizeSheet('P', posRows)]), { 'P': posRows }),
      makeFile(classifySourceFile('01 Positions Jobs Titles.xlsx', [summarizeSheet('C', catRows)]), { 'C': catRows }),
    ]
    const ctx = baseContext({
      positions: [
        { code: 'COR-P001', titleEn: 'Chief Executive Officer & Strategic Leader' },
        { code: 'TEC-P001', titleEn: 'Director of Technology & Innovation' },
        { code: 'TEC-P009', titleEn: 'IT Support Specialist' },
      ],
    })
    const { package: pkg } = transformSourceFiles(files, { mode: 'FULL_RELOAD', deriveManagersFromDeptHead: true }, ctx)

    const mgrOf = (n: string) => pkg.managers.find(m => m.employeeNumber === n)?.managerEmployeeNumber
    // Tech staff → Tech HOD (K1207)
    expect(mgrOf('K500')).toBe('K1207')
    expect(mgrOf('K501')).toBe('K1207')
    // Tech HOD → CEO (K33) via source line manager
    expect(mgrOf('K1207')).toBe('K33')
    // CEO → no manager (root)
    expect(mgrOf('K33')).toBeUndefined()
  })
})

// ── Manager hierarchy ─────────────────────────────────────────────────────────

describe('Source transformer — manager hierarchy', () => {
  it('STR-008: builds manager rows from explicit MANAGER_HIERARCHY file', () => {
    const empRows = [
      { 'Employee Number': '33',   'Full Name': 'Talal' },
      { 'Employee Number': '1207', 'Full Name': 'Dorababu' },
    ]
    const mgrRows = [
      { 'Employee Number': 'K1207', 'Manager Employee Number': 'K33' },
    ]
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const mgrFile = makeFile(classifySourceFile('managers.xlsx', [summarizeSheet('Managers', mgrRows)]), { 'Managers': mgrRows })
    const { package: pkg } = transformSourceFiles([empFile, mgrFile], fullReloadOpts(), baseContext())
    expect(pkg.managers).toHaveLength(1)
    expect(pkg.managers[0].employeeNumber).toBe('K1207')
    expect(pkg.managers[0].managerEmployeeNumber).toBe('K33')
  })

  it('STR-009: skips self-referential manager links with a warning', () => {
    const empRows = [{ 'Employee Number': '33', 'Full Name': 'Talal' }]
    const mgrRows = [{ 'Employee Number': 'K33', 'Manager Employee Number': 'K33' }]
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const mgrFile = makeFile(classifySourceFile('managers.xlsx', [summarizeSheet('Managers', mgrRows)]), { 'Managers': mgrRows })
    const { package: pkg, summary } = transformSourceFiles([empFile, mgrFile], fullReloadOpts(), baseContext())
    expect(pkg.managers).toHaveLength(0)
    expect(summary.managersSkipped).toBe(1)
    expect(summary.warnings.some(w => w.message.includes('Self-referential'))).toBe(true)
  })

  it('STR-010: derives manager hierarchy from EMPLOYEE_ASSIGNMENTS when no MANAGER_HIERARCHY file', () => {
    const empRows = [
      { 'Employee Number': '33',   'Full Name': 'Talal' },
      { 'Employee Number': '1207', 'Full Name': 'Dorababu' },
    ]
    const asnRows = [
      { 'Employee ID': '33',   'Department': 'Corporate Services & Governance', 'Line Manager ID': '' },
      { 'Employee ID': '1207', 'Department': 'Technology & Digital Transformation', 'Line Manager ID': '33' },
    ]
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const asnFile = makeFile(classifySourceFile('asn.xlsx', [summarizeSheet('A', asnRows)]), { 'A': asnRows })
    const { package: pkg } = transformSourceFiles([empFile, asnFile], fullReloadOpts(), baseContext())
    // K33 has no manager in source; K1207 → K33
    expect(pkg.managers).toHaveLength(1)
    expect(pkg.managers[0].employeeNumber).toBe('K1207')
    expect(pkg.managers[0].managerEmployeeNumber).toBe('K33')
  })
})

// ── Leave balance mapping ─────────────────────────────────────────────────────

describe('Source transformer — leave balance mapping', () => {
  it('SLB-001: creates one leave balance row per employee, defaulting to 0 when no source', () => {
    const empRows = [
      { 'Employee Number': '33',   'Full Name': 'Talal' },
      { 'Employee Number': '1207', 'Full Name': 'Dorababu' },
    ]
    const leaveRows = [
      { 'Person Number': '1207', 'Leave Balance': '25', 'Leave Year': '2026' },
    ]
    const empFile   = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const leaveFile = makeFile(classifySourceFile('leave.xlsx', [summarizeSheet('Leave', leaveRows)]), { 'Leave': leaveRows })
    const { package: pkg } = transformSourceFiles([empFile, leaveFile], fullReloadOpts(), baseContext())
    expect(pkg.leaveBalances).toHaveLength(2)

    const lb33   = pkg.leaveBalances.find(l => l.employeeNumber === 'K33')
    const lb1207 = pkg.leaveBalances.find(l => l.employeeNumber === 'K1207')
    expect(lb33?.openingBalanceDays).toBe(0)
    expect(lb1207?.openingBalanceDays).toBe(25)
    expect(lb1207?.balanceYear).toBe(2026)
  })

  it('SLB-001b: preserves negative leave balance (over-taken leave is a valid case)', () => {
    // Employee 1036 (Bilal Ahmad): source has -0.6. Negative opening balances are
    // legitimate; DB constraint relaxed in migration 0058 to allow them.
    const empRows   = [{ 'Employee Number': '1036', 'Full Name': 'Bilal Ahmad' }]
    const leaveRows = [{ 'Person Number': '1036', 'Leave Balance': '-0.6', 'Leave Year': '2026' }]
    const empFile   = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const leaveFile = makeFile(classifySourceFile('leave.xlsx', [summarizeSheet('L', leaveRows)]), { 'L': leaveRows })
    const { package: pkg } = transformSourceFiles([empFile, leaveFile], fullReloadOpts(), baseContext())
    expect(pkg.leaveBalances[0].openingBalanceDays).toBe(-0.6)
  })

  it('SLB-002: uses context.defaultBalanceYear when leave source has no year column', () => {
    const empRows   = [{ 'Employee Number': '33', 'Full Name': 'Talal' }]
    const leaveRows = [{ 'Person Number': '33', 'Leave Balance': '15' }]
    const empFile   = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const leaveFile = makeFile(classifySourceFile('leave.xlsx', [summarizeSheet('L', leaveRows)]), { 'L': leaveRows })
    const { package: pkg } = transformSourceFiles([empFile, leaveFile], fullReloadOpts(), baseContext({ defaultBalanceYear: 2026 }))
    expect(pkg.leaveBalances[0].balanceYear).toBe(2026)
  })

  it('SLB-003: defaults absence type to ANNUAL when source does not specify', () => {
    const empRows   = [{ 'Employee Number': '33', 'Full Name': 'Talal' }]
    const empFile   = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const { package: pkg } = transformSourceFiles([empFile], fullReloadOpts(), baseContext())
    expect(pkg.leaveBalances[0].absenceTypeCode).toBe('ANNUAL')
  })
})

// ── Incremental load dedup ────────────────────────────────────────────────────

describe('Source transformer — incremental load', () => {
  it('SIL-001: skips employees already in DB when mode is INCREMENTAL', () => {
    const empRows = [
      { 'Employee Number': '33',   'Full Name': 'Talal' },
      { 'Employee Number': '1207', 'Full Name': 'Dorababu' },
    ]
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const opts: TransformOptions = { mode: 'INCREMENTAL', existingPersonNumbers: new Set(['K33']) }
    const { package: pkg, summary } = transformSourceFiles([empFile], opts, baseContext())
    expect(pkg.employees).toHaveLength(1)
    expect(pkg.employees[0].employeeNumber).toBe('K1207')
    expect(summary.employeesSkipped).toBe(1)
    expect(summary.employeesDetected).toBe(2)
  })

  it('SIL-002: includes all employees in FULL_RELOAD regardless of existingPersonNumbers', () => {
    const empRows = [
      { 'Employee Number': '33',   'Full Name': 'Talal' },
      { 'Employee Number': '1207', 'Full Name': 'Dorababu' },
    ]
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const opts: TransformOptions = { mode: 'FULL_RELOAD', existingPersonNumbers: new Set(['K33']) }
    const { package: pkg, summary } = transformSourceFiles([empFile], opts, baseContext())
    expect(pkg.employees).toHaveLength(2)
    expect(summary.employeesSkipped).toBe(0)
  })

  it('SIL-003: INCREMENTAL with empty existingPersonNumbers includes all employees', () => {
    const empRows = [
      { 'Employee Number': '33',   'Full Name': 'Talal' },
      { 'Employee Number': '1207', 'Full Name': 'Dorababu' },
    ]
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const opts: TransformOptions = { mode: 'INCREMENTAL', existingPersonNumbers: new Set() }
    const { package: pkg } = transformSourceFiles([empFile], opts, baseContext())
    expect(pkg.employees).toHaveLength(2)
  })
})

// ── Unknown file handling ─────────────────────────────────────────────────────

describe('Source transformer — unknown file handling', () => {
  it('SUK-001: blockers includes EMPLOYEE_MASTER missing when no employee file', () => {
    const unknownRows = [{ 'Foo': 'bar', 'Baz': 'qux' }]
    const unknownAnalysis = classifySourceFile('random.xlsx', [summarizeSheet('Sheet1', unknownRows)])
    const unknownFile = makeFile(unknownAnalysis, { 'Sheet1': unknownRows })
    const { summary } = transformSourceFiles([unknownFile], fullReloadOpts(), baseContext())
    expect(summary.blockers.some(b => b.field === 'EMPLOYEE_MASTER')).toBe(true)
    expect(summary.canBuild).toBe(false)
  })

  it('SUK-002: canBuild is true when EMPLOYEE_MASTER is present even with UNKNOWN files (given assignments are supplied)', () => {
    // UNKNOWN files must not block the build — only missing assignments block it.
    const empRows     = [{ 'Employee Number': '33', 'Full Name': 'Talal' }]
    const asnRows     = [{ 'Employee ID': '33', 'Department': 'Corporate Services & Governance', 'Contract Start Date': '01-Nov-2016' }]
    const unknownRows = [{ 'Foo': 'bar' }]
    const empFile     = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const asnFile     = makeFile(classifySourceFile('asn.xlsx', [summarizeSheet('A', asnRows)]), { 'A': asnRows })
    const unknownFile = makeFile(classifySourceFile('random.xlsx', [summarizeSheet('S2', unknownRows)]), { 'S2': unknownRows })
    const { summary } = transformSourceFiles([empFile, asnFile, unknownFile], fullReloadOpts(), baseContext())
    expect(summary.canBuild).toBe(true)
    expect(summary.blockers.filter(b => b.field === 'MANDATORY_FIELDS')).toHaveLength(0)
  })
})

// ── 71-employee full package build ────────────────────────────────────────────
// Uses synthetic data that mirrors the UAT source file structure.

describe('Source transformer — 71-employee full package build', () => {
  // Build synthetic employee master rows for all 71 employees
  function make71EmpRows() {
    const rows = []
    for (let i = 1; i <= 71; i++) {
      rows.push({
        'Employee Number': String(i + 100),
        'Full Name': `Employee ${i}`,
        'Gender': 'Male',
        'Nationality': 'Indian',
        'Primary Email Address': `employee${i}@avaniis.dev`,
        'Work Mobile Phone Number': `050${String(i).padStart(7, '0')}`,
      })
    }
    return rows
  }

  function make71AsnRows(empRows: ReturnType<typeof make71EmpRows>) {
    const depts = [
      'Technology & Digital Transformation',
      'Corporate Services & Governance',
    ]
    return empRows.map((emp, idx) => ({
      'Employee ID': emp['Employee Number'],
      'Department': depts[idx % 2],
      'Contract Start Date': '01-Jan-2022',
      'Contract End Date': '31-Dec-2026',
      'Line Manager ID': idx === 0 ? '' : String(102),  // first emp is root
    }))
  }

  function make71UserRows(empRows: ReturnType<typeof make71EmpRows>) {
    return empRows.map(emp => ({
      'USERNAME': emp['Primary Email Address'],
      'Email': emp['Primary Email Address'],
    }))
  }

  function make71LeaveRows(empRows: ReturnType<typeof make71EmpRows>) {
    return empRows.map((emp, idx) => ({
      'Person Number': emp['Employee Number'],
      'Leave Balance': String(idx % 30),
      'Leave Year': '2026',
    }))
  }

  it('SPK-001: builds package with 71 employees, managers, and leave balances', () => {
    const empRows   = make71EmpRows()
    const asnRows   = make71AsnRows(empRows)
    const userRows  = make71UserRows(empRows)
    const leaveRows = make71LeaveRows(empRows)

    const empFile   = makeFile(classifySourceFile('emp.xlsx',   [summarizeSheet('Emp',   empRows)]),   { 'Emp':   empRows   })
    const asnFile   = makeFile(classifySourceFile('asn.xlsx',   [summarizeSheet('Asn',   asnRows)]),   { 'Asn':   asnRows   })
    const userFile  = makeFile(classifySourceFile('users.xlsx', [summarizeSheet('Users', userRows)]),  { 'Users': userRows  })
    const leaveFile = makeFile(classifySourceFile('leave.xlsx', [summarizeSheet('Leave', leaveRows)]), { 'Leave': leaveRows })

    const ctx = baseContext({
      departments: [
        { code: 'KPD-DP-004', nameEn: 'Technology & Digital Transformation' },
        { code: 'KPD-DP-006', nameEn: 'Corporate Services & Governance' },
      ],
    })

    const { package: pkg, summary } = transformSourceFiles(
      [empFile, asnFile, userFile, leaveFile],
      fullReloadOpts(),
      ctx,
    )

    // Employee count
    expect(pkg.employees).toHaveLength(71)
    expect(summary.employeesIncluded).toBe(71)
    expect(summary.employeesSkipped).toBe(0)
    expect(summary.canBuild).toBe(true)

    // All employee numbers are K-prefixed
    expect(pkg.employees.every(e => e.employeeNumber?.startsWith('K'))).toBe(true)

    // Leave balances: one per employee
    expect(pkg.leaveBalances).toHaveLength(71)

    // User matching: all 71 have matching email
    expect(summary.usersMatched).toBe(71)
    expect(pkg.employees.every(e => e.requiresUser === 'YES')).toBe(true)

    // Mobile normalization applied
    expect(summary.mobileNormalized).toBeGreaterThan(0)

    // V2ParsedPackage shape is intact
    expect(Array.isArray(pkg.managers)).toBe(true)
    expect(Array.isArray(pkg.deptHeads)).toBe(true)
    expect(Array.isArray(pkg.sheetNames)).toBe(true)
  })

  it('SPK-002: package structure matches V2ParsedPackage contract (feeds into validator)', () => {
    const empRows = make71EmpRows()
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const { package: pkg } = transformSourceFiles([empFile], fullReloadOpts(), baseContext())

    // V2ParsedPackage interface contract
    expect(pkg).toHaveProperty('employees')
    expect(pkg).toHaveProperty('managers')
    expect(pkg).toHaveProperty('deptHeads')
    expect(pkg).toHaveProperty('leaveBalances')
    expect(pkg).toHaveProperty('sheetNames')

    // RawImportRow required fields present on first employee
    const emp = pkg.employees[0]
    expect(emp).toHaveProperty('requiresUser')
    expect(emp).toHaveProperty('employeeNumber')
    expect(emp).toHaveProperty('legalEntityCode')
    expect(emp).toHaveProperty('contractType')
    expect(emp.contractType).toBe('FIXED_TERM')
    expect(emp.legalEntityCode).toBe('AVN-001')
  })
})

// ── Regression: K-prefix assignment lookup ────────────────────────────────────
// Verifies that employees with K-prefixed employee numbers (e.g. from a pre-built
// package accidentally uploaded as a source file) still resolve assignment data
// correctly via the normalised lookup key.

describe('Transformer regression — K-prefix assignment lookup', () => {
  it('KPX-001: employee row with K-prefixed ID resolves assignments correctly', () => {
    // Simulates the case where a pre-built package "Employees" sheet is
    // classified as EMPLOYEE_MASTER — rows already have "K33" as the number.
    const empRows = [{ 'Employee Number': 'K33', 'Full Name': 'Talal Al Gaddah' }]
    const asnRows = [{ 'Employee ID': '33', 'Department': 'Corporate Services & Governance', 'Contract Start Date': '01-Nov-2016' }]
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const asnFile = makeFile(classifySourceFile('asn.xlsx', [summarizeSheet('A', asnRows)]), { 'A': asnRows })
    const ctx = baseContext()
    const { package: pkg } = transformSourceFiles([empFile, asnFile], fullReloadOpts(), ctx)
    expect(pkg.employees).toHaveLength(1)
    expect(pkg.employees[0].employeeNumber).toBe('K33')
    expect(pkg.employees[0].departmentCode).toBe('KPD-DP-006')
    expect(pkg.employees[0].hireDate).toBe('2016-11-01')
  })

  it('KPX-002: mix of prefixed and unprefixed IDs all resolve to correct assignment data', () => {
    const empRows = [
      { 'Employee Number': '11',   'Full Name': 'Rawoof'  },
      { 'Employee Number': 'K33',  'Full Name': 'Talal'   },
      { 'Employee Number': '1207', 'Full Name': 'Dorababu' },
    ]
    const asnRows = [
      { 'Employee ID': '11',   'Department': 'Technology & Digital Transformation', 'Contract Start Date': '01-Jan-2020' },
      { 'Employee ID': '33',   'Department': 'Corporate Services & Governance',     'Contract Start Date': '01-Nov-2016' },
      { 'Employee ID': '1207', 'Department': 'Technology & Digital Transformation', 'Contract Start Date': '01-Mar-2019' },
    ]
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const asnFile = makeFile(classifySourceFile('asn.xlsx', [summarizeSheet('A', asnRows)]), { 'A': asnRows })
    const { package: pkg, summary } = transformSourceFiles([empFile, asnFile], fullReloadOpts(), baseContext())
    expect(pkg.employees).toHaveLength(3)
    expect(summary.canBuild).toBe(true)
    expect(pkg.employees.every(e => !!e.departmentCode)).toBe(true)
    expect(pkg.employees.every(e => !!e.hireDate)).toBe(true)
  })
})

// ── Regression: mandatory field blocker ──────────────────────────────────────

describe('Transformer regression — mandatory field blocker', () => {
  it('MFB-G01: missing departmentCode triggers BLOCKED before Step 7 validation', () => {
    // No assignments file → deptCode = '' for all employees
    const empRows = [
      { 'Employee Number': '11', 'Full Name': 'Rawoof' },
      { 'Employee Number': '33', 'Full Name': 'Talal'  },
    ]
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const { summary } = transformSourceFiles([empFile], fullReloadOpts(), baseContext())
    expect(summary.canBuild).toBe(false)
    expect(summary.blockers.some(b => b.field === 'MANDATORY_FIELDS' && b.message.includes('Department Code'))).toBe(true)
  })

  it('MFB-G02: employees with dept and hire populated do NOT trigger the blocker', () => {
    const empRows = [{ 'Employee Number': '33', 'Full Name': 'Talal' }]
    const asnRows = [{ 'Employee ID': '33', 'Department': 'Corporate Services & Governance', 'Contract Start Date': '01-Nov-2016' }]
    const empFile = makeFile(classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]), { 'S': empRows })
    const asnFile = makeFile(classifySourceFile('asn.xlsx', [summarizeSheet('A', asnRows)]), { 'A': asnRows })
    const { summary } = transformSourceFiles([empFile, asnFile], fullReloadOpts(), baseContext())
    expect(summary.blockers.filter(b => b.field === 'MANDATORY_FIELDS')).toHaveLength(0)
    expect(summary.canBuild).toBe(true)
  })
})

// ── effectiveType helper ──────────────────────────────────────────────────────

describe('effectiveType helper', () => {
  it('returns overrideType when set', () => {
    const analysis = classifySourceFile('unknown.xlsx', [{ name: 'S', rowCount: 1, columns: ['Foo'] }])
    const file: ClassifiedSourceFile = {
      analysis,
      sheets: new Map(),
      overrideType: 'LEAVE_BALANCES',
    }
    expect(effectiveType(file)).toBe('LEAVE_BALANCES')
  })

  it('returns detectedType when no override', () => {
    const sheets: SheetSummary[] = [{ name: 'S', rowCount: 10, columns: ['Employee Number', 'Full Name'] }]
    const analysis = classifySourceFile('emp.xlsx', sheets)
    const file: ClassifiedSourceFile = { analysis, sheets: new Map() }
    expect(effectiveType(file)).toBe(analysis.detectedType)
  })
})
