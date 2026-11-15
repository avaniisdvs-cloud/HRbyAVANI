/**
 * Document Access Security — Unit Tests
 * DA-001–030: getDocumentUrl structured result, access control, file-existence
 * check, audit events, local provider detection.
 *
 * These tests verify the security model for document access:
 *  - No raw signed URLs returned to callers (API route URL returned instead)
 *  - Cross-person access blocked for EMPLOYEE role
 *  - HR-only documents blocked for EMPLOYEE role
 *  - Cross-entity access blocked for non-SUPER_ADMIN
 *  - FILE_MISSING error when local provider reports file absent
 *  - Audit trail: URL_ISSUED on success, ACCESS_DENIED on failure
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared mocks ──────────────────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let queueIdx = 0

const auditSpy    = vi.fn()
const fileExistsFn = vi.fn((_key: string) => Promise.resolve(true))
let   localActive    = false
let   postgresActive = false

function makeProxy(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_: Record<string, unknown>, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown[]) => unknown) =>
          Promise.resolve(queryQueue[queueIdx++] ?? []).then(resolve)
      }
      return () => makeProxy()
    },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select:      vi.fn(() => makeProxy()),
  insert:      vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 'new-id' }])) })) })),
  update:      vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
  transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockDb)),
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn((event: unknown) => { auditSpy(event); return Promise.resolve() }),
}))
vi.mock('@/lib/blob-storage', () => ({
  uploadDocument: vi.fn(),
  getSasUrl:      vi.fn(() => Promise.resolve('https://stub.blob.core.windows.net/sas')),
  deleteDocument: vi.fn(),
}))
vi.mock('@/lib/storage', () => ({
  isLocalStorageActive:    vi.fn(() => localActive),
  isPostgresStorageActive: vi.fn(() => postgresActive),
  getStorageProvider:      vi.fn(() => ({
    uploadFile:   vi.fn(),
    getSignedUrl: vi.fn(() => Promise.resolve('https://stub.blob.core.windows.net/signed')),
    deleteFile:   vi.fn(),
    fileExists:   fileExistsFn,
    getMetadata:  vi.fn(),
  })),
}))

const session = {
  user: {
    id:            'user-1',
    name:          'Test User',
    role:          'HR_ADMIN',
    personId:      'person-admin',
    legalEntityId: 'entity-A',
  },
}
vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(async (_roles: string[]) => session.user),
  auth:        vi.fn(async () => ({ user: session.user })),
}))
vi.mock('@/drizzle/schema', () => ({
  personDocuments: {
    id: {}, tenantId: {}, personId: {}, legalEntityId: {},
    storageKey: {}, hrOnlyVisibility: {}, documentType: {},
    documentTitle: {}, documentNumber: {}, issueDate: {}, expiryDate: {},
    documentStatus: {}, sourceType: {}, employeeCanReplace: {},
    fileName: {}, fileSizeBytes: {}, mimeType: {}, checksumSha256: {},
    downloadCount: {}, lastViewedAt: {}, lastDownloadedAt: {}, createdDate: {},
    documentCategory: {}, isMandatory: {}, createdBy: {}, createdByName: {},
    notes: {}, issuingAuthority: {}, issuingCountry: {}, alertDaysBeforeExpiry: {},
    verifiedBy: {}, verifiedDate: {}, scopeType: {}, contextId: {},
    actionMode: {}, correctsRowId: {},
  },
  persons: { id: {}, tenantId: {}, legalEntityId: {} },
}))
vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))
vi.mock('drizzle-orm', () => ({
  eq:        () => ({}),
  and:       (...a: unknown[]) => a,
  ne:        () => ({}),
  isNotNull: () => ({}),
  desc:      () => ({}),
  asc:       () => ({}),
  sql:       Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}))
vi.mock('@/lib/validation/date-validators', () => {
  // Chainable stub so hrDateString().optional().nullable() works at module eval.
  const stub: Record<string, unknown> = {}
  stub.optional = () => stub
  stub.nullable = () => stub
  return { hrDateString: () => stub }
})
vi.mock('@/lib/documents/document-types', () => ({
  HR_UPLOADABLE_TYPES:       ['PASSPORT'],
  EMPLOYEE_UPLOADABLE_TYPES: ['PASSPORT'],
  EMPLOYEE_VISIBLE_TYPES:    ['PASSPORT'],
  getDocTypeCategory:        () => 'IDENTITY',
}))

const { getDocumentUrl } = await import('@/modules/core-hr/documents/actions')

const DOC_ID   = 'doc-00000000-0001'
const PERSON_A = 'person-aaaa'
const PERSON_B = 'person-bbbb'
const ENTITY_A = 'entity-A'
const ENTITY_B = 'entity-B'

function docRow(overrides: Record<string, unknown> = {}) {
  return {
    id:               DOC_ID,
    personId:         PERSON_A,
    legalEntityId:    ENTITY_A,
    storageKey:       `persons/${PERSON_A}/doc.pdf`,
    hrOnlyVisibility: false,
    ...overrides,
  }
}

beforeEach(() => {
  queryQueue = []
  queueIdx   = 0
  localActive    = false
  postgresActive = false
  fileExistsFn.mockClear()
  fileExistsFn.mockResolvedValue(true)
  auditSpy.mockClear()
  session.user = {
    id: 'user-1', name: 'Test User', role: 'HR_ADMIN',
    personId: 'person-admin', legalEntityId: ENTITY_A,
  }
})

// ── DA-001–005: Return type shape ─────────────────────────────────────────────

describe('DA-001–005 — return type shape', () => {
  it('DA-001 — success returns { url } with /api/documents/ prefix', async () => {
    queryQueue = [[docRow()]]
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ url: `/api/documents/${DOC_ID}` })
  })

  it('DA-002 — success result has no "error" property', async () => {
    queryQueue = [[docRow()]]
    const result = await getDocumentUrl(DOC_ID)
    expect('error' in result).toBe(false)
  })

  it('DA-003 — failure returns { error, code } — no "url" property', async () => {
    queryQueue = [[]] // empty = document not found
    const result = await getDocumentUrl(DOC_ID)
    expect('url' in result).toBe(false)
    expect(result).toMatchObject({ error: expect.any(String), code: 'NOT_FOUND' })
  })

  it('DA-004 — returned URL never contains blob.core.windows.net or s3.amazonaws.com', async () => {
    queryQueue = [[docRow()]]
    const result = await getDocumentUrl(DOC_ID)
    if ('url' in result) {
      expect(result.url).not.toContain('blob.core.windows.net')
      expect(result.url).not.toContain('s3.amazonaws.com')
    }
  })

  it('DA-005 — returned URL is the exact document ID path', async () => {
    queryQueue = [[docRow()]]
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ url: `/api/documents/${DOC_ID}` })
  })
})

// ── DA-006–010: EMPLOYEE access control ──────────────────────────────────────

describe('DA-006–010 — EMPLOYEE access control', () => {
  beforeEach(() => {
    session.user.role     = 'EMPLOYEE'
    session.user.personId = PERSON_A
  })

  it('DA-006 — EMPLOYEE can access own document', async () => {
    queryQueue = [[docRow({ personId: PERSON_A })]]
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ url: `/api/documents/${DOC_ID}` })
  })

  it('DA-007 — EMPLOYEE blocked from another person\'s document', async () => {
    session.user.personId = PERSON_B
    queryQueue = [[docRow({ personId: PERSON_A })]]
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ error: expect.any(String), code: 'UNAUTHORIZED' })
  })

  it('DA-008 — EMPLOYEE blocked from HR-only document', async () => {
    queryQueue = [[docRow({ hrOnlyVisibility: true })]]
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ error: expect.any(String), code: 'UNAUTHORIZED' })
  })

  it('DA-009 — EMPLOYEE not blocked by hrOnlyVisibility=false', async () => {
    queryQueue = [[docRow({ hrOnlyVisibility: false })]]
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ url: `/api/documents/${DOC_ID}` })
  })

  it('DA-010 — EMPLOYEE blocked: error message is user-friendly (no raw SQL/stack)', async () => {
    session.user.personId = PERSON_B
    queryQueue = [[docRow({ personId: PERSON_A })]]
    const result = await getDocumentUrl(DOC_ID)
    if ('error' in result) {
      expect(result.error.toLowerCase()).not.toContain('sql')
      expect(result.error.toLowerCase()).not.toContain('throw')
      expect(result.error.length).toBeLessThan(200)
    }
  })
})

// ── DA-011–015: HR role access control ───────────────────────────────────────

describe('DA-011–015 — HR role access control', () => {
  it('DA-011 — HR_ADMIN same entity succeeds', async () => {
    session.user.role = 'HR_ADMIN'; session.user.legalEntityId = ENTITY_A
    queryQueue = [[docRow({ legalEntityId: ENTITY_A })]]
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ url: `/api/documents/${DOC_ID}` })
  })

  it('DA-012 — HR_ADMIN cross-entity blocked', async () => {
    session.user.role = 'HR_ADMIN'; session.user.legalEntityId = ENTITY_A
    queryQueue = [[docRow({ legalEntityId: ENTITY_B })]]
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('DA-013 — SUPER_ADMIN cross-entity allowed', async () => {
    session.user.role = 'SUPER_ADMIN'; session.user.legalEntityId = ENTITY_A
    queryQueue = [[docRow({ legalEntityId: ENTITY_B })]]
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ url: `/api/documents/${DOC_ID}` })
  })

  it('DA-014 — document not found returns NOT_FOUND code', async () => {
    queryQueue = [[]]  // empty result
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('DA-015 — no storageKey returns NOT_FOUND', async () => {
    queryQueue = [[docRow({ storageKey: null })]]
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ code: 'NOT_FOUND' })
  })
})

// ── DA-016–020: Local provider file-existence check ──────────────────────────

describe('DA-016–020 — local provider file-existence check', () => {
  beforeEach(() => {
    localActive = true
  })

  it('DA-016 — local provider + file exists → returns URL', async () => {
    fileExistsFn.mockResolvedValue(true)
    queryQueue = [[docRow()]]
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ url: `/api/documents/${DOC_ID}` })
  })

  it('DA-017 — local provider + file missing → FILE_MISSING error', async () => {
    fileExistsFn.mockResolvedValue(false)
    queryQueue = [[docRow()]]
    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ code: 'FILE_MISSING' })
  })

  it('DA-018 — FILE_MISSING error mentions redeployment to guide the user', async () => {
    fileExistsFn.mockResolvedValue(false)
    queryQueue = [[docRow()]]
    const result = await getDocumentUrl(DOC_ID)
    if ('error' in result) {
      expect(result.error.toLowerCase()).toContain('redeployment')
    }
  })

  it('DA-019 — cloud provider: fileExists not called (no extra round-trip)', async () => {
    localActive = false
    fileExistsFn.mockResolvedValue(false) // would return FILE_MISSING if called
    queryQueue = [[docRow()]]
    const result = await getDocumentUrl(DOC_ID)
    // Cloud path skips fileExists — so URL is returned despite mock returning false
    expect(result).toMatchObject({ url: `/api/documents/${DOC_ID}` })
    expect(fileExistsFn).not.toHaveBeenCalled()
  })

  it('DA-020 — fileExists throwing defaults to allowing access (catch → true)', async () => {
    localActive = true
    fileExistsFn.mockRejectedValue(new Error('network error'))
    queryQueue = [[docRow()]]
    const result = await getDocumentUrl(DOC_ID)
    // fileExists fails → .catch(() => true) → proceed
    expect(result).toMatchObject({ url: `/api/documents/${DOC_ID}` })
  })
})

// ── DA-021–025: Audit logging ─────────────────────────────────────────────────

describe('DA-021–025 — audit logging', () => {
  it('DA-021 — success writes DOCUMENT.URL_ISSUED', async () => {
    queryQueue = [[docRow()]]
    await getDocumentUrl(DOC_ID)
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType:    'DOCUMENT.URL_ISSUED',
        resourceType: 'person_documents',
        resourceId:   DOC_ID,
      }),
    )
  })

  it('DA-022 — cross-person EMPLOYEE writes DOCUMENT.ACCESS_DENIED', async () => {
    session.user.role = 'EMPLOYEE'; session.user.personId = PERSON_B
    queryQueue = [[docRow({ personId: PERSON_A })]]
    await getDocumentUrl(DOC_ID)
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'DOCUMENT.ACCESS_DENIED',
        metadata:  expect.objectContaining({ failureReason: 'UNAUTHORIZED' }),
      }),
    )
  })

  it('DA-023 — cross-entity HR_ADMIN writes DOCUMENT.ACCESS_DENIED', async () => {
    session.user.role = 'HR_ADMIN'; session.user.legalEntityId = ENTITY_A
    queryQueue = [[docRow({ legalEntityId: ENTITY_B })]]
    await getDocumentUrl(DOC_ID)
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'DOCUMENT.ACCESS_DENIED' }),
    )
  })

  it('DA-024 — FILE_MISSING writes DOCUMENT.ACCESS_DENIED with FILE_MISSING reason', async () => {
    localActive = true
    fileExistsFn.mockResolvedValue(false)
    queryQueue = [[docRow()]]
    await getDocumentUrl(DOC_ID)
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'DOCUMENT.ACCESS_DENIED',
        metadata:  expect.objectContaining({ failureReason: 'FILE_MISSING' }),
      }),
    )
  })

  it('DA-025 — URL_ISSUED metadata does not contain the actual signed URL', async () => {
    queryQueue = [[docRow()]]
    await getDocumentUrl(DOC_ID)
    const call = auditSpy.mock.calls.find(
      ([e]) => (e as { eventType: string }).eventType === 'DOCUMENT.URL_ISSUED',
    )
    expect(call).toBeTruthy()
    const event = call![0] as { metadata: Record<string, unknown> }
    const metaStr = JSON.stringify(event.metadata)
    expect(metaStr).not.toContain('blob.core.windows.net')
    expect(metaStr).not.toContain('s3.amazonaws.com')
    expect(metaStr).not.toContain('SAS')
  })
})

// ── DA-026–030: Error code completeness ──────────────────────────────────────

describe('DA-026–030 — error code completeness', () => {
  it('DA-026 — NOT_FOUND code when document row absent', async () => {
    queryQueue = [[]]
    const result = await getDocumentUrl(DOC_ID)
    expect((result as { code: string }).code).toBe('NOT_FOUND')
  })

  it('DA-027 — NOT_FOUND code when storageKey is null', async () => {
    queryQueue = [[docRow({ storageKey: null })]]
    const result = await getDocumentUrl(DOC_ID)
    expect((result as { code: string }).code).toBe('NOT_FOUND')
  })

  it('DA-028 — UNAUTHORIZED code for cross-person EMPLOYEE', async () => {
    session.user.role = 'EMPLOYEE'; session.user.personId = PERSON_B
    queryQueue = [[docRow({ personId: PERSON_A })]]
    const result = await getDocumentUrl(DOC_ID)
    expect((result as { code: string }).code).toBe('UNAUTHORIZED')
  })

  it('DA-029 — FILE_MISSING code when local provider reports absence', async () => {
    localActive = true; fileExistsFn.mockResolvedValue(false)
    queryQueue = [[docRow()]]
    const result = await getDocumentUrl(DOC_ID)
    expect((result as { code: string }).code).toBe('FILE_MISSING')
  })

  it('DA-030 — STORAGE_MISCONFIGURED code on unexpected exception', async () => {
    // Force requireRole to throw so the catch block fires
    const { requireRole } = await import('@/lib/auth')
    vi.mocked(requireRole).mockRejectedValueOnce(new Error('unexpected'))
    const result = await getDocumentUrl(DOC_ID)
    expect((result as { code: string }).code).toBe('STORAGE_MISCONFIGURED')
  })
})
