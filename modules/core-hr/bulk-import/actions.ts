'use server'

/**
 * Bulk Employee Import — Server Actions.
 *
 * Pattern: auth → Zod validate → business rules → tx + audit → revalidatePath
 *
 * Two public actions:
 *   validateImportFile  — parse + validate xlsx, return ImportPreview (NO writes)
 *   confirmImport       — insert all valid rows atomically (Hard Rule 1)
 *
 * Template reference data is served via the API route:
 *   GET /api/persons/import/template
 */
import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  legalEntities, departments, positions, grades, locations,
} from '@/drizzle/schema'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { translateError } from '@/lib/app-error'
import { parseSheet, validateImportRows } from './row-validator'
import { importEmployeesTx } from './import-engine'
import type { ImportPreview, ImportResult, ValidatedImportRow } from './types'

// ── Allowed roles ─────────────────────────────────────────────────────────
const IMPORT_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'] as const

// ── File size / row limits ────────────────────────────────────────────────
const MAX_BYTES = 5 * 1024 * 1024  // 5 MB
const MAX_ROWS  = 1_000

// ── Magic bytes signatures ────────────────────────────────────────────────
// Reject files whose binary header doesn't match the declared extension.
// Prevents a malicious file renamed to .xlsx from being parsed by xlsx.
// XLSX (OOXML) = ZIP container: 50 4B 03 04
// XLS  (BIFF8) = OLE2 compound doc: D0 CF 11 E0
function hasValidMagicBytes(bytes: Uint8Array, ext: 'xlsx' | 'xls'): boolean {
  if (ext === 'xlsx') {
    return bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04
  }
  return bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0
}

// ══════════════════════════════════════════════════════════════════════════
// 1 — validateImportFile
//     Accepts a FormData with a 'file' field (xlsx), parses and validates
//     every row, returns a preview. Makes NO DB writes.
// ══════════════════════════════════════════════════════════════════════════

export async function validateImportFile(
  formData: FormData,
): Promise<ImportPreview> {
  try {
    // 1. Auth
    await requireRole([...IMPORT_ROLES])

    // 2. Extract file
    const file = formData.get('file')
    if (!(file instanceof File)) throw new Error('No file provided')
    if (file.size > MAX_BYTES)  throw new Error(`File exceeds ${MAX_BYTES / 1024 / 1024} MB limit`)
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'xls') throw new Error('Only .xlsx or .xls files are accepted')

    // 3. Parse xlsx
    const arrayBuffer = await file.arrayBuffer()

    // Magic bytes check — must come before XLSX.read() to block malicious files
    // that have been renamed with an .xlsx/.xls extension.
    if (!hasValidMagicBytes(new Uint8Array(arrayBuffer.slice(0, 4)), ext as 'xlsx' | 'xls')) {
      throw new Error('File content does not match the declared file type')
    }
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false })
    const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'employees') ?? wb.SheetNames[0]
    if (!sheetName) throw new Error('No sheet found in the uploaded file')
    const ws = wb.Sheets[sheetName]

    // 4. Parse rows
    const rawRows = parseSheet(ws)
    if (rawRows.length === 0) {
      return {
        totalRows: 0, validRows: 0, errorRows: 0,
        warningRows: 0, duplicateRows: 0,
        rowsRequiringUser: 0, rowsWithoutUser: 0,
        issues: [], validatedRows: [],
      }
    }
    if (rawRows.length > MAX_ROWS) {
      throw new Error(`File contains ${rawRows.length} data rows. Maximum allowed is ${MAX_ROWS} per upload.`)
    }

    // 5. Validate all rows (DB lookups, business rules)
    return await validateImportRows(rawRows)
  } catch (e) {
    translateError(e, 'validateImportFile')
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 2 — confirmImport
//     Receives the pre-validated rows from the UI (already returned by
//     validateImportFile). Re-validates auth and checks that there are no
//     blocking errors before calling the import engine.
//
//     All-or-nothing: if any row throws inside the transaction, the whole
//     batch rolls back and no rows are committed.
// ══════════════════════════════════════════════════════════════════════════

export async function confirmImport(
  validatedRows: ValidatedImportRow[],
): Promise<ImportResult | { error: string }> {
  try {
    // 1. Auth
    const user = await requireRole([...IMPORT_ROLES])

    // 2. Basic sanity checks
    if (!Array.isArray(validatedRows) || validatedRows.length === 0) {
      throw new Error('No valid rows to import')
    }
    if (validatedRows.length > MAX_ROWS) {
      throw new Error(`Batch size ${validatedRows.length} exceeds maximum ${MAX_ROWS}`)
    }

    // 3. Run all-or-nothing import
    const result = await importEmployeesTx(
      {
        id:            user.id,
        name:          user.name,
        role:          user.role,
        personId:      user.personId,
        legalEntityId: user.legalEntityId,
      },
      validatedRows,
    )

    // 4. Revalidate persons list
    revalidatePath('/persons')

    return result
  } catch (e) {
    console.error('[confirmImport]', e)
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 3 — getTemplateRefData
//     Called server-side by the template API route and the page to load
//     reference data for the Excel template sheets.
// ══════════════════════════════════════════════════════════════════════════

export async function getTemplateRefData() {
  try {
    await requireRole([...IMPORT_ROLES])

    const [entityRows, deptRows, posRows, gradeRows, locRows] = await Promise.all([
      db.select({ code: legalEntities.entityCode, nameEn: legalEntities.nameEn })
        .from(legalEntities)
        .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
        .orderBy(asc(legalEntities.nameEn)),

      db.select({ code: departments.code, nameEn: departments.nameEn, entityId: departments.legalEntityId })
        .from(departments)
        .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true)))
        .orderBy(asc(departments.nameEn)),

      db.select({
        code: positions.positionCode,
        titleEn: positions.positionTitleEn,
        entityId: positions.legalEntityId,
      })
        .from(positions)
        .where(and(eq(positions.tenantId, TENANT_ID), eq(positions.isActive, true)))
        .orderBy(asc(positions.positionTitleEn)),

      db.select({ code: grades.gradeCode, nameEn: grades.gradeNameEn })
        .from(grades)
        .where(and(eq(grades.tenantId, TENANT_ID), eq(grades.isActive, true)))
        .orderBy(asc(grades.gradeCode)),

      db.select({ code: locations.code, nameEn: locations.nameEn })
        .from(locations)
        .where(and(eq(locations.tenantId, TENANT_ID), eq(locations.isActive, true)))
        .orderBy(asc(locations.nameEn)),
    ])

    // Resolve entityCode for departments + positions
    const entityCodeById = new Map(entityRows.map(e => [e.code, e.code]))
    const entityIdToCode = new Map<string, string>()
    const allEntities = await db
      .select({ id: legalEntities.id, code: legalEntities.entityCode })
      .from(legalEntities)
      .where(eq(legalEntities.tenantId, TENANT_ID))
    allEntities.forEach(e => entityIdToCode.set(e.id, e.code))

    return {
      legalEntities: entityRows,
      departments:   deptRows.map(d => ({
        code:       d.code ?? '',
        nameEn:     d.nameEn,
        entityCode: d.entityId ? (entityIdToCode.get(d.entityId) ?? '') : '',
      })),
      positions: posRows.map(p => ({
        code:       p.code ?? '',
        titleEn:    p.titleEn,
        entityCode: p.entityId ? (entityIdToCode.get(p.entityId) ?? '') : '',
      })),
      grades:    gradeRows.map(g => ({ code: g.code ?? '', nameEn: g.nameEn ?? '' })),
      locations: locRows.map(l => ({ code: l.code ?? '', nameEn: l.nameEn ?? '' })),
    }
  } catch (e) {
    translateError(e, 'getTemplateRefData')
  }
}
