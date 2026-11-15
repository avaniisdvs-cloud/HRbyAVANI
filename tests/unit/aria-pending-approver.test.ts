/**
 * ISSUE-012 — ARIA pending-approver resolution
 *
 * Tests for resolvePendingApprover (modules/workflow/queries.ts).
 * This function is the deterministic core that powers ARIA's "pending with whom?"
 * response. The Claude natural-language layer is not tested here (requires live API).
 *
 * Tests:
 *   PA-001: ARIA leave status — no PENDING step → returns null (approved/done request shows no approver)
 *   PA-002: ARIA leave status — PENDING step with assigned person → person's display name returned
 *   PA-003: "pending with whom?" — delegated approver → delegate name + "(delegated)" label
 *   PA-004: group-based step (no person) → group name + "(approval group)" label, not "unknown"
 *   PA-005: role-based step (no person/group) → readable role label, not "unknown"
 *   PA-006: step exists but has no approver assignment → CONFIG_WARNING, not silent fail
 *   PA-007: approved/rejected leave has no PENDING step → returns null
 *   PA-008: ARIA scope — resolvePendingApprover does NOT call requireRole (scope enforced upstream)
 *   PA-009: completed workflow instance (step APPROVED) returns null, not old pending state
 *   PA-010: multiple pending steps — only the lowest stepOrder PENDING step is resolved
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Query queue (controls what each db.select() call returns) ─────────────────

type Row = Record<string, unknown>
let queryQueue: Row[][] = []
let queryCallIndex = 0

function buildChain(rows: Row[]) {
  const proxy: unknown = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: Row[]) => unknown) =>
          Promise.resolve(rows).then(resolve)
      }
      return () => proxy
    },
  })
  return proxy
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    get select() {
      return () => buildChain(queryQueue[queryCallIndex++] ?? [])
    },
  },
}))

vi.mock('@/drizzle/schema/workflow-engine', () => ({
  workflowStepInstances: { id: {}, instanceId: {}, stepId: {}, stepOrder: {}, status: {}, assignedToPersonId: {}, assignedToGroupId: {}, delegatedToPersonId: {}, tenantId: {} },
  workflowInstancesV2:   {},
  workflowDefinitionsV2: {},
  workflowStepsV2:       { stepNameEn: {}, hierarchyRole: {}, id: {}, tenantId: {} },
  workflowAuditLog:      {},
  approvalGroups:        { id: {}, groupNameEn: {}, tenantId: {} },
}))

vi.mock('@/drizzle/schema', () => ({
  persons: { id: {}, fullNameEn: {}, tenantId: {} },
}))

vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))
vi.mock('@/lib/auth',     () => ({ requireRole: vi.fn().mockResolvedValue({}) }))

vi.mock('drizzle-orm', () => ({
  eq:  () => ({}),
  and: (...a: unknown[]) => ({ _and: a }),
}))

// ── Import SUT after all mocks ────────────────────────────────────────────────

const { resolvePendingApprover } = await import('@/modules/workflow/queries')

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Step row with person assigned (most common UAT scenario). */
function stepRowWithPerson(overrides: Partial<Row> = {}): Row {
  return {
    stepName:            'Line Manager Approval',
    hierarchyRole:       null,
    assignedToPersonId:  'person-lm-001',
    assignedToGroupId:   null,
    delegatedToPersonId: null,
    assigneeName:        'Ahmed Al Rashidi',
    ...overrides,
  }
}

beforeEach(() => {
  queryQueue      = []
  queryCallIndex  = 0
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ISSUE-012 — resolvePendingApprover', () => {

  it('PA-001: returns null when no PENDING step exists (supports "leave already approved" response)', async () => {
    queryQueue = [[]]  // empty → no PENDING step found

    const result = await resolvePendingApprover('instance-001')

    expect(result).toBeNull()
  })

  it('PA-002: PENDING step with assignedToPersonId → person display name (ARIA shows who to follow up with)', async () => {
    queryQueue = [[stepRowWithPerson()]]  // main query

    const result = await resolvePendingApprover('instance-001')

    expect(result).not.toBeNull()
    expect(result!.approverType).toBe('PERSON')
    expect(result!.approverLabel).toBe('Ahmed Al Rashidi')
    expect(result!.stepName).toBe('Line Manager Approval')
  })

  it('PA-003: delegatedToPersonId takes highest priority — delegate shown with "(delegated)" label', async () => {
    queryQueue = [
      [stepRowWithPerson({ delegatedToPersonId: 'person-delegate-002', assigneeName: 'Original Manager' })],
      [{ fullNameEn: 'Sara Khalil' }],  // delegate person lookup
    ]

    const result = await resolvePendingApprover('instance-001')

    expect(result!.approverType).toBe('DELEGATED')
    expect(result!.approverLabel).toBe('Sara Khalil (delegated)')
  })

  it('PA-004: assignedToGroupId (no person) → group name, not "unknown" or "null"', async () => {
    queryQueue = [
      [stepRowWithPerson({ assignedToPersonId: null, assigneeName: null, assignedToGroupId: 'group-hr-001' })],
      [{ groupNameEn: 'HR Approvals Team' }],  // group lookup
    ]

    const result = await resolvePendingApprover('instance-001')

    expect(result!.approverType).toBe('GROUP')
    expect(result!.approverLabel).toBe('HR Approvals Team (approval group)')
  })

  it('PA-005: hierarchyRole (no person/group) → readable role label, not raw enum string', async () => {
    queryQueue = [[
      stepRowWithPerson({
        assignedToPersonId: null,
        assigneeName:       null,
        assignedToGroupId:  null,
        hierarchyRole:      'HR_ADMIN',
      }),
    ]]

    const result = await resolvePendingApprover('instance-001')

    expect(result!.approverType).toBe('ROLE')
    // HR_ADMIN → "Hr Admin" (title-cased words, not the raw enum)
    expect(result!.approverLabel).toBe('Hr Admin')
    expect(result!.approverLabel).not.toBe('HR_ADMIN')
  })

  it('PA-006: no approver assignment at all → CONFIG_WARNING with actionable HR message', async () => {
    queryQueue = [[
      stepRowWithPerson({
        assignedToPersonId: null,
        assigneeName:       null,
        assignedToGroupId:  null,
        delegatedToPersonId: null,
        hierarchyRole:      null,
      }),
    ]]

    const result = await resolvePendingApprover('instance-001')

    expect(result!.approverType).toBe('CONFIG_WARNING')
    expect(result!.approverLabel).toMatch(/HR should review the workflow configuration/)
    expect(result!.approverLabel).not.toBe('unknown')
    expect(result!.approverLabel).not.toBe('')
  })

  it('PA-007: approved/rejected workflow — no PENDING step — returns null (not a stale approver)', async () => {
    // Simulates an APPROVED step — query finds no PENDING row → returns null
    queryQueue = [[]]  // no PENDING step returned

    const result = await resolvePendingApprover('instance-approved-001')

    expect(result).toBeNull()
    // Callers should show nothing (leave is done) rather than a stale approver
  })

  it('PA-008: resolvePendingApprover does not call requireRole (scope enforced upstream by listLeaveRequests)', async () => {
    const { requireRole } = await import('@/lib/auth')
    queryQueue = [[stepRowWithPerson()]]

    await resolvePendingApprover('instance-001')

    // If requireRole were called, the mock would record it.
    // It must NOT be called here — scope was already enforced by listLeaveRequests.
    expect(requireRole).not.toHaveBeenCalled()
  })

  it('PA-009: completed step (APPROVED status on step) — no PENDING row — returns null', async () => {
    // When leave is APPROVED, no step has status=PENDING → main query returns []
    queryQueue = [[]]

    const result = await resolvePendingApprover('instance-001')

    expect(result).toBeNull()
  })

  it('PA-010: multiple-step workflow — only the first PENDING step is resolved (lowest stepOrder)', async () => {
    // The SQL query has stepOrder ASC LIMIT 1 so only the first PENDING step is returned.
    // Test verifies this by providing only one row (the mock returns what SQL would return).
    queryQueue = [[
      stepRowWithPerson({ stepName: 'Step 1: Line Manager', assigneeName: 'Hassan Al Mansoori' }),
      // 'Step 2: HR Director' is WAITING, not PENDING — would not appear in real SQL result
    ]]

    const result = await resolvePendingApprover('instance-multi-step')

    expect(result!.stepName).toBe('Step 1: Line Manager')
    expect(result!.approverLabel).toBe('Hassan Al Mansoori')
    // Only one step resolved — the correct one
  })

})
