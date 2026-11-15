/**
 * Bulk import row validator.
 *
 * Parses the raw xlsx sheet, resolves reference codes to IDs via DB lookups,
 * and returns a structured ImportPreview (valid rows + all issues).
 *
 * Design: validate ALL rows before returning — callers see the full picture.
 * No DB writes here. All validation is read-only.
 */
import * as XLSX from 'xlsx'
import { and, eq, or, ilike } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  legalEntities, departments, positions, grades, locations,
  persons, personContacts, userAccounts, medicalInsurancePlans,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { normalizeEmiratesId } from '@/modules/core-hr/validations'
import { EMPLOYEE_HEADERS } from './template'
import type {
  RawImportRow, ValidatedImportRow, RowIssue, ImportPreview, ResolvedRefs,
} from './types'

// ── UAE mobile number normalization ──────────────────────────────────────────
// Rules (applied in order after stripping spaces/hyphens/brackets):
//   +971XXXXXXXX  → keep as-is
//   971XXXXXXXX   → prefix +
//   0XXXXXXXXX    → remove leading 0, prefix +971
//   5XXXXXXXX     → prefix +971
//   anything else → return null (invalid)
// Expected result: +971XXXXXXXXX (12 chars, starts with +971 5/6)

export function normalizeUaeMobile(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Strip non-digit characters except leading +
  const cleaned = raw.replace(/[\s\-().]/g, '')
  if (!cleaned) return null

  if (/^\+971\d{8,9}$/.test(cleaned))  return cleaned          // already +971XXXXXXXXX
  if (/^971\d{8,9}$/.test(cleaned))    return '+' + cleaned    // 971 → +971
  if (/^0\d{9}$/.test(cleaned))        return '+971' + cleaned.slice(1)  // 0XX → +971XX
  if (/^[5-9]\d{8}$/.test(cleaned))    return '+971' + cleaned           // 5XXXXXXXX → +9715XXXXXXXX

  return null  // cannot normalize — caller should flag as invalid
}

// ── GCC nationality codes (drives nationalityCategory) ───────────────────
const GCC_CODES = new Set(['SAU', 'KWT', 'BHR', 'QAT', 'OMN'])

function deriveNationalityCategory(code: string): 'UAE_NATIONAL' | 'GCC_NATIONAL' | 'EXPAT' {
  if (code === 'ARE') return 'UAE_NATIONAL'
  if (GCC_CODES.has(code)) return 'GCC_NATIONAL'
  return 'EXPAT'
}

// ── Valid enum values ─────────────────────────────────────────────────────
const VALID_EMPLOYMENT_TYPES = new Set([
  'FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED',
])
const VALID_GENDERS = new Set(['MALE', 'FEMALE', 'NOT_SPECIFIED'])
const VALID_MARITAL = new Set(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'NOT_SPECIFIED'])
// BR-CT-001: DB CHECK constraint allows only FIXED_TERM (migration 0003)
const VALID_CONTRACT_TYPES = new Set(['FIXED_TERM'])
const EMIRATES_ID_REGEX = /^(?:784-\d{4}-\d{7}-\d{1}|784\d{12})$/
const ISO_COUNTRY_REGEX = /^[A-Z]{3}$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

// ── Formula injection prefix characters ──────────────────────────────────
// =, +, -, @ at the start of a cell trigger formula execution when data is
// re-opened in Excel/Sheets. Strip them as defense-in-depth so that import
// data is safe regardless of the downstream export format.
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]+/

// ── Parse cell value to string ───────────────────────────────────────────
function cellStr(val: unknown): string | undefined {
  if (val == null) return undefined
  const s = String(val).trim().replace(FORMULA_PREFIX_RE, '')
  return s === '' ? undefined : s
}

// ── Parse one header row + data rows from worksheet ──────────────────────
export function parseSheet(ws: XLSX.WorkSheet): RawImportRow[] {
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (aoa.length < 2) return []

  // Find header row (first row matching our expected first column)
  let headerIdx = 0
  for (let i = 0; i < Math.min(5, aoa.length); i++) {
    if (String(aoa[i][0]).trim() === EMPLOYEE_HEADERS[0]) {
      headerIdx = i
      break
    }
  }

  const headerRow = (aoa[headerIdx] as unknown[]).map(c => String(c).trim())

  // Build a map: our canonical header → column index
  const colIdx: Record<string, number> = {}
  EMPLOYEE_HEADERS.forEach(h => {
    const idx = headerRow.indexOf(h)
    if (idx !== -1) colIdx[h] = idx
  })

  const rows: RawImportRow[] = []
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] as unknown[]
    // Skip fully empty rows
    if (row.every(c => !String(c).trim())) continue

    const g = (h: typeof EMPLOYEE_HEADERS[number]) =>
      colIdx[h] !== undefined ? cellStr(row[colIdx[h]]) : undefined

    rows.push({
      requiresUser:              g('Requires User'),
      employeeNumber:            g('Employee Number'),
      fullNameEn:                g('Full Name EN'),
      fullNameAr:                g('Full Name AR'),
      workEmail:                 g('Work Email'),
      personalEmail:             g('Personal Email'),
      mobile:                    g('Mobile'),
      gender:                    g('Gender'),
      dateOfBirth:               g('Date of Birth'),
      nationalityCode:           g('Nationality Code'),
      maritalStatus:             g('Marital Status'),
      legalEntityCode:           g('Legal Entity Code'),
      departmentCode:            g('Department Code'),
      positionCode:              g('Position Code'),
      gradeCode:                 g('Grade Code'),
      locationCode:              g('Location Code'),
      lineManagerEmployeeNumber: g('Line Manager Employee Number'),
      hireDate:                  g('Hire Date'),
      employmentType:            g('Employment Type'),
      basicSalary:               g('Basic Salary'),
      totalPackage:              g('Total Package'),
      contractType:              g('Contract Type'),
      contractStartDate:         g('Contract Start Date'),
      contractEndDate:           g('Contract End Date'),
      probationEndDate:          g('Probation End Date'),
      passportNumber:            g('Passport Number'),
      emiratesId:                g('Emirates ID'),
      visaNumber:                g('Visa Number'),
      labourCardNumber:          g('Labour Card Number'),
      insurancePlanCode:         g('Insurance Plan Code'),
    })
  }
  return rows
}

// ── Helper: validate ISO date string ────────────────────────────────────
function validateDate(
  value: string | undefined,
  field: string,
  rowNumber: number,
  issues: RowIssue[],
  required: boolean,
): string | null {
  if (!value) {
    if (required) {
      issues.push({ rowNumber, field, message: `${field} is required`, severity: 'ERROR' })
    }
    return null
  }
  // Excel may format dates as numbers — handle serial dates
  if (/^\d+$/.test(value)) {
    try {
      const d = XLSX.SSF.parse_date_code(Number(value))
      const iso = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      return iso
    } catch { /* fall through */ }
  }
  if (!DATE_REGEX.test(value)) {
    issues.push({ rowNumber, field, message: `${field} must be YYYY-MM-DD`, severity: 'ERROR' })
    return null
  }
  const d = new Date(value)
  if (isNaN(d.getTime())) {
    issues.push({ rowNumber, field, message: `${field} is not a valid date`, severity: 'ERROR' })
    return null
  }
  return value
}

// ── Main validation function ──────────────────────────────────────────────

export async function validateImportRows(
  rawRows: RawImportRow[],
): Promise<ImportPreview> {
  const issues: RowIssue[] = []
  const validatedRows: ValidatedImportRow[] = []
  const rowsWithErrors = new Set<number>()
  const rowsWithWarnings = new Set<number>()
  const duplicateRows = new Set<number>()

  if (rawRows.length === 0) {
    return {
      totalRows: 0, validRows: 0, errorRows: 0,
      warningRows: 0, duplicateRows: 0,
      rowsRequiringUser: 0, rowsWithoutUser: 0,
      issues: [], validatedRows: [],
    }
  }

  // ── Pre-load reference data for the entire batch ──────────────────────
  const [
    allEntities, allDepts, allPositions, allGrades, allLocations, allInsurancePlans,
  ] = await Promise.all([
    db.select({ id: legalEntities.id, code: legalEntities.entityCode, isActive: legalEntities.isActive })
      .from(legalEntities).where(eq(legalEntities.tenantId, TENANT_ID)),
    db.select({ id: departments.id, code: departments.code, nameEn: departments.nameEn, entityId: departments.legalEntityId, isActive: departments.isActive })
      .from(departments).where(eq(departments.tenantId, TENANT_ID)),
    db.select({ id: positions.id, code: positions.positionCode, titleEn: positions.positionTitleEn, entityId: positions.legalEntityId, isActive: positions.isActive })
      .from(positions).where(eq(positions.tenantId, TENANT_ID)),
    db.select({ id: grades.id, code: grades.gradeCode, nameEn: grades.gradeNameEn, entityId: grades.legalEntityId, isActive: grades.isActive })
      .from(grades).where(eq(grades.tenantId, TENANT_ID)),
    db.select({ id: locations.id, code: locations.code, nameEn: locations.nameEn, entityId: locations.legalEntityId, isActive: locations.isActive })
      .from(locations).where(eq(locations.tenantId, TENANT_ID)),
    db.select({ id: medicalInsurancePlans.id, code: medicalInsurancePlans.planCode, isActive: medicalInsurancePlans.isActive })
      .from(medicalInsurancePlans).where(eq(medicalInsurancePlans.tenantId, TENANT_ID)),
  ])

  // Index by code (lowercase for case-insensitive lookup)
  const entityByCode   = new Map(allEntities.map(e  => [e.code.toLowerCase(),  e]))
  const deptByCode     = new Map(allDepts.map(d    => [d.code?.toLowerCase() ?? '',    d]))
  const posByCode      = new Map(allPositions.map(p => [p.code?.toLowerCase() ?? '', p]))
  const gradeByCode    = new Map(allGrades.map(g   => [g.code?.toLowerCase() ?? '',   g]))
  const locByCode      = new Map(allLocations.map(l => [l.code?.toLowerCase() ?? '',   l]))
  const planByCode     = new Map(allInsurancePlans.map(p => [p.code?.toLowerCase() ?? '', p]))

  // ── Load existing employee numbers (for uniqueness check) ─────────────
  const existingPersonNumbers = await db
    .select({ personNumber: persons.personNumber })
    .from(persons)
    .where(eq(persons.tenantId, TENANT_ID))
  const existingNumberSet = new Set(existingPersonNumbers.map(p => p.personNumber.toLowerCase()))

  // ── Load existing work emails (user_accounts + person_contacts) ───────
  const [existingUserEmails, existingContactEmails] = await Promise.all([
    db.select({ email: userAccounts.primaryEmail })
      .from(userAccounts).where(eq(userAccounts.tenantId, TENANT_ID)),
    db.select({ value: personContacts.contactValue })
      .from(personContacts)
      .where(and(
        eq(personContacts.tenantId, TENANT_ID),
        eq(personContacts.contactType, 'WORK_EMAIL'),
      )),
  ])
  const existingEmailSet = new Set([
    ...existingUserEmails.map(e => e.email.toLowerCase()),
    ...existingContactEmails.map(e => e.value.toLowerCase()),
  ])

  // ── Load existing manager person numbers ──────────────────────────────
  const existingManagerMap = new Map<string, string>() // personNumber → personId
  const allPersons = await db
    .select({ id: persons.id, personNumber: persons.personNumber })
    .from(persons).where(eq(persons.tenantId, TENANT_ID))
  allPersons.forEach(p => existingManagerMap.set(p.personNumber.toLowerCase(), p.id))

  // ── Track emails and employee numbers seen within this batch ──────────
  const batchEmails    = new Map<string, number>() // email → first rowNumber
  const batchNumbers   = new Map<string, number>() // empNum → first rowNumber

  // ── Validate each row ─────────────────────────────────────────────────
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]
    const rowNumber = i + 2  // +2: header row is row 1, data starts at row 2
    const rowIssues: RowIssue[] = []

    const addError   = (field: string, message: string) =>
      rowIssues.push({ rowNumber, field, message, severity: 'ERROR' })
    const addWarning = (field: string, message: string) =>
      rowIssues.push({ rowNumber, field, message, severity: 'WARNING' })

    // ── Requires User (default YES) ───────────────────────────────────
    const ruRaw      = (raw.requiresUser ?? '').toUpperCase().trim()
    const requiresUser = ruRaw === 'NO' ? false : true   // blank or YES → true

    // ── Full Name EN (mandatory) ───────────────────────────────────────
    const fullNameEnRaw = (raw.fullNameEn ?? '').trim()
    if (!fullNameEnRaw) {
      addError('Full Name EN', 'Full Name EN is required')
    }

    // Split: last token = lastNameEn, rest = firstNameEn [+ middleNameEn]
    const nameParts   = fullNameEnRaw.split(/\s+/).filter(Boolean)
    const lastNameEn  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : fullNameEnRaw
    const firstNameEn = nameParts.length > 2
      ? nameParts.slice(0, -2).join(' ')   // multi-part first
      : nameParts.length === 2
        ? nameParts[0]
        : fullNameEnRaw
    const middleNameEn = nameParts.length > 2 ? nameParts[nameParts.length - 2] : null

    // ── Full Name AR (warning if missing, fallback to EN) ─────────────
    const fullNameAr = raw.fullNameAr?.trim()
      ? raw.fullNameAr.trim()
      : (() => {
          addWarning('Full Name AR', 'Full Name AR is missing — Full Name EN will be used until Arabic value is provided')
          return fullNameEnRaw
        })()

    // ── Work Email (mandatory if requiresUser=true) ────────────────────
    const workEmail = raw.workEmail?.trim().toLowerCase() || null
    if (requiresUser && !workEmail) {
      addError('Work Email', 'Work Email is required when Requires User = YES')
    }
    if (workEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
        addError('Work Email', 'Work Email is not a valid email address')
      } else if (existingEmailSet.has(workEmail)) {
        addError('Work Email', `Work Email "${workEmail}" already exists in the system`)
        duplicateRows.add(rowNumber)
      } else if (batchEmails.has(workEmail)) {
        addError('Work Email', `Work Email "${workEmail}" is duplicated in this file (first seen at row ${batchEmails.get(workEmail)})`)
        duplicateRows.add(rowNumber)
      } else {
        batchEmails.set(workEmail, rowNumber)
      }
    }

    // ── Employee Number uniqueness (optional) ─────────────────────────
    const employeeNumber = raw.employeeNumber?.trim() || null
    if (employeeNumber) {
      if (existingNumberSet.has(employeeNumber.toLowerCase())) {
        addError('Employee Number', `Employee Number "${employeeNumber}" already exists in the system`)
        duplicateRows.add(rowNumber)
      } else if (batchNumbers.has(employeeNumber.toLowerCase())) {
        addError('Employee Number', `Employee Number "${employeeNumber}" is duplicated in this file (first seen at row ${batchNumbers.get(employeeNumber.toLowerCase())})`)
        duplicateRows.add(rowNumber)
      } else {
        batchNumbers.set(employeeNumber.toLowerCase(), rowNumber)
      }
    }

    // ── Gender ────────────────────────────────────────────────────────
    const genderRaw = (raw.gender ?? '').toUpperCase().trim()
    const gender: 'MALE' | 'FEMALE' | 'NOT_SPECIFIED' = VALID_GENDERS.has(genderRaw)
      ? genderRaw as 'MALE' | 'FEMALE' | 'NOT_SPECIFIED'
      : 'NOT_SPECIFIED'
    if (genderRaw && !VALID_GENDERS.has(genderRaw)) {
      addWarning('Gender', `Unknown gender "${raw.gender}" — defaulting to NOT_SPECIFIED`)
    }

    // ── Date of Birth ─────────────────────────────────────────────────
    const dateOfBirth = validateDate(raw.dateOfBirth, 'Date of Birth', rowNumber, rowIssues, true)

    // ── Nationality Code ──────────────────────────────────────────────
    const natCodeRaw = (raw.nationalityCode ?? '').toUpperCase().trim()
    if (!natCodeRaw) {
      addError('Nationality Code', 'Nationality Code is required')
    } else if (!ISO_COUNTRY_REGEX.test(natCodeRaw)) {
      addError('Nationality Code', 'Nationality Code must be an ISO 3166-1 alpha-3 code (e.g. ARE, GBR, IND)')
    }
    const nationalityCode = natCodeRaw || 'ARE'
    const nationalityCategory = deriveNationalityCategory(nationalityCode)

    // ── Marital Status ────────────────────────────────────────────────
    const maritalRaw = (raw.maritalStatus ?? '').toUpperCase().trim()
    const maritalStatus = VALID_MARITAL.has(maritalRaw) ? maritalRaw : null
    if (maritalRaw && !VALID_MARITAL.has(maritalRaw)) {
      addWarning('Marital Status', `Unknown marital status "${raw.maritalStatus}" — will be omitted`)
    }

    // ── Legal Entity Code (mandatory, must exist) ─────────────────────
    const entityCode = (raw.legalEntityCode ?? '').trim().toLowerCase()
    if (!entityCode) {
      addError('Legal Entity Code', 'Legal Entity Code is required')
    }
    const entity = entityByCode.get(entityCode)
    if (entityCode && !entity) {
      addError('Legal Entity Code', `Legal Entity "${raw.legalEntityCode}" not found`)
    }
    if (entity && !entity.isActive) {
      addError('Legal Entity Code', `Legal Entity "${raw.legalEntityCode}" is inactive`)
    }

    // ── Department Code (mandatory) ───────────────────────────────────
    const deptCode = (raw.departmentCode ?? '').trim().toLowerCase()
    if (!deptCode) {
      addError('Department Code', 'Department Code is required')
    }
    const dept = deptByCode.get(deptCode)
    if (deptCode && !dept) {
      addError('Department Code', `Department "${raw.departmentCode}" not found`)
    }

    // ── Position Code (mandatory) ─────────────────────────────────────
    const posCode = (raw.positionCode ?? '').trim().toLowerCase()
    if (!posCode) {
      addError('Position Code', 'Position Code is required')
    }
    const pos = posByCode.get(posCode)
    if (posCode && !pos) {
      addError('Position Code', `Position "${raw.positionCode}" not found`)
    }

    // ── Grade Code (mandatory) ────────────────────────────────────────
    const gradeCode = (raw.gradeCode ?? '').trim().toLowerCase()
    if (!gradeCode) {
      addError('Grade Code', 'Grade Code is required')
    }
    const grade = gradeByCode.get(gradeCode)
    if (gradeCode && !grade) {
      addError('Grade Code', `Grade "${raw.gradeCode}" not found`)
    }

    // ── Location Code (optional) ──────────────────────────────────────
    const locCode = (raw.locationCode ?? '').trim().toLowerCase()
    const loc = locCode ? locByCode.get(locCode) : null
    if (locCode && !loc) {
      addWarning('Location Code', `Location "${raw.locationCode}" not found — location will be omitted`)
    }

    // ── Line Manager Employee Number (optional) ───────────────────────
    const mgrNumRaw = (raw.lineManagerEmployeeNumber ?? '').trim()
    let lineManagerId: string | null = null
    if (mgrNumRaw) {
      const mgr = existingManagerMap.get(mgrNumRaw.toLowerCase())
      if (!mgr) {
        addError('Line Manager Employee Number', `Manager employee number "${mgrNumRaw}" not found in the system`)
      } else {
        lineManagerId = mgr
      }
    }

    // ── Hire Date (mandatory) ─────────────────────────────────────────
    const hireDate = validateDate(raw.hireDate, 'Hire Date', rowNumber, rowIssues, true)

    // ── Employment Type (mandatory) ───────────────────────────────────
    const etRaw = (raw.employmentType ?? '').toUpperCase().trim()
    if (!etRaw) {
      addError('Employment Type', 'Employment Type is required')
    } else if (!VALID_EMPLOYMENT_TYPES.has(etRaw)) {
      addError('Employment Type', `Invalid Employment Type "${raw.employmentType}". Valid values: ${[...VALID_EMPLOYMENT_TYPES].join(', ')}`)
    }

    // ── Salary fields ─────────────────────────────────────────────────
    let basicSalary: string | null = null
    let totalPackage: string | null = null
    if (raw.basicSalary) {
      const n = Number(raw.basicSalary)
      if (isNaN(n) || n < 0) {
        addError('Basic Salary', 'Basic Salary must be a positive number')
      } else {
        basicSalary = String(n)
      }
    }
    if (raw.totalPackage) {
      const n = Number(raw.totalPackage)
      if (isNaN(n) || n < 0) {
        addError('Total Package', 'Total Package must be a positive number')
      } else {
        totalPackage = String(n)
      }
    }

    // ── Contract Type ─────────────────────────────────────────────────
    // BR-CT-001: only FIXED_TERM is permitted (DB CHECK constraint, migration 0003)
    const ctRaw = (raw.contractType ?? '').toUpperCase().trim()
    const contractType = ctRaw === 'FIXED_TERM' ? ctRaw : null
    if (ctRaw && ctRaw !== 'FIXED_TERM') {
      addError('Contract Type', `Invalid Contract Type "${raw.contractType}". Only FIXED_TERM is permitted under UAE Labour Law (BR-CT-001)`)
    }

    // ── Contract dates ────────────────────────────────────────────────
    const contractStartDate = validateDate(raw.contractStartDate, 'Contract Start Date', rowNumber, rowIssues, false)
    const contractEndDate   = validateDate(raw.contractEndDate,   'Contract End Date',   rowNumber, rowIssues, false)
    const probationEndDate  = validateDate(raw.probationEndDate,  'Probation End Date',  rowNumber, rowIssues, false)

    if (probationEndDate && hireDate) {
      const hire     = new Date(hireDate)
      const probEnd  = new Date(probationEndDate)
      const sixMonths = new Date(hire)
      sixMonths.setMonth(sixMonths.getMonth() + 6)
      if (probEnd > sixMonths) {
        addError('Probation End Date', 'BR-PR-001: Probation End Date exceeds 6 months from Hire Date')
      }
    }

    // ── Emirates ID (PII) ─────────────────────────────────────────────
    let emiratesId: string | null = null
    if (raw.emiratesId) {
      if (!EMIRATES_ID_REGEX.test(raw.emiratesId.trim())) {
        addError('Emirates ID', 'Emirates ID must match format 784-XXXX-XXXXXXX-X')
      } else {
        try {
          emiratesId = normalizeEmiratesId(raw.emiratesId.trim())
        } catch {
          addError('Emirates ID', 'Emirates ID could not be normalised to canonical form')
        }
      }
    }

    // ── Insurance Plan Code (optional) ────────────────────────────────
    const insCodeRaw = (raw.insurancePlanCode ?? '').trim().toLowerCase()
    const insurancePlan = insCodeRaw ? planByCode.get(insCodeRaw) : null
    if (insCodeRaw && !insurancePlan) {
      addWarning('Insurance Plan Code', `Insurance plan "${raw.insurancePlanCode}" not found — will be omitted`)
    }

    // ── Mobile number — UAE normalization ────────────────────────────
    // Normalizes to +971XXXXXXXXX format. Invalid numbers are cleared (null)
    // and flagged as a WARNING (not ERROR — does not block import).
    const rawMobile = raw.mobile?.trim() || null
    const normalizedMobile = normalizeUaeMobile(rawMobile)
    if (rawMobile && normalizedMobile === null) {
      addWarning('Mobile', `Mobile number "${rawMobile}" could not be normalized to UAE format (+971XXXXXXXXX) — it will be stored as-is`)
    }

    // ── Accumulate issues ─────────────────────────────────────────────
    issues.push(...rowIssues)
    const hasBlockingError = rowIssues.some(i => i.severity === 'ERROR')
    if (hasBlockingError) rowsWithErrors.add(rowNumber)
    if (rowIssues.some(i => i.severity === 'WARNING')) rowsWithWarnings.add(rowNumber)

    if (!hasBlockingError) {
      validatedRows.push({
        rowNumber,
        requiresUser,
        personNumber:     employeeNumber,
        firstNameEn,
        middleNameEn,
        lastNameEn,
        fullNameEn:        fullNameEnRaw,
        fullNameAr,
        workEmail,
        personalEmail:     raw.personalEmail?.trim().toLowerCase() || null,
        mobile:            normalizedMobile ?? rawMobile,
        gender,
        dateOfBirth:       dateOfBirth ?? '1970-01-01',
        nationalityCode,
        nationalityCategory,
        maritalStatus,
        hireDate:          hireDate ?? '',
        employmentType:    etRaw,
        basicSalary,
        totalPackage,
        contractType,
        contractStartDate,
        contractEndDate,
        probationEndDate,
        passportNumber:    raw.passportNumber?.trim() || null,
        emiratesId,
        visaNumber:        raw.visaNumber?.trim() || null,
        labourCardNumber:  raw.labourCardNumber?.trim() || null,
        refs: {
          legalEntityId:   entity?.id ?? '',
          departmentId:    dept?.id   ?? '',
          positionId:      pos?.id    ?? '',
          gradeId:         grade?.id  ?? '',
          locationId:      loc?.id    ?? null,
          lineManagerId,
          insurancePlanId: insurancePlan?.id ?? null,
        },
      })
    }
  }

  const rowsRequiringUser = validatedRows.filter(r => r.requiresUser).length
  const rowsWithoutUser   = validatedRows.filter(r => !r.requiresUser).length

  return {
    totalRows:         rawRows.length,
    validRows:         validatedRows.length,
    errorRows:         rowsWithErrors.size,
    warningRows:       [...rowsWithWarnings].filter(r => !rowsWithErrors.has(r)).length,
    duplicateRows:     duplicateRows.size,
    rowsRequiringUser,
    rowsWithoutUser,
    issues,
    validatedRows,
  }
}
