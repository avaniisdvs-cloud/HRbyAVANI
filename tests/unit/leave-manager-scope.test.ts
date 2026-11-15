/**
 * ISSUE-002 — MANAGER scope enforcement in listLeaveRequests / getLeaveRequest
 *
 * Verifies that MANAGER callers are restricted to their authorised team scope
 * and cannot read leave data for employees outside their reporting line.
 *
 * Tests:
 *   LMS-001: EMPLOYEE sees only their own leave
 *   LMS-002: MANAGER with team sees only team leave (no personId filter)
 *   LMS-003: MANAGER with no reports sees empty result (not entity-wide)
 *   LMS-004: MANAGER passing non-team personId filter → empty, no DB exposure
 *   LMS-005: MANAGER with no personId account → empty result immediately
 *   LMS-006: HR_ADMIN is not restricted by team scope
 *   LMS-007: getLeaveRequest — MANAGER can view team member's leave
 *   LMS-008: getLeaveRequest — MANAGER blocked from non-team leave
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared spy state ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolveTeamSpy = vi.fn<any, Promise<string[]>>()

// ── Mock user session (set per test) ─────────────────────────────────────────

const mockSession = {
  id:            'user-001',
  name:          'Test User',
  role:          'MANAGER' as string,
  legalEntityId: 'entity-001',
  personId:      'manager-001' as string | undefined,
}

// ── DB query state ────────────────────────────────────────────────────────────

type QueryResult = unknown[]
let queryQueue: QueryResult[] = []
let queryCallIndex = 0
const decisionUpdates: Record<string, unknown>[] = []

function buildChain(returnVal: QueryResult) {
  const chain: Record<string, unknown> = {}
  const handler = () => chainProxy
  const chainProxy: unknown = new Proxy(chain, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: QueryResult) => unknown) =>
          Promise.resolve(returnVal).then(resolve)
      }
      return handler
    },
  })
  return chainProxy
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/leave-person-scope', () => ({
  resolveManagerViewablePersonIds: (managerId: string) => resolveTeamSpy(managerId),
  assertCanRequestLeaveFor: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(() => Promise.resolve(mockSession)),
  getCurrentUser: vi.fn(() => Promise.resolve(mockSession)),
}))

vi.mock('@/lib/db', () => ({
  db: {
    get select() {
      return () => buildChain(queryQueue[queryCallIndex++] ?? [])
    },
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 'new-id' }]) }) }),
    update: () => ({ set: (values: Record<string, unknown>) => { decisionUpdates.push(values); return { where: () => Promise.resolve() } } }),
    execute: vi.fn().mockResolvedValue([]),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      select: () => buildChain([]),
      insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 'tx-id' }]) }) }),
      update: () => ({ set: (values: Record<string, unknown>) => { decisionUpdates.push(values); return { where: () => Promise.resolve() } } }),
      execute: vi.fn().mockResolvedValue([]),
    }),
  },
}))

vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/drizzle/schema', () => ({
  absenceEntries:        { tenantId: {}, legalEntityId: {}, personId: {}, absenceTypeId: {}, status: {}, startDate: {}, endDate: {}, durationDays: {}, createdDate: {}, requestNumber: {} },
  absenceTypes:          { tenantId: {}, id: {}, typeCode: {}, typeNameEn: {}, typeNameAr: {} },
  absenceBalances:       { tenantId: {}, personId: {}, absenceTypeId: {}, balanceYear: {}, id: {} },
  persons:               { tenantId: {}, id: {}, personNumber: {}, fullNameEn: {}, fullNameAr: {}, legalEntityId: {}, isActive: {} },
  leaveRuleSets:         {},
  leaveRuleLines:        {},
  events:                {},
  accommodationRequests: {},
  workerAssignments:     { tenantId: {}, personId: {}, isCurrent: {}, lineManagerId: {} },
  notificationLog:       {},
}))

vi.mock('@/lib/table-sort', () => ({
  buildOrderBy: () => [],
}))

vi.mock('@/lib/absence-cert-policy', () => ({
  getSickLeaveCertThreshold: vi.fn().mockResolvedValue(1),
  isMedicalCertRequired:     vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/effective-date', () => ({
  addDays:   (d: string) => d,
  todayUae:  () => '2026-01-01',
}))

vi.mock('@/lib/app-error', () => ({
  translateError: vi.fn((e: unknown) => { throw e }),
}))

vi.mock('@/modules/config', () => ({
  initiateWorkflow:              vi.fn().mockResolvedValue({ instanceId: 'wf-001' }),
  assertLeaveRuleNotBelowMinimum: vi.fn(),
}))

vi.mock('@/modules/config/guards', () => ({
  assertLeaveRuleNotBelowMinimum: vi.fn(),
}))

vi.mock('@/modules/workflow', () => ({
  getWorkflowStatusForRequest: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/workflow-engine', () => ({
  submitWorkflow:    vi.fn().mockResolvedValue({ success: false }),
  takeWorkflowAction: vi.fn().mockResolvedValue({ success: true, instanceStatus: 'APPROVED' }),
}))

vi.mock('@/modules/absence/services', () => ({
  splitLeaveRangeByCalendarYear: vi.fn().mockReturnValue([]),
  computeRequestDurationDays: vi.fn().mockReturnValue(1),
  rangesOverlap:              vi.fn().mockReturnValue(false),
  computeClosingBalance:      vi.fn().mockReturnValue(10),
}))

vi.mock('drizzle-orm', () => ({
  relations: () => ({}),
  eq:      () => ({}),
  and:     (...a: unknown[]) => ({ _and: a }),
  or:      (...a: unknown[]) => ({ _or: a }),
  gte:     () => ({}),
  lte:     () => ({}),
  ilike:   () => ({}),
  asc:     () => ({}),
  desc:    () => ({}),
  count:   () => ({}),
  sql:     () => ({}),
  inArray: () => ({}),
}))

// ── Import SUT after all mocks ────────────────────────────────────────────────

const { listLeaveRequests, getLeaveRequest } = await import('@/modules/absence/actions')

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLeaveRow(personId = 'person-001') {
  return {
    id:                  'leave-001',
    requestNumber:       'LR-0000001',
    personId,
    legalEntityId:       'entity-001',
    absenceTypeId:       'type-001',
    startDate:           '2026-01-01',
    endDate:             '2026-01-05',
    durationDays:        '5',
    isHalfDay:           false,
    halfDayPeriod:       null,
    status:              'PENDING',
    submittedVia:        'WEB',
    submittedBy:         'user-001',
    approvedBy:          null,
    rejectionReason:     null,
    workflowInstanceId:  null,
    createdDate:         new Date('2026-01-01'),
  }
}

// DB query helpers: [count-row, rows-array] for list; [single-row] for detail
function setupListDb(count: number, rows: unknown[]) {
  queryQueue = [[{ total: count }], rows]
}

function setupDetailDb(row: unknown | null) {
  queryQueue = [row ? [{ e: row, p: { personNumber: 'P001', fullNameEn: 'Test', fullNameAr: 'تيست' }, t: { typeCode: 'ANNUAL', nameEn: 'Annual Leave', nameAr: 'إجازة سنوية' } }] : []]
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  queryQueue       = []
  queryCallIndex   = 0
  mockSession.role     = 'MANAGER'
  mockSession.personId = 'manager-001'
  resolveTeamSpy.mockReset()
  resolveTeamSpy.mockResolvedValue(['report-001', 'report-002'])
})

describe('ISSUE-002 — MANAGER scope enforcement', () => {

  // ── listLeaveRequests ───────────────────────────────────────────────────────

  describe('listLeaveRequests', () => {

    it('LMS-001: EMPLOYEE sees only their own leave (self personId filter, as /absence/my passes)', async () => {
      const SELF_UUID = '00000000-0000-0000-0000-000000000001'
      mockSession.role     = 'EMPLOYEE'
      mockSession.personId = SELF_UUID
      setupListDb(1, [makeLeaveRow(SELF_UUID)])

      // /absence/my always passes personId = self; the self-access path scopes to
      // the caller's own rows via the existing eq() condition with NO team lookup.
      const result = await listLeaveRequests({ personId: SELF_UUID })

      expect(result.total).toBe(1)
      expect(result.rows[0].personId).toBe(SELF_UUID)
      // self-access → resolveManagerViewablePersonIds must NOT be called
      expect(resolveTeamSpy).not.toHaveBeenCalled()
    })

    it('LMS-002: MANAGER with team — team scope applied without personId filter', async () => {
      resolveTeamSpy.mockResolvedValue(['report-001', 'report-002'])
      setupListDb(2, [makeLeaveRow('report-001'), makeLeaveRow('report-002')])

      const result = await listLeaveRequests({})

      expect(resolveTeamSpy).toHaveBeenCalledWith('manager-001')
      expect(result.total).toBe(2)
    })

    it('LMS-003: MANAGER with no reports sees empty result (not entity-wide)', async () => {
      resolveTeamSpy.mockResolvedValue([])  // no reports

      const result = await listLeaveRequests({})

      expect(result.rows).toHaveLength(0)
      expect(result.total).toBe(0)
      // DB should NOT have been queried — early return before any select
      expect(queryCallIndex).toBe(0)
    })

    it('LMS-004: MANAGER passing non-team personId → empty result, no DB exposure', async () => {
      resolveTeamSpy.mockResolvedValue(['00000000-0000-0000-0000-000000000011'])  // only one person in team

      // Pass a different valid UUID that is NOT in the team
      const result = await listLeaveRequests({ personId: '00000000-0000-0000-0000-000000000099' })

      expect(result.rows).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(queryCallIndex).toBe(0)
    })

    it('LMS-005: MANAGER with no personId on account → empty result immediately', async () => {
      mockSession.personId = undefined

      const result = await listLeaveRequests({})

      expect(result.rows).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(resolveTeamSpy).not.toHaveBeenCalled()
      expect(queryCallIndex).toBe(0)
    })

    it('LMS-006: HR_ADMIN is not restricted by team scope', async () => {
      mockSession.role     = 'HR_ADMIN'
      mockSession.personId = 'hr-person-001'
      setupListDb(5, [
        makeLeaveRow('emp-001'), makeLeaveRow('emp-002'),
        makeLeaveRow('emp-003'), makeLeaveRow('emp-004'),
        makeLeaveRow('emp-005'),
      ])

      const result = await listLeaveRequests({})

      expect(resolveTeamSpy).not.toHaveBeenCalled()
      expect(result.total).toBe(5)
    })

  })

  // ── getLeaveRequest ─────────────────────────────────────────────────────────

  describe('getLeaveRequest', () => {

    it('LMS-007: MANAGER can view a team member\'s leave request', async () => {
      resolveTeamSpy.mockResolvedValue(['report-001'])
      setupDetailDb(makeLeaveRow('report-001'))

      const result = await getLeaveRequest('leave-001')

      expect(result).not.toBeNull()
      expect(result!.personId).toBe('report-001')
      expect(resolveTeamSpy).toHaveBeenCalledWith('manager-001')
    })

    it('LMS-008: MANAGER blocked from non-team employee leave request', async () => {
      resolveTeamSpy.mockResolvedValue(['report-001'])  // non-team person is NOT in team
      setupDetailDb(makeLeaveRow('unrelated-employee-999'))

      await expect(getLeaveRequest('leave-001')).rejects.toThrow('FORBIDDEN')
      expect(resolveTeamSpy).toHaveBeenCalledWith('manager-001')
    })

  })

})


it('records the approving employee ID rather than the distinct login account ID', async () => {
  const { decideLeaveRequest } = await import('@/modules/absence/actions')
  const { getWorkflowStatusForRequest } = await import('@/modules/workflow')
  mockSession.personId = 'dddd0001-0000-0000-0000-000000000004'
  mockSession.role = 'MANAGER'
  queryCallIndex = 0
  const requestId = 'f7d2963e-f1c6-41f5-bc6c-57ea23ca4779'
  queryQueue = [{ ...makeLeaveRow(), id: requestId, status: 'PENDING', workflowInstanceId: 'wf-001', startDate: '2026-11-26', endDate: '2026-11-26', durationDays: '1' }].map(row => [row])
  decisionUpdates.length = 0
  vi.mocked(getWorkflowStatusForRequest).mockResolvedValueOnce({ instanceId: 'wf-001', steps: [{ status: 'PENDING', stepInstanceId: 'step-001' }] } as never)
  await decideLeaveRequest({ requestId, action: 'APPROVE' })
  expect(decisionUpdates.find(update => update.status === 'APPROVED')?.approvedBy).toBe(mockSession.personId)
})
