/**
 * Storage provider factory — AVANIIS HR.
 *
 * Reads DOCUMENT_STORAGE_PROVIDER at runtime and returns a singleton
 * IDocumentStorage instance.  Each provider validates its required env vars
 * at construction time and throws a descriptive DocumentStorageError if
 * anything is missing.
 *
 * Production rule (enforced here):
 *   NODE_ENV=production + DOCUMENT_STORAGE_PROVIDER unset → throws with a
 *   user-visible message: "Document storage is not configured.  Please contact
 *   system administrator."
 *
 * Dev/UAT rule:
 *   NODE_ENV≠production + DOCUMENT_STORAGE_PROVIDER unset → LocalStorageProvider
 *   with a console.warn.  Files land in public/uploads/ (or /tmp when that is
 *   read-only) — ephemeral, suitable only for local development.
 *
 * Vercel rule (enforced here):
 *   Local storage on a deployed Vercel function is fundamentally broken —
 *   /tmp is scoped to a single container instance.  An upload request handled
 *   by Container A writes to A's /tmp; a subsequent download request may be
 *   served by Container B whose /tmp is empty.  This causes immediate
 *   FILE_MISSING even within the same deployment.
 *
 *   isVercelDeployed() = true when VERCEL_ENV is 'production' or 'preview'.
 *   isFileServingEnabled() = false when Vercel-deployed + local storage active.
 *   In that state upload, view and download are disabled at every layer
 *   (Server Action, API route, and UI) until a durable provider is configured.
 */
import { AzureBlobProvider }     from './providers/azure'
import { AWSS3Provider }         from './providers/aws'
import { LocalStorageProvider }  from './providers/local'
import { PostgresStorageProvider } from './providers/postgres'
import { DocumentStorageError, type IDocumentStorage } from './types'

/** The provider actually selected for the current environment. */
export type ActiveProvider = 'azure' | 'aws' | 'postgres' | 'local'

/**
 * Resolves which provider the factory will build, WITHOUT instantiating it.
 * Single source of truth for isLocalStorageActive / isPostgresStorageActive /
 * durability checks / the API route serving branch.
 *
 * Resolution:
 *   azure | aws | local           → that provider (explicit)
 *   postgres | db                 → PostgreSQL bytea
 *   unset + DATABASE_URL present  → PostgreSQL bytea (durable fallback)
 *   unset + no DATABASE_URL       → local (dev only; never reached on Vercel)
 */
export function getActiveProvider(): ActiveProvider {
  const p = process.env.DOCUMENT_STORAGE_PROVIDER?.toLowerCase().trim()
  if (p === 'azure') return 'azure'
  if (p === 'aws')   return 'aws'
  if (p === 'postgres' || p === 'db') return 'postgres'
  if (p === 'local') {
    // /tmp is fundamentally broken on a deployed Vercel function — the upload
    // container and the download container are different instances with
    // different /tmp contents, so files vanish immediately.  When a durable DB
    // is available, auto-upgrade an explicit `local` (typically left over from
    // earlier UAT) to the PostgreSQL provider instead of silently losing files.
    if (isVercelDeployed() && process.env.DATABASE_URL) return 'postgres'
    return 'local'
  }
  // Unset: prefer durable PostgreSQL when a DB is configured; else local dev.
  if (process.env.DATABASE_URL) return 'postgres'
  return 'local'
}

// ── Singleton cache ───────────────────────────────────────────────────────────

let _instance: IDocumentStorage | null = null

/**
 * Returns the singleton IDocumentStorage for this process / serverless container.
 * Call `resetStorageInstance()` in tests to clear the cache between test cases.
 */
export function getStorageProvider(): IDocumentStorage {
  if (_instance) return _instance
  _instance = buildProvider()
  return _instance
}

/** Clears the cached provider — for use in unit tests only. */
export function resetStorageInstance(): void {
  _instance = null
}

/**
 * Returns true when the active storage provider is the local/tmp provider.
 *
 * Local storage is ephemeral (lost on container recycle) and is ONLY selected
 * when DOCUMENT_STORAGE_PROVIDER=local is set explicitly, or when no DATABASE_URL
 * is available at all.  When DATABASE_URL is present and no provider is set, the
 * durable PostgreSQL provider is used instead — so this returns false.
 *
 * Does NOT instantiate the provider — reads env vars only, so it is safe to
 * call during SSR before any upload action is invoked.
 */
export function isLocalStorageActive(): boolean {
  return getActiveProvider() === 'local'
}

/**
 * Returns true when the active storage provider is the durable PostgreSQL bytea
 * provider (DOCUMENT_STORAGE_PROVIDER=postgres|db, or unset with DATABASE_URL).
 *
 * Used by the API route to choose the DB-streaming serving branch, and by
 * getDocumentUrl to run a cheap pre-flight existence check.
 */
export function isPostgresStorageActive(): boolean {
  return getActiveProvider() === 'postgres'
}

/**
 * Returns true when running on a deployed Vercel function (production or preview).
 *
 * Vercel sets VERCEL_ENV='production'|'preview' in serverless functions.
 * VERCEL_ENV='development' means `vercel dev` (local single-process) and is
 * intentionally excluded — that is still safe for local storage.
 */
export function isVercelDeployed(): boolean {
  const env = process.env.VERCEL_ENV
  return env === 'production' || env === 'preview'
}

// ── Storage mode (3-mode explicit switch) ────────────────────────────────────

/**
 * The storage operating mode for this deployment.  Set via DOCUMENT_STORAGE_MODE.
 *
 *  uat-temporary: Allow upload/view/download even with local/tmp storage.
 *                 Shows amber banner so users know files may become unavailable
 *                 due to serverless container isolation or redeployment.
 *                 Intended for Vercel UAT where ephemeral /tmp is acceptable.
 *  durable:       Requires a fully-configured durable provider (azure | aws).
 *                 If no durable provider is configured, file operations are blocked.
 *  disabled:      All file operations (upload/view/download) are explicitly hidden.
 *                 Document metadata is still visible.
 */
export type StorageMode = 'durable' | 'uat-temporary' | 'disabled'

/**
 * Returns the storage operating mode for this deployment.
 *
 * Resolution order:
 *  1. Explicit DOCUMENT_STORAGE_MODE env var (uat-temporary | durable | disabled)
 *  2. NODE_ENV=production → 'durable' (safe default — ops blocked without azure/aws)
 *  3. Otherwise           → 'uat-temporary' (dev/UAT default — ops allowed with warning)
 */
export function getStorageMode(): StorageMode {
  const explicit = process.env.DOCUMENT_STORAGE_MODE?.toLowerCase().trim()
  if (explicit === 'uat-temporary') return 'uat-temporary'
  if (explicit === 'disabled')      return 'disabled'
  if (explicit === 'durable')       return 'durable'
  if (process.env.NODE_ENV === 'production') return 'durable'
  return 'uat-temporary'
}

// ── Storage UI state ─────────────────────────────────────────────────────────

/**
 * What the UI (and file-serving layers) should do given the current configuration.
 *
 *  operational:    Durable provider (azure/aws) is fully configured. Full ops.
 *  uat-temporary:  Local/tmp storage.  Ops allowed with amber UAT warning.
 *  not-configured: Mode requires durable but no provider is configured. Ops blocked.
 *  disabled:       Ops explicitly disabled by DOCUMENT_STORAGE_MODE=disabled.
 */
export type StorageUIState = 'operational' | 'uat-temporary' | 'not-configured' | 'disabled'

/**
 * Returns true when a durable storage backend is fully configured.
 *
 * Durable backends: Azure Blob, AWS S3, and PostgreSQL bytea (data lives in the
 * DB, surviving container recycles and redeployments).  The only non-durable
 * provider is local /tmp.
 */
function _isDurableProviderConfigured(): boolean {
  const provider = getActiveProvider()
  if (provider === 'postgres') {
    // PostgreSQL bytea is durable; requires the shared DB connection.
    return !!process.env.DATABASE_URL
  }
  if (provider === 'azure') {
    return !!process.env.AZURE_STORAGE_CONNECTION_STRING
  }
  if (provider === 'aws') {
    return !!(
      process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_S3_BUCKET_NAME
    )
  }
  // local
  return false
}

/**
 * Returns the storage UI state for the current deployment configuration.
 *
 * Call this in Server Components / API routes to determine which banners/buttons
 * to render and whether to block file-serving requests.
 */
export function getStorageUIState(): StorageUIState {
  const mode = getStorageMode()
  if (mode === 'disabled')            return 'disabled'
  if (_isDurableProviderConfigured()) return 'operational'
  if (mode === 'durable')             return 'not-configured'
  return 'uat-temporary'
}

/**
 * Returns true when file upload, serving and download are allowed in the
 * current environment.
 *
 * Delegates to getStorageUIState() — both 'operational' and 'uat-temporary'
 * permit file operations. 'not-configured' and 'disabled' block them.
 *
 * Call this at every file-operation boundary (Server Action + API route).
 */
export function isFileServingEnabled(): boolean {
  const state = getStorageUIState()
  return state === 'operational' || state === 'uat-temporary'
}

// ── Internal factory ──────────────────────────────────────────────────────────

function buildProvider(): IDocumentStorage {
  const rawProviderEnv = process.env.DOCUMENT_STORAGE_PROVIDER?.toLowerCase().trim()
  const isProduction   = process.env.NODE_ENV === 'production'

  // Reject genuinely unknown values early (anything other than the known set,
  // 'db' alias, or unset).
  const KNOWN = new Set(['azure', 'aws', 'local', 'postgres', 'db'])
  if (rawProviderEnv && !KNOWN.has(rawProviderEnv)) {
    throw new DocumentStorageError(
      'factory',
      'create',
      `Unknown DOCUMENT_STORAGE_PROVIDER: "${rawProviderEnv}". Valid values: azure | aws | postgres | db | local`,
    )
  }

  // getActiveProvider() resolves the unset case (→ postgres when DATABASE_URL is
  // present, else local), so there is no production throw when a DB is available.
  const provider = getActiveProvider()

  switch (provider) {
    case 'azure':    return buildAzureProvider()
    case 'aws':      return buildAwsProvider()
    case 'postgres': return new PostgresStorageProvider()
    case 'local': {
      // Reached only when DOCUMENT_STORAGE_PROVIDER=local is explicit, or nothing
      // is configured at all (no provider AND no DATABASE_URL).
      if (!rawProviderEnv && isProduction) {
        // No provider and no DATABASE_URL in production — genuine misconfiguration.
        throw new DocumentStorageError(
          'factory',
          'create',
          'Document storage is not configured. Please contact system administrator.',
        )
      }
      if (!rawProviderEnv) {
        console.warn(
          '[storage-factory] No DOCUMENT_STORAGE_PROVIDER and no DATABASE_URL. ' +
          'Using local /tmp fallback — development only.',
        )
      }
      return buildLocalProvider(isProduction)
    }
  }
}

function buildAzureProvider(): AzureBlobProvider {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connStr) {
    throw new DocumentStorageError(
      'azure',
      'init',
      'AZURE_STORAGE_CONNECTION_STRING is required when DOCUMENT_STORAGE_PROVIDER=azure. ' +
      'Obtain it from Azure Portal → Storage Account → Access keys.',
    )
  }
  return new AzureBlobProvider(connStr)
}

function buildAwsProvider(): AWSS3Provider {
  const region    = process.env.AWS_REGION
  const accessKey = process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY
  const bucket    = process.env.AWS_S3_BUCKET_NAME

  const missing = [
    !region    && 'AWS_REGION',
    !accessKey && 'AWS_ACCESS_KEY_ID',
    !secretKey && 'AWS_SECRET_ACCESS_KEY',
    !bucket    && 'AWS_S3_BUCKET_NAME',
  ].filter(Boolean) as string[]

  if (missing.length > 0) {
    throw new DocumentStorageError(
      'aws',
      'init',
      `Missing required env var(s) for AWS S3 provider: ${missing.join(', ')}. ` +
      'See docs/deployment-aws.md for the full env var matrix.',
    )
  }

  return new AWSS3Provider(region!, accessKey!, secretKey!, bucket!)
}

function buildLocalProvider(isProduction: boolean): LocalStorageProvider {
  if (isProduction) {
    // Explicit opt-in to local provider in production is allowed (e.g. isolated
    // QA smoke test on a non-customer environment), but we warn loudly.
    console.warn(
      '[storage-factory] DOCUMENT_STORAGE_PROVIDER=local in a production environment. ' +
      'Files are ephemeral and will be lost when the function container recycles. ' +
      'This configuration is only suitable for isolated QA environments.',
    )
  }
  return new LocalStorageProvider()
}
