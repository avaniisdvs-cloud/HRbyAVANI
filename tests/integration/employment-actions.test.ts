import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * S4-Q7 — Integration tests for the employment-action lifecycle Server Actions.
 *
 * Covers `transfer` / `promotion` / `gradeChange` for:
 *   • role gate (HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN only)
 *   • Zod parse — required fields, UUID format, reason length
 *   • entity-scope (QA-Audit-C2) — cross-entity blocked for non-SUPER_ADMIN
 *   • runLifecycleChange end-to-end: closes current assignment, opens new,
 *     records employment_action, syncs persons.* pointers, recomputes
 *     BR-NP-001 notice period, writes audit row in same tx
 *   • runGradeChange classifies upward / downward grade moves correctly
 */

// ── Shared queue + spies ───────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex   = 0

const insertSpy   = vi.fn()
const valuesSpy   = vi.fn()
const updateSpy   = vi.fn()
const setSpy      = vi.fn()
const auditSpy    = vi.fn()
const createAssignmentTxSpy = vi.fn()
const changeAssignmentTxSpy = vi.fn()

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
        returning: vi.fn(() => Promise.resolve(returnRows)),
      }
    }),
  }
}

function makeUpdateChain() {
  return {
    set: vi.fn((payload: unknown) => {
      setSpy(payload)
      return {
        where: vi.fn(() => Promise.resolve()),
      }
    }),
  }
}

function buildTxMock(insertReturn: unknown[]) {
  return {
    select: vi.fn(() => makeProxy()),
    insert: vi.fn(() => { insertSpy('called'); return makeInsertChain(insertReturn) }),
    update: vi.fn(() => { updateSpy('called'); return makeUpdateChain() }),
  }
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
    id: '00000000-0000-0000-0000-0000000000c3',
    name: 'HR Admin',
    role: 'HR_ADMIN',
    legalEntityId: '00000000-0000-0000-0000-0000000000a1',
    personId: '00000000-0000-0000-0000-0000000000d4',
  },
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown, _tx?: unknown) => { auditSpy(event); return Promise.resolve() }),
  diffFields: () => [],
}))
vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn((roles: string[]) => {
    if (!roles.includes(session.user.role)) {
      throw new Error(`FORBIDDEN: requires one of ${roles.join(', ')}`)
    }
    return Promise.resolve(session.user)
  }),
}))
vi.mock('@/lib/permissions', () => ({
  requirePermission: vi.fn(() => Promise.resolve()),
  invalidatePermissionCache: vi.fn(),
}))
vi.mock('@/lib/effective-date', () => ({
  isFutureDated: (effectiveDate: string) => effectiveDate > '2026-06-10',
  yearsOfService: (hire: string, now: string) => {
    const h = new Date(hire), n = new Date(now)
    return (n.getTime() - h.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  },
}))
// Mock the worker-assignments services so the lifecycle test focuses on the
// employment-action layer (close-current+open-new + audit) without the
// secondary tx machinery being under test here.
vi.mock('@/modules/core-hr/worker-assignments/services', () => ({
  createAssignmentTx: vi.fn(async (_tx: unknown, _actor: unknown, input: unknown) => {
    createAssignmentTxSpy(input)
    return { id: '00000000-0000-0000-0000-000000000aa1' }
  }),
  changeAssignmentTx: vi.fn(async (_tx: unknown, _actor: unknown, input: { personId: string; mode?: 'UPDATE' | 'FUTURE_DATED' }) => {
    changeAssignmentTxSpy(input)
    if (input.mode === 'FUTURE_DATED') {
      return {
        mode: 'FUTURE_DATED' as const,
        futureId: '00000000-0000-0000-0000-000000000af1',
        futureAssignmentNumber: 'WA-0000003',
        current: {
          id:               '00000000-0000-0000-0000-000000000ab0',
          personId:         input.personId,
          departmentId:     '00000000-0000-0000-0000-000000000a07',
          positionId:       '00000000-0000-0000-0000-000000000a03',
          gradeId:          '00000000-0000-0000-0000-000000000a01',
          locationId:       '00000000-0000-0000-0000-000000000a05',
          lineManagerId:    '00000000-0000-0000-0000-000000000a06',
          employmentType:   'FULL_TIME',
          assignmentStatus: 'ACTIVE',
        },
      }
    }
    return {
      // mode discriminator required by ChangeAssignmentTxResult union type.
      mode:  'UPDATE' as const,
      closedId: '00000000-0000-0000-0000-000000000ab0',
      newId: '00000000-0000-0000-0000-000000000aa2',
      newAssignmentNumber: 'WA-0000002',
      current: {
        id:               '00000000-0000-0000-0000-000000000ab0',
        personId:         input.personId,
        departmentId:     '00000000-0000-0000-0000-000000000a07',
        positionId:       '00000000-0000-0000-0000-000000000a03',
        gradeId:          '00000000-0000-0000-0000-000000000a01',
        locationId:       '00000000-0000-0000-0000-000000000a05',
        lineManagerId:    '00000000-0000-0000-0000-000000000a06',
        employmentType:   'FULL_TIME',
        assignmentStatus: 'ACTIVE',
      },
    }
  }),
  findCurrentAssignmentTx:  vi.fn(),
  nextAssignmentNumberTx:   vi.fn(),
}))

vi.mock('@/drizzle/schema', () => ({
  persons:               { id: {}, tenantId: {}, hireDate: {} },
  workerAssignments:     { id: {}, tenantId: {}, personId: {}, isCurrent: {} },
  employmentActions:     {},
  grades:                { id: {}, gradeLevel: {} },
}))
vi.mock('drizzle-orm', () => ({
  eq:  () => ({}),
  and: (...a: unknown[]) => a,
}))

const {
  transfer, promotion, gradeChange, hire,
} = await import('@/modules/core-hr/employment-actions/actions')

// ─────────────────────────────────────────────────────────────────────────────

const PERSON_ID = '00000000-0000-0000-0000-000000000700'
const ENTITY_ID = '00000000-0000-0000-0000-0000000000a1'
const personRow = {
  id:                  PERSON_ID,
  tenantId:            'tenant-1',
  legalEntityId:       ENTITY_ID,
  hireDate:            '2020-01-01', // ~6.3 years ago at 2026-04-28 → BR-NP-001 60-day band
  currentDepartmentId: '00000000-0000-0000-0000-000000000a07',
  currentPositionId:   '00000000-0000-0000-0000-000000000a03',
  currentJobId:        '00000000-0000-0000-0000-000000000a04',
  currentLocationId:   '00000000-0000-0000-0000-000000000a05',
  currentGradeId:      '00000000-0000-0000-0000-000000000a01',
  lineManagerId:       '00000000-0000-0000-0000-000000000a06',
}

beforeEach(() => {
  queryQueue = []
  callIndex  = 0
  vi.clearAllMocks()
  insertSpy.mockClear()
  valuesSpy.mockClear()
  updateSpy.mockClear()
  setSpy.mockClear()
  auditSpy.mockClear()
  createAssignmentTxSpy.mockClear()
  changeAssignmentTxSpy.mockClear()
  session.user.role = 'HR_ADMIN'
  session.user.legalEntityId = ENTITY_ID
  mockDb.select.mockImplementation(() => makeProxy())
  mockDb.insert.mockImplementation(() => makeInsertChain([]))
  mockDb.update.mockImplementation(() => makeUpdateChain())
})

// ─────────────────────────────────────────────────────────────────────────────
// transfer
// ─────────────────────────────────────────────────────────────────────────────

describe('transfer', () => {
  it('throws FORBIDDEN for EMPLOYEE', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(transfer({
      personId:        PERSON_ID,
      effectiveDate:   '2026-05-01',
      reasonText:      'Move to Finance',
      newDepartmentId: '00000000-0000-0000-0000-000000000a08',
    })).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('rejects malformed input via Zod (reasonText required)', async () => {
    await expect(transfer({
      personId:        PERSON_ID,
      effectiveDate:   '2026-05-01',
      reasonText:      '',
      newDepartmentId: '00000000-0000-0000-0000-000000000a08',
    })).rejects.toThrow()
  })

  it('rejects non-UUID newDepartmentId', async () => {
    await expect(transfer({
      personId:        PERSON_ID,
      effectiveDate:   '2026-05-01',
      reasonText:      'Move',
      newDepartmentId: 'not-a-uuid',
    })).rejects.toThrow()
  })

  it('blocks cross-entity transfer for non-SUPER_ADMIN', async () => {
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000b2'
    const tx = buildTxMock([])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([personRow]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await expect(transfer({
      personId:        PERSON_ID,
      effectiveDate:   '2026-05-01',
      reasonText:      'Move',
      newDepartmentId: '00000000-0000-0000-0000-000000000a08',
    })).rejects.toThrow(/do not have permission/i)
  })

  it('happy path: closes-current + records TRANSFER + recomputes BR-NP-001 notice + writes audit', async () => {
    const tx = buildTxMock([{ id: 'employment-action-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([personRow]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await transfer({
      personId:        PERSON_ID,
      effectiveDate:   '2026-05-01',
      reasonText:      'Department restructure',
      newDepartmentId: '00000000-0000-0000-0000-000000000a08',
    })

    expect(result.assignmentId).toBe('00000000-0000-0000-0000-000000000aa2')
    expect(result.actionId).toBe('employment-action-1')
    expect(changeAssignmentTxSpy).toHaveBeenCalledWith(expect.objectContaining({
      personId:     PERSON_ID,
      actionType:   'TRANSFER',
      departmentId: '00000000-0000-0000-0000-000000000a08',
      mode:         'UPDATE',
    }))
    // Persons sync — line manager / dept / etc. get re-stamped, plus
    // BR-NP-001 noticePeriodDays. ~6.3y service → 60 days.
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
      noticePeriodDays: 60,
      currentDepartmentId: '00000000-0000-0000-0000-000000000a08',
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType:    'EMPLOYMENT_ACTION.TRANSFER',
      resourceType: 'employment_actions',
      resourceId:   'employment-action-1',
    }))
  })

  it('future-dated transfer creates a pending assignment and does not sync current person pointers', async () => {
    const tx = buildTxMock([{ id: 'employment-action-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([personRow]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await transfer({
      personId:        PERSON_ID,
      effectiveDate:   '2026-07-15',
      reasonText:      'Future department move',
      newDepartmentId: '00000000-0000-0000-0000-000000000a08',
    })

    expect(result.assignmentId).toBe('00000000-0000-0000-0000-000000000af1')
    expect(result.actionId).toBe('employment-action-1')
    expect(changeAssignmentTxSpy).toHaveBeenCalledWith(expect.objectContaining({
      personId:     PERSON_ID,
      actionType:   'TRANSFER',
      departmentId: '00000000-0000-0000-0000-000000000a08',
      mode:         'FUTURE_DATED',
    }))
    expect(setSpy).not.toHaveBeenCalled()
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'EMPLOYMENT_ACTION.TRANSFER',
      metadata:  expect.objectContaining({
        assignmentMode:        'FUTURE_DATED',
        personPointersUpdated: false,
      }),
    }))
  })

  it('BR-NP-001: ≥10y service yields 90-day notice', async () => {
    const veteran = { ...personRow, hireDate: '2010-01-01' }
    const tx = buildTxMock([{ id: 'employment-action-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([veteran]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await transfer({
      personId:        PERSON_ID,
      effectiveDate:   '2026-05-01',
      reasonText:      'Move',
      newDepartmentId: '00000000-0000-0000-0000-000000000a08',
    })

    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ noticePeriodDays: 90 }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// promotion
// ─────────────────────────────────────────────────────────────────────────────

describe('promotion', () => {
  it('throws FORBIDDEN for MANAGER', async () => {
    session.user.role = 'MANAGER'
    // promotion → runGradeChange first reads current assignment grade outside
    // the tx, then runLifecycleChange enforces the role gate. Seed enough
    // queue entries to clear the pre-flight reads so the FORBIDDEN comes
    // from the auth check, not from "no current assignment".
    queryQueue = [
      [{ gradeId: '00000000-0000-0000-0000-000000000a01' }],
      [{ level: 3 }],
      [{ level: 5 }],
    ]
    await expect(promotion({
      personId:      PERSON_ID,
      effectiveDate: '2026-05-01',
      reasonText:    'Q1 cycle',
      newGradeId:    '00000000-0000-0000-0000-000000000a02',
    })).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('rejects when newGradeId missing (Zod)', async () => {
    await expect(promotion({
      personId:      PERSON_ID,
      effectiveDate: '2026-05-01',
      reasonText:    'Q1 cycle',
      // newGradeId intentionally omitted — Zod marks required
    } as never)).rejects.toThrow()
  })

  it('happy path: writes PROMOTION action + opens new assignment', async () => {
    // runGradeChange first reads current assignment grade + new grade.
    queryQueue = [
      [{ gradeId: '00000000-0000-0000-0000-000000000a01' }], // current assignment grade
      [{ level: 3 }], // old grade level
      [{ level: 5 }], // new grade level (higher → PROMOTION)
    ]
    const tx = buildTxMock([{ id: 'employment-action-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([personRow]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await promotion({
      personId:      PERSON_ID,
      effectiveDate: '2026-05-01',
      reasonText:    'Calibration outcome',
      newGradeId:    '00000000-0000-0000-0000-000000000a02',
    })

    expect(result.assignmentId).toBe('00000000-0000-0000-0000-000000000aa2')
    expect(changeAssignmentTxSpy).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'PROMOTION',
      gradeId:    '00000000-0000-0000-0000-000000000a02',
      mode:       'UPDATE',
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'EMPLOYMENT_ACTION.PROMOTION',
    }))
  })

  it('future-dated promotion uses FUTURE_DATED assignment mode', async () => {
    queryQueue = [
      [{ gradeId: '00000000-0000-0000-0000-000000000a01' }],
      [{ level: 3 }],
      [{ level: 5 }],
    ]
    const tx = buildTxMock([{ id: 'employment-action-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([personRow]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await promotion({
      personId:      PERSON_ID,
      effectiveDate: '2026-07-15',
      reasonText:    'Future calibration outcome',
      newGradeId:    '00000000-0000-0000-0000-000000000a02',
    })

    expect(changeAssignmentTxSpy).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'PROMOTION',
      gradeId:    '00000000-0000-0000-0000-000000000a02',
      mode:       'FUTURE_DATED',
    }))
    expect(setSpy).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// gradeChange (auto PROMOTION vs DEMOTION classification)
// ─────────────────────────────────────────────────────────────────────────────

describe('gradeChange — classification', () => {
  it('classifies upward grade move as PROMOTION', async () => {
    queryQueue = [
      [{ gradeId: '00000000-0000-0000-0000-000000000a01' }],
      [{ level: 2 }], // old
      [{ level: 4 }], // new — higher
    ]
    const tx = buildTxMock([{ id: 'employment-action-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([personRow]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await gradeChange({
      personId:      PERSON_ID,
      effectiveDate: '2026-05-01',
      reasonText:    'Move',
      newGradeId:    '00000000-0000-0000-0000-000000000a02',
    })

    expect(changeAssignmentTxSpy).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'PROMOTION', mode: 'UPDATE' }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'EMPLOYMENT_ACTION.PROMOTION' }))
  })

  it('classifies downward grade move as DEMOTION', async () => {
    queryQueue = [
      [{ gradeId: '00000000-0000-0000-0000-000000000a01' }],
      [{ level: 5 }], // old
      [{ level: 3 }], // new — lower → DEMOTION
    ]
    const tx = buildTxMock([{ id: 'employment-action-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([personRow]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await gradeChange({
      personId:      PERSON_ID,
      effectiveDate: '2026-05-01',
      reasonText:    'Performance plan outcome',
      newGradeId:    '00000000-0000-0000-0000-000000000a02',
    })

    expect(changeAssignmentTxSpy).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'DEMOTION', mode: 'UPDATE' }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'EMPLOYMENT_ACTION.DEMOTION' }))
  })

  it('future-dated grade change uses FUTURE_DATED assignment mode', async () => {
    queryQueue = [
      [{ gradeId: '00000000-0000-0000-0000-000000000a01' }],
      [{ level: 2 }],
      [{ level: 4 }],
    ]
    const tx = buildTxMock([{ id: 'employment-action-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([personRow]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await gradeChange({
      personId:      PERSON_ID,
      effectiveDate: '2026-07-15',
      reasonText:    'Future grade move',
      newGradeId:    '00000000-0000-0000-0000-000000000a02',
    })

    expect(changeAssignmentTxSpy).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'PROMOTION',
      gradeId:    '00000000-0000-0000-0000-000000000a02',
      mode:       'FUTURE_DATED',
    }))
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('throws when person has no current assignment', async () => {
    queryQueue = [[]] // findCurrentAssignment empty
    await expect(gradeChange({
      personId:      PERSON_ID,
      effectiveDate: '2026-05-01',
      reasonText:    'Move',
      newGradeId:    '00000000-0000-0000-0000-000000000a02',
    })).rejects.toThrow(/does not have an active position/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// hire (covered briefly to confirm single-tx contract — QA-Audit-C3)
// ─────────────────────────────────────────────────────────────────────────────

describe('hire', () => {
  it('happy path: createAssignmentTx + employment_action + persons sync + audit in single tx', async () => {
    const tx = buildTxMock([{ id: 'employment-action-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([personRow]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await hire({
      personId:           PERSON_ID,
      legalEntityId:      ENTITY_ID,
      effectiveStartDate: '2026-05-01',
      departmentId:       '00000000-0000-0000-0000-000000000a07',
      employmentType:     'FULL_TIME',
      contractedHoursPerWeek: 48,
    })
    expect(result.assignmentId).toBe('00000000-0000-0000-0000-000000000aa1')
    expect(result.actionId).toBe('employment-action-1')
    expect(createAssignmentTxSpy).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'HIRE',
      personId:   PERSON_ID,
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'EMPLOYMENT_ACTION.HIRE',
    }))
  })
})
