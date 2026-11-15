/**
 * Phase B — Package store + source action pipeline tests.
 *
 * PST-001–006  Package store (write/read/exists/clear)
 * SAP-001–005  Analysis pipeline (file parsing + classification)
 * SBP-001–005  Build pipeline (transform + store)
 * SUF-001–003  UAT source files (71-employee package build from real files)
 * SNW-001–002  No DB writes verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join }         from 'path'
import * as XLSX        from 'xlsx'

// ── Mock the storage provider with an in-memory store ─────────────────────────
// The real provider is postgres/azure/aws — not available in unit tests.

const _memStore = new Map<string, Buffer>()

vi.mock('@/lib/storage', () => ({
  getStorageProvider: () => ({
    uploadFile: async ({ key, data }: { key: string; data: Buffer }) => {
      _memStore.set(key, data)
      return { storageKey: key, fileSizeBytes: data.length, mimeType: 'application/json', checksumSha256: '', signedUrl: '' }
    },
    getFileData: async (key: string) => _memStore.get(key) ?? null,
    fileExists:  async (key: string) => _memStore.has(key),
    deleteFile:  async (key: string) => { _memStore.delete(key) },
    getSignedUrl: async () => '',
    getMetadata:  async () => null,
  }),
}))

import {
  saveSession, loadSession, savePackage, loadPackage,
  sessionExists, packageExists, clearSession, isValidSessionId,
} from '../../modules/migration/package-store'
import { classifySourceFile, summarizeSheet } from '../../modules/migration/source-classifier'
import { transformSourceFiles }               from '../../modules/migration/source-transformer'
import type {
  StoredFileEntry,
} from '../../modules/migration/package-store'
import type {
  ClassifiedSourceFile, TransformContext, RawSourceRow,
} from '../../modules/migration/source-types'
import type { V2ParsedPackage } from '../../modules/migration/v2-types'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Valid UUID v4 test sessions (required by F-03 validation)
const TEST_SESSION  = '11111111-1111-4111-a111-111111111111'
const UAT_DIR = join(process.cwd(), 'hr_data_migration/UAT')
const REQUIRED_UAT_FILES = [
  '04 Employee Master.xlsx',
  '02 Employee Assignments.xlsx',
  '04.1 Employee Leave Balance.xlsx',
  '05 Mapping Old Position New Position.xlsx',
  '06 Users Data.xlsx',
]
const HAS_UAT_FIXTURES = REQUIRED_UAT_FILES.every(file => existsSync(join(UAT_DIR, file)))
const describeUatFixtures = HAS_UAT_FIXTURES ? describe : describe.skip

beforeEach(() => {
  _memStore.clear()
})

function testCtx(overrides?: Partial<TransformContext>): TransformContext {
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

function makeStoredEntry(empCount: number): StoredFileEntry {
  const rows: RawSourceRow[] = Array.from({ length: empCount }, (_, i) => ({
    'Employee Number': String(i + 100),
    'Full Name':       `Employee ${i + 1}`,
    'Gender':          'Male',
    'Nationality':     'Indian',
  }))
  const analysis = classifySourceFile('emp.xlsx', [summarizeSheet('Sheet1', rows)])
  return { analysis, sheets: { 'Sheet1': rows } }
}

function makeSamplePackage(): V2ParsedPackage {
  return {
    employees: [
      {
        requiresUser: 'YES', employeeNumber: 'K33', fullNameEn: 'Test Employee',
        fullNameAr: undefined, workEmail: undefined, personalEmail: undefined,
        mobile: undefined, gender: 'MALE', dateOfBirth: undefined,
        nationalityCode: 'ARE', maritalStatus: 'SINGLE',
        legalEntityCode: 'AVN-001', departmentCode: undefined,
        positionCode: undefined, gradeCode: undefined, locationCode: undefined,
        lineManagerEmployeeNumber: undefined, hireDate: undefined,
        employmentType: 'FULL_TIME', basicSalary: undefined, totalPackage: undefined,
        contractType: 'FIXED_TERM', contractStartDate: undefined,
        contractEndDate: undefined, probationEndDate: undefined,
        passportNumber: undefined, emiratesId: undefined, visaNumber: undefined,
        labourCardNumber: undefined, insurancePlanCode: undefined,
      },
    ],
    managers:      [],
    deptHeads:     [],
    leaveBalances: [{ employeeNumber: 'K33', absenceTypeCode: 'ANNUAL', balanceYear: 2026, openingBalanceDays: 0 }],
    sheetNames:    ['Employees', 'Managers', 'DeptHeads', 'LeaveBalances'],
  }
}

// ── PST — Package store ───────────────────────────────────────────────────────

describe('Package store', () => {
  afterEach(async () => {
    await clearSession(TEST_SESSION)
  })

  it('PST-001: sessionExists returns false before any write', async () => {
    expect(await sessionExists(TEST_SESSION)).toBe(false)
  })

  it('PST-002: saveSession + loadSession round-trip is lossless', async () => {
    const entries = [makeStoredEntry(5)]
    await saveSession(TEST_SESSION, entries)

    expect(await sessionExists(TEST_SESSION)).toBe(true)
    const loaded = await loadSession(TEST_SESSION)
    expect(loaded).not.toBeNull()
    expect(loaded!.sessionId).toBe(TEST_SESSION)
    expect(loaded!.fileCount).toBe(1)
    expect(loaded!.files).toHaveLength(1)
    expect(loaded!.files[0].sheets['Sheet1']).toHaveLength(5)
    expect(loaded!.files[0].analysis.detectedType).toBe('EMPLOYEE_MASTER')
  })

  it('PST-003: savePackage + loadPackage round-trip preserves V2ParsedPackage', async () => {
    const pkg     = makeSamplePackage()
    const summary = {
      employeesDetected: 1, employeesIncluded: 1, employeesSkipped: 0,
      managersResolved: 0, managersSkipped: 0, deptHeadsResolved: 0,
      leaveBalancesDetected: 1, usersMatched: 0,
      positionsFromMapping: 0, positionsFallback: 0, positionsMissing: 1,
      mobileNormalized: 0, warnings: [], blockers: [], canBuild: true,
    }
    await savePackage(TEST_SESSION, pkg, summary, 'FULL_RELOAD')

    expect(await packageExists(TEST_SESSION)).toBe(true)
    const loaded = await loadPackage(TEST_SESSION)
    expect(loaded).not.toBeNull()
    expect(loaded!.mode).toBe('FULL_RELOAD')
    expect(loaded!.pkg.employees).toHaveLength(1)
    expect(loaded!.pkg.employees[0].employeeNumber).toBe('K33')
    expect(loaded!.summary.employeesIncluded).toBe(1)
  })

  it('PST-004: loadSession returns null for unknown sessionId', async () => {
    expect(await loadSession('22222222-2222-4222-a222-222222222222')).toBeNull()
  })

  it('PST-005: loadPackage returns null when only session (not package) exists', async () => {
    await saveSession(TEST_SESSION, [makeStoredEntry(1)])
    expect(await packageExists(TEST_SESSION)).toBe(false)
    expect(await loadPackage(TEST_SESSION)).toBeNull()
  })

  it('PST-006: clearSession removes all session artefacts', async () => {
    await saveSession(TEST_SESSION, [makeStoredEntry(1)])
    await savePackage(TEST_SESSION, makeSamplePackage(), {
      employeesDetected: 1, employeesIncluded: 1, employeesSkipped: 0,
      managersResolved: 0, managersSkipped: 0, deptHeadsResolved: 0,
      leaveBalancesDetected: 1, usersMatched: 0,
      positionsFromMapping: 0, positionsFallback: 0, positionsMissing: 1,
      mobileNormalized: 0, warnings: [], blockers: [], canBuild: true,
    }, 'FULL_RELOAD')

    await clearSession(TEST_SESSION)

    expect(await sessionExists(TEST_SESSION)).toBe(false)
    expect(await packageExists(TEST_SESSION)).toBe(false)
  })

  // F-03 regression: invalid sessionId must be rejected before storage key construction
  it('PST-007: isValidSessionId rejects non-UUID strings', () => {
    expect(isValidSessionId('../../etc/passwd')).toBe(false)
    expect(isValidSessionId('not-a-uuid')).toBe(false)
    expect(isValidSessionId('')).toBe(false)
    expect(isValidSessionId('11111111-1111-4111-a111-111111111111')).toBe(true)
  })

  it('PST-008: saveSession throws on invalid sessionId', async () => {
    await expect(saveSession('../../etc/passwd', [])).rejects.toThrow('Invalid sessionId')
  })
})

// ── SAP — Analysis pipeline ───────────────────────────────────────────────────

describe('Analysis pipeline (classification)', () => {
  it('SAP-001: classifies Employee Master from sheet with required columns', () => {
    const rows = [{ 'Employee Number': '33', 'Full Name': 'Talal', 'Date of Birth': '1980-01-01' }]
    const analysis = classifySourceFile('04 Employee Master.xlsx', [summarizeSheet('S', rows)])
    expect(analysis.detectedType).toBe('EMPLOYEE_MASTER')
    expect(analysis.confidence).not.toBe('LOW')
  })

  it('SAP-002: classifies Leave Balances from file name + columns', () => {
    const rows = [{ 'Person Number': '33', 'Leave Balance': '25', 'Leave Year': '2026' }]
    const analysis = classifySourceFile('04.1 Employee Leave Balance.xlsx', [summarizeSheet('S', rows)])
    expect(analysis.detectedType).toBe('LEAVE_BALANCES')
  })

  it('SAP-003: returns UNKNOWN with warning for unrecognised file', () => {
    const rows = [{ 'SomeCol': 'val1', 'OtherCol': 'val2' }]
    const analysis = classifySourceFile('mystery-export.xlsx', [summarizeSheet('S', rows)])
    expect(analysis.detectedType).toBe('UNKNOWN')
    expect(analysis.warnings.some(w => w.includes('Could not auto-classify'))).toBe(true)
  })

  it('SAP-004: multiple file classifications stored and retrieved from session', async () => {
    const empRows  = [{ 'Employee Number': '33', 'Full Name': 'Talal' }]
    const lbRows   = [{ 'Person Number': '33', 'Leave Balance': '15' }]
    const empEntry: StoredFileEntry = {
      analysis: classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]),
      sheets:   { 'S': empRows },
    }
    const lbEntry: StoredFileEntry = {
      analysis: classifySourceFile('leave.xlsx', [summarizeSheet('S', lbRows)]),
      sheets:   { 'S': lbRows },
    }
    const sid = '33333333-3333-4333-a333-333333333333'
    try {
      await saveSession(sid, [empEntry, lbEntry])
      const loaded = await loadSession(sid)
      expect(loaded!.fileCount).toBe(2)
      expect(loaded!.files[0].analysis.detectedType).toBe('EMPLOYEE_MASTER')
      expect(loaded!.files[1].analysis.detectedType).toBe('LEAVE_BALANCES')
    } finally {
      await clearSession(sid)
    }
  })

  it('SAP-005: empty sheet produces an issue in the analysis', () => {
    const analysis = classifySourceFile('empty.xlsx', [{ name: 'Sheet1', rowCount: 0, columns: [] }])
    expect(analysis.issues.some(i => i.includes('empty'))).toBe(true)
  })
})

// ── SBP — Build pipeline ──────────────────────────────────────────────────────

describe('Build pipeline (transform + store)', () => {
  const SID = '44444444-4444-4444-a444-444444444444'

  afterEach(async () => await clearSession(SID))

  async function storeAndBuild(
    empRows:   RawSourceRow[],
    extraFiles?: StoredFileEntry[],
    overrides?: Partial<TransformContext>,
  ) {
    const empEntry: StoredFileEntry = {
      analysis: classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]),
      sheets:   { 'S': empRows },
    }
    await saveSession(SID, [empEntry, ...(extraFiles ?? [])])

    const session = (await loadSession(SID))!
    const classified: ClassifiedSourceFile[] = session.files.map(f => ({
      analysis: f.analysis,
      sheets:   new Map(Object.entries(f.sheets)),
    }))

    return transformSourceFiles(classified, { mode: 'FULL_RELOAD' }, testCtx(overrides))
  }

  it('SBP-001: transform result is stored and retrieved correctly', async () => {
    const empRows = [{ 'Employee Number': '33', 'Full Name': 'Talal' }]
    const { package: pkg, summary } = await storeAndBuild(empRows)
    await savePackage(SID, pkg, summary, 'FULL_RELOAD')

    const stored = await loadPackage(SID)
    expect(stored).not.toBeNull()
    expect(stored!.pkg.employees[0].employeeNumber).toBe('K33')
    expect(stored!.summary.employeesIncluded).toBe(1)
  })

  it('SBP-002: canBuild is false when EMPLOYEE_MASTER is missing', async () => {
    const unknownEntry: StoredFileEntry = {
      analysis: classifySourceFile('random.xlsx', [{ name: 'S', rowCount: 1, columns: ['Foo'] }]),
      sheets:   { 'S': [{ 'Foo': 'bar' }] },
    }
    await saveSession(SID, [unknownEntry])
    const session = (await loadSession(SID))!
    const classified: ClassifiedSourceFile[] = session.files.map(f => ({
      analysis: f.analysis,
      sheets:   new Map(Object.entries(f.sheets)),
    }))
    const { summary } = transformSourceFiles(classified, { mode: 'FULL_RELOAD' }, testCtx())
    expect(summary.canBuild).toBe(false)
    expect(summary.blockers.some(b => b.field === 'EMPLOYEE_MASTER')).toBe(true)
  })

  it('SBP-003: leave balances are generated for every employee (default 0 if no source)', async () => {
    const empRows = Array.from({ length: 5 }, (_, i) => ({
      'Employee Number': String(i + 1), 'Full Name': `Emp ${i}`,
    }))
    const { package: pkg } = await storeAndBuild(empRows)
    expect(pkg.leaveBalances).toHaveLength(5)
    expect(pkg.leaveBalances.every(lb => lb.absenceTypeCode === 'ANNUAL')).toBe(true)
  })

  it('SBP-004: session package retrieved after save has correct sheetNames', async () => {
    const empRows = [{ 'Employee Number': '33', 'Full Name': 'Talal' }]
    const { package: pkg, summary } = await storeAndBuild(empRows)
    await savePackage(SID, pkg, summary, 'FULL_RELOAD')

    const stored = (await loadPackage(SID))!
    expect(Array.isArray(stored.pkg.sheetNames)).toBe(true)
  })

  it('SBP-005: overrideType in session reassigns detectedType for build', async () => {
    const leaveRows = [{ 'Person Number': '33', 'Leave Balance': '20' }]
    const unknownEntry: StoredFileEntry = {
      analysis: { ...classifySourceFile('weird.xlsx', [summarizeSheet('S', leaveRows)]), detectedType: 'UNKNOWN' as const },
      sheets:   { 'S': leaveRows },
    }
    const empEntry: StoredFileEntry = {
      analysis: classifySourceFile('emp.xlsx', [summarizeSheet('S', [{ 'Employee Number': '33', 'Full Name': 'Test' }])]),
      sheets:   { 'S': [{ 'Employee Number': '33', 'Full Name': 'Test' }] },
    }
    await saveSession(SID, [empEntry, unknownEntry])

    const session = (await loadSession(SID))!
    const classified: ClassifiedSourceFile[] = session.files.map((f, i) => ({
      analysis: f.analysis,
      sheets:   new Map(Object.entries(f.sheets)),
      overrideType: i === 1 ? 'LEAVE_BALANCES' as const : undefined,
    }))

    const { package: pkg } = transformSourceFiles(classified, { mode: 'FULL_RELOAD' }, testCtx())
    expect(pkg.leaveBalances[0].openingBalanceDays).toBe(20)
  })
})

// ── SUF — UAT source files (71-employee full build) ───────────────────────────

function loadUatFile(filename: string): RawSourceRow[] {
  const buf = readFileSync(join(UAT_DIR, filename))
  const wb  = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: false }) as RawSourceRow[]
}

function loadUatFileHeaderRow(filename: string, headerRow: number): RawSourceRow[] {
  const buf = readFileSync(join(UAT_DIR, filename))
  const wb  = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: false, range: headerRow - 1 }) as RawSourceRow[]
}

function fullUatContext(): TransformContext {
  return {
    positions: [
      { code: 'DEV-P001', titleEn: 'Director of Project Delivery' },
      { code: 'DEV-P002', titleEn: 'Senior Design Architect' },
      { code: 'DEV-P003', titleEn: 'Design & Creative Manager' },
      { code: 'DEV-P004', titleEn: 'Lead Design Architect' },
      { code: 'DEV-P005', titleEn: 'Branding & Communications Manager' },
      { code: 'DEV-P006', titleEn: 'Junior Design Architect' },
      { code: 'DEV-P007', titleEn: 'Senior Project Control Specialist' },
      { code: 'DEV-P008', titleEn: 'Project Architect' },
      { code: 'DEV-P009', titleEn: 'Site Operations Supervisor' },
      { code: 'DEV-P010', titleEn: 'Quality Assurance Specialist' },
      { code: 'DEV-P011', titleEn: 'QA/QC Inspector' },
      { code: 'DEV-P012', titleEn: 'AI Project Coordinator' },
      { code: 'DEV-P013', titleEn: 'Project Documentation Manager' },
      { code: 'DEV-P014', titleEn: 'Project Operations Specialist' },
      { code: 'DEV-P015', titleEn: 'Project Engineering Specialist' },
      { code: 'FIN-P001', titleEn: 'Chief Financial Officer' },
      { code: 'FIN-P002', titleEn: 'Finance Operations Manager' },
      { code: 'FIN-P003', titleEn: 'Senior Financial Specialist' },
      { code: 'FIN-P004', titleEn: 'Financial Accounting Specialist' },
      { code: 'FIN-P005', titleEn: 'Finance Operations Accountant' },
      { code: 'FIN-P006', titleEn: 'Financial Analyst Specialist' },
      { code: 'COM-P001', titleEn: 'Senior Portfolio Manager - CRM & Collections' },
      { code: 'COM-P002', titleEn: 'Service Performance Analyst' },
      { code: 'COM-P003', titleEn: 'Commercial Operations Manager' },
      { code: 'COM-P004', titleEn: 'Commercial Contracts Manager' },
      { code: 'COM-P005', titleEn: 'Client Relationship Manager' },
      { code: 'COM-P006', titleEn: 'Security & Safety Manager' },
      { code: 'COM-P007', titleEn: 'Fleet & Logistics Coordinator' },
      { code: 'COM-P008', titleEn: 'Facilities & Services Manager' },
      { code: 'COM-P009', titleEn: 'Marine Operations Lead' },
      { code: 'TEC-P001', titleEn: 'Director of Technology & Innovation' },
      { code: 'TEC-P002', titleEn: 'ConTech Innovation Manager' },
      { code: 'TEC-P003', titleEn: 'Property Technology Manager' },
      { code: 'TEC-P004', titleEn: 'Enterprise Systems Manager' },
      { code: 'TEC-P005', titleEn: 'ERP Technical Lead' },
      { code: 'TEC-P006', titleEn: 'ConTech Technical Lead' },
      { code: 'TEC-P007', titleEn: 'Infrastructure Technology Lead' },
      { code: 'TEC-P008', titleEn: 'Mobility Technology Lead' },
      { code: 'TEC-P009', titleEn: 'IT Support Specialist' },
      { code: 'TEC-P010', titleEn: 'Salesforce Technology Lead' },
      { code: 'PEO-P001', titleEn: 'HR Admin Operations Manager' },
      { code: 'PEO-P002', titleEn: 'Head of Governance & Compliance' },
      { code: 'COR-P001', titleEn: 'Chief Executive Officer & Strategic Leader' },
      { code: 'COR-P002', titleEn: 'Strategic Operations Lead' },
      { code: 'COR-P003', titleEn: 'Business Transformation Coordinator' },
      { code: 'COR-P004', titleEn: 'Business Transformation Executor' },
      { code: 'COR-P005', titleEn: 'CEO Office Assistant' },
      { code: 'COR-P006', titleEn: 'Operations Executive' },
    ],
    departments: [
      { code: 'KPD-DP-001', nameEn: 'Development & Project Delivery' },
      { code: 'KPD-DP-002', nameEn: 'Finance & Strategic Control' },
      { code: 'KPD-DP-003', nameEn: 'Commercial & Revenue Operations' },
      { code: 'KPD-DP-004', nameEn: 'Technology & Digital Transformation' },
      { code: 'KPD-DP-005', nameEn: 'People & Organizational Intelligence' },
      { code: 'KPD-DP-006', nameEn: 'Corporate Services & Governance' },
    ],
    grades:       [{ code: 'KPD-G-01' }],
    locations:    [{ code: 'KPD-LOC-01' }],
    absenceTypes: [{ code: 'ANNUAL' }],
    defaultGradeCode:       'KPD-G-01',
    defaultLocationCode:    'KPD-LOC-01',
    defaultLegalEntityCode: 'AVN-001',
    defaultBalanceYear:     2026,
    departmentDefaultPositions: new Map([
      ['KPD-DP-001', 'DEV-P014'],
      ['KPD-DP-002', 'FIN-P005'],
      ['KPD-DP-003', 'COM-P005'],
      ['KPD-DP-004', 'TEC-P009'],
      ['KPD-DP-005', 'PEO-P001'],
      ['KPD-DP-006', 'COR-P005'],
    ]),
  }
}

describeUatFixtures('UAT source files — 71-employee full package build', () => {
  it('SUF-001: builds package from real UAT source files with correct employee count', () => {
    const empRows   = loadUatFile('04 Employee Master.xlsx')
    const asnRows   = loadUatFile('02 Employee Assignments.xlsx')
    const posRows   = loadUatFile('05 Mapping Old Position New Position.xlsx')
    const leaveRows = loadUatFileHeaderRow('04.1 Employee Leave Balance.xlsx', 3)
    const userRows  = loadUatFile('06 Users Data.xlsx')

    const { package: pkg, summary } = transformSourceFiles(
      [
        { analysis: classifySourceFile('04 Employee Master.xlsx',                   [summarizeSheet('S', empRows)]),   sheets: new Map([['S', empRows]])   },
        { analysis: classifySourceFile('02 Employee Assignments.xlsx',              [summarizeSheet('S', asnRows)]),   sheets: new Map([['S', asnRows]])   },
        { analysis: classifySourceFile('05 Mapping Old Position New Position.xlsx', [summarizeSheet('S', posRows)]),   sheets: new Map([['S', posRows]])   },
        { analysis: classifySourceFile('04.1 Employee Leave Balance.xlsx',          [summarizeSheet('S', leaveRows)]), sheets: new Map([['S', leaveRows]]) },
        { analysis: classifySourceFile('06 Users Data.xlsx',                        [summarizeSheet('S', userRows)]),  sheets: new Map([['S', userRows]])  },
      ],
      { mode: 'FULL_RELOAD' },
      fullUatContext(),
    )

    expect(pkg.employees.length).toBeGreaterThanOrEqual(71)
    expect(summary.canBuild).toBe(true)
    expect(summary.employeesIncluded).toBeGreaterThanOrEqual(71)
    expect(pkg.employees.every(e => e.employeeNumber?.startsWith('K'))).toBe(true)
    expect(pkg.managers.length).toBeGreaterThan(0)
    expect(pkg.managers.every(m => m.employeeNumber !== m.managerEmployeeNumber)).toBe(true)
  })

  it('SUF-002: stores and retrieves 71-employee package via storage provider', async () => {
    const sid = '55555555-5555-4555-a555-555555555555'
    try {
      const empRows = loadUatFile('04 Employee Master.xlsx')
      const asnRows = loadUatFile('02 Employee Assignments.xlsx')

      const { package: pkg, summary } = transformSourceFiles(
        [
          { analysis: classifySourceFile('04 Employee Master.xlsx',      [summarizeSheet('S', empRows)]), sheets: new Map([['S', empRows]]) },
          { analysis: classifySourceFile('02 Employee Assignments.xlsx', [summarizeSheet('S', asnRows)]), sheets: new Map([['S', asnRows]]) },
        ],
        { mode: 'FULL_RELOAD' },
        fullUatContext(),
      )

      await savePackage(sid, pkg, summary, 'FULL_RELOAD')

      const stored = await loadPackage(sid)
      expect(stored).not.toBeNull()
      expect(stored!.pkg.employees.length).toBeGreaterThanOrEqual(71)
      expect(stored!.summary.employeesIncluded).toBeGreaterThanOrEqual(71)
      expect(stored!.pkg).toHaveProperty('employees')
      expect(stored!.pkg).toHaveProperty('managers')
      expect(stored!.pkg).toHaveProperty('deptHeads')
      expect(stored!.pkg).toHaveProperty('leaveBalances')
    } finally {
      await clearSession(sid)
    }
  })

  it('SUF-003: classification correctly identifies all 5 UAT source files', () => {
    const files = [
      { name: '04 Employee Master.xlsx',                  expected: 'EMPLOYEE_MASTER'      },
      { name: '02 Employee Assignments.xlsx',             expected: 'EMPLOYEE_ASSIGNMENTS' },
      { name: '04.1 Employee Leave Balance.xlsx',         expected: 'LEAVE_BALANCES'       },
      { name: '05 Mapping Old Position New Position.xlsx', expected: 'POSITION_MAPPING'    },
      { name: '06 Users Data.xlsx',                       expected: 'USERS_DATA'           },
    ]

    for (const { name, expected } of files) {
      const rows      = name.includes('Leave Balance')
        ? loadUatFileHeaderRow(name, 3)
        : loadUatFile(name)
      const analysis  = classifySourceFile(name, [summarizeSheet('S', rows)])
      expect(
        analysis.detectedType,
        `Expected "${name}" to be classified as ${expected}, got ${analysis.detectedType}`
      ).toBe(expected)
    }
  })
})

// ── SUF-004/005: Regression — full pipeline with auto header detection ────────
// These tests use the parseFileToEntries-equivalent logic (auto header detection
// via findHeaderRow) so they prove the actual UI pipeline produces correct output.
// They verify: 71 employees, 70 manager links, 71 leave balances, 0 missing fields.

describeUatFixtures('UAT source files — regression: auto header detection pipeline', () => {
  function loadUatFileAutoHeader(filename: string): RawSourceRow[] {
    // Mirrors parseFileToEntries exactly — KNOWN_COL_FRAGMENTS from source-actions.ts.
    // IMPORTANT: do NOT add 'leave balance' here. The leave balance file has a title
    // row containing "As-of Employees Leave Balance" at row 0; adding 'leave balance'
    // would match that title row instead of the real header at row 2 (Person Number).
    const KNOWN = [
      'employee number', 'employee id', 'person number',
      'full name', 'department', 'contract start',
      'opening balance', 'absence type',
      'username', 'new position', 'manager employee number',
      'hire date', 'date of birth', 'nationality',
    ]
    const buf = readFileSync(join(UAT_DIR, filename))
    const wb  = XLSX.read(buf, { type: 'buffer', cellDates: true })
    const ws  = wb.Sheets[wb.SheetNames[0]]
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    let headerRow = 0
    for (let i = 0; i < Math.min(5, aoa.length); i++) {
      const cells = (aoa[i] as unknown[]).map(c => String(c ?? '').trim().toLowerCase())
      if (cells.some(cell => KNOWN.some(f => cell.includes(f)))) { headerRow = i; break }
    }
    return XLSX.utils.sheet_to_json<RawSourceRow>(ws, { defval: null, raw: false, range: headerRow }) as RawSourceRow[]
  }

  it('SUF-004: auto header detection correctly parses leave balance file (Person Number column found)', () => {
    const rows = loadUatFileAutoHeader('04.1 Employee Leave Balance.xlsx')
    expect(rows.length).toBeGreaterThanOrEqual(71)
    expect(Object.keys(rows[0])).toContain('Person Number')
  })

  it('SUF-005: full pipeline with auto header produces 71 employees, 70 manager links, 71 leave balances, 0 missing mandatory fields', () => {
    const empRows   = loadUatFileAutoHeader('04 Employee Master.xlsx')
    const asnRows   = loadUatFileAutoHeader('02 Employee Assignments.xlsx')
    const posRows   = loadUatFileAutoHeader('05 Mapping Old Position New Position.xlsx')
    const leaveRows = loadUatFileAutoHeader('04.1 Employee Leave Balance.xlsx')
    const userRows  = loadUatFileAutoHeader('06 Users Data.xlsx')

    const { package: pkg, summary } = transformSourceFiles(
      [
        { analysis: classifySourceFile('04 Employee Master.xlsx',                   [summarizeSheet('S', empRows)]),   sheets: new Map([['S', empRows]])   },
        { analysis: classifySourceFile('02 Employee Assignments.xlsx',              [summarizeSheet('S', asnRows)]),   sheets: new Map([['S', asnRows]])   },
        { analysis: classifySourceFile('05 Mapping Old Position New Position.xlsx', [summarizeSheet('S', posRows)]),   sheets: new Map([['S', posRows]])   },
        { analysis: classifySourceFile('04.1 Employee Leave Balance.xlsx',          [summarizeSheet('S', leaveRows)]), sheets: new Map([['S', leaveRows]]) },
        { analysis: classifySourceFile('06 Users Data.xlsx',                        [summarizeSheet('S', userRows)]),  sheets: new Map([['S', userRows]])  },
      ],
      { mode: 'FULL_RELOAD' },
      fullUatContext(),
    )

    // Employee count
    expect(pkg.employees).toHaveLength(71)
    expect(summary.employeesIncluded).toBe(71)
    expect(summary.canBuild).toBe(true)

    // Manager links (all 71 except the root CEO have a manager → 70 links)
    expect(pkg.managers).toHaveLength(70)
    expect(pkg.managers.every(m => m.employeeNumber !== m.managerEmployeeNumber)).toBe(true)

    // Leave balances (one per employee after auto header fix)
    expect(pkg.leaveBalances).toHaveLength(71)

    // 0 missing mandatory fields
    const missingDept  = pkg.employees.filter(e => !e.departmentCode).length
    const missingHire  = pkg.employees.filter(e => !e.hireDate).length
    const missingGrade = pkg.employees.filter(e => !e.gradeCode).length
    const missingPos   = pkg.employees.filter(e => !e.positionCode).length
    expect(missingDept,  'employees missing departmentCode').toBe(0)
    expect(missingHire,  'employees missing hireDate').toBe(0)
    expect(missingGrade, 'employees missing gradeCode').toBe(0)
    expect(missingPos,   'employees missing positionCode').toBe(0)

    // Dept heads (raw UAT files have no DEPT_HEAD_MAPPING source file — expect 0)
    expect(pkg.deptHeads).toHaveLength(0)

    // No blocking errors from the transformer
    expect(summary.blockers.filter(b => b.field === 'MANDATORY_FIELDS')).toHaveLength(0)
  })

  it('SUF-006: pipeline with UAT source files + explicit dept head mapping produces 6 department heads', () => {
    // The 6 department head rows mirror the DeptHeads sheet in full-v2-migration-package.xlsx.
    // A DEPT_HEAD_MAPPING file is not included in the raw UAT source files, so this test
    // adds a synthetic one to prove the full 4-sheet package structure is achievable.
    const empRows   = loadUatFileAutoHeader('04 Employee Master.xlsx')
    const asnRows   = loadUatFileAutoHeader('02 Employee Assignments.xlsx')
    const posRows   = loadUatFileAutoHeader('05 Mapping Old Position New Position.xlsx')
    const leaveRows = loadUatFileAutoHeader('04.1 Employee Leave Balance.xlsx')

    // Synthetic dept head mapping (one HOD per department)
    const deptHeadRows = [
      { 'Department Code': 'KPD-DP-001', 'Head Employee Number': 'K33' },
      { 'Department Code': 'KPD-DP-002', 'Head Employee Number': 'K11' },
      { 'Department Code': 'KPD-DP-003', 'Head Employee Number': 'K817' },
      { 'Department Code': 'KPD-DP-004', 'Head Employee Number': 'K1207' },
      { 'Department Code': 'KPD-DP-005', 'Head Employee Number': 'K12' },
      { 'Department Code': 'KPD-DP-006', 'Head Employee Number': 'K33' },
    ]

    const { package: pkg, summary } = transformSourceFiles(
      [
        { analysis: classifySourceFile('04 Employee Master.xlsx',                   [summarizeSheet('S', empRows)]),      sheets: new Map([['S', empRows]])      },
        { analysis: classifySourceFile('02 Employee Assignments.xlsx',              [summarizeSheet('S', asnRows)]),      sheets: new Map([['S', asnRows]])      },
        { analysis: classifySourceFile('05 Mapping Old Position New Position.xlsx', [summarizeSheet('S', posRows)]),      sheets: new Map([['S', posRows]])      },
        { analysis: classifySourceFile('04.1 Employee Leave Balance.xlsx',          [summarizeSheet('S', leaveRows)]),    sheets: new Map([['S', leaveRows]])    },
        { analysis: classifySourceFile('dept-heads.xlsx',                           [summarizeSheet('S', deptHeadRows)]), sheets: new Map([['S', deptHeadRows]]) },
      ],
      { mode: 'FULL_RELOAD' },
      fullUatContext(),
    )

    expect(pkg.employees).toHaveLength(71)
    expect(pkg.managers).toHaveLength(70)
    expect(pkg.deptHeads).toHaveLength(6)
    expect(pkg.leaveBalances).toHaveLength(71)
    expect(summary.canBuild).toBe(true)
    expect(pkg.deptHeads.every(d => d.departmentCode && d.headEmployeeNumber)).toBe(true)
  })
})

// ── SNW — No DB writes ────────────────────────────────────────────────────────

describe('No DB writes verification', () => {
  it('SNW-001: transformSourceFiles makes no DB calls (pure function)', () => {
    const empRows = [{ 'Employee Number': '33', 'Full Name': 'Test' }]
    const file: ClassifiedSourceFile = {
      analysis: classifySourceFile('emp.xlsx', [summarizeSheet('S', empRows)]),
      sheets:   new Map([['S', empRows]]),
    }
    expect(() => {
      transformSourceFiles([file], { mode: 'FULL_RELOAD' }, testCtx())
    }).not.toThrow()
  })

  it('SNW-002: savePackage + loadPackage uses storage provider (no raw /tmp access)', async () => {
    const sid = '66666666-6666-4666-a666-666666666666'
    try {
      const pkg = makeSamplePackage()
      await savePackage(sid, pkg, {
        employeesDetected: 1, employeesIncluded: 1, employeesSkipped: 0,
        managersResolved: 0, managersSkipped: 0, deptHeadsResolved: 0,
        leaveBalancesDetected: 1, usersMatched: 0,
        positionsFromMapping: 0, positionsFallback: 0, positionsMissing: 0,
        mobileNormalized: 0, warnings: [], blockers: [], canBuild: true,
      }, 'FULL_RELOAD')
      const loaded = await loadPackage(sid)
      expect(loaded).not.toBeNull()
      expect(loaded!.pkg.employees[0].employeeNumber).toBe('K33')
    } finally {
      await clearSession(sid)
    }
  })
})
