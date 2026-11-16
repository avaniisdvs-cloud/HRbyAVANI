/**
 * Excel template generator for bulk employee import.
 * Produces a .xlsx workbook with:
 *   Sheet 1 — Instructions
 *   Sheet 2 — Employees (data entry, headers styled)
 *   Sheets 3–9 — Reference data (Legal Entities, Depts, Positions, Grades,
 *                Locations, Employment Types, Nationalities)
 *
 * Uses the xlsx package already in package.json (^0.18.5).
 * Pure function — no DB calls; reference data is passed in as params.
 */
import * as XLSX from 'xlsx'

// ── Column headers (must stay in sync with COLUMN_MAP in row-validator.ts) ─

export const EMPLOYEE_HEADERS = [
  'Requires User',
  'Employee Number',
  'Full Name EN',
  'Full Name AR',
  'Work Email',
  'Personal Email',
  'Mobile',
  'Gender',
  'Date of Birth',
  'Nationality Code',
  'Marital Status',
  'Legal Entity Code',
  'Department Code',
  'Position Code',
  'Grade Code',
  'Location Code',
  'Line Manager Employee Number',
  'Hire Date',
  'Employment Type',
  'Basic Salary',
  'Total Package',
  'Contract Type',
  'Contract Start Date',
  'Contract End Date',
  'Probation End Date',
  'Passport Number',
  'Emirates ID',
  'Visa Number',
  'Labour Card Number',
  'Insurance Plan Code',
] as const

export interface TemplateRefData {
  legalEntities: { code: string; nameEn: string }[]
  departments:   { code: string; nameEn: string; entityCode: string }[]
  positions:     { code: string; titleEn: string; entityCode: string }[]
  grades:        { code: string; nameEn: string }[]
  locations:     { code: string; nameEn: string }[]
}

// ── Instructions content ───────────────────────────────────────────────────

const INSTRUCTIONS: [string, string][] = [
  ['AVANIIS HR — Bulk Employee Import Template', ''],
  ['', ''],
  ['HOW TO USE', ''],
  ['1.', 'Fill the "Employees" sheet. Do NOT change the column headers.'],
  ['2.', 'Use the reference sheets (Legal Entities, Departments, etc.) to find valid codes.'],
  ['3.', 'Upload the completed file in People → Import Employees.'],
  ['4.', 'Review the validation preview before confirming the import.'],
  ['', ''],
  ['MANDATORY COLUMNS', ''],
  ['Full Name EN', 'Employee full name in English. Required.'],
  ['Legal Entity Code', 'Must match a code in the Legal Entities sheet.'],
  ['Department Code', 'Must match a code in the Departments sheet.'],
  ['Position Code', 'Must match a code in the Positions sheet.'],
  ['Grade Code', 'Must match a code in the Grades sheet.'],
  ['Hire Date', 'Format: YYYY-MM-DD (e.g. 2024-01-15). Required.'],
  ['Employment Type', 'One of: FULL_TIME, PART_TIME, TEMPORARY, TASK_BASED, FLEXIBLE, REMOTE, SHARED. Required.'],
  ['Date of Birth', 'Format: YYYY-MM-DD. Required.'],
  ['Nationality Code', 'ISO 3166-1 alpha-3 country code (e.g. ARE, GBR, IND). Required.'],
  ['', ''],
  ['CONDITIONAL COLUMNS', ''],
  ['Requires User', 'YES or NO. Blank defaults to YES. If YES, Work Email is mandatory.'],
  ['Work Email', 'Mandatory when Requires User = YES. Must be unique in the system.'],
  ['', ''],
  ['OPTIONAL COLUMNS', ''],
  ['Employee Number', 'Leave blank to auto-generate based on entity sequence.'],
  ['Full Name AR', 'Arabic full name. If blank, Full Name EN is used as fallback.'],
  ['Personal Email', 'Secondary personal email address.'],
  ['Mobile', 'Mobile number (e.g. +971501234567).'],
  ['Gender', 'MALE, FEMALE, or NOT_SPECIFIED. Defaults to NOT_SPECIFIED if blank.'],
  ['Marital Status', 'SINGLE, MARRIED, DIVORCED, WIDOWED, or NOT_SPECIFIED.'],
  ['Location Code', 'Must match a code in the Locations sheet.'],
  ['Line Manager Employee Number', 'Employee Number of the line manager. Must already exist in the system.'],
  ['Basic Salary', 'Numeric value in AED (e.g. 15000).'],
  ['Total Package', 'Numeric value in AED (e.g. 20000).'],
  ['Contract Type', 'FIXED_TERM or UNLIMITED. Defaults to FIXED_TERM.'],
  ['Contract Start Date', 'Format: YYYY-MM-DD. Defaults to Hire Date if blank.'],
  ['Contract End Date', 'Format: YYYY-MM-DD. Required for FIXED_TERM contracts.'],
  ['Probation End Date', 'Format: YYYY-MM-DD. Max 6 months from Hire Date (BR-PR-001).'],
  ['Passport Number', 'Stored encrypted. Optional.'],
  ['Emirates ID', 'Format: 784-XXXX-XXXXXXX-X. Stored encrypted. Optional.'],
  ['Visa Number', 'UAE residency visa number. Optional.'],
  ['Labour Card Number', 'MOHRE labour card number. Optional.'],
  ['Insurance Plan Code', 'Must match a code in the system (optional at import).'],
  ['', ''],
  ['PII NOTICE', ''],
  ['', 'Emirates ID, Passport Number, Visa Number and Labour Card Number are encrypted at rest.'],
  ['', 'Access is restricted to authorised HR roles per UAE PDPL requirements.'],
]

// ── Build workbook ─────────────────────────────────────────────────────────

export function buildImportTemplate(refs: TemplateRefData, companyName = 'AVANIIS'): Buffer {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Instructions ───────────────────────────────────────────────
  const instrWs = XLSX.utils.aoa_to_sheet([[`${companyName} HR — Bulk Employee Import Template`, ''], ...INSTRUCTIONS.slice(1)])
  instrWs['!cols'] = [{ wch: 35 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(wb, instrWs, 'Instructions')

  // ── Sheet 2: Employees ─────────────────────────────────────────────────
  const empWs = XLSX.utils.aoa_to_sheet([EMPLOYEE_HEADERS as unknown as string[]])
  empWs['!cols'] = EMPLOYEE_HEADERS.map(() => ({ wch: 24 }))
  // Sample row to guide users
  XLSX.utils.sheet_add_aoa(empWs, [[
    'YES', '', 'Jane Smith', 'جين سميث', 'jane.smith@company.com',
    '', '+971501234567', 'FEMALE', '1990-05-15', 'GBR',
    'SINGLE', refs.legalEntities[0]?.code ?? 'AVN',
    refs.departments[0]?.code ?? 'FIN',
    refs.positions[0]?.code ?? 'POS001',
    refs.grades[0]?.code ?? 'G1',
    refs.locations[0]?.code ?? 'DXB',
    '', '2024-01-15', 'FULL_TIME', '15000', '20000',
    'FIXED_TERM', '2024-01-15', '2025-01-14', '2024-07-15',
    '', '', '', '', '',
  ]], { origin: 'A2' })
  XLSX.utils.book_append_sheet(wb, empWs, 'Employees')

  // ── Sheet 3: Legal Entities ────────────────────────────────────────────
  const leRows = [
    ['Code', 'Name (EN)'],
    ...refs.legalEntities.map(e => [e.code, e.nameEn]),
  ]
  const leWs = XLSX.utils.aoa_to_sheet(leRows)
  leWs['!cols'] = [{ wch: 15 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, leWs, 'Legal Entities')

  // ── Sheet 4: Departments ───────────────────────────────────────────────
  const deptRows = [
    ['Code', 'Name (EN)', 'Entity Code'],
    ...refs.departments.map(d => [d.code, d.nameEn, d.entityCode]),
  ]
  const deptWs = XLSX.utils.aoa_to_sheet(deptRows)
  deptWs['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, deptWs, 'Departments')

  // ── Sheet 5: Positions ─────────────────────────────────────────────────
  const posRows = [
    ['Code', 'Title (EN)', 'Entity Code'],
    ...refs.positions.map(p => [p.code, p.titleEn, p.entityCode]),
  ]
  const posWs = XLSX.utils.aoa_to_sheet(posRows)
  posWs['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, posWs, 'Positions')

  // ── Sheet 6: Grades ────────────────────────────────────────────────────
  const gradeRows = [
    ['Code', 'Name (EN)'],
    ...refs.grades.map(g => [g.code, g.nameEn]),
  ]
  const gradeWs = XLSX.utils.aoa_to_sheet(gradeRows)
  gradeWs['!cols'] = [{ wch: 15 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, gradeWs, 'Grades')

  // ── Sheet 7: Locations ─────────────────────────────────────────────────
  const locRows = [
    ['Code', 'Name (EN)'],
    ...refs.locations.map(l => [l.code, l.nameEn]),
  ]
  const locWs = XLSX.utils.aoa_to_sheet(locRows)
  locWs['!cols'] = [{ wch: 15 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, locWs, 'Locations')

  // ── Sheet 8: Employment Types ──────────────────────────────────────────
  const etRows = [
    ['Code', 'Description'],
    ['FULL_TIME',   'Regular full-time employment'],
    ['PART_TIME',   'Part-time employment'],
    ['TEMPORARY',   'Fixed-duration temporary contract'],
    ['TASK_BASED',  'Project / task-based engagement'],
    ['FLEXIBLE',    'Flexible working arrangement'],
    ['REMOTE',      'Fully remote employment'],
    ['SHARED',      'Shared (split between entities)'],
  ]
  const etWs = XLSX.utils.aoa_to_sheet(etRows)
  etWs['!cols'] = [{ wch: 18 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, etWs, 'Employment Types')

  // ── Sheet 9: Common Nationalities ─────────────────────────────────────
  const natRows = [
    ['ISO Code', 'Country'],
    ['ARE', 'United Arab Emirates'],
    ['SAU', 'Saudi Arabia'],
    ['KWT', 'Kuwait'],
    ['BHR', 'Bahrain'],
    ['QAT', 'Qatar'],
    ['OMN', 'Oman'],
    ['EGY', 'Egypt'],
    ['IND', 'India'],
    ['PAK', 'Pakistan'],
    ['PHL', 'Philippines'],
    ['BGD', 'Bangladesh'],
    ['LKA', 'Sri Lanka'],
    ['NPL', 'Nepal'],
    ['GBR', 'United Kingdom'],
    ['USA', 'United States'],
    ['CAN', 'Canada'],
    ['AUS', 'Australia'],
    ['JOR', 'Jordan'],
    ['LBN', 'Lebanon'],
    ['SDN', 'Sudan'],
    ['ETH', 'Ethiopia'],
  ]
  const natWs = XLSX.utils.aoa_to_sheet(natRows)
  natWs['!cols'] = [{ wch: 12 }, { wch: 35 }]
  XLSX.utils.book_append_sheet(wb, natWs, 'Nationalities')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return Buffer.from(buf)
}
