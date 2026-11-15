// @vitest-environment node
/**
 * CHAOS-008b — Document storage failure resilience tests.
 *
 * Current profile-photo behavior is provider-agnostic:
 *   - profilePhotoData is always persisted as a durable base64 data URL.
 *   - cloud/provider upload is best-effort.
 *   - raw storage provider errors must not be returned to callers.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('drizzle-orm', () => ({
  eq:        vi.fn(() => ({ type: 'eq' })),
  and:       vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  relations: () => ({}),
}))

vi.mock('@/lib/constants', () => ({ TENANT_ID: '00000000-0000-0000-0000-000000000001' }))

vi.mock('next/cache',      () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

vi.mock('@/drizzle/schema', () => ({
  persons: {
    id:               'id',
    tenantId:         'tenantId',
    legalEntityId:    'legalEntityId',
    profilePhotoUrl:  'profilePhotoUrl',
    profilePhotoData: 'profilePhotoData',
    lastUpdatedDate:  'lastUpdatedDate',
    updatedBy:        'updatedBy',
    updatedByName:    'updatedByName',
    updatedDate:      'updatedDate',
  },
  workerAssignments: {},
  absenceBalances:   {},
  absenceTypes:      {},
}))

vi.mock('@/drizzle/schema/workflow-engine', () => ({
  workflowInstancesV2:   {},
  workflowStepInstances: {},
}))

const PERSON_ID = 'person-001'
const ENTITY_ID = '11111111-1111-1111-1111-111111111111'

function photoForm(mimeType: string, size = 100): FormData {
  const ext = mimeType.split('/')[1] ?? 'jpg'
  const file = new File([Buffer.alloc(size).fill(0xff)], `photo.${ext}`, { type: mimeType })
  const form = new FormData()
  form.set('photo', file)
  return form
}

function makeTx() {
  return {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  }
}

function mockPhotoUploadRuntime(storageError: Error, transactionSpy = vi.fn()) {
  vi.doMock('@/lib/blob-storage', () => ({
    PHOTO_SAS_TTL_MINUTES: 7 * 24 * 60,
  }))
  vi.doMock('@/lib/storage', () => ({
    getStorageProvider: vi.fn(() => ({
      uploadFile:   vi.fn().mockRejectedValue(storageError),
      getSignedUrl: vi.fn(),
    })),
  }))
  vi.doMock('@/lib/auth', () => ({
    auth: vi.fn(),
    requireRole: vi.fn().mockResolvedValue({
      id:            'user-chaos-hr',
      name:          'HR Admin',
      email:         'hr.admin@avaniis.dev',
      role:          'HR_ADMIN',
      legalEntityId: ENTITY_ID,
    }),
  }))
  vi.doMock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
  vi.doMock('@/lib/db', () => ({
    db: {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: PERSON_ID, legalEntityId: ENTITY_ID }]),
          }),
        }),
      })),
      transaction: transactionSpy.mockImplementation(
        async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => fn(makeTx()),
      ),
    },
  }))
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('CHAOS-008b — storage provider failure fallback (uploadProfilePhoto)', () => {
  it('C8B-001: storage upload failure returns durable base64 fallback', async () => {
    mockPhotoUploadRuntime(
      new Error('BlobServiceClient: AuthenticationFailed - Signature does not match'),
    )

    const { uploadProfilePhoto } = await import('@/modules/core-hr/photo-upload')
    const result = await uploadProfilePhoto(PERSON_ID, photoForm('image/jpeg'))

    expect(result.photoUrl).toMatch(/^data:image\/jpeg;base64,/)
    expect(result.photoData).toBe(result.photoUrl)
  })

  it('C8B-002: person DB transaction persists fallback data when storage upload fails', async () => {
    const transactionSpy = vi.fn()
    mockPhotoUploadRuntime(new Error('ServiceUnavailableError: busy'), transactionSpy)

    const { uploadProfilePhoto } = await import('@/modules/core-hr/photo-upload')
    const result = await uploadProfilePhoto(PERSON_ID, photoForm('image/png', 50))

    expect(result.photoUrl).toMatch(/^data:image\/png;base64,/)
    expect(transactionSpy).toHaveBeenCalledTimes(1)
  })

  it('C8B-003: fallback result does not expose raw provider error details', async () => {
    mockPhotoUploadRuntime(
      new Error('StorageErrorCode: AuthenticationFailed - SharedKeyLite key: avaniis-storage-prod'),
    )

    const { uploadProfilePhoto } = await import('@/modules/core-hr/photo-upload')
    const result = await uploadProfilePhoto(PERSON_ID, photoForm('image/webp', 50))
    const serialized = JSON.stringify(result)

    expect(serialized).not.toMatch(/avaniis-storage-prod|SharedKeyLite|AuthenticationFailed/i)
    expect(result.photoUrl).toMatch(/^data:image\/webp;base64,/)
  })
})

describe('CHAOS-008b — storage abstraction source-level verification', () => {
  it('C8B-004: lib/blob-storage.ts delegates to getStorageProvider', async () => {
    const fs = await import('fs')
    const blobSource = fs.readFileSync(
      new URL('../../lib/blob-storage.ts', import.meta.url).pathname,
      'utf8',
    )

    expect(blobSource).toContain('getStorageProvider')
    expect(blobSource).toContain('uploadFile')
    expect(blobSource).toContain('getSignedUrl')
    expect(blobSource).toContain('PHOTO_SAS_TTL_MINUTES')
  })

  it('C8B-005: uploadProfilePhoto uses storage provider abstraction with safe error handling', async () => {
    const fs = await import('fs')
    const photoSource = fs.readFileSync(
      new URL('../../modules/core-hr/photo-upload.ts', import.meta.url).pathname,
      'utf8',
    )

    expect(photoSource).toContain('getStorageProvider')
    expect(photoSource).toContain('storage.uploadFile')
    expect(photoSource).toContain('Cloud storage unavailable')
    expect(photoSource).toContain("translateError(e, 'uploadProfilePhoto')")
  })

  it('C8B-006: DB transaction runs after storage attempt and fallback data creation', async () => {
    const fs = await import('fs')
    const photoSource = fs.readFileSync(
      new URL('../../modules/core-hr/photo-upload.ts', import.meta.url).pathname,
      'utf8',
    )
    const fallbackPos = photoSource.indexOf('base64DataUrl')
    const uploadPos   = photoSource.indexOf('storage.uploadFile')
    const txPos       = photoSource.indexOf('db.transaction')

    expect(fallbackPos).toBeGreaterThan(0)
    expect(uploadPos).toBeGreaterThan(0)
    expect(txPos).toBeGreaterThan(fallbackPos)
    expect(txPos).toBeGreaterThan(uploadPos)
  })
})
