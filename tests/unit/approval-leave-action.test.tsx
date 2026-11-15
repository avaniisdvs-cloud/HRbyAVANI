import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WorkflowActionForm } from '@/app/(hr-admin)/approvals/[instanceId]/action-form'

const mocks = vi.hoisted(() => ({
  leave: vi.fn(), workflow: vi.fn(), push: vi.fn(), refresh: vi.fn(),
}))
vi.mock('@/modules/absence', () => ({ decideLeaveRequest: mocks.leave }))
vi.mock('@/modules/workflow', () => ({ takeWorkflowAction: mocks.workflow }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/components/providers/LocaleProvider', () => ({ useLocale: () => 'en' }))

const props = { stepInstanceId: 'step-1', isFyiOnly: false, canDelegate: true, resourceType: 'absence_entries', resourceId: 'leave-1' }

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.leave.mockResolvedValue({ id: 'leave-1', status: 'APPROVED' })
  mocks.workflow.mockResolvedValue({ success: true })
})

describe('approval inbox leave decisions', () => {
  it('uses the balance-finalizing domain action for leave approval', async () => {
    render(<WorkflowActionForm {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }))
    await waitFor(() => expect(mocks.leave).toHaveBeenCalledWith({ requestId: 'leave-1', action: 'APPROVE', comment: undefined }))
    expect(mocks.workflow).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith('/approvals')
  })

  it('uses the same domain action for rejection so reserved days are released', async () => {
    render(<WorkflowActionForm {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /^Reject$/ }))
    await waitFor(() => expect(mocks.leave).toHaveBeenCalledWith({ requestId: 'leave-1', action: 'REJECT', comment: undefined }))
    expect(mocks.workflow).not.toHaveBeenCalled()
  })

  it('retains the generic workflow action for other resource types', async () => {
    render(<WorkflowActionForm {...props} resourceType="probation_review" />)
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }))
    await waitFor(() => expect(mocks.workflow).toHaveBeenCalledWith(expect.objectContaining({ stepInstanceId: 'step-1', decision: 'APPROVE' })))
    expect(mocks.leave).not.toHaveBeenCalled()
  })

  it('shows domain errors without navigating away', async () => {
    mocks.leave.mockRejectedValueOnce(new Error('Request already decided'))
    render(<WorkflowActionForm {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }))
    expect(await screen.findByText('Request already decided')).toBeVisible()
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
