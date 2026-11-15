'use server'
/**
 * Source file ingestion server actions — Enterprise Data Migration Factory.
 *
 * SUPER_ADMIN only. No DB writes. No migration writes.
 * All actions are read-only or /tmp-only.
 *
 * Action sequence (Phase B — upstream of existing V2 flow):
 *   analyzeSourceFiles      → sessionId + SourceFileAnalysis[]   (Step 3 — upload)
 *   buildMigrationPackage   → TransformationSummary              (Step 6 — build)
 *   getSessionPackage       → V2ParsedPackage                    (feeds Step 7 — validation)
 *   clearSessionFiles       → void                               (cleanup)
 *
 * The V2ParsedPackage returned by getSessionPackage is fed directly into the
 * existing validateMigrationPackage → executeMigration flow in v2-actions.ts.
 * Those actions are unchanged.
 */

import * as XLSX from 'xlsx'
import { randomUUID }     from 'crypto'
import { eq, and }        from 'drizzle-orm'
import { db }             from '@/lib/db'
import { requireRole }    from '@/lib/auth'
import {
  positions, departments, grades, locations, absenceTypes, persons,
} from '@/drizzle/schema'
import { TENANT_ID }      from '@/lib/constants'
import { hasValidExcelMagicBytes } from './v2-package-parser'
import { classifySourceFile, summarizeSheet } from './source-classifier'
import { transformSourceFiles }              from './source-transformer'
import {
  saveSession, savePackage, loadSession, loadPackage, clearSession as _clearSession,
  isValidSessionId,
} from './package-store'
import type { SourceFileAnalysis, RawSourceRow, MigrationMode, SourceFileType, ClassifiedSourceFile } from './source-types'
import type { V2ParsedPackage }    from './v2-types'
import type { StoredFileEntry }    from './package-store'

const SA          = ['SUPER_ADMIN'] as const
const MAX_FILES   = 10
const MAX_BYTES   = 50 * 1024 * 1024   // 50 MB per file
const MAX_ROWS    = 5_000              // per sheet

// ── Header row auto-detection ─────────────────────────────────────────────────
// Some source exports (e.g., leave balance files) have title/date rows above the
// real column headers. Scan up to 5 rows to find the first one that contains at
// least one recognisable column name fragment. Returns 0 (first row) on no match.

const KNOWN_COL_FRAGMENTS = [
  'employee number', 'employee id', 'person number',
  'full name', 'department', 'contract start',
  'opening balance', 'absence type',
  'username', 'new position', 'manager employee number',
  'hire date', 'date of birth', 'nationality',
]

function findHeaderRow(ws: XLSX.WorkSheet, maxScan = 5): number {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  for (let i = 0; i < Math.min(maxScan, aoa.length); i++) {
    const cells = (aoa[i] as unknown[]).map(c => String(c ?? '').trim().toLowerCase())
    const hit = cells.some(cell => KNOWN_COL_FRAGMENTS.some(f => cell.includes(f)))
    if (hit) return i
  }
  return 0
}

// ── File parsing ──────────────────────────────────────────────────────────────

async function parseFileToEntries(
  file: File,
): Promise<StoredFileEntry | { error: string }> {
  if (file.size > MAX_BYTES) {
    return { error: `"${file.name}" exceeds the ${MAX_BYTES / 1024 / 1024} MB limit` }
  }

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
    return { error: `"${file.name}" — only .xlsx, .xls, and .csv files are accepted` }
  }

  const arrayBuffer = await file.arrayBuffer()
  const bytes       = new Uint8Array(arrayBuffer)

  let wb: XLSX.WorkBook
  try {
    if (ext === 'csv') {
      const text = new TextDecoder().decode(bytes)
      wb = XLSX.read(text, { type: 'string' })
    } else {
      if (!hasValidExcelMagicBytes(bytes.slice(0, 4))) {
        return { error: `"${file.name}" does not appear to be a valid Excel file` }
      }
      wb = XLSX.read(bytes, { type: 'array', cellDates: true })
    }
  } catch (e) {
    return { error: `"${file.name}" could not be parsed: ${e instanceof Error ? e.message : String(e)}` }
  }

  // Reject pre-built V2 migration packages uploaded as source files.
  // These are identified by the presence of "DeptHeads" or "LeaveBalances" sheet names,
  // which are unique to the 4-sheet package format and never appear in raw source exports.
  const lcSheetNames = wb.SheetNames.map(n => n.toLowerCase().replace(/[\s_]/g, ''))
  if (lcSheetNames.includes('deptheads') || lcSheetNames.includes('leavebalances')) {
    const sheetSummaries = wb.SheetNames.map(name => {
      const rows = XLSX.utils.sheet_to_json<RawSourceRow>(wb.Sheets[name], { defval: null, raw: false })
      return { name, rowCount: rows.length, columns: rows.length > 0 ? Object.keys(rows[0]) : [] }
    })
    return {
      analysis: {
        fileName:     file.name,
        detectedType: 'UNKNOWN',
        confidence:   'LOW',
        sheets:       sheetSummaries,
        issues:       [
          `"${file.name}" appears to be a pre-built V2 migration package (contains sheets: ${wb.SheetNames.join(', ')}). ` +
          'Upload it via "Upload Pre-Built V2 Workbook" in Step 6 — do not upload it here as a source file.',
        ],
        warnings: [],
      },
      sheets: Object.fromEntries(
        wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json<RawSourceRow>(wb.Sheets[n], { defval: null, raw: false }).slice(0, MAX_ROWS)])
      ),
    } as StoredFileEntry
  }

  const sheetsObj: Record<string, RawSourceRow[]> = {}
  for (const name of wb.SheetNames) {
    // Auto-detect the real header row: scan up to 5 rows to find the first row
    // where at least one cell matches a known column name fragment.
    // This handles source files (e.g., leave balance exports) that have title/date
    // rows above the actual column headers.
    const headerRow = findHeaderRow(wb.Sheets[name])
    const rawRows = XLSX.utils.sheet_to_json<RawSourceRow>(
      wb.Sheets[name],
      { defval: null, raw: false, range: headerRow },
    )
    sheetsObj[name] = rawRows.slice(0, MAX_ROWS)
  }

  const sheetSummaries = Object.entries(sheetsObj).map(([name, rows]) =>
    summarizeSheet(name, rows)
  )
  const analysis = classifySourceFile(file.name, sheetSummaries)

  return { analysis, sheets: sheetsObj }
}

// ── Action 1 — analyzeSourceFiles ─────────────────────────────────────────────

export interface AnalyzeResult {
  sessionId: string
  analyses:  SourceFileAnalysis[]
  errors:    string[]   // per-file parse errors (non-fatal)
}

export async function analyzeSourceFiles(
  formData: FormData,
): Promise<AnalyzeResult | { error: string }> {
  try {
    await requireRole([...SA])

    const raw = formData.getAll('files')
    const files = raw.filter((v): v is File => v instanceof File)

    if (files.length === 0) return { error: 'No files provided' }
    if (files.length > MAX_FILES) {
      return { error: `Too many files — maximum is ${MAX_FILES}, received ${files.length}` }
    }

    const sessionId = randomUUID()
    const stored:    StoredFileEntry[] = []
    const analyses:  SourceFileAnalysis[] = []
    const errors:    string[] = []

    for (const file of files) {
      const result = await parseFileToEntries(file)
      if ('error' in result) {
        errors.push(result.error)
        continue
      }
      stored.push(result)
      analyses.push(result.analysis)
    }

    if (stored.length === 0) {
      return { error: `No files could be parsed. ${errors.join('; ')}` }
    }

    await saveSession(sessionId, stored)

    return { sessionId, analyses, errors }
  } catch (e) {
    console.error('[analyzeSourceFiles]', e)
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── DB context loader ─────────────────────────────────────────────────────────

async function loadTransformContext() {
  const [posRows, deptRows, gradeRows, locRows, atRows, posDeptRows] = await Promise.all([
    db.select({ code: positions.positionCode, titleEn: positions.positionTitleEn })
      .from(positions)
      .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.isActive, true))),

    db.select({ code: departments.code, nameEn: departments.nameEn })
      .from(departments)
      .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true))),

    db.select({ code: grades.gradeCode })
      .from(grades)
      .where(and(eq(grades.tenantId, TENANT_ID), eq(grades.isActive, true))),

    db.select({ code: locations.code })
      .from(locations)
      .where(and(eq(locations.tenantId, TENANT_ID), eq(locations.isActive, true))),

    db.select({ code: absenceTypes.typeCode })
      .from(absenceTypes)
      .where(and(eq(absenceTypes.tenantId, TENANT_ID), eq(absenceTypes.isActive, true))),

    // Build dept → first-active-position map for fallback when no per-employee
    // position mapping exists.  Joins positions → departments via departmentId FK.
    db.select({ posCode: positions.positionCode, deptCode: departments.code })
      .from(positions)
      .innerJoin(departments, eq(positions.departmentId, departments.id))
      .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.isActive, true)))
      .orderBy(positions.positionCode),   // deterministic ordering
  ])

  // Take the first position code per department as the dept-level default.
  // Employees missing an explicit position mapping will fall back to this.
  const departmentDefaultPositions = new Map<string, string>()
  for (const { posCode, deptCode } of posDeptRows) {
    if (deptCode && posCode && !departmentDefaultPositions.has(deptCode)) {
      departmentDefaultPositions.set(deptCode, posCode)
    }
  }

  return {
    positions:    posRows,
    departments:  deptRows,
    grades:       gradeRows,
    locations:    locRows,
    absenceTypes: atRows,
    departmentDefaultPositions,
  }
}

// ── Action 2 — buildMigrationPackage ─────────────────────────────────────────

export interface BuildResult {
  sessionId: string
  summary:   import('./source-types').TransformationSummary
}

export async function buildMigrationPackage(
  sessionId:     string,
  mode:          MigrationMode,
  overrideTypes?: Record<string, SourceFileType>,  // fileName → overrideType
): Promise<BuildResult | { error: string }> {
  try {
    await requireRole([...SA])

    // F-03: validate sessionId before use
    if (!isValidSessionId(sessionId)) {
      return { error: 'Invalid session ID — please re-upload source files' }
    }

    const session = await loadSession(sessionId)
    if (!session) {
      return { error: `Session "${sessionId}" not found — re-upload source files` }
    }

    // Reconstruct ClassifiedSourceFile[] from stored session
    const classifiedFiles: ClassifiedSourceFile[] = session.files.map(entry => ({
      analysis:      entry.analysis,
      sheets:        new Map(Object.entries(entry.sheets)),
      overrideType:  overrideTypes?.[entry.analysis.fileName] as SourceFileType | undefined,
    }))

    // Load reference data from DB (read-only)
    const dbContext = await loadTransformContext()

    // F-02: load existing person numbers for INCREMENTAL deduplication
    let existingPersonNumbers: Set<string> | undefined
    if (mode === 'INCREMENTAL') {
      const rows = await db
        .select({ personNumber: persons.personNumber })
        .from(persons)
        .where(eq(persons.tenantId, TENANT_ID))
      existingPersonNumbers = new Set(rows.map(r => r.personNumber))
    }

    const context = {
      positions:    dbContext.positions,
      departments:  dbContext.departments,
      grades:       dbContext.grades,
      locations:    dbContext.locations,
      absenceTypes: dbContext.absenceTypes,
      defaultGradeCode:           dbContext.grades[0]?.code,
      defaultLocationCode:        dbContext.locations[0]?.code,
      defaultLegalEntityCode:     'AVN-001',
      defaultBalanceYear:         new Date().getFullYear(),
      departmentDefaultPositions: dbContext.departmentDefaultPositions,
    }

    const { package: pkg, summary } = transformSourceFiles(
      classifiedFiles,
      {
        mode,
        existingPersonNumbers,
        // Source "Line Manager ID" data is flat (nearly everyone points to the
        // CEO), so build the org hierarchy from department heads instead:
        // employee → dept HOD → CEO. Requires the POSITION_CATALOG file (01) so
        // dept heads can be derived; otherwise this falls back to source links.
        deriveManagersFromDeptHead: true,
      },
      context,
    )

    // Still save even when canBuild=false so the UI can show blockers
    await savePackage(sessionId, pkg, summary, mode)
    return { sessionId, summary }
  } catch (e) {
    console.error('[buildMigrationPackage]', e)
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Action 3 — getSessionPackage ─────────────────────────────────────────────
// Returns the V2ParsedPackage stored in /tmp for this session.
// This feeds directly into the existing validateMigrationPackage() action.

export async function getSessionPackage(
  sessionId: string,
): Promise<V2ParsedPackage | { error: string }> {
  try {
    await requireRole([...SA])

    // F-03: validate sessionId before use
    if (!isValidSessionId(sessionId)) {
      return { error: 'Invalid session ID' }
    }

    const stored = await loadPackage(sessionId)
    if (!stored) {
      return { error: `No built package found for session "${sessionId}" — run buildMigrationPackage first` }
    }

    return stored.pkg
  } catch (e) {
    console.error('[getSessionPackage]', e)
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Action 4 — clearSessionFiles ─────────────────────────────────────────────

export async function clearSessionFiles(
  sessionId: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole([...SA])
    // F-03: validate sessionId before use (isValidSessionId — non-throwing)
    if (!isValidSessionId(sessionId)) {
      return { error: 'Invalid session ID' }
    }
    await _clearSession(sessionId)
    return { ok: true }
  } catch (e) {
    console.error('[clearSessionFiles]', e)
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
