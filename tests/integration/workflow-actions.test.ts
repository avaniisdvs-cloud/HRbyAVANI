import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * S9-01..S9-04 — Integration tests for the new workflow + delegation
 * Server Actions added in Sprint 9.
 *
 * Pinning the riskiest invariants:
 *   • createWorkflowTemplate — role gate, BR-WF-001 valid approver role,
 *     BR-WF-002 contiguous stage_order 1..N, audit row in same tx
 *   • actOnWorkflowStep DELEGATE — input validation (UUID, not-self, exists,
 *     same-entity), audit eventType WORKFLOW.STEP_DELEGATED, no stage advance
 *   • createApprovalDelegation — self-delegate blocked, cross-entity blocked
 *   • deactivateApprovalDelegation — owner-only (or admin override),
 *     soft-flip is_active (Hard Rule 2 — never delete)
 */

// ── Shared queue + spies ───────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex   = 0

const insertSpy   = vi.fn()
const valuesSpy   = vi.fn()
const updateSpy   = vi.fn()
const setSpy      = vi.fn()
const deleteSpy   = vi.fn()
const auditSpy    = vi.fn()
const invalidateSpy = vi.fn()

function makeProxy(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_: Record<string, unknown>, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(queryQueue[callIndex++] ?? []).then(resolve, reject)
      }
      return () => makeProxy()
    },
  })
}

function makeInsertChain(returnRows: unknown[]) {
  return {
    values: vi.fn((payload: unknown) => {
      valuesSpy(payload)
      const finalize = () => Promise.resolve(returnRows)
      // Some inserts call .returning(...), others await values directly.
      const ret = Object.assign(finalize(), {
        returning: vi.fn(() => Promise.resolve(returnRows)),
      })
      return ret
    }),
  }
}

function makeUpdateChain() {
  return {
    set: vi.fn((payload: unknown) => {
      setSpy(payload)
      return { where: vi.fn(() => Promise.resolve()) }
    }),
  }
}

function makeDeleteChain() {
  return { where: vi.fn(() => { deleteSpy('called'); return Promise.resolve() }) }
}

function buildTxMock(insertReturn: unknown[]) {
  return {
    select: vi.fn(() => makeProxy()),
    insert: vi.fn(() => { insertSpy('called'); return makeInsertChain(insertReturn) }),
    update: vi.fn(() => { updateSpy('called'); return makeUpdateChain() }),
    delete: vi.fn(() => makeDeleteChain()),
    execute: vi.fn(() => Promise.resolve()),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select: vi.fn(() => makeProxy()),
  insert: vi.fn(() => makeInsertChain([])),
  update: vi.fn(() => makeUpdateChain()),
  delete: vi.fn(() => makeDeleteChain()),
  transaction: vi.fn(),
}

const session = {
  user: {
    id:            '00000000-0000-0000-0000-000000000c33',
    personId:      '00000000-0000-0000-0000-000000000c33',
    name:          'HR Director',
    role:          'HR_DIRECTOR',
    legalEntityId: '00000000-0000-0000-0000-0000000000a1',
  },
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown, tx?: unknown) => {
    auditSpy(event, tx)
    return Promise.resolve()
  }),
  diffFields: () => [],
}))
vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn((roles: string[]) => {
    if (!roles.includes(session.user.role)) {
      throw new Error(`FORBIDDEN: requires one of ${roles.join(', ')}`)
    }
    return Promise.resolve(session.user)
  }),
  getCurrentUser: vi.fn(() => Promise.resolve(session.user)),
}))
vi.mock('@/lib/config-resolver', () => ({
  resolveWorkflowTemplate: vi.fn(),
  invalidateConfigCache:   vi.fn(() => { invalidateSpy() }),
}))
vi.mock('@/drizzle/schema', () => ({
  customFieldDefinitions: {},
  notificationTemplates:  {},
  policySettings:         {},
  workflowDefinitions:    { id: {}, tenantId: {}, workflowCode: {} },
  workflowStages:         { id: {}, workflowDefinitionId: {} },
  workflowInstances:      { id: {}, tenantId: {}, status: {}, currentStageId: {}, currentStageOrder: {} },
  approvalDelegations:    { id: {}, tenantId: {}, delegatorId: {}, delegateId: {}, isActive: {} },
  // S9-03: DELEGATE path joins userAccounts to validate the delegatee's role
  userAccounts:           { personId: {}, tenantId: {}, avaniisRole: {}, primaryEntityId: {} },
  leaveRuleSets:          {},
  leaveRuleLines:         {},
  events:                 {},
  formConfigurations:     {},
  persons:                { id: {}, tenantId: {}, legalEntityId: {}, isActive: {} },
  notificationLog:        {},
}))
vi.mock('drizzle-orm', () => ({
  eq:      () => ({}),
  and:     (...a: unknown[]) => a,
  inArray: () => ({}),
  count:   () => ({}),
  lt:      () => ({}),
  lte:     () => ({}),   // DELEGATE date-range: delegationFrom <= today
  gte:     () => ({}),   // DELEGATE date-range: delegationTo   >= today
  isNull:  () => ({}),
  or:      (...a: unknown[]) => a,
}))

const {
  createWorkflowTemplate,
  actOnWorkflowStep,
  createApprovalDelegation,
  deactivateApprovalDelegation,
} = await import('@/modules/config/actions')

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  queryQueue = []
  callIndex  = 0
  vi.clearAllMocks()
  insertSpy.mockClear()
  valuesSpy.mockClear()
  updateSpy.mockClear()
  setSpy.mockClear()
  auditSpy.mockClear()
  invalidateSpy.mockClear()
  session.user.role = 'HR_DIRECTOR'
  session.user.id = '00000000-0000-0000-0000-000000000c33'
  session.user.personId = '00000000-0000-0000-0000-000000000c33'
  mockDb.select.mockImplementation(() => makeProxy())
  mockDb.insert.mockImplementation(() => makeInsertChain([]))
  mockDb.update.mockImplementation(() => makeUpdateChain())
  mockDb.delete.mockImplementation(() => makeDeleteChain())
})

const validTemplate = () => ({
  legalEntityId:   '00000000-0000-0000-0000-0000000000a1',
  workflowCode:    'WF-TEST-A',
  workflowNameEn:  'Test workflow',
  workflowNameAr:  'سير عمل اختباري',
  triggerEvent:    'LEAVE_REQUEST' as const,
  approvalMode:    'SEQUENTIAL' as const,
  slaHours:        48,
  escalationHours: 72,
  isActive:        true,
  stages: [
    { stageOrder: 1, stageNameEn: 'Manager review', stageNameAr: 'مراجعة المدير',
      approverRoleCode: 'LINE_MANAGER', stageSlaHours: 24, escalationRoleCode: 'HOD',
      canDelegate: true, isOptional: false, actionType: 'APPROVE_REJECT' as const },
    { stageOrder: 2, stageNameEn: 'HR check',       stageNameAr: 'مراجعة HR',
      approverRoleCode: 'HR_DIRECTOR', stageSlaHours: 48, escalationRoleCode: 'CEO',
      canDelegate: true, isOptional: false, actionType: 'APPROVE_REJECT' as const },
  ],
})

// ═══════════════════════════════════════════════════════════════════════════════
// createWorkflowTemplate
// ═══════════════════════════════════════════════════════════════════════════════

describe('createWorkflowTemplate — auth gate (BR-WF-003)', () => {
  it('throws FORBIDDEN for HR_ADMIN', async () => {
    session.user.role = 'HR_ADMIN'
    await expect(createWorkflowTemplate(validTemplate())).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('throws FORBIDDEN for MANAGER', async () => {
    session.user.role = 'MANAGER'
    await expect(createWorkflowTemplate(validTemplate())).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('allows HR_DIRECTOR (happy path)', async () => {
    const tx = buildTxMock([{ id: 'wf-template-1' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
    const result = await createWorkflowTemplate(validTemplate())
    expect(result.id).toBe('wf-template-1')
    expect(insertSpy).toHaveBeenCalled()
    expect(auditSpy).toHaveBeenCalled()
    const event = auditSpy.mock.calls[0][0] as { eventType: string; resourceType: string }
    expect(event.eventType).toBe('WORKFLOW_TEMPLATE.CREATED')
    expect(event.resourceType).toBe('workflow_definitions')
    expect(invalidateSpy).toHaveBeenCalled()
  })
})

describe('createWorkflowTemplate — stage validation', () => {
  it('rejects non-contiguous stage_order (BR-WF-002)', async () => {
    const bad = { ...validTemplate() }
    bad.stages = [
      { ...bad.stages[0], stageOrder: 1 },
      { ...bad.stages[1], stageOrder: 3 }, // skips 2
    ]
    await expect(createWorkflowTemplate(bad)).rejects.toThrow(/stage order is not valid/i)
  })

  it('rejects an invalid approver_role_code (BR-WF-001)', async () => {
    const bad = { ...validTemplate() }
    bad.stages = [
      { ...bad.stages[0], approverRoleCode: 'BOGUS_ROLE' },
      bad.stages[1],
    ]
    await expect(createWorkflowTemplate(bad)).rejects.toThrow(/approver role is not recognised/i)
  })

  it('rejects an escalation role that does NOT outrank the approver', async () => {
    const bad = { ...validTemplate() }
    bad.stages = [
      // HR_DIRECTOR escalating to LINE_MANAGER — escalation must outrank.
      { ...bad.stages[0], approverRoleCode: 'HR_DIRECTOR', escalationRoleCode: 'LINE_MANAGER' },
      bad.stages[1],
    ]
    await expect(createWorkflowTemplate(bad)).rejects.toThrow(/compliance rule|escalation role/i)
  })

  it('Zod rejects > 10 stages (BR-WF-002 max)', async () => {
    const bad = {
      ...validTemplate(),
      stages: Array.from({ length: 11 }, (_, i) => ({
        stageOrder: i + 1,
        stageNameEn: `S${i + 1}`,
        stageNameAr: `م${i + 1}`,
        approverRoleCode: 'LINE_MANAGER',
        stageSlaHours: 24,
        escalationRoleCode: null as string | null,
        canDelegate: true,
        isOptional: false,
        actionType: 'APPROVE_REJECT' as const,
      })),
    }
    await expect(createWorkflowTemplate(bad)).rejects.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// actOnWorkflowStep — DELEGATE
// ═══════════════════════════════════════════════════════════════════════════════

const inFlightInstance = (overrides: Record<string, unknown> = {}) => [{
  id:                       'wf-instance-1',
  tenantId:                 '00000000-0000-0000-0000-000000000001',
  workflowDefinitionId:     'wf-def-1',
  legalEntityId:            '00000000-0000-0000-0000-0000000000a1',
  resourceType:             'absence_entries',
  resourceId:               'le-1',
  initiatedByPersonId:      '00000000-0000-0000-0000-0000000000aa',
  status:                   'IN_PROGRESS',
  currentStageId:           'stage-2',
  currentStageOrder:        2,
  currentDelegateePersonId: null,
  approvalChainJson:        { stages: [], events: [] },
  ...overrides,
}]
const stageRow = (overrides: Record<string, unknown> = {}) => [{
  id: 'stage-2', approverRoleCode: 'HR_DIRECTOR', ...overrides,
}]

describe('actOnWorkflowStep — DELEGATE input validation (S9-03)', () => {
  it('throws when delegateToPersonId is missing', async () => {
    queryQueue = [inFlightInstance(), stageRow()]
    await expect(actOnWorkflowStep('wf-instance-1', 'DELEGATE', 'note')).rejects.toThrow(/cannot delegate an approval to yourself/i)
  })

  it('throws when delegating to self', async () => {
    queryQueue = [inFlightInstance(), stageRow()]
    await expect(
      actOnWorkflowStep('wf-instance-1', 'DELEGATE', 'note', session.user.id),
    ).rejects.toThrow(/cannot delegate an approval to yourself/i)
  })

  it('throws when delegateToPersonId is not a UUID', async () => {
    queryQueue = [inFlightInstance(), stageRow()]
    await expect(
      actOnWorkflowStep('wf-instance-1', 'DELEGATE', 'note', 'not-a-uuid'),
    ).rejects.toThrow(/delegate person is not valid/i)
  })

  it('throws NOT_FOUND when target person does not exist', async () => {
    queryQueue = [
      inFlightInstance(),
      stageRow(),
      [], // persons select returns empty (target not found)
    ]
    await expect(
      actOnWorkflowStep('wf-instance-1', 'DELEGATE', 'note', '11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow(/could not be found/i)
  })

  it('throws when delegate is in a different legal entity', async () => {
    queryQueue = [
      inFlightInstance(),
      stageRow(),
      [{ id: '11111111-1111-1111-1111-111111111111', legalEntityId: 'other-entity', isActive: true }],
    ]
    await expect(
      actOnWorkflowStep('wf-instance-1', 'DELEGATE', 'note', '11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow(/cannot cross company boundaries/i)
  })

  it('happy path: writes WORKFLOW.STEP_DELEGATED audit + sets currentDelegateePersonId', async () => {
    const targetId = '11111111-1111-1111-1111-111111111111'
    queryQueue = [
      inFlightInstance(),
      stageRow(),
      [{ id: targetId, legalEntityId: '00000000-0000-0000-0000-0000000000a1', isActive: true }],
    ]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await actOnWorkflowStep('wf-instance-1', 'DELEGATE', 'going on leave', targetId)
    expect(result.status).toBe('IN_PROGRESS') // not advanced

    // Update sets currentDelegateePersonId — does NOT mark APPROVED/REJECTED
    const update = setSpy.mock.calls[0][0] as {
      currentDelegateePersonId: string;
      status?: string;
      approvalChainJson?: unknown
    }
    expect(update.currentDelegateePersonId).toBe(targetId)
    expect(update.status).toBeUndefined() // status not changed by DELEGATE
    expect(update.approvalChainJson).toBeDefined()

    // Audit row inside same tx, correct event type
    expect(auditSpy).toHaveBeenCalled()
    const [audit, txArg] = auditSpy.mock.calls[0]
    const event = audit as {
      eventType: string;
      resourceType: string;
      resourceId: string;
      newValues: { delegateToPersonId: string; action: string }
    }
    expect(event.eventType).toBe('WORKFLOW.STEP_DELEGATED')
    expect(event.resourceType).toBe('workflow_instances')
    expect(event.resourceId).toBe('wf-instance-1')
    expect(event.newValues.action).toBe('DELEGATE')
    expect(event.newValues.delegateToPersonId).toBe(targetId)
    expect(txArg).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// createApprovalDelegation
// ═══════════════════════════════════════════════════════════════════════════════

const validDelegation = () => ({
  delegateId:     '00000000-0000-0000-0000-000000000bbb',
  delegationFrom: '2026-05-05',
  delegationTo:   '2026-05-12',
  scopeTypes:     [],
  reason:         'Annual leave',
})

describe('createApprovalDelegation (S9-04)', () => {
  it('throws when delegating to self', async () => {
    const input = validDelegation()
    input.delegateId = session.user.personId!
    await expect(createApprovalDelegation(input)).rejects.toThrow(/cannot delegate an approval to yourself/i)
  })

  it('throws when delegate is not an active person', async () => {
    queryQueue = [[]] // persons lookup returns empty
    await expect(createApprovalDelegation(validDelegation())).rejects.toThrow(/could not be found/i)
  })

  it('throws when delegate is in a different legal entity (non SUPER_ADMIN)', async () => {
    queryQueue = [[{
      id: '00000000-0000-0000-0000-000000000bbb',
      legalEntityId: 'other-entity',
      isActive: true,
    }]]
    await expect(createApprovalDelegation(validDelegation())).rejects.toThrow(/cannot cross company boundaries/i)
  })

  it('Zod rejects delegationTo before delegationFrom', async () => {
    const bad = { ...validDelegation(), delegationFrom: '2026-05-12', delegationTo: '2026-05-05' }
    await expect(createApprovalDelegation(bad)).rejects.toThrow()
  })

  it('happy path: writes APPROVAL_DELEGATION.CREATED audit row', async () => {
    queryQueue = [[{
      id: '00000000-0000-0000-0000-000000000bbb',
      legalEntityId: '00000000-0000-0000-0000-0000000000a1',
      isActive: true,
    }]]
    const tx = buildTxMock([{ id: 'del-1' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createApprovalDelegation(validDelegation())
    expect(result.id).toBe('del-1')

    expect(auditSpy).toHaveBeenCalled()
    const event = auditSpy.mock.calls[0][0] as { eventType: string }
    expect(event.eventType).toBe('APPROVAL_DELEGATION.CREATED')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// deactivateApprovalDelegation
// ═══════════════════════════════════════════════════════════════════════════════

describe('deactivateApprovalDelegation (S9-04 / Hard Rule 2)', () => {
  it('throws when caller is not the delegator and not an admin', async () => {
    queryQueue = [[{
      id: 'del-1',
      delegatorId:   '00000000-0000-0000-0000-000000000ccc', // someone else
      delegateId:    '00000000-0000-0000-0000-000000000ddd',
      legalEntityId: '00000000-0000-0000-0000-0000000000a1',
      isActive:      true,
    }]]
    session.user.role = 'MANAGER' // not admin, not delegator
    await expect(deactivateApprovalDelegation('del-1')).rejects.toThrow(/Only the person who created|can deactivate/i)
  })

  it('allows the delegator to deactivate', async () => {
    queryQueue = [[{
      id: 'del-1',
      delegatorId:   session.user.personId,
      delegateId:    '00000000-0000-0000-0000-000000000ddd',
      legalEntityId: '00000000-0000-0000-0000-0000000000a1',
      isActive:      true,
    }]]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await deactivateApprovalDelegation('del-1')
    expect(result.success).toBe(true)

    // Hard Rule 2: never delete; soft-flip is_active=false
    const update = setSpy.mock.calls[0][0] as { isActive: boolean }
    expect(update.isActive).toBe(false)

    // Audit row inside same tx
    const event = auditSpy.mock.calls[0][0] as { eventType: string }
    expect(event.eventType).toBe('APPROVAL_DELEGATION.DEACTIVATED')
  })

  it('is idempotent on already-deactivated rows', async () => {
    queryQueue = [[{
      id: 'del-1',
      delegatorId:   session.user.personId,
      delegateId:    '00000000-0000-0000-0000-000000000ddd',
      legalEntityId: '00000000-0000-0000-0000-0000000000a1',
      isActive:      false, // already deactivated
    }]]
    const result = await deactivateApprovalDelegation('del-1')
    expect(result.success).toBe(true)
    // No update / audit because nothing to do
    expect(setSpy).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('HR_ADMIN can deactivate someone else\'s delegation (admin override)', async () => {
    queryQueue = [[{
      id: 'del-1',
      delegatorId:   '00000000-0000-0000-0000-000000000ccc',
      delegateId:    '00000000-0000-0000-0000-000000000ddd',
      legalEntityId: '00000000-0000-0000-0000-0000000000a1',
      isActive:      true,
    }]]
    session.user.role = 'HR_ADMIN'
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await deactivateApprovalDelegation('del-1')
    expect(result.success).toBe(true)
    expect(setSpy).toHaveBeenCalled()
  })
})
