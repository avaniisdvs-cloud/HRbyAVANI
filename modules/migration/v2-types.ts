/**
 * Migration Framework V2 — all shared types.
 *
 * V2 is a 9-step production-grade workflow that replaces the V1 manual pilot process.
 * Key additions over V1: within-batch manager resolution, hierarchy cycle detection,
 * leave balance import, staged execution, post-load scorecard.
 */
import type { ImportPreview, ValidatedImportRow } from '../core-hr/bulk-import/types'

// ── Raw rows parsed from the 4-sheet migration package ────────────────────────

export interface RawManagerRow {
  employeeNumber:        string
  managerEmployeeNumber: string
}

export interface RawDeptHeadRow {
  departmentCode:    string
  headEmployeeNumber: string
}

export interface RawLeaveBalanceRow {
  employeeNumber:    string
  absenceTypeCode:   string
  balanceYear:       number
  openingBalanceDays: number
}

// ── Parsed package: all 4 sheets ──────────────────────────────────────────────

export interface V2ParsedPackage {
  employees:     import('../core-hr/bulk-import/types').RawImportRow[]
  managers:      RawManagerRow[]
  deptHeads:     RawDeptHeadRow[]
  leaveBalances: RawLeaveBalanceRow[]
  sheetNames:    string[]
}

// ── Validation issues across all sheets ────────────────────────────────────────

export type V2Sheet = 'Employees' | 'Managers' | 'DeptHeads' | 'LeaveBalances' | 'Package'

export type V2IssueCode =
  | 'MISSING_SHEET'
  | 'EMPLOYEE_VALIDATION_ERROR'
  | 'MANAGER_NOT_FOUND'
  | 'MANAGER_SELF_REFERENCE'
  | 'CYCLE_DETECTED'
  | 'DEPT_HEAD_NOT_FOUND'
  | 'DEPT_NOT_FOUND'
  | 'LEAVE_EMP_NOT_FOUND'
  | 'LEAVE_TYPE_NOT_FOUND'
  | 'LEAVE_DUPLICATE'

export interface V2Issue {
  sheet:    V2Sheet
  row?:     number
  code:     V2IssueCode
  severity: 'ERROR' | 'WARNING' | 'INFO'
  message:  string
}

// ── Resolved leave balance (after typeCode → UUID lookup) ─────────────────────

export interface V2ResolvedLeaveBalance {
  raw:            RawLeaveBalanceRow
  absenceTypeId:  string
  legalEntityId:  string
  personNumber:   string  // same as raw.employeeNumber, normalised
}

// ── Validation result (returned to UI after Step 5 validation) ────────────────

export interface V2ValidationResult {
  employeePreview:        ImportPreview
  issues:                 V2Issue[]
  managerLinks:           RawManagerRow[]
  deptHeadLinks:          RawDeptHeadRow[]
  leaveBalances:          V2ResolvedLeaveBalance[]
  leaveIssues:            V2Issue[]
  canExecute:             boolean
  withinBatchManagerCount: number
  cycleCount:             number
}

// ── Dry Run Summary (shown in Step 6, no writes) ──────────────────────────────

export interface DryRunSummary {
  employeeCount:       number   // rows in package
  validEmployees:      number   // will be created
  errorEmployees:      number   // have blocking errors
  managerLinksTotal:   number   // rows in Managers sheet
  managerLinksValid:   number   // will be set
  managerLinksErrors:  number   // cannot resolve
  deptHeadLinksTotal:  number
  deptHeadLinksValid:  number
  deptHeadLinksErrors: number
  leaveBalancesTotal:  number
  leaveBalancesValid:  number
  leaveBalancesErrors: number
  withinBatchManagers: number   // managers resolved within this batch
  cyclesDetected:      number
  blockers:            V2Issue[]
  warnings:            V2Issue[]
  canExecute:          boolean
}

// ── Execution result (after Step 7 confirm & execute) ─────────────────────────

export interface V2PhaseResult {
  phase:   'employees' | 'managers' | 'deptHeads' | 'leaveBalances' | 'managerRoles'
  created: number
  skipped: number
  errors:  string[]
}

export interface V2ExecutionResult {
  employeesCreated:            number
  usersCreated:                number
  managerLinksSet:             number   // Phase 2 + Phase 3.5 combined
  managerLinksSkipped:         number
  hodLinksSet:                 number   // Phase 3.5 only (HOD auto-link fallback)
  deptHeadsSet:                number
  deptHeadsSkipped:            number
  leaveBalancesCreated:        number
  leaveBalancesSkipped:        number
  managerRolesAssigned:        number   // Phase 5: EMPLOYEE → MANAGER promotions
  managerRolesMissingAccount:  number   // managers with direct reports but no user account
  phases:                      V2PhaseResult[]
  ok:                          boolean  // false if ANY phase wrote 0 when non-zero was expected
  errors:                      string[]
}

// ── Post-Load Scorecard (Step 8) ──────────────────────────────────────────────

export interface PostLoadScorecardRow {
  check:    string
  expected: number
  actual:   number
  pass:     boolean
  detail?:  string
}

export type SignOffVerdict = 'READY' | 'READY_WITH_RISKS' | 'NOT_READY'

export interface PostLoadScorecard {
  rows:     PostLoadScorecardRow[]
  verdict:  SignOffVerdict
  summary:  string
  loadedAt: string  // ISO timestamp of scorecard generation
}
