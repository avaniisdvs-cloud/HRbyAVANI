import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * S4-08 — Integration tests for core-hr Server Actions.
 *
 * Covers the contract a Server Action MUST satisfy at the wire boundary:
 *   1. requireRole — auth/RBAC failures throw before any DB work
 *   2. Zod parse  — malformed inputs throw with field-level messages
 *   3. Business-rule guards — BR-xx checks tagged in the action
 *   4. Entity-scope gate (QA-Audit-C2) — cross-entity writes are blocked
 *   5. tx + audit — happy path drives writes through the transaction handle
 *      AND writes an audit row in the same tx
 *
 * Strategy (matches tests/lib/config-resolver.test.ts):
 *   • A Proxy-based mock for `db` lets each test inject the rows the action
 *     reads (queryQueue + makeProxy).
 *   • db.transaction(fn) invokes `fn(tx)` synchronously with `tx` set to the
 *     same proxy + write spies (insert / update). We assert against those
 *     spies for the audit + write contract.
 *   • requireRole / encryption / audit are mocked to identity so the test
 *     reasons about logic, not crypto.
 */

// ── Shared queue + spies ───────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex   = 0

const insertSpy  = vi.fn()
const valuesSpy  = vi.fn()
const returningSpy = vi.fn()
const updateSpy  = vi.fn()
const setSpy     = vi.fn()
const whereSpy   = vi.fn()
const auditSpy   = vi.fn()

function makeProxy(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_: Record<string, unknown>, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(queryQueue[callIndex++] ?? []).then(resolve, reject)
      }
      // Every other method (.from, .where, .orderBy, .limit, .offset, .leftJoin)
      // returns another chainable proxy. The await is the only queue terminal.
      return () => makeProxy()
    },
  })
}

// Insert chain: insert(table).values(payload).returning(spec)
function makeInsertChain(returnRows: unknown[]) {
  const chain = {
    values: vi.fn((payload: unknown) => {
      valuesSpy(payload)
      return {
        returning: vi.fn((spec: unknown) => {
          returningSpy(spec)
          return Promise.resolve(returnRows)
        }),
        // Some inserts (audit) don't .returning — chain resolves directly.
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(returnRows).then(resolve),
      }
    }),
  }
  return chain
}

// Update chain: update(table).set(payload).where(cond) → resolves
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

// Tx + db mock — tx is a fresh proxy + insert/update fns. db.transaction
// invokes its callback with `tx` and resolves with whatever the callback returns.
function buildTxMock(returnRowsForInsert: unknown[]) {
  const tx = {
    select: vi.fn(() => makeProxy()),
    insert: vi.fn((table: unknown) => { insertSpy(table); return makeInsertChain(returnRowsForInsert) }),
    update: vi.fn(() => makeUpdateChain()),
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

// Configurable session — tests flip this before invoking the action.
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
// P3-D2: requirePermission is independently covered by tests/security/permission-resolver.test.ts.
// These integration tests verify createPerson/updatePerson business logic, so the permission
// collaborator is mocked to a resolved no-op (the production wiring is asserted by source-grep
// in the resolver test). requireRole remains the real auth gate under test elsewhere.
vi.mock('@/lib/permissions', () => ({
  requirePermission: vi.fn(() => Promise.resolve()),
  invalidatePermissionCache: vi.fn(),
}))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown) => { auditSpy(event); return Promise.resolve() }),
  diffFields: (a: Record<string, unknown>, b: Record<string, unknown>) =>
    Object.keys({ ...a, ...b }).filter(k => a[k] !== b[k]),
}))
vi.mock('@/lib/encryption', () => ({
  encrypt:         (v: string) => `enc:${v}`,
  encryptNullable: (v: string | undefined | null) => (v ? `enc:${v}` : null),
  decryptNullable: (v: string | null) => (v?.startsWith('enc:') ? v.slice(4) : v),
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
vi.mock('@/drizzle/schema', () => ({
  persons:                    { id: {}, tenantId: {}, legalEntityId: {} },
  legalEntities:              { id: {}, isActive: {} },
  departments:                {},
  jobs:                       {},
  positions:                  {},
  contracts:                  { id: {}, tenantId: {} },
  workerAssignments:          { id: {}, tenantId: {}, personId: {}, isCurrent: {}, projectId: {}, projectAllocationPct: {} },
  projects:                   { id: {}, tenantId: {}, isActive: {}, code: {}, nameEn: {} },
  employmentActions:          {},
  grades:                     { id: {}, gradeLevel: {} },
  personBankDetails:          { id: {}, tenantId: {}, personId: {}, isPrimary: {} },
  personDependents:           { id: {}, tenantId: {}, personId: {} },
  personDocuments:            {},
  // Added for createPerson auto work-schedule assignment (Task 2D)
  workSchedules:              { id: {}, tenantId: {}, legalEntityId: {}, isDefault: {}, isActive: {} },
  workScheduleAssignments:    { id: {}, tenantId: {}, personId: {} },
  // Added for terminateContract path (insurance cancel + offboarding checklist)
  medicalInsuranceEnrolments: { id: {}, tenantId: {}, personId: {}, enrolmentStatus: {} },
  onboardingChecklists:       { id: {} },
  onboardingChecklistItems:   {},
}))
vi.mock('drizzle-orm', () => ({
  eq:     () => ({}),
  and:    (...a: unknown[]) => a,
  ilike:  () => ({}),
  or:     () => ({}),
  sql:    Object.assign(() => ({}), { raw: () => ({}), join: () => ({}) }),
  asc:    () => ({}),
  desc:   () => ({}),
  count:  () => ({}),
  lte:    () => ({}),
  isNull: () => ({}),
  relations: (..._args: unknown[]) => ({}),
}))

// Late-load the actions so the mocks are in place.
const {
  createPerson, getPerson, updatePerson, listPersons,
  updatePersonProject, getPersonCurrentProject,
} = await import('@/modules/core-hr/actions')
const {
  amendContract, terminateContract,
} = await import('@/modules/core-hr/contracts/actions')

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  queryQueue = []
  callIndex  = 0
  vi.clearAllMocks()
  insertSpy.mockClear()
  valuesSpy.mockClear()
  returningSpy.mockClear()
  updateSpy.mockClear()
  setSpy.mockClear()
  whereSpy.mockClear()
  auditSpy.mockClear()
  // Reset session to default HR_ADMIN.
  session.user.id = '00000000-0000-0000-0000-0000000000c3'
  session.user.name = 'HR Admin'
  session.user.role = 'HR_ADMIN'
  session.user.legalEntityId = '00000000-0000-0000-0000-0000000000a1'
  session.user.personId = undefined
  // Default db.select returns empty proxy; tests override via queryQueue.
  mockDb.select.mockImplementation(() => makeProxy())
  mockDb.insert.mockImplementation(() => makeInsertChain([]))
  mockDb.update.mockImplementation(() => makeUpdateChain())
})

// ─────────────────────────────────────────────────────────────────────────────
// createPerson
// ─────────────────────────────────────────────────────────────────────────────

const validCreatePersonInput = () => ({
  firstNameEn: 'Sara',
  lastNameEn:  'Ahmed',
  fullNameAr:  'سارة أحمد',
  dateOfBirth: '1990-05-12',
  gender:      'FEMALE' as const,
  numberOfDependents: 0,
  nationalityCode:     'ARE',
  nationalityCategory: 'UAE_NATIONAL' as const,
  religionConsentGiven: false,
  legalEntityId:       '00000000-0000-0000-0000-0000000000a1',
  employmentType:      'FULL_TIME' as const,
  contractedHoursPerWeek: 48,
  assignmentStatus:    'PENDING_HIRE' as const,
  hireDate:            '2026-04-01',
  noticePeriodDays:    30,
  preferredLanguage:   'en' as const,
  notificationChannel: 'PUSH_AND_EMAIL' as const,
  pdplConsentGiven:     true,
  sensitiveDataConsent: false,
  extraData: {},
})

describe('createPerson', () => {
  it('throws FORBIDDEN when caller is not HR_ADMIN/SUPER_ADMIN', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(createPerson(validCreatePersonInput())).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('rejects malformed input via Zod (BR-EID-001)', async () => {
    const bad = { ...validCreatePersonInput(), emiratesId: '12345' }
    await expect(createPerson(bad)).rejects.toThrow()
  })

  it('rejects probationEndDate beyond 6 months from hire (BR-PR-001)', async () => {
    const bad = {
      ...validCreatePersonInput(),
      hireDate:         '2026-01-01',
      probationEndDate: '2026-12-01',
    }
    await expect(createPerson(bad)).rejects.toThrow(/missing or contain invalid values/i)
  })

  it('rejects UAE_NATIONAL with non-ARE nationalityCode (FR-CH-16)', async () => {
    const bad = { ...validCreatePersonInput(), nationalityCode: 'EGY' }
    await expect(createPerson(bad)).rejects.toThrow()
  })

  it('blocks cross-entity create for non-SUPER_ADMIN', async () => {
    session.user.role = 'HR_ADMIN'
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000b2'
    // Tx callback runs and reads the legalEntities row first.
    queryQueue.push([{ id: '00000000-0000-0000-0000-0000000000a1', isActive: true }]) // entity exists

    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = buildTxMock([{ id: 'persons-new-id' }])
      // Wire tx.select to read from the same queryQueue.
      tx.select.mockImplementation(() => makeProxy())
      return await fn(tx)
    })

    await expect(createPerson(validCreatePersonInput())).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('happy path: writes audit row + returns new person id', async () => {
    // Tx mock that:
    //  - select() → returns the legal-entity row from queryQueue
    //  - select() (count for nextPersonNumber) → returns count row
    //  - insert(...).values(...).returning(...) → returns the inserted person
    queryQueue = [
      [{ id: '00000000-0000-0000-0000-0000000000a1', isActive: true }],   // legal entity exists
      [{ count: 0 }],                              // nextPersonNumber count
    ]
    const tx = buildTxMock([{ id: 'persons-new-id' }])
    tx.select.mockImplementation(() => makeProxy())
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createPerson(validCreatePersonInput())

    expect(result.id).toBe('persons-new-id')
    expect(typeof result.personNumber).toBe('string')
    expect(result.personNumber.length).toBeGreaterThan(0)
    expect(insertSpy).toHaveBeenCalled()
    // Hard Rule 1: audit row must have been written for this create.
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType:    'PERSON.CREATED',
      resourceType: 'persons',
      resourceId:   'persons-new-id',
    }))
  })

  it('encrypts emiratesId before INSERT (Hard Rule 4)', async () => {
    queryQueue = [
      [{ id: '00000000-0000-0000-0000-0000000000a1', isActive: true }],
      [{ count: 0 }],
    ]
    const tx = buildTxMock([{ id: 'persons-new-id' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await createPerson({ ...validCreatePersonInput(), emiratesId: '784-1990-1234567-8' })

    // The values() spy was called with the row payload — emiratesId must be the
    // ciphertext form (mock encrypt prefixes with 'enc:').
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({
      emiratesId: expect.stringMatching(/^enc:784-1990-1234567-8/),
    }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getPerson
// ─────────────────────────────────────────────────────────────────────────────

describe('getPerson', () => {
  const personRow = {
    id: 'persons-1',
    tenantId: 'tenant-1',
    legalEntityId: '00000000-0000-0000-0000-0000000000a1',
    firstNameEn: 'Sara', lastNameEn: 'Ahmed', fullNameEn: 'Sara Ahmed', fullNameAr: 'سارة أحمد',
    dateOfBirth: '1990-05-12', gender: 'FEMALE', maritalStatus: null, numberOfDependents: 0,
    nationalityCode: 'ARE', nationalityCategory: 'UAE_NATIONAL', religion: null, religionConsentGiven: false,
    emiratesId: 'enc:784-1990-1234567-8', emiratesIdExpiry: null,
    passportNumber: null, passportCountry: null, passportIssueDate: null, passportExpiry: null,
    visaNumber: null, visaType: null, visaIssueDate: null, visaExpiry: null, visaStatus: null,
    labourCardNumber: null, labourCardExpiry: null, mohreLabourPermitNumber: null,
    familyBookNumber: null, nafisRegistrationNumber: null,
    employmentType: 'FULL_TIME', contractedHoursPerWeek: 48, assignmentStatus: 'ACTIVE',
    hireDate: '2026-04-01', seniorityDate: '2026-04-01', originalHireDate: '2026-04-01',
    probationEndDate: null, noticePeriodDays: 30,
    currentDepartmentId: null, currentPositionId: null, currentJobId: null,
    currentLocationId: null, currentGradeId: null, lineManagerId: null,
    dottedLineManagerId: null, hrRepresentativeId: null, isActive: true,
    insuranceCardNumber: null, insuranceMemberId: null, insuranceProviderName: null,
    insuranceNetwork: null, insuranceCategory: null, insuranceEffectiveDate: null,
    insuranceExpiryDate: null, insuranceStatus: null,
    preferredLanguage: 'en', notificationChannel: 'PUSH_AND_EMAIL',
    personNumber: 'AVN-000001', preferredName: null, salutation: null, middleNameEn: null,
    extraData: {}, createdBy: 'sys', createdByName: 'sys', createdDate: new Date(),
    updatedBy: null, updatedByName: null, updatedDate: null, lastUpdatedDate: null,
  }

  it('throws FORBIDDEN when EMPLOYEE tries to read someone else', async () => {
    session.user.role = 'EMPLOYEE'
    session.user.personId = 'persons-OTHER'
    queryQueue = [[personRow]]
    await expect(getPerson('persons-1')).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('throws FORBIDDEN on cross-entity read for HR_ADMIN', async () => {
    session.user.role = 'HR_ADMIN'
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000b2'
    queryQueue = [[personRow]]
    await expect(getPerson('persons-1')).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('returns null when no row found', async () => {
    queryQueue = [[]]
    const out = await getPerson('persons-missing')
    expect(out).toBeNull()
  })

  it('happy path: returns PersonView for HR_ADMIN with PII unmasked', async () => {
    session.user.role = 'HR_ADMIN'
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000a1'
    queryQueue = [[personRow]]
    const out = await getPerson('persons-1')
    expect(out).not.toBeNull()
    expect(out?.id).toBe('persons-1')
    // Mock decryptNullable strips the 'enc:' prefix.
    expect(out?.emiratesId).toBe('784-1990-1234567-8')
    expect(out?.piiMasked).toBe(false)
    // Read-side audit row written.
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'PERSON.PII_VIEWED',
    }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// updatePerson
// ─────────────────────────────────────────────────────────────────────────────

describe('updatePerson', () => {
  const beforeRow = {
    id: 'persons-1', tenantId: 'tenant-1', legalEntityId: '00000000-0000-0000-0000-0000000000a1',
    firstNameEn: 'Sara', middleNameEn: null, lastNameEn: 'Ahmed',
    fullNameAr: 'سارة أحمد', preferredName: null, salutation: null,
    dateOfBirth: '1990-05-12', gender: 'FEMALE', maritalStatus: null,
    numberOfDependents: 0, nationalityCode: 'ARE', nationalityCategory: 'UAE_NATIONAL',
    religion: null, religionConsentGiven: false,
    emiratesId: null, emiratesIdExpiry: null,
    passportNumber: null, passportCountry: null,
    extraData: {},
  }

  it('throws FORBIDDEN when PAYROLL_ADMIN attempts an update', async () => {
    session.user.role = 'PAYROLL_ADMIN'
    await expect(updatePerson('persons-1', { firstNameEn: 'Sarah' })).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('blocks cross-entity update for non-SUPER_ADMIN', async () => {
    session.user.role = 'HR_ADMIN'
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000b2'
    const tx = buildTxMock([])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([beforeRow]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
    await expect(updatePerson('persons-1', { firstNameEn: 'Sarah' })).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('happy path: returns id + changedFields and writes audit', async () => {
    session.user.role = 'HR_ADMIN'
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000a1'
    const tx = buildTxMock([])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([beforeRow]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const out = await updatePerson('persons-1', { firstNameEn: 'Sarah' })
    expect(out.id).toBe('persons-1')
    expect(out.changedFields).toEqual(expect.arrayContaining(['firstNameEn', 'fullNameEn']))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType:    'PERSON.UPDATED',
      resourceType: 'persons',
      resourceId:   'persons-1',
    }))
  })

  it('throws "person not found" when row missing', async () => {
    session.user.role = 'HR_ADMIN'
    const tx = buildTxMock([])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
    await expect(updatePerson('persons-MISSING', { firstNameEn: 'X' })).rejects.toThrow(/could not be found/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// listPersons
// ─────────────────────────────────────────────────────────────────────────────

describe('listPersons', () => {
  it('throws FORBIDDEN for EMPLOYEE role', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(listPersons({})).rejects.toThrow(/FORBIDDEN|requires one of|do not have permission|You can only/i)
  })

  it('returns paginated rows for HR_ADMIN', async () => {
    session.user.role = 'HR_ADMIN'
    queryQueue = [
      [{ total: 0 }], // count
      [],             // rows
    ]
    const result = await listPersons({})
    expect(result.total).toBe(0)
    expect(result.rows).toEqual([])
    expect(result.page).toBe(1)
    expect(result.totalPages).toBe(1)
  })

  // ── Department Head filter (DHF) ──────────────────────────────────────────
  it('DHF-1: accepts a valid departmentHeadId and returns a paginated page (HR_ADMIN)', async () => {
    session.user.role = 'HR_ADMIN'
    queryQueue = [
      [{ total: 3 }], // count
      [],             // rows
    ]
    const result = await listPersons({ departmentHeadId: '11111111-1111-1111-1111-111111111111' })
    expect(result.total).toBe(3)
    expect(result.page).toBe(1)
  })

  it('DHF-2: MANAGER with NO direct reports returns empty even WITH departmentHeadId (scoping not bypassed)', async () => {
    session.user.role = 'MANAGER'
    session.user.personId = 'persons-MGR'
    queryQueue = [
      [], // direct-report lookup → none
    ]
    const result = await listPersons({ departmentHeadId: '11111111-1111-1111-1111-111111111111' })
    // Short-circuits to empty regardless of the head filter — manager can never
    // widen beyond their direct reports.
    expect(result.total).toBe(0)
    expect(result.rows).toEqual([])
  })

  it('DHF-3: MANAGER WITH reports + departmentHeadId proceeds (head filter ANDs on top of report scoping)', async () => {
    session.user.role = 'MANAGER'
    session.user.personId = 'persons-MGR'
    queryQueue = [
      [{ personId: 'persons-1' }], // direct-report lookup → one report
      [{ total: 5 }],              // count (proves it did NOT short-circuit)
      [],                          // rows
    ]
    const result = await listPersons({ departmentHeadId: '11111111-1111-1111-1111-111111111111' })
    expect(result.total).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// amendContract / terminateContract
// ─────────────────────────────────────────────────────────────────────────────

describe('amendContract', () => {
  it('throws FORBIDDEN when caller is not authorised', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(amendContract({
      contractId:    '00000000-0000-0000-0000-000000000010',
      effectiveDate: '2026-05-01',
      reason:        'Renewal',
    })).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('rejects amend when current contract is not ACTIVE', async () => {
    session.user.role = 'HR_ADMIN'
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000a1'
    const closedContract = {
      id: '00000000-0000-0000-0000-000000000010',
      tenantId: 'tenant-1', legalEntityId: '00000000-0000-0000-0000-0000000000a1',
      status: 'TERMINATED', startDate: '2026-01-01', endDate: '2026-12-31',
    }
    const tx = buildTxMock([])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([closedContract]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await expect(amendContract({
      contractId:    '00000000-0000-0000-0000-000000000010',
      effectiveDate: '2026-05-01',
      reason:        'Renewal',
    })).rejects.toThrow(/Only active contracts can be amended/i)
  })

  it('enforces BR-CT-002 (3-year cap from original start)', async () => {
    session.user.role = 'HR_ADMIN'
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000a1'
    const activeContract = {
      id: '00000000-0000-0000-0000-000000000010',
      tenantId: 'tenant-1', legalEntityId: '00000000-0000-0000-0000-0000000000a1',
      personId: 'persons-1',
      status: 'ACTIVE',
      startDate: '2024-01-01', endDate: '2026-12-31',
      employmentType: 'FULL_TIME', workingHoursPerWeek: '48',
      workLocation: 'OFFICE', noticePeriodDays: 30, renewalCount: 0,
      probationStart: '2024-01-01', notes: null, contractDocumentId: null,
      extraData: {}, contractType: 'FIXED_TERM',
    }
    const tx = buildTxMock([])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([activeContract]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    // newEndDate beyond 2024-01-01 + 3 years = 2027-01-01.
    await expect(amendContract({
      contractId:    '00000000-0000-0000-0000-000000000010',
      effectiveDate: '2026-05-01',
      reason:        'Extend term',
      newEndDate:    '2028-06-30',
    })).rejects.toThrow(/exceed.*three years|amended contract end date/i)
  })
})

describe('terminateContract', () => {
  it('rejects when contract already terminated', async () => {
    session.user.role = 'HR_ADMIN'
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000a1'
    const terminated = {
      id: '00000000-0000-0000-0000-000000000010',
      tenantId: 'tenant-1', legalEntityId: '00000000-0000-0000-0000-0000000000a1',
      status: 'TERMINATED', terminationDate: '2026-03-01',
    }
    const tx = buildTxMock([])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([terminated]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await expect(terminateContract({
      contractId:        '00000000-0000-0000-0000-000000000010',
      terminationDate:   '2026-04-01',
      terminationReason: 'RESIGNATION',
    })).rejects.toThrow(/already been terminated/i)
  })

  it('happy path: writes status flip + audit row', async () => {
    session.user.role = 'HR_ADMIN'
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000a1'
    const active = {
      id: '00000000-0000-0000-0000-000000000010',
      tenantId: 'tenant-1', legalEntityId: '00000000-0000-0000-0000-0000000000a1',
      status: 'ACTIVE', notes: null,
    }
    // Return a checklist stub so `const [checklist] = await tx.insert(onboardingChecklists)
    // .values(...).returning(...)` resolves to a non-undefined row.
    const tx = buildTxMock([{ id: '00000000-0000-0000-0000-000000000099' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([active]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const out = await terminateContract({
      contractId:        '00000000-0000-0000-0000-000000000010',
      terminationDate:   '2026-04-01',
      terminationReason: 'RESIGNATION',
    })
    expect(out.id).toBe('00000000-0000-0000-0000-000000000010')
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
      status:          'TERMINATED',
      terminationDate: '2026-04-01',
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'CONTRACT.TERMINATED',
    }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// updatePersonProject — regression tests for the project assignment blank bug
// ─────────────────────────────────────────────────────────────────────────────

const PROJ_ID   = '00000000-0000-0000-0000-000000000042'
const PRSN_ID   = '00000000-0000-0000-0000-000000000001'
const ASSIGN_ID = '00000000-0000-0000-0000-000000000077'

describe('updatePersonProject', () => {
  it('returns { error } when caller is EMPLOYEE (FORBIDDEN)', async () => {
    session.user.role = 'EMPLOYEE'
    const result = await updatePersonProject(PRSN_ID, PROJ_ID, 100)
    expect(result.error).toMatch(/FORBIDDEN|do not have permission|requires one of/i)
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('returns { error } when project is inactive or missing', async () => {
    // Project validation select returns empty → project not active
    queryQueue = [
      [],  // projects query → empty → inactive project
    ]
    const result = await updatePersonProject(PRSN_ID, PROJ_ID, 100)
    expect(result.error).toMatch(/inactive or does not exist/i)
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('returns { noAssignment: true } when person has no current worker_assignment', async () => {
    queryQueue = [
      [{ id: PROJ_ID }],  // project validation → active project found
      [],                 // worker_assignments query → no current assignment
    ]
    const result = await updatePersonProject(PRSN_ID, PROJ_ID, 75)
    expect(result).toEqual({ noAssignment: true })
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it('happy path: persists projectId via transaction + writes audit row (Hard Rule 1)', async () => {
    queryQueue = [
      [{ id: PROJ_ID }],    // project validation → found
      [{ id: ASSIGN_ID }],  // worker_assignments → current assignment found
    ]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await updatePersonProject(PRSN_ID, PROJ_ID, 75)

    expect(result).toEqual({ success: true })
    expect(mockDb.transaction).toHaveBeenCalledTimes(1)
    // DB update must carry the projectId and allocation.
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
      projectId:            PROJ_ID,
      projectAllocationPct: '75',
    }))
    // Audit row must be written inside the same transaction (Hard Rule 1).
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType:    'PERSON.PROJECT_UPDATED',
      resourceType: 'worker_assignments',
      resourceId:   ASSIGN_ID,
    }))
  })

  it('clears project (null) without running project validation query', async () => {
    // projectId === null → skip the project validation select entirely,
    // so the first consumed queue slot is the worker_assignments query.
    queryQueue = [
      [{ id: ASSIGN_ID }],  // worker_assignments → current assignment found
    ]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await updatePersonProject(PRSN_ID, null, null)

    expect(result).toEqual({ success: true })
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
      projectId:            null,
      projectAllocationPct: null,
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'PERSON.PROJECT_UPDATED',
    }))
  })

  it('does NOT call transaction when noAssignment — project value is never silently discarded', async () => {
    // This is the regression test for the silent-no-op bug that caused project to blank.
    queryQueue = [
      [{ id: PROJ_ID }],  // project validation → found
      [],                 // worker_assignments → PENDING_HIRE employee, no assignment
    ]
    const result = await updatePersonProject(PRSN_ID, PROJ_ID, 50)
    expect(result.noAssignment).toBe(true)
    expect(result.success).toBeUndefined()
    expect(result.error).toBeUndefined()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getPersonCurrentProject
// ─────────────────────────────────────────────────────────────────────────────

describe('getPersonCurrentProject', () => {
  it('returns projectId and allocationPercentage when assignment exists', async () => {
    queryQueue = [[{ projectId: PROJ_ID, allocationPercentage: '75.00' }]]
    const result = await getPersonCurrentProject(PRSN_ID)
    expect(result.projectId).toBe(PROJ_ID)
    expect(result.allocationPercentage).toBe('75.00')
  })

  it('returns null values when no current assignment row exists', async () => {
    queryQueue = [[]]
    const result = await getPersonCurrentProject(PRSN_ID)
    expect(result).toEqual({ projectId: null, allocationPercentage: null })
  })

  it('returns null values instead of throwing when auth fails (EMPLOYEE role)', async () => {
    session.user.role = 'EMPLOYEE'
    // getPersonCurrentProject catches errors and returns null — never throws.
    await expect(getPersonCurrentProject(PRSN_ID)).resolves.toEqual({
      projectId: null,
      allocationPercentage: null,
    })
  })
})
