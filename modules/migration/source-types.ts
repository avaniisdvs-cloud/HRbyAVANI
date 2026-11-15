/**
 * Source file ingestion types — Enterprise Data Migration Factory.
 *
 * These types model the upstream layer that converts raw client source files
 * (EMPLOYEE_MASTER, EMPLOYEE_ASSIGNMENTS, LEAVE_BALANCES, etc.) into the
 * standard V2 migration package format (V2ParsedPackage).
 *
 * Downstream V2 validator and executor are unchanged — they still receive a
 * V2ParsedPackage as input, regardless of whether it was built by the transformer
 * service (source file path) or parsed from a pre-built 4-sheet workbook.
 */

// ── Source file domain classification ────────────────────────────────────────

export type SourceFileType =
  | 'EMPLOYEE_MASTER'       // Primary employee demographics
  | 'EMPLOYEE_ASSIGNMENTS'  // Department / position / contract / reporting data
  | 'LEAVE_BALANCES'        // Opening absence balances per employee
  | 'USERS_DATA'            // System user accounts (email / username)
  | 'POSITION_MAPPING'      // Position title → code mapping table
  | 'DEPT_HEAD_MAPPING'     // Department code → head employee mapping
  | 'MANAGER_HIERARCHY'     // Explicit manager relationships
  | 'POSITION_CATALOG'      // Position list with "Position for HOD" flag (01 Positions Jobs Titles)
  | 'UNKNOWN'               // Could not be auto-classified

export type ClassificationConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

// ── Sheet metadata ────────────────────────────────────────────────────────────

export interface SheetSummary {
  name:     string
  rowCount: number
  columns:  string[]
}

// ── Classification result ─────────────────────────────────────────────────────

export interface SourceFileAnalysis {
  fileName:     string
  detectedType: SourceFileType
  confidence:   ClassificationConfidence
  sheets:       SheetSummary[]
  issues:       string[]   // structural problems (empty file, missing required columns)
  warnings:     string[]   // soft concerns (ambiguous format, unknown column names)
}

// ── Classified file: analysis + raw row data ──────────────────────────────────

// Date is included because XLSX cellDates:true produces Date objects at parse time
// (before the rows are serialized to JSON in the session store).
export type RawSourceRow = Record<string, string | number | boolean | Date | null | undefined>

export interface ClassifiedSourceFile {
  analysis:      SourceFileAnalysis
  sheets:        Map<string, RawSourceRow[]>  // sheetName → rows
  overrideType?: SourceFileType               // user-supplied override for detectedType
}

// ── Transform context (pre-loaded DB reference data) ─────────────────────────
// Caller loads these from DB before calling transformSourceFiles().
// The transformer itself is pure — no DB access.

export interface TransformPosition {
  code:    string
  titleEn: string
}

export interface TransformDepartment {
  code:   string
  nameEn: string
}

export interface TransformContext {
  positions:    TransformPosition[]
  departments:  TransformDepartment[]
  grades:       Array<{ code: string }>
  locations:    Array<{ code: string }>
  absenceTypes: Array<{ code: string }>
  // Optional defaults applied when source data doesn't specify a value
  defaultGradeCode?:          string
  defaultLocationCode?:       string
  defaultLegalEntityCode?:    string
  defaultBalanceYear?:        number
  // Dept code → fallback position code (when title resolution fails)
  departmentDefaultPositions?: Map<string, string>
}

// ── Transform options ─────────────────────────────────────────────────────────

export type MigrationMode = 'FULL_RELOAD' | 'INCREMENTAL'

export interface TransformOptions {
  mode: MigrationMode
  // INCREMENTAL only: personNumbers already in DB — these rows are skipped
  existingPersonNumbers?: Set<string>
  // Allow manager references outside the current dataset (warning, not blocker)
  allowExternalManagers?: boolean
  // When true, derive each employee's line manager from their department head
  // (HOD) instead of the source "Line Manager ID" column. Non-head employees
  // report to their dept HOD; HODs keep their source line manager (typically the
  // CEO), so the hierarchy becomes: employee → dept HOD → CEO. Used when the
  // source reporting data is flat (everyone points to one top manager).
  deriveManagersFromDeptHead?: boolean
}

// ── Transformation output detail ──────────────────────────────────────────────

export interface TransformWarning {
  employeeNumber?: string
  field:           string
  message:         string
}

export interface TransformBlocker {
  employeeNumber?: string
  field:           string
  message:         string
}

// ── Transformation summary ────────────────────────────────────────────────────

export interface TransformationSummary {
  employeesDetected:     number   // total rows in EMPLOYEE_MASTER
  employeesIncluded:     number   // rows going into the package
  employeesSkipped:      number   // skipped (incremental dedup)
  managersResolved:      number   // valid manager link rows generated
  managersSkipped:       number   // self-refs / out-of-dataset managers skipped
  deptHeadsResolved:     number   // dept head rows generated
  leaveBalancesDetected: number   // leave balance rows generated
  usersMatched:          number   // employees where a user account was found
  positionsFromMapping:  number   // positions resolved via title→code (file or DB)
  positionsFallback:     number   // positions resolved via dept default
  positionsMissing:      number   // positions that could not be resolved
  mobileNormalized:      number   // mobile numbers that were reformatted
  warnings:              TransformWarning[]
  blockers:              TransformBlocker[]
  canBuild:              boolean  // false if any blockers present
}
