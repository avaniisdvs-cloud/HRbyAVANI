/**
 * Source file transformer — Enterprise Data Migration Factory.
 *
 * Converts classified source files into a V2ParsedPackage identical in format
 * to what parseMigrationPackageFile() produces from a pre-built 4-sheet workbook.
 * The resulting package feeds directly into validateMigrationPackage() → executeMigrationV2().
 *
 * This module contains the logic extracted from scripts/build-full-v2-workbook.mjs,
 * rewritten as a reusable, pure TypeScript service.
 *
 * PURE — no DB access, no filesystem I/O, no side effects.
 * All reference data (positions, departments, grades, locations) is passed
 * via TransformContext. The caller loads that from the DB before calling
 * transformSourceFiles().
 */

import type { RawImportRow }      from '../core-hr/bulk-import/types'
import type {
  RawManagerRow, RawDeptHeadRow, RawLeaveBalanceRow, V2ParsedPackage,
} from './v2-types'
import type {
  ClassifiedSourceFile, TransformContext, TransformOptions,
  TransformationSummary, TransformWarning, TransformBlocker, RawSourceRow,
} from './source-types'
import { effectiveType } from './source-classifier'

// ── UAE mobile number normalization ──────────────────────────────────────────
// Mirrors modules/core-hr/bulk-import/row-validator.ts
// Applied at transform time so the package already contains normalised numbers.

export function normalizeUaeMobile(raw: string | null | undefined): string {
  if (!raw) return ''
  const cleaned = String(raw).replace(/[\s\-().]/g, '')
  if (!cleaned) return ''
  if (/^\+971\d{8,9}$/.test(cleaned)) return cleaned
  if (/^971\d{8,9}$/.test(cleaned))   return '+' + cleaned
  if (/^0\d{9}$/.test(cleaned))       return '+971' + cleaned.slice(1)
  if (/^[5-9]\d{8}$/.test(cleaned))   return '+971' + cleaned
  return String(raw).trim()  // cannot normalize — return original; V2 validator will flag it
}

// ── Date formatting ───────────────────────────────────────────────────────────
// Handles YYYY-MM-DD, DD-Mon-YYYY, DD/MM/YYYY, Date objects

export function formatSourceDate(val: unknown): string {
  if (!val) return ''
  if (val instanceof Date) return isNaN(val.getTime()) ? '' : val.toISOString().split('T')[0]
  const s = String(val).trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // ISO datetime string produced by XLSX when cellDates:true
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.split('T')[0]
  const m = s.match(/^(\d{1,2})[-\/]([A-Za-z]+|\d{1,2})[-\/](\d{4})$/)
  if (m) {
    const months: Record<string, string> = {
      jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
      jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
    }
    const mm = months[m[2].toLowerCase()] ?? m[2].padStart(2, '0')
    return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`
  }
  return s
}

// ── Nationality code resolution ───────────────────────────────────────────────
// Accepts free-text nationality names and returns ISO 3166-1 alpha-3 codes.
// Defaults to 'ARE' (UAE) when the name is unrecognised — same as the scripts.

const NATIONALITY_CODES: Record<string, string> = {
  'syrian arab republic':'SYR', 'syrian':'SYR',
  'united arab emirates':'ARE', 'emirati':'ARE',
  'indian':'IND',               'india':'IND',
  'pakistani':'PAK',            'pakistan':'PAK',
  'philippine':'PHL',           'filipino':'PHL',    'philippines':'PHL',
  'bangladeshi':'BGD',          'bangladesh':'BGD',
  'jordanian':'JOR',            'jordan':'JOR',
  'lebanese':'LBN',             'lebanon':'LBN',
  'egyptian':'EGY',             'egypt':'EGY',
  'saudi':'SAU',                'saudi arabian':'SAU',
  'zimbabwean':'ZWE',           'zimbabwe':'ZWE',
  'south african':'ZAF',        'south africa':'ZAF',
  'kuwaiti':'KWT',              'kuwait':'KWT',
  'british':'GBR',              'united kingdom':'GBR',
  'american':'USA',             'united states':'USA',
  'sudanese':'SDN',             'sudan':'SDN',
  'iraqi':'IRQ',                'iraq':'IRQ',
  'yemeni':'YEM',               'yemen':'YEM',
  'libyan':'LBY',               'libya':'LBY',
  'moroccan':'MAR',             'morocco':'MAR',
  'turkish':'TUR',              'turkey':'TUR',
  'iranian':'IRN',              'iran':'IRN',
  'nepalese':'NPL',             'nepal':'NPL',
  'sri lankan':'LKA',           'sri lanka':'LKA',
  'kenyan':'KEN',               'kenya':'KEN',
  'canadian':'CAN',             'canada':'CAN',
  'australian':'AUS',           'australia':'AUS',
  'tunisian':'TUN',             'tunisia':'TUN',
}

export function resolveNationalityCode(raw: string | null | undefined): { code: string; warning?: string } {
  if (!raw || !String(raw).trim()) {
    return { code: 'ARE', warning: 'Nationality is blank — defaulted to ARE (UAE)' }
  }
  const k = String(raw).trim().toLowerCase()
  if (/^[a-z]{3}$/.test(k)) return { code: k.toUpperCase() }  // already ISO3 — trust it
  const mapped = NATIONALITY_CODES[k]
  if (mapped) return { code: mapped }
  return { code: 'ARE', warning: `Nationality "${String(raw).trim()}" not recognized — defaulted to ARE (UAE)` }
}

// ── Valid employment types ────────────────────────────────────────────────────

const VALID_EMP_TYPES = new Set([
  'FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED',
])

// ── Row value accessor ────────────────────────────────────────────────────────
// Finds the first column whose name contains ANY of the given fragment strings
// (case-insensitive). Returns '' if nothing matches.

function col(row: RawSourceRow, ...fragments: string[]): string {
  for (const fragment of fragments) {
    const lf = fragment.toLowerCase()
    for (const [k, v] of Object.entries(row)) {
      if (k.toLowerCase().includes(lf) && v != null) {
        // Handle Date objects produced when XLSX cellDates:true is combined with raw:true
        if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().split('T')[0]
        return String(v).trim()
      }
    }
  }
  return ''
}

// ── Unicode dash normalisation ────────────────────────────────────────────────
// Source files exported from HR systems often contain em dashes (–, U+2013) or
// en dashes (—, U+2014) inside position titles, while DB records use plain ASCII
// hyphens (-).  Normalise before any title comparison so lookups succeed.
// Example mismatch caught by this fix:
//   mapping file: "Senior Portfolio Manager – CRM & Collections"  (em dash)
//   DB record:    "Senior Portfolio Manager - CRM & Collections"  (hyphen)

function normaliseDashes(s: string): string {
  return s.replace(/[–—―−﹘﹣－]/g, '-')
}

// ── Position resolution ───────────────────────────────────────────────────────

interface PositionResolution {
  code:   string
  source: 'mapping' | 'fallback' | 'none'
}

function resolvePositionCode(
  titleRaw:       string,
  deptCode:       string,
  titleToCode:    Map<string, string>,
  deptDefaultPos: Map<string, string>,
): PositionResolution {
  const titleKey = normaliseDashes(titleRaw.toLowerCase().trim())
  if (titleKey) {
    const code = titleToCode.get(titleKey)
    if (code) return { code, source: 'mapping' }
  }
  if (deptCode) {
    const fallback = deptDefaultPos.get(deptCode)
    if (fallback) return { code: fallback, source: 'fallback' }
  }
  return { code: '', source: 'none' }
}

// Build title→code map from context.positions (DB) only.
// Keys are lower-cased and dash-normalised so they survive source file encoding
// differences (em dash vs ASCII hyphen).
function buildTitleToCodeMap(context: TransformContext): Map<string, string> {
  const map = new Map<string, string>()
  for (const pos of context.positions) {
    if (pos.titleEn && pos.code) {
      map.set(normaliseDashes(pos.titleEn.toLowerCase().trim()), pos.code)
    }
  }
  return map
}

// Build employeeId→positionCode map from POSITION_MAPPING files.
// The real source data pattern: ID | New Position (title) → resolved to code via titleToCode.
// Also supports an optional direct "Position Code" column for explicit overrides.
function buildPositionByEmpMap(
  posMappingFiles: ClassifiedSourceFile[],
  titleToCode:     Map<string, string>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const file of posMappingFiles) {
    for (const rows of file.sheets.values()) {
      for (const row of rows) {
        // Employee ID: plain 'ID' column or longer variants
        const empId = col(row, 'id', 'employee id', 'employee number', 'person number')
        if (!empId) continue

        // Direct code column takes priority over title lookup
        const directCode = col(row, 'position code')
        if (directCode) { map.set(empId, directCode); continue }

        // Title-based lookup — normalise dashes before comparison
        const titleRaw = normaliseDashes(
          col(row, 'new position', 'position title', 'title').toLowerCase().trim()
        )
        if (titleRaw) {
          const code = titleToCode.get(titleRaw)
          if (code) map.set(empId, code)
        }
      }
    }
  }
  return map
}

// ── Transform result ──────────────────────────────────────────────────────────

export interface TransformResult {
  package: V2ParsedPackage
  summary: TransformationSummary
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function transformSourceFiles(
  files:   ClassifiedSourceFile[],
  options: TransformOptions,
  context: TransformContext,
): TransformResult {
  const warnings: TransformWarning[] = []
  const blockers:  TransformBlocker[] = []

  // Bucket files by effective type
  const byType = (t: string) => files.filter(f => effectiveType(f) === t)
  const empMasterFiles    = byType('EMPLOYEE_MASTER')
  const assignmentFiles   = byType('EMPLOYEE_ASSIGNMENTS')
  const leaveFiles        = byType('LEAVE_BALANCES')
  const userFiles         = byType('USERS_DATA')
  const posMappingFiles   = byType('POSITION_MAPPING')
  const deptHeadFiles     = byType('DEPT_HEAD_MAPPING')
  const managerFiles      = byType('MANAGER_HIERARCHY')

  if (empMasterFiles.length === 0) {
    blockers.push({
      field:   'EMPLOYEE_MASTER',
      message: 'No Employee Master file found. Upload a file containing employee demographics.',
    })
    return {
      package: { employees: [], managers: [], deptHeads: [], leaveBalances: [], sheetNames: [] },
      summary: makeSummary(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, warnings, blockers),
    }
  }

  // ── Reference maps ──────────────────────────────────────────────────────────

  // Assignments by employee ID (raw, no K prefix)
  const assignByEmpId = new Map<string, RawSourceRow>()
  for (const file of assignmentFiles) {
    for (const rows of file.sheets.values()) {
      for (const row of rows) {
        const id = col(row, 'employee id', 'employee number', 'person number')
        if (id && !assignByEmpId.has(id)) assignByEmpId.set(id, row)
      }
    }
  }

  // Leave balances by employee ID / person number (raw, no K prefix).
  // F-04 fix: accumulate ALL rows per employee to support multiple leave types
  // (ANNUAL + SICK + UNPAID etc.) — previously only last row was kept.
  const leaveByEmpId = new Map<string, RawSourceRow[]>()
  for (const file of leaveFiles) {
    for (const rows of file.sheets.values()) {
      for (const row of rows) {
        const id = col(row, 'person number', 'employee number', 'employee id')
        if (!id) continue
        const existing = leaveByEmpId.get(id)
        if (existing) existing.push(row)
        else leaveByEmpId.set(id, [row])
      }
    }
  }

  // Users by lowercased email
  const userByEmail = new Map<string, RawSourceRow>()
  for (const file of userFiles) {
    for (const rows of file.sheets.values()) {
      for (const row of rows) {
        const email = col(row, 'username', 'email').toLowerCase()
        if (email) userByEmail.set(email, row)
      }
    }
  }

  // Department name → code
  const deptNameToCode = new Map<string, string>()
  for (const dept of context.departments) {
    if (dept.nameEn && dept.code) deptNameToCode.set(dept.nameEn.toLowerCase().trim(), dept.code)
  }

  // Position resolution maps
  const titleToCode      = buildTitleToCodeMap(context)
  const positionByEmpId  = buildPositionByEmpMap(posMappingFiles, titleToCode)
  const deptDefaultPos   = context.departmentDefaultPositions ?? new Map<string, string>()

  // ── Sheet 1: Employees ────────────────────────────────────────────────────

  const existingNums = options.existingPersonNumbers ?? new Set<string>()
  let skipped          = 0
  let posFromMapping   = 0
  let posFallback      = 0
  let posMissing       = 0
  let mobileNormCount  = 0
  let usersMatched     = 0

  const employees: RawImportRow[] = []

  for (const file of empMasterFiles) {
    for (const rows of file.sheets.values()) {
      for (const row of rows) {
        const rawId = col(row, 'employee number', 'employee id', 'person number')
        if (!rawId) continue

        const personNumber = rawId.startsWith('K') ? rawId : `K${rawId}`

        // Incremental: skip rows already in DB
        if (options.mode === 'INCREMENTAL' && existingNums.has(personNumber)) {
          skipped++
          continue
        }

        // Strip the K prefix when looking up the assignments map.
        // Employee Master rows use plain IDs ("11"), but if a pre-built package
        // was accidentally uploaded as a source file its rows carry K-prefixed IDs
        // ("K11"). The assignments map is always keyed by the raw numeric ID.
        const rawIdForLookup = rawId.startsWith('K') ? rawId.slice(1) : rawId
        const assign = assignByEmpId.get(rawIdForLookup) ?? {}

        // Department
        const deptRaw  = col(assign, 'department').trim()
        const deptCode = deptRaw
          ? (deptNameToCode.get(deptRaw.toLowerCase()) ?? deptRaw)
          : ''

        // Position: per-employee map (from POSITION_MAPPING file) → title lookup → dept default
        const directPosCode = positionByEmpId.get(rawId)
        const titleRaw      = col(assign, 'new position', 'position title', 'position name').trim()
        const posResult     = directPosCode
          ? { code: directPosCode, source: 'mapping' as const }
          : resolvePositionCode(titleRaw, deptCode, titleToCode, deptDefaultPos)
        if (posResult.source === 'mapping')  posFromMapping++
        else if (posResult.source === 'fallback') {
          posFallback++
          warnings.push({
            employeeNumber: personNumber,
            field:          'positionCode',
            message:        `Position title "${titleRaw || '(none)'}" not found — using dept default ${posResult.code}`,
          })
        } else {
          posMissing++
          warnings.push({
            employeeNumber: personNumber,
            field:          'positionCode',
            message:        `Could not resolve position code` +
              (titleRaw ? ` for title "${titleRaw}"` : '') +
              (deptCode ? ` (dept ${deptCode})` : '') +
              '. Assign a Position Code manually or add the title to a POSITION_MAPPING file.',
          })
        }

        // Nationality resolution with warning for blank/unrecognized values (F-05)
        const natResolved = resolveNationalityCode(col(row, 'nationality'))
        if (natResolved.warning) {
          warnings.push({ employeeNumber: personNumber, field: 'nationalityCode', message: natResolved.warning })
        }

        // Mobile normalization
        const rawMobile  = col(row, 'work mobile', 'mobile phone', 'mobile')
        const normMobile = normalizeUaeMobile(rawMobile)
        if (rawMobile && normMobile !== rawMobile.trim()) mobileNormCount++

        // User matching
        const workEmail = col(row, 'primary email address', 'work email', 'email')
        const hasUser   = !!(workEmail && userByEmail.has(workEmail.toLowerCase()))
        if (hasUser) usersMatched++

        // Employment type
        const empTypeRaw = col(assign, 'assignment category', 'employment type').toUpperCase()
        const empType    = VALID_EMP_TYPES.has(empTypeRaw) ? empTypeRaw : 'FULL_TIME'

        employees.push({
          requiresUser:              hasUser ? 'YES' : 'NO',
          employeeNumber:            personNumber,
          fullNameEn:                col(row, 'full name', 'name') || undefined,
          fullNameAr:                col(row, 'full name ar', 'arabic name') || undefined,
          workEmail:                 workEmail || undefined,
          personalEmail:             col(row, 'personal email') || undefined,
          mobile:                    normMobile || undefined,
          gender:                    col(row, 'gender').toUpperCase() || 'NOT_SPECIFIED',
          dateOfBirth:               formatSourceDate(col(row, 'date of birth', 'dob')) || undefined,
          nationalityCode:           natResolved.code,
          maritalStatus:             col(row, 'marital status').toUpperCase().replace(/ /g, '_') || 'NOT_SPECIFIED',
          legalEntityCode:           context.defaultLegalEntityCode ?? 'AVN-001',
          departmentCode:            deptCode || undefined,
          positionCode:              posResult.code || undefined,
          gradeCode:                 context.defaultGradeCode || undefined,
          locationCode:              context.defaultLocationCode || undefined,
          lineManagerEmployeeNumber: undefined,  // Managers sheet is authority (B9)
          hireDate:                  formatSourceDate(
                                       col(assign, 'contract start date') ||
                                       col(row,    'date of joining', 'join date')
                                     ) || undefined,
          employmentType:            empType,
          basicSalary:               undefined,
          totalPackage:              undefined,
          contractType:              'FIXED_TERM',
          contractStartDate:         formatSourceDate(col(assign, 'contract start date')) || undefined,
          contractEndDate:           formatSourceDate(col(assign, 'contract end date'))   || undefined,
          probationEndDate:          formatSourceDate(col(assign, 'probation end date'))  || undefined,
          passportNumber:            col(row, 'passport number', 'passport') || undefined,
          emiratesId:                col(row, 'eid', 'emirates id', 'national id')        || undefined,
          visaNumber:                col(row, 'visa number', 'visa')                      || undefined,
          labourCardNumber:          col(row, 'labour card', 'labour card number')        || undefined,
          insurancePlanCode:         undefined,
        })
      }
    }
  }

  // ── Mandatory field guard ─────────────────────────────────────────────────
  // Department Code and Hire Date must be non-empty on every employee row.
  // If they're missing it almost always means the Assignments file was not
  // uploaded or its Employee ID column doesn't match the Employee Master.
  // Block the build here so the user sees a clear message in Step 5 rather
  // than 218 cryptic "field required" errors in Step 7 validation.

  const missingDept = employees.filter(e => !e.departmentCode).length
  const missingHire = employees.filter(e => !e.hireDate).length

  if (missingDept > 0) {
    blockers.push({
      field:   'MANDATORY_FIELDS',
      message: `${missingDept} employee row(s) have no Department Code. ` +
        'Ensure the Employee Assignments file ("02 Employee Assignments.xlsx") was uploaded ' +
        'and that its "Employee ID" column values match the Employee Master\'s "Employee Number" column. ' +
        'Do not upload the pre-built V2 migration package as a source file.',
    })
  }
  if (missingHire > 0) {
    blockers.push({
      field:   'MANDATORY_FIELDS',
      message: `${missingHire} employee row(s) have no Hire Date. ` +
        'Check that the Assignments file "Contract Start Date" column or the Employee Master ' +
        '"Date of Joining" column is populated.',
    })
  }

  // ── Sheet 3: DeptHeads (computed first — manager derivation may depend on it) ─

  const allPersonNums = new Set(employees.map(e => e.employeeNumber))
  let deptHeadsResolved = 0
  const deptHeads: RawDeptHeadRow[] = []
  const deptHeadSeen = new Set<string>()   // dept codes already assigned a head

  // 3a — Explicit DEPT_HEAD_MAPPING file (highest priority)
  for (const file of deptHeadFiles) {
    for (const rows of file.sheets.values()) {
      for (const row of rows) {
        const rawDept  = col(row, 'department code', 'department')
        const rawHead  = col(row, 'head employee number', 'head employee', 'employee number', 'head')
        if (!rawDept || !rawHead) continue

        // Resolve dept name → code if needed
        const deptCode = rawDept.match(/^[A-Z0-9\-]+$/)
          ? rawDept
          : (deptNameToCode.get(rawDept.toLowerCase()) ?? rawDept)

        const headNum = rawHead.startsWith('K') ? rawHead : `K${rawHead}`
        deptHeads.push({ departmentCode: deptCode, headEmployeeNumber: headNum })
        deptHeadSeen.add(deptCode)
        deptHeadsResolved++
      }
    }
  }

  // 3b — Derive from POSITION_CATALOG ("Position for HOD" = YES).
  // The catalog (01 Positions Jobs Titles) flags one HOD position per department.
  // The department head is the employee who holds that HOD position code.
  // Skip any department already assigned a head via an explicit mapping file.
  const positionCatalogFiles = byType('POSITION_CATALOG')
  if (positionCatalogFiles.length > 0) {
    // Build deptCode → HOD position code from the catalog
    const hodPosByDept = new Map<string, string>()
    for (const file of positionCatalogFiles) {
      for (const rows of file.sheets.values()) {
        for (const row of rows) {
          const isHod = col(row, 'position for hod', 'hod').toUpperCase()
          if (isHod !== 'YES') continue
          const posCode = col(row, 'position code')
          const rawDept = col(row, 'department')
          if (!posCode || !rawDept) continue
          const deptCode = rawDept.match(/^[A-Z0-9\-]+$/)
            ? rawDept
            : (deptNameToCode.get(rawDept.toLowerCase().trim()) ?? '')
          if (deptCode && !hodPosByDept.has(deptCode)) hodPosByDept.set(deptCode, posCode)
        }
      }
    }

    // Match each HOD position to the employee occupying it
    for (const [deptCode, hodPosCode] of hodPosByDept) {
      if (deptHeadSeen.has(deptCode)) continue
      const head = employees.find(e => e.departmentCode === deptCode && e.positionCode === hodPosCode)
      if (head?.employeeNumber) {
        deptHeads.push({ departmentCode: deptCode, headEmployeeNumber: head.employeeNumber })
        deptHeadSeen.add(deptCode)
        deptHeadsResolved++
      } else {
        warnings.push({
          field:   'deptHead',
          message: `Department ${deptCode}: HOD position ${hodPosCode} has no employee assigned to it — no department head set.`,
        })
      }
    }
  }

  // deptCode → head employee number (for dept-head manager derivation)
  const deptHeadByDept = new Map<string, string>()
  for (const dh of deptHeads) {
    if (!deptHeadByDept.has(dh.departmentCode)) deptHeadByDept.set(dh.departmentCode, dh.headEmployeeNumber)
  }

  // ── Sheet 2: Managers ────────────────────────────────────────────────────

  let managersResolved = 0
  let managersSkipped  = 0
  const managerMap = new Map<string, string>()  // empNum → mgrNum (last wins on dup)

  // Always build the source-based manager pairs first (explicit MANAGER_HIERARCHY
  // file, else EMPLOYEE_ASSIGNMENTS "Line Manager ID"). These remain the line
  // manager for department heads even when dept-head derivation is on.
  const sourceManagerOf = new Map<string, string>()  // empNum → mgrNum (raw, K-prefixed)
  if (managerFiles.length > 0) {
    for (const file of managerFiles) {
      for (const rows of file.sheets.values()) {
        for (const row of rows) {
          const empId = col(row, 'employee number', 'employee id')
          const mgrId = col(row, 'manager employee number', 'manager id', 'manager')
          if (!empId || !mgrId) continue
          const empNum = empId.startsWith('K') ? empId : `K${empId}`
          const mgrNum = mgrId.startsWith('K') ? mgrId : `K${mgrId}`
          sourceManagerOf.set(empNum, mgrNum)
        }
      }
    }
  } else {
    for (const file of assignmentFiles) {
      for (const rows of file.sheets.values()) {
        for (const row of rows) {
          const empId = col(row, 'employee id', 'employee number')
          const mgrId = col(row, 'line manager id', 'manager id', 'reports to')
          if (!empId || !mgrId || mgrId === 'null') continue
          sourceManagerOf.set(`K${empId}`, `K${mgrId}`)
        }
      }
    }
  }

  // Build the raw (emp, mgr) pairs according to the chosen strategy.
  const rawManagerPairs: Array<{ emp: string; mgr: string }> = []
  if (options.deriveManagersFromDeptHead) {
    // Departmental hierarchy: each employee reports to their department's HOD.
    // The HOD of each department keeps their source line manager (the HOD's own
    // manager, typically the CEO), so the chain is: employee → dept HOD → CEO.
    for (const emp of employees) {
      const empNum   = emp.employeeNumber ?? ''
      const deptCode = emp.departmentCode ?? ''
      const head     = deptCode ? deptHeadByDept.get(deptCode) : undefined
      if (head && head !== empNum) {
        // Regular employee → reports to their department head
        rawManagerPairs.push({ emp: empNum, mgr: head })
      } else {
        // This employee IS the department head (or dept has no head):
        // fall back to their source line manager so HODs report up to the CEO.
        const srcMgr = sourceManagerOf.get(empNum)
        if (srcMgr) rawManagerPairs.push({ emp: empNum, mgr: srcMgr })
      }
    }
  } else {
    // Default: use the source line manager exactly as provided.
    for (const [emp, mgr] of sourceManagerOf) rawManagerPairs.push({ emp, mgr })
  }

  // Validate and dedup
  for (const { emp, mgr } of rawManagerPairs) {
    if (emp === mgr) {
      warnings.push({ employeeNumber: emp, field: 'managerEmployeeNumber', message: 'Self-referential manager link skipped' })
      managersSkipped++
      continue
    }
    if (!allPersonNums.has(emp)) { managersSkipped++; continue }
    if (!allPersonNums.has(mgr) && !options.allowExternalManagers) {
      managersSkipped++
      continue
    }
    managerMap.set(emp, mgr)
    managersResolved++
  }

  const managers: RawManagerRow[] = Array.from(managerMap.entries()).map(
    ([employeeNumber, managerEmployeeNumber]) => ({ employeeNumber, managerEmployeeNumber })
  )

  // ── Sheet 4: LeaveBalances ────────────────────────────────────────────────
  // F-04 fix: emit one RawLeaveBalanceRow per leave-type row per employee.
  // An employee may have ANNUAL + SICK + UNPAID rows; previously only last won.
  // Employees with NO leave source data still get one ANNUAL row with balance=0.

  const defaultYear = context.defaultBalanceYear ?? new Date().getFullYear()
  const leaveBalances: RawLeaveBalanceRow[] = []

  for (const emp of employees) {
    const rawId  = (emp.employeeNumber ?? '').replace(/^K/, '')
    const lvRows = leaveByEmpId.get(rawId)

    if (!lvRows || lvRows.length === 0) {
      // No source leave data — emit zero-balance ANNUAL row as default
      leaveBalances.push({
        employeeNumber:     emp.employeeNumber ?? '',
        absenceTypeCode:    'ANNUAL',
        balanceYear:        defaultYear,
        openingBalanceDays: 0,
      })
    } else {
      // Emit one row per leave-type entry, deduplicating by typeCode+year (last wins on exact dup)
      const seen = new Set<string>()
      for (const lv of lvRows) {
        const typeCode = col(lv, 'absence type code', 'leave type code', 'type code').toUpperCase() || 'ANNUAL'
        const year     = parseInt(col(lv, 'leave year', 'balance year', 'year'), 10) || defaultYear
        // Negative opening balances are a legitimate business case (over-taken leave).
        // The DB constraint absence_balances_nonneg_check was relaxed (migration 0058)
        // to permit negative opening_balance_days, so the raw value is preserved as-is.
        const balance  = parseFloat(col(lv, 'leave balance', 'opening balance', 'balance days', 'days')) || 0
        const dedupKey = `${typeCode}:${year}`
        if (seen.has(dedupKey)) continue
        seen.add(dedupKey)
        leaveBalances.push({
          employeeNumber:     emp.employeeNumber ?? '',
          absenceTypeCode:    typeCode,
          balanceYear:        year,
          openingBalanceDays: balance,
        })
      }
    }
  }

  // ── Build summary ─────────────────────────────────────────────────────────

  const totalDetected = employees.length + skipped
  const summary = makeSummary(
    totalDetected,
    employees.length,
    skipped,
    managersResolved,
    managersSkipped,
    deptHeadsResolved,
    leaveBalances.length,
    usersMatched,
    posFromMapping,
    posFallback,
    posMissing,
    warnings,
    blockers,
  )
  summary.mobileNormalized = mobileNormCount

  const sheetNames = files.flatMap(f => [...f.sheets.keys()])

  return {
    package: { employees, managers, deptHeads, leaveBalances, sheetNames },
    summary,
  }
}

// ── Summary factory ───────────────────────────────────────────────────────────

function makeSummary(
  detected:       number,
  included:       number,
  skipped:        number,
  managers:       number,
  mgrSkipped:     number,
  deptHeads:      number,
  leave:          number,
  users:          number,
  posFromMapping: number,
  posFallback:    number,
  posMissing:     number,
  warnings:       TransformWarning[],
  blockers:       TransformBlocker[],
): TransformationSummary {
  return {
    employeesDetected:     detected,
    employeesIncluded:     included,
    employeesSkipped:      skipped,
    managersResolved:      managers,
    managersSkipped:       mgrSkipped,
    deptHeadsResolved:     deptHeads,
    leaveBalancesDetected: leave,
    usersMatched:          users,
    positionsFromMapping:  posFromMapping,
    positionsFallback:     posFallback,
    positionsMissing:      posMissing,
    mobileNormalized:      0,  // caller sets this after build
    warnings,
    blockers,
    canBuild: blockers.length === 0,
  }
}
