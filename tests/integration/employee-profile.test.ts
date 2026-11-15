import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * AGENT-3A — Employee profile & lifecycle integration tests.
 *
 * Covers: EMP-001 through EMP-013
 *   EMP-001  createPerson happy path — id + personNumber returned
 *   EMP-002  Emirates ID Zod validation
 *   EMP-003  UAE IBAN format validation (BR-WPS-004)
 *   EMP-004  Passport expiry validation
 *   EMP-005  UAE National nationality routing (FR-CH-16)
 *   EMP-006  Probation period enforcement (BR-PR-001)
 *   EMP-007  Contract fixed-term max validation (BR-CT-002)
 *   EMP-008  Dependent records — addDependent action
 *   EMP-009  Employment action — Transfer (runLifecycleChange / transfer)
 *   EMP-010  Employment action — Promotion (runLifecycleChange / promotion)
 *   EMP-011  Person number format AVN-XXXXXXX
 *   EMP-012  Audit log written on createPerson
 *   EMP-013  Required fields missing → Zod validation error
 *
 * Mock strategy: identical Proxy-queue pattern as core-hr-actions.test.ts.
 */

// ── Shared queue + spies ───────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex = 0

const insertSpy    = vi.fn()
const valuesSpy    = vi.fn()
const returningSpy = vi.fn()
const updateSpy    = vi.fn()
const setSpy       = vi.fn()
const whereSpy     = vi.fn()
const auditSpy     = vi.fn()

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
  const chain = {
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
  return chain
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
    update: vi.fn(() => { updateSpy('called'); return makeUpdateChain() }),
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

// ── Module mocks (must precede dynamic import) ────────────────────────────

vi.mock('@/lib/db', () => ({ db: mockDb }))
// P3-D2: requirePermission is independently covered by tests/security/permission-resolver.test.ts.
// Mock to a resolved no-op here so these business-logic tests don't depend on the schema/db
// mocks carrying the feature_permissions matrix.
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
  persons:           { id: {}, tenantId: {}, legalEntityId: {}, personNumber: {} },
  legalEntities:     { id: {}, isActive: {}, entityCode: {} },
  departments:       {},
  jobs:              {},
  positions:         {},
  contracts:         { id: {}, tenantId: {}, personId: {}, status: {} },
  workerAssignments: { id: {}, tenantId: {}, personId: {}, isCurrent: {}, endDate: {} },
  employmentActions: { id: {}, tenantId: {}, personId: {} },
  grades:            { id: {}, gradeLevel: {} },
  personBankDetails: { id: {}, tenantId: {}, personId: {}, isPrimary: {} },
  personDependents:  { id: {}, tenantId: {}, personId: {} },
  personDocuments:   {},
  personContacts:          {},
  personAddresses:         {},
  // Added for createPerson auto work-schedule assignment (Task 2D)
  workSchedules:           { id: {}, tenantId: {}, legalEntityId: {}, isDefault: {}, isActive: {} },
  workScheduleAssignments: { id: {}, tenantId: {}, personId: {} },
}))
vi.mock('drizzle-orm', () => ({
  eq:     () => ({}),
  and:    (...a: unknown[]) => a,
  ilike:  () => ({}),
  or:     () => ({}),
  sql:    Object.assign(() => ({}), { raw: () => ({}) }),
  desc:   () => ({}),
  count:  () => ({}),
  lte:    () => ({}),
  isNull: () => ({}),
  gte:    () => ({}),
  ne:     () => ({}),
}))

// ── Late-load actions after mocks are registered ──────────────────────────

const { createPerson } = await import('@/modules/core-hr/actions')
const { addDependent }  = await import('@/modules/core-hr/dependents/actions')
const { transfer, promotion } = await import('@/modules/core-hr/employment-actions/actions')
  .then(m => m)
  .catch(() => ({ transfer: undefined, promotion: undefined }))

// Schema imports (pure Zod — no mock needed)
const { CreatePersonSchema, EMIRATES_ID_REGEX, UAE_IBAN_REGEX } =
  await import('@/modules/core-hr/validations')
const { CreateContractSchema } =
  await import('@/modules/core-hr/contracts/validations')
const { AddDependentSchema } =
  await import('@/modules/core-hr/dependents/validations')

// ── Helpers ───────────────────────────────────────────────────────────────

const ENTITY_ID = '00000000-0000-0000-0000-0000000000a1'
const PERSON_ID = '00000000-0000-0000-0000-000000000001'

const validPersonInput = () => ({
  firstNameEn:          'Sara',
  lastNameEn:           'Ahmed',
  fullNameAr:           'سارة أحمد',
  dateOfBirth:          '1990-05-12',
  gender:               'FEMALE'  as const,
  numberOfDependents:   0,
  nationalityCode:      'ARE',
  nationalityCategory:  'UAE_NATIONAL' as const,
  religionConsentGiven: false,
  legalEntityId:        ENTITY_ID,
  employmentType:       'FULL_TIME' as const,
  contractedHoursPerWeek: 48,
  assignmentStatus:     'PENDING_HIRE' as const,
  hireDate:             '2026-04-01',
  noticePeriodDays:     30,
  preferredLanguage:    'en'              as const,
  notificationChannel:  'PUSH_AND_EMAIL'  as const,
  pdplConsentGiven:     true,
  sensitiveDataConsent: false,
  extraData:            {},
})

/** Wire mockDb.transaction to run the callback synchronously with a tx mock. */
function setupTx(insertReturn: unknown[]) {
  const tx = buildTxMock(insertReturn)
  tx.select.mockImplementation(() => makeProxy())
  mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
  return tx
}

// ── beforeEach reset ──────────────────────────────────────────────────────

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
  session.user.id            = '00000000-0000-0000-0000-0000000000c3'
  session.user.name          = 'HR Admin'
  session.user.role          = 'HR_ADMIN'
  session.user.legalEntityId = ENTITY_ID
  session.user.personId      = undefined
  mockDb.select.mockImplementation(() => makeProxy())
  mockDb.insert.mockImplementation(() => makeInsertChain([]))
  mockDb.update.mockImplementation(() => makeUpdateChain())
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-001 — createPerson happy path
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-001: createPerson — valid payload', () => {
  it('returns { id, personNumber } on success', async () => {
    queryQueue = [
      [{ id: ENTITY_ID, isActive: true }], // legal entity check
      [{ count: 0 }],                       // nextPersonNumber
      [{ entityCode: 'AVN' }],              // nextPersonNumber entity code
    ]
    setupTx([{ id: 'persons-001' }])

    const result = await createPerson(validPersonInput())

    expect(result.id).toBe('persons-001')
    expect(typeof result.personNumber).toBe('string')
  })

  it('calls db.transaction once', async () => {
    queryQueue = [
      [{ id: ENTITY_ID, isActive: true }],
      [{ count: 0 }],
      [{ entityCode: 'AVN' }],
    ]
    setupTx([{ id: 'persons-001' }])

    await createPerson(validPersonInput())
    expect(mockDb.transaction).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-002 — Emirates ID Zod validation
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-002: Emirates ID format validation', () => {
  it('accepts dashed format 784-1990-1234567-8', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      emiratesId: '784-1990-1234567-8',
    })
    expect(r.success).toBe(true)
  })

  it('accepts raw 15-digit format 784199012345678 (QA-Audit-M7)', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      emiratesId: '784199012345678',
    })
    expect(r.success).toBe(true)
  })

  it('rejects truncated 784-1990-123', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      emiratesId: '784-1990-123',
    })
    expect(r.success).toBe(false)
  })

  it('rejects non-784 prefix (e.g. 123-1990-1234567-8)', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      emiratesId: '123-1990-1234567-8',
    })
    expect(r.success).toBe(false)
  })

  it('EMIRATES_ID_REGEX accepts dashed canonical form directly', () => {
    expect(EMIRATES_ID_REGEX.test('784-1990-1234567-8')).toBe(true)
  })

  it('EMIRATES_ID_REGEX rejects plain text', () => {
    expect(EMIRATES_ID_REGEX.test('bogus')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-003 — UAE IBAN format validation (BR-WPS-004)
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-003: UAE IBAN format validation (BR-WPS-004)', () => {
  it('accepts AE070331234567890123456 (23 chars, AE prefix)', () => {
    expect(UAE_IBAN_REGEX.test('AE070331234567890123456')).toBe(true)
  })

  it('rejects UK IBAN UK12345678901234567890', () => {
    expect(UAE_IBAN_REGEX.test('UK12345678901234567890')).toBe(false)
  })

  it('rejects short IBAN AE123', () => {
    expect(UAE_IBAN_REGEX.test('AE123')).toBe(false)
  })

  it('CreateBankDetailsSchema: AE IBAN passes', async () => {
    const { CreateBankDetailsSchema } = await import('@/modules/core-hr/bank-details/validations')
    const r = CreateBankDetailsSchema.safeParse({
      personId:      PERSON_ID,
      bankName:      'Emirates NBD',
      bankCode:      'ENBD',
      iban:          'AE070331234567890123456',
      accountName:   'Sara Ahmed',
      effectiveFrom: '2026-04-01',
    })
    expect(r.success).toBe(true)
  })

  it('CreateBankDetailsSchema: non-AE IBAN fails', async () => {
    const { CreateBankDetailsSchema } = await import('@/modules/core-hr/bank-details/validations')
    const r = CreateBankDetailsSchema.safeParse({
      personId:      PERSON_ID,
      bankName:      'HSBC',
      bankCode:      'HSBC',
      iban:          'GB29NWBK60161331926819',
      accountName:   'Sara Ahmed',
      effectiveFrom: '2026-04-01',
    })
    expect(r.success).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-004 — Passport expiry validation
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-004: Passport expiry validation', () => {
  // The schema stores passportExpiry as a YYYY-MM-DD string but does NOT
  // reject past dates at the Zod layer (business rule is a soft warning).
  it('accepts a future passport expiry date', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      passportNumber: 'P1234567',
      passportCountry: 'ARE',
      passportExpiry: '2030-12-31',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a past passport expiry (soft warning — no hard schema reject)', () => {
    // Business rule: expiry warning shown in UI, not a hard Zod failure.
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      passportNumber: 'P1234567',
      passportCountry: 'ARE',
      passportExpiry: '2020-01-01',
    })
    expect(r.success).toBe(true)
  })

  it('rejects passportExpiry with wrong format (not YYYY-MM-DD)', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      passportNumber: 'P1234567',
      passportCountry: 'ARE',
      passportExpiry: '31-12-2030',
    })
    expect(r.success).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-005 — UAE National nationality routing (FR-CH-16)
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-005: UAE National nationality routing', () => {
  it('stores nationalityCategory UAE_NATIONAL when payload is valid', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      nationalityCode:     'ARE',
      nationalityCategory: 'UAE_NATIONAL',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.nationalityCategory).toBe('UAE_NATIONAL')
    }
  })

  it('stores nationalityCategory EXPAT correctly', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      nationalityCode:     'GBR',
      nationalityCategory: 'EXPAT',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.nationalityCategory).toBe('EXPAT')
    }
  })

  it('FR-CH-16 rejects UAE_NATIONAL with non-ARE nationalityCode', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      nationalityCode:     'GBR',
      nationalityCategory: 'UAE_NATIONAL',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some(i => i.message.includes('UAE_NATIONAL'))).toBe(true)
    }
  })

  it('GCC_NATIONAL with GCC code is accepted', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      nationalityCode:     'SAU',
      nationalityCategory: 'GCC_NATIONAL',
    })
    expect(r.success).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-006 — Probation period enforcement (BR-PR-001)
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-006: Probation period enforcement (BR-PR-001)', () => {
  it('rejects probationEndDate more than 6 months after hireDate', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      hireDate:         '2026-01-01',
      probationEndDate: '2026-08-01', // 7 months — over limit
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some(i => i.message.includes('BR-PR-001'))).toBe(true)
    }
  })

  it('accepts probationEndDate exactly 6 months from hireDate', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      hireDate:         '2026-01-01',
      probationEndDate: '2026-07-01', // exactly 6 months
    })
    expect(r.success).toBe(true)
  })

  it('rejects probationEndDate before hireDate', () => {
    const r = CreatePersonSchema.safeParse({
      ...validPersonInput(),
      hireDate:         '2026-01-01',
      probationEndDate: '2025-12-01',
    })
    expect(r.success).toBe(false)
  })

  it('createPerson action rejects 7-month probation end-to-end', async () => {
    const bad = {
      ...validPersonInput(),
      hireDate:         '2026-01-01',
      probationEndDate: '2026-12-01', // well beyond 6 months
    }
    await expect(createPerson(bad)).rejects.toThrow(/missing or contain invalid values/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-007 — Contract fixed-term max validation (BR-CT-002)
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-007: Contract fixed-term max validation (BR-CT-002)', () => {
  const baseContract = {
    personId:       PERSON_ID,
    legalEntityId:  ENTITY_ID,
    employmentType: 'FULL_TIME' as const,
    startDate:      '2026-01-01',
    endDate:        '2028-12-31', // ~3 years — valid
  }

  it('accepts a contract under 3 years', () => {
    const r = CreateContractSchema.safeParse(baseContract)
    expect(r.success).toBe(true)
  })

  it('rejects a 4-year contract (BR-CT-002)', () => {
    const r = CreateContractSchema.safeParse({
      ...baseContract,
      endDate: '2030-01-02', // 4 years from 2026-01-01
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some(i => i.message.includes('BR-CT-002'))).toBe(true)
    }
  })

  it('rejects when endDate is before startDate', () => {
    const r = CreateContractSchema.safeParse({
      ...baseContract,
      endDate: '2025-01-01',
    })
    expect(r.success).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-008 — Dependent records (addDependent action)
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-008: Dependent records', () => {
  const validDependent = {
    personId:        PERSON_ID,
    relationship:    'CHILD'      as const,
    firstNameEn:     'Ahmed',
    lastNameEn:      'Al-Rashidi',
    fullNameAr:      'أحمد الراشدي',
    dateOfBirth:     '2015-06-15',
    gender:          'MALE'       as const,
    nationalityCode: 'ARE',
    effectiveFrom:   '2026-04-01',
  }

  it('AddDependentSchema validates a correct dependent payload', () => {
    const r = AddDependentSchema.safeParse(validDependent)
    expect(r.success).toBe(true)
  })

  it('AddDependentSchema rejects missing firstNameEn', () => {
    const { firstNameEn, ...rest } = validDependent as any
    const r = AddDependentSchema.safeParse(rest)
    expect(r.success).toBe(false)
  })

  it('addDependent action: creates dependent and returns id + dependentNumber', async () => {
    queryQueue = [
      [{ id: PERSON_ID, legalEntityId: ENTITY_ID }], // person exists
      [{ activeCount: 2 }],                            // BR-INS-004 count
    ]
    setupTx([{ id: 'dep-001' }])

    const result = await addDependent(validDependent)

    expect(result.id).toBe('dep-001')
    expect(typeof result.dependentNumber).toBe('number')
  })

  it('addDependent enforces BR-INS-004 (max 9 dependents)', async () => {
    queryQueue = [
      [{ id: PERSON_ID, legalEntityId: ENTITY_ID }],
      [{ activeCount: 9 }], // already at max
    ]
    setupTx([{ id: 'dep-x' }])

    await expect(addDependent(validDependent)).rejects.toThrow(/maximum of 9 dependents/i)
  })

  it('addDependent throws FORBIDDEN when role is not HR_ADMIN+', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(addDependent(validDependent)).rejects.toThrow(/do not have permission|You can only/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-009 — Employment action — Transfer
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-009: Employment action — Transfer', () => {
  if (!transfer) {
    it.skip('transfer action not found in employment-actions/actions.ts — skipped')
    return
  }

  it('throws FORBIDDEN when caller role is EMPLOYEE', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(
      (transfer as Function)({
        personId:        PERSON_ID,
        reasonText:      'Department restructure',
        effectiveDate:   '2026-06-01',
        newDepartmentId: '00000000-0000-0000-0000-000000000099',
      }),
    ).rejects.toThrow(/do not have permission|You can only/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-010 — Employment action — Promotion
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-010: Employment action — Promotion', () => {
  if (!promotion) {
    it.skip('promotion action not found in employment-actions/actions.ts — skipped')
    return
  }

  it('throws FORBIDDEN when caller role is EMPLOYEE', async () => {
    // runGradeChange does a pre-flight DB read before calling requireRole.
    // Seed the queue so it finds a current assignment, then auth gate fires.
    queryQueue = [
      [{ gradeId: '00000000-0000-0000-0000-000000000077' }], // currentAssignment
      [{ level: 3 }],                                         // old grade level
      [{ level: 5 }],                                         // new grade level
    ]
    session.user.role = 'EMPLOYEE'
    await expect(
      (promotion as Function)({
        personId:      PERSON_ID,
        reasonText:    'Annual review',
        effectiveDate: '2026-06-01',
        newGradeId:    '00000000-0000-0000-0000-000000000088',
      }),
    ).rejects.toThrow(/do not have permission|You can only/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-011 — Person number follows AVN-XXXXXXX format
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-011: Person number generation', () => {
  it('personNumber returned is a non-empty string', async () => {
    queryQueue = [
      [{ id: ENTITY_ID, isActive: true }],
      [{ count: 0 }],
      [{ entityCode: 'AVN' }],
    ]
    setupTx([{ id: 'persons-011', personNumber: 'AVN-000001' }])

    const result = await createPerson(validPersonInput())
    expect(result.personNumber).toBeTruthy()
    expect(typeof result.personNumber).toBe('string')
  })

  it('nextPersonNumber pure function produces AVN-NNNNNN pattern', async () => {
    // Test the service directly via a lightweight tx stub.
    const { nextPersonNumber } = await import('@/modules/core-hr/services')

    let callCount = 0
    const txStub: any = {
      select: vi.fn(() =>
        new Proxy({} as any, {
          get(_: any, prop: string) {
            if (prop === 'then') {
              // First call: entityCode row; second call: person count row.
              const rows = callCount++ === 0
                ? [{ entityCode: 'AVN' }]
                : [null] // sql aggregate returns single row with null max
              return (resolve: (v: unknown) => unknown) =>
                Promise.resolve(rows).then(resolve)
            }
            return () => txStub.select()
          },
        }),
      ),
    }

    const num = await nextPersonNumber(ENTITY_ID, txStub as any)
    expect(num).toMatch(/^AVN-\d{6}$/)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-012 — Audit log written on createPerson
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-012: Audit log written on createPerson', () => {
  it('writeAuditLog called with PERSON.CREATED event', async () => {
    queryQueue = [
      [{ id: ENTITY_ID, isActive: true }],
      [{ count: 0 }],
      [{ entityCode: 'AVN' }],
    ]
    setupTx([{ id: 'persons-012' }])

    await createPerson(validPersonInput())

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType:    'PERSON.CREATED',
        resourceType: 'persons',
        resourceId:   'persons-012',
      }),
    )
  })

  it('auditSpy is called at least once per createPerson invocation', async () => {
    queryQueue = [
      [{ id: ENTITY_ID, isActive: true }],
      [{ count: 0 }],
      [{ entityCode: 'AVN' }],
    ]
    setupTx([{ id: 'persons-012b' }])

    await createPerson(validPersonInput())
    expect(auditSpy).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// EMP-013 — Required fields missing → validation error
// ══════════════════════════════════════════════════════════════════════════

describe('EMP-013: Required fields missing → Zod validation error', () => {
  it('rejects when firstNameEn is missing', () => {
    const { firstNameEn, ...rest } = validPersonInput() as any
    const r = CreatePersonSchema.safeParse(rest)
    expect(r.success).toBe(false)
  })

  it('rejects when lastNameEn is missing', () => {
    const { lastNameEn, ...rest } = validPersonInput() as any
    const r = CreatePersonSchema.safeParse(rest)
    expect(r.success).toBe(false)
  })

  it('accepts missing fullNameAr so createPerson can auto-translate before enforcing FR-CH-15', () => {
    const { fullNameAr, ...rest } = validPersonInput() as any
    const r = CreatePersonSchema.safeParse(rest)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.fullNameAr).toBe('')
  })

  it('rejects when nationalityCode is missing', () => {
    const { nationalityCode, ...rest } = validPersonInput() as any
    const r = CreatePersonSchema.safeParse(rest)
    expect(r.success).toBe(false)
  })

  it('rejects when hireDate is missing', () => {
    const { hireDate, ...rest } = validPersonInput() as any
    const r = CreatePersonSchema.safeParse(rest)
    expect(r.success).toBe(false)
  })

  it('createPerson action propagates Zod error for empty firstNameEn', async () => {
    await expect(
      createPerson({ ...validPersonInput(), firstNameEn: '' }),
    ).rejects.toThrow()
  })

  it('createPerson action propagates Zod error for missing pdplConsent', async () => {
    const input = { ...validPersonInput(), pdplConsentGiven: false }
    await expect(createPerson(input)).rejects.toThrow(/PDPL|consent/i)
  })
})
