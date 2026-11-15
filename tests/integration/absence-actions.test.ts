import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * S5-01 / S5-05 / S5-06 — Integration tests for absence Server Actions.
 *
 * Pattern mirrors tests/integration/core-hr-actions.test.ts:
 *   • Proxy-based mock for `db` so chainable .select(...).from(...).where(...)
 *     reads from a queryQueue.
 *   • db.transaction(fn) invokes `fn(tx)` with an insert/update spy harness.
 *   • Auth/audit/encryption/initiateWorkflow mocked to identity functions
 *     so the test reasons about logic, not crypto/RPC.
 */

let queryQueue: unknown[][] = []
let callIndex   = 0

const insertSpy    = vi.fn()
const valuesSpy    = vi.fn()
const returningSpy = vi.fn()
const updateSpy    = vi.fn()
const setSpy       = vi.fn()
const whereSpy     = vi.fn()
const auditSpy     = vi.fn()
const initWfSpy         = vi.fn()
const stepWfSpy         = vi.fn()
const ruleGuardSpy      = vi.fn()
const submitWorkflowSpy = vi.fn()
const takeWfActionSpy   = vi.fn()

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
      return {
        returning: vi.fn((spec: unknown) => {
          returningSpy(spec)
          return Promise.resolve(returnRows)
        }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(returnRows).then(resolve),
      }
    }),
  }
}

function makeUpdateChain() {
  return {
    set: vi.fn((payload: unknown) => {
      setSpy(payload)
      return {
        where: vi.fn((cond: unknown) => {
          whereSpy(cond)
          return Promise.resolve()
        }),
      }
    }),
  }
}

function buildTxMock(returnRowsForInsert: unknown[]) {
  const tx = {
    select: vi.fn(() => makeProxy()),
    insert: vi.fn((table: unknown) => { insertSpy(table); return makeInsertChain(returnRowsForInsert) }),
    update: vi.fn(() => makeUpdateChain()),
    execute: vi.fn(() => Promise.resolve()),
  }
  return tx
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select:      vi.fn(() => makeProxy()),
  insert:      vi.fn(() => makeInsertChain([])),
  update:      vi.fn(() => makeUpdateChain()),
  // Relationship-based scope helpers (teamCte / resolveManagerViewablePersonIds)
  // call db.execute(); default to an empty team so a caller with no reports is
  // correctly blocked from filing/viewing for anyone but themselves.
  execute:     vi.fn(() => Promise.resolve([])),
  transaction: vi.fn(),
}

const session = {
  user: {
    id: '00000000-0000-0000-0000-0000000000c3',
    name: 'HR Admin',
    role: 'HR_ADMIN',
    legalEntityId: '00000000-0000-0000-0000-0000000000a1',
    personId: undefined as string | undefined,
  },
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown) => { auditSpy(event); return Promise.resolve() }),
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
vi.mock('@/modules/config', () => ({
  initiateWorkflow:   vi.fn((trigger: string, subjectType: string, subjectId: string,
                            entity: string, ctx: unknown) => {
    initWfSpy({ trigger, subjectType, subjectId, entity, ctx })
    return Promise.resolve({ instanceId: 'wf-instance-1' })
  }),
  actOnWorkflowStep:  vi.fn((instanceId: string, action: string, comment?: string) => {
    stepWfSpy({ instanceId, action, comment })
    // Default: terminal APPROVED on first call.
    return Promise.resolve({ status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' })
  }),
}))
// Guards moved out of the @/modules/config barrel (they pull lib/db into
// client bundles); server consumers now import from @/modules/config/guards.
vi.mock('@/modules/config/guards', () => ({
  assertLeaveRuleNotBelowMinimum: vi.fn((ruleSet: { accrualRateDays: number; uaeMinimumDaysAnnual: number }) => {
    ruleGuardSpy(ruleSet)
    const annual = ruleSet.accrualRateDays * 12
    if (annual < ruleSet.uaeMinimumDaysAnnual) {
      throw new Error(`COMPLIANCE_VIOLATION: BR-AL-001 — annual (${annual}) below ${ruleSet.uaeMinimumDaysAnnual}`)
    }
  }),
}))
vi.mock('@/drizzle/schema', () => ({
  absenceEntries:   { id: {}, tenantId: {}, personId: {}, status: {}, legalEntityId: {}, absenceTypeId: {}, startDate: {}, endDate: {}, createdDate: {} },
  absenceTypes:     { id: {}, tenantId: {}, typeCode: {} },
  absenceBalances:  { id: {}, tenantId: {}, personId: {}, absenceTypeId: {}, balanceYear: {}, carriedForwardDays: {} },
  persons:          { id: {}, tenantId: {}, legalEntityId: {} },
  legalEntities:    { id: {} },
  leaveRuleSets:    { id: {}, tenantId: {}, isActive: {}, effectiveFrom: {}, effectiveTo: {} },
  leaveRuleLines:   { id: {}, leaveRuleSetId: {}, absenceTypeCode: {}, isActive: {} },
  // FIX-S9-01: policy_settings is read by getSickLeaveCertThreshold during createLeaveRequest.
  policySettings:   { tenantId: {}, legalEntityId: {}, settingKey: {}, settingValue: {}, effectiveFrom: {}, effectiveTo: {} },
  events:           { tenantId: {}, eventType: {}, payload: {} },
  auditLog:         { tenantId: {}, eventType: {} },
  workerAssignments: { id: {}, tenantId: {}, personId: {}, positionId: {}, legalEntityId: {}, isActive: {}, lineManagerId: {}, isActing: {}, actingEndDate: {} },
}))
vi.mock('drizzle-orm', () => ({
  eq:        () => ({}),
  and:       (...a: unknown[]) => a,
  ilike:     () => ({}),
  or:        (...a: unknown[]) => a,
  asc:       () => ({}),
  desc:      () => ({}),
  count:     () => ({}),
  lte:       () => ({}),
  gte:       () => ({}),
  isNull:    () => ({}),
  sql:       Object.assign(() => ({}), { raw: () => ({}) }),
  // relations() is imported by drizzle/schema/workflow-engine.ts
  relations: (..._args: unknown[]) => ({}),
}))
// submitLeaveRequest calls submitWorkflow (v2); decideLeaveRequest calls
// takeWorkflowAction + getWorkflowStatusForRequest.
vi.mock('@/lib/workflow-engine', () => ({
  submitWorkflow: vi.fn((params: unknown) => {
    submitWorkflowSpy(params)
    return Promise.resolve({ success: true, instanceId: 'wf-instance-1' })
  }),
  takeWorkflowAction: vi.fn((params: unknown) => {
    takeWfActionSpy(params)
    const p = params as { decision: string }
    return Promise.resolve({
      success:        true,
      instanceStatus: p.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
    })
  }),
  previewWorkflow:         vi.fn(async () => ({ workflowCode: 'WF_ANNUAL_LEAVE', resolvedChain: [] })),
  processSLABreaches:      vi.fn(async () => ({ processed: 0, errors: 0 })),
  resolveActorDisplayName: vi.fn(async () => 'HR Admin'),
}))
vi.mock('@/modules/workflow', () => ({
  // Default: one PENDING step so decideLeaveRequest(APPROVE/REJECT) can proceed.
  getWorkflowStatusForRequest: vi.fn(async () => ({
    instanceId:          'wf-1',
    workflowCode:        'WF_ANNUAL_LEAVE',
    workflowNameEn:      'Annual Leave',
    status:              'IN_PROGRESS',
    startedAt:           new Date('2026-05-01T00:00:00.000Z'),
    completedAt:         null,
    initiatedByPersonId: '00000000-0000-0000-0000-000000000001',
    slaDeadline:         null,
    slaHours:            72,
    steps: [{
      stepInstanceId: 'step-wf-1',
      stepOrder:      1,
      stepName:       'HR Review',
      status:         'PENDING',
      assigneeName:   null,
      decidedAt:      null,
    }],
  })),
  getPendingApprovalsV2:       vi.fn(async () => []),
  getWorkflowInstanceDetailV2: vi.fn(async () => null),
  getMyWorkflowRequests:       vi.fn(async () => []),
  resolvePendingApprover:      vi.fn(async () => null),
  submitWorkflow:              vi.fn(async () => ({ success: true, instanceId: 'wf-instance-1' })),
  takeWorkflowAction:          vi.fn(async () => ({ success: true, instanceStatus: 'APPROVED' })),
  previewWorkflow:             vi.fn(async () => ({ workflowCode: 'WF_ANNUAL_LEAVE', resolvedChain: [] })),
}))

const {
  createLeaveRequest, getLeaveRequest, listLeaveRequests, cancelLeaveRequest,
  submitLeaveRequest, decideLeaveRequest, saveLeaveRuleSet,
} = await import('@/modules/absence/actions')

beforeEach(() => {
  queryQueue = []
  callIndex  = 0
  vi.clearAllMocks()
  insertSpy.mockClear(); valuesSpy.mockClear(); returningSpy.mockClear()
  updateSpy.mockClear(); setSpy.mockClear(); whereSpy.mockClear()
  auditSpy.mockClear(); initWfSpy.mockClear(); stepWfSpy.mockClear()
  ruleGuardSpy.mockClear()
  session.user.id = '00000000-0000-0000-0000-0000000000c3'
  session.user.name = 'HR Admin'
  session.user.role = 'HR_ADMIN'
  session.user.legalEntityId = '00000000-0000-0000-0000-0000000000a1'
  session.user.personId = undefined
  mockDb.select.mockImplementation(() => makeProxy())
  mockDb.insert.mockImplementation(() => makeInsertChain([]))
  mockDb.update.mockImplementation(() => makeUpdateChain())
})

const ENTITY_A = '00000000-0000-0000-0000-0000000000a1'
const ENTITY_B = '00000000-0000-0000-0000-0000000000b2'
const PERSON_1 = '00000000-0000-0000-0000-000000000001'

const validRequestInput = () => ({
  personId:        PERSON_1,
  legalEntityId:   ENTITY_A,
  absenceTypeId:   '00000000-0000-0000-0000-0000000000aa',
  // Future dates: these tests exercise create/overlap/entity logic, NOT backdating.
  // Fixed past dates (2026-05) became backdated once the clock passed them, which
  // routed through the backdate pre-flight (leaveBackdatePolicies — not mocked here)
  // and broke the suite. Keep the fixtures in the future so the backdate path is
  // not triggered.
  startDate:       '2027-12-01',
  endDate:         '2027-12-05',
  durationDays:    5,
  isHalfDay:       false,
  submittedVia:    'PORTAL' as const,
  notes:           'Family trip',
  medicalCertRequired: false,
})

// ─────────────────────────────────────────────────────────────────────────
// createLeaveRequest
// ─────────────────────────────────────────────────────────────────────────

describe('createLeaveRequest', () => {
  it('PAYROLL_ADMIN (employee-type) is blocked from filing for an unrelated person', async () => {
    // PAYROLL_ADMIN may now file their OWN leave (employee-type self-service), but
    // relationship scope still blocks filing for someone who is not self/their report.
    session.user.role     = 'PAYROLL_ADMIN'
    session.user.personId = '00000000-0000-0000-0000-00000000abcd' // not PERSON_1, no reports
    await expect(createLeaveRequest(validRequestInput())).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('rejects malformed input via Zod (endDate before startDate)', async () => {
    await expect(
      createLeaveRequest({ ...validRequestInput(), startDate: '2026-05-10', endDate: '2026-05-05', durationDays: 1 }),
    ).rejects.toThrow()
  })

  it('rejects half-day with multi-day range', async () => {
    await expect(
      createLeaveRequest({
        ...validRequestInput(),
        isHalfDay: true,
        durationDays: 0.5,
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        halfDayPeriod: 'AM',
      }),
    ).rejects.toThrow()
  })

  it('rejects durationDays mismatch with calendar-day span (BR-AL-002)', async () => {
    session.user.personId = PERSON_1
    const tx = buildTxMock([{ id: 'lr-1' }])
    queryQueue.push([{ isActive: true, assignmentStatus: 'ACTIVE' }]) // P2-L3 assertActivePersonTarget pre-flight
    queryQueue.push([{ id: PERSON_1, legalEntityId: ENTITY_A }])
    queryQueue.push([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
    await expect(
      createLeaveRequest({ ...validRequestInput(), durationDays: 99 }),
    ).rejects.toThrow(/does not match the selected dates/i)
  })

  it('blocks employee filing for a different person', async () => {
    session.user.role = 'EMPLOYEE'
    session.user.personId = '00000000-0000-0000-0000-00000000abcd'
    await expect(createLeaveRequest(validRequestInput())).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('blocks cross-entity request for non-SUPER_ADMIN', async () => {
    session.user.legalEntityId = ENTITY_B
    session.user.personId = PERSON_1
    queryQueue.push([{ isActive: true, assignmentStatus: 'ACTIVE' }]) // P2-L3 assertActivePersonTarget pre-flight
    queryQueue.push([{ id: PERSON_1, legalEntityId: ENTITY_A }])
    const tx = buildTxMock([{ id: 'lr-1' }])
    tx.select.mockImplementation(() => makeProxy())
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      // Wire tx.select to read from queryQueue.
      tx.select = vi.fn(() => makeProxy())
      return await fn(tx)
    })
    await expect(createLeaveRequest(validRequestInput())).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('blocks overlapping pending/approved requests', async () => {
    session.user.personId = PERSON_1
    queryQueue = [
      [{ isActive: true, assignmentStatus: 'ACTIVE' }], // P2-L3 assertActivePersonTarget pre-flight
      [{ id: PERSON_1, legalEntityId: ENTITY_A }],   // person scope
      [{ typeCode: 'ANNUAL' }],                       // absence type lookup (FIX-S9-01)
      [{ value: '0' }],                               // policy: SICK_LEAVE_CERT_THRESHOLD_DAYS (FIX-S9-01)
      [{ id: 'existing-1', startDate: '2027-12-03', endDate: '2027-12-07', status: 'APPROVED' }],
    ]
    const tx = {
      select:  vi.fn(() => makeProxy()),
      insert:  vi.fn(() => makeInsertChain([{ id: 'lr-1' }])),
      update:  vi.fn(() => makeUpdateChain()),
      execute: vi.fn(() => Promise.resolve()),   // ARIA-LOCK: advisory lock
    }
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
    await expect(createLeaveRequest(validRequestInput())).rejects.toThrow(/existing leave request|same period/i)
  })

  it('happy path: writes audit row + DRAFT status', async () => {
    session.user.personId = PERSON_1
    queryQueue = [
      [{ isActive: true, assignmentStatus: 'ACTIVE' }], // P2-L3 assertActivePersonTarget pre-flight
      [{ id: PERSON_1, legalEntityId: ENTITY_A }],   // person scope
      [{ typeCode: 'ANNUAL' }],                       // absence type lookup (FIX-S9-01)
      [{ value: '0' }],                               // policy: SICK_LEAVE_CERT_THRESHOLD_DAYS (FIX-S9-01)
      [],                                             // overlap check (empty)
      [{ n: 0 }],                                    // nextRequestNumber count
    ]
    const tx = buildTxMock([{ id: 'lr-1' }])
    tx.select.mockImplementation(() => makeProxy())
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createLeaveRequest(validRequestInput())

    expect(result.id).toBe('lr-1')
    expect(result.requestNumber).toMatch(/^LR-\d{7}$/)
    expect(insertSpy).toHaveBeenCalled()
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({
      personId: PERSON_1,
      status:   'DRAFT',
      durationDays: '5',
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType:    'LEAVE_REQUEST.CREATED',
      resourceType: 'absence_entries',
      resourceId:   'lr-1',
    }))
  })

  it('half-day: durationDays must be 0.5', async () => {
    session.user.personId = PERSON_1
    queryQueue = [
      [{ isActive: true, assignmentStatus: 'ACTIVE' }], // P2-L3 assertActivePersonTarget pre-flight
      [{ id: PERSON_1, legalEntityId: ENTITY_A }],
      [{ typeCode: 'ANNUAL' }],                       // absence type lookup (FIX-S9-01)
      [{ value: '0' }],                               // policy: SICK_LEAVE_CERT_THRESHOLD_DAYS (FIX-S9-01)
      [],
      [{ n: 0 }],
    ]
    const tx = buildTxMock([{ id: 'lr-2' }])
    tx.select.mockImplementation(() => makeProxy())
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createLeaveRequest({
      ...validRequestInput(),
      isHalfDay: true,
      halfDayPeriod: 'AM',
      durationDays: 0.5,
      startDate: '2027-12-01',
      endDate: '2027-12-01',
    })
    expect(result.id).toBe('lr-2')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// submitLeaveRequest
// ─────────────────────────────────────────────────────────────────────────

describe('submitLeaveRequest', () => {
  const draftRow = {
    id: 'lr-1', personId: PERSON_1, legalEntityId: ENTITY_A,
    absenceTypeId: '00000000-0000-0000-0000-0000000000aa',
    startDate: '2026-05-01', endDate: '2026-05-05',
    durationDays: '5', status: 'DRAFT',
  }

  it('rejects non-DRAFT/REJECTED statuses', async () => {
    queryQueue = [[{ ...draftRow, status: 'APPROVED' }]]
    await expect(submitLeaveRequest('lr-1')).rejects.toThrow(/draft or returned/i)
  })

  it('blocks cross-entity submit', async () => {
    session.user.legalEntityId = ENTITY_B
    queryQueue = [[draftRow]]
    await expect(submitLeaveRequest('lr-1')).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('initiates workflow and flips to PENDING (Hard Rule 6)', async () => {
    // Two outer db.select calls before the transaction:
    //   [0] absenceEntries row fetch
    //   [1] absenceTypes.typeCode lookup (BR-WF-001: routes leave type to workflow)
    queryQueue = [[draftRow], [{ typeCode: 'ANNUAL' }]]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await submitLeaveRequest('lr-1')

    expect(r.status).toBe('PENDING')
    expect(r.workflowInstanceId).toBe('wf-instance-1')
    // submitLeaveRequest uses submitWorkflow (v2 engine), not initiateWorkflow.
    expect(submitWorkflowSpy).toHaveBeenCalledWith(expect.objectContaining({
      workflowCode:  'WF_ANNUAL_LEAVE',
      resourceType:  'absence_entries',
      resourceId:    'lr-1',
      legalEntityId: ENTITY_A,
    }))
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
      status: 'PENDING',
      workflowInstanceId: 'wf-instance-1',
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'LEAVE_REQUEST.SUBMITTED',
    }))
  })
})

// ─────────────────────────────────────────────────────────────────────────
// getLeaveRequest
// ─────────────────────────────────────────────────────────────────────────

describe('getLeaveRequest', () => {
  const detailRow = {
    e: {
      id: 'lr-1', requestNumber: 'LR-0000001',
      personId: PERSON_1, legalEntityId: ENTITY_A,
      absenceTypeId: '00000000-0000-0000-0000-0000000000aa',
      startDate: '2026-05-01', endDate: '2026-05-05',
      durationDays: '5', isHalfDay: false, halfDayPeriod: null,
      status: 'PENDING', submittedVia: 'PORTAL', submittedBy: PERSON_1,
      approvedBy: null, rejectionReason: null, workflowInstanceId: null,
      createdDate: new Date(), notes: 'Family trip',
      approvalDate: null, medicalCertRequired: false, medicalCertUploaded: false,
      medicalCertDocumentId: null, medicalCertDeadline: null,
      balanceBeforeDays: '22', balanceAfterDays: '17',
      payDeductionAmount: null, ariaRecommendation: null, ariaConfidenceScore: null,
      extraData: {},
    },
    p: { personNumber: 'AVN-000001', fullNameEn: 'Sara Ahmed', fullNameAr: 'سارة' },
    t: { typeCode: 'ANNUAL', nameEn: 'Annual Leave', nameAr: 'الإجازة السنوية' },
  }

  it('returns null for unknown id', async () => {
    queryQueue = [[]]
    expect(await getLeaveRequest('unknown')).toBeNull()
  })

  it('blocks cross-entity for HR_ADMIN', async () => {
    session.user.legalEntityId = ENTITY_B
    queryQueue = [[detailRow]]
    await expect(getLeaveRequest('lr-1')).rejects.toThrow(/do not have permission|FORBIDDEN/i)
  })

  it('EMPLOYEE may view own request', async () => {
    session.user.role = 'EMPLOYEE'
    session.user.personId = PERSON_1
    queryQueue = [[detailRow]]
    const v = await getLeaveRequest('lr-1')
    expect(v?.requestNumber).toBe('LR-0000001')
  })

  it('EMPLOYEE blocked from another person\'s request', async () => {
    session.user.role = 'EMPLOYEE'
    session.user.personId = '00000000-0000-0000-0000-00000000ffff'
    queryQueue = [[detailRow]]
    await expect(getLeaveRequest('lr-1')).rejects.toThrow(/do not have permission|You can only/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// listLeaveRequests
// ─────────────────────────────────────────────────────────────────────────

describe('listLeaveRequests', () => {
  it('forces personId filter for EMPLOYEE role', async () => {
    session.user.role = 'EMPLOYEE'
    session.user.personId = PERSON_1
    queryQueue = [
      [{ total: 0 }],
      [],
    ]
    const r = await listLeaveRequests({})
    expect(r.total).toBe(0)
    expect(r.rows).toEqual([])
  })

  it('happy path: returns paginated rows', async () => {
    queryQueue = [
      [{ total: 1 }],
      [{
        id: 'lr-1', requestNumber: 'LR-0000001',
        personId: PERSON_1, personNumber: 'AVN-000001',
        personFullNameEn: 'Sara Ahmed', personFullNameAr: 'سارة',
        legalEntityId: ENTITY_A, absenceTypeId: 't',
        absenceTypeCode: 'ANNUAL', absenceTypeNameEn: 'Annual Leave', absenceTypeNameAr: 'سنوي',
        startDate: '2026-05-01', endDate: '2026-05-05',
        durationDays: '5', isHalfDay: false, halfDayPeriod: null,
        status: 'PENDING', submittedVia: 'PORTAL', submittedBy: PERSON_1,
        approvedBy: null, rejectionReason: null, workflowInstanceId: null, createdDate: new Date(),
      }],
    ]
    const r = await listLeaveRequests({ status: 'PENDING' })
    expect(r.total).toBe(1)
    expect(r.rows[0].requestNumber).toBe('LR-0000001')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// cancelLeaveRequest
// ─────────────────────────────────────────────────────────────────────────

describe('cancelLeaveRequest', () => {
  const pendingRow = {
    id: 'lr-1', personId: PERSON_1, legalEntityId: ENTITY_A,
    absenceTypeId: 't1', startDate: '2026-05-01', endDate: '2026-05-05',
    durationDays: '5', status: 'PENDING',
  }

  it('rejects already-CANCELLED', async () => {
    const tx = {
      select: vi.fn(() => {
        callIndex = 0
        queryQueue = [[{ ...pendingRow, status: 'CANCELLED' }]]
        return makeProxy()
      }),
      insert: vi.fn(() => makeInsertChain([])),
      update: vi.fn(() => makeUpdateChain()),
    }
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
    await expect(cancelLeaveRequest({ requestId: '00000000-0000-0000-0000-0000000010f1', reason: 'changed mind' })).rejects.toThrow(/already.*cancel|cannot be cancelled/i)
  })

  it('blocks cross-entity cancel', async () => {
    session.user.legalEntityId = ENTITY_B
    const tx = {
      select: vi.fn(() => {
        queryQueue = [[pendingRow]]; callIndex = 0
        return makeProxy()
      }),
      insert: vi.fn(() => makeInsertChain([])),
      update: vi.fn(() => makeUpdateChain()),
    }
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
    await expect(cancelLeaveRequest({ requestId: '00000000-0000-0000-0000-0000000010f1', reason: 'reason' })).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('happy path: status transitions PENDING → CANCELLED + writes audit', async () => {
    const localQueues: unknown[][] = [
      [pendingRow],          // initial fetch
      [],                    // balance lookup → empty (no balance row yet)
    ]
    let localIdx = 0
    function makeLocalProxy(): unknown {
      return new Proxy({} as Record<string, unknown>, {
        get(_, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: unknown[]) => unknown) =>
              Promise.resolve(localQueues[localIdx++] ?? []).then(resolve)
          }
          return () => makeLocalProxy()
        },
      })
    }
    const tx = {
      select: vi.fn(() => makeLocalProxy()),
      insert: vi.fn(() => makeInsertChain([])),
      update: vi.fn(() => makeUpdateChain()),
    }
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await cancelLeaveRequest({ requestId: '00000000-0000-0000-0000-0000000010f1', reason: 'plans changed' })
    expect(r.status).toBe('CANCELLED')
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'CANCELLED' }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'LEAVE_REQUEST.CANCELLED',
      resourceId: '00000000-0000-0000-0000-0000000010f1',
    }))
  })
})

// ─────────────────────────────────────────────────────────────────────────
// decideLeaveRequest (approve / reject)
// ─────────────────────────────────────────────────────────────────────────

describe('decideLeaveRequest', () => {
  const pendingWithWf = {
    id: 'lr-1', personId: PERSON_1, legalEntityId: ENTITY_A,
    absenceTypeId: 't1', startDate: '2026-05-01', endDate: '2026-05-05',
    durationDays: '5', status: 'PENDING', workflowInstanceId: 'wf-1',
  }

  it('rejects request without workflow instance', async () => {
    queryQueue = [[{ ...pendingWithWf, workflowInstanceId: null }]]
    await expect(decideLeaveRequest({ requestId: '00000000-0000-0000-0000-0000000010f1', action: 'APPROVE' }))
      .rejects.toThrow(/not been submitted for approval/i)
  })

  it('happy path APPROVE: calls actOnWorkflowStep + flips status (audit)', async () => {
    queryQueue = [[pendingWithWf]]
    let txCallIdx = 0
    const txQueues: unknown[][] = [[]]   // balance row → none
    const tx = {
      select: vi.fn(() => new Proxy({} as Record<string, unknown>, {
        get(_, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: unknown[]) => unknown) =>
              Promise.resolve(txQueues[txCallIdx++] ?? []).then(resolve)
          }
          return () => makeProxy()
        },
      })),
      insert: vi.fn(() => makeInsertChain([])),
      update: vi.fn(() => makeUpdateChain()),
    }
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await decideLeaveRequest({ requestId: '00000000-0000-0000-0000-0000000010f1', action: 'APPROVE', comment: 'Approved by manager' })
    expect(r.status).toBe('APPROVED')
    // decideLeaveRequest uses takeWorkflowAction (v2 engine), not actOnWorkflowStep.
    expect(takeWfActionSpy).toHaveBeenCalledWith(expect.objectContaining({
      stepInstanceId: 'step-wf-1',
      decision:       'APPROVE',
      decisionNote:   'Approved by manager',
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'LEAVE_REQUEST.APPROVED',
    }))
  })

  it('happy path REJECT: terminal status, no balance write', async () => {
    queryQueue = [[pendingWithWf]]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await decideLeaveRequest({ requestId: '00000000-0000-0000-0000-0000000010f1', action: 'REJECT', comment: 'Insufficient balance' })
    expect(r.status).toBe('REJECTED')
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
      status: 'REJECTED',
      rejectionReason: 'Insufficient balance',
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'LEAVE_REQUEST.REJECTED' }))
  })
})

// ─────────────────────────────────────────────────────────────────────────
// saveLeaveRuleSet (S5-06 / Hard Rule 11)
// ─────────────────────────────────────────────────────────────────────────

describe('saveLeaveRuleSet — Hard Rule 11 (BR-AL-001)', () => {
  it('throws FORBIDDEN for HR_ADMIN (only HR_DIRECTOR / SUPER_ADMIN)', async () => {
    await expect(saveLeaveRuleSet({
      ruleSetCode: 'X', ruleSetNameEn: 'X', effectiveFrom: '2026-01-01',
      lines: [{
        absenceTypeCode: 'ANNUAL',
        entitlementTiersJson: [{ minServiceMonths: 12, maxServiceMonths: null, daysEntitled: 30 }],
        maxCarryForwardDays: 0, carryForwardExpiryMonths: 0, isProRated: true,
        accrualFrequency: 'MONTHLY', minServiceMonths: 0, encashmentAllowed: false,
      }],
    } as unknown as Parameters<typeof saveLeaveRuleSet>[0])).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('rejects annual entitlement < 22 days (BR-AL-001)', async () => {
    session.user.role = 'HR_DIRECTOR'
    await expect(saveLeaveRuleSet({
      ruleSetCode: 'X', ruleSetNameEn: 'X', effectiveFrom: '2026-01-01',
      lines: [{
        absenceTypeCode: 'ANNUAL',
        entitlementTiersJson: [{ minServiceMonths: 12, maxServiceMonths: null, daysEntitled: 18 }],
        maxCarryForwardDays: 0, carryForwardExpiryMonths: 0, isProRated: true,
        accrualFrequency: 'MONTHLY', minServiceMonths: 0, encashmentAllowed: false,
      }],
    } as unknown as Parameters<typeof saveLeaveRuleSet>[0])).rejects.toThrow(/statutory minimum of 22 days|UAE minimum/i)
    // Even though it threw, the guard should have been called.
    expect(ruleGuardSpy).toHaveBeenCalled()
  })

  it('happy path: HR_DIRECTOR saves rule set + audit row', async () => {
    session.user.role = 'HR_DIRECTOR'
    const tx = {
      select: vi.fn(() => makeProxy()),
      insert: vi.fn((table: unknown) => {
        insertSpy(table)
        return makeInsertChain([{ id: 'rs-1' }])
      }),
      update: vi.fn(() => makeUpdateChain()),
    }
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await saveLeaveRuleSet({
      ruleSetCode: 'STANDARD', ruleSetNameEn: 'UAE Standard',
      effectiveFrom: '2026-01-01',
      nationalityScope: 'ALL', employmentTypeScope: 'ALL', isDefault: true,
      lines: [{
        absenceTypeCode: 'ANNUAL',
        entitlementTiersJson: [{ minServiceMonths: 12, maxServiceMonths: null, daysEntitled: 30 }],
        maxCarryForwardDays: 22, carryForwardExpiryMonths: 24, isProRated: true,
        accrualFrequency: 'MONTHLY', minServiceMonths: 0, encashmentAllowed: true,
      }],
    } as unknown as Parameters<typeof saveLeaveRuleSet>[0])

    expect(r.ruleSetId).toBe('rs-1')
    expect(r.lineCount).toBe(1)
    expect(ruleGuardSpy).toHaveBeenCalledWith({
      accrualRateDays: 2.5,
      uaeMinimumDaysAnnual: 22,
    })
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'LEAVE_RULE_SET.CREATED',
      resourceType: 'leave_rule_sets',
      resourceId: 'rs-1',
    }))
  })

  // S5-Q14 — UPDATE branch (existing ruleSetId).
  it('UPDATE path: HR_DIRECTOR updates existing rule set + emits LEAVE_RULE_SET.UPDATED', async () => {
    session.user.role = 'HR_DIRECTOR'
    const tx = {
      select: vi.fn(() => makeProxy()),
      insert: vi.fn((table: unknown) => { insertSpy(table); return makeInsertChain([{ id: 'rs-existing' }]) }),
      update: vi.fn(() => makeUpdateChain()),
    }
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await saveLeaveRuleSet({
      ruleSetId:           '00000000-0000-0000-0000-0000000000aa',
      ruleSetCode:         'STANDARD',
      ruleSetNameEn:       'UAE Standard (revised)',
      effectiveFrom:       '2026-04-01',
      nationalityScope:    'ALL',
      employmentTypeScope: 'ALL',
      isDefault:           true,
      lines: [{
        absenceTypeCode:      'ANNUAL',
        entitlementTiersJson: [{ minServiceMonths: 12, maxServiceMonths: null, daysEntitled: 30 }],
        maxCarryForwardDays:  22, carryForwardExpiryMonths: 24, isProRated: true,
        accrualFrequency:     'MONTHLY', minServiceMonths: 0, encashmentAllowed: true,
      }],
    } as unknown as Parameters<typeof saveLeaveRuleSet>[0])

    expect(r.ruleSetId).toBe('00000000-0000-0000-0000-0000000000aa')
    expect(r.lineCount).toBe(1)
    // UPDATE branch deactivates existing lines (isActive=false) — see setSpy calls.
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'LEAVE_RULE_SET.UPDATED',
      resourceType: 'leave_rule_sets',
      resourceId: '00000000-0000-0000-0000-0000000000aa',
    }))
  })
})

// ─────────────────────────────────────────────────────────────────────────
// S5-Q15 — decideLeaveRequest non-terminal step
// ─────────────────────────────────────────────────────────────────────────

describe('decideLeaveRequest non-terminal step (S5-Q15)', () => {
  const pendingWithWf = {
    id: '00000000-0000-0000-0000-0000000010f1',
    personId: PERSON_1, legalEntityId: ENTITY_A,
    absenceTypeId: 't1', startDate: '2026-05-01', endDate: '2026-05-05',
    durationDays: '5', status: 'PENDING', workflowInstanceId: 'wf-1',
  }

  it('returns PENDING + does NOT mutate the row when actOnWorkflowStep returns IN_PROGRESS', async () => {
    queryQueue = [[pendingWithWf]]
    // Override takeWorkflowAction (v2 engine) to return a non-terminal status.
    // decideLeaveRequest uses takeWorkflowAction, not actOnWorkflowStep.
    const { takeWorkflowAction } = await import('@/lib/workflow-engine')
    ;(takeWorkflowAction as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (params: unknown) => {
        takeWfActionSpy(params)
        return Promise.resolve({ success: true, instanceStatus: 'IN_PROGRESS' })
      },
    )

    // mockDb.transaction should NOT be invoked — the early-return short-circuits.
    const txSpy = vi.fn()
    mockDb.transaction.mockImplementation(txSpy)

    const r = await decideLeaveRequest({
      requestId: '00000000-0000-0000-0000-0000000010f1',
      action:    'APPROVE',
      comment:   'Approved by line manager — awaiting HR_DIRECTOR',
    })

    expect(r.status).toBe('PENDING')
    expect(r.id).toBe('00000000-0000-0000-0000-0000000010f1')
    expect(txSpy).not.toHaveBeenCalled()       // no row update
    expect(setSpy).not.toHaveBeenCalled()      // no SET issued
    expect(auditSpy).not.toHaveBeenCalled()    // no audit row
    // The workflow advance call DID fire (v2 engine parameters).
    expect(takeWfActionSpy).toHaveBeenCalledWith(expect.objectContaining({
      stepInstanceId: 'step-wf-1',
      decision:       'APPROVE',
      decisionNote:   'Approved by line manager — awaiting HR_DIRECTOR',
    }))
  })
})
