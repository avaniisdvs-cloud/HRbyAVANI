import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * S4-Q8 — Integration tests for the remaining S3-10/S3-11 Server Actions:
 *
 *   • createBankDetails / getBankDetails  — IBAN encryption + role-aware mask
 *   • addDependent                         — BR-INS-004 cap + EID encryption
 *   • uploadPersonDocument / getDocumentUrl — MIME guard, SAS URL TTL,
 *                                              S4-Q2 pre-flight ordering
 */

// ── Shared queue + spies ───────────────────────────────────────────────────

let queryQueue: unknown[][] = []
let callIndex   = 0

const insertSpy   = vi.fn()
const valuesSpy   = vi.fn()
const updateSpy   = vi.fn()
const setSpy      = vi.fn()
const auditSpy    = vi.fn()
const blobUploadSpy = vi.fn()
const blobDeleteSpy = vi.fn()
const sasUrlSpy     = vi.fn()

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
  writeAuditLog: vi.fn((event: unknown) => { auditSpy(event); return Promise.resolve() }),
  diffFields: () => [],
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
}))
vi.mock('@/lib/permissions', () => ({
  requirePermission: vi.fn(() => Promise.resolve()),
  invalidatePermissionCache: vi.fn(),
}))
vi.mock('@/lib/blob-storage', () => ({
  uploadDocument: vi.fn(async (args: { fileName: string }) => {
    blobUploadSpy(args.fileName)
    return {
      storageKey:     `persons/test/${args.fileName}-key`,
      fileName:       args.fileName,
      fileSizeBytes:  1024,
      mimeType:       'application/pdf',
      checksumSha256: 'a'.repeat(64),
      sasUrl:         `local://stub/${args.fileName}-key?stubExpires=${Date.now() + 900_000}`,
    }
  }),
  getSasUrl: vi.fn(async (key: string) => {
    sasUrlSpy(key)
    return `local://stub/${key}?stubExpires=${Date.now() + 900_000}`
  }),
  deleteDocument: vi.fn(async (key: string) => { blobDeleteSpy(key) }),
}))
vi.mock('@/lib/storage', () => ({
  isLocalStorageActive:    vi.fn(() => false),
  isPostgresStorageActive: vi.fn(() => false),
  getStorageProvider:     vi.fn(() => ({
    fileExists: vi.fn(async () => true),
  })),
  getStorageUIState:      vi.fn(() => 'operational'),
}))
vi.mock('@/lib/effective-date', () => ({
  addDays: (date: string, n: number) => {
    const d = new Date(date); d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  },
}))
vi.mock('@/drizzle/schema', () => ({
  persons:               { id: {}, tenantId: {}, legalEntityId: {} },
  personBankDetails:     { id: {}, tenantId: {}, personId: {}, isPrimary: {} },
  personDependents:      { id: {}, tenantId: {}, personId: {} },
  personDocuments:       { id: {}, tenantId: {}, personId: {} },
}))
vi.mock('drizzle-orm', () => ({
  eq:    () => ({}),
  and:   (...a: unknown[]) => a,
  count: () => ({}),
}))

const { createBankDetails, getBankDetails } = await import('@/modules/core-hr/bank-details/actions')
const { addDependent }                       = await import('@/modules/core-hr/dependents/actions')
const { uploadPersonDocument, getDocumentUrl } = await import('@/modules/core-hr/documents/actions')

// ─────────────────────────────────────────────────────────────────────────────

const PERSON_ID = '00000000-0000-0000-0000-000000000700'
const ENTITY_ID = '00000000-0000-0000-0000-0000000000a1'

beforeEach(() => {
  queryQueue = []
  callIndex  = 0
  vi.clearAllMocks()
  insertSpy.mockClear()
  valuesSpy.mockClear()
  updateSpy.mockClear()
  setSpy.mockClear()
  auditSpy.mockClear()
  blobUploadSpy.mockClear()
  blobDeleteSpy.mockClear()
  sasUrlSpy.mockClear()
  session.user.role = 'HR_ADMIN'
  session.user.legalEntityId = ENTITY_ID
  session.user.personId = '00000000-0000-0000-0000-0000000000d4'
  mockDb.select.mockImplementation(() => makeProxy())
  mockDb.insert.mockImplementation(() => makeInsertChain([]))
  mockDb.update.mockImplementation(() => makeUpdateChain())
})

// ─────────────────────────────────────────────────────────────────────────────
// createBankDetails — BR-WPS-004 + IBAN encryption
// ─────────────────────────────────────────────────────────────────────────────

const validBankInput = () => ({
  personId:      PERSON_ID,
  bankName:      'Emirates NBD',
  bankCode:      'EBILAEAD',
  iban:          'AE070331234567890123456',
  accountName:   'Sara Ahmed',
  accountType:   'CURRENT' as const,
  currency:      'AED',
  isWpsAccount:  true,
  effectiveFrom: '2026-05-01',
})

describe('createBankDetails', () => {
  it('throws FORBIDDEN for EMPLOYEE', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(createBankDetails(validBankInput())).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('rejects malformed IBAN (BR-WPS-004)', async () => {
    // translateError converts the raw BR-WPS-004 Zod error to a user-friendly message
    await expect(createBankDetails({ ...validBankInput(), iban: '12345' })).rejects.toThrow(
      /missing or contain invalid values/i,
    )
  })

  it('rejects non-AE IBAN', async () => {
    await expect(createBankDetails({ ...validBankInput(), iban: 'GB12345678901234567890' })).rejects.toThrow()
  })

  it('blocks cross-entity write for non-SUPER_ADMIN', async () => {
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000b2'
    const tx = buildTxMock([])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: PERSON_ID, legalEntityId: ENTITY_ID }]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
    await expect(createBankDetails(validBankInput())).rejects.toThrow(/do not have permission/i)
  })

  it('encrypts IBAN before INSERT (Hard Rule 4) + writes audit row with masked tail only', async () => {
    const tx = buildTxMock([{ id: 'bank-id-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: PERSON_ID, legalEntityId: ENTITY_ID }]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await createBankDetails(validBankInput())
    expect(result.id).toBe('bank-id-1')
    // Ciphertext only — never plaintext.
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({
      iban: 'enc:AE070331234567890123456',
    }))
    // Audit row must NOT contain the full IBAN — only the masked tail.
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'BANK_DETAILS.CREATED',
      newValues: expect.objectContaining({
        ibanMasked: expect.stringMatching(/3456$/), // tail visible
      }),
    }))
    const auditedNewValues = auditSpy.mock.calls[0][0] as { newValues: Record<string, unknown> }
    expect(auditedNewValues.newValues['iban']).toBeUndefined() // no plaintext leak
  })

  it('closes the existing primary bank record before inserting the new one (effective-date pattern)', async () => {
    const tx = buildTxMock([{ id: 'bank-id-2' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: PERSON_ID, legalEntityId: ENTITY_ID }]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await createBankDetails(validBankInput())
    // The pre-existing-row close happens via tx.update().set() — should be called BEFORE insert.
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
      effectiveTo: '2026-04-30',
      isPrimary:   false,
    }))
    expect(insertSpy).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getBankDetails — role-aware IBAN reveal
// ─────────────────────────────────────────────────────────────────────────────

describe('getBankDetails — role-aware IBAN reveal', () => {
  const bankRow = {
    id: 'bank-id-1', tenantId: 'tenant-1', personId: PERSON_ID,
    bankName: 'Emirates NBD', bankCode: 'EBILAEAD',
    iban: 'enc:AE070331234567890123456',
    accountName: 'Sara Ahmed', accountType: 'CURRENT', currency: 'AED',
    isPrimary: true, isWpsAccount: true,
    effectiveFrom: '2026-05-01', effectiveTo: null,
  }

  it('returns null when no record exists', async () => {
    queryQueue = [[]]
    const out = await getBankDetails(PERSON_ID)
    expect(out).toBeNull()
  })

  it('PAYROLL_ADMIN: full IBAN revealed + audit row written', async () => {
    session.user.role = 'PAYROLL_ADMIN'
    queryQueue = [
      [bankRow],
      [{ legalEntityId: ENTITY_ID }],
    ]
    const out = await getBankDetails(PERSON_ID)
    expect(out).not.toBeNull()
    expect(out?.iban).toBe('AE070331234567890123456')
    expect(out?.ibanMasked).toBe(false)
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'BANK_DETAILS.IBAN_VIEWED',
    }))
  })

  it('HR_ADMIN: IBAN masked (only PAYROLL_ADMIN/HR_DIRECTOR/SUPER_ADMIN see plaintext)', async () => {
    session.user.role = 'HR_ADMIN'
    queryQueue = [
      [bankRow],
      [{ legalEntityId: ENTITY_ID }],
    ]
    const out = await getBankDetails(PERSON_ID)
    expect(out?.ibanMasked).toBe(true)
    expect(out?.iban).toMatch(/3456$/) // tail still visible
    expect(out?.iban).not.toBe('AE070331234567890123456')
  })

  it('EMPLOYEE viewing someone else: throws FORBIDDEN', async () => {
    session.user.role = 'EMPLOYEE'
    session.user.personId = '00000000-0000-0000-0000-0000000000ee'
    queryQueue = [
      [bankRow],
      [{ legalEntityId: ENTITY_ID }],
    ]
    await expect(getBankDetails(PERSON_ID)).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('Cross-entity HR_ADMIN: throws FORBIDDEN', async () => {
    session.user.role = 'HR_ADMIN'
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000b2'
    queryQueue = [
      [bankRow],
      [{ legalEntityId: ENTITY_ID }],
    ]
    await expect(getBankDetails(PERSON_ID)).rejects.toThrow(/do not have permission/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// addDependent — BR-INS-004 cap + encryption
// ─────────────────────────────────────────────────────────────────────────────

const validDependentInput = () => ({
  personId:        PERSON_ID,
  relationship:    'CHILD' as const,
  firstNameEn:     'Omar',
  lastNameEn:      'Ahmed',
  fullNameAr:      'عمر أحمد',
  dateOfBirth:     '2015-04-12',
  gender:          'MALE' as const,
  nationalityCode: 'ARE',
  effectiveFrom:   '2026-05-01',
})

describe('addDependent', () => {
  it('throws FORBIDDEN for PAYROLL_ADMIN', async () => {
    session.user.role = 'PAYROLL_ADMIN'
    await expect(addDependent(validDependentInput())).rejects.toThrow(/do not have permission|You can only/i)
  })

  it('rejects malformed EID (BR-EID-001)', async () => {
    await expect(addDependent({ ...validDependentInput(), emiratesId: 'not-an-eid' })).rejects.toThrow()
  })

  it('happy path: encrypts EID + passport before INSERT (Hard Rule 4) + writes audit', async () => {
    queryQueue = [
      [{ id: PERSON_ID, legalEntityId: ENTITY_ID }],   // person lookup
      [{ activeCount: 2 }],                            // BR-INS-004 count
    ]
    const tx = buildTxMock([{ id: 'dep-id-1' }])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await addDependent({
      ...validDependentInput(),
      emiratesId:     '784-2015-1234567-8',
      passportNumber: 'P12345678',
    })

    expect(result.id).toBe('dep-id-1')
    expect(result.dependentNumber).toBe(3)
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({
      emiratesId:     'enc:784-2015-1234567-8',
      passportNumber: 'enc:P12345678',
    }))
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'DEPENDENT.ADDED',
    }))
    // Audit metadata should record that PII fields were populated, but
    // never include their plaintext values.
    const event = auditSpy.mock.calls[0][0] as { newValues: { piiFields: string[] } }
    expect(event.newValues.piiFields).toEqual(expect.arrayContaining(['emiratesId', 'passportNumber']))
  })

  it('BR-INS-004: rejects when person already has 9 dependents', async () => {
    queryQueue = [
      [{ id: PERSON_ID, legalEntityId: ENTITY_ID }],
      [{ activeCount: 9 }],
    ]
    const tx = buildTxMock([])
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
    await expect(addDependent(validDependentInput())).rejects.toThrow(/maximum of 9 dependents/i)
  })

  it('Cross-entity: blocks non-SUPER_ADMIN', async () => {
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000b2'
    const tx = buildTxMock([])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: PERSON_ID, legalEntityId: ENTITY_ID }]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
    await expect(addDependent(validDependentInput())).rejects.toThrow(/do not have permission/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// uploadPersonDocument — MIME + size guards + S4-Q2 pre-flight ordering
// ─────────────────────────────────────────────────────────────────────────────

function makeFormData(file: File, metadata: Record<string, unknown>): FormData {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('metadata', JSON.stringify(metadata))
  return fd
}
function pdfFile(name = 'doc.pdf', sizeBytes = 1024): File {
  const buf = new Uint8Array(sizeBytes)
  return new File([buf], name, { type: 'application/pdf' })
}

const validDocMeta = () => ({
  personId:      PERSON_ID,
  documentType:  'LABOUR_CARD',
  documentTitle: 'Labour Card - primary',
})

describe('uploadPersonDocument', () => {
  it('throws FORBIDDEN for EMPLOYEE', async () => {
    session.user.role = 'EMPLOYEE'
    await expect(uploadPersonDocument(makeFormData(pdfFile(), validDocMeta()))).rejects.toThrow(/do not have permission|You can only/i)
    // Crucially: NO blob upload happened either.
    expect(blobUploadSpy).not.toHaveBeenCalled()
  })

  it('rejects when file is missing', async () => {
    const fd = new FormData()
    fd.append('metadata', JSON.stringify(validDocMeta()))
    await expect(uploadPersonDocument(fd)).rejects.toThrow(/select a file to upload/i)
  })

  it('rejects when file exceeds 10 MB cap', async () => {
    const huge = new File([new Uint8Array(11 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' })
    await expect(uploadPersonDocument(makeFormData(huge, validDocMeta()))).rejects.toThrow(/too large/i)
  })

  it('rejects when file is empty', async () => {
    const empty = new File([], 'empty.pdf', { type: 'application/pdf' })
    await expect(uploadPersonDocument(makeFormData(empty, validDocMeta()))).rejects.toThrow(/appears to be empty/i)
  })

  it('rejects unsupported MIME type', async () => {
    const evil = new File([new Uint8Array(100)], 'evil.exe', { type: 'application/x-msdownload' })
    await expect(uploadPersonDocument(makeFormData(evil, validDocMeta()))).rejects.toThrow(/file type is not supported/i)
  })

  it('S4-Q2: pre-flight entity-scope check — NO blob upload when caller is cross-entity', async () => {
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000b2'
    queryQueue = [[{ id: PERSON_ID, legalEntityId: ENTITY_ID }]] // pre-flight reads the row
    await expect(
      uploadPersonDocument(makeFormData(pdfFile(), validDocMeta()))
    ).rejects.toThrow(/do not have permission/i)
    // KEY ASSERTION: blob never uploaded → no orphan in Azure.
    expect(blobUploadSpy).not.toHaveBeenCalled()
    expect(blobDeleteSpy).not.toHaveBeenCalled() // nothing to clean up
  })

  it('S4-Q2: pre-flight rejects missing person — NO blob upload', async () => {
    queryQueue = [[]] // pre-flight finds nothing
    await expect(
      uploadPersonDocument(makeFormData(pdfFile(), validDocMeta()))
    ).rejects.toThrow(/could not be found/i)
    expect(blobUploadSpy).not.toHaveBeenCalled()
  })

  it('S4-Q2 compensating delete: blob cleanup runs when tx fails after upload', async () => {
    // Pre-flight passes; tx INSERT throws (simulate CHECK constraint).
    queryQueue = [
      [{ id: PERSON_ID, legalEntityId: ENTITY_ID }],   // pre-flight
    ]
    const tx = buildTxMock([])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: PERSON_ID, legalEntityId: ENTITY_ID }]) }) }),
    }))
    tx.insert.mockImplementationOnce(() => {
      throw new Error('CHECK constraint violation')
    })
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    await expect(
      uploadPersonDocument(makeFormData(pdfFile(), validDocMeta()))
    ).rejects.toThrow(/validation rule|does not meet/i)
    // Blob was uploaded BEFORE the tx — compensating delete must run.
    expect(blobUploadSpy).toHaveBeenCalledTimes(1)
    expect(blobDeleteSpy).toHaveBeenCalledTimes(1)
  })

  it('happy path: uploads + writes person_documents row + audit row', async () => {
    queryQueue = [[{ id: PERSON_ID, legalEntityId: ENTITY_ID }]]
    const tx = buildTxMock([{ id: 'doc-id-1' }])
    tx.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: PERSON_ID, legalEntityId: ENTITY_ID }]) }) }),
    }))
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))

    const result = await uploadPersonDocument(makeFormData(pdfFile(), validDocMeta()))
    expect(result.id).toBe('doc-id-1')
    expect(result.sasUrl).toContain('stubExpires=')
    expect(blobUploadSpy).toHaveBeenCalledTimes(1)
    expect(blobDeleteSpy).not.toHaveBeenCalled()
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'DOCUMENT.UPLOADED',
    }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getDocumentUrl
// ─────────────────────────────────────────────────────────────────────────────

describe('getDocumentUrl', () => {
  const docRow = {
    id: 'doc-id-1', tenantId: 'tenant-1', personId: PERSON_ID,
    legalEntityId: ENTITY_ID,
    storageKey: 'persons/test/key.pdf',
    documentType: 'PASSPORT',
    hrOnlyVisibility: false,
  }

  it('returns typed NOT_FOUND error when document is missing', async () => {
    queryQueue = [[]]
    const out = await getDocumentUrl('doc-missing')
    expect(out).toMatchObject({ error: 'Document not found.', code: 'NOT_FOUND' })
  })

  it('returns typed UNAUTHORIZED error when EMPLOYEE tries to read someone else\'s doc', async () => {
    session.user.role = 'EMPLOYEE'
    session.user.personId = '00000000-0000-0000-0000-0000000000ee'
    queryQueue = [[docRow]]
    const out = await getDocumentUrl('doc-id-1')
    expect(out).toMatchObject({ error: expect.stringMatching(/do not have permission/i), code: 'UNAUTHORIZED' })
  })

  it('Cross-entity HR_ADMIN: returns typed UNAUTHORIZED error', async () => {
    session.user.role = 'HR_ADMIN'
    session.user.legalEntityId = '00000000-0000-0000-0000-0000000000b2'
    queryQueue = [[docRow]]
    const out = await getDocumentUrl('doc-id-1')
    expect(out).toMatchObject({ error: expect.stringMatching(/do not have permission/i), code: 'UNAUTHORIZED' })
  })

  it('happy path: writes DOCUMENT.URL_ISSUED audit + returns secure document route', async () => {
    queryQueue = [[docRow]]
    const out = await getDocumentUrl('doc-id-1')
    expect(out).toMatchObject({ url: '/api/documents/doc-id-1' })
    expect(sasUrlSpy).not.toHaveBeenCalled()
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'DOCUMENT.URL_ISSUED',
      metadata:  expect.objectContaining({ ttlMinutes: 5 }),
    }))
  })
})
