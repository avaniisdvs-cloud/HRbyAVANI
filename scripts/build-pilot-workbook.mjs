/**
 * build-pilot-workbook.mjs
 *
 * READ-ONLY from source files. Writes only to hr_data_migration/UAT/pilot_*.
 * Does NOT touch the database. Does NOT seed. Does NOT import.
 *
 * Produces TWO files for a two-pass pilot load:
 *   Part 1 — Talal only (root, no manager)
 *   Part 2 — Remaining 20 employees with lineManager = 33 (Talal)
 *
 * Decisions applied:
 *   B1: Talal (33) loads as root  → Line Manager = blank
 *   B2: IDs 1199, 1212, 450, 1234 → COR-P005 (Office Assistant)
 *   B3: ID 1228 = Hassan Elbijawi  → COR-P004 (corrected from mapping file error)
 *   Risks accepted: 643 personal Gmail, 450 no user record — load as-is
 */

import * as XLSX from 'xlsx'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UAT_DIR   = join(__dirname, '../hr_data_migration/UAT')
const OUT_DIR   = UAT_DIR

// ── Helpers ──────────────────────────────────────────────────────────────────

function readSheet(filename, sheetIndex = 0, headerRow = 1) {
  const buf = readFileSync(join(UAT_DIR, filename))
  const wb  = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const ws  = wb.Sheets[wb.SheetNames[sheetIndex]]
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: false, range: headerRow - 1 })
}

function fmtDate(val) {
  if (!val) return ''
  // Handle Date objects from xlsx
  if (val instanceof Date) {
    return val.toISOString().split('T')[0]
  }
  const s = String(val).trim()
  if (!s) return ''
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD-Mon-YYYY  e.g. 01-Nov-2016
  const m = s.match(/^(\d{1,2})[-\/]([A-Za-z]+|\d{1,2})[-\/](\d{4})$/)
  if (m) {
    const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                     jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }
    const mm = months[m[2].toLowerCase()] ?? m[2].padStart(2,'0')
    return `${m[3]}-${mm}-${m[1].padStart(2,'0')}`
  }
  return s
}

// ── Load source sheets ────────────────────────────────────────────────────────

const empMaster      = readSheet('04 Employee Master.xlsx')          // Person Information
const assignments    = readSheet('02 Employee Assignments.xlsx')     // Assignment Information
const leaveBalances  = readSheet('04.1 Employee Leave Balance.xlsx', 0, 3) // row 3 is header
const posMapping     = readSheet('05 Mapping Old Position New Position.xlsx')
const usersData      = readSheet('06 Users Data.xlsx')

// ── Build lookup maps ─────────────────────────────────────────────────────────

// assignments keyed by Employee ID
const assignByEmpId = new Map()
for (const a of assignments) {
  const id = String(a['Employee ID'] ?? '').trim()
  if (id) assignByEmpId.set(id, a)
}

// leave balance keyed by Person Number
const leaveByEmpId = new Map()
for (const l of leaveBalances) {
  const id = String(l['Person Number'] ?? '').trim()
  if (id) leaveByEmpId.set(id, l)
}

// Manifest title → position code lookup (all 48 positions)
const TITLE_TO_CODE = {
  'director of project delivery':                        'DEV-P001',
  'senior design architect':                             'DEV-P002',
  'design & creative manager':                           'DEV-P003',
  'lead design architect':                               'DEV-P004',
  'branding & communications manager':                   'DEV-P005',
  'junior design architect':                             'DEV-P006',
  'senior project control specialist':                   'DEV-P007',
  'project architect':                                   'DEV-P008',
  'site operations supervisor':                          'DEV-P009',
  'quality assurance specialist':                        'DEV-P010',
  'qa/qc inspector':                                     'DEV-P011',
  'ai project coordinator':                              'DEV-P012',
  'project documentation manager':                       'DEV-P013',
  'project operations specialist':                       'DEV-P014',
  'project engineering specialist':                      'DEV-P015',
  'chief financial officer':                             'FIN-P001',
  'finance operations manager':                          'FIN-P002',
  'senior financial specialist':                         'FIN-P003',
  'financial accounting specialist':                     'FIN-P004',
  'finance operations accountant':                       'FIN-P005',
  'financial analyst specialist':                        'FIN-P006',
  'senior portfolio manager - crm & collections':        'COM-P001',
  'service performance analyst':                         'COM-P002',
  'commercial operations manager':                       'COM-P003',
  'commercial contracts manager':                        'COM-P004',
  'client relationship manager':                         'COM-P005',
  'security & safety manager':                           'COM-P006',
  'fleet & logistics coordinator':                       'COM-P007',
  'facilities & services manager':                       'COM-P008',
  'marine operations lead':                              'COM-P009',
  'director of technology & innovation':                 'TEC-P001',
  'conttech innovation manager':                         'TEC-P002',
  'contech innovation manager':                          'TEC-P002',
  'contech innovation manager':                          'TEC-P002',
  'property technology manager':                         'TEC-P003',
  'enterprise systems manager':                          'TEC-P004',
  'erp technical lead':                                  'TEC-P005',
  'contech technical lead':                              'TEC-P006',
  'conttech technical lead':                             'TEC-P006',
  'contech technical lead':                              'TEC-P006',
  'infrastructure technology lead':                      'TEC-P007',
  'mobility technology lead':                            'TEC-P008',
  'it support specialist':                               'TEC-P009',
  'salesforce technology lead':                          'TEC-P010',
  'hr admin operations manager':                         'PEO-P001',
  'head of governance & compliance':                     'PEO-P002',
  'chief executive officer & strategic leader':          'COR-P001',
  'strategic operations lead':                           'COR-P002',
  'business transformation coordinator':                 'COR-P003',
  'business transformation executor':                    'COR-P004',
  'ceo office assistant':                                'COR-P005',
  'operations executive':                                'COR-P006',
}

// position mapping: employee ID → new position code via title lookup (B3 correction applied)
const posByEmpId = new Map()
for (const p of posMapping) {
  const id    = String(p['ID'] ?? '').trim()
  const title = String(p['New Position'] ?? '').trim().toLowerCase()
  const code  = TITLE_TO_CODE[title]
  if (id && code) posByEmpId.set(id, code)
}

// users keyed by username (email)
const userByEmail = new Map()
for (const u of usersData) {
  const email = String(u['USERNAME'] ?? u['Email'] ?? '').trim().toLowerCase()
  if (email) userByEmail.set(email, u)
}

// ── Pilot employee IDs ────────────────────────────────────────────────────────

const PILOT_DEPTS = new Set([
  'Corporate Services & Governance',
  'Technology & Digital Transformation',
])

const pilotIds = new Set()
for (const a of assignments) {
  const dept = String(a['Department'] ?? '').trim()
  const id   = String(a['Employee ID'] ?? '').trim()
  if (PILOT_DEPTS.has(dept) && id) pilotIds.add(id)
}

// ── B2 overrides: IDs with null/unmapped positions → COR-P005 ────────────────
const POSITION_OVERRIDES = {
  '450':  'COR-P005',  // Personal Assistant → Office Assistant
  '1199': 'COR-P005',  // null
  '1212': 'COR-P005',  // null (not Hassan — B3: Hassan is 1228)
  '1234': 'COR-P005',  // HR Assistant → Office Assistant
  '1228': 'COR-P004',  // B3 correction: Hassan Elbijawi → Business Transformation Executor
}

// ── Dept name → manifest code ─────────────────────────────────────────────────
const DEPT_CODE = {
  'Corporate Services & Governance':      'KPD-DP-006',
  'Technology & Digital Transformation':  'KPD-DP-004',
}

// ── Nationality name → ISO 3166-1 alpha-3 (common in this dataset) ───────────
const NAT_CODE = {
  'syrian arab republic': 'SYR', 'syrian': 'SYR',
  'united arab emirates': 'ARE', 'emirati': 'ARE',
  'indian': 'IND', 'india': 'IND',
  'pakistani': 'PAK', 'pakistan': 'PAK',
  'philippine': 'PHL', 'filipino': 'PHL', 'philippines': 'PHL',
  'bangladeshi': 'BGD', 'bangladesh': 'BGD',
  'jordanian': 'JOR', 'jordan': 'JOR',
  'lebanese': 'LBN', 'lebanon': 'LBN',
  'egyptian': 'EGY', 'egypt': 'EGY',
  'saudi': 'SAU', 'saudi arabian': 'SAU',
  'zimbabwean': 'ZWE', 'zimbabwe': 'ZWE',
  'south african': 'ZAF', 'south africa': 'ZAF',
  'kuwaiti': 'KWT', 'kuwait': 'KWT',
  'british': 'GBR', 'united kingdom': 'GBR',
  'american': 'USA', 'united states': 'USA',
  'sudanese': 'SDN', 'sudan': 'SDN',
  'iraqi': 'IRQ', 'iraq': 'IRQ',
  'yemeni': 'YEM', 'yemen': 'YEM',
  'libyan': 'LBY', 'libya': 'LBY',
  'moroccan': 'MAR', 'morocco': 'MAR',
  'turkish': 'TUR', 'turkey': 'TUR',
  'iranian': 'IRN', 'iran': 'IRN',
  'nepalese': 'NPL', 'nepal': 'NPL',
  'sri lankan': 'LKA', 'sri lanka': 'LKA',
}

function natCode(raw) {
  if (!raw) return 'ARE'
  const k = String(raw).trim().toLowerCase()
  if (/^[a-z]{3}$/.test(k)) return k.toUpperCase() // already ISO3
  return NAT_CODE[k] ?? 'ARE'
}

// ── Build import rows ─────────────────────────────────────────────────────────

const HEADERS = [
  'Requires User', 'Employee Number', 'Full Name EN', 'Full Name AR',
  'Work Email', 'Personal Email', 'Mobile', 'Gender', 'Date of Birth',
  'Nationality Code', 'Marital Status', 'Legal Entity Code',
  'Department Code', 'Position Code', 'Grade Code', 'Location Code',
  'Line Manager Employee Number', 'Hire Date', 'Employment Type',
  'Basic Salary', 'Total Package', 'Contract Type',
  'Contract Start Date', 'Contract End Date', 'Probation End Date',
  'Passport Number', 'Emirates ID', 'Visa Number', 'Labour Card Number',
  'Insurance Plan Code',
]

function buildRow(emp, lineManager) {
  const id     = String(emp['Employee Number'] ?? '').trim()
  const assign = assignByEmpId.get(id) ?? {}
  const dept   = String(assign['Department'] ?? '').trim()

  // Position: override map first, then File 05 mapping
  let posCode = POSITION_OVERRIDES[id]
  if (!posCode) {
    posCode = posByEmpId.get(id) ?? ''
  }

  // Email
  const workEmail = String(emp['Primary Email Address'] ?? '').trim()

  // Nationality
  const nat = natCode(emp['Nationality'])

  // Employment type default
  const empType = String(assign['Assignment Category'] ?? '').toUpperCase().trim() || 'FULL_TIME'
  const validTypes = new Set(['FULL_TIME','PART_TIME','TEMPORARY','TASK_BASED','FLEXIBLE','REMOTE','SHARED'])
  const finalEmpType = validTypes.has(empType) ? empType : 'FULL_TIME'

  // Contract
  const contractStart = fmtDate(assign['Contract Start Date'])
  const contractEnd   = fmtDate(assign['Contract End Date'])
  const probEnd       = fmtDate(assign['Probation End Date'])

  // User provisioning: skip if personal email or no user record
  const hasUser = userByEmail.has(workEmail.toLowerCase())
  const requiresUser = workEmail && workEmail.includes('@') && hasUser ? 'YES' : 'NO'

  return {
    'Requires User':                requiresUser,
    'Employee Number':               id ? `K${id}` : '',
    'Full Name EN':                  String(emp['Full Name'] ?? '').trim(),
    'Full Name AR':                  '',
    'Work Email':                    workEmail,
    'Personal Email':                '',
    'Mobile':                        String(emp['Work Mobile Phone Number'] ?? '').trim(),
    'Gender':                        String(emp['Gender'] ?? 'NOT_SPECIFIED').toUpperCase().trim() || 'NOT_SPECIFIED',
    'Date of Birth':                 fmtDate(emp['Date of Birth']),
    'Nationality Code':              nat,
    'Marital Status':                String(emp['Marital Status'] ?? 'NOT_SPECIFIED').toUpperCase().replace(/ /g,'_').trim() || 'NOT_SPECIFIED',
    'Legal Entity Code':             'AVN-001',
    'Department Code':               DEPT_CODE[dept] ?? '',
    'Position Code':                 posCode,
    'Grade Code':                    'KPD-G-01',
    'Location Code':                 'KPD-LOC-01',
    'Line Manager Employee Number':  lineManager ?? '',
    'Hire Date':                     fmtDate(assign['Contract Start Date'] ?? emp['Date of Joining']),
    'Employment Type':               finalEmpType,
    'Basic Salary':                  '',
    'Total Package':                 '',
    'Contract Type':                 'FIXED_TERM',
    'Contract Start Date':           contractStart,
    'Contract End Date':             contractEnd,
    'Probation End Date':            probEnd,
    'Passport Number':               String(emp['Passport Number'] ?? '').trim(),
    'Emirates ID':                   String(emp['EID'] ?? '').trim(),
    'Visa Number':                   String(emp['Visa Number'] ?? '').trim(),
    'Labour Card Number':            '',
    'Insurance Plan Code':           '',
  }
}

// ── Filter and split into Part 1 (Talal) and Part 2 (remaining 20) ────────────

const part1Rows = []  // Talal only
const part2Rows = []  // remaining 20, manager = K33

for (const emp of empMaster) {
  const id = String(emp['Employee Number'] ?? '').trim()
  if (!pilotIds.has(id)) continue

  if (id === '33') {
    // B1: Talal = root, no manager
    part1Rows.push(buildRow(emp, ''))
  } else {
    // Manager field left blank — set post-import via Edit Person → Line Manager
    part2Rows.push(buildRow(emp, ''))
  }
}

// ── Validation checks ─────────────────────────────────────────────────────────

const allRows   = [...part1Rows, ...part2Rows]
const totalEmps = allRows.length

const deptSet = new Set(allRows.map(r => r['Department Code']))
const empNums = allRows.map(r => r['Employee Number'])
const uniqueNums = new Set(empNums)
const emails  = allRows.map(r => r['Work Email']).filter(Boolean)
const uniqueEmails = new Set(emails)

const leaveCount = [...pilotIds].filter(id => leaveByEmpId.has(id)).length

const issues = []
if (totalEmps !== 21)         issues.push(`FAIL: Expected 21 rows, got ${totalEmps}`)
if (deptSet.size !== 2)       issues.push(`FAIL: Expected 2 dept codes, got ${deptSet.size}: ${[...deptSet].join(', ')}`)
if (uniqueNums.size !== 21)   issues.push(`FAIL: Duplicate employee numbers detected`)
if (uniqueEmails.size !== emails.length) issues.push('WARN: Duplicate work emails detected')
if (leaveCount !== 21)        issues.push(`WARN: Leave balance rows matched ${leaveCount}/21`)

const missingPos = allRows.filter(r => !r['Position Code'])
if (missingPos.length) issues.push(`FAIL: ${missingPos.length} rows missing Position Code: ${missingPos.map(r=>r['Employee Number']).join(', ')}`)

const missingDob = allRows.filter(r => !r['Date of Birth'])
if (missingDob.length) issues.push(`WARN: ${missingDob.length} rows missing Date of Birth`)

const missingHire = allRows.filter(r => !r['Hire Date'])
if (missingHire.length) issues.push(`WARN: ${missingHire.length} rows missing Hire Date`)

// ── Write output workbooks ────────────────────────────────────────────────────

function writeWorkbook(rows, filename) {
  const wb  = XLSX.utils.book_new()
  const ws  = XLSX.utils.json_to_sheet(rows, { header: HEADERS })
  ws['!cols'] = HEADERS.map(() => ({ wch: 26 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Employees')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  writeFileSync(join(OUT_DIR, filename), buf)
}

writeWorkbook(part1Rows, 'pilot_part1_talal_root.xlsx')
writeWorkbook(part2Rows, 'pilot_part2_remaining_20.xlsx')

// ── Report ────────────────────────────────────────────────────────────────────

console.log('\n=== PILOT WORKBOOK BUILD REPORT ===\n')
console.log(`Part 1 (Talal root):   ${part1Rows.length} row(s)  → pilot_part1_talal_root.xlsx`)
console.log(`Part 2 (remaining 20): ${part2Rows.length} row(s)  → pilot_part2_remaining_20.xlsx`)
console.log(`Total employees:       ${totalEmps}`)
console.log(`Departments:           ${[...deptSet].join(', ')}`)
console.log(`Leave balances matched: ${leaveCount} / 21`)
console.log(`Unique emp numbers:    ${uniqueNums.size}`)
console.log(`Unique emails:         ${uniqueEmails.size}`)
console.log(`\nValidation issues (${issues.length}):`)
if (issues.length === 0) console.log('  PASS — no issues')
else issues.forEach(i => console.log(`  ${i}`))
console.log('\n=== KNOWN RISKS (accepted) ===')
console.log('  R1: ID 643 uses personal Gmail abdullahalialthaf@gmail.com — no user account')
console.log('  R2: ID 450 (Fadi Addas) has no Users file record — no user account')
console.log('  R3: IDs 1199, 1212, 450, 1234 share COR-P005 Office Assistant position')
console.log('  R4: All Part 2 manager references resolve only after Part 1 is loaded')
console.log('\n=== TWO-PASS LOAD SEQUENCE ===')
console.log('  Pass 1: Upload pilot_part1_talal_root.xlsx → validate → Confirm Load')
console.log('  Pass 2: Upload pilot_part2_remaining_20.xlsx → validate → Confirm Load')
console.log('  (Do NOT upload Part 2 before Part 1 is committed to DB)\n')
