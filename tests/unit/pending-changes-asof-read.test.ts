import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const source = () => readFileSync(join(ROOT, 'app/(hr-admin)/pending-changes/actions.ts'), 'utf8')

function helperSource(): string {
  const src = source()
  return src.slice(
    src.indexOf('function isPendingEffectiveDatedRow'),
    src.indexOf('// ══════════════════════════════════════════════════════════════════════════════'),
  )
}

describe('Phase 2B-4 pending changes as-of read migration', () => {
  it('adds a read-only helper for pending effective-dated rows', () => {
    const helper = helperSource()
    expect(helper).toContain('function isPendingEffectiveDatedRow')
    expect(helper).toContain('effectiveStartDate: string')
    expect(helper).toContain('effectiveEndDate?: string | null')
    expect(helper).toContain('today: string')
    expect(helper).toContain('isCurrent?: boolean')
    expect(helper).toContain('if (input.isCurrent === false) return false')
    expect(helper).toContain('input.effectiveStartDate > input.today')
    expect(helper).toContain('effectiveEndDate >= input.effectiveStartDate')
  })

  it('does not export a sync helper from the server-action module', () => {
    const src = source()
    expect(src).not.toContain('export function isPendingEffectiveDatedRow')
  })

  it('uses sentinel end date as the default open-ended value', () => {
    const helper = helperSource()
    expect(helper).toContain('input.effectiveEndDate ?? EFFECTIVE_END_OF_TIME')
  })

  it('lists pending worker assignment FUTURE_DATED rows without requiring is_current', () => {
    const src = source()
    const assignmentSection = src.slice(
      src.indexOf('// ── 1. Worker Assignments'),
      src.indexOf('// ── 2. Leave Plan Enrolments'),
    )
    expect(assignmentSection).toContain("eq(workerAssignments.actionMode, 'FUTURE_DATED')")
    expect(assignmentSection).toContain("ne(workerAssignments.assignmentStatus, 'INACTIVE')")
    expect(assignmentSection).toContain('gt(workerAssignments.effectiveStartDate, today)')
    expect(assignmentSection).not.toContain('eq(workerAssignments.isCurrent, true)')
    expect(assignmentSection).toContain('isPendingEffectiveDatedRow({ effectiveStartDate: row.effectiveStartDate, effectiveEndDate: row.effectiveEndDate, today })')
    expect(assignmentSection).not.toContain('isCurrent: row.isCurrent')
  })

  it('keeps leave, schedule, and payroll pending filters unchanged', () => {
    const src = source()
    expect(src).toContain('eq(leavePlanEnrolments.isCurrent, true)')
    expect(src).toContain('eq(workScheduleAssignments.isCurrent, true)')
    expect(src).toContain('eq(payrollAssignments.isCurrent, true)')
  })

  it('validates effective end dates for Phase 1 pending reads', () => {
    const src = source()
    expect(src.match(/effectiveEndDate:/g)?.length).toBeGreaterThanOrEqual(5)
    expect(src.match(/isPendingEffectiveDatedRow\(\{/g)?.length).toBe(5)
  })

  it('supports Annual and Sick leave plan rows independently by not collapsing plan reads', () => {
    const src = source()
    expect(src).toContain('leavePlanEnrolments.absencePlanId')
    expect(src).toContain('absencePlans.planNameEn')
    expect(src).toContain('Leave plan enrolment — ${row.planNameEn ?? \'plan\'}')
  })

  it('keeps salary pending reads independent of is_current', () => {
    const src = source()
    const salarySection = src.slice(
      src.indexOf('// ── 5. Salary Elements'),
      src.indexOf('// ── 6. Contracts'),
    )
    expect(salarySection).not.toContain('salaryElements.isCurrent')
    expect(salarySection).toContain('gte(salaryElements.effectiveEndDate, salaryElements.effectiveStartDate)')
    expect(salarySection).toContain('isPendingEffectiveDatedRow({ effectiveStartDate: row.effectiveStartDate, effectiveEndDate: row.effectiveEndDate, today })')
  })

  it('leaves contract pending logic deferred and unchanged', () => {
    const src = source()
    const contractSection = src.slice(
      src.indexOf('// ── 6. Contracts'),
      src.indexOf('// Sort all results ascending by effectiveDate'),
    )
    expect(contractSection).toContain("eq(contracts.status, 'ACTIVE')")
    expect(contractSection).toContain('gt(contracts.startDate, today)')
    expect(contractSection).not.toContain('isPendingEffectiveDatedRow')
  })

  it('cancels assignment future rows before reopening the predecessor timeline', () => {
    const src = source()
    const writeSection = src.slice(src.indexOf('export async function cancelFutureDatedChange'))
    const assignmentSection = writeSection.slice(
      writeSection.indexOf("case 'ASSIGNMENT':"),
      writeSection.indexOf("case 'LEAVE_PLAN':"),
    )
    const inactiveIndex = assignmentSection.indexOf("assignmentStatus: 'INACTIVE'")
    const repairIndex = assignmentSection.indexOf('effectiveEndDate: repairedEndDate')
    expect(inactiveIndex).toBeGreaterThan(-1)
    expect(repairIndex).toBeGreaterThan(-1)
    expect(inactiveIndex).toBeLessThan(repairIndex)
    expect(assignmentSection).toContain('.update(persons)')
    expect(assignmentSection).toContain('currentDepartmentId: predecessor.departmentId')
    expect(writeSection).toContain('salaryElements has no isCurrent')
    expect(writeSection).toContain('const yesterday = addDays(today, -1)')
    expect(writeSection).not.toContain('getAsOfRow')
  })
})
