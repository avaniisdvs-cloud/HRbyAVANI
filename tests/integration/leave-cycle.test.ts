import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * AGENT-3B — Leave Management Cycle Integration Tests
 *
 * LV-001 through LV-015: full lifecycle coverage for the absence module.
 *
 * Uses the same proxy-based DB mock pattern as absence-actions.test.ts.
 * All actions tested are those confirmed to EXIST in modules/absence/actions.ts
 * and modules/absence/services.ts. Scenarios that require absent business
 * logic (LV-003 balance enforcement, LV-007 maternity/LV-008 hajj entity
 * rules, LV-013 DIFC entitlement, LV-014 gender restriction) are marked with
 * `.skip` and a note explaining what would need to exist before enabling them.
 */

// ── Mock plumbing ─────────────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex   = 0

const insertSpy    = vi.fn()
const valuesSpy    = vi.fn()
const returningSpy = vi.fn()
const setSpy       = vi.fn()
const whereSpy     = vi.fn()
const auditSpy     = vi.fn()
const initWfSpy         = vi.fn()
const stepWfSpy         = vi.fn()
const submitWorkflowSpy = vi.fn()

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
    execute: vi.fn(() => Promise.resolve([{ nextval: '1' }])),
  }
  return tx
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select:      vi.fn(() => makeProxy()),
  insert:      vi.fn(() => makeInsertChain([])),
  update:      vi.fn(() => makeUpdateChain()),
  transaction: vi.fn(),
}

const session = {
  user: {
    id:            '00000000-0000-0000-0000-0000000000c3',
    name:          'HR Admin',
    role:          'HR_ADMIN',
    legalEntityId: '00000000-0000-0000-0000-0000000000a1',
    personId:      undefined as string | undefined,
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
  initiateWorkflow: vi.fn((trigger: string, subjectType: string, subjectId: string, entity: string, ctx: unknown) => {
    initWfSpy({ trigger, subjectType, subjectId, entity, ctx })
    return Promise.resolve({ instanceId: 'wf-lc-001' })
  }),
  actOnWorkflowStep: vi.fn((instanceId: string, action: string, comment?: string) => {
    stepWfSpy({ instanceId, action, comment })
    return Promise.resolve({ status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' })
  }),
}))
vi.mock('@/modules/config/guards', () => ({
  assertLeaveRuleNotBelowMinimum: vi.fn(),
}))
vi.mock('@/drizzle/schema', () => ({
  absenceEntries:   {
    id: {}, tenantId: {}, personId: {}, status: {}, legalEntityId: {},
    absenceTypeId: {}, startDate: {}, endDate: {}, createdDate: {},
    workflowInstanceId: {}, durationDays: {}, medicalCertRequired: {},
    medicalCertUploaded: {},
  },
  absenceTypes:     {
    id: {}, tenantId: {}, typeCode: {},
    genderRestriction: {}, isOneTimePerEmployment: {},
  },
  absenceBalances:  {
    id: {}, tenantId: {}, personId: {}, absenceTypeId: {}, balanceYear: {},
    carriedForwardDays: {}, openingBalanceDays: {}, accruedDays: {},
    takenDays: {}, pendingDays: {}, adjustedDays: {}, forfeitedDays: {},
    closingBalanceDays: {}, lastAccrualDate: {},
  },
  persons:          {
    id: {}, tenantId: {}, legalEntityId: {}, gender: {},
    hireDate: {}, nationalityCategory: {}, employmentType: {},
  },
  legalEntities:    { id: {} },
  leaveRuleSets:    { id: {}, tenantId: {}, isActive: {}, effectiveFrom: {}, effectiveTo: {} },
  leaveRuleLines:   { id: {}, leaveRuleSetId: {}, absenceTypeCode: {}, isActive: {} },
  policySettings:   { tenantId: {}, legalEntityId: {}, settingKey: {}, settingValue: {}, effectiveFrom: {}, effectiveTo: {} },
  events:           { tenantId: {}, eventType: {}, payload: {} },
  auditLog:         { tenantId: {}, eventType: {} },
  workerAssignments: { id: {}, tenantId: {}, personId: {}, positionId: {}, legalEntityId: {}, isActive: {}, lineManagerId: {}, isActing: {}, actingEndDate: {} },
}))
vi.mock('@/lib/leave-rule-resolver', () => ({
  resolveLeaveRuleSet:   vi.fn(),
  entitlementForService: vi.fn(),
  scoreLeaveRuleSet:     vi.fn(() => 0),
}))
vi.mock('drizzle-orm', () => ({
  eq:     () => ({}),
  and:    (...a: unknown[]) => a,
  ilike:  () => ({}),
  or:     (...a: unknown[]) => a,
  asc:    () => ({}),
  desc:   () => ({}),
  // relations() is imported by drizzle/schema/workflow-engine.ts
  relations: (..._args: unknown[]) => ({}),
  count:  () => ({}),
  lte:    () => ({}),
  gte:    () => ({}),
  isNull: () => ({}),
  sql:    Object.assign(() => ({}), { raw: () => ({}) }),
}))
vi.mock('@/lib/absence-cert-policy', () => ({
  getSickLeaveCertThreshold: vi.fn(async () => 0),
  isMedicalCertRequired:     vi.fn((typeCode: string, duration: number, threshold: number) =>
    typeCode === 'SICK' && duration > threshold,
  ),
}))
vi.mock('@/lib/effective-date', () => ({
  addDays:    (d: string, n: number) => d,  // identity for tests
  addMonths:  (d: string, n: number) => d,
  todayUae:   () => '2026-05-04',
  daysBetween: (a: string, b: string) => {
    const ms = new Date(b).getTime() - new Date(a).getTime()
    return Math.round(ms / 86400000)
  },
}))
// submitLeaveRequest calls submitWorkflow (v2 engine); decideLeaveRequest calls
// takeWorkflowAction + getWorkflowStatusForRequest.  Both are unmocked by default
// and would attempt real DB queries — mock them here.
vi.mock('@/lib/workflow-engine', () => ({
  submitWorkflow: vi.fn((params: unknown) => {
    submitWorkflowSpy(params)
    return Promise.resolve({ success: true, instanceId: 'wf-lc-001' })
  }),
  takeWorkflowAction:     vi.fn(async () => ({ success: true, instanceStatus: 'APPROVED' })),
  previewWorkflow:        vi.fn(async () => ({ workflowCode: 'WF_ANNUAL_LEAVE', resolvedChain: [] })),
  processSLABreaches:     vi.fn(async () => ({ processed: 0, errors: 0 })),
  resolveActorDisplayName: vi.fn(async () => 'HR Admin'),
}))
vi.mock('@/modules/workflow', () => ({
  // Returns a single PENDING step so decideLeaveRequest(APPROVE) can proceed.
  getWorkflowStatusForRequest: vi.fn(async () => ({
    instanceId:          'wf-lc-default',
    workflowCode:        'WF_ANNUAL_LEAVE',
    workflowNameEn:      'Annual Leave',
    status:              'IN_PROGRESS',
    startedAt:           new Date('2026-07-01T00:00:00.000Z'),
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
  getPendingApprovalsV2:     vi.fn(async () => []),
  getWorkflowInstanceDetailV2: vi.fn(async () => null),
  getMyWorkflowRequests:     vi.fn(async () => []),
  resolvePendingApprover:    vi.fn(async () => null),
  submitWorkflow:            vi.fn(async () => ({ success: true, instanceId: 'wf-lc-001' })),
  takeWorkflowAction:        vi.fn(async () => ({ success: true, instanceStatus: 'APPROVED' })),
  previewWorkflow:           vi.fn(async () => ({ workflowCode: 'WF_ANNUAL_LEAVE', resolvedChain: [] })),
}))

const {
  createLeaveRequest,
  submitLeaveRequest,
  cancelLeaveRequest,
  decideLeaveRequest,
  getLeaveRequest,
} = await import('@/modules/absence/actions')

const {
  computeClosingBalance,
  computeMonthlyAccrualDays,
  computeRequestDurationDays,
  rangesOverlap,
  accrueMonthlyBalance,
} = await import('@/modules/absence/services')

const { resolveLeaveRuleSet, entitlementForService } =
  await import('@/lib/leave-rule-resolver')

// ── Constants ─────────────────────────────────────────────────────────────

const ENTITY_A   = '00000000-0000-0000-0000-0000000000a1'
const PERSON_1   = '00000000-0000-0000-0000-000000000001'
const TYPE_ANN   = '00000000-0000-0000-0000-000000000aa1'  // ANNUAL
const TYPE_SICK  = '00000000-0000-0000-0000-000000000aa2'  // SICK
const TYPE_MAT   = '00000000-0000-0000-0000-000000000aa3'  // MATERNITY
const REQUEST_ID = '00000000-0000-0000-0000-0000000010f1'

const baseInput = () => ({
  personId:            PERSON_1,
  legalEntityId:       ENTITY_A,
  absenceTypeId:       TYPE_ANN,
  startDate:           '2026-07-01',
  endDate:             '2026-07-05',
  durationDays:        5,
  isHalfDay:           false,
  submittedVia:        'PORTAL' as const,
  notes:               'Summer break',
  medicalCertRequired: false,
})

// Shared TX factory that uses a local queue so each test is isolated.
function makeScopedTx(queues: unknown[][]) {
  let idx = 0
  function localProxy(): unknown {
    return new Proxy({} as Record<string, unknown>, {
      get(_, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown[]) => unknown) =>
            Promise.resolve(queues[idx++] ?? []).then(resolve)
        }
        return () => localProxy()
      },
    })
  }
  return {
    select: vi.fn(() => localProxy()),
    insert: vi.fn((table: unknown) => { insertSpy(table); return makeInsertChain([{ id: REQUEST_ID }]) }),
    update: vi.fn(() => makeUpdateChain()),
    execute: vi.fn(() => Promise.resolve([])),
  }
}

function makeCreateLeaveRequestTx(queues: unknown[][]) {
  queryQueue = [[{ isActive: true, assignmentStatus: 'ACTIVE' }]]
  callIndex = 0
  return makeScopedTx(queues)
}

beforeEach(() => {
  queryQueue = []
  callIndex  = 0
  vi.clearAllMocks()
  insertSpy.mockClear()
  valuesSpy.mockClear()
  returningSpy.mockClear()
  setSpy.mockClear()
  whereSpy.mockClear()
  auditSpy.mockClear()
  initWfSpy.mockClear()
  stepWfSpy.mockClear()
  session.user.id            = '00000000-0000-0000-0000-0000000000c3'
  session.user.name          = 'HR Admin'
  session.user.role          = 'HR_ADMIN'
  session.user.legalEntityId = ENTITY_A
  session.user.personId      = PERSON_1  // default HR_ADMIN caller has a linked person
  mockDb.select.mockImplementation(() => makeProxy())
  mockDb.insert.mockImplementation(() => makeInsertChain([]))
  mockDb.update.mockImplementation(() => makeUpdateChain())
})

// ══════════════════════════════════════════════════════════════════════════
// LV-001: Submit annual leave request → DRAFT row created
// ══════════════════════════════════════════════════════════════════════════

describe('LV-001: submit annual leave request', () => {
  it('creates a DRAFT leave request with correct fields', async () => {
    // getSickLeaveCertThreshold is fully mocked — it does NOT touch tx.select.
    // Tx queue order: person → absenceType → overlap → count.
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A, gender: 'MALE' }],  // person scope
      [{ typeCode: 'ANNUAL', genderRestriction: null, isOneTimePerEmployment: false }],  // absence type
      [],                                            // overlap check (clear)
      [],                                            // balance check (no row → skip)
      [{ n: 0 }],                                   // nextRequestNumber count
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createLeaveRequest(baseInput())

    expect(result.id).toBe(REQUEST_ID)
    expect(result.requestNumber).toMatch(/^LR-\d{7}$/)
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({
      personId:      PERSON_1,
      absenceTypeId: TYPE_ANN,
      startDate:     '2026-07-01',
      endDate:       '2026-07-05',
      durationDays:  '5',
      status:        'DRAFT',
    }))
  })

  it('audit log records LEAVE_REQUEST.CREATED event', async () => {
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A }],
      [{ typeCode: 'ANNUAL' }],
      [],
      [{ n: 3 }],
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await createLeaveRequest(baseInput())

    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType:    'LEAVE_REQUEST.CREATED',
      resourceType: 'absence_entries',
    }))
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-002: Submit → workflow triggered → status becomes PENDING
//         workflowInstanceId populated
// ══════════════════════════════════════════════════════════════════════════

describe('LV-002: submit leave request → PENDING + workflowInstanceId', () => {
  const draftRow = {
    id:              REQUEST_ID,
    personId:        PERSON_1,
    legalEntityId:   ENTITY_A,
    absenceTypeId:   TYPE_ANN,
    startDate:       '2026-07-01',
    endDate:         '2026-07-05',
    durationDays:    '5',
    status:          'DRAFT',
    medicalCertRequired: false,
    medicalCertUploaded: false,
  }

  it('transitions DRAFT → PENDING and returns workflowInstanceId', async () => {
    // Two outer db.select calls before the transaction:
    //   [0] absenceEntries row fetch
    //   [1] absenceTypes.typeCode lookup (BR-WF-001: routes leave type to workflow)
    queryQueue = [[draftRow], [{ typeCode: 'ANNUAL' }]]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await submitLeaveRequest(REQUEST_ID)

    expect(r.status).toBe('PENDING')
    expect(r.workflowInstanceId).toBe('wf-lc-001')
    // submitLeaveRequest uses submitWorkflow (v2 engine), not initiateWorkflow.
    expect(submitWorkflowSpy).toHaveBeenCalledWith(expect.objectContaining({
      workflowCode:  'WF_ANNUAL_LEAVE',
      resourceType:  'absence_entries',
      resourceId:    REQUEST_ID,
      legalEntityId: ENTITY_A,
    }))
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
      status:             'PENDING',
      workflowInstanceId: 'wf-lc-001',
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'LEAVE_REQUEST.SUBMITTED',
    }))
  })

  it('rejects if status is already APPROVED (not DRAFT/REJECTED)', async () => {
    queryQueue = [[{ ...draftRow, status: 'APPROVED' }]]
    await expect(submitLeaveRequest(REQUEST_ID)).rejects.toThrow(/draft or returned/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-003: Insufficient balance rejection
// ══════════════════════════════════════════════════════════════════════════

describe('LV-003: insufficient balance — pure arithmetic check', () => {
  it('computeClosingBalance returns negative when leave exceeds accrued', () => {
    const closing = computeClosingBalance({
      openingBalanceDays: 0,
      accruedDays:        5,
      takenDays:          0,
      pendingDays:        10,   // requesting 10 days
      adjustedDays:       0,
      carriedForwardDays: 0,
      forfeitedDays:      0,
    })
    // closing = 0 + 5 + 0 + 0 − 0 − 10 − 0 = −5
    expect(closing).toBe(-5)
  })

  it('INSUFFICIENT_BALANCE error thrown by createLeaveRequest when balance < durationDays', async () => {
    // Balance row exists: 3 days available, employee requests 5 days.
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A, gender: 'MALE' }],
      [{ typeCode: 'ANNUAL', genderRestriction: null, isOneTimePerEmployment: false }],
      [],   // overlap: clear
      [{    // balance row — only 3 days available
        openingBalanceDays: '0',
        accruedDays:        '3',
        takenDays:          '0',
        pendingDays:        '0',
        adjustedDays:       '0',
        carriedForwardDays: '0',
        forfeitedDays:      '0',
      }],
      // action throws before nextRequestNumber
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await expect(createLeaveRequest(baseInput())).rejects.toThrow(/enough leave balance/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-004: Sick leave medical-cert requirement (auto-certRequired logic)
// ══════════════════════════════════════════════════════════════════════════

describe('LV-004: sick leave cert-required policy', () => {
  it('3-day sick leave with threshold=0 sets medicalCertRequired=true on the INSERT payload', async () => {
    const sickInput = {
      ...baseInput(),
      absenceTypeId:   TYPE_SICK,
      startDate:       '2026-07-01',
      endDate:         '2026-07-03',
      durationDays:    3,
    }
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A, gender: 'MALE' }],
      [{ typeCode: 'SICK', genderRestriction: null, isOneTimePerEmployment: false }],
      [],                       // overlap check
      [],                       // balance check (no row → skip)
      [{ n: 1 }],               // nextRequestNumber
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await createLeaveRequest(sickInput)

    // isMedicalCertRequired('SICK', 3, 0) → true; INSERT should record it.
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ medicalCertRequired: true }),
    )
  })

  it('3-day sick leave with threshold=3 sets medicalCertRequired=false (threshold not exceeded)', async () => {
    const { getSickLeaveCertThreshold } = await import('@/lib/absence-cert-policy')
    vi.mocked(getSickLeaveCertThreshold).mockResolvedValueOnce(3)

    const sickInput = {
      ...baseInput(),
      absenceTypeId: TYPE_SICK,
      startDate:     '2026-07-01',
      endDate:       '2026-07-03',
      durationDays:  3,
    }
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A, gender: 'MALE' }],
      [{ typeCode: 'SICK', genderRestriction: null, isOneTimePerEmployment: false }],
      [],
      [],  // balance check (no row → skip)
      [{ n: 2 }],
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await createLeaveRequest(sickInput)

    // isMedicalCertRequired('SICK', 3, 3) → false (3 is NOT > 3)
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ medicalCertRequired: false }),
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-005: Leave overlap detection
// ══════════════════════════════════════════════════════════════════════════

describe('LV-005: leave overlap detection', () => {
  it('rangesOverlap returns true for overlapping date ranges', () => {
    // Existing: 2026-06-01 → 2026-06-05
    // New:      2026-06-03 → 2026-06-08
    expect(rangesOverlap('2026-06-03', '2026-06-08', '2026-06-01', '2026-06-05')).toBe(true)
  })

  it('rangesOverlap returns false for non-overlapping ranges', () => {
    expect(rangesOverlap('2026-06-10', '2026-06-15', '2026-06-01', '2026-06-05')).toBe(false)
  })

  it('rangesOverlap returns true when ranges share exactly one boundary date', () => {
    // Existing: 2026-06-01 → 2026-06-05, New starts 2026-06-05
    expect(rangesOverlap('2026-06-05', '2026-06-08', '2026-06-01', '2026-06-05')).toBe(true)
  })

  it('createLeaveRequest throws OVERLAP when an approved request covers the new range', async () => {
    const overlapInput = {
      ...baseInput(),
      startDate:    '2026-06-03',
      endDate:      '2026-06-08',
      durationDays: 6,
    }
    // getSickLeaveCertThreshold goes through db.select (global mock), not tx.select.
    // The scoped tx queue only includes the tx.select calls:
    //   [0] loadPersonScope, [1] absence type lookup, [2] overlap check (returns conflict).
    // The cert-policy call uses mockDb.select which is reset to makeProxy() each beforeEach.
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A, gender: 'MALE' }],
      [{ typeCode: 'ANNUAL', genderRestriction: null, isOneTimePerEmployment: false }],
      // overlap check → throws before balance check is reached
      [{
        id:        'existing-approved',
        startDate: '2026-06-01',
        endDate:   '2026-06-05',
        status:    'APPROVED',
      }],
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await expect(createLeaveRequest(overlapInput)).rejects.toThrow(/existing leave request|same period/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-006: Leave cancellation — APPROVED → CANCELLED + balance restored
// ══════════════════════════════════════════════════════════════════════════

describe('LV-006: leave cancellation restores balance', () => {
  const approvedRow = {
    id:            REQUEST_ID,
    personId:      PERSON_1,
    legalEntityId: ENTITY_A,
    absenceTypeId: TYPE_ANN,
    startDate:     '2026-07-01',
    endDate:       '2026-07-05',
    durationDays:  '5',
    status:        'APPROVED',
  }

  it('transitions APPROVED → CANCELLED and emits LEAVE_REQUEST.CANCELLED audit', async () => {
    const queues: unknown[][] = [
      [approvedRow],  // initial fetch
      // balance row with pendingDays=0, takenDays=5 (approved state)
      [{
        id:                 'bal-1',
        openingBalanceDays: '0',
        accruedDays:        '30',
        takenDays:          '5',
        pendingDays:        '0',
        adjustedDays:       '0',
        carriedForwardDays: '0',
        forfeitedDays:      '0',
      }],
    ]
    const tx = makeScopedTx(queues)
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await cancelLeaveRequest({ requestId: REQUEST_ID, reason: 'plans changed' })

    expect(r.status).toBe('CANCELLED')
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'CANCELLED' }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType:  'LEAVE_REQUEST.CANCELLED',
      resourceId: REQUEST_ID,
    }))
  })

  it('cannot cancel an already-CANCELLED request', async () => {
    const queues: unknown[][] = [[{ ...approvedRow, status: 'CANCELLED' }]]
    const tx = makeScopedTx(queues)
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await expect(
      cancelLeaveRequest({ requestId: REQUEST_ID, reason: 'oops' }),
    ).rejects.toThrow(/already.*cancel|cannot be cancelled/i)
  })

  it('pending cancellation releases pendingDays on the balance ledger', async () => {
    const pendingRow = { ...approvedRow, status: 'PENDING' }
    const queues: unknown[][] = [
      [pendingRow],
      [{
        id:                 'bal-2',
        openingBalanceDays: '0',
        accruedDays:        '30',
        takenDays:          '0',
        pendingDays:        '5',
        adjustedDays:       '0',
        carriedForwardDays: '0',
        forfeitedDays:      '0',
      }],
    ]
    const tx = makeScopedTx(queues)
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await cancelLeaveRequest({ requestId: REQUEST_ID, reason: 'no longer needed' })

    // The second setSpy call should update pendingDays to 0 (5 − 5)
    const calls = setSpy.mock.calls.map(c => c[0])
    const balanceUpdate = calls.find((c: Record<string, unknown>) => 'pendingDays' in c)
    expect(balanceUpdate).toBeDefined()
    expect(balanceUpdate?.pendingDays).toBe('0')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-007: Maternity leave — cannot reject (UAE law)
//
// NOTE: No dedicated MATERNITY_CANNOT_REJECT guard exists in the current
// codebase. decideLeaveRequest accepts any REJECT action. The test below
// documents the desired behaviour and is marked skip until the guard is added.
// ══════════════════════════════════════════════════════════════════════════

describe('LV-007: maternity leave rejection (UAE law)', () => {
  it('MATERNITY leave request — REJECT action throws MATERNITY_CANNOT_REJECT', async () => {
    const maternityRow = {
      id:                 REQUEST_ID,
      personId:           PERSON_1,
      legalEntityId:      ENTITY_A,
      absenceTypeId:      TYPE_MAT,
      startDate:          '2026-08-01',
      endDate:            '2026-09-29',
      durationDays:       '60',
      status:             'PENDING',
      workflowInstanceId: 'wf-mat-2',
    }
    // decideLeaveRequest: [0] row fetch, then [1] absenceType fetch (REJECT path only)
    queryQueue = [[maternityRow], [{ typeCode: 'MATERNITY' }]]

    await expect(
      decideLeaveRequest({ requestId: REQUEST_ID, action: 'REJECT', comment: 'denied' }),
    ).rejects.toThrow(/Maternity leave cannot be rejected/i)
  })

  it('decideLeaveRequest APPROVE works for any leave type (smoke test)', async () => {
    const pendingRow = {
      id:                 REQUEST_ID,
      personId:           PERSON_1,
      legalEntityId:      ENTITY_A,
      absenceTypeId:      TYPE_MAT,
      startDate:          '2026-08-01',
      endDate:            '2026-09-29',
      durationDays:       '60',
      status:             'PENDING',
      workflowInstanceId: 'wf-mat-1',
    }
    queryQueue = [[pendingRow]]
    const txQueues: unknown[][] = [[]]  // balance row → none
    const tx = makeScopedTx(txQueues)
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await decideLeaveRequest({ requestId: REQUEST_ID, action: 'APPROVE' })
    expect(r.status).toBe('APPROVED')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-008: Hajj leave — once per employment
//
// NOTE: No isOneTimePerEmployment enforcement exists in createLeaveRequest.
// The test is marked skip until the guard is implemented.
// ══════════════════════════════════════════════════════════════════════════

describe('LV-008: Hajj leave — once per employment', () => {
  it('second HAJJ request for same employee throws ONE_TIME_LEAVE_EXCEEDED', async () => {
    const TYPE_HAJ = '00000000-0000-0000-0000-000000000aa4'
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A, gender: 'MALE' }],
      [{ typeCode: 'HAJJ', genderRestriction: null, isOneTimePerEmployment: true }],
      [],   // overlap: clear
      [],   // balance: no row (Hajj has no tracked balance)
      [{ id: 'prior-hajj-approved' }],  // prior APPROVED Hajj entry found → throw
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const hajjInput = {
      ...baseInput(),
      absenceTypeId: TYPE_HAJ,
      startDate:     '2026-06-05',
      endDate:       '2026-07-04',
      durationDays:  30,
    }
    await expect(createLeaveRequest(hajjInput)).rejects.toThrow(/only be taken once/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-009: Leave balance accrual calculation — pure helpers
// ══════════════════════════════════════════════════════════════════════════

describe('LV-009: leave balance accrual calculation', () => {
  it('12 months at 2.5 days/month accumulates to 30 days annual entitlement', () => {
    let total = 0
    for (let month = 1; month <= 12; month++) {
      total += computeMonthlyAccrualDays(
        { accrualFrequency: 'MONTHLY', isProRated: true, minServiceMonths: 0 },
        30,      // daysEntitled = 30 (UAE standard annual leave)
        month,   // serviceMonths
      )
    }
    // 12 × 2.5 = 30.00 — floating point rounded to 2 dp by the helper.
    expect(Math.round(total * 100) / 100).toBe(30)
  })

  it('computeMonthlyAccrualDays returns 0 when below minServiceMonths floor', () => {
    const days = computeMonthlyAccrualDays(
      { accrualFrequency: 'MONTHLY', isProRated: true, minServiceMonths: 6 },
      30,
      3,  // only 3 months served, below the 6-month floor
    )
    expect(days).toBe(0)
  })

  it('computeMonthlyAccrualDays returns 0 for ANNUALLY frequency (monthly path only)', () => {
    const days = computeMonthlyAccrualDays(
      { accrualFrequency: 'ANNUALLY', isProRated: true, minServiceMonths: 0 },
      30,
      12,
    )
    expect(days).toBe(0)
  })

  it('computeClosingBalance: opening + accrued − taken = correct closing', () => {
    const closing = computeClosingBalance({
      openingBalanceDays: 5,
      accruedDays:        30,
      takenDays:          10,
      pendingDays:        3,
      adjustedDays:       0,
      carriedForwardDays: 2,
      forfeitedDays:      0,
    })
    // 5 + 30 + 2 + 0 − 10 − 3 − 0 = 24
    expect(closing).toBe(24)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-010: Leave request fields validation (Zod schema)
// ══════════════════════════════════════════════════════════════════════════

describe('LV-010: leave request field validation', () => {
  it('missing personId — Zod throws (invalid UUID)', async () => {
    await expect(
      createLeaveRequest({ ...baseInput(), personId: '' }),
    ).rejects.toThrow()
  })

  it('endDate before startDate — Zod throws', async () => {
    await expect(
      createLeaveRequest({ ...baseInput(), startDate: '2026-07-10', endDate: '2026-07-05', durationDays: 1 }),
    ).rejects.toThrow()
  })

  it('durationDays = 0 — Zod throws (must be positive)', async () => {
    await expect(
      createLeaveRequest({ ...baseInput(), durationDays: 0 }),
    ).rejects.toThrow()
  })

  it('negative durationDays — Zod throws', async () => {
    await expect(
      createLeaveRequest({ ...baseInput(), durationDays: -1 }),
    ).rejects.toThrow()
  })

  it('durationDays mismatch with calendar span — BR-AL-002 error', async () => {
    // BR-AL-002 is checked before the tx opens — queues not consumed.
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A }],
      [{ typeCode: 'ANNUAL' }],
      [],
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    // 5-day span (Jul 1–5) but we claim 99 days
    await expect(
      createLeaveRequest({ ...baseInput(), durationDays: 99 }),
    ).rejects.toThrow(/does not match the selected dates/i)
  })

  it('invalid submittedVia value — Zod throws', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createLeaveRequest({ ...baseInput(), submittedVia: 'FAX' as any }),
    ).rejects.toThrow()
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-011: Absence balance read via getLeaveRequest (balanceBeforeDays)
// ══════════════════════════════════════════════════════════════════════════

describe('LV-011: leave request contains balance snapshot', () => {
  it('getLeaveRequest returns balanceBeforeDays and balanceAfterDays from the stored row', async () => {
    const row = {
      e: {
        id:                   REQUEST_ID,
        requestNumber:        'LR-0000001',
        personId:             PERSON_1,
        legalEntityId:        ENTITY_A,
        absenceTypeId:        TYPE_ANN,
        startDate:            '2026-07-01',
        endDate:              '2026-07-05',
        durationDays:         '5',
        isHalfDay:            false,
        halfDayPeriod:        null,
        status:               'APPROVED',
        submittedVia:         'PORTAL',
        submittedBy:          PERSON_1,
        approvedBy:           null,
        rejectionReason:      null,
        workflowInstanceId:   'wf-lc-001',
        createdDate:          new Date(),
        notes:                null,
        approvalDate:         null,
        medicalCertRequired:  false,
        medicalCertUploaded:  false,
        medicalCertDocumentId: null,
        medicalCertDeadline:  null,
        balanceBeforeDays:    '30',
        balanceAfterDays:     '25',
        payDeductionAmount:   null,
        ariaRecommendation:   null,
        ariaConfidenceScore:  null,
        extraData:            {},
      },
      p: { personNumber: 'AVN-000001', fullNameEn: 'Ahmed Ali', fullNameAr: 'أحمد علي' },
      t: { typeCode: 'ANNUAL', nameEn: 'Annual Leave', nameAr: 'الإجازة السنوية' },
    }
    queryQueue = [[row]]

    const detail = await getLeaveRequest(REQUEST_ID)

    expect(detail).not.toBeNull()
    expect(detail?.balanceBeforeDays).toBe('30')
    expect(detail?.balanceAfterDays).toBe('25')
    expect(detail?.status).toBe('APPROVED')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-012: Leave request number format
// ══════════════════════════════════════════════════════════════════════════

describe('LV-012: request number format', () => {
  it('requestNumber follows LR-XXXXXXX pattern (7 zero-padded digits)', async () => {
    // Scoped tx queue order: person → absenceType → overlap → balance → count.
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A, gender: 'MALE' }],
      [{ typeCode: 'ANNUAL', genderRestriction: null, isOneTimePerEmployment: false }],
      [],                                            // overlap check (clear)
      [],                                            // balance check (no row → skip)
      [{ n: 42 }],                                  // nextRequestNumber count → LR-0000043
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createLeaveRequest(baseInput())

    expect(result.requestNumber).toMatch(/^LR-\d{7}$/)
    expect(result.requestNumber).toBe('LR-0000043')
  })

  it('first ever request in an entity produces LR-0000001', async () => {
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A, gender: 'MALE' }],
      [{ typeCode: 'ANNUAL', genderRestriction: null, isOneTimePerEmployment: false }],
      [],
      [],  // balance check (no row → skip)
      [{ n: 0 }],  // count = 0 → next = 1
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createLeaveRequest(baseInput())
    expect(result.requestNumber).toBe('LR-0000001')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-013: DIFC entity — entity-specific entitlement
// ══════════════════════════════════════════════════════════════════════════

describe('LV-013: DIFC entity entitlement', () => {
  it('DIFC entity employee accrues 20 working days annual leave (entity-type rule)', async () => {
    const PERSON_DIFC = '00000000-0000-0000-0000-000000000d01'
    // Stub resolveLeaveRuleSet to return a DIFC-scoped rule (daysEntitled=20).
    const difcRule = {
      ruleSetId:            'rs-difc-001',
      ruleSetCode:          'DIFC-ANNUAL',
      absenceTypeCode:      'ANNUAL',
      entitlementTiers:     [{ minServiceMonths: 0, maxServiceMonths: null, daysEntitled: 20 }],
      maxCarryForwardDays:  5,
      carryForwardExpiryMonths: 6,
      isProRated:           true,
      accrualFrequency:     'MONTHLY' as const,
      minServiceMonths:     0,
      maxDaysPerYear:       20,
      encashmentAllowed:    false,
      encashmentMaxDays:    null,
      source:               'DB' as const,
    }
    vi.mocked(resolveLeaveRuleSet).mockResolvedValueOnce(difcRule)
    vi.mocked(entitlementForService).mockReturnValueOnce(20)

    // DB calls for accrueMonthlyBalance:
    // [0] loadPersonForAccrual → persons, [1] absenceTypes
    queryQueue = [
      [{ id: PERSON_DIFC, legalEntityId: ENTITY_A, hireDate: '2025-01-01',
         nationalityCategory: 'EXPAT', employmentType: 'FULL_TIME' }],
      [{ id: TYPE_ANN, typeCode: 'ANNUAL' }],
    ]
    // tx.select for existing balance → none (first accrual)
    const accrualTx = buildTxMock([{ id: 'bal-difc-new' }])
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(accrualTx))

    const result = await accrueMonthlyBalance(PERSON_DIFC, TYPE_ANN, '2026-05-01')

    // 20 working days / 12 months = 1.67 days/month
    expect(result.skipped).toBeFalsy()
    expect(result.daysAccrued).toBeCloseTo(1.67, 2)
    expect(result.balanceYear).toBe(2026)
  })

  it('createLeaveRequest accepts a DIFC entity leave request (no entity-type gate in action)', async () => {
    // The action itself accepts any legalEntityId — rule enforcement is at accrual time.
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A, gender: 'MALE' }],
      [{ typeCode: 'ANNUAL', genderRestriction: null, isOneTimePerEmployment: false }],
      [],
      [],  // balance check (no row → skip)
      [{ n: 0 }],
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createLeaveRequest(baseInput())
    expect(result.id).toBe(REQUEST_ID)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-014: Paternity leave — gender restriction
// UAE FDL 33/2021 Article 32 — paternity = MALE-only; maternity = FEMALE-only.
// ══════════════════════════════════════════════════════════════════════════

const TYPE_PAT = '00000000-0000-0000-0000-000000000aa5'

const paternityInput = () => ({
  personId:            PERSON_1,
  legalEntityId:       ENTITY_A,
  absenceTypeId:       TYPE_PAT,
  startDate:           '2026-08-10',
  endDate:             '2026-08-14',
  durationDays:        5,
  isHalfDay:           false,
  submittedVia:        'PORTAL' as const,
  notes:               'Paternity leave',
  medicalCertRequired: false,
})

describe('LV-014: paternity leave gender restriction', () => {
  it('female employee applying for paternity leave throws GENDER_RESTRICTION', async () => {
    // absenceType has genderRestriction='MALE'; person.gender='FEMALE' → blocked.
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A, gender: 'FEMALE' }],
      [{ typeCode: 'PATERNITY', genderRestriction: 'MALE', isOneTimePerEmployment: false }],
      // throws before overlap/balance/count are reached
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await expect(createLeaveRequest(paternityInput())).rejects.toThrow(/not available for your employment category/i)
  })

  it('male employee may apply for paternity leave without error', async () => {
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A, gender: 'MALE' }],
      [{ typeCode: 'PATERNITY', genderRestriction: 'MALE', isOneTimePerEmployment: false }],
      [],   // overlap: clear
      [],   // balance: no row
      [{ n: 10 }],
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createLeaveRequest(paternityInput())
    expect(result.id).toBe(REQUEST_ID)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// LV-015: Submit via ARIA_TEXT source
// ══════════════════════════════════════════════════════════════════════════

describe('LV-015: submittedVia ARIA_TEXT is accepted', () => {
  it('createLeaveRequest succeeds with submittedVia=ARIA_TEXT', async () => {
    const ariaInput = { ...baseInput(), submittedVia: 'ARIA_TEXT' as const }
    const tx = makeCreateLeaveRequestTx([
      [{ id: PERSON_1, legalEntityId: ENTITY_A, gender: 'MALE' }],
      [{ typeCode: 'ANNUAL', genderRestriction: null, isOneTimePerEmployment: false }],
      [],
      [],  // balance check (no row → skip)
      [{ n: 5 }],
    ])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createLeaveRequest(ariaInput)

    expect(result.id).toBe(REQUEST_ID)
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ submittedVia: 'ARIA_TEXT' }),
    )
  })

  it('submitLeaveRequest works for a request originally submitted via ARIA_TEXT', async () => {
    const draftRow = {
      id:                  REQUEST_ID,
      personId:            PERSON_1,
      legalEntityId:       ENTITY_A,
      absenceTypeId:       TYPE_ANN,
      startDate:           '2026-07-01',
      endDate:             '2026-07-05',
      durationDays:        '5',
      status:              'DRAFT',
      submittedVia:        'ARIA_TEXT',
      medicalCertRequired: false,
      medicalCertUploaded: false,
    }
    // Two outer db.select calls: absenceEntries row + absenceTypes.typeCode
    queryQueue = [[draftRow], [{ typeCode: 'ANNUAL' }]]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const r = await submitLeaveRequest(REQUEST_ID)
    expect(r.status).toBe('PENDING')
    expect(r.workflowInstanceId).toBe('wf-lc-001')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// Additional: computeRequestDurationDays helper
// ══════════════════════════════════════════════════════════════════════════

describe('computeRequestDurationDays', () => {
  it('returns 0.5 for half-day regardless of date range', () => {
    expect(computeRequestDurationDays('2026-07-01', '2026-07-01', true)).toBe(0.5)
  })

  it('returns 1 for a single-day request', () => {
    expect(computeRequestDurationDays('2026-07-01', '2026-07-01', false)).toBe(1)
  })

  it('returns 5 for 2026-07-01 to 2026-07-05 (inclusive)', () => {
    expect(computeRequestDurationDays('2026-07-01', '2026-07-05', false)).toBe(5)
  })
})
