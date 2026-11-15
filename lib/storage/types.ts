/**
 * Cloud-portable document storage abstraction — AVANIIS HR.
 *
 * Business modules MUST only call through IDocumentStorage.
 * Never import @azure/storage-blob or @aws-sdk/* directly in modules/.
 *
 * Provider selection at runtime:
 *   DOCUMENT_STORAGE_PROVIDER=azure  → AzureBlobProvider
 *   DOCUMENT_STORAGE_PROVIDER=aws    → AWSS3Provider
 *   DOCUMENT_STORAGE_PROVIDER=local  → LocalStorageProvider (UAT only)
 *   (unset) + NODE_ENV=development   → LocalStorageProvider with warning
 *   (unset) + NODE_ENV=production    → throws DocumentStorageError
 *
 * See docs/deployment-azure.md and docs/deployment-aws.md for env var matrices.
 */

// ── Upload ────────────────────────────────────────────────────────────────────

export interface UploadArgs {
  /** Destination key inside the bucket/container (e.g. persons/{uuid}/doc.pdf). */
  key:      string
  /** Raw bytes to store. */
  data:     Buffer
  mimeType: string
  /** Optional key-value metadata stored alongside the object. */
  metadata?: Record<string, string>
}

export interface UploadResult {
  storageKey:     string
  fileSizeBytes:  number
  mimeType:       string
  checksumSha256: string
  /**
   * Pre-signed / SAS URL valid for ~DEFAULT_URL_TTL_MINUTES.
   * Empty string when the provider cannot issue a URL at upload time (local
   * provider in some configurations). Callers must check before displaying.
   */
  signedUrl: string
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface IDocumentStorage {
  /**
   * Upload raw bytes under `key` and return an UploadResult that includes a
   * short-lived signed URL for immediate display.
   * Throws DocumentStorageError on unrecoverable failure.
   */
  uploadFile(args: UploadArgs): Promise<UploadResult>

  /**
   * Issue a fresh pre-signed / SAS URL for an already-stored object.
   * @param ttlMinutes - defaults to 15; use PHOTO_SAS_TTL_MINUTES (7 days) for profile photos.
   */
  getSignedUrl(key: string, ttlMinutes?: number): Promise<string>

  /**
   * Delete an object from backing storage.
   * Used during off-boarding and on rollback after a failed DB transaction.
   * Best-effort — callers should catch and log rather than propagating.
   */
  deleteFile(key: string): Promise<void>

  /** Returns true when the object is present in backing storage. */
  fileExists(key: string): Promise<boolean>

  /**
   * Returns provider-stored metadata, or null when the object is absent or
   * metadata cannot be retrieved.
   */
  getMetadata(key: string): Promise<Record<string, string> | null>

  /**
   * Returns the raw bytes for a stored object, or null when absent.
   * Used by migration sessions and other server-side read-back needs that don't
   * require an HTTP URL (as opposed to getSignedUrl which returns a URL).
   */
  getFileData(key: string): Promise<Buffer | null>
}

// ── Provider identifier ───────────────────────────────────────────────────────

/** Valid values for the DOCUMENT_STORAGE_PROVIDER env var. ('db' is an alias for 'postgres'.) */
export type StorageProviderName = 'azure' | 'aws' | 'local' | 'postgres' | 'db'

// ── Error ─────────────────────────────────────────────────────────────────────

/**
 * Thrown by storage operations on unrecoverable failure, and by the factory
 * when provider configuration is missing or invalid.
 */
export class DocumentStorageError extends Error {
  constructor(
    public readonly provider: string,
    public readonly operation: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[storage:${provider}:${operation}] ${message}`)
    this.name = 'DocumentStorageError'
  }
}
