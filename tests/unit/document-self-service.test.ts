/**
 * Employee document self-service — updateMyDocumentMeta + deleteMyDocument.
 * DSS-001–016.
 *
 * Verifies the ownership/editability gate, audit-log emission, and the
 * never-throw return contract.  All infra (@/lib/db, auth, audit, storage) is
 * mocked — no real DB or DATABASE_URL required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  user:       { id: 'u1', name: 'Emp One', role: 'EMPLOYEE', personId: 'person-self', legalEntityId: 'entity-A' } as Record<string, string>,
  selectRows: [] as Array<Record<string, unknown>>,
  updateWhere: vi.fn<unknown[], Promise<void>>(),
  deleteWhere: vi.fn<unknown[], Promise<void>>(),
  audit:       vi.fn<unknown[], Promise<void>>(),
  blobDelete:  vi.fn<unknown[], Promise<void>>(),
}))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(async () => h.user),
}))
vi.mock('@/lib/audit', () => ({
  writeAuditLog: (...a: unknown[]) => { h.audit(...a); return Promise.resolve() },
}))
vi.mock('@/lib/blob-storage', () => ({
  uploadDocument: vi.fn(),
  deleteDocument: (...a: unknown[]) => h.blobDelete(...a),
}))
vi.mock('@/lib/storage', () => ({
  isLocalStorageActive:    vi.fn(() => false),
  isPostgresStorageActive: vi.fn(() => false),
  getStorageUIState:       vi.fn(() => 'operational'),
  getStorageProvider:      vi.fn(() => ({ fileExists: vi.fn(() => Promise.resolve(true)) })),
}))
const tx = {
  update: () => ({ set: () => ({ where: (...a: unknown[]) => h.updateWhere(...a) }) }),
  delete: () => ({ where: (...a: unknown[]) => h.deleteWhere(...a) }),
}
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(h.selectRows) }) }) }),
    transaction: async (fn: (t: unknown) => unknown) => fn(tx),
  },
}))
vi.mock('@/drizzle/schema', () => ({
  personDocuments: new Proxy({}, { get: () => ({}) }),
  persons:         new Proxy({}, { get: () => ({}) }),
}))
vi.mock('@/lib/constants', () => ({
  TENANT_ID: '00000000-0000-0000-0000-000000000001',
  MAX_DOCUMENT_BYTES: 10485760,
  ALLOWED_DOCUMENT_MIME_TYPES: ['application/pdf'],
}))
vi.mock('drizzle-orm', () => ({ eq: () => ({}), and: (...a: unknown[]) => a }))
// Use the REAL hrDateString (a Zod schema) — mocking it breaks z.object().
vi.mock('@/lib/app-error', () => ({ translateError: (e: unknown) => { throw e } }))
vi.mock('@/lib/documents/document-types', () => ({
  HR_UPLOADABLE_TYPES: ['PASSPORT'],
  EMPLOYEE_UPLOADABLE_TYPES: ['PASSPORT'],
  EMPLOYEE_VISIBLE_TYPES: ['PASSPORT'],
  getDocTypeCategory: () => 'IDENTITY',
  computeDocumentStatus: (s: string, expiry: string | null) => (expiry ? 'VALID' : s),
}))

const { updateMyDocumentMeta, deleteMyDocument } = await import('@/modules/core-hr/documents/actions')

const OWN_DOC = {
  id: 'doc-1', personId: 'person-self', legalEntityId: 'entity-A',
  sourceType: 'EMPLOYEE', employeeCanReplace: true, documentStatus: 'VALID',
  documentType: 'PASSPORT', documentTitle: 'My Passport', storageKey: 'persons/person-self/p.pdf',
}

beforeEach(() => {
  h.user = { id: 'u1', name: 'Emp One', role: 'EMPLOYEE', personId: 'person-self', legalEntityId: 'entity-A' }
  h.selectRows = [{ ...OWN_DOC }]
  h.updateWhere.mockReset().mockResolvedValue(undefined)
  h.deleteWhere.mockReset().mockResolvedValue(undefined)
  h.audit.mockReset().mockResolvedValue(undefined)
  h.blobDelete.mockReset().mockResolvedValue(undefined)
})

// ── updateMyDocumentMeta ────────────────────────────────────────────────────────

describe('updateMyDocumentMeta', () => {
  it('DSS-001 — employee edits own self-uploaded doc → success + update + audit', async () => {
    const r = await updateMyDocumentMeta('doc-1', {
      documentTitle: 'Passport (primary)', documentNumber: 'A99', issueDate: '2026-01-01', expiryDate: '2030-01-01',
    })
    expect(r).toEqual({ success: true })
    expect(h.updateWhere).toHaveBeenCalledTimes(1)
    expect(h.audit).toHaveBeenCalledTimes(1)
    const ev = h.audit.mock.calls[0][0] as { eventType: string }
    expect(ev.eventType).toBe('DOCUMENT.METADATA_UPDATED')
  })

  it('DSS-002 — rejects empty title', async () => {
    const r = await updateMyDocumentMeta('doc-1', { documentTitle: '' })
    expect('error' in r).toBe(true)
    expect(h.updateWhere).not.toHaveBeenCalled()
  })

  it('DSS-003 — employee cannot edit another person\'s document', async () => {
    h.selectRows = [{ ...OWN_DOC, personId: 'person-other' }]
    const r = await updateMyDocumentMeta('doc-1', { documentTitle: 'x' })
    expect(r).toEqual({ error: 'You can only edit your own documents.' })
    expect(h.updateWhere).not.toHaveBeenCalled()
  })

  it('DSS-004 — employee cannot edit an HR-uploaded doc (sourceType=HR)', async () => {
    h.selectRows = [{ ...OWN_DOC, sourceType: 'HR', employeeCanReplace: false }]
    const r = await updateMyDocumentMeta('doc-1', { documentTitle: 'x' })
    expect('error' in r).toBe(true)
    expect(h.updateWhere).not.toHaveBeenCalled()
  })

  it('DSS-005 — missing document → error', async () => {
    h.selectRows = []
    const r = await updateMyDocumentMeta('nope', { documentTitle: 'x' })
    expect(r).toEqual({ error: 'Document not found.' })
  })

  it('DSS-006 — HR_ADMIN same entity may edit', async () => {
    h.user = { id: 'h1', name: 'HR', role: 'HR_ADMIN', personId: '', legalEntityId: 'entity-A' }
    h.selectRows = [{ ...OWN_DOC, sourceType: 'HR', employeeCanReplace: false }]
    const r = await updateMyDocumentMeta('doc-1', { documentTitle: 'HR edit' })
    expect(r).toEqual({ success: true })
  })

  it('DSS-007 — HR_ADMIN cross-entity blocked', async () => {
    h.user = { id: 'h1', name: 'HR', role: 'HR_ADMIN', personId: '', legalEntityId: 'entity-B' }
    const r = await updateMyDocumentMeta('doc-1', { documentTitle: 'x' })
    expect('error' in r).toBe(true)
  })

  it('DSS-008 — accepts null/omitted optional fields', async () => {
    const r = await updateMyDocumentMeta('doc-1', { documentTitle: 'Just title' })
    expect(r).toEqual({ success: true })
  })
})

// ── deleteMyDocument ────────────────────────────────────────────────────────────

describe('deleteMyDocument', () => {
  it('DSS-009 — employee deletes own doc → success + delete + audit + bytes removed', async () => {
    const r = await deleteMyDocument('doc-1')
    expect(r).toEqual({ success: true })
    expect(h.deleteWhere).toHaveBeenCalledTimes(1)
    expect(h.audit).toHaveBeenCalledTimes(1)
    const ev = h.audit.mock.calls[0][0] as { eventType: string }
    expect(ev.eventType).toBe('DOCUMENT.DELETED')
    expect(h.blobDelete).toHaveBeenCalledWith('persons/person-self/p.pdf')
  })

  it('DSS-010 — employee cannot delete another person\'s document', async () => {
    h.selectRows = [{ ...OWN_DOC, personId: 'person-other' }]
    const r = await deleteMyDocument('doc-1')
    expect(r).toEqual({ error: 'You can only delete your own documents.' })
    expect(h.deleteWhere).not.toHaveBeenCalled()
  })

  it('DSS-011 — employee cannot delete an HR-uploaded doc', async () => {
    h.selectRows = [{ ...OWN_DOC, sourceType: 'HR', employeeCanReplace: false }]
    const r = await deleteMyDocument('doc-1')
    expect('error' in r).toBe(true)
    expect(h.deleteWhere).not.toHaveBeenCalled()
  })

  it('DSS-012 — missing document → error', async () => {
    h.selectRows = []
    const r = await deleteMyDocument('nope')
    expect(r).toEqual({ error: 'Document not found.' })
  })

  it('DSS-013 — bytes deletion failure does not fail the delete (best-effort)', async () => {
    h.blobDelete.mockRejectedValueOnce(new Error('blob gone'))
    const r = await deleteMyDocument('doc-1')
    expect(r).toEqual({ success: true })
  })

  it('DSS-014 — doc with no storageKey deletes row without calling blobDelete', async () => {
    h.selectRows = [{ ...OWN_DOC, storageKey: null }]
    const r = await deleteMyDocument('doc-1')
    expect(r).toEqual({ success: true })
    expect(h.blobDelete).not.toHaveBeenCalled()
  })

  it('DSS-015 — HR_ADMIN same entity may delete', async () => {
    h.user = { id: 'h1', name: 'HR', role: 'HR_ADMIN', personId: '', legalEntityId: 'entity-A' }
    h.selectRows = [{ ...OWN_DOC, sourceType: 'HR', employeeCanReplace: false }]
    const r = await deleteMyDocument('doc-1')
    expect(r).toEqual({ success: true })
  })

  it('DSS-016 — audit newValues records type, title, storageKey', async () => {
    await deleteMyDocument('doc-1')
    const ev = h.audit.mock.calls[0][0] as { newValues: Record<string, unknown> }
    expect(ev.newValues.documentType).toBe('PASSPORT')
    expect(ev.newValues.documentTitle).toBe('My Passport')
    expect(ev.newValues.storageKey).toBe('persons/person-self/p.pdf')
  })
})
