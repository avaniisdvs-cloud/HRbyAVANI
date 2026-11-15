/**
 * Migration V2 — package validator.
 *
 * Validates all 4 sheets of the migration package:
 *   1. Employees — via existing bulk-import validator (manager errors downgraded for within-batch)
 *   2. Managers  — both endpoints must exist in DB or this batch; cycle detection
 *   3. DeptHeads — dept must exist in DB; head must exist in DB or this batch
 *   4. LeaveBalances — employee + absence type must resolve; duplicates flagged
 *
 * Returns V2ValidationResult. Makes only read-only DB calls.
 */
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  persons, departments, absenceTypes, legalEntities, absenceBalances,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { validateImportRows } from '../core-hr/bulk-import/row-validator'
import type { V2ParsedPackage, V2Issue, V2ValidationResult, RawManagerRow, RawDeptHeadRow, V2ResolvedLeaveBalance } from './v2-types'

// ── Within-batch employee number set ─────────────────────────────────────────

function buildBatchNumbers(pkg: V2ParsedPackage): Set<string> {
  const s = new Set<string>()
  for (const row of pkg.employees) {
    const n = row.employeeNumber?.trim()
    if (n) s.add(n.toLowerCase())
  }
  return s
}

// ── Cycle detection via DFS with path coloring ────────────────────────────────

function detectCycles(links: RawManagerRow[]): string[] {
  const graph = new Map<string, string>()
  for (const l of links) {
    const emp = l.employeeNumber.toLowerCase()
    const mgr = l.managerEmployeeNumber.toLowerCase()
    graph.set(emp, mgr)
  }

  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  const cycles: string[] = []

  const dfs = (node: string, path: string[]): void => {
    const c = color.get(node) ?? WHITE
    if (c === GRAY) {
      const start = path.indexOf(node)
      cycles.push(path.slice(start).concat(node).join(' → '))
      return
    }
    if (c === BLACK) return
    color.set(node, GRAY)
    const mgr = graph.get(node)
    if (mgr) dfs(mgr, [...path, node])
    color.set(node, BLACK)
  }

  for (const node of graph.keys()) {
    if (!color.has(node)) dfs(node, [])
  }

  return cycles
}

// ── Validate Managers sheet ───────────────────────────────────────────────────

function validateManagerSheet(
  raw: RawManagerRow[],
  dbPersonNumbers: Set<string>,
  batchNumbers: Set<string>,
): { valid: RawManagerRow[]; issues: V2Issue[]; withinBatchCount: number } {
  const issues: V2Issue[] = []
  const valid: RawManagerRow[] = []
  let withinBatchCount = 0
  const seenLinks = new Set<string>()

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    const rowNum = i + 2
    const emp = row.employeeNumber.toLowerCase()
    const mgr = row.managerEmployeeNumber.toLowerCase()

    if (emp === mgr) {
      issues.push({
        sheet: 'Managers', row: rowNum, code: 'MANAGER_SELF_REFERENCE',
        severity: 'ERROR',
        message: `Employee ${row.employeeNumber} cannot be their own manager`,
      })
      continue
    }

    // Duplicate link detection
    const linkKey = `${emp}→${mgr}`
    if (seenLinks.has(linkKey)) {
      issues.push({
        sheet: 'Managers', row: rowNum, code: 'MANAGER_NOT_FOUND',
        severity: 'WARNING',
        message: `Duplicate manager link for ${row.employeeNumber} — skipping`,
      })
      continue
    }
    seenLinks.add(linkKey)

    const empInDb    = dbPersonNumbers.has(emp)
    const empInBatch = batchNumbers.has(emp)
    const mgrInDb    = dbPersonNumbers.has(mgr)
    const mgrInBatch = batchNumbers.has(mgr)

    if (!empInDb && !empInBatch) {
      issues.push({
        sheet: 'Managers', row: rowNum, code: 'MANAGER_NOT_FOUND',
        severity: 'ERROR',
        message: `Employee ${row.employeeNumber} not found in DB or this package`,
      })
      continue
    }

    if (!mgrInDb && !mgrInBatch) {
      issues.push({
        sheet: 'Managers', row: rowNum, code: 'MANAGER_NOT_FOUND',
        severity: 'ERROR',
        message: `Manager ${row.managerEmployeeNumber} not found in DB or this package`,
      })
      continue
    }

    if (mgrInBatch && !mgrInDb) withinBatchCount++
    valid.push(row)
  }

  // Cycle detection on valid links
  const cycles = detectCycles(valid)
  for (const cycle of cycles) {
    issues.push({
      sheet: 'Managers', code: 'CYCLE_DETECTED',
      severity: 'ERROR',
      message: `Hierarchy cycle detected: ${cycle}`,
    })
  }

  // Remove rows involved in cycles from valid list
  if (cycles.length > 0) {
    const cycleNodes = new Set<string>()
    for (const cycle of cycles) {
      cycle.split(' → ').forEach(n => cycleNodes.add(n.toLowerCase()))
    }
    return {
      valid: valid.filter(r => !cycleNodes.has(r.employeeNumber.toLowerCase())),
      issues,
      withinBatchCount,
    }
  }

  return { valid, issues, withinBatchCount }
}

// ── Validate DeptHeads sheet ──────────────────────────────────────────────────

function validateDeptHeadSheet(
  raw: RawDeptHeadRow[],
  dbDeptCodes: Set<string>,
  dbPersonNumbers: Set<string>,
  batchNumbers: Set<string>,
): { valid: RawDeptHeadRow[]; issues: V2Issue[] } {
  const issues: V2Issue[] = []
  const valid: RawDeptHeadRow[] = []

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    const rowNum = i + 2
    const dept = row.departmentCode.toLowerCase()
    const head = row.headEmployeeNumber.toLowerCase()
    let ok = true

    if (!dbDeptCodes.has(dept)) {
      issues.push({
        sheet: 'DeptHeads', row: rowNum, code: 'DEPT_NOT_FOUND',
        severity: 'ERROR',
        message: `Department ${row.departmentCode} not found in DB — seed master data first`,
      })
      ok = false
    }

    if (!dbPersonNumbers.has(head) && !batchNumbers.has(head)) {
      issues.push({
        sheet: 'DeptHeads', row: rowNum, code: 'DEPT_HEAD_NOT_FOUND',
        severity: 'ERROR',
        message: `Head employee ${row.headEmployeeNumber} not found in DB or this package`,
      })
      ok = false
    }

    if (ok) valid.push(row)
  }

  return { valid, issues }
}

// ── Validate LeaveBalances sheet ──────────────────────────────────────────────

async function validateLeaveBalanceSheet(
  raw: import('./v2-types').RawLeaveBalanceRow[],
  dbPersonNumbers: Map<string, string>,  // personNumber → personId
  batchNumbers: Set<string>,
  entityId: string,
): Promise<{ valid: V2ResolvedLeaveBalance[]; issues: V2Issue[] }> {
  const issues: V2Issue[] = []
  const valid: V2ResolvedLeaveBalance[] = []

  // Pre-load absence types for this entity
  const typeRows = await db
    .select({ id: absenceTypes.id, code: absenceTypes.typeCode })
    .from(absenceTypes)
    .where(and(eq(absenceTypes.tenantId, TENANT_ID), eq(absenceTypes.isActive, true)))

  const typeByCode = new Map(typeRows.map(t => [t.code.toUpperCase(), t.id]))

  // Pre-load existing absence_balances to detect duplicates
  const existingBalances = await db
    .select({ personId: absenceBalances.personId, absenceTypeId: absenceBalances.absenceTypeId, year: absenceBalances.balanceYear })
    .from(absenceBalances)
    .where(eq(absenceBalances.tenantId, TENANT_ID))

  const existingBalanceKeys = new Set(
    existingBalances.map(b => `${b.personId}:${b.absenceTypeId}:${b.year}`)
  )
  const batchBalanceKeys = new Set<string>()

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    const rowNum = i + 2
    const empLower = row.employeeNumber.toLowerCase()

    const inDb    = dbPersonNumbers.has(empLower)
    const inBatch = batchNumbers.has(empLower)

    if (!inDb && !inBatch) {
      issues.push({
        sheet: 'LeaveBalances', row: rowNum, code: 'LEAVE_EMP_NOT_FOUND',
        severity: 'ERROR',
        message: `Employee ${row.employeeNumber} not found in DB or this package`,
      })
      continue
    }

    const typeId = typeByCode.get(row.absenceTypeCode.toUpperCase())
    if (!typeId) {
      issues.push({
        sheet: 'LeaveBalances', row: rowNum, code: 'LEAVE_TYPE_NOT_FOUND',
        severity: 'ERROR',
        message: `Absence type code "${row.absenceTypeCode}" not found — check absence type configuration`,
      })
      continue
    }

    // Duplicate detection (only for DB-resident persons; batch persons are new → no existing balance)
    const personId = inDb ? dbPersonNumbers.get(empLower) : undefined
    if (personId) {
      const key = `${personId}:${typeId}:${row.balanceYear}`
      if (existingBalanceKeys.has(key)) {
        issues.push({
          sheet: 'LeaveBalances', row: rowNum, code: 'LEAVE_DUPLICATE',
          severity: 'WARNING',
          message: `Leave balance already exists for ${row.employeeNumber} / ${row.absenceTypeCode} / ${row.balanceYear} — will be skipped`,
        })
        continue
      }
      if (batchBalanceKeys.has(key)) {
        issues.push({
          sheet: 'LeaveBalances', row: rowNum, code: 'LEAVE_DUPLICATE',
          severity: 'WARNING',
          message: `Duplicate leave balance row for ${row.employeeNumber} / ${row.absenceTypeCode} / ${row.balanceYear} in this package`,
        })
        continue
      }
      batchBalanceKeys.add(key)
    }

    valid.push({
      raw: row,
      absenceTypeId: typeId,
      legalEntityId: entityId,
      personNumber:  row.employeeNumber,
    })
  }

  return { valid, issues }
}

// ── Public: validate the full migration package ────────────────────────────────

export async function validateMigrationPackage(pkg: V2ParsedPackage): Promise<V2ValidationResult> {
  // 1. Load reference data from DB
  const [allPersons, allDepts, allEntities] = await Promise.all([
    db.select({ id: persons.id, personNumber: persons.personNumber })
      .from(persons)
      .where(eq(persons.tenantId, TENANT_ID)),
    db.select({ id: departments.id, code: departments.code })
      .from(departments)
      .where(eq(departments.tenantId, TENANT_ID)),
    db.select({ id: legalEntities.id, code: legalEntities.entityCode })
      .from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
      .limit(1),
  ])

  const dbPersonNumbers = new Map(allPersons.map(p => [p.personNumber.toLowerCase(), p.id]))
  const dbPersonSet     = new Set(dbPersonNumbers.keys())
  const dbDeptCodes     = new Set(allDepts.map(d => (d.code ?? '').toLowerCase()))
  const entityId        = allEntities[0]?.id ?? ''

  const batchNumbers = buildBatchNumbers(pkg)

  // 2. Validate Employees sheet (existing bulk-import validator)
  const employeePreview = await validateImportRows(pkg.employees)

  // Downgrade manager-not-found errors for within-batch managers to warnings
  // (manager links come from the Managers sheet; inline manager field is optional)
  //
  // Also downgrade BR-PR-001 probation > 6 months to WARNING.
  // Historical employees (hired before UAE Federal Decree-Law No. 33 of 2021,
  // effective Feb 2022) may have valid probation periods up to 12 months under the
  // old law.  Their probationEndDate is already in the past and is a historical
  // fact — blocking migration on it is incorrect.  The 6-month cap remains an
  // ERROR in the live create/edit flow (row-validator.ts BR-PR-001).
  const patchedIssues = employeePreview.issues.map(issue => {
    if (
      issue.field === 'Line Manager Employee Number' &&
      issue.severity === 'ERROR'
    ) {
      const mgrMatch = issue.message.match(/"([^"]+)" not found/)
      const mgrNum = mgrMatch?.[1]?.toLowerCase()
      if (mgrNum && (batchNumbers.has(mgrNum) || dbPersonSet.has(mgrNum))) {
        return { ...issue, severity: 'WARNING' as const, message: `${issue.message} (will be set from Managers sheet)` }
      }
    }
    if (
      issue.field === 'Probation End Date' &&
      issue.severity === 'ERROR' &&
      issue.message.includes('BR-PR-001')
    ) {
      return {
        ...issue,
        severity: 'WARNING' as const,
        message: `${issue.message} — downgraded to warning for migration (historical data may pre-date UAE Decree-Law No. 33/2021)`,
      }
    }
    return issue
  })

  // Rebuild employeePreview with patched issues — re-count errors
  const patchedErrorRows = new Set<number>()
  for (const issue of patchedIssues) {
    if (issue.severity === 'ERROR') patchedErrorRows.add(issue.rowNumber)
  }
  const patchedPreview = {
    ...employeePreview,
    issues:     patchedIssues,
    errorRows:  patchedErrorRows.size,
    validRows:  employeePreview.totalRows - patchedErrorRows.size,
    validatedRows: employeePreview.validatedRows, // already-passed rows are still valid
  }

  // 3. Validate Managers sheet
  const { valid: validManagers, issues: mgrIssues, withinBatchCount } =
    validateManagerSheet(pkg.managers, dbPersonSet, batchNumbers)

  // 4. Validate DeptHeads sheet
  const { valid: validDeptHeads, issues: hodIssues } =
    validateDeptHeadSheet(pkg.deptHeads, dbDeptCodes, dbPersonSet, batchNumbers)

  // 5. Validate LeaveBalances sheet
  const { valid: validLeaveBalances, issues: lbIssues } =
    await validateLeaveBalanceSheet(pkg.leaveBalances, dbPersonNumbers, batchNumbers, entityId)

  // 6. Compile all issues
  const allIssues: V2Issue[] = [
    ...mgrIssues,
    ...hodIssues,
  ]

  const hasBlockers =
    patchedErrorRows.size > 0 ||
    allIssues.some(i => i.severity === 'ERROR') ||
    lbIssues.some(i => i.severity === 'ERROR')

  const cycleCount = allIssues.filter(i => i.code === 'CYCLE_DETECTED').length

  return {
    employeePreview:         patchedPreview,
    issues:                  allIssues,
    managerLinks:            validManagers,
    deptHeadLinks:           validDeptHeads,
    leaveBalances:           validLeaveBalances,
    leaveIssues:             lbIssues,
    canExecute:              !hasBlockers,
    withinBatchManagerCount: withinBatchCount,
    cycleCount,
  }
}
