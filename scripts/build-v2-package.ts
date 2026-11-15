/**
 * build-v2-package.ts
 *
 * TypeScript thin wrapper around Phase A source ingestion services.
 * Replaces the embedded transformation logic in build-full-v2-workbook.mjs.
 *
 * Called by:
 *   scripts/build-full-v2-workbook.mjs  →  npx tsx scripts/build-v2-package.ts
 *   scripts/build-v2-workbook.mjs       →  npx tsx scripts/build-v2-package.ts --scope=pilot
 *
 * Usage (direct):
 *   npx tsx scripts/build-v2-package.ts [--scope=full|pilot]
 *
 * Output:
 *   full  → hr_data_migration/UAT/full-v2-migration-package.xlsx  (71 employees, 6 depts)
 *   pilot → hr_data_migration/UAT/pilot-v2-migration-package.xlsx (21 employees, 2 depts)
 */

import * as XLSX           from 'xlsx'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname }   from 'path'
import { fileURLToPath }   from 'url'
import { classifySourceFile, summarizeSheet } from '../modules/migration/source-classifier'
import { transformSourceFiles }               from '../modules/migration/source-transformer'
import type { ClassifiedSourceFile, TransformContext, RawSourceRow, MigrationMode } from '../modules/migration/source-types'
import type { RawImportRow }    from '../modules/core-hr/bulk-import/types'
import type { V2ParsedPackage } from '../modules/migration/v2-types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UAT_DIR   = join(__dirname, '../hr_data_migration/UAT')

// ── CLI args ──────────────────────────────────────────────────────────────────

const scope = process.argv.includes('--scope=pilot') ? 'pilot' : 'full'
const OUT_FILE = join(UAT_DIR, scope === 'pilot'
  ? 'pilot-v2-migration-package.xlsx'
  : 'full-v2-migration-package.xlsx')

// ── Source file loader ────────────────────────────────────────────────────────

function loadSheet(filename: string, headerRow = 1): RawSourceRow[] {
  const buf = readFileSync(join(UAT_DIR, filename))
  const wb  = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<RawSourceRow>(ws, { defval: null, raw: false, range: headerRow - 1 })
}

function makeFile(
  fileName: string,
  sheetName: string,
  rows: RawSourceRow[],
  overrideType?: ClassifiedSourceFile['overrideType'],
): ClassifiedSourceFile {
  const analysis = classifySourceFile(fileName, [summarizeSheet(sheetName, rows)])
  return { analysis, sheets: new Map([[sheetName, rows]]), overrideType }
}

// ── AVANIIS-specific business rules ──────────────────────────────────────────

// B7/B8: Employees whose source position title maps incorrectly — direct code override.
// Injected as extra rows with 'Position Code' column into the POSITION_MAPPING data.
// The transformer's buildPositionByEmpMap() picks up 'position code' column directly.
const POSITION_OVERRIDES: Record<string, string> = {
  '450':  'COR-P005',  // Personal Assistant → CEO Office Assistant
  '1199': 'COR-P005',  // null title
  '1212': 'COR-P005',  // null title (not Hassan — B3)
  '1234': 'COR-P005',  // HR Assistant → CEO Office Assistant
  '1228': 'COR-P004',  // Hassan Elbijawi → Business Transformation Executor (corrected)
}

// Department heads (from manifest.ts — not in any source file)
const DEPT_HEAD_ROWS: RawSourceRow[] = [
  { 'Department Code': 'KPD-DP-001', 'Head Employee Number': 'K817'  },
  { 'Department Code': 'KPD-DP-002', 'Head Employee Number': 'K1051' },
  { 'Department Code': 'KPD-DP-003', 'Head Employee Number': 'K343'  },
  { 'Department Code': 'KPD-DP-004', 'Head Employee Number': 'K1207' },
  { 'Department Code': 'KPD-DP-005', 'Head Employee Number': 'K870'  },
  { 'Department Code': 'KPD-DP-006', 'Head Employee Number': 'K33'   },
]

// Pilot scope: only these 2 departments
const PILOT_DEPT_CODES = new Set(['KPD-DP-004', 'KPD-DP-006'])

// ── Transform context ─────────────────────────────────────────────────────────

function buildContext(): TransformContext {
  return {
    positions: [
      // Development & Project Delivery (DEV)
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
      // Finance & Strategic Control (FIN)
      { code: 'FIN-P001', titleEn: 'Chief Financial Officer' },
      { code: 'FIN-P002', titleEn: 'Finance Operations Manager' },
      { code: 'FIN-P003', titleEn: 'Senior Financial Specialist' },
      { code: 'FIN-P004', titleEn: 'Financial Accounting Specialist' },
      { code: 'FIN-P005', titleEn: 'Finance Operations Accountant' },
      { code: 'FIN-P006', titleEn: 'Financial Analyst Specialist' },
      // Commercial & Revenue Operations (COM)
      { code: 'COM-P001', titleEn: 'Senior Portfolio Manager - CRM & Collections' },
      { code: 'COM-P002', titleEn: 'Service Performance Analyst' },
      { code: 'COM-P003', titleEn: 'Commercial Operations Manager' },
      { code: 'COM-P004', titleEn: 'Commercial Contracts Manager' },
      { code: 'COM-P005', titleEn: 'Client Relationship Manager' },
      { code: 'COM-P006', titleEn: 'Security & Safety Manager' },
      { code: 'COM-P007', titleEn: 'Fleet & Logistics Coordinator' },
      { code: 'COM-P008', titleEn: 'Facilities & Services Manager' },
      { code: 'COM-P009', titleEn: 'Marine Operations Lead' },
      // Technology & Digital Transformation (TEC)
      { code: 'TEC-P001', titleEn: 'Director of Technology & Innovation' },
      { code: 'TEC-P002', titleEn: 'ConTech Innovation Manager' },
      { code: 'TEC-P002', titleEn: 'Contech Innovation Manager' },
      { code: 'TEC-P003', titleEn: 'Property Technology Manager' },
      { code: 'TEC-P004', titleEn: 'Enterprise Systems Manager' },
      { code: 'TEC-P005', titleEn: 'ERP Technical Lead' },
      { code: 'TEC-P006', titleEn: 'ConTech Technical Lead' },
      { code: 'TEC-P006', titleEn: 'Contech Technical Lead' },
      { code: 'TEC-P007', titleEn: 'Infrastructure Technology Lead' },
      { code: 'TEC-P008', titleEn: 'Mobility Technology Lead' },
      { code: 'TEC-P009', titleEn: 'IT Support Specialist' },
      { code: 'TEC-P010', titleEn: 'Salesforce Technology Lead' },
      // People & Organizational Intelligence (PEO)
      { code: 'PEO-P001', titleEn: 'HR Admin Operations Manager' },
      { code: 'PEO-P002', titleEn: 'Head of Governance & Compliance' },
      // Corporate Services & Governance (COR)
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
    // Fallback position when title lookup fails — per department
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

// ── V2ParsedPackage → XLSX ─────────────────────────────────────────────────────

// Column order must match the bulk-import template so v2-package-parser.ts
// can round-trip the file back to RawImportRow via parseSheet().
const EMP_HEADERS = [
  'Requires User', 'Employee Number', 'Full Name EN', 'Full Name AR',
  'Work Email', 'Personal Email', 'Mobile', 'Gender', 'Date of Birth',
  'Nationality Code', 'Marital Status', 'Legal Entity Code',
  'Department Code', 'Position Code', 'Grade Code', 'Location Code',
  'Line Manager Employee Number', 'Hire Date', 'Employment Type',
  'Basic Salary', 'Total Package', 'Contract Type',
  'Contract Start Date', 'Contract End Date', 'Probation End Date',
  'Passport Number', 'Emirates ID', 'Visa Number', 'Labour Card Number',
  'Insurance Plan Code',
] as const

const MGR_HEADERS  = ['Employee Number', 'Manager Employee Number'] as const
const HOD_HEADERS  = ['Department Code', 'Head Employee Number']    as const
// NOTE: header must be "Leave Year" not "Balance Year" — the v2-package-parser
// scans for "days" or "balance" substring for daysIdx; "Balance Year" would
// match daysIdx before "Opening Balance Days" and corrupt the load.
const LEAVE_HEADERS = ['Employee Number', 'Absence Type Code', 'Leave Year', 'Opening Balance Days'] as const

function empToRow(r: RawImportRow): Record<string, string> {
  return {
    'Requires User':               r.requiresUser              ?? '',
    'Employee Number':             r.employeeNumber             ?? '',
    'Full Name EN':                r.fullNameEn                 ?? '',
    'Full Name AR':                r.fullNameAr                 ?? '',
    'Work Email':                  r.workEmail                  ?? '',
    'Personal Email':              r.personalEmail              ?? '',
    'Mobile':                      r.mobile                     ?? '',
    'Gender':                      r.gender                     ?? '',
    'Date of Birth':               r.dateOfBirth                ?? '',
    'Nationality Code':            r.nationalityCode            ?? '',
    'Marital Status':              r.maritalStatus              ?? '',
    'Legal Entity Code':           r.legalEntityCode            ?? '',
    'Department Code':             r.departmentCode             ?? '',
    'Position Code':               r.positionCode               ?? '',
    'Grade Code':                  r.gradeCode                  ?? '',
    'Location Code':               r.locationCode               ?? '',
    'Line Manager Employee Number': r.lineManagerEmployeeNumber ?? '',
    'Hire Date':                   r.hireDate                   ?? '',
    'Employment Type':             r.employmentType             ?? '',
    'Basic Salary':                r.basicSalary                ?? '',
    'Total Package':               r.totalPackage               ?? '',
    'Contract Type':               r.contractType               ?? '',
    'Contract Start Date':         r.contractStartDate          ?? '',
    'Contract End Date':           r.contractEndDate            ?? '',
    'Probation End Date':          r.probationEndDate           ?? '',
    'Passport Number':             r.passportNumber             ?? '',
    'Emirates ID':                 r.emiratesId                 ?? '',
    'Visa Number':                 r.visaNumber                 ?? '',
    'Labour Card Number':          r.labourCardNumber           ?? '',
    'Insurance Plan Code':         r.insurancePlanCode          ?? '',
  }
}

function writePackageXlsx(pkg: V2ParsedPackage, outPath: string): void {
  const wb = XLSX.utils.book_new()
  const W  = { wch: 30 }

  const wsEmp = XLSX.utils.json_to_sheet(pkg.employees.map(empToRow), { header: [...EMP_HEADERS] })
  wsEmp['!cols'] = EMP_HEADERS.map(() => W)
  XLSX.utils.book_append_sheet(wb, wsEmp, 'Employees')

  const wsMgr = XLSX.utils.json_to_sheet(
    pkg.managers.map(r => ({ 'Employee Number': r.employeeNumber, 'Manager Employee Number': r.managerEmployeeNumber })),
    { header: [...MGR_HEADERS] },
  )
  wsMgr['!cols'] = MGR_HEADERS.map(() => W)
  XLSX.utils.book_append_sheet(wb, wsMgr, 'Managers')

  const wsHod = XLSX.utils.json_to_sheet(
    pkg.deptHeads.map(r => ({ 'Department Code': r.departmentCode, 'Head Employee Number': r.headEmployeeNumber })),
    { header: [...HOD_HEADERS] },
  )
  wsHod['!cols'] = HOD_HEADERS.map(() => W)
  XLSX.utils.book_append_sheet(wb, wsHod, 'DeptHeads')

  const wsLb = XLSX.utils.json_to_sheet(
    pkg.leaveBalances.map(r => ({
      'Employee Number':      r.employeeNumber,
      'Absence Type Code':    r.absenceTypeCode,
      'Leave Year':           r.balanceYear,
      'Opening Balance Days': r.openingBalanceDays,
    })),
    { header: [...LEAVE_HEADERS] },
  )
  wsLb['!cols'] = LEAVE_HEADERS.map(() => W)
  XLSX.utils.book_append_sheet(wb, wsLb, 'LeaveBalances')

  writeFileSync(outPath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n========================================')
console.log(` V2 WORKBOOK BUILD (${scope.toUpperCase()}) — Phase A service layer`)
console.log('========================================\n')

// 1. Load source files
const empRows   = loadSheet('04 Employee Master.xlsx')
const asnRows   = loadSheet('02 Employee Assignments.xlsx')
const leaveRows = loadSheet('04.1 Employee Leave Balance.xlsx', 3)
const posRows   = loadSheet('05 Mapping Old Position New Position.xlsx') as Array<Record<string, string | null>>
const userRows  = loadSheet('06 Users Data.xlsx')

// 2. Inject position overrides into the POSITION_MAPPING data
//    These employees have wrong/missing titles — assign codes directly
for (const [id, code] of Object.entries(POSITION_OVERRIDES)) {
  posRows.push({ 'ID': id, 'New Position': null, 'Position Code': code })
}

// 3. Build ClassifiedSourceFile[] — classifier detects each file type
const files: ClassifiedSourceFile[] = [
  makeFile('04 Employee Master.xlsx',                   'Employees',   empRows   as RawSourceRow[]),
  makeFile('02 Employee Assignments.xlsx',              'Assignments', asnRows   as RawSourceRow[]),
  makeFile('04.1 Employee Leave Balance.xlsx',          'LeaveData',   leaveRows as RawSourceRow[]),
  makeFile('05 Mapping Old Position New Position.xlsx', 'Positions',   posRows   as RawSourceRow[]),
  makeFile('06 Users Data.xlsx',                        'Users',       userRows  as RawSourceRow[]),
  // Synthetic dept-head file — no on-disk source; build from manifest
  {
    analysis: classifySourceFile('dept-heads.csv', [summarizeSheet('DeptHeads', DEPT_HEAD_ROWS)]),
    sheets:   new Map([['DeptHeads', DEPT_HEAD_ROWS]]),
    overrideType: 'DEPT_HEAD_MAPPING' as const,
  },
]

// 4. For pilot scope, filter employees + filter dept heads to 2 depts
let scopedFiles = files
if (scope === 'pilot') {
  // Load assignment data to find which employee IDs belong to pilot depts
  const pilotDeptNames = new Set([
    'Corporate Services & Governance',
    'Technology & Digital Transformation',
  ])
  const pilotEmpIds = new Set<string>()
  for (const row of asnRows) {
    const id   = String(row['Employee ID'] ?? '').trim()
    const dept = String(row['Department'] ?? '').trim()
    if (id && pilotDeptNames.has(dept)) pilotEmpIds.add(id)
  }
  // Filter employee rows and leave rows to pilot scope
  const filteredEmpRows   = (empRows as RawSourceRow[]).filter(r => {
    const id = String(r['Employee Number'] ?? '').trim()
    return pilotEmpIds.has(id)
  })
  const filteredLeaveRows = (leaveRows as RawSourceRow[]).filter(r => {
    const id = String(r['Person Number'] ?? '').trim()
    return pilotEmpIds.has(id)
  })
  const filteredDeptHeads = DEPT_HEAD_ROWS.filter(r => {
    const code = String(r['Department Code'] ?? '')
    return PILOT_DEPT_CODES.has(code)
  })

  scopedFiles = [
    makeFile('04 Employee Master.xlsx',                   'Employees',   filteredEmpRows),
    makeFile('02 Employee Assignments.xlsx',              'Assignments', asnRows as RawSourceRow[]),
    makeFile('04.1 Employee Leave Balance.xlsx',          'LeaveData',   filteredLeaveRows),
    makeFile('05 Mapping Old Position New Position.xlsx', 'Positions',   posRows as RawSourceRow[]),
    makeFile('06 Users Data.xlsx',                        'Users',       userRows as RawSourceRow[]),
    {
      analysis: classifySourceFile('dept-heads.csv', [summarizeSheet('DeptHeads', filteredDeptHeads)]),
      sheets:   new Map([['DeptHeads', filteredDeptHeads]]),
      overrideType: 'DEPT_HEAD_MAPPING' as const,
    },
  ]
}

// 5. Classify report
console.log('Source file classification:')
for (const f of scopedFiles) {
  const a   = f.analysis
  const type = f.overrideType ?? a.detectedType
  const rows = [...f.sheets.values()].reduce((s, r) => s + r.length, 0)
  console.log(`  ${a.confidence.padEnd(6)} ${type.padEnd(22)} ${String(rows).padStart(4)} rows  ${a.fileName}`)
}

// 6. Transform
const mode: MigrationMode = 'FULL_RELOAD'
const { package: pkg, summary } = transformSourceFiles(scopedFiles, { mode }, buildContext())

// 7. Validation + report
const issues: string[] = []
if (summary.blockers.length > 0) {
  summary.blockers.forEach(b => issues.push(`FAIL: [${b.field}] ${b.message}`))
}
if (pkg.employees.length === 0) {
  issues.push('FAIL: No employees in output')
}
const missingPos = pkg.employees.filter(r => !r.positionCode)
if (missingPos.length) {
  issues.push(`FAIL: ${missingPos.length} employees missing Position Code: ${missingPos.slice(0, 5).map(r => r.employeeNumber).join(', ')}`)
}
const missingDept = pkg.employees.filter(r => !r.departmentCode)
if (missingDept.length) {
  issues.push(`FAIL: ${missingDept.length} employees missing Department Code`)
}
const empNums = new Set(pkg.employees.map(r => r.employeeNumber))
if (empNums.size !== pkg.employees.length) issues.push('FAIL: Duplicate Employee Numbers')
const selfRefs = pkg.managers.filter(r => r.employeeNumber === r.managerEmployeeNumber)
if (selfRefs.length) issues.push(`FAIL: Self-referential manager links: ${selfRefs.map(r => r.employeeNumber).join(', ')}`)

// 8. Write output if no blockers
if (!summary.canBuild || issues.some(i => i.startsWith('FAIL'))) {
  console.log('\nBuild BLOCKED — fix FAILs before uploading:\n')
  issues.forEach(i => console.log(`  ${i}`))
  process.exit(1)
}

writePackageXlsx(pkg, OUT_FILE)

// 9. Final report
const hasWarnings = summary.warnings.length > 0
const verdict     = hasWarnings ? 'READY WITH WARNINGS' : 'READY'

console.log('\nTransformation summary:')
console.log(`  Employees included:    ${summary.employeesIncluded}`)
console.log(`  Employees skipped:     ${summary.employeesSkipped}`)
console.log(`  Managers resolved:     ${summary.managersResolved}`)
console.log(`  Dept heads set:        ${summary.deptHeadsResolved}`)
console.log(`  Leave balances:        ${summary.leaveBalancesDetected}`)
console.log(`  Users matched:         ${summary.usersMatched}`)
console.log(`  Mobiles normalised:    ${summary.mobileNormalized}`)
console.log(`  Positions from mapping:${summary.positionsFromMapping}`)
console.log(`  Positions (fallback):  ${summary.positionsFallback}`)
console.log(`  Positions missing:     ${summary.positionsMissing}`)

if (summary.warnings.length > 0) {
  console.log(`\nWarnings (${summary.warnings.length}):`)
  summary.warnings.slice(0, 10).forEach(w => console.log(`  [${w.employeeNumber ?? '—'}] ${w.field}: ${w.message}`))
  if (summary.warnings.length > 10) console.log(`  ... and ${summary.warnings.length - 10} more`)
}

console.log(`\nOutput: ${OUT_FILE}`)
console.log(`Sheets:  Employees(${pkg.employees.length}) Managers(${pkg.managers.length}) DeptHeads(${pkg.deptHeads.length}) LeaveBalances(${pkg.leaveBalances.length})`)
console.log(`\n========================================`)
console.log(` VERDICT: ${verdict}`)
console.log('========================================\n')
console.log('Next step: upload the .xlsx in')
console.log('Enterprise Data Migration Factory → Step 6 (Build Migration Package)\n')
