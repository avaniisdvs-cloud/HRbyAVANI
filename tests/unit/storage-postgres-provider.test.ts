/**
 * PostgresStorageProvider — Unit Tests (PG-001–010)
 *
 * Durable in-DB document storage (migration 0052, document_files bytea).
 * The shared Drizzle client (@/lib/db) is mocked so no real DATABASE_URL or
 * Postgres connection is required.  The provider lazy-imports @/lib/db inside
 * each method, so the mock is resolved at call time.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock the shared DB client ───────────────────────────────────────────────────
// vi.hoisted so the handles exist before the hoisted vi.mock factory runs.
const pg = vi.hoisted(() => ({
  insertOnConflict: vi.fn<unknown[], Promise<void>>(),
  deleteWhere:      vi.fn<unknown[], Promise<void>>(),
  selectRows:       [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: (...a: unknown[]) => pg.insertOnConflict(...a),
      }),
    }),
    delete: () => ({
      where: (...a: unknown[]) => pg.deleteWhere(...a),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(pg.selectRows),
        }),
      }),
    }),
  },
}))

import { PostgresStorageProvider } from '@/lib/storage/providers/postgres'

const KEY  = 'persons/abc/doc.pdf'
const DATA = Buffer.from('%PDF-1.4 fake pdf bytes')
const MIME = 'application/pdf'

describe('PostgresStorageProvider', () => {
  beforeEach(() => {
    pg.insertOnConflict.mockReset().mockResolvedValue(undefined)
    pg.deleteWhere.mockReset().mockResolvedValue(undefined)
    pg.selectRows = []
  })

  it('PG-001: uploadFile returns storageKey, size, sha256 (64 hex), empty signedUrl', async () => {
    const provider = new PostgresStorageProvider()
    const result = await provider.uploadFile({ key: KEY, data: DATA, mimeType: MIME })
    expect(result.storageKey).toBe(KEY)
    expect(result.fileSizeBytes).toBe(DATA.length)
    expect(result.mimeType).toBe(MIME)
    expect(result.checksumSha256).toHaveLength(64)
    expect(result.signedUrl).toBe('')
  })

  it('PG-002: uploadFile performs an upsert (insert ... onConflictDoUpdate)', async () => {
    const provider = new PostgresStorageProvider()
    await provider.uploadFile({ key: KEY, data: DATA, mimeType: MIME })
    expect(pg.insertOnConflict).toHaveBeenCalledTimes(1)
  })

  it('PG-003: uploadFile wraps DB failure in DocumentStorageError', async () => {
    pg.insertOnConflict.mockRejectedValueOnce(new Error('boom'))
    const provider = new PostgresStorageProvider()
    await expect(provider.uploadFile({ key: KEY, data: DATA, mimeType: MIME }))
      .rejects.toThrow('[storage:postgres:uploadFile]')
  })

  it('PG-004: getSignedUrl always returns empty string (served via API route)', async () => {
    const provider = new PostgresStorageProvider()
    expect(await provider.getSignedUrl(KEY)).toBe('')
    expect(await provider.getSignedUrl(KEY, 7 * 24 * 60)).toBe('')
  })

  it('PG-005: fileExists returns true when a row is present', async () => {
    pg.selectRows = [{ k: KEY }]
    const provider = new PostgresStorageProvider()
    expect(await provider.fileExists(KEY)).toBe(true)
  })

  it('PG-006: fileExists returns false when no row', async () => {
    pg.selectRows = []
    const provider = new PostgresStorageProvider()
    expect(await provider.fileExists(KEY)).toBe(false)
  })

  it('PG-007: deleteFile issues a delete and resolves', async () => {
    const provider = new PostgresStorageProvider()
    await expect(provider.deleteFile(KEY)).resolves.toBeUndefined()
    expect(pg.deleteWhere).toHaveBeenCalledTimes(1)
  })

  it('PG-008: getMetadata merges stored metadata with mimeType + checksum', async () => {
    pg.selectRows = [{ metadata: { personid: 'p1' }, mimeType: MIME, checksumSha256: 'abc123' }]
    const provider = new PostgresStorageProvider()
    const meta = await provider.getMetadata(KEY)
    expect(meta).toEqual({ personid: 'p1', mimeType: MIME, checksumSha256: 'abc123' })
  })

  it('PG-009: getMetadata returns null when absent', async () => {
    pg.selectRows = []
    const provider = new PostgresStorageProvider()
    expect(await provider.getMetadata(KEY)).toBeNull()
  })

  it('PG-010: readFile returns Buffer + mimeType for the API serving branch', async () => {
    pg.selectRows = [{ fileData: DATA, mimeType: MIME }]
    const provider = new PostgresStorageProvider()
    const file = await provider.readFile(KEY)
    expect(file).not.toBeNull()
    expect(Buffer.isBuffer(file!.data)).toBe(true)
    expect(file!.data.toString()).toBe(DATA.toString())
    expect(file!.mimeType).toBe(MIME)
  })

  it('PG-011: readFile returns null when absent', async () => {
    pg.selectRows = []
    const provider = new PostgresStorageProvider()
    expect(await provider.readFile(KEY)).toBeNull()
  })
})
