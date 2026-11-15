import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type AssignmentRow = {
  id: string
  status: 'ACTIVE' | 'INACTIVE'
  start: string
  end: string
  isCurrent: boolean
}

const ROOT = process.cwd()
const source = () => readFileSync(join(ROOT, 'app/(hr-admin)/pending-changes/actions.ts'), 'utf8')

function cancelFunctionSource(): string {
  const src = source()
  return src.slice(
    src.indexOf('export async function cancelFutureDatedChange'),
    src.indexOf('// ── Helpers'),
  )
}

function assignmentBranchSource(): string {
  const src = cancelFunctionSource()
  return src.slice(
    src.indexOf("case 'ASSIGNMENT':"),
    src.indexOf("case 'LEAVE_PLAN':"),
  )
}

function executableAssignmentBranch(): string {
  return assignmentBranchSource()
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n')
}

function rangesOverlap(a: AssignmentRow, b: AssignmentRow): boolean {
  return a.start <= b.end && b.start <= a.end
}

function duplicateCurrent(rows: AssignmentRow[]): number {
  return rows.filter(row => row.isCurrent).length > 1 ? 1 : 0
}

function activeOverlaps(rows: AssignmentRow[]): number {
  const active = rows.filter(row => row.status !== 'INACTIVE')
  return active.some((row, i) => active.slice(i + 1).some(other => rangesOverlap(row, other))) ? 1 : 0
}

describe('Phase 2C-2 worker assignment future-dated cancellation repair', () => {
  it('loads only the selected active FUTURE_DATED assignment before cancelling', () => {
    const branch = assignmentBranchSource()
    expect(branch).toContain('let [futureAssignment] = await tx')
    expect(branch).toContain('lockWorkerAssignmentTimelineTx(tx, futureAssignment.personId)')
    expect(branch).toContain('const [lockedFutureAssignment] = await tx')
    expect(branch).toContain('eq(workerAssignments.id, parsed.id)')
    expect(branch).toContain('eq(workerAssignments.tenantId, TENANT_ID)')
    expect(branch).toContain("eq(workerAssignments.actionMode, 'FUTURE_DATED')")
    expect(branch).toContain("ne(workerAssignments.assignmentStatus, 'INACTIVE')")
    expect(branch).toContain('gt(workerAssignments.effectiveStartDate, today)')
  })

  it('finds the predecessor closed to futureStart - 1 and fails before cancellation when missing', () => {
    const branch = assignmentBranchSource()
    expect(branch).toContain('const predecessorClosedDate = addDays(futureAssignment.effectiveStartDate, -1)')
    expect(branch).toContain('eq(workerAssignments.effectiveEndDate, predecessorClosedDate)')
    expect(branch).toContain('TIMELINE_REPAIR_FAILED: predecessor assignment not found; future assignment was not cancelled.')
    expect(branch.indexOf('if (!predecessor)')).toBeLessThan(branch.indexOf("assignmentStatus: 'INACTIVE'"))
  })

  it('repairs predecessor to the next later future start - 1 or sentinel when no later future exists', () => {
    const branch = assignmentBranchSource()
    expect(branch).toContain('const [nextFuture] = await tx')
    expect(branch).toContain('gt(workerAssignments.effectiveStartDate, futureAssignment.effectiveStartDate)')
    expect(branch).toContain('const repairedEndDate = nextFuture')
    expect(branch).toContain('addDays(nextFuture.effectiveStartDate, -1)')
    expect(branch).toContain('EFFECTIVE_END_OF_TIME')
    expect(branch).toContain('effectiveEndDate: repairedEndDate')
  })

  it('marks the future row inactive before reopening the predecessor range', () => {
    const branch = assignmentBranchSource()
    const futureInactive = branch.indexOf("assignmentStatus: 'INACTIVE'")
    const predecessorRepair = branch.indexOf('effectiveEndDate: repairedEndDate')
    expect(futureInactive).toBeGreaterThan(-1)
    expect(predecessorRepair).toBeGreaterThan(-1)
    expect(futureInactive).toBeLessThan(predecessorRepair)
  })

  it('keeps predecessor materialised current, cancelled future inactive, and person pointers restored', () => {
    const branch = assignmentBranchSource()
    expect(branch).toContain('isCurrent:        true')
    expect(branch).toContain("assignmentStatus: 'INACTIVE'")
    expect(branch).toContain('recomputeCurrentWorkerAssignmentPointerTx(tx')
    expect(branch).toContain('.update(persons)')
    expect(branch).toContain('currentDepartmentId: predecessor.departmentId')
    expect(branch).toContain('currentPositionId:   predecessor.positionId')
    expect(branch).toContain('currentGradeId:      predecessor.gradeId')
    expect(branch).toContain('lineManagerId:       predecessor.lineManagerId')
  })

  it('audits cancellation and timeline repair details in the existing transaction', () => {
    const fn = cancelFunctionSource()
    const branch = assignmentBranchSource()
    expect(fn).toContain('let auditMetadata: Record<string, unknown>')
    expect(branch).toContain('cancelledFutureAssignmentId: futureAssignment.id')
    expect(branch).toContain('futureEffectiveStartDate:    futureAssignment.effectiveStartDate')
    expect(branch).toContain('futureEffectiveEndDate:      futureAssignment.effectiveEndDate')
    expect(branch).toContain('predecessorAssignmentId:     predecessor.id')
    expect(branch).toContain('predecessorOldEffectiveEndDate: predecessor.effectiveEndDate')
    expect(branch).toContain('predecessorNewEffectiveEndDate: repairedEndDate')
    expect(branch).toContain('nextFutureAssignmentId:      nextFuture?.id ?? null')
    expect(branch).toContain('timelineRepairApplied:       true')
    expect(branch).toContain('compatibilityIsCurrentPreserved: true')
    expect(branch).toContain('futureMarkedInactiveBeforePredecessorRepair: true')
    expect(branch).toContain('personPointersRestored:      true')
    expect(branch).toContain('currentPointerRecomputed:    true')
    expect(branch).toContain('recomputedCurrentAssignmentId: currentPointer.currentAssignmentId')
    expect(fn).toContain('metadata:     auditMetadata')
  })

  it('models cancellation after future-bounded retro split without duplicate-current or active overlap', () => {
    const afterSplit: AssignmentRow[] = [
      { id: 'A', status: 'ACTIVE', start: '2024-01-01', end: '2026-06-30', isCurrent: false },
      { id: 'R', status: 'ACTIVE', start: '2026-07-01', end: '2026-09-14', isCurrent: true },
      { id: 'F', status: 'ACTIVE', start: '2026-09-15', end: '9999-12-31', isCurrent: false },
    ]
    const afterCancel: AssignmentRow[] = [
      { id: 'A', status: 'ACTIVE', start: '2024-01-01', end: '2026-06-30', isCurrent: false },
      { id: 'R', status: 'ACTIVE', start: '2026-07-01', end: '9999-12-31', isCurrent: true },
      { id: 'F', status: 'INACTIVE', start: '2026-09-15', end: '9999-12-31', isCurrent: false },
    ]

    expect(afterSplit.filter(row => row.id === 'F')).toEqual([expect.objectContaining({ status: 'ACTIVE', isCurrent: false })])
    expect(afterCancel.filter(row => row.id === 'R')).toEqual([expect.objectContaining({ end: '9999-12-31', isCurrent: true })])
    expect(afterCancel.filter(row => row.id === 'F')).toEqual([expect.objectContaining({ status: 'INACTIVE', isCurrent: false })])
    expect(duplicateCurrent(afterCancel)).toBe(0)
    expect(activeOverlaps(afterCancel)).toBe(0)
  })

  it('does not add materialisation, cron, broad consumer migration, deletion, or non-assignment repairs', () => {
    const branch = executableAssignmentBranch()
    expect(branch).not.toMatch(/cron|materiali[sz]ation|delete|org-chart|reports|payrollAssignments|leavePlanEnrolments|workScheduleAssignments/i)
  })
})
