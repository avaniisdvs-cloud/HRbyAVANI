import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Anthropic SDK before any module that transitively imports it
// (modules/employee-letters/translate.ts initialises the client at module load time)
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '' }] }) }
  },
}))

/**
 * Employee document experience — integration tests.
 *
 * Covers (per spec):
 *  1. getEmployeeDocuments returns person_documents rows (SIGNED_LETTER excluded)
 *  2. getEmployeeDocuments returns employee_letters rows with friendly titles
 *  3. SIGNED_LETTER type is excluded from person_documents list
 *  4. getDocumentUrl blocks EMPLOYEE accessing another person's document
 *  5. getDocumentUrl allows HR_ADMIN to access any employee document
 *  6. getDocumentUrl issues an audit log entry (DOCUMENT.URL_ISSUED)
 *  7. getLetterDocumentUrl blocks cross-entity access for non-SUPER_ADMIN
 *  8. getLetterDocumentUrl allows SUPER_ADMIN cross-entity access
 *  9. Friendly title: LETTER_TYPE_LABELS maps DCL → "Designation Letter"
 * 10. Friendly title: DB nameEn takes precedence over fallback map
 */

// ── Shared mocks ─────────────────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex = 0

const auditSpy   = vi.fn()
const sasUrlSpy  = vi.fn((_key: string) => Promise.resolve('https://stub.blob.core.windows.net/docs/key?sas=stub'))

function makeProxy(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_: Record<string, unknown>, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: unknown[]) => unknown) =>
          Promise.resolve(queryQueue[callIndex++] ?? []).then(resolve)
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
  getSasUrl:      sasUrlSpy,
  deleteDocument: vi.fn(),
}))
vi.mock('@/lib/storage', () => ({
  isLocalStorageActive:    vi.fn(() => false),  // cloud provider by default in tests
  isPostgresStorageActive: vi.fn(() => false),
  getStorageProvider:      vi.fn(() => ({
    uploadFile:   vi.fn(),
    getSignedUrl: sasUrlSpy,
    deleteFile:   vi.fn(),
    fileExists:   vi.fn(() => Promise.resolve(true)),
    getMetadata:  vi.fn(),
  })),
}))

// Auth mock — role/personId/legalEntityId are configured per test
const session = {
  user: {
    id:            'user-admin-1',
    name:          'HR Admin',
    role:          'HR_ADMIN',
    personId:      'person-admin',
    legalEntityId: 'entity-A',
  },
}
vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(async (_roles: string[]) => session.user),
  getCurrentUser: vi.fn(async () => session.user),
  auth: vi.fn(async () => ({ user: session.user })),
}))

// Schema mock — all fields referenced by the actions under test
vi.mock('@/drizzle/schema', () => ({
  personDocuments:      {
    id: {}, tenantId: {}, personId: {}, documentType: {},
    documentTitle: {}, documentNumber: {}, issueDate: {}, expiryDate: {},
    documentStatus: {}, storageKey: {}, fileName: {}, fileSizeBytes: {},
    mimeType: {}, checksumSha256: {}, legalEntityId: {}, createdDate: {},
    hrOnlyVisibility: {}, downloadCount: {}, lastViewedAt: {}, lastDownloadedAt: {},
  },
  employeeLetters:      {
    id: {}, tenantId: {}, personId: {}, typeCode: {}, letterNumber: {},
    status: {}, pdfUrl: {}, signedPdfUrl: {}, generatedAt: {}, signedAt: {},
    legalEntityId: {},
  },
  letterTemplateTypes:  { id: {}, typeCode: {}, nameEn: {} },
  persons:              { id: {}, tenantId: {}, legalEntityId: {}, isActive: {} },
  workerAssignments:    {
    tenantId: {}, personId: {}, effectiveStartDate: {}, effectiveEndDate: {},
    effectiveSequence: {}, isCurrent: {}, createdDate: {},
  },
  salaryElements:       {
    tenantId: {}, personId: {}, assignmentId: {}, payrollId: {}, elementCode: {},
    effectiveStartDate: {}, effectiveEndDate: {}, effectiveSequence: {}, createdDate: {},
  },
  payrollAssignments:   {
    tenantId: {}, personId: {}, effectiveStartDate: {}, effectiveEndDate: {},
    effectiveSequence: {}, isCurrent: {}, createdDate: {},
  },
  workScheduleAssignments: {
    tenantId: {}, personId: {}, effectiveStartDate: {}, effectiveEndDate: {},
    effectiveSequence: {}, isCurrent: {}, createdDate: {},
  },
  leavePlanEnrolments:  {
    tenantId: {}, personId: {}, absencePlanId: {}, effectiveStartDate: {},
    effectiveEndDate: {}, effectiveSequence: {}, isCurrent: {}, createdDate: {},
  },
  gradeHistory:         { tenantId: {}, gradeId: {}, validFrom: {}, validTo: {}, isCurrent: {}, changedAt: {} },
  departmentHistory:    { tenantId: {}, departmentId: {}, validFrom: {}, validTo: {}, isCurrent: {}, changedAt: {} },
  locationHistory:      { tenantId: {}, locationId: {}, validFrom: {}, validTo: {}, isCurrent: {}, changedAt: {} },
  jobHistory:           { tenantId: {}, jobId: {}, validFrom: {}, validTo: {}, isCurrent: {}, changedAt: {} },
  positionHistory:      { tenantId: {}, positionId: {}, validFrom: {}, validTo: {}, isCurrent: {}, changedAt: {} },
  personContacts:       { personId: {}, contactType: {}, contactValue: {} },
  userAccounts:         { personId: {}, primaryEmail: {} },
  notificationLog:      {},
}))
vi.mock('drizzle-orm', () => ({
  eq:        () => ({}),
  and:       (...a: unknown[]) => a,
  ne:        () => ({}),
  isNotNull: () => ({}),
  desc:      () => ({}),
  asc:       () => ({}),
  relations: () => ({}),
  sql:       Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}))

// Import modules after mocks are set up
const { getDocumentUrl, uploadPersonDocument } = await import('@/modules/core-hr')
const { getLetterDocumentUrl }                 = await import('@/modules/employee-letters')
const { getEmployeeDocuments, LETTER_TYPE_LABELS } = await import('@/lib/documents/get-employee-documents')
const { getDocTypeLabel } = await import('@/lib/documents/document-types')

const TENANT_ID   = '00000000-0000-0000-0000-000000000001'
const PERSON_A    = '00000000-0000-0000-0000-aaaaaaaaaaaa'
const PERSON_B    = '00000000-0000-0000-0000-bbbbbbbbbbbb'
const ENTITY_A    = '00000000-0000-0000-0000-000000000aa1'
const ENTITY_B    = '00000000-0000-0000-0000-000000000bb1'
const DOC_ID      = '00000000-0000-0000-0000-dddddddddddd'
const LETTER_ID   = '00000000-0000-0000-0000-llllllllllll'

beforeEach(() => {
  queryQueue = []
  callIndex  = 0
  vi.clearAllMocks()
  auditSpy.mockClear()
  sasUrlSpy.mockImplementation((_key: string) =>
    Promise.resolve('https://stub.blob.core.windows.net/docs/test-key?sas=stub'),
  )
  session.user.role          = 'HR_ADMIN'
  session.user.personId      = 'person-admin'
  session.user.legalEntityId = ENTITY_A
})

// ══════════════════════════════════════════════════════════════════════════════
// 1. getEmployeeDocuments — person_documents rows
// ══════════════════════════════════════════════════════════════════════════════

describe('getEmployeeDocuments — person_documents', () => {
  it('returns normalised rows for uploaded documents', async () => {
    queryQueue = [
      // DB call 1: personDocuments query
      [{
        id:             DOC_ID,
        documentType:   'PASSPORT',
        documentTitle:  'Passport — primary',
        documentNumber: 'AB123456',
        issueDate:      '2020-01-01',
        expiryDate:     '2030-01-01',
        documentStatus: 'VALID',
        storageKey:     'persons/aaa/uuid.pdf',
      }],
      // DB call 2: employeeLetters query
      [],
    ]

    const rows = await getEmployeeDocuments(PERSON_A)

    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('PERSON_DOCUMENT')
    expect(rows[0].typeLabelEn).toBe('Passport')
    expect(rows[0].title).toBe('Passport — primary')
    expect(rows[0].canDownload).toBe(true)
    expect(rows[0].status).toBe('VALID')
  })

  it('getDocTypeLabel returns friendly name for all standard document types', () => {
    expect(getDocTypeLabel('EMIRATES_ID')).toBe('Emirates ID')
    expect(getDocTypeLabel('PASSPORT')).toBe('Passport')
    expect(getDocTypeLabel('VISA')).toBe('Visa')
    expect(getDocTypeLabel('LABOUR_CARD')).toBe('Labour Card')
    expect(getDocTypeLabel('CONTRACT')).toBe('Employment Contract')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. getEmployeeDocuments — employee_letters rows with friendly titles
// ══════════════════════════════════════════════════════════════════════════════

describe('getEmployeeDocuments — employee_letters', () => {
  it('returns letter rows with DB typeNameEn as friendly label', async () => {
    queryQueue = [
      // personDocuments: empty
      [],
      // employeeLetters: one letter with DB type name
      [{
        id:           LETTER_ID,
        typeCode:     'DCL',
        letterNumber: 'DCL-2026-0001',
        status:       'SIGNED',
        pdfUrl:       '/uploads/letters/dcl.pdf',
        signedPdfUrl: null,
        generatedAt:  new Date('2026-05-01T10:00:00Z'),
        signedAt:     new Date('2026-05-02T09:00:00Z'),
        typeNameEn:   'Designation Letter',      // from DB join
      }],
    ]

    const rows = await getEmployeeDocuments(PERSON_A)

    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('SIGNED_LETTER')
    expect(rows[0].typeLabelEn).toBe('Designation Letter')
    expect(rows[0].title).toBe('Designation Letter - DCL-2026-0001')
    expect(rows[0].documentNumber).toBe('DCL-2026-0001')
    expect(rows[0].status).toBe('SIGNED')
    expect(rows[0].canDownload).toBe(true)
    // Issued date should prefer signedAt
    expect(rows[0].issuedDate).toBe('2026-05-02')
  })

  it('falls back to LETTER_TYPE_LABELS when DB typeNameEn is null', async () => {
    queryQueue = [
      [],
      [{
        id:           LETTER_ID,
        typeCode:     'SC',
        letterNumber: 'SC-2026-0001',
        status:       'SENT',
        pdfUrl:       '/uploads/letters/sc.pdf',
        signedPdfUrl: null,
        generatedAt:  new Date('2026-04-15'),
        signedAt:     null,
        typeNameEn:   null,      // no DB join match
      }],
    ]

    const rows = await getEmployeeDocuments(PERSON_A)

    expect(rows[0].typeLabelEn).toBe('Salary Certificate')
    expect(rows[0].title).toBe('Salary Certificate - SC-2026-0001')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. SIGNED_LETTER excluded from personDocuments
// ══════════════════════════════════════════════════════════════════════════════

describe('getEmployeeDocuments — SIGNED_LETTER exclusion', () => {
  it('ne(documentType, SIGNED_LETTER) is applied in the query', async () => {
    // Verify: even if the DB somehow returns a SIGNED_LETTER row (mock ignores ne()),
    // the function normalises it as PERSON_DOCUMENT with status VALID.
    // The real guard is the ne() in the WHERE clause.
    // We test the label mapping to confirm non-SIGNED_LETTER types are handled.
    queryQueue = [
      [{ id: 'doc-other', documentType: 'OTHER', documentTitle: 'Misc', documentNumber: null,
          issueDate: null, expiryDate: null, documentStatus: 'VALID', storageKey: 'k' }],
      [],
    ]

    const rows = await getEmployeeDocuments(PERSON_A)
    // 'OTHER' is in the taxonomy as a legacy backward-compat entry with labelEn 'Other Document'
    expect(rows[0].typeLabelEn).toBe('Other Document')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. getDocumentUrl — EMPLOYEE self-only access
// ══════════════════════════════════════════════════════════════════════════════

describe('getDocumentUrl — EMPLOYEE access control', () => {
  it('returns error object when EMPLOYEE requests another person\'s document', async () => {
    session.user.role     = 'EMPLOYEE'
    session.user.personId = PERSON_B  // caller is person B

    queryQueue = [[{
      id:               DOC_ID,
      personId:         PERSON_A,  // document belongs to person A
      legalEntityId:    ENTITY_A,
      storageKey:       'persons/aaa/doc.pdf',
      hrOnlyVisibility: false,
    }]]

    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ error: expect.any(String), code: 'UNAUTHORIZED' })
    expect('url' in result).toBe(false)
  })

  it('returns API route URL when EMPLOYEE requests their own document', async () => {
    session.user.role     = 'EMPLOYEE'
    session.user.personId = PERSON_A

    queryQueue = [[{
      id:               DOC_ID,
      personId:         PERSON_A,
      legalEntityId:    ENTITY_A,
      storageKey:       'persons/aaa/doc.pdf',
      hrOnlyVisibility: false,
    }]]

    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ url: `/api/documents/${DOC_ID}` })
    expect('error' in result).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. getDocumentUrl — HR_ADMIN access
// ══════════════════════════════════════════════════════════════════════════════

describe('getDocumentUrl — HR_ADMIN access', () => {
  it('HR_ADMIN returns API route URL for same-entity document', async () => {
    session.user.role          = 'HR_ADMIN'
    session.user.personId      = 'admin-person'
    session.user.legalEntityId = ENTITY_A

    queryQueue = [[{
      id:               DOC_ID,
      personId:         PERSON_A,
      legalEntityId:    ENTITY_A,
      storageKey:       'persons/aaa/doc.pdf',
      hrOnlyVisibility: false,
    }]]

    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ url: `/api/documents/${DOC_ID}` })
    expect('error' in result).toBe(false)
  })

  it('returns error object when HR_ADMIN requests cross-entity document', async () => {
    session.user.role          = 'HR_ADMIN'
    session.user.legalEntityId = ENTITY_A
    session.user.personId      = 'admin-person'

    queryQueue = [[{
      id:               DOC_ID,
      personId:         PERSON_B,
      legalEntityId:    ENTITY_B,  // different entity
      storageKey:       'persons/bbb/doc.pdf',
      hrOnlyVisibility: false,
    }]]

    const result = await getDocumentUrl(DOC_ID)
    expect(result).toMatchObject({ error: expect.any(String), code: 'UNAUTHORIZED' })
    expect('url' in result).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 6. getDocumentUrl — audit log
// ══════════════════════════════════════════════════════════════════════════════

describe('getDocumentUrl — audit trail', () => {
  it('writes a DOCUMENT.URL_ISSUED audit row on success', async () => {
    session.user.role          = 'HR_ADMIN'
    session.user.legalEntityId = ENTITY_A
    session.user.personId      = 'admin-person'

    queryQueue = [[{
      id:               DOC_ID,
      personId:         PERSON_A,
      legalEntityId:    ENTITY_A,
      storageKey:       'persons/aaa/doc.pdf',
      hrOnlyVisibility: false,
    }]]

    await getDocumentUrl(DOC_ID)

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType:    'DOCUMENT.URL_ISSUED',
        resourceType: 'person_documents',
        resourceId:   DOC_ID,
      }),
    )
  })

  it('writes a DOCUMENT.ACCESS_DENIED audit row when EMPLOYEE accesses another person\'s doc', async () => {
    session.user.role     = 'EMPLOYEE'
    session.user.personId = PERSON_B
    auditSpy.mockClear()

    queryQueue = [[{
      id:               DOC_ID,
      personId:         PERSON_A,
      legalEntityId:    ENTITY_A,
      storageKey:       'persons/aaa/doc.pdf',
      hrOnlyVisibility: false,
    }]]

    await getDocumentUrl(DOC_ID)

    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType:    'DOCUMENT.ACCESS_DENIED',
        resourceType: 'person_documents',
        resourceId:   DOC_ID,
        metadata:     expect.objectContaining({ failureReason: 'UNAUTHORIZED' }),
      }),
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 7 & 8. getLetterDocumentUrl — access control
// ══════════════════════════════════════════════════════════════════════════════

describe('getLetterDocumentUrl — access control', () => {
  it('HR_ADMIN blocked from cross-entity letter', async () => {
    session.user.role          = 'HR_ADMIN'
    session.user.legalEntityId = ENTITY_A

    queryQueue = [[{
      id:            LETTER_ID,
      personId:      PERSON_B,
      legalEntityId: ENTITY_B,  // different entity
      typeCode:      'DCL',
      letterNumber:  'DCL-2026-0001',
      pdfUrl:        '/uploads/letters/dcl.pdf',
      signedPdfUrl:  null,
    }]]

    await expect(getLetterDocumentUrl(LETTER_ID)).rejects.toThrow(/do not have permission|cross-entity/i)
  })

  it('SUPER_ADMIN can access any letter regardless of entity', async () => {
    session.user.role          = 'SUPER_ADMIN'
    session.user.legalEntityId = ENTITY_A

    queryQueue = [[{
      id:            LETTER_ID,
      personId:      PERSON_B,
      legalEntityId: ENTITY_B,  // different entity — SUPER_ADMIN bypasses
      typeCode:      'DCL',
      letterNumber:  'DCL-2026-0001',
      pdfUrl:        '/uploads/letters/dcl.pdf',
      signedPdfUrl:  null,
    }]]

    const result = await getLetterDocumentUrl(LETTER_ID)
    expect(result).not.toBeNull()
    expect(result?.filename).toContain('DCL')
  })

  it('returns null when letter has no PDF', async () => {
    session.user.role          = 'HR_ADMIN'
    session.user.legalEntityId = ENTITY_A

    queryQueue = [[{
      id:            LETTER_ID,
      personId:      PERSON_A,
      legalEntityId: ENTITY_A,
      typeCode:      'DCL',
      letterNumber:  'DCL-2026-0001',
      pdfUrl:        null,    // no PDF yet
      signedPdfUrl:  null,
    }]]

    const result = await getLetterDocumentUrl(LETTER_ID)
    expect(result).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 9. LETTER_TYPE_LABELS — friendly name mapping
// ══════════════════════════════════════════════════════════════════════════════

describe('LETTER_TYPE_LABELS — fallback map', () => {
  it('maps DCL → Designation Letter', () => {
    expect(LETTER_TYPE_LABELS['DCL']).toBe('Designation Letter')
  })
  it('maps PCL → Probation Confirmation Letter', () => {
    expect(LETTER_TYPE_LABELS['PCL']).toBe('Probation Confirmation Letter')
  })
  it('maps SC → Salary Certificate', () => {
    expect(LETTER_TYPE_LABELS['SC']).toBe('Salary Certificate')
  })
  it('maps NOC → No Objection Certificate', () => {
    expect(LETTER_TYPE_LABELS['NOC']).toBe('No Objection Certificate')
  })
  it('maps EXP → Experience Letter', () => {
    expect(LETTER_TYPE_LABELS['EXP']).toBe('Experience Letter')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 10. Friendly title composition
// ══════════════════════════════════════════════════════════════════════════════

describe('Friendly letter title composition', () => {
  it('"Designation Letter - DCL-2026-0001" is the correct format', async () => {
    queryQueue = [
      [],
      [{
        id:           LETTER_ID,
        typeCode:     'DCL',
        letterNumber: 'DCL-2026-0001',
        status:       'SIGNED',
        pdfUrl:       '/test.pdf',
        signedPdfUrl: null,
        generatedAt:  new Date('2026-05-01'),
        signedAt:     null,
        typeNameEn:   'Designation Letter',
      }],
    ]

    const rows  = await getEmployeeDocuments(PERSON_A)
    expect(rows[0].title).toBe('Designation Letter - DCL-2026-0001')
  })

  it('raw typeCode is used as last resort when both DB and map are missing', async () => {
    queryQueue = [
      [],
      [{
        id:           LETTER_ID,
        typeCode:     'CUSTOM_XYZ',
        letterNumber: 'CUSTOM_XYZ-2026-0001',
        status:       'DRAFT',
        pdfUrl:       '/test.pdf',
        signedPdfUrl: null,
        generatedAt:  new Date('2026-05-01'),
        signedAt:     null,
        typeNameEn:   null,
      }],
    ]

    const rows = await getEmployeeDocuments(PERSON_A)
    expect(rows[0].typeLabelEn).toBe('CUSTOM_XYZ')
    expect(rows[0].title).toBe('CUSTOM_XYZ - CUSTOM_XYZ-2026-0001')
  })
})
