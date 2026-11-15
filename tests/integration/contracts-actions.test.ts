import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * COV-02 — Integration tests for `terminateContract` and `amendContract`.
 *
 * Fills the 57.8% coverage gap by pinning the riskiest edge cases:
 *
 * terminateContract:
 *   • EXPAT path (BR-VISA-001) — creates OFFBOARDING checklist + VISA_CANCELLATION item
 *   • non-EXPAT path — no checklist created
 *   • already-terminated guard
 *   • cross-entity FORBIDDEN
 *   • NOT_FOUND
 *   • CONTRACT.TERMINATED audit inside tx
 *
 * amendContract:
 *   • BR-CT-002 — amended term may not exceed 3 years from original startDate
 *   • only ACTIVE contracts may be amended
 *   • cross-entity FORBIDDEN
 *   • happy path: closes current (RENEWED) + opens new + CONTRACT.AMENDED audit
 */

// ── Shared queue + spies ───────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex = 0

const insertSpy      = vi.fn()
const valuesSpy      = vi.fn()
const updateSpy      = vi.fn()
const setSpy         = vi.fn()
const auditSpy       = vi.fn()
const txCount        = { value: 0 }

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

// Some inserts use .returning(); others don't.
function makeInsertChain(returnRows: unknown[] = []) {
  return {
    values: vi.fn((payload: unknown) => {
      valuesSpy(payload)
      return { returning: vi.fn(() => Promise.resolve(returnRows)) }
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

let insertReturnOverride: unknown[] | null = null

function buildTx() {
  return {
    select: vi.fn(() => makeProxy()),
    update: vi.fn(() => { updateSpy('called'); return makeUpdateChain() }),
    insert: vi.fn(() => {
      insertSpy('called')
      const ret = insertReturnOverride ?? [{ id: 'new-contract-id' }]
      insertReturnOverride = null
      return makeInsertChain(ret)
    }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select:      vi.fn(() => makeProxy()),
  update:      vi.fn(() => makeUpdateChain()),
  insert:      vi.fn(() => makeInsertChain()),
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    txCount.value++
    return fn(buildTx())
  }),
}

const session = {
  user: {
    id:            '00000000-0000-0000-0000-000000000001',
    name:          'HR Admin',
    role:          'HR_ADMIN',
    legalEntityId: 'entity-1',
  },
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown, tx?: unknown) => { auditSpy(event, tx); return Promise.resolve() }),
  diffFields: () => [],
}))
vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(async (roles: string[]) => {
    if (!roles.includes(session.user.role)) {
      throw new Error(`FORBIDDEN: requires one of [${roles.join(', ')}], got ${session.user.role}`)
    }
    return session.user
  }),
}))
vi.mock('@/lib/permissions', () => ({
  requirePermission: vi.fn(() => Promise.resolve()),
  invalidatePermissionCache: vi.fn(),
}))
vi.mock('@/drizzle/schema', () => ({
  contracts: {
    id: {}, tenantId: {}, personId: {}, legalEntityId: {}, contractNumber: {},
    contractType: {}, employmentType: {}, startDate: {}, endDate: {},
    probationStart: {}, probationEnd: {}, noticePeriodDays: {}, workingHoursPerWeek: {},
    workLocation: {}, contractDocumentId: {}, renewalCount: {}, previousContractId: {},
    status: {}, terminationDate: {}, terminationReason: {}, notes: {}, extraData: {},
    createdBy: {}, createdByName: {}, updatedBy: {}, updatedByName: {},
    updatedDate: {}, lastUpdatedDate: {},
  },
  persons: {
    id: {}, tenantId: {}, legalEntityId: {}, hireDate: {}, nationalityCategory: {},
    assignmentStatus: {}, separationDate: {}, separationReason: {},
    updatedBy: {}, updatedByName: {}, updatedDate: {}, lastUpdatedDate: {},
  },
  workerAssignments: {
    id: {}, tenantId: {}, personId: {}, isCurrent: {}, assignmentStatus: {},
    effectiveEndDate: {}, updatedBy: {}, updatedByName: {}, updatedDate: {}, lastUpdatedDate: {},
  },
  medicalInsuranceEnrolments: {
    id: {}, tenantId: {}, personId: {}, enrolmentStatus: {},
  },
  onboardingChecklists: {
    id: {}, tenantId: {}, personId: {}, legalEntityId: {}, checklistType: {},
    initiatedDate: {}, targetDate: {}, status: {}, completionPct: {},
    createdBy: {}, createdByName: {},
  },
  onboardingChecklistItems: {
    id: {}, tenantId: {}, checklistId: {}, itemCode: {}, itemNameEn: {}, itemNameAr: {},
    category: {}, isMandatory: {}, dueDaysFromStart: {}, assignedToRole: {}, status: {},
    createdBy: {}, createdByName: {},
  },
}))
vi.mock('@/lib/constants', () => ({ TENANT_ID: 'tenant-1' }))
vi.mock('@/lib/effective-date', () => ({
  addDays: (date: string, n: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  },
}))
vi.mock('drizzle-orm', () => ({
  and:  (...a: unknown[]) => a,
  eq:   () => ({}),
  sql:  Object.assign(() => ({}), { raw: () => ({}) }),
}))

const { createContract, terminateContract, amendContract, correctContract } = await import('@/modules/core-hr/contracts/actions')

const CONTRACT_ID = '00000000-0000-0000-0000-000000000011'

const activeContract = {
  id:              CONTRACT_ID,
  personId:        'person-1',
  legalEntityId:   'entity-1',
  contractNumber:  'CTR-0000001',
  contractType:    'FIXED_TERM',
  employmentType:  'FULL_TIME',
  startDate:       '2024-01-01',
  endDate:         '2026-01-01',
  status:          'ACTIVE',
  renewalCount:    0,
  noticePeriodDays: 30,
  workingHoursPerWeek: '48',
  workLocation:    'OFFICE',
  extraData:       {},
  notes:           null,
  contractDocumentId: null,
  probationStart:  '2024-01-01',
  probationEnd:    null,
  previousContractId: null,
}

beforeEach(() => {
  queryQueue    = []
  callIndex     = 0
  txCount.value = 0
  insertReturnOverride = null
  vi.clearAllMocks()
  session.user.role          = 'HR_ADMIN'
  session.user.legalEntityId = 'entity-1'
})

// ══════════════════════════════════════════════════════════════════════════
// createContract
// ══════════════════════════════════════════════════════════════════════════

const createInput = {
  personId:        '00000000-0000-0000-0000-0000000000a2',
  legalEntityId:   '00000000-0000-0000-0000-00000000e001',
  contractType:    'FIXED_TERM' as const,
  employmentType:  'FULL_TIME' as const,
  startDate:       '2026-01-01',
  endDate:         '2026-12-31',
  noticePeriodDays: 30,
  workingHoursPerWeek: 48,
  workLocation:    'OFFICE' as const,
}

describe('createContract — lifecycle date guards', () => {
  it('rejects a contract startDate before the employee hireDate', async () => {
    session.user.legalEntityId = createInput.legalEntityId
    queryQueue = [[{ id: createInput.personId, legalEntityId: createInput.legalEntityId, hireDate: '2026-02-01' }]]
    await expect(createContract(createInput)).rejects.toThrow(/contract start.*hire date|missing or contain invalid values/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('rejects overlapping ACTIVE contracts for the same person', async () => {
    session.user.legalEntityId = createInput.legalEntityId
    queryQueue = [
      [{ id: createInput.personId, legalEntityId: createInput.legalEntityId, hireDate: '2025-01-01' }],
      [{ id: 'existing-contract-id', contractNumber: 'CTR-0000007' }],
    ]
    await expect(createContract(createInput)).rejects.toThrow(/overlapping contract|already has/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════════════
// terminateContract
// ══════════════════════════════════════════════════════════════════════════

const terminateInput = {
  contractId:        CONTRACT_ID,
  terminationDate:   '2026-05-01',
  terminationReason: 'Resignation',
}

describe('terminateContract — NOT_FOUND', () => {
  it('throws when the contract does not exist', async () => {
    queryQueue = [[]] // empty SELECT
    await expect(terminateContract(terminateInput)).rejects.toThrow(/contract record could not be found/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe('terminateContract — guard rails', () => {
  it('rejects an already-terminated contract', async () => {
    queryQueue = [[{ ...activeContract, status: 'TERMINATED' }]]
    await expect(terminateContract(terminateInput)).rejects.toThrow(/already been terminated/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects cross-entity termination for non-SUPER_ADMIN', async () => {
    session.user.legalEntityId = 'different-entity'
    queryQueue = [[activeContract]]
    await expect(terminateContract(terminateInput)).rejects.toThrow(/do not have permission|You can only/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects termination before the contract startDate', async () => {
    queryQueue = [[{ ...activeContract, startDate: '2026-06-01' }]]
    await expect(terminateContract({ ...terminateInput, terminationDate: '2026-05-01' }))
      .rejects.toThrow(/termination.*start date|missing or contain invalid values/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('SUPER_ADMIN can terminate across entities', async () => {
    session.user.role          = 'SUPER_ADMIN'
    session.user.legalEntityId = 'different-entity'
    queryQueue = [
      [activeContract],                       // contracts SELECT
      [],                                     // workerAssignments — none active (skip update)
      [],                                     // medicalInsuranceEnrolments — none active (skip cancel)
      [{ nationalityCategory: 'LOCAL' }],     // persons nationalityCategory
    ]
    const result = await terminateContract(terminateInput)
    expect(result.id).toBe(CONTRACT_ID)
  })
})

describe('terminateContract — audit trail', () => {
  it('writes CONTRACT.TERMINATED audit inside the tx', async () => {
    queryQueue = [
      [activeContract],
      [],                                 // workerAssignments — none active
      [],                                 // medicalInsuranceEnrolments — none active
      [{ nationalityCategory: 'LOCAL' }],
    ]
    await terminateContract(terminateInput)

    expect(auditSpy).toHaveBeenCalledOnce()
    const [event, tx] = auditSpy.mock.calls[0]
    expect((event as { eventType: string }).eventType).toBe('CONTRACT.TERMINATED')
    expect((event as { resourceType: string }).resourceType).toBe('contracts')
    expect((event as { resourceId: string }).resourceId).toBe(CONTRACT_ID)
    expect(tx).toBeDefined()
  })
})

describe('terminateContract — non-EXPAT path (BR-VISA-001)', () => {
  it('creates OFFBOARDING checklist for LOCAL nationals WITHOUT VISA_CANCELLATION item', async () => {
    // P2-3 / BR-OFFB-001: checklist is ALWAYS created for ALL departing employees.
    // BR-VISA-001: VISA_CANCELLATION item is added only for EXPATs.
    queryQueue = [
      [activeContract],
      [],                                 // workerAssignments — none active
      [],                                 // medicalInsuranceEnrolments — none active
      [{ nationalityCategory: 'LOCAL' }],
    ]
    await terminateContract(terminateInput)

    // Two inserts: onboarding_checklist + onboarding_checklist_items (same as EXPAT)
    expect(insertSpy).toHaveBeenCalledTimes(2)

    // The items array must NOT contain VISA_CANCELLATION
    const itemsPayload = valuesSpy.mock.calls[1][0] as Array<Record<string, unknown>>
    expect(Array.isArray(itemsPayload)).toBe(true)
    expect(itemsPayload.some(i => i.itemCode === 'VISA_CANCELLATION')).toBe(false)
  })
})

describe('terminateContract — EXPAT path (BR-VISA-001)', () => {
  it('creates OFFBOARDING checklist + VISA_CANCELLATION item for EXPAT employees', async () => {
    // insertReturnOverride for the checklist insert
    insertReturnOverride = [{ id: 'checklist-1' }]
    queryQueue = [
      [activeContract],
      [],                                 // workerAssignments — none active
      [],                                 // medicalInsuranceEnrolments — none active
      [{ nationalityCategory: 'EXPAT' }],
    ]
    await terminateContract(terminateInput)

    // Two inserts: onboarding_checklist + onboarding_checklist_items array
    expect(insertSpy).toHaveBeenCalledTimes(2)

    const checklistPayload = valuesSpy.mock.calls[0][0] as Record<string, unknown>
    expect(checklistPayload.checklistType).toBe('OFFBOARDING')
    expect(checklistPayload.targetDate).toBe(terminateInput.terminationDate)

    // .values() receives an array of items — find VISA_CANCELLATION in the batch
    const itemsPayload = valuesSpy.mock.calls[1][0] as Array<Record<string, unknown>>
    const visaItem = itemsPayload.find(i => i.itemCode === 'VISA_CANCELLATION')
    expect(visaItem).toBeDefined()
    expect(visaItem?.isMandatory).toBe(true)
    expect(visaItem?.assignedToRole).toBe('HR_ADMIN')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// amendContract
// ══════════════════════════════════════════════════════════════════════════

const amendInput = {
  contractId:    CONTRACT_ID,
  effectiveDate: '2026-06-01',
  reason:        'Promotion to Senior Engineer',
  newEndDate:    '2026-12-31', // within 3 years from startDate 2024-01-01
}

describe('amendContract — NOT_FOUND', () => {
  it('throws when the contract does not exist', async () => {
    queryQueue = [[]]
    await expect(amendContract(amendInput)).rejects.toThrow(/contract record could not be found/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe('amendContract — guard rails', () => {
  it('rejects amendment of a non-ACTIVE contract', async () => {
    queryQueue = [[{ ...activeContract, status: 'TERMINATED' }]]
    await expect(amendContract(amendInput)).rejects.toThrow(/Only active contracts can be amended/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects cross-entity amendment for non-SUPER_ADMIN', async () => {
    session.user.legalEntityId = 'different-entity'
    queryQueue = [[activeContract]]
    await expect(amendContract(amendInput)).rejects.toThrow(/do not have permission|You can only/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('BR-CT-002: rejects amended term that exceeds 3 years from original startDate', async () => {
    // Original startDate is 2024-01-01. Amended endDate of 2027-06-01 > 2027-01-01 = 3yr limit.
    queryQueue = [[{ ...activeContract, startDate: '2024-01-01' }]]
    await expect(amendContract({ ...amendInput, newEndDate: '2027-06-01' }))
      .rejects.toThrow(/exceed.*three years|amended contract end date/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects amendment effectiveDate on or before the current contract startDate', async () => {
    queryQueue = [[{ ...activeContract, startDate: '2024-01-01' }]]
    await expect(amendContract({ ...amendInput, effectiveDate: '2024-01-01' }))
      .rejects.toThrow(/effective.*after.*start/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects amended endDate on or before the amendment effectiveDate', async () => {
    queryQueue = [[activeContract]]
    await expect(amendContract({ ...amendInput, effectiveDate: '2026-06-01', newEndDate: '2026-06-01' }))
      .rejects.toThrow(/end.*after.*effective/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('BR-CT-002: allows amended term exactly at the 3-year boundary', async () => {
    // startDate 2024-01-01, newEndDate 2026-12-31 — within the 3yr cap.
    queryQueue = [
      [activeContract],                    // current contract SELECT
      [{ n: 1 }],                          // nextContractNumber COUNT
    ]
    const result = await amendContract({ ...amendInput, newEndDate: '2026-12-31' })
    expect(result.closedId).toBe(CONTRACT_ID)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// correctContract
// ══════════════════════════════════════════════════════════════════════════

describe('correctContract — lifecycle date guards', () => {
  beforeEach(() => {
    session.user.role = 'HR_DIRECTOR'
  })

  it('rejects corrected endDate before startDate', async () => {
    queryQueue = [[activeContract]]
    await expect(correctContract({
      contractId:     CONTRACT_ID,
      correctionNote: 'Correct bad dates',
      endDate:        '2023-12-31',
    })).rejects.toThrow(/end.*after.*start|missing or contain invalid values/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects corrected dates that overlap another active contract', async () => {
    queryQueue = [
      [activeContract],
      [{ id: 'other-contract-id', contractNumber: 'CTR-0000009' }],
    ]
    await expect(correctContract({
      contractId:     CONTRACT_ID,
      correctionNote: 'Correct date',
      startDate:      '2025-01-01',
    })).rejects.toThrow(/overlapping contract|already has/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe('amendContract — happy path', () => {
  it('closes current (RENEWED) + opens new contract + writes CONTRACT.AMENDED audit inside tx', async () => {
    queryQueue = [
      [activeContract],   // current contract SELECT
      [{ n: 2 }],         // nextContractNumber COUNT
    ]
    const result = await amendContract(amendInput)

    // closed contract update
    expect(updateSpy).toHaveBeenCalled()
    const closePatch = setSpy.mock.calls[0][0] as Record<string, unknown>
    expect(closePatch.status).toBe('RENEWED')
    expect(closePatch.terminationReason).toContain('Amended')

    // new contract insert
    expect(insertSpy).toHaveBeenCalledOnce()
    const newRow = valuesSpy.mock.calls[0][0] as Record<string, unknown>
    expect(newRow.status).toBe('ACTIVE')
    expect(newRow.renewalCount).toBe(1)
    expect(newRow.previousContractId).toBe(CONTRACT_ID)
    expect(newRow.probationEnd).toBeNull()  // BR-PR-003: no new probation on renewal

    expect(result.closedId).toBe(CONTRACT_ID)

    // Hard Rule 1: audit inside tx
    expect(auditSpy).toHaveBeenCalledOnce()
    const [event, tx] = auditSpy.mock.calls[0]
    expect((event as { eventType: string }).eventType).toBe('CONTRACT.AMENDED')
    expect((event as { resourceType: string }).resourceType).toBe('contracts')
    expect(tx).toBeDefined()
  })
})
