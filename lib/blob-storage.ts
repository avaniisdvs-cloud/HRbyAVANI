/**
 * Backward-compatible blob storage shim — AVANIIS HR.
 *
 * All real logic now lives in lib/storage/ (cloud-portable abstraction).
 * This module is kept as a thin wrapper so existing callers that import
 * from '@/lib/blob-storage' continue to work without changes.
 *
 * New code should import from '@/lib/storage' directly and call the
 * IDocumentStorage interface methods.
 *
 * Provider is selected by DOCUMENT_STORAGE_PROVIDER env var:
 *   azure  → Azure Blob Storage (AZURE_STORAGE_CONNECTION_STRING required)
 *   aws    → AWS S3 (AWS_REGION / AWS_ACCESS_KEY_ID / etc. required)
 *   local  → /tmp or public/uploads (UAT / local dev only)
 *   (unset) + NODE_ENV=production  → throws with a clear message
 *   (unset) + NODE_ENV≠production  → local fallback with a warning
 */
import { createHash, randomUUID } from 'crypto'
import { getStorageProvider }      from './storage'

// ── Re-export constants needed by photo-upload.ts ──────────────────────────────

/** 7-day SAS/pre-signed URL TTL for profile photos. */
export const PHOTO_SAS_TTL_MINUTES = 7 * 24 * 60

// ── Shared return type (kept for backward compatibility) ──────────────────────

export interface UploadedDocumentMeta {
  storageKey:     string  // full object key inside the container/bucket
  fileName:       string
  fileSizeBytes:  number
  mimeType:       string
  checksumSha256: string
  /**
   * Short-lived signed URL for the just-uploaded blob.
   * May be an empty string when the local provider cannot issue an HTTP URL
   * (e.g. file written to /tmp on Vercel in a non-production environment).
   * Callers must guard: `if (sasUrl) { ... }`.
   */
  sasUrl: string
}

// ── uploadDocument ─────────────────────────────────────────────────────────────

/**
 * Uploads a File / Blob / Buffer and returns metadata + a short-lived signed URL.
 * Storage key is scoped to the person: persons/{personId}/{uuid}{ext}.
 *
 * @deprecated Prefer calling `getStorageProvider().uploadFile()` directly with a
 *   pre-computed key so the calling module retains control over the object path.
 */
export async function uploadDocument(args: {
  personId:  string
  file:      File | Buffer
  fileName:  string
  mimeType?: string
}): Promise<UploadedDocumentMeta> {
  const { personId, file, fileName } = args
  const mimeType =
    args.mimeType ??
    (Buffer.isBuffer(file)
      ? 'application/octet-stream'
      : (file as File).type || 'application/octet-stream')

  const ext        = fileName.includes('.') ? `.${fileName.split('.').pop()}` : ''
  const storageKey = `persons/${personId}/${randomUUID()}${ext}`

  const buf: Buffer = Buffer.isBuffer(file)
    ? file
    : Buffer.from(await (file as File).arrayBuffer())
  const checksumSha256 = createHash('sha256').update(buf).digest('hex')

  const result = await getStorageProvider().uploadFile({
    key:      storageKey,
    data:     buf,
    mimeType,
    metadata: {
      personid:       personId,
      checksumsha256: checksumSha256,
      uploadedat:     new Date().toISOString(),
    },
  })

  return {
    storageKey:    result.storageKey,
    fileName,
    fileSizeBytes: result.fileSizeBytes,
    mimeType:      result.mimeType,
    checksumSha256,
    sasUrl:        result.signedUrl,
  }
}

// ── uploadBrandingAsset ────────────────────────────────────────────────────────

/**
 * Uploads a branding asset (logo, signature image) scoped to a legal entity.
 * Uses path entities/{entityId}/branding/{uuid}{ext}.
 *
 * @deprecated Prefer calling `getStorageProvider().uploadFile()` directly.
 */
export async function uploadBrandingAsset(args: {
  entityId:  string
  file:      File | Buffer
  fileName:  string
  mimeType?: string
}): Promise<UploadedDocumentMeta> {
  const { entityId, file, fileName } = args
  const mimeType =
    args.mimeType ??
    (Buffer.isBuffer(file)
      ? 'application/octet-stream'
      : (file as File).type || 'application/octet-stream')

  const ext        = fileName.includes('.') ? `.${fileName.split('.').pop()}` : ''
  const storageKey = `entities/${entityId}/branding/${randomUUID()}${ext}`

  const buf: Buffer = Buffer.isBuffer(file)
    ? file
    : Buffer.from(await (file as File).arrayBuffer())
  const checksumSha256 = createHash('sha256').update(buf).digest('hex')

  const result = await getStorageProvider().uploadFile({
    key:      storageKey,
    data:     buf,
    mimeType,
    metadata: {
      entityid:       entityId,
      checksumsha256: checksumSha256,
      uploadedat:     new Date().toISOString(),
    },
  })

  return {
    storageKey:    result.storageKey,
    fileName,
    fileSizeBytes: result.fileSizeBytes,
    mimeType:      result.mimeType,
    checksumSha256,
    sasUrl:        result.signedUrl,
  }
}

// ── getSasUrl ─────────────────────────────────────────────────────────────────

/**
 * Issues a fresh signed URL for an already-stored object.
 * @param storageKey — full object key (e.g. persons/{id}/doc.pdf)
 * @param ttlMinutes — defaults to 15; pass PHOTO_SAS_TTL_MINUTES for profile photos
 */
export async function getSasUrl(
  storageKey: string,
  ttlMinutes = 15,
): Promise<string> {
  return getStorageProvider().getSignedUrl(storageKey, ttlMinutes)
}

// ── deleteDocument ────────────────────────────────────────────────────────────

/**
 * Deletes an object — used during off-boarding and on failed-transaction rollback.
 * Best-effort: callers should catch rather than propagating.
 */
export async function deleteDocument(storageKey: string): Promise<void> {
  return getStorageProvider().deleteFile(storageKey)
}
