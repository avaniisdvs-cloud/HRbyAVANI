import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TENANT_ID } from '@/lib/constants'

/**
 * S4-Q4 — Integration tests for `updateFormConfiguration` (Sprint 4 backend).
 *
 * Covers:
 *   • role gate (HR_DIRECTOR / SUPER_ADMIN only)
 *   • Zod parse — sectionCode regex, bilingual labels, ≥1 / ≤20 sections
 *   • duplicate sectionCode rejection
 *   • upsert branches (create vs. update)
 *   • audit row inside the same tx (Hard Rule 1)
 *   • invalidateConfigCache called on commit (TD-13/14)
 */

// ── Shared queue + spies ───────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex   = 0

const insertSpy    = vi.fn()
const valuesSpy    = vi.fn()
const updateSpy    = vi.fn()
const setSpy       = vi.fn()
const auditSpy     = vi.fn()
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
  select: vi.fn(() => makeProxy()),
  insert: vi.fn(() => makeInsertChain([])),
  update: vi.fn(() => makeUpdateChain()),
  transaction: vi.fn(),
}

const session = {
  user: {
    id: '00000000-0000-0000-0000-0000000000c3',
    name: 'HR Director',
    role: 'HR_DIRECTOR',
    legalEntityId: '00000000-0000-0000-0000-0000000000a1',
    personId: undefined as string | undefined,
  },
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown, _tx?: unknown) => {
    auditSpy(event, _tx)
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
  workflowDefinitions:    {},
  workflowStages:         {},
  workflowInstances:      {},
  leaveRuleSets:          {},
  leaveRuleLines:         {},
  events:                 {},
  formConfigurations:     { id: {}, tenantId: {}, entityType: {}, role: {} },
}))
vi.mock('drizzle-orm', () => ({
  eq:     () => ({}),
  and:    (...a: unknown[]) => a,
}))

const { updateFormConfiguration } = await import('@/modules/config/actions')

// ─────────────────────────────────────────────────────────────────────────────

const validInput = () => ({
  entityType: 'PERSON',
  role:       'ALL',
  sections: [
    { sectionCode: 'PERSONAL_INFO', labelEn: 'Personal Info', labelAr: 'المعلومات الشخصية', fields: ['firstName', 'lastName'] },
    { sectionCode: 'DOCUMENTS',     labelEn: 'Documents',     labelAr: 'الوثائق',           fields: ['emiratesId'] },
  ],
})

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
  session.user.id = '00000000-0000-0000-0000-0000000000c3'
  session.user.name = 'HR Director'
  mockDb.select.mockImplementation(() => makeProxy())
  mockDb.insert.mockImplementation(() => makeInsertChain([]))
  mockDb.update.mockImplementation(() => makeUpdateChain())
})

describe('updateFormConfiguration — auth gate', () => {
  it('throws FORBIDDEN for HR_ADMIN (HR_DIRECTOR / SUPER_ADMIN only)', async () => {
    session.user.role = 'HR_ADMIN'
    await expect(updateFormConfiguration(validInput())).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('throws FORBIDDEN for EMPLOYEE', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(updateFormConfiguration(validInput())).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('allows SUPER_ADMIN', async () => {
    session.user.role = 'SUPER_ADMIN'
    queryQueue = [[]] // existing lookup → empty
    const tx = buildTxMock([{ id: 'config-id-1' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
    const result = await updateFormConfiguration(validInput())
    expect(result.id).toBe('config-id-1')
    expect(result.created).toBe(true)
  })
})

describe('updateFormConfiguration — Zod validation', () => {
  it('rejects when sections array is empty', async () => {
    await expect(updateFormConfiguration({
      ...validInput(),
      sections: [],
    })).rejects.toThrow()
  })

  it('rejects sectionCode that is not UPPER_SNAKE', async () => {
    await expect(updateFormConfiguration({
      ...validInput(),
      sections: [
        { sectionCode: 'lowercase', labelEn: 'X', labelAr: 'X', fields: [] },
      ],
    })).rejects.toThrow(/missing or contain invalid values/i)
  })

  it('rejects when labelAr is missing', async () => {
    await expect(updateFormConfiguration({
      ...validInput(),
      sections: [
        { sectionCode: 'X', labelEn: 'X', labelAr: '', fields: [] },
      ],
    })).rejects.toThrow()
  })

  it('rejects more than 20 sections', async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => ({
      sectionCode: `SEC_${i}`, labelEn: `Section ${i}`, labelAr: `قسم ${i}`, fields: [],
    }))
    await expect(updateFormConfiguration({
      ...validInput(),
      sections: tooMany,
    })).rejects.toThrow()
  })
})

describe('updateFormConfiguration — duplicate sectionCode', () => {
  it('throws on duplicate sectionCode within the same payload', async () => {
    await expect(updateFormConfiguration({
      ...validInput(),
      sections: [
        { sectionCode: 'PERSONAL_INFO', labelEn: 'A', labelAr: 'أ', fields: [] },
        { sectionCode: 'PERSONAL_INFO', labelEn: 'B', labelAr: 'ب', fields: [] },
      ],
    })).rejects.toThrow(/sections cannot share the same code/i)
  })
})

describe('updateFormConfiguration — upsert branches', () => {
  it('INSERT branch: creates new row when none exists', async () => {
    queryQueue = [[]] // existing lookup → empty
    const tx = buildTxMock([{ id: 'config-id-new' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await updateFormConfiguration(validInput())
    expect(result.created).toBe(true)
    expect(result.id).toBe('config-id-new')
    expect(insertSpy).toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    // INSERT payload carries the canonical tenant id from lib/constants.
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({
      tenantId:   TENANT_ID,
      entityType: 'PERSON',
      role:       'ALL',
      isActive:   true,
    }))
  })

  it('UPDATE branch: re-uses existing row', async () => {
    queryQueue = [[{ id: 'config-id-existing' }]] // existing row found
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await updateFormConfiguration(validInput())
    expect(result.created).toBe(false)
    expect(result.id).toBe('config-id-existing')
    expect(updateSpy).toHaveBeenCalled()
    expect(insertSpy).not.toHaveBeenCalled()
    // The set() payload does NOT carry the tenant id (we don't re-stamp it).
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
      isActive: true,
    }))
  })
})

describe('updateFormConfiguration — Hard Rule 1 (audit + tx)', () => {
  it('writes a FORM_CONFIG.CREATED audit row inside the tx (insert branch)', async () => {
    queryQueue = [[]]
    const tx = buildTxMock([{ id: 'config-id-new' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await updateFormConfiguration(validInput())
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType:    'FORM_CONFIG.CREATED',
        resourceType: 'form_configurations',
        resourceId:   'config-id-new',
        newValues: expect.objectContaining({
          entityType:    'PERSON',
          role:          'ALL',
          sectionCount:  2,
          sectionCodes:  ['PERSONAL_INFO', 'DOCUMENTS'],
        }),
      }),
      tx, // SECOND ARG is the tx — proves Hard Rule 1.
    )
  })

  it('writes a FORM_CONFIG.UPDATED audit row inside the tx (update branch)', async () => {
    queryQueue = [[{ id: 'config-id-existing' }]]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await updateFormConfiguration(validInput())
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'FORM_CONFIG.UPDATED', resourceId: 'config-id-existing' }),
      tx,
    )
  })
})

describe('updateFormConfiguration — cache invalidation', () => {
  it('calls invalidateConfigCache after commit (TD-13/14)', async () => {
    queryQueue = [[]]
    const tx = buildTxMock([{ id: 'config-id-new' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await updateFormConfiguration(validInput())
    expect(invalidateSpy).toHaveBeenCalledTimes(1)
  })

  it('does NOT invalidate cache when validation fails before tx', async () => {
    await expect(updateFormConfiguration({
      ...validInput(),
      sections: [{ sectionCode: 'lowercase', labelEn: 'X', labelAr: 'X', fields: [] }],
    })).rejects.toThrow()
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})
