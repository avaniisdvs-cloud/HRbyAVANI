/**
 * Migration V2 — dry run summary builder.
 *
 * Pure computation over V2 types — no DB access, no server-only imports.
 * Safe for use in both server and client contexts.
 */
import type { V2ParsedPackage, V2ValidationResult, DryRunSummary } from './v2-types'

export function buildDryRunSummary(result: V2ValidationResult, rawPkg: V2ParsedPackage): DryRunSummary {
  const { employeePreview, issues, managerLinks, deptHeadLinks, leaveBalances, leaveIssues } = result

  const allIssues = [...issues, ...leaveIssues]
  const blockers  = allIssues.filter(i => i.severity === 'ERROR')
  const warnings  = allIssues.filter(i => i.severity === 'WARNING')

  const managerErrors  = issues.filter(i => i.sheet === 'Managers' && i.severity === 'ERROR').length
  const deptHeadErrors = issues.filter(i => i.sheet === 'DeptHeads' && i.severity === 'ERROR').length
  const leaveErrors    = leaveIssues.filter(i => i.severity === 'ERROR').length

  return {
    employeeCount:       rawPkg.employees.length,
    validEmployees:      employeePreview.validRows,
    errorEmployees:      employeePreview.errorRows,
    managerLinksTotal:   rawPkg.managers.length,
    managerLinksValid:   managerLinks.length,
    managerLinksErrors:  managerErrors,
    deptHeadLinksTotal:  rawPkg.deptHeads.length,
    deptHeadLinksValid:  deptHeadLinks.length,
    deptHeadLinksErrors: deptHeadErrors,
    leaveBalancesTotal:  rawPkg.leaveBalances.length,
    leaveBalancesValid:  leaveBalances.length,
    leaveBalancesErrors: leaveErrors,
    withinBatchManagers: result.withinBatchManagerCount,
    cyclesDetected:      result.cycleCount,
    blockers,
    warnings,
    canExecute:          result.canExecute,
  }
}
