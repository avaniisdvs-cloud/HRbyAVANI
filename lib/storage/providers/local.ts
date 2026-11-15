/**
 * Local/tmp storage provider — UAT and local development ONLY.
 *
 * Files are written to {cwd}/public/uploads/ when that path is writable (local
 * development on macOS/Linux), giving a real HTTP path at /uploads/{key}.
 * On Vercel / read-only filesystems the fallback is /tmp/avaniis-uploads/;
 * getSignedUrl returns an empty string in that case — the browser cannot display
 * the file, which is acceptable because this provider must never run in production.
 *
 * The factory will NEVER select this provider when NODE_ENV=production and
 * DOCUMENT_STORAGE_PROVIDER is unset.  Explicitly setting
 * DOCUMENT_STORAGE_PROVIDER=local in production is an intentional override
 * (e.g. QA smoke on a non-customer environment) and is allowed.
 *
 * No external dependencies — uses Node.js fs module only.
 */
import * as fs   from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import type { IDocumentStorage, UploadArgs, UploadResult } from '../types'
import { DocumentStorageError } from '../types'

/** Try public/uploads first; fall back to /tmp when the directory is read-only. */
function resolvePaths(key: string): { dest: string; publicUrl: string | null } {
  const publicDir  = path.join(process.cwd(), 'public', 'uploads')
  const publicDest = path.join(publicDir, key)
  try {
    fs.mkdirSync(path.dirname(publicDest), { recursive: true })
    // Touch a test file to confirm writability without creating the actual file yet
    fs.accessSync(path.dirname(publicDest), fs.constants.W_OK)
    return { dest: publicDest, publicUrl: `/uploads/${key}` }
  } catch {
    // Fallback: /tmp (writable on Vercel but ephemeral)
    const tmpDest = path.join('/tmp', 'avaniis-uploads', key)
    fs.mkdirSync(path.dirname(tmpDest), { recursive: true })
    return { dest: tmpDest, publicUrl: null }
  }
}

export class LocalStorageProvider implements IDocumentStorage {
  async uploadFile({ key, data, mimeType, metadata }: UploadArgs): Promise<UploadResult> {
    try {
      const checksumSha256 = createHash('sha256').update(data).digest('hex')
      const { dest, publicUrl } = resolvePaths(key)

      fs.writeFileSync(dest, data)

      // Write a sidecar metadata file for getMetadata() support
      const metaPath = dest + '.meta.json'
      fs.writeFileSync(
        metaPath,
        JSON.stringify({
          ...metadata,
          mimeType,
          checksumSha256,
          uploadedAt: new Date().toISOString(),
        }),
      )

      return {
        storageKey:    key,
        fileSizeBytes: data.length,
        mimeType,
        checksumSha256,
        signedUrl: publicUrl ?? '',
      }
    } catch (err) {
      if (err instanceof DocumentStorageError) throw err
      throw new DocumentStorageError('local', 'uploadFile', (err as Error).message ?? String(err), err)
    }
  }

  async getSignedUrl(key: string, _ttlMinutes = 15): Promise<string> {
    // Return a relative HTTP path if the file is in public/uploads
    const publicDest = path.join(process.cwd(), 'public', 'uploads', key)
    if (fs.existsSync(publicDest)) return `/uploads/${key}`

    // File is in /tmp — no HTTP path available
    const tmpDest = path.join('/tmp', 'avaniis-uploads', key)
    if (fs.existsSync(tmpDest)) {
      console.warn(
        `[local-storage] File at /tmp/avaniis-uploads/${key} has no HTTP URL. ` +
        'Set DOCUMENT_STORAGE_PROVIDER=azure or aws for persistent storage with URLs.',
      )
    }
    return ''
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const publicDest = path.join(process.cwd(), 'public', 'uploads', key)
      const tmpDest    = path.join('/tmp', 'avaniis-uploads', key)

      for (const dest of [publicDest, tmpDest]) {
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
        const meta = dest + '.meta.json'
        if (fs.existsSync(meta)) fs.unlinkSync(meta)
      }
    } catch (err) {
      throw new DocumentStorageError('local', 'deleteFile', (err as Error).message ?? String(err), err)
    }
  }

  async fileExists(key: string): Promise<boolean> {
    const publicDest = path.join(process.cwd(), 'public', 'uploads', key)
    const tmpDest    = path.join('/tmp', 'avaniis-uploads', key)
    return fs.existsSync(publicDest) || fs.existsSync(tmpDest)
  }

  async getFileData(key: string): Promise<Buffer | null> {
    const publicDest = path.join(process.cwd(), 'public', 'uploads', key)
    const tmpDest    = path.join('/tmp', 'avaniis-uploads', key)
    for (const dest of [publicDest, tmpDest]) {
      if (fs.existsSync(dest)) {
        try { return fs.readFileSync(dest) } catch { return null }
      }
    }
    return null
  }

  async getMetadata(key: string): Promise<Record<string, string> | null> {
    const publicDest = path.join(process.cwd(), 'public', 'uploads', key)
    const tmpDest    = path.join('/tmp', 'avaniis-uploads', key)

    for (const dest of [publicDest, tmpDest]) {
      const metaPath = dest + '.meta.json'
      if (fs.existsSync(metaPath)) {
        try {
          return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<string, string>
        } catch {
          return null
        }
      }
    }
    return null
  }
}
