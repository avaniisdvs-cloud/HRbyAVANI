import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

/**
 * Task 9 — PAY Collision Simulation Tests
 * Scenario: Concurrent payroll run creation and lifecycle state-gate collisions
 *
 * Context: Two RISK items are addressed by the payroll module:
 *
 * RISK-PAYROLL-2 — Duplicate run numbers under concurrent createPayrollRun calls.
 *   Pre-fix:  nextRunNumber read MAX(runNumber) without locking. Two concurrent calls
 *             on the same legal entity could both read MAX=0 → both generate PR-000001
 *             → unique constraint violation on the second insert (or silent duplicate
 *             if the constraint was absent).
 *   Post-fix: nextRunNumber now accepts a `tx` parameter and calls
 *             pg_advisory_xact_lock(hashtext('payroll_run:' + legalEntityId)) before
 *             reading MAX. This serialises concurrent createPayrollRun calls; only one
 *             can hold the lock + read MAX at a time.
 *
 * RISK-WF-1 — submitPayrollForApproval calls submitWorkflow BEFORE the db.transaction.
 *   If submitWorkflow throws, the DB transaction is never entered and the run status
 *   remains LOCKED. This is the correct pre-condition guard: workflow failure = no
 *   status advancement.
 *
 * All tests run against mocked @/lib/db — no live database required.
 * Pattern mirrors workflow-engine.test.ts: makeProxy() / queryQueue / callIndex.
 */

// ── Shared query queue + spies ───────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex   = 0

const insertSpy      = vi.fn()
const valuesSpy      = vi.fn()
const updateSpy      = vi.fn()
const setSpy         = vi.fn()
const auditSpy       = vi.fn()
const submitWfSpy    = vi.fn()
const revalidateSpy  = vi.fn()
const executeSpy     = vi.fn()

// Chainable proxy — awaiting resolves with next result off queryQueue.
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

function makeQueuedProxy(rowsQueue: unknown[][]): unknown {
  let localIndex = 0

  function proxy(): unknown {
    return new Proxy({} as Record<string, unknown>, {
      get(_: Record<string, unknown>, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(rowsQueue[localIndex++] ?? []).then(resolve, reject)
        }
        return () => proxy()
      },
    })
  }

  return proxy()
}

function makeInsertChain(returnRows: unknown[] = []) {
  return {
    values: vi.fn((payload: unknown) => {
      valuesSpy(payload)
      insertSpy('called')
      return Object.assign(Promise.resolve(returnRows), {
        returning: vi.fn(() => Promise.resolve(returnRows)),
      })
    }),
  }
}

function makeUpdateChain() {
  return {
    set: vi.fn((payload: unknown) => {
      setSpy(payload)
      updateSpy('called')
      return { where: vi.fn(() => Promise.resolve()) }
    }),
  }
}

function buildTxMock(insertReturn: unknown[] = [], selectReturns?: unknown[][]) {
  const txSelectQueue = selectReturns ? [...selectReturns] : null
  const txSelectProxy = txSelectQueue ? makeQueuedProxy(txSelectQueue) : null
  return {
    select:  vi.fn(() => txSelectProxy ?? makeProxy()),
    insert:  vi.fn(() => makeInsertChain(insertReturn)),
    update:  vi.fn(() => makeUpdateChain()),
    execute: vi.fn((stmt: unknown) => { executeSpy(stmt); return Promise.resolve([]) }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select:      vi.fn(() => makeProxy()),
  insert:      vi.fn(() => makeInsertChain()),
  update:      vi.fn(() => makeUpdateChain()),
  transaction: vi.fn(),
}

// Mutable actor session — tests can override per-case.
const actorSession = {
  id:            'actor-id',
  personId:      'actor-person-id',
  name:          'Test Actor',
  role:          'PAYROLL_ADMIN' as string,
  legalEntityId: '00000000-0000-0000-0000-0000000000a1',
}

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({ db: mockDb }))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown, tx?: unknown) => {
    auditSpy(event, tx)
    return Promise.resolve()
  }),
  diffFields: () => [],
}))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => Promise.resolve(actorSession)),
  getCurrentUser: vi.fn(() => Promise.resolve(actorSession)),
}))

vi.mock('@/lib/workflow-engine', () => ({
  submitWorkflow: vi.fn((...args: unknown[]) => submitWfSpy(...args)),
}))

vi.mock('@/lib/constants', () => ({
  TENANT_ID:     'test-tenant',
  AVANIIS_TENANT_ID: 'test-tenant',
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn((...args: unknown[]) => revalidateSpy(...args)),
}))

vi.mock('@/drizzle/schema', () => ({
  payrollDefinitions: {
    id: {}, tenantId: {}, legalEntityId: {}, isActive: {}, payrollCode: {},
    payrollNameEn: {}, payrollNameAr: {}, payFrequency: {}, paymentDayOfMonth: {},
    currency: {}, legislativeDataGroup: {}, wpsBankCode: {}, oracleLedgerId: {},
  },
  payrollRuns: {
    id: {}, tenantId: {}, payrollId: {}, legalEntityId: {}, runNumber: {},
    payPeriodStart: {}, payPeriodEnd: {}, paymentDate: {}, runType: {},
    status: {}, wpsDeadline: {}, notes: {}, createdBy: {}, createdByName: {},
    lockedAt: {}, lockedBy: {}, lockReason: {}, financeApprovedBy: {},
    financeApprovalDate: {}, updatedBy: {}, updatedByName: {}, lastUpdatedDate: {},
  },
  payrollResults:     { id: {}, tenantId: {}, payrollRunId: {}, personId: {}, paymentStatus: {} },
  salaryElements:     { id: {}, tenantId: {}, personId: {}, payrollId: {}, effectiveStartDate: {}, effectiveEndDate: {}, elementCode: {}, elementClassification: {} },
  eosbCalculations:   { id: {}, tenantId: {}, personId: {}, legalEntityId: {} },
  persons:            { id: {}, tenantId: {}, legalEntityId: {}, isActive: {}, fullNameEn: {}, fullNameAr: {}, payrollId: {}, assignmentStatus: {}, nationalityCategory: {}, hireDate: {}, basicSalary: {}, employeePremiumAed: {}, employerPremiumAed: {} },
  legalEntities:      { id: {}, tenantId: {}, eosbScheme: {}, wpsEmployerCode: {} },
  wpsSifRecords:      { id: {}, tenantId: {}, payrollRunId: {}, personId: {}, legalEntityId: {} },
  gpssaContributions: { id: {}, tenantId: {}, payrollRunId: {} },
  dewsContributions:  { id: {}, tenantId: {}, payrollRunId: {} },
  // Stubs for any other imports
  notificationLog:    {},
  workflowInstances:  {},
  userAccounts:       {},
}))

vi.mock('drizzle-orm', () => ({
  eq:      () => ({}),
  and:     (...a: unknown[]) => a,
  desc:    () => ({}),
  asc:     () => ({}),
  max:     () => ({}),
  inArray: () => ({}),
  notInArray: () => ({}),
  lt:      () => ({}),
  lte:     () => ({}),
  gte:     () => ({}),
  isNull:  () => ({}),
  or:      (...a: unknown[]) => a,
  sql:     (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  count:   () => ({}),
}))

vi.mock('@/modules/payroll/calculation-engine', () => ({
  calculateEmployeePayroll: vi.fn(() => ({
    personId: 'p1', assignmentId: null,
    basicSalary: 10000, housingAllowance: 0, transportAllowance: 0,
    otherAllowances: 0, overtimePay: 0, bonus: 0,
    totalGrossPay: 10000, sickLeaveDeduction: 0, unpaidLeaveDeduction: 0,
    salaryAdvanceDeduct: 0, gpssaEmployeeDeduct: 0, medicalInsuranceDeduct: 0,
    otherDeductions: 0, totalDeductions: 0, netPay: 10000,
    gpssaEmployerContrib: 0, eosbProvision: 0, medicalInsuranceEr: 0,
    totalEmployerCost: 10000, priorMonthNetPay: null, variancePct: null,
    isVarianceFlagged: false,
  })),
  aggregateRunTotals: vi.fn(() => ({
    employeeCount: 1, totalGrossPay: 10000, totalDeductions: 0,
    totalNetPay: 10000, totalEmployerCost: 10000, totalEosbProvision: 0, totalGpssaEmployer: 0,
  })),
  calculateDewsContribution: vi.fn(),
  computeYtd:                vi.fn(),
  validateWpsRecords:        vi.fn(() => ({ isValid: true, errors: [] })),
}))

vi.mock('@/modules/payroll/services', () => ({
  calculateEosb: vi.fn(() => ({
    serviceYears: 2, dailyRate: 200, eosbFirst5Years: 5000, eosbBeyond5Years: 0,
    eosbBeforeCap: 5000, capAmount: 200000, isCapped: false, eosbFinalAmount: 5000,
  })),
}))

// ── Import SUT after mocks ────────────────────────────────────────────────────

const {
  createPayrollRun,
  lockPayrollRun,
  submitPayrollForApproval,
  approvePayrollRun,
} = await import('@/modules/payroll/actions')

// ── Payroll workstream gate ─────────────────────────────────────────────────
// This suite verifies payroll EXECUTION/collision behaviour, so it must run with
// the workstream ENABLED. Production stays gated-off by default
// (lib/features/payroll-feature-gate.ts). The DB/auth/audit are fully mocked —
// no real payroll runs, no cloud DB writes. Restored after the suite.
const __priorPayrollFlag = process.env.PAYROLL_WORKSTREAM_ENABLED
beforeAll(() => { process.env.PAYROLL_WORKSTREAM_ENABLED = 'true' })
afterAll(() => {
  if (__priorPayrollFlag === undefined) delete process.env.PAYROLL_WORKSTREAM_ENABLED
  else process.env.PAYROLL_WORKSTREAM_ENABLED = __priorPayrollFlag
})

// ── Reset ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  queryQueue = []
  callIndex  = 0
  vi.clearAllMocks()
  insertSpy.mockClear()
  valuesSpy.mockClear()
  updateSpy.mockClear()
  setSpy.mockClear()
  auditSpy.mockClear()
  revalidateSpy.mockClear()
  executeSpy.mockClear()
  actorSession.id = 'actor-id'
  actorSession.personId = 'actor-person-id'
  actorSession.name = 'Test Actor'
  actorSession.role = 'PAYROLL_ADMIN'
  actorSession.legalEntityId = ENTITY_ID
  mockDb.select.mockImplementation(() => makeProxy())
  mockDb.insert.mockImplementation(() => makeInsertChain())
  mockDb.update.mockImplementation(() => makeUpdateChain())
  mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(buildTxMock()))
  submitWfSpy.mockResolvedValue({ success: true, instanceId: 'wf-inst-1' })
})

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ENTITY_ID  = '00000000-0000-0000-0000-0000000000a1'
const PAYROLL_ID = '00000000-0000-0000-0000-000000000de1'
const RUN_ID     = '00000000-0000-0000-0000-00000000a001'

const baseCreateInput = {
  payrollId:      PAYROLL_ID,
  legalEntityId:  ENTITY_ID,
  runType:        'REGULAR' as const,
  payPeriodStart: '2026-05-01',
  payPeriodEnd:   '2026-05-31',
  paymentDate:    '2026-05-28',
}

function payrollDefRow(overrides: Record<string, unknown> = {}) {
  return [{ id: PAYROLL_ID, legalEntityId: ENTITY_ID, isActive: true, ...overrides }]
}

function payrollRunRow(status: string, overrides: Record<string, unknown> = {}) {
  return [{
    id:             RUN_ID,
    tenantId:       'test-tenant',
    payrollId:      PAYROLL_ID,
    legalEntityId:  ENTITY_ID,
    runNumber:      'PR-000001',
    payPeriodStart: '2026-05-01',
    payPeriodEnd:   '2026-05-31',
    paymentDate:    '2026-05-28',
    status,
    ...overrides,
  }]
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAY-001: createPayrollRun happy path
// ═══════════════════════════════════════════════════════════════════════════════

describe('Task 9 — PAY Payroll Collision Simulation', () => {
  describe('Scenario 1: createPayrollRun happy path', () => {
    it('[PAY-001] Happy path — transaction succeeds, payrollRuns.insert called once, audit written, runNumber=PR-000001', async () => {
      /**
       * RISK-PAYROLL-2 (baseline)
       * Pre-fix:  nextRunNumber read MAX without lock — safe in sequential mode.
       * Post-fix: nextRunNumber acquires advisory lock inside tx before reading MAX;
       *           sequential happy path still produces PR-000001 from MAX=0.
       */

      // Outer db.select: payrollDefinitions lookup → found
      queryQueue = [payrollDefRow()]

      // Provide tx that returns MAX=null for the nextRunNumber select
      mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        const tx = buildTxMock([], [
          [{ maxNum: null }], // tx.select #1 = nextRunNumber MAX
          [],                 // tx.select #2 = overlap check
        ])
        return fn(tx)
      })

      const result = await createPayrollRun(baseCreateInput)

      expect(result.success).toBe(true)
      expect(result.message).toContain('PR-000001')
      // insert must have been called (payrollRuns row)
      expect(insertSpy).toHaveBeenCalled()
      // Audit must be written inside the same transaction
      expect(auditSpy).toHaveBeenCalledTimes(1)
      const [auditEvent] = auditSpy.mock.calls[0]
      const e = auditEvent as { eventType: string; resourceType: string }
      expect(e.eventType).toBe('PAYROLL.RUN.CREATE')
      expect(e.resourceType).toBe('payroll_runs')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // PAY-002: RISK-PAYROLL-2 — concurrent createPayrollRun serialisation
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Scenario 2: RISK-PAYROLL-2 — concurrent createPayrollRun calls', () => {
    it('[PAY-002] Advisory lock serialises concurrent calls — first gets PR-000001, second gets PR-000002', async () => {
      /**
       * RISK-PAYROLL-2
       * Pre-fix:  both calls read MAX=0 concurrently → both generate PR-000001 →
       *           unique constraint violation (or silent duplicate).
       * Post-fix: pg_advisory_xact_lock serialises; first call holds lock, reads MAX=0
       *           → PR-000001; second call waits, reads MAX=1 → PR-000002.
       *           Here we mock two sequential transactions returning MAX=0 then MAX=1
       *           to simulate the serialised result.
       */

      // Both calls find the payroll definition
      queryQueue = [payrollDefRow(), payrollDefRow()]

      // First call's transaction: MAX=0 → generates PR-000001
      mockDb.transaction
        .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
          const tx = buildTxMock([], [
            [{ maxNum: null }], // nextRunNumber select returns no prior runs
            [],                 // overlap check returns none
          ])
          return fn(tx)
        })
        // Second call's transaction: MAX=1 → generates PR-000002
        .mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
          const tx = buildTxMock([], [
            [{ maxNum: 'PR-000001' }], // first run now exists
            [],                        // overlap check returns none
          ])
          return fn(tx)
        })

      const [result1, result2] = await Promise.all([
        createPayrollRun(baseCreateInput),
        createPayrollRun(baseCreateInput),
      ])

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      // Both must succeed; messages carry the generated run numbers
      expect(result1.message).toContain('PR-000001')
      expect(result2.message).toContain('PR-000002')
      // advisory lock execute called once per run (inside each tx)
      expect(executeSpy).toHaveBeenCalledTimes(2)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // PAY-003: createPayrollRun — payroll definition not found
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Scenario 3: Missing payroll definition', () => {
    it('[PAY-003] Payroll definition not found — returns success=false with descriptive error', async () => {
      /**
       * Baseline guard: createPayrollRun must reject when the payrollDefinitions
       * lookup returns no rows for the given (payrollId, legalEntityId) pair.
       * This prevents orphaned runs with no associated definition.
       */

      // Outer select: payrollDefinitions lookup → not found
      queryQueue = [[]]

      const result = await createPayrollRun(baseCreateInput)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/payroll definition not found/i)
      // Transaction must not have been entered — no orphan insert
      expect(mockDb.transaction).not.toHaveBeenCalled()
      expect(insertSpy).not.toHaveBeenCalled()
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // PAY-004: lockPayrollRun — status gate: already LOCKED
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Scenario 4: lockPayrollRun — status gate collision', () => {
    it('[PAY-004] Attempt to lock a run already in LOCKED status — returns error, no double-lock', async () => {
      /**
       * RISK-PAYROLL-2 (state gate)
       * Pre-fix:  concurrent lock calls could both pass a CALCULATED status check
       *           then both update to LOCKED (double-lock, no visible error).
       * Post-fix: status gate requires CALCULATED or UNDER_REVIEW; LOCKED is rejected.
       *
       * We simulate the second lock attempt by presenting status=LOCKED to the first
       * (and only) call — same effect as a concurrent call that lost the race.
       */

      // Outer db.select: run lookup → already LOCKED
      queryQueue = [payrollRunRow('LOCKED')]

      const fd = new FormData()
      fd.set('runId', RUN_ID)
      fd.set('lockReason', 'Re-locking attempt')

      const result = await lockPayrollRun(fd)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/cannot lock a run in status: LOCKED/i)
      // No transaction should have been entered
      expect(mockDb.transaction).not.toHaveBeenCalled()
      expect(updateSpy).not.toHaveBeenCalled()
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // PAY-005: submitPayrollForApproval — RISK-WF-1 workflow failure isolation
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Scenario 5: RISK-WF-1 — submitWorkflow failure isolation', () => {
    it('[PAY-005] submitWorkflow throws — db.transaction NOT entered, run status stays LOCKED', async () => {
      /**
       * RISK-WF-1
       * The submitPayrollForApproval action calls submitWorkflow BEFORE entering
       * db.transaction. If submitWorkflow throws, the transaction is never reached,
       * so the run status is never updated from LOCKED → APPROVAL_PENDING.
       * This is the correct ordering: no DB mutation on workflow failure.
       *
       * Pre-fix risk: if the order were reversed (tx first, wf second), a wf failure
       *   would leave the run stuck in APPROVAL_PENDING with no active workflow instance.
       * Post-fix: wf failure = success: false → error thrown → tx never entered.
       */

      // Outer select: run lookup → LOCKED (correct pre-condition)
      queryQueue = [payrollRunRow('LOCKED')]

      // submitWorkflow throws (network error, quota exceeded, etc.)
      submitWfSpy.mockRejectedValueOnce(new Error('Workflow service unavailable'))

      const fd = new FormData()
      fd.set('runId', RUN_ID)

      const result = await submitPayrollForApproval(fd)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/workflow service unavailable/i)

      // submitWorkflow was called once (and failed)
      expect(submitWfSpy).toHaveBeenCalledTimes(1)

      // Critically: db.transaction must NOT have been entered — run stays LOCKED
      expect(mockDb.transaction).not.toHaveBeenCalled()
      expect(updateSpy).not.toHaveBeenCalled()
      expect(setSpy).not.toHaveBeenCalled()
    })

    it('[PAY-005b] submitWorkflow returns success:false — error propagated, tx not entered', async () => {
      /**
       * RISK-WF-1 — variant: submitWorkflow returns a result object with success:false
       * (e.g., no active workflow template found for PAYROLL_RUN_APPROVAL).
       */

      queryQueue = [payrollRunRow('LOCKED')]

      submitWfSpy.mockResolvedValueOnce({ success: false, error: 'No workflow template found' })

      const fd = new FormData()
      fd.set('runId', RUN_ID)

      const result = await submitPayrollForApproval(fd)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/no workflow template found|failed to start/i)
      expect(mockDb.transaction).not.toHaveBeenCalled()
    })
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // PAY-006: approvePayrollRun — concurrent approval collision
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Scenario 6: approvePayrollRun — concurrent approval state gate', () => {
    it('[PAY-006] Second concurrent approval attempt sees APPROVED status — returns error, no double-approve', async () => {
      /**
       * RISK-PAYROLL-2 (state gate on approval)
       * Pre-fix:  two concurrent approvers could both pass status=APPROVAL_PENDING check
       *           then both update to APPROVED — double audit entry, possible double WPS SIF.
       * Post-fix: the second call's SELECT (mocked to return APPROVED) hits the
       *           `status !== 'APPROVAL_PENDING'` guard and returns an error before
       *           entering the transaction.
       *
       * We simulate the losing concurrent call by presenting status=APPROVED to the
       * second call (the first call already committed and changed the status).
       */

      // status=APPROVED (as if the first concurrent approver already committed)
      queryQueue = [payrollRunRow('APPROVED')]

      actorSession.role = 'HR_DIRECTOR'

      const fd = new FormData()
      fd.set('runId', RUN_ID)
      fd.set('note', 'Approved after review')

      const result = await approvePayrollRun(fd)

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/not pending approval/i)

      // No transaction should have been entered — status gate fired pre-tx
      expect(mockDb.transaction).not.toHaveBeenCalled()
      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('[PAY-006b] First approval succeeds — status transitions to APPROVED with audit log', async () => {
      /**
       * RISK-PAYROLL-2 (happy path baseline for approvePayrollRun)
       * The first approver sees APPROVAL_PENDING → succeeds → audit written.
       */

      queryQueue = [payrollRunRow('APPROVAL_PENDING')]

      actorSession.role = 'HR_DIRECTOR'

      mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        const tx = buildTxMock()
        return fn(tx)
      })

      const fd = new FormData()
      fd.set('runId', RUN_ID)
      fd.set('note', 'All checks passed')

      const result = await approvePayrollRun(fd)

      expect(result.success).toBe(true)
      expect(result.message).toMatch(/approved/i)

      // Status update to APPROVED must be in the SET payload
      expect(setSpy).toHaveBeenCalled()
      const setPayload = setSpy.mock.calls[0][0] as Record<string, unknown>
      expect(setPayload.status).toBe('APPROVED')
      expect(setPayload.financeApprovalDate).toBeDefined()

      // Audit must be written inside the same transaction
      expect(auditSpy).toHaveBeenCalledTimes(1)
      const [auditEvent, auditTx] = auditSpy.mock.calls[0]
      const e = auditEvent as { eventType: string; resourceType: string }
      expect(e.eventType).toBe('PAYROLL.RUN.APPROVE')
      expect(e.resourceType).toBe('payroll_runs')
      expect(auditTx).toBeDefined() // Hard Rule HR-1: audit inside tx
    })
  })
})
