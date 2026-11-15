// @vitest-environment node
/**
 * requestTransfer — creates the transfer_requests row AND starts the approval
 * workflow (fixes the create-without-trigger gap). RBAC-gated; returns {error}
 * not throws.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCurrentUser = vi.fn()
const isManagerDirectReport = vi.fn()
const triggerTransferApproval = vi.fn()
const triggerPromotionApproval = vi.fn()
const writeAuditLog = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/auth', () => ({ getCurrentUser }))
vi.mock('@/lib/audit', () => ({ writeAuditLog }))
vi.mock('@/lib/constants', () => ({ TENANT_ID: 'tenant-1' }))
vi.mock('@/modules/core-hr/manager-scope', () => ({ isManagerDirectReport }))
vi.mock('@/modules/workflow', () => ({ triggerTransferApproval, triggerPromotionApproval }))
vi.mock('@/drizzle/schema', () => ({
  persons:          { tenantId: 'tenantId', id: 'id' },
  transferRequests: { id: 'id' },
}))

let personRow: Record<string, unknown> | undefined
const insertSpy = vi.fn(() => ({ values: () => ({ returning: async () => [{ id: 'req-1' }] }) }))
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (personRow ? [personRow] : []) }) }) }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ insert: insertSpy }),
  },
}))

const PERSON = {
  id: 'per-1', personNumber: 'AVN-001', fullNameEn: 'Ahmed Ali',
  legalEntityId: 'ent-1', lineManagerId: 'mgr-1', currentPositionId: 'pos-1',
}

describe('requestTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    personRow = PERSON
    getCurrentUser.mockResolvedValue({ id: 'u-1', name: 'HR Admin', role: 'HR_ADMIN', personId: 'hr-1', legalEntityId: 'ent-1' })
    triggerTransferApproval.mockResolvedValue({ instanceId: 'wf-1', approverName: 'Mgr', hrAdminFound: true })
  })

  it('HR_ADMIN: creates request + triggers approval workflow', async () => {
    const { requestTransfer } = await import('@/modules/core-hr/employment-actions/transfer-request')
    const res = await requestTransfer({ personId: 'per-1', requestType: 'TRANSFER', targetDepartmentId: 'dep-2', effectiveDate: '2026-07-01', reason: 'ORG_NEED' })
    expect(res).toMatchObject({ success: true, requestId: 'req-1', instanceId: 'wf-1' })
    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(triggerTransferApproval).toHaveBeenCalledTimes(1)
    expect(triggerTransferApproval.mock.calls[0][0]).toMatchObject({ personId: 'per-1', toDepartmentId: 'dep-2', transferRequestId: 'req-1' })
    expect(triggerTransferApproval.mock.calls[0][0]).not.toHaveProperty('lineManagerId')
    expect(writeAuditLog).toHaveBeenCalledTimes(1)
  })

  it('rejects an unauthorized role', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u-2', name: 'Emp', role: 'EMPLOYEE', personId: 'e-1', legalEntityId: 'ent-1' })
    const { requestTransfer } = await import('@/modules/core-hr/employment-actions/transfer-request')
    const res = await requestTransfer({ personId: 'per-1', requestType: 'TRANSFER', targetDepartmentId: 'dep-2', effectiveDate: '2026-07-01', reason: 'ORG_NEED' })
    expect(res.success).toBe(false)
    expect(triggerTransferApproval).not.toHaveBeenCalled()
  })

  it('MANAGER blocked for a non-direct-report', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u-3', name: 'Mgr', role: 'MANAGER', personId: 'mgr-9', legalEntityId: 'ent-1' })
    isManagerDirectReport.mockResolvedValue(false)
    const { requestTransfer } = await import('@/modules/core-hr/employment-actions/transfer-request')
    const res = await requestTransfer({ personId: 'per-1', requestType: 'TRANSFER', targetDepartmentId: 'dep-2', effectiveDate: '2026-07-01', reason: 'ORG_NEED' })
    expect(res.success).toBe(false)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('returns error when employee not found', async () => {
    personRow = undefined
    const { requestTransfer } = await import('@/modules/core-hr/employment-actions/transfer-request')
    const res = await requestTransfer({ personId: 'missing', requestType: 'TRANSFER', targetDepartmentId: 'dep-2', effectiveDate: '2026-07-01', reason: 'ORG_NEED' })
    expect(res).toMatchObject({ success: false })
    expect(res.error).toMatch(/not found/i)
  })
})
