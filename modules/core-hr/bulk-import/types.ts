/**
 * Bulk Employee Import — shared types.
 * Used by template generator, row-validator, import-engine, and UI.
 */

// ── Raw Excel row (string values as read from xlsx) ───────────────────────

export interface RawImportRow {
  requiresUser:              string | undefined
  employeeNumber:            string | undefined
  fullNameEn:                string | undefined
  fullNameAr:                string | undefined
  workEmail:                 string | undefined
  personalEmail:             string | undefined
  mobile:                    string | undefined
  gender:                    string | undefined
  dateOfBirth:               string | undefined
  nationalityCode:           string | undefined
  maritalStatus:             string | undefined
  legalEntityCode:           string | undefined
  departmentCode:            string | undefined
  positionCode:              string | undefined
  gradeCode:                 string | undefined
  locationCode:              string | undefined
  lineManagerEmployeeNumber: string | undefined
  hireDate:                  string | undefined
  employmentType:            string | undefined
  basicSalary:               string | undefined
  totalPackage:              string | undefined
  contractType:              string | undefined
  contractStartDate:         string | undefined
  contractEndDate:           string | undefined
  probationEndDate:          string | undefined
  passportNumber:            string | undefined
  emiratesId:                string | undefined
  visaNumber:                string | undefined
  labourCardNumber:          string | undefined
  insurancePlanCode:         string | undefined
}

// ── Resolved IDs and lookups after reference validation ───────────────────

export interface ResolvedRefs {
  legalEntityId:   string
  departmentId:    string
  positionId:      string
  gradeId:         string
  locationId:      string | null
  lineManagerId:   string | null
  insurancePlanId: string | null
}

// ── Typed, validated row ready for import ─────────────────────────────────

export interface ValidatedImportRow {
  rowNumber:        number
  requiresUser:     boolean
  personNumber:     string | null   // null = auto-generate
  firstNameEn:      string
  middleNameEn:     string | null
  lastNameEn:       string
  fullNameEn:       string
  fullNameAr:       string
  workEmail:        string | null
  personalEmail:    string | null
  mobile:           string | null
  gender:           'MALE' | 'FEMALE' | 'NOT_SPECIFIED'
  dateOfBirth:      string           // YYYY-MM-DD
  nationalityCode:  string           // ISO 3166-1 alpha-3
  nationalityCategory: 'UAE_NATIONAL' | 'GCC_NATIONAL' | 'EXPAT'
  maritalStatus:    string | null
  hireDate:         string           // YYYY-MM-DD
  employmentType:   string
  basicSalary:      string | null    // numeric string
  totalPackage:     string | null    // numeric string
  contractType:     string | null
  contractStartDate: string | null
  contractEndDate:  string | null
  probationEndDate: string | null
  passportNumber:   string | null    // will be encrypted
  emiratesId:       string | null    // will be encrypted (normalised)
  visaNumber:       string | null
  labourCardNumber: string | null
  refs: ResolvedRefs
}

// ── Validation error / warning per row ───────────────────────────────────

export type IssueSeverity = 'ERROR' | 'WARNING'

export interface RowIssue {
  rowNumber: number
  field:     string
  message:   string
  severity:  IssueSeverity
}

// ── Preview / validation result returned to the UI ───────────────────────

export interface ImportPreview {
  totalRows:          number
  validRows:          number
  errorRows:          number
  warningRows:        number
  duplicateRows:      number
  rowsRequiringUser:  number
  rowsWithoutUser:    number
  issues:             RowIssue[]
  validatedRows:      ValidatedImportRow[]
}

// ── Import result returned after confirm ─────────────────────────────────

export interface ImportRowResult {
  rowNumber:    number
  personNumber: string
  personId:     string
  fullNameEn:   string
  userCreated:  boolean
}

export interface ImportResult {
  imported:     number
  usersCreated: number
  rows:         ImportRowResult[]
}
