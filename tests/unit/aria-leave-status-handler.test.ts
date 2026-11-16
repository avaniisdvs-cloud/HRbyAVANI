/**
 * ISSUE-012 — ARIA leave-status handler integration tests
 *
 * Tests for handleLeaveRequestStatus via handleIntent().
 * Proves the full data path: listLeaveRequests → resolvePendingApprover → rawData → Claude prompt.
 * The Claude SDK is mocked; assertions inspect what rawData was sent to Claude.
 *
 * Tests:
 *   ALS-001: PENDING leave row → formatting prompt includes pending_approver and pending_step
 *   ALS-002: APPROVED leave row → formatting prompt has NO pending_approver field
 *   ALS-003: REJECTED leave row → formatting prompt has NO pending_approver field
 *   ALS-004: CONFIG_WARNING approver → formatting prompt contains the warning message text
 *   ALS-005: Multiple pending rows → formatting prompt includes approver for each
 *   ALS-006: resolvePendingApprover throws → handler does not crash, returns valid AriaResponse
 *   ALS-007: handleLeaveRequestStatus passes ctx.personId to listLeaveRequests (scope not elevated)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/company-branding', () => ({ getCompanyBranding: async () => ({ companyName: 'AVANIIS', companyNameAr: 'أفانيس', logoUrl: null }) }))

import type { AriaIntentResult, AriaSessionContext } from '@/modules/aria/types'

// ── Mock factories (must be at top level — vitest hoists vi.mock calls) ───────

const mockListLeaveRequests   = vi.fn()
const mockResolvePendingApprover = vi.fn()
const mockMessagesCreate      = vi.fn()

vi.mock('@/modules/absence', () => ({
  listLeaveRequests: mockListLeaveRequests,
}))

vi.mock('@/modules/workflow', () => ({
  resolvePendingApprover: mockResolvePendingApprover,
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}))

vi.mock('@/lib/aria/system-prompt', () => ({
  ARIA_SYSTEM_PROMPT: 'test-system-prompt',
}))

// Provider layer reads provider/model/key from config — mock it so the
// formatting call routes through the mocked Anthropic SDK (provider 'anthropic')
// without touching the real DB.
vi.mock('@/lib/aria/config-loader', () => ({
  loadAriaRuntimeConfig: vi.fn().mockResolvedValue({
    provider: 'anthropic', modelId: 'claude-sonnet-4-6', apiKey: 'test-key', apiEndpoint: null,
  }),
}))

// ── Test helpers ──────────────────────────────────────────────────────────────

const LEAVE_STATUS_INTENT: AriaIntentResult = {
  intent:     'LEAVE_REQUEST_STATUS',
  language:   'en',
  confidence: 0.95,
  entities:   {},
}

const EMPLOYEE_CTX: AriaSessionContext = {
  personId:      'person-emp-001',
  role:          'EMPLOYEE',
  legalEntityId: 'entity-001',
  language:      'en',
}

const MANAGER_CTX: AriaSessionContext = {
  personId:      'person-mgr-001',
  role:          'MANAGER',
  legalEntityId: 'entity-001',
  language:      'en',
}

function makeLeaveRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id:                 'leave-001',
    requestNumber:      'LR-2026-0001',
    personId:           'person-emp-001',
    absenceTypeCode:    'ANNUAL',
    startDate:          '2026-06-01',
    endDate:            '2026-06-10',
    durationDays:       10,
    status:             'PENDING',
    workflowInstanceId: 'instance-001',
    createdDate:        '2026-05-15',
    ...overrides,
  }
}

function makeLeaveResult(rows: Record<string, unknown>[]) {
  return { rows, total: rows.length, page: 1, pageSize: 5, totalPages: 1 }
}

/** Returns the full content of the last user message sent to Claude's messages.create. */
function capturedFormattingPrompt(): string {
  expect(mockMessagesCreate).toHaveBeenCalled()
  const callParams = mockMessagesCreate.mock.calls[0][0] as {
    messages: Array<{ role: string; content: string }>
  }
  const userMessages = callParams.messages.filter(m => m.role === 'user')
  return userMessages[userMessages.length - 1].content
}

/**
 * Returns only the Data section of the formatting prompt (the rawData lines).
 * Assertions that check whether specific data fields are present/absent use
 * this to avoid matching on the formatting instruction text in the Rules section,
 * which itself mentions field names like "pending_approver" as documentation.
 */
function capturedDataSection(): string {
  const full = capturedFormattingPrompt()
  // The formatting prompt ends with "\nData:\n<rawData>".
  // Split on "\nData:\n" and take the part after it.
  return full.split('\nData:\n')[1] ?? ''
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ARIA_API_KEY = 'test-key-mocked'
  // Default Claude mock response — tests that need specific behaviour override this
  mockMessagesCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'Formatted leave status' }],
  })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ISSUE-012 — ARIA leave-status handler integration', () => {

  it('ALS-001: PENDING leave row → data section includes pending_approver and pending_step', async () => {
    mockListLeaveRequests.mockResolvedValueOnce(makeLeaveResult([makeLeaveRow()]))
    mockResolvePendingApprover.mockResolvedValueOnce({
      approverType:  'PERSON',
      approverLabel: 'Ahmed Al Rashidi',
      stepName:      'Line Manager Approval',
    })

    const { handleIntent } = await import('@/modules/aria/services')
    const response = await handleIntent(LEAVE_STATUS_INTENT, 'My leave request status', [], EMPLOYEE_CTX, null)

    const data = capturedDataSection()
    expect(data).toContain('pending_approver="Ahmed Al Rashidi"')
    expect(data).toContain('pending_step="Line Manager Approval"')
    expect(response.intentCode).toBe('LEAVE_REQUEST_STATUS')
    expect(response.dataSource).toBe('absence_entries')
  })

  it('ALS-002: APPROVED leave row → data section has NO pending_approver field', async () => {
    mockListLeaveRequests.mockResolvedValueOnce(
      makeLeaveResult([makeLeaveRow({ status: 'APPROVED', workflowInstanceId: null })]),
    )

    const { handleIntent } = await import('@/modules/aria/services')
    await handleIntent(LEAVE_STATUS_INTENT, 'My leave request status', [], EMPLOYEE_CTX, null)

    const data = capturedDataSection()
    expect(data).not.toContain('pending_approver=')
    expect(data).not.toContain('pending_step=')
    expect(data).toContain('status=APPROVED')
    // Resolver must NOT have been called for non-PENDING rows
    expect(mockResolvePendingApprover).not.toHaveBeenCalled()
  })

  it('ALS-003: REJECTED leave row → data section has NO pending_approver field', async () => {
    mockListLeaveRequests.mockResolvedValueOnce(
      makeLeaveResult([makeLeaveRow({ status: 'REJECTED', workflowInstanceId: null })]),
    )

    const { handleIntent } = await import('@/modules/aria/services')
    await handleIntent(LEAVE_STATUS_INTENT, 'My leave request status', [], EMPLOYEE_CTX, null)

    const data = capturedDataSection()
    expect(data).not.toContain('pending_approver=')
    expect(data).toContain('status=REJECTED')
    expect(mockResolvePendingApprover).not.toHaveBeenCalled()
  })

  it('ALS-004: CONFIG_WARNING approver → data section contains the actionable HR warning label', async () => {
    // approverType='CONFIG_WARNING' is NOT written to rawData — only approverLabel is.
    // The label text is what Claude sees and should communicate to the user.
    mockListLeaveRequests.mockResolvedValueOnce(makeLeaveResult([makeLeaveRow()]))
    mockResolvePendingApprover.mockResolvedValueOnce({
      approverType:  'CONFIG_WARNING',
      approverLabel: 'Approver not configured — HR should review the workflow configuration',
      stepName:      'Pending Step',
    })

    const { handleIntent } = await import('@/modules/aria/services')
    await handleIntent(LEAVE_STATUS_INTENT, 'pending with whom?', [], EMPLOYEE_CTX, null)

    const data = capturedDataSection()
    expect(data).toContain('pending_approver="Approver not configured')
    expect(data).toContain('HR should review the workflow configuration')
  })

  it('ALS-005: multiple pending rows → formatting prompt includes approver for each', async () => {
    mockListLeaveRequests.mockResolvedValueOnce(makeLeaveResult([
      makeLeaveRow({ id: 'leave-001', workflowInstanceId: 'instance-001', startDate: '2026-06-01' }),
      makeLeaveRow({ id: 'leave-002', workflowInstanceId: 'instance-002', startDate: '2026-07-01' }),
    ]))
    // Two resolver calls — one per pending row
    mockResolvePendingApprover
      .mockResolvedValueOnce({ approverType: 'PERSON', approverLabel: 'Ahmed Al Rashidi', stepName: 'LM Approval' })
      .mockResolvedValueOnce({ approverType: 'GROUP',  approverLabel: 'HR Approvals Team (approval group)', stepName: 'HR Review' })

    const { handleIntent } = await import('@/modules/aria/services')
    await handleIntent(LEAVE_STATUS_INTENT, 'My leave request status', [], EMPLOYEE_CTX, null)

    const data = capturedDataSection()
    expect(data).toContain('pending_approver="Ahmed Al Rashidi"')
    expect(data).toContain('pending_approver="HR Approvals Team (approval group)"')
    expect(mockResolvePendingApprover).toHaveBeenCalledTimes(2)
  })

  it('ALS-006: resolvePendingApprover throws → ARIA still returns valid response, does not crash', async () => {
    mockListLeaveRequests.mockResolvedValueOnce(makeLeaveResult([makeLeaveRow()]))
    mockResolvePendingApprover.mockRejectedValueOnce(new Error('DB connection lost'))

    const { handleIntent } = await import('@/modules/aria/services')
    // Must not throw — Promise.allSettled swallows individual resolver failures
    const response = await handleIntent(LEAVE_STATUS_INTENT, 'My leave request status', [], EMPLOYEE_CTX, null)

    expect(response.intentCode).toBe('LEAVE_REQUEST_STATUS')
    expect(response.dataSource).toBe('absence_entries')
    expect(typeof response.message).toBe('string')
    expect(response.message.length).toBeGreaterThan(0)
    // rawData still includes the leave row but WITHOUT pending_approver (resolver failed)
    const data = capturedDataSection()
    expect(data).toContain('status=PENDING')
    expect(data).not.toContain('pending_approver=')
  })

  it('ALS-007: handleLeaveRequestStatus passes ctx.personId to listLeaveRequests (scope not elevated)', async () => {
    mockListLeaveRequests.mockResolvedValueOnce(makeLeaveResult([]))

    const { handleIntent } = await import('@/modules/aria/services')
    // Should return isError (no rows) → direct return before Claude call
    await handleIntent(LEAVE_STATUS_INTENT, 'My leave request status', [], MANAGER_CTX, null)

    expect(mockListLeaveRequests).toHaveBeenCalledOnce()
    const callArg = mockListLeaveRequests.mock.calls[0][0] as { personId: string }
    // Must pass the manager's own personId — not a different person's ID
    expect(callArg.personId).toBe(MANAGER_CTX.personId)
    // resolvePendingApprover must NOT be called (no rows)
    expect(mockResolvePendingApprover).not.toHaveBeenCalled()
  })

})
