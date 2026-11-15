/**
 * Migration V2 — multi-sheet XLSX package parser.
 *
 * Reads the 4-sheet migration workbook and returns raw parsed rows.
 * No DB access, no auth, no writes — pure data transformation.
 * Called from v2-actions.ts after file upload.
 *
 * Required sheets (case-insensitive):
 *   Employees     — same column layout as bulk-import template
 *   Managers      — Employee Number | Manager Employee Number
 *   DeptHeads     — Department Code | Head Employee Number
 *   LeaveBalances — Employee Number | Absence Type Code | Balance Year | Opening Balance Days
 */
import * as XLSX from 'xlsx'
import { parseSheet } from '../core-hr/bulk-import/row-validator'
import type { RawImportRow } from '../core-hr/bulk-import/types'
import type {
  V2ParsedPackage, RawManagerRow, RawDeptHeadRow, RawLeaveBalanceRow,
} from './v2-types'

// ── Magic bytes check (OOXML ZIP vs OLE2 BIFF8) ──────────────────────────────

export function hasValidExcelMagicBytes(bytes: Uint8Array): boolean {
  // XLSX = ZIP: 50 4B 03 04
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) return true
  // XLS = OLE2: D0 CF 11 E0
  if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) return true
  return false
}

// ── Sheet lookup (case-insensitive, with aliases) ─────────────────────────────

function findSheet(wb: XLSX.WorkBook, ...names: string[]): string | undefined {
  const lower = wb.SheetNames.map(n => n.toLowerCase())
  for (const name of names) {
    const idx = lower.indexOf(name.toLowerCase())
    if (idx !== -1) return wb.SheetNames[idx]
  }
  return undefined
}

// ── Cell value helper ────────────────────────────────────────────────────────

function cellStr(row: unknown[], idx: number): string {
  const v = row[idx]
  if (v == null) return ''
  return String(v).trim()
}

// ── Managers sheet parser ─────────────────────────────────────────────────────
// Columns: Employee Number | Manager Employee Number

function parseManagerSheet(ws: XLSX.WorkSheet): RawManagerRow[] {
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (aoa.length < 2) return []

  const headers = (aoa[0] as unknown[]).map(c => String(c).trim().toLowerCase())
  // "Employee Number" and "Manager Employee Number" — find the one that's NOT manager first
  const mgrIdx = headers.findIndex(h => h.includes('manager'))
  const empIdx = headers.findIndex(h => h.includes('employee') && h !== headers[mgrIdx])

  if (empIdx === -1 || mgrIdx === -1) return []

  return (aoa.slice(1) as unknown[][])
    .filter(row => (row as unknown[]).some(c => String(c).trim()))
    .map(row => ({
      employeeNumber:        cellStr(row as unknown[], empIdx),
      managerEmployeeNumber: cellStr(row as unknown[], mgrIdx),
    }))
    .filter(r => r.employeeNumber && r.managerEmployeeNumber)
}

// ── DeptHeads sheet parser ────────────────────────────────────────────────────
// Columns: Department Code | Head Employee Number

function parseDeptHeadSheet(ws: XLSX.WorkSheet): RawDeptHeadRow[] {
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (aoa.length < 2) return []

  const headers = (aoa[0] as unknown[]).map(c => String(c).trim().toLowerCase())
  const deptIdx = headers.findIndex(h => h.includes('department'))
  const headIdx = headers.findIndex(h => h.includes('head') || (h.includes('employee') && !h.includes('department')))

  if (deptIdx === -1 || headIdx === -1) return []

  return (aoa.slice(1) as unknown[][])
    .filter(row => (row as unknown[]).some(c => String(c).trim()))
    .map(row => ({
      departmentCode:    cellStr(row as unknown[], deptIdx),
      headEmployeeNumber: cellStr(row as unknown[], headIdx),
    }))
    .filter(r => r.departmentCode && r.headEmployeeNumber)
}

// ── LeaveBalances sheet parser ────────────────────────────────────────────────
// Columns: Employee Number | Absence Type Code | Balance Year | Opening Balance Days

function parseLeaveBalanceSheet(ws: XLSX.WorkSheet): RawLeaveBalanceRow[] {
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (aoa.length < 2) return []

  const headers = (aoa[0] as unknown[]).map(c => String(c).trim().toLowerCase())
  const empIdx  = headers.findIndex(h => h.includes('employee'))
  const typeIdx = headers.findIndex(h => h.includes('absence type') || h.includes('type code') || (h.includes('type') && !h.includes('employee')))
  const yearIdx = headers.findIndex(h => h.includes('year'))
  const daysIdx = headers.findIndex(h => h.includes('days') || h.includes('balance'))

  if (empIdx === -1 || typeIdx === -1) return []

  const currentYear = 2026  // hardcoded — migration is for 2026 load

  return (aoa.slice(1) as unknown[][])
    .filter(row => (row as unknown[]).some(c => String(c).trim()))
    .map(row => {
      const yearRaw  = yearIdx !== -1 ? cellStr(row as unknown[], yearIdx) : ''
      const daysRaw  = daysIdx !== -1 ? cellStr(row as unknown[], daysIdx) : ''
      return {
        employeeNumber:    cellStr(row as unknown[], empIdx),
        absenceTypeCode:   cellStr(row as unknown[], typeIdx).toUpperCase(),
        balanceYear:       yearRaw ? (parseInt(yearRaw, 10) || currentYear) : currentYear,
        openingBalanceDays: daysRaw ? (parseFloat(daysRaw) || 0) : 0,
      }
    })
    .filter(r => r.employeeNumber && r.absenceTypeCode)
}

// ── Public: parse the full migration package ──────────────────────────────────
//
// Required sheets: Employees, Managers (or "Manager Hierarchy"), DeptHeads,
//                  LeaveBalances (or "Leave Balances")
//
// Optional sheets accepted but merged into Employees processing:
//   Assignments   — worker assignment overrides (employment type, location, etc.)
//                   Merged: the Employees sheet already embeds assignment fields
//                   (departmentCode, positionCode, gradeCode, locationCode, hireDate,
//                   employmentType). A separate Assignments sheet is noted in the
//                   package metadata but not separately processed — importEmployeesTx
//                   creates the worker_assignment inline with the person record.
//   User Accounts — user creation flags (requiresUser, workEmail, avaniisRole).
//                   Merged: the Employees sheet "Requires User" and "Work Email"
//                   columns drive user account creation in importEmployeesTx.
//                   A separate sheet is noted in metadata.
//
// If you have a data source that separates Assignments and User Accounts from
// Employees, consolidate them into the Employees sheet before upload using the
// bulk-import template (GET /api/persons/import/template).

export function parseMigrationPackageFile(arrayBuffer: ArrayBuffer): V2ParsedPackage {
  const bytes = new Uint8Array(arrayBuffer.slice(0, 4))
  if (!hasValidExcelMagicBytes(bytes)) {
    throw new Error('File content does not match a valid Excel workbook (.xlsx or .xls)')
  }

  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false })

  // Resolve required sheets (case-insensitive, with common aliases)
  const empSheetName = findSheet(wb, 'employees', 'employee')
  const mgrSheetName = findSheet(wb, 'managers', 'manager hierarchy', 'manager', 'reporting hierarchy')
  const hodSheetName = findSheet(wb, 'deptheads', 'department heads', 'dept heads', 'dept_heads', 'hods')
  const lbSheetName  = findSheet(wb, 'leavebalances', 'leave balances', 'leave_balances', 'leave balance', 'balances')

  // Optional sheets (merged into Employees — presence noted in sheetNames)
  const _assignmentsSheet = findSheet(wb, 'assignments', 'worker assignments')
  const _usersSheet       = findSheet(wb, 'user accounts', 'users', 'useraccounts')

  const missing: string[] = []
  if (!empSheetName) missing.push('Employees')
  if (!mgrSheetName) missing.push('Managers (or "Manager Hierarchy")')
  if (!hodSheetName) missing.push('DeptHeads (or "Department Heads")')
  if (!lbSheetName)  missing.push('LeaveBalances (or "Leave Balances")')

  if (missing.length > 0) {
    throw new Error(
      `Missing required sheet(s): ${missing.join(', ')}. ` +
      `Workbook contains: ${wb.SheetNames.join(', ')}`
    )
  }

  const employees:     RawImportRow[]       = parseSheet(wb.Sheets[empSheetName!]) as RawImportRow[]
  const managers:      RawManagerRow[]      = parseManagerSheet(wb.Sheets[mgrSheetName!])
  const deptHeads:     RawDeptHeadRow[]     = parseDeptHeadSheet(wb.Sheets[hodSheetName!])
  const leaveBalances: RawLeaveBalanceRow[] = parseLeaveBalanceSheet(wb.Sheets[lbSheetName!])

  return {
    employees,
    managers,
    deptHeads,
    leaveBalances,
    sheetNames: wb.SheetNames,
  }
}

