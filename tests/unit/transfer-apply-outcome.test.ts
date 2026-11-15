// @vitest-environment node
/**
 * applyTransferOutcome — workflow apply-back for approved Transfer/Promotion.
 *
 * Locks the contract: REJECTED no-ops; APPROVED applies the assignment change via
 * the tx-aware changeAssignmentTx primitive, records an employment_action, syncs
 * persons.*, and writes audit — atomically on the engine's transaction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const writeAuditLog = vi.fn().mockResolvedValue(undefined)
const changeAssignmentTx = vi.fn()

vi.mock('@/lib/audit', () => ({ writeAuditLog }))
vi.mock('@/lib/constants', () => ({ TENANT_ID: 'tenant-1' }))
vi.mock('@/lib/effective-date', () => ({
  isFutureDated: (effectiveDate: string) => effectiveDate > '2026-06-10',
  yearsOfService: () => 5,
}))
vi.mock('@/modules/core-hr/contracts/services', () => ({ deriveNoticePeriodDays: () => 90 }))
vi.mock('@/modules/core-hr/worker-assignments/services', () => ({ changeAssignmentTx }))
vi.mock('@/drizzle/schema', () => ({
  employmentActions: { id: 'id' },
  persons:           { tenantId: 'tenantId', id: 'id' },
  transferRequests:  { tenantId: 'tenantId', id: 'id' },
}))

// ── Chainable tx mock ───────────────────────────────────────────────────────
function makeTx(rows: unknown[][]) {
  let i = 0
  const selectChain = () => {
    const c: Record<string, unknown> = {}
    c.from = () => c
    c.where = () => c
    c.limit = async () => rows[i++] ?? []
    return c
  }
  return {
    select: vi.fn(() => selectChain()),
    insert: vi.fn(() => ({ values: () => ({ returning: async () => [{ id: 'action-1' }] }) })),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
  }
}

const REQUEST = {
  id: 'req-1', tenantId: 'tenant-1', personId: 'per-1',
  currentPositionId: 'pos-1', targetPositionId: 'pos-2', targetDepartmentId: 'dep-2',
  requestType: 'TRANSFER', effectiveDate: '2026-05-01', reason: 'ORG_NEED', notes: null,
  requestedById: 'per-99',
}
const PERSON = {
  id: 'per-1', legalEntityId: 'ent-1', hireDate: '2020-01-01',
  currentDepartmentId: 'dep-1', currentPositionId: 'pos-1',
}
const CURRENT_ASSIGNMENT = {
  id: 'asg-1', departmentId: 'dep-1', positionId: 'pos-1', gradeId: 'gr-1',
  locationId: 'loc-1', lineManagerId: 'mgr-1', employmentType: 'FULL_TIME', assignmentStatus: 'ACTIVE',
}

describe('applyTransferOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    changeAssignmentTx.mockImplementation(async (_tx, _actor, data) => {
      if (data.mode === 'FUTURE_DATED') {
        return { mode: 'FUTURE_DATED', futureId: 'asg-future', futureAssignmentNumber: 'WA-3', current: CURRENT_ASSIGNMENT }
      }
      return { mode: 'UPDATE', closedId: 'asg-1', newId: 'asg-2', newAssignmentNumber: 'WA-2', current: CURRENT_ASSIGNMENT }
    })
  })

  it('REJECTED → no-op (no assignment change, no audit)', async () => {
    const { applyTransferOutcome } = await import('@/modules/core-hr/employment-actions/workflow-actions')
    const tx = makeTx([])
    await applyTransferOutcome({ requestId: 'req-1', finalStatus: 'REJECTED', actorPersonId: 'per-9', actorDisplayName: 'Approver', legalEntityId: 'ent-1', tx: tx as never })
    expect(changeAssignmentTx).not.toHaveBeenCalled()
    expect(writeAuditLog).not.toHaveBeenCalled()
    expect(tx.select).not.toHaveBeenCalled()
  })

  it('APPROVED TRANSFER → applies dept change via changeAssignmentTx + audits', async () => {
    const { applyTransferOutcome } = await import('@/modules/core-hr/employment-actions/workflow-actions')
    const tx = makeTx([[REQUEST], [PERSON]])
    await applyTransferOutcome({ requestId: 'req-1', finalStatus: 'APPROVED', actorPersonId: 'per-9', actorDisplayName: 'Approver', legalEntityId: 'ent-1', tx: tx as never })

    expect(changeAssignmentTx).toHaveBeenCalledTimes(1)
    const [, actor, data] = changeAssignmentTx.mock.calls[0]
    expect(actor).toMatchObject({ personId: 'per-9' })
    expect(data).toMatchObject({ personId: 'per-1', actionType: 'TRANSFER', departmentId: 'dep-2', positionId: 'pos-2', mode: 'UPDATE' })
    expect(tx.insert).toHaveBeenCalledTimes(1)   // employment_actions row
    expect(tx.update).toHaveBeenCalledTimes(1)   // persons pointer sync
    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    expect(writeAuditLog.mock.calls[0][0].eventType).toBe('EMPLOYMENT_ACTION.TRANSFER')
    expect(writeAuditLog.mock.calls[0][0].metadata).toMatchObject({ transferRequestId: 'req-1', appliedViaWorkflow: true })
  })

  it('APPROVED future-dated TRANSFER → creates pending assignment and skips persons pointer sync', async () => {
    const { applyTransferOutcome } = await import('@/modules/core-hr/employment-actions/workflow-actions')
    const futureRequest = { ...REQUEST, effectiveDate: '2026-07-15' }
    const tx = makeTx([[futureRequest], [PERSON]])
    await applyTransferOutcome({ requestId: 'req-1', finalStatus: 'APPROVED', actorPersonId: 'per-9', actorDisplayName: 'Approver', legalEntityId: 'ent-1', tx: tx as never })

    expect(changeAssignmentTx).toHaveBeenCalledTimes(1)
    expect(changeAssignmentTx.mock.calls[0][2]).toMatchObject({
      personId: 'per-1',
      actionType: 'TRANSFER',
      departmentId: 'dep-2',
      positionId: 'pos-2',
      mode: 'FUTURE_DATED',
    })
    expect(tx.insert).toHaveBeenCalledTimes(1)
    expect(tx.update).not.toHaveBeenCalled()
    expect(writeAuditLog.mock.calls[0][0].metadata).toMatchObject({
      transferRequestId: 'req-1',
      assignmentMode: 'FUTURE_DATED',
      personPointersUpdated: false,
      appliedViaWorkflow: true,
    })
  })

  it('APPROVED PROMOTION → actionType PROMOTION', async () => {
    const { applyTransferOutcome } = await import('@/modules/core-hr/employment-actions/workflow-actions')
    const tx = makeTx([[{ ...REQUEST, requestType: 'PROMOTION' }], [PERSON]])
    await applyTransferOutcome({ requestId: 'req-1', finalStatus: 'APPROVED', actorPersonId: 'per-9', actorDisplayName: 'Approver', legalEntityId: 'ent-1', tx: tx as never })
    expect(changeAssignmentTx.mock.calls[0][2]).toMatchObject({ actionType: 'PROMOTION' })
    expect(writeAuditLog.mock.calls[0][0].eventType).toBe('EMPLOYMENT_ACTION.PROMOTION')
  })

  it('throws if request not found', async () => {
    const { applyTransferOutcome } = await import('@/modules/core-hr/employment-actions/workflow-actions')
    const tx = makeTx([[]])  // empty request result
    await expect(applyTransferOutcome({ requestId: 'missing', finalStatus: 'APPROVED', actorPersonId: 'per-9', actorDisplayName: 'A', legalEntityId: 'ent-1', tx: tx as never }))
      .rejects.toThrow(/Transfer request not found/)
  })
})
