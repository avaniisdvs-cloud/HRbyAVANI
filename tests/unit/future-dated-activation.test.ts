import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const jobSource = () => readFileSync(join(ROOT, 'lib/jobs/future-dated-activation.ts'), 'utf8')
const routeSource = () => readFileSync(join(ROOT, 'app/api/cron/future-dated-activation/route.ts'), 'utf8')
const driverSource = () => readFileSync(join(ROOT, 'lib/jobs/process-driver.ts'), 'utf8')
const vercelConfig = () => readFileSync(join(ROOT, 'vercel.json'), 'utf8')

function activatePersonBlock(): string {
  const src = jobSource()
  return src.slice(
    src.indexOf('async function activatePersonTx'),
    src.indexOf('export async function runFutureDatedActivation'),
  )
}

describe('ED-ACTIVATION-01 future-dated assignment activation', () => {
  it('selects due non-current effective rows and is idempotent after activation', () => {
    const src = jobSource()

    expect(src).toContain('eq(workerAssignments.isCurrent, false)')
    expect(src).toContain("ne(workerAssignments.assignmentStatus, 'INACTIVE')")
    expect(src).toContain('lte(workerAssignments.effectiveStartDate, activationDate)')
    expect(src).toContain('gte(workerAssignments.effectiveEndDate, activationDate)')
    expect(src).toContain("skippedReason: 'already-current-or-no-due-row'")
  })

  it('serialises each person timeline and reuses the certified recompute helper', () => {
    const block = activatePersonBlock()

    expect(jobSource()).toContain('lockWorkerAssignmentTimelineTx')
    expect(jobSource()).toContain('recomputeCurrentWorkerAssignmentPointerTx')
    expect(block.indexOf('await lockWorkerAssignmentTimelineTx(tx, personId)'))
      .toBeLessThan(block.indexOf('await recomputeCurrentWorkerAssignmentPointerTx(tx, actor, personId)'))
  })

  it('validates effective-dating invariants before materialised pointer sync is trusted', () => {
    const block = activatePersonBlock()

    expect(jobSource()).toContain('async function validateActivationInvariantsTx')
    expect(jobSource()).toContain('ED_ACTIVATION_INVARIANT_EFFECTIVE_ROW_COUNT')
    expect(jobSource()).toContain('ED_ACTIVATION_INVARIANT_CURRENT_ROW_COUNT')
    expect(jobSource()).toContain('ED_ACTIVATION_INVARIANT_POINTER_MISMATCH')
    expect(block.indexOf('await validateActivationInvariantsTx(tx, personId, currentAssignmentId, activationDate)'))
      .toBeLessThan(block.indexOf('await syncPersonPointersTx(tx, actor, personId, assignment)'))
  })

  it('syncs denormalised person pointers and position occupancy from the activated row', () => {
    const src = jobSource()

    expect(src).toContain('async function syncPersonPointersTx')
    expect(src).toContain('currentDepartmentId:    assignment.departmentId')
    expect(src).toContain('currentPositionId:      assignment.positionId')
    expect(src).toContain('currentJobId:           assignment.jobId')
    expect(src).toContain('currentLocationId:      assignment.locationId')
    expect(src).toContain('currentGradeId:         assignment.gradeId')
    expect(src).toContain('lineManagerId:          assignment.lineManagerId')
    expect(src).toContain('dottedLineManagerId:    assignment.dottedLineManagerId')
    expect(src).toContain('employmentType:         assignment.employmentType')
    expect(src).toContain('contractedHoursPerWeek: assignment.contractedHoursPerWeek')
    expect(src).toContain('assignmentStatus:       assignment.assignmentStatus')
    expect(src).toContain('async function syncPositionOccupancyTx')
    expect(src).toContain('occupiedByPersonId: occupiesPosition ? personId : null')
  })

  it('reevaluates manager roles and writes one activation audit row in the same transaction', () => {
    const block = activatePersonBlock()

    expect(jobSource()).toContain('evaluateManagerRole')
    expect(block).toContain('await evaluateManagerRole(beforePerson.lineManagerId, actor, tx)')
    expect(block).toContain('await evaluateManagerRole(assignment.lineManagerId, actor, tx)')
    expect(block).toContain("eventType:     'WORKER_ASSIGNMENT.FUTURE_DATED_ACTIVATED'")
    expect(block).toContain("channel:       'BATCH'")
    expect(block).toContain("invariantValidation: 'passed'")
  })

  it('is wired into both process-driver cron and Vercel cron', () => {
    const route = routeSource()
    const driver = driverSource()
    const vercel = vercelConfig()

    expect(route).toContain('runFutureDatedActivation')
    expect(route).toContain('Authorization')
    expect(route).toContain('CRON_SECRET')
    expect(driver).toContain('startFutureDatedActivationCron')
    expect(driver).toContain("'future-dated-activation'")
    expect(vercel).toContain('/api/cron/future-dated-activation')
    expect(vercel).toContain('"schedule": "5 20 * * *"')
  })
})
