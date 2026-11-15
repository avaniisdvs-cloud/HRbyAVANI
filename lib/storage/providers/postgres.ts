/**
 * PostgreSQL bytea storage provider — durable in-database document storage.
 *
 * Stores file bytes in the `document_files` table (migration 0052) using the
 * existing DATABASE_URL connection.  Durable across Vercel container recycles and
 * redeployments with zero external cloud credentials — the document analog of the
 * profile-photo base64 fallback in modules/core-hr/photo-upload.ts.
 *
 * Selected by the factory when:
 *   DOCUMENT_STORAGE_PROVIDER=postgres | db          (explicit)
 *   DOCUMENT_STORAGE_PROVIDER unset + DATABASE_URL    (durable fallback)
 *
 * getSignedUrl returns '' — there is no direct HTTP path.  Bytes are streamed
 * through GET /api/documents/[id], which has a dedicated postgres branch
 * (mirrors how the local provider streams from /tmp).  fileExists is a cheap
 * SELECT, so the pre-flight existence check in getDocumentUrl runs for postgres
 * exactly as it does for local.
 *
 * No external dependencies — uses the shared Drizzle client only.
 */
import { createHash } from 'crypto'
import { eq } from 'drizzle-orm'
import { documentFiles } from '../../../drizzle/schema'
import type { IDocumentStorage, UploadArgs, UploadResult } from '../types'
import { DocumentStorageError } from '../types'

/**
 * Lazily resolves the shared Drizzle client.
 *
 * lib/db throws at module-eval time if DATABASE_URL is unset.  Importing it
 * statically here would make `import '@/lib/storage/factory'` fail in any
 * environment without a DB (e.g. unit tests).  Deferring the import to call
 * time keeps the factory import side-effect-free.
 */
async function getDb() {
  const { db } = await import('../../db')
  return db
}

export class PostgresStorageProvider implements IDocumentStorage {
  async uploadFile({ key, data, mimeType, metadata }: UploadArgs): Promise<UploadResult> {
    try {
      const checksumSha256 = createHash('sha256').update(data).digest('hex')
      const db = await getDb()

      await db
        .insert(documentFiles)
        .values({
          storageKey:     key,
          fileData:       data,
          mimeType,
          fileSizeBytes:  data.length,
          checksumSha256,
          metadata:       metadata ?? null,
        })
        .onConflictDoUpdate({
          target: documentFiles.storageKey,
          set: {
            fileData:       data,
            mimeType,
            fileSizeBytes:  data.length,
            checksumSha256,
            metadata:       metadata ?? null,
          },
        })

      return {
        storageKey:    key,
        fileSizeBytes: data.length,
        mimeType,
        checksumSha256,
        // No direct HTTP path — bytes are streamed via /api/documents/[id].
        signedUrl: '',
      }
    } catch (err) {
      if (err instanceof DocumentStorageError) throw err
      throw new DocumentStorageError('postgres', 'uploadFile', (err as Error).message ?? String(err), err)
    }
  }

  /**
   * No signed URL — bytes are served through the authenticated API route, which
   * reads them from the DB.  Returning '' is intentional and mirrors the local
   * /tmp provider; callers fall back to the /api/documents/[id] route URL.
   */
  async getSignedUrl(_key: string, _ttlMinutes = 15): Promise<string> {
    return ''
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const db = await getDb()
      await db.delete(documentFiles).where(eq(documentFiles.storageKey, key))
    } catch (err) {
      throw new DocumentStorageError('postgres', 'deleteFile', (err as Error).message ?? String(err), err)
    }
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const db = await getDb()
      const [row] = await db
        .select({ k: documentFiles.storageKey })
        .from(documentFiles)
        .where(eq(documentFiles.storageKey, key))
        .limit(1)
      return !!row
    } catch (err) {
      throw new DocumentStorageError('postgres', 'fileExists', (err as Error).message ?? String(err), err)
    }
  }

  async getMetadata(key: string): Promise<Record<string, string> | null> {
    try {
      const db = await getDb()
      const [row] = await db
        .select({
          metadata:       documentFiles.metadata,
          mimeType:       documentFiles.mimeType,
          checksumSha256: documentFiles.checksumSha256,
        })
        .from(documentFiles)
        .where(eq(documentFiles.storageKey, key))
        .limit(1)
      if (!row) return null
      return {
        ...(row.metadata ?? {}),
        mimeType:       row.mimeType,
        checksumSha256: row.checksumSha256 ?? '',
      }
    } catch {
      return null
    }
  }

  async getFileData(key: string): Promise<Buffer | null> {
    const result = await this.readFile(key)
    return result ? result.data : null
  }

  /**
   * Reads the raw bytes for a stored object.  Not part of IDocumentStorage —
   * used by the API route's postgres serving branch.  Returns null when absent.
   */
  async readFile(key: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const db = await getDb()
    const [row] = await db
      .select({ fileData: documentFiles.fileData, mimeType: documentFiles.mimeType })
      .from(documentFiles)
      .where(eq(documentFiles.storageKey, key))
      .limit(1)
    if (!row) return null
    return { data: Buffer.from(row.fileData), mimeType: row.mimeType }
  }
}
