import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const source = () => readFileSync(join(ROOT, 'modules/core-hr/worker-assignments/services.ts'), 'utf8')

function futureDatedBranch(): string {
  const src = source()
  return src.slice(
    src.indexOf('if (mode === \'FUTURE_DATED\')'),
    src.indexOf('// ── UPDATE MODE (default)'),
  )
}

function executableFutureDatedBranch(): string {
  return futureDatedBranch()
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n')
}

describe('Phase 2C-1 worker assignment FUTURE_DATED timeline correctness', () => {
  it('closes the predecessor date range to futureDate - 1 while preserving legacy isCurrent', () => {
    const branch = futureDatedBranch()
    expect(branch).toContain('const predecessorNewEffectiveEndDate = addDays(data.effectiveDate, -1)')
    expect(branch).toContain('.update(workerAssignments)')
    expect(branch).toContain('effectiveEndDate: predecessorNewEffectiveEndDate')
    expect(branch).toContain('isCurrent:        true')
  })

  it('inserts the future row as pending with sentinel end date and explicit FUTURE_DATED action mode', () => {
    const branch = futureDatedBranch()
    expect(branch).toContain('effectiveStartDate: data.effectiveDate')
    expect(branch).toContain('effectiveEndDate:   EFFECTIVE_END_OF_TIME')
    expect(branch).toContain('isCurrent:               false')
    expect(branch).toContain("actionMode:              'FUTURE_DATED'")
    expect(branch).toContain('effectiveSequence:       1')
  })

  it('rejects same-day or overlapping pending future rows and excludes the predecessor row', () => {
    const branch = futureDatedBranch()
    expect(branch).toContain('DUPLICATE_FUTURE_CHANGE')
    expect(branch).toContain('sql`${workerAssignments.id} <> ${current.id}`')
    expect(branch).toContain('sql`${workerAssignments.effectiveStartDate} > ${todayUae()}`')
    expect(branch).toContain('sql`${workerAssignments.effectiveEndDate} >= ${data.effectiveDate}`')
  })

  it('guards date order so Phase 1 exclusion constraints can accept the generated ranges', () => {
    const branch = futureDatedBranch()
    expect(branch).toContain('if (data.effectiveDate <= current.effectiveStartDate)')
    expect(branch).toContain('effectiveDate must be after the current row\\\'s start')
    expect(branch.indexOf('predecessorNewEffectiveEndDate')).toBeLessThan(branch.indexOf('.insert(workerAssignments)'))
  })

  it('audits predecessor close details and compatibility semantics in the same future-dated event', () => {
    const branch = futureDatedBranch()
    expect(branch).toContain("eventType:     'WORKER_ASSIGNMENT.FUTURE_DATED'")
    expect(branch).toContain('predecessorAssignmentId: current.id')
    expect(branch).toContain('predecessorOldEffectiveEndDate')
    expect(branch).toContain('predecessorNewEffectiveEndDate')
    expect(branch).toContain('futureAssignmentId:   row.id')
    expect(branch).toContain('compatibilityIsCurrentPreserved: true')
  })

  it('does not introduce materialisation, cron, cancellation repair, or cross-module consumer migration', () => {
    const branch = executableFutureDatedBranch()
    expect(branch).not.toMatch(/cron|materiali[sz]ation|cancelFutureDatedChange|org-chart|payroll|leave/i)
  })
})
