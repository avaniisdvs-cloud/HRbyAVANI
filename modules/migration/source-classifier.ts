/**
 * Source file classifier — Enterprise Data Migration Factory.
 *
 * Classifies uploaded source files into migration domains by inspecting
 * file name, sheet names, and column headers.
 *
 * Classification is heuristic — it scores each type and returns the best
 * match. Confidence reflects how certain the match is:
 *   HIGH   — all required columns found + multiple supporting columns
 *   MEDIUM — all required columns found + some supporting columns
 *   LOW    — required columns found but few supporting signals
 *
 * UNKNOWN is returned when no required column pattern matches, with a warning
 * so the user can manually assign the correct type in the UI.
 *
 * No DB access. No filesystem I/O. Pure data analysis.
 */

import type {
  SourceFileAnalysis, SourceFileType, ClassificationConfidence,
  SheetSummary, ClassifiedSourceFile, RawSourceRow,
} from './source-types'

// ── Column fingerprints per source type ──────────────────────────────────────
// required:   ALL substrings must appear in at least one column header (case-insensitive)
// supporting: additional matches that increase the confidence score

interface ColumnRule {
  required:    string[]
  supporting:  string[]
}

const COLUMN_RULES: Record<Exclude<SourceFileType, 'UNKNOWN'>, ColumnRule> = {
  EMPLOYEE_MASTER: {
    required:   ['employee number', 'full name'],
    supporting: ['date of birth', 'nationality', 'passport', 'gender', 'marital', 'primary email'],
  },
  EMPLOYEE_ASSIGNMENTS: {
    required:   ['employee id', 'department'],
    supporting: ['contract start', 'assignment category', 'line manager', 'probation', 'contract end'],
  },
  LEAVE_BALANCES: {
    required:   ['person number'],
    supporting: ['leave balance', 'opening balance', 'absence type', 'leave year', 'balance year'],
  },
  USERS_DATA: {
    required:   ['username'],
    supporting: ['email', 'role', 'user type', 'account'],
  },
  POSITION_MAPPING: {
    required:   ['new position'],
    supporting: ['old position', 'position code', 'mapping'],
  },
  DEPT_HEAD_MAPPING: {
    required:   ['department'],
    supporting: ['head', 'head employee', 'employee number', 'department code'],
  },
  MANAGER_HIERARCHY: {
    required:   ['manager employee number'],
    supporting: ['employee number', 'reporting', 'hierarchy'],
  },
  POSITION_CATALOG: {
    required:   ['position code', 'position for hod'],
    supporting: ['department', 'job code', 'title'],
  },
}

// ── File name and sheet name hints ────────────────────────────────────────────

const FILE_NAME_HINTS: Record<Exclude<SourceFileType, 'UNKNOWN'>, string[]> = {
  EMPLOYEE_MASTER:      ['employee master', 'person information', 'staff master', 'employees', 'personnel'],
  EMPLOYEE_ASSIGNMENTS: ['assignment', 'assignments', 'employee assign', 'position assign'],
  LEAVE_BALANCES:       ['leave balance', 'leave balances', 'absence balance', 'leave balance'],
  USERS_DATA:           ['users', 'user data', 'user accounts', 'logins', 'credentials'],
  POSITION_MAPPING:     ['position mapping', 'position map', 'old position new position', 'pos mapping'],
  DEPT_HEAD_MAPPING:    ['dept head', 'department head', 'hod mapping', 'dept_head'],
  MANAGER_HIERARCHY:    ['manager hierarchy', 'managers', 'reporting structure', 'org hierarchy', 'hierarchy'],
  POSITION_CATALOG:     ['positions jobs titles', 'position catalog', 'positions jobs', 'jobs titles', 'positions'],
}

// ── Scoring ──────────────────────────────────────────────────────────────────

interface TypeScore {
  type:           Exclude<SourceFileType, 'UNKNOWN'>
  score:          number
  hasAllRequired: boolean
}

function scoreType(
  type:       Exclude<SourceFileType, 'UNKNOWN'>,
  columns:    string[],
  fileName:   string,
  sheetNames: string[],
): TypeScore {
  const rule = COLUMN_RULES[type]
  const lc   = columns.map(c => c.toLowerCase())
  const fn   = fileName.toLowerCase()

  const hasAllRequired = rule.required.every(req => lc.some(col => col.includes(req)))

  const supportingMatches = rule.supporting.filter(s => lc.some(col => col.includes(s))).length

  const fileNameMatch = FILE_NAME_HINTS[type].some(hint => fn.includes(hint))
  const sheetMatch    = sheetNames.some(sn =>
    FILE_NAME_HINTS[type].some(hint => sn.toLowerCase().includes(hint))
  )

  let score = 0
  if (hasAllRequired)  score += 100
  score += supportingMatches * 10
  if (fileNameMatch)   score += 30
  if (sheetMatch)      score += 20

  return { type, score, hasAllRequired }
}

function toConfidence(score: number): ClassificationConfidence {
  if (score >= 160) return 'HIGH'
  if (score >= 120) return 'MEDIUM'
  return 'LOW'
}

// ── Public: classify a single source file ────────────────────────────────────

export function classifySourceFile(
  fileName: string,
  sheets:   SheetSummary[],
): SourceFileAnalysis {
  const allColumns = sheets.flatMap(s => s.columns)
  const sheetNames = sheets.map(s => s.name)
  const totalRows  = sheets.reduce((sum, s) => sum + s.rowCount, 0)
  const issues:   string[] = []
  const warnings: string[] = []

  if (sheets.length === 0) {
    issues.push('No sheets found in workbook')
  }
  if (totalRows === 0) {
    issues.push('File appears to be empty — no data rows detected')
  }

  const types  = Object.keys(COLUMN_RULES) as Exclude<SourceFileType, 'UNKNOWN'>[]
  const scores = types
    .map(t => scoreType(t, allColumns, fileName, sheetNames))
    .filter(s => s.hasAllRequired && s.score > 0)
    // Primary: higher score wins. Tiebreaker: earlier in types array wins (semantic priority).
    .sort((a, b) => b.score - a.score || types.indexOf(a.type) - types.indexOf(b.type))

  if (scores.length === 0) {
    warnings.push(
      `Could not auto-classify "${fileName}". ` +
      'Assign the file type manually before building the migration package.'
    )
    return { fileName, detectedType: 'UNKNOWN', confidence: 'LOW', sheets, issues, warnings }
  }

  const best   = scores[0]
  const second = scores[1]

  if (second && best.score - second.score < 20) {
    warnings.push(
      `File "${fileName}" could match "${best.type}" or "${second.type}". ` +
      'Verify the detected type is correct before proceeding.'
    )
  }

  return {
    fileName,
    detectedType: best.type,
    confidence:   toConfidence(best.score),
    sheets,
    issues,
    warnings,
  }
}

// ── Helper: build SheetSummary from raw rows ──────────────────────────────────

export function summarizeSheet(name: string, rows: RawSourceRow[]): SheetSummary {
  return {
    name,
    rowCount: rows.length,
    columns:  rows.length > 0 ? Object.keys(rows[0]) : [],
  }
}

// ── Helper: resolve effective type (respects user override) ───────────────────

export function effectiveType(file: ClassifiedSourceFile): SourceFileType {
  return file.overrideType ?? file.analysis.detectedType
}
