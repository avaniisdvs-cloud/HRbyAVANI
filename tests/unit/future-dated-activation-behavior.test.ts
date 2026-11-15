import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const selectQueue: unknown[][] = []
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = []
  const events: string[] = []

  function tableName(table: unknown): string {
    return String((table as { __name?: string }).__name ?? 'unknown')
  }

  function makeSelectChain() {
    const terminal = {
      orderBy: vi.fn(() => Promise.resolve(selectQueue.shift() ?? [])),
      limit: vi.fn(() => Promise.resolve(selectQueue.shift() ?? [])),
    }
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => terminal),
      })),
    }
  }

  function makeUpdateChain(table: unknown) {
    return {
      set: vi.fn((payload: Record<string, unknown>) => ({
        where: vi.fn(() => {
          updates.push({ table: tableName(table), payload })
          return Promise.resolve()
        }),
      })),
    }
  }

  const tx = {
    select: vi.fn(() => makeSelectChain()),
    update: vi.fn((table: unknown) => makeUpdateChain(table)),
    execute: vi.fn(() => Promise.resolve()),
  }

  const db = {
    select: vi.fn(() => makeSelectChain()),
    update: vi.fn((table: unknown) => makeUpdateChain(table)),
    transaction: vi.fn(async (fn: (innerTx: typeof tx) => Promise<unknown>) => fn(tx)),
  }

  return {
    selectQueue,
    updates,
    events,
    tx,
    db,
    lockWorkerAssignmentTimelineTx: vi.fn(async () => { events.push('lock') }),
    recomputeCurrentWorkerAssignmentPointerTx: vi.fn(async () => {
      events.push('recompute')
      return { currentAssignmentId: 'future-assignment-id' }
    }),
    writeAuditLog: vi.fn(async () => { events.push('audit') }),
    diffFields: vi.fn((before: Record<string, unknown>, after: Record<string, unknown>) =>
      Object.keys(after).filter(key => before[key] !== after[key]),
    ),
    evaluateManagerRole: vi.fn(async (personId: string) => { events.push(`manager:${personId}`) }),
  }
})

vi.mock('@/lib/db', () => ({ db: h.db }))
vi.mock('@/lib/constants', () => ({ TENANT_ID: 'tenant-1' }))
vi.mock('@/lib/effective-date', () => ({ todayUae: () => '2026-07-15' }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: h.writeAuditLog, diffFields: h.diffFields }))
vi.mock('@/lib/evaluate-manager-role', () => ({ evaluateManagerRole: h.evaluateManagerRole }))
vi.mock('@/modules/core-hr/worker-assignments/services', () => ({
  lockWorkerAssignmentTimelineTx: h.lockWorkerAssignmentTimelineTx,
  recomputeCurrentWorkerAssignmentPointerTx: h.recomputeCurrentWorkerAssignmentPointerTx,
}))
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }))
vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (column: unknown) => ({ op: 'asc', column }),
  eq: (...args: unknown[]) => ({ op: 'eq', args }),
  gte: (...args: unknown[]) => ({ op: 'gte', args }),
  lte: (...args: unknown[]) => ({ op: 'lte', args }),
  ne: (...args: unknown[]) => ({ op: 'ne', args }),
}))
vi.mock('@/drizzle/schema', () => {
  const persons = {
    __name: 'persons',
    tenantId: 'persons.tenantId',
    id: 'persons.id',
    legalEntityId: 'persons.legalEntityId',
    currentDepartmentId: 'persons.currentDepartmentId',
    currentPositionId: 'persons.currentPositionId',
    currentJobId: 'persons.currentJobId',
    currentLocationId: 'persons.currentLocationId',
    currentGradeId: 'persons.currentGradeId',
    lineManagerId: 'persons.lineManagerId',
    dottedLineManagerId: 'persons.dottedLineManagerId',
    employmentType: 'persons.employmentType',
    contractedHoursPerWeek: 'persons.contractedHoursPerWeek',
    assignmentStatus: 'persons.assignmentStatus',
  }
  const positions = {
    __name: 'positions',
    tenantId: 'positions.tenantId',
    id: 'positions.id',
    occupiedByPersonId: 'positions.occupiedByPersonId',
  }
  const workerAssignments = {
    __name: 'workerAssignments',
    id: 'workerAssignments.id',
    tenantId: 'workerAssignments.tenantId',
    personId: 'workerAssignments.personId',
    legalEntityId: 'workerAssignments.legalEntityId',
    assignmentNumber: 'workerAssignments.assignmentNumber',
    effectiveStartDate: 'workerAssignments.effectiveStartDate',
    effectiveEndDate: 'workerAssignments.effectiveEndDate',
    assignmentStatus: 'workerAssignments.assignmentStatus',
    departmentId: 'workerAssignments.departmentId',
    positionId: 'workerAssignments.positionId',
    jobId: 'workerAssignments.jobId',
    locationId: 'workerAssignments.locationId',
    gradeId: 'workerAssignments.gradeId',
    lineManagerId: 'workerAssignments.lineManagerId',
    dottedLineManagerId: 'workerAssignments.dottedLineManagerId',
    employmentType: 'workerAssignments.employmentType',
    contractedHoursPerWeek: 'workerAssignments.contractedHoursPerWeek',
    isCurrent: 'workerAssignments.isCurrent',
  }
  return { persons, positions, workerAssignments }
})

const { runFutureDatedActivation } = await import('@/lib/jobs/future-dated-activation')

describe('ED-ACTIVATION-01 behavioral activation job', () => {
  beforeEach(() => {
    h.selectQueue.length = 0
    h.updates.length = 0
    h.events.length = 0
    vi.clearAllMocks()
  })

  it('activates a matured future assignment and syncs materialized Core HR pointers in one transaction', async () => {
    h.selectQueue.push(
      [{ id: 'future-assignment-id', personId: 'person-1', legalEntityId: 'entity-1', effectiveStartDate: '2026-07-15' }],
      [{ id: 'future-assignment-id' }],
      [{ id: 'future-assignment-id' }],
      [{ id: 'future-assignment-id' }],
      [{
        id: 'future-assignment-id',
        personId: 'person-1',
        legalEntityId: 'entity-1',
        assignmentNumber: 'WA-FUTURE',
        effectiveStartDate: '2026-07-15',
        effectiveEndDate: '9999-12-31',
        assignmentStatus: 'ACTIVE',
        departmentId: 'dept-new',
        positionId: 'pos-new',
        jobId: 'job-new',
        locationId: 'loc-new',
        gradeId: 'grade-new',
        lineManagerId: 'manager-new',
        dottedLineManagerId: 'dotted-new',
        employmentType: 'FULL_TIME',
        contractedHoursPerWeek: '48.00',
      }],
      [{
        legalEntityId: 'entity-1',
        currentDepartmentId: 'dept-old',
        currentPositionId: 'pos-old',
        currentJobId: 'job-old',
        currentLocationId: 'loc-old',
        currentGradeId: 'grade-old',
        lineManagerId: 'manager-old',
        dottedLineManagerId: null,
        employmentType: 'FULL_TIME',
        contractedHoursPerWeek: '48.00',
        assignmentStatus: 'ACTIVE',
      }],
    )

    const result = await runFutureDatedActivation(new Date('2026-07-15T00:10:00.000Z'))

    expect(result).toMatchObject({
      activationDate: '2026-07-15',
      candidatesFound: 1,
      personsFound: 1,
      activated: 1,
      errors: [],
    })
    expect(result.activatedAssignments).toEqual([
      {
        personId: 'person-1',
        assignmentId: 'future-assignment-id',
        assignmentNumber: 'WA-FUTURE',
        effectiveStartDate: '2026-07-15',
      },
    ])
    expect(h.db.transaction).toHaveBeenCalledTimes(1)
    expect(h.lockWorkerAssignmentTimelineTx).toHaveBeenCalledWith(h.tx, 'person-1')
    expect(h.recomputeCurrentWorkerAssignmentPointerTx).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({ id: '00000000-0000-0000-0000-000000000000', name: 'system: future-dated-activation' }),
      'person-1',
    )

    const personUpdate = h.updates.find(update => update.table === 'persons')?.payload
    expect(personUpdate).toMatchObject({
      currentDepartmentId: 'dept-new',
      currentPositionId: 'pos-new',
      currentJobId: 'job-new',
      currentLocationId: 'loc-new',
      currentGradeId: 'grade-new',
      lineManagerId: 'manager-new',
      dottedLineManagerId: 'dotted-new',
      assignmentStatus: 'ACTIVE',
    })

    const positionUpdates = h.updates.filter(update => update.table === 'positions')
    expect(positionUpdates).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ isOccupied: false, occupiedByPersonId: null }) }),
      expect.objectContaining({ payload: expect.objectContaining({ isOccupied: true, occupiedByPersonId: 'person-1' }) }),
    ])
    expect(h.evaluateManagerRole).toHaveBeenCalledWith('manager-old', expect.any(Object), h.tx)
    expect(h.evaluateManagerRole).toHaveBeenCalledWith('manager-new', expect.any(Object), h.tx)
    expect(h.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'WORKER_ASSIGNMENT.FUTURE_DATED_ACTIVATED',
        resourceId: 'future-assignment-id',
        metadata: expect.objectContaining({
          currentPointerRecomputed: true,
          personPointersSynced: true,
          positionOccupancySynced: true,
          invariantValidation: 'passed',
        }),
      }),
      h.tx,
    )
    expect(h.events.indexOf('lock')).toBeLessThan(h.events.indexOf('recompute'))
    expect(h.events.indexOf('recompute')).toBeLessThan(h.events.indexOf('audit'))
  })

  it('is idempotent when no matured future rows are due', async () => {
    h.selectQueue.push([])

    const result = await runFutureDatedActivation()

    expect(result).toMatchObject({ candidatesFound: 0, personsFound: 0, activated: 0, errors: [] })
    expect(h.db.transaction).not.toHaveBeenCalled()
    expect(h.writeAuditLog).not.toHaveBeenCalled()
  })
})
