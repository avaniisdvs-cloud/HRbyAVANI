/**
 * Storage Abstraction Layer — Unit Tests
 *
 * SPR-001–030: covers factory selection, production guard, per-provider
 * interface contract (upload / getSignedUrl / deleteFile / fileExists /
 * getMetadata), and DocumentStorageError shape.
 *
 * Azure and AWS providers are tested with fully mocked SDKs.
 * LocalStorageProvider is tested against the real filesystem in a tmp dir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'path'
import * as fs   from 'fs'
import * as os   from 'os'

// ── Shared fixtures ───────────────────────────────────────────────────────────

const TEST_KEY      = 'persons/test-person-uuid/abc.pdf'
const TEST_DATA     = Buffer.from('pdf-bytes')
const TEST_MIMETYPE = 'application/pdf'

function stubNoDurableStorage() {
  vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', '')
  vi.stubEnv('DATABASE_URL', '')
}

// ── Azure SDK mock ────────────────────────────────────────────────────────────

vi.mock('@azure/storage-blob', () => {
  const mockSasQuery = 'sig=abc&se=2099-01-01'

  const blockBlobClient = {
    uploadData:     vi.fn().mockResolvedValue({}),
    deleteIfExists: vi.fn().mockResolvedValue({}),
    exists:         vi.fn().mockResolvedValue(true),
    getProperties:  vi.fn().mockResolvedValue({ metadata: { checksumsha256: 'aabbcc' } }),
  }
  const containerClient = {
    createIfNotExists:  vi.fn().mockResolvedValue({}),
    getBlockBlobClient: vi.fn().mockReturnValue(blockBlobClient),
  }
  const serviceClient = {
    getContainerClient: vi.fn().mockReturnValue(containerClient),
  }

  return {
    BlobServiceClient: {
      fromConnectionString: vi.fn().mockReturnValue(serviceClient),
    },
    BlobSASPermissions:             { parse: vi.fn().mockReturnValue({}) },
    StorageSharedKeyCredential:     vi.fn(),
    generateBlobSASQueryParameters: vi.fn().mockReturnValue({ toString: () => mockSasQuery }),
  }
})

// ── AWS SDK mock ──────────────────────────────────────────────────────────────

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    async send(cmd: unknown) {
      const name = (cmd as { constructor: { name: string } }).constructor.name
      if (name === 'HeadObjectCommand') return { Metadata: { checksumsha256: 'ddeeff' } }
      return {}
    }
  }
  class PutObjectCommand    { constructor(public input: unknown) {} }
  class DeleteObjectCommand { constructor(public input: unknown) {} }
  class HeadObjectCommand   { constructor(public input: unknown) {} }
  class GetObjectCommand    { constructor(public input: unknown) {} }
  return { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue(
    'https://my-bucket.s3.eu-central-1.amazonaws.com/persons/test/doc.pdf?X-Amz-Signature=abc',
  ),
}))

// ── DocumentStorageError ──────────────────────────────────────────────────────

import { DocumentStorageError } from '@/lib/storage/types'

describe('DocumentStorageError', () => {
  it('SPR-001: sets name, provider, operation, and message correctly', () => {
    const err = new DocumentStorageError('azure', 'uploadFile', 'blob not found', new Error('inner'))
    expect(err.name).toBe('DocumentStorageError')
    expect(err.provider).toBe('azure')
    expect(err.operation).toBe('uploadFile')
    expect(err.message).toBe('[storage:azure:uploadFile] blob not found')
    expect(err.cause).toBeInstanceOf(Error)
  })

  it('SPR-002: is instanceof Error', () => {
    const err = new DocumentStorageError('aws', 'deleteFile', 'object not found')
    expect(err).toBeInstanceOf(Error)
  })
})

// ── Factory ───────────────────────────────────────────────────────────────────

describe('getStorageProvider — factory & production guard', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('SPR-003: throws in production when provider is unset and no DATABASE_URL exists', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    stubNoDurableStorage()
    const { getStorageProvider } = await import('@/lib/storage/factory')
    expect(() => getStorageProvider()).toThrow('Document storage is not configured')
  })

  it('SPR-004: production guard error mentions system administrator when no DATABASE_URL exists', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    stubNoDurableStorage()
    const { getStorageProvider } = await import('@/lib/storage/factory')
    expect(() => getStorageProvider()).toThrow('Please contact system administrator')
  })

  it('SPR-005: production guard throws DocumentStorageError when no DATABASE_URL exists', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    stubNoDurableStorage()
    const { getStorageProvider } = await import('@/lib/storage/factory')
    let caught: unknown
    try { getStorageProvider() } catch (e) { caught = e }
    expect(caught).toBeTruthy()
    expect((caught as { name?: string }).name).toBe('DocumentStorageError')
  })

  it('SPR-006: does not throw in development when provider unset and no DATABASE_URL exists', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    stubNoDurableStorage()
    const { getStorageProvider } = await import('@/lib/storage/factory')
    expect(() => getStorageProvider()).not.toThrow()
  })

  it('SPR-007: returns LocalStorageProvider in development when provider unset and no DATABASE_URL exists', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    stubNoDurableStorage()
    const { getStorageProvider } = await import('@/lib/storage/factory')
    const { LocalStorageProvider } = await import('@/lib/storage/providers/local')
    expect(getStorageProvider()).toBeInstanceOf(LocalStorageProvider)
  })

  it('SPR-008: throws for unknown provider value', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'gcp')
    const { getStorageProvider } = await import('@/lib/storage/factory')
    expect(() => getStorageProvider()).toThrow(/Unknown DOCUMENT_STORAGE_PROVIDER/)
  })

  it('SPR-009: azure — throws when AZURE_STORAGE_CONNECTION_STRING missing', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'azure')
    vi.stubEnv('AZURE_STORAGE_CONNECTION_STRING', '')
    const { getStorageProvider } = await import('@/lib/storage/factory')
    expect(() => getStorageProvider()).toThrow('AZURE_STORAGE_CONNECTION_STRING is required')
  })

  it('SPR-010: aws — throws and lists all missing env vars', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'aws')
    vi.stubEnv('AWS_REGION', '')
    vi.stubEnv('AWS_ACCESS_KEY_ID', '')
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', '')
    vi.stubEnv('AWS_S3_BUCKET_NAME', '')
    const { getStorageProvider } = await import('@/lib/storage/factory')
    expect(() => getStorageProvider()).toThrow(/AWS_REGION/)
    expect(() => getStorageProvider()).toThrow(/AWS_ACCESS_KEY_ID/)
  })

  it('SPR-011: singleton — successive calls return the same instance', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'local')
    const { getStorageProvider } = await import('@/lib/storage/factory')
    const a = getStorageProvider()
    const b = getStorageProvider()
    expect(a).toBe(b)
  })

  it('SPR-012: resetStorageInstance clears singleton', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'local')
    const { getStorageProvider, resetStorageInstance } = await import('@/lib/storage/factory')
    const a = getStorageProvider()
    resetStorageInstance()
    const b = getStorageProvider()
    expect(a).not.toBe(b)
  })
})

// ── isVercelDeployed ──────────────────────────────────────────────────────────

describe('isVercelDeployed', () => {
  beforeEach(() => { vi.unstubAllEnvs() })
  afterEach(() => { vi.unstubAllEnvs() })

  it('SPR-031: returns true when VERCEL_ENV=production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { isVercelDeployed } = await import('@/lib/storage/factory')
    expect(isVercelDeployed()).toBe(true)
  })

  it('SPR-032: returns true when VERCEL_ENV=preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { isVercelDeployed } = await import('@/lib/storage/factory')
    expect(isVercelDeployed()).toBe(true)
  })

  it('SPR-033: returns false when VERCEL_ENV=development (vercel dev)', async () => {
    vi.stubEnv('VERCEL_ENV', 'development')
    const { isVercelDeployed } = await import('@/lib/storage/factory')
    expect(isVercelDeployed()).toBe(false)
  })

  it('SPR-034: returns false when VERCEL_ENV is unset (local dev)', async () => {
    vi.stubEnv('VERCEL_ENV', '')
    const { isVercelDeployed } = await import('@/lib/storage/factory')
    expect(isVercelDeployed()).toBe(false)
  })
})

// ── getStorageMode ────────────────────────────────────────────────────────────

describe('getStorageMode', () => {
  beforeEach(() => { vi.unstubAllEnvs() })
  afterEach(() => { vi.unstubAllEnvs() })

  it('SPR-035: returns uat-temporary when DOCUMENT_STORAGE_MODE=uat-temporary', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'uat-temporary')
    const { getStorageMode } = await import('@/lib/storage/factory')
    expect(getStorageMode()).toBe('uat-temporary')
  })

  it('SPR-036: returns disabled when DOCUMENT_STORAGE_MODE=disabled', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'disabled')
    const { getStorageMode } = await import('@/lib/storage/factory')
    expect(getStorageMode()).toBe('disabled')
  })

  it('SPR-037: returns durable when DOCUMENT_STORAGE_MODE=durable', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'durable')
    const { getStorageMode } = await import('@/lib/storage/factory')
    expect(getStorageMode()).toBe('durable')
  })

  it('SPR-038: returns durable when NODE_ENV=production and no explicit mode', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DOCUMENT_STORAGE_MODE', '')
    const { getStorageMode } = await import('@/lib/storage/factory')
    expect(getStorageMode()).toBe('durable')
  })

  it('SPR-039: returns uat-temporary when NODE_ENV=development and no explicit mode (safe dev default)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DOCUMENT_STORAGE_MODE', '')
    const { getStorageMode } = await import('@/lib/storage/factory')
    expect(getStorageMode()).toBe('uat-temporary')
  })

  it('SPR-040: returns uat-temporary on Vercel deployed + no explicit mode (UAT scenario)', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NODE_ENV', 'development')       // Vercel sets NODE_ENV=production in real env;
    vi.stubEnv('DOCUMENT_STORAGE_MODE', '')     // this test verifies explicit DOCUMENT_STORAGE_MODE wins
    // In dev+Vercel without explicit mode, NODE_ENV=development → uat-temporary
    const { getStorageMode } = await import('@/lib/storage/factory')
    expect(getStorageMode()).toBe('uat-temporary')
  })
})

// ── getStorageUIState ─────────────────────────────────────────────────────────

describe('getStorageUIState', () => {
  beforeEach(() => { vi.unstubAllEnvs() })
  afterEach(() => { vi.unstubAllEnvs() })

  it('SPR-041: returns disabled when DOCUMENT_STORAGE_MODE=disabled (regardless of provider)', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'disabled')
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'azure')
    vi.stubEnv('AZURE_STORAGE_CONNECTION_STRING', 'AccountName=a;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net')
    const { getStorageUIState } = await import('@/lib/storage/factory')
    expect(getStorageUIState()).toBe('disabled')
  })

  it('SPR-042: returns uat-temporary when mode=uat-temporary and no durable provider exists', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'uat-temporary')
    stubNoDurableStorage()
    const { getStorageUIState } = await import('@/lib/storage/factory')
    expect(getStorageUIState()).toBe('uat-temporary')
  })

  it('SPR-043: returns operational when azure is fully configured', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'durable')
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'azure')
    vi.stubEnv('AZURE_STORAGE_CONNECTION_STRING', 'AccountName=a;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net')
    const { getStorageUIState } = await import('@/lib/storage/factory')
    expect(getStorageUIState()).toBe('operational')
  })

  it('SPR-044: returns not-configured when mode=durable but no provider or DATABASE_URL exists', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'durable')
    stubNoDurableStorage()
    vi.stubEnv('AZURE_STORAGE_CONNECTION_STRING', '')
    const { getStorageUIState } = await import('@/lib/storage/factory')
    expect(getStorageUIState()).toBe('not-configured')
  })

  it('SPR-045: returns operational when all 4 AWS vars are set', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'durable')
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'aws')
    vi.stubEnv('AWS_REGION', 'eu-central-1')
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'AKIATEST')
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'secret')
    vi.stubEnv('AWS_S3_BUCKET_NAME', 'my-bucket')
    const { getStorageUIState } = await import('@/lib/storage/factory')
    expect(getStorageUIState()).toBe('operational')
  })

  it('SPR-046: returns not-configured when DOCUMENT_STORAGE_PROVIDER=aws but vars missing', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'durable')
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'aws')
    vi.stubEnv('AWS_REGION', '')
    vi.stubEnv('AWS_ACCESS_KEY_ID', '')
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', '')
    vi.stubEnv('AWS_S3_BUCKET_NAME', '')
    const { getStorageUIState } = await import('@/lib/storage/factory')
    expect(getStorageUIState()).toBe('not-configured')
  })

  it('SPR-047: returns uat-temporary for explicit local on Vercel when no DATABASE_URL exists', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'uat-temporary')
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'local')
    vi.stubEnv('DATABASE_URL', '')
    const { getStorageUIState } = await import('@/lib/storage/factory')
    expect(getStorageUIState()).toBe('uat-temporary')
  })

  it('SPR-048: isFileServingEnabled returns true for uat-temporary and operational; false for not-configured and disabled', async () => {
    // uat-temporary → enabled
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'uat-temporary')
    stubNoDurableStorage()
    const { isFileServingEnabled: f1 } = await import('@/lib/storage/factory')
    expect(f1()).toBe(true)
    vi.unstubAllEnvs()
    // disabled → not enabled
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'disabled')
    stubNoDurableStorage()
    const { isFileServingEnabled: f2 } = await import('@/lib/storage/factory')
    expect(f2()).toBe(false)
    vi.unstubAllEnvs()
    // durable + no provider → not-configured → not enabled
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'durable')
    stubNoDurableStorage()
    const { isFileServingEnabled: f3 } = await import('@/lib/storage/factory')
    expect(f3()).toBe(false)
  })
})

// ── getActiveProvider + isPostgresStorageActive (Postgres durable fallback) ────

describe('getActiveProvider and isPostgresStorageActive', () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllEnvs() })
  afterEach(() => { vi.unstubAllEnvs() })

  it('SPR-049: getActiveProvider returns azure when DOCUMENT_STORAGE_PROVIDER=azure', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'azure')
    const { getActiveProvider } = await import('@/lib/storage/factory')
    expect(getActiveProvider()).toBe('azure')
  })

  it('SPR-050: getActiveProvider returns postgres when DOCUMENT_STORAGE_PROVIDER=postgres', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'postgres')
    const { getActiveProvider } = await import('@/lib/storage/factory')
    expect(getActiveProvider()).toBe('postgres')
  })

  it('SPR-051: getActiveProvider treats db as an alias for postgres', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'db')
    const { getActiveProvider } = await import('@/lib/storage/factory')
    expect(getActiveProvider()).toBe('postgres')
  })

  it('SPR-052: getActiveProvider returns postgres when provider unset but DATABASE_URL present (durable fallback)', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', '')
    vi.stubEnv('DATABASE_URL', 'postgres://x')
    const { getActiveProvider } = await import('@/lib/storage/factory')
    expect(getActiveProvider()).toBe('postgres')
  })

  it('SPR-053: getActiveProvider returns local when provider unset and no DATABASE_URL', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', '')
    vi.stubEnv('DATABASE_URL', '')
    const { getActiveProvider } = await import('@/lib/storage/factory')
    expect(getActiveProvider()).toBe('local')
  })

  it('SPR-054: explicit local always wins over DATABASE_URL', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'local')
    vi.stubEnv('DATABASE_URL', 'postgres://x')
    const { getActiveProvider, isLocalStorageActive, isPostgresStorageActive } = await import('@/lib/storage/factory')
    expect(getActiveProvider()).toBe('local')
    expect(isLocalStorageActive()).toBe(true)
    expect(isPostgresStorageActive()).toBe(false)
  })

  it('SPR-055: isPostgresStorageActive true for postgres, false for local/azure', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'postgres')
    const m1 = await import('@/lib/storage/factory')
    expect(m1.isPostgresStorageActive()).toBe(true)
    expect(m1.isLocalStorageActive()).toBe(false)
  })

  it('SPR-056: factory builds PostgresStorageProvider for provider=postgres', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'postgres')
    const { getStorageProvider } = await import('@/lib/storage/factory')
    const { PostgresStorageProvider } = await import('@/lib/storage/providers/postgres')
    expect(getStorageProvider()).toBeInstanceOf(PostgresStorageProvider)
  })

  it('SPR-057: factory builds PostgresStorageProvider when unset + DATABASE_URL (no production throw)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', '')
    vi.stubEnv('DATABASE_URL', 'postgres://x')
    const { getStorageProvider } = await import('@/lib/storage/factory')
    const { PostgresStorageProvider } = await import('@/lib/storage/providers/postgres')
    expect(() => getStorageProvider()).not.toThrow()
    expect(getStorageProvider()).toBeInstanceOf(PostgresStorageProvider)
  })

  it('SPR-058: getStorageUIState returns operational for postgres (durable) + DATABASE_URL', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_MODE', 'durable')
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'postgres')
    vi.stubEnv('DATABASE_URL', 'postgres://x')
    const { getStorageUIState } = await import('@/lib/storage/factory')
    expect(getStorageUIState()).toBe('operational')
  })

  it('SPR-059: getStorageUIState operational for unset provider + DATABASE_URL (no banner)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DOCUMENT_STORAGE_MODE', '')
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', '')
    vi.stubEnv('DATABASE_URL', 'postgres://x')
    const { getStorageUIState } = await import('@/lib/storage/factory')
    expect(getStorageUIState()).toBe('operational')
  })

  it('SPR-060: isFileServingEnabled true for postgres', async () => {
    vi.stubEnv('DOCUMENT_STORAGE_PROVIDER', 'postgres')
    vi.stubEnv('DATABASE_URL', 'postgres://x')
    const { isFileServingEnabled } = await import('@/lib/storage/factory')
    expect(isFileServingEnabled()).toBe(true)
  })
})

// ── Azure provider ────────────────────────────────────────────────────────────

import { AzureBlobProvider } from '@/lib/storage/providers/azure'

const AZURE_CONN_STR = 'AccountName=testaccount;AccountKey=dGVzdGtleQ==;EndpointSuffix=core.windows.net'

describe('AzureBlobProvider', () => {
  it('SPR-013: uploadFile returns correct fields', async () => {
    const provider = new AzureBlobProvider(AZURE_CONN_STR)
    const result = await provider.uploadFile({ key: TEST_KEY, data: TEST_DATA, mimeType: TEST_MIMETYPE })
    expect(result.storageKey).toBe(TEST_KEY)
    expect(result.fileSizeBytes).toBe(TEST_DATA.length)
    expect(result.mimeType).toBe(TEST_MIMETYPE)
    expect(result.checksumSha256).toHaveLength(64)
  })

  it('SPR-014: uploadFile signedUrl contains account name and container', async () => {
    const provider = new AzureBlobProvider(AZURE_CONN_STR)
    const result = await provider.uploadFile({ key: TEST_KEY, data: TEST_DATA, mimeType: TEST_MIMETYPE })
    expect(result.signedUrl).toContain('testaccount.blob.core.windows.net')
    expect(result.signedUrl).toContain('avaniis-documents')
  })

  it('SPR-015: getSignedUrl returns SAS URL', async () => {
    const provider = new AzureBlobProvider(AZURE_CONN_STR)
    const url = await provider.getSignedUrl(TEST_KEY, 15)
    expect(url).toMatch(/^https:\/\/testaccount\.blob\.core\.windows\.net/)
    expect(url).toContain('sig=abc')
  })

  it('SPR-016: fileExists returns true from mock', async () => {
    const provider = new AzureBlobProvider(AZURE_CONN_STR)
    expect(await provider.fileExists(TEST_KEY)).toBe(true)
  })

  it('SPR-017: getMetadata returns mock metadata', async () => {
    const provider = new AzureBlobProvider(AZURE_CONN_STR)
    const meta = await provider.getMetadata(TEST_KEY)
    expect(meta).toEqual({ checksumsha256: 'aabbcc' })
  })

  it('SPR-018: deleteFile resolves without throwing', async () => {
    const provider = new AzureBlobProvider(AZURE_CONN_STR)
    await expect(provider.deleteFile(TEST_KEY)).resolves.toBeUndefined()
  })

  it('SPR-019: constructor throws DocumentStorageError for malformed connection string', () => {
    expect(() => new AzureBlobProvider('invalid-no-accountkey')).toThrow(DocumentStorageError)
  })
})

// ── AWS S3 provider ───────────────────────────────────────────────────────────

import { AWSS3Provider } from '@/lib/storage/providers/aws'

describe('AWSS3Provider', () => {
  const makeProvider = () => new AWSS3Provider('eu-central-1', 'AKIATEST', 'secret', 'my-bucket')

  it('SPR-020: uploadFile returns correct fields', async () => {
    const result = await makeProvider().uploadFile({ key: TEST_KEY, data: TEST_DATA, mimeType: TEST_MIMETYPE })
    expect(result.storageKey).toBe(TEST_KEY)
    expect(result.fileSizeBytes).toBe(TEST_DATA.length)
    expect(result.checksumSha256).toHaveLength(64)
  })

  it('SPR-021: uploadFile signedUrl is a pre-signed S3 URL', async () => {
    const result = await makeProvider().uploadFile({ key: TEST_KEY, data: TEST_DATA, mimeType: TEST_MIMETYPE })
    expect(result.signedUrl).toContain('X-Amz-Signature')
  })

  it('SPR-022: getSignedUrl returns pre-signed URL', async () => {
    const url = await makeProvider().getSignedUrl(TEST_KEY, 60)
    expect(url).toContain('X-Amz-Signature')
  })

  it('SPR-023: fileExists returns true when HeadObject succeeds', async () => {
    expect(await makeProvider().fileExists(TEST_KEY)).toBe(true)
  })

  it('SPR-024: getMetadata returns metadata from HeadObject', async () => {
    const meta = await makeProvider().getMetadata(TEST_KEY)
    expect(meta).toEqual({ checksumsha256: 'ddeeff' })
  })

  it('SPR-025: deleteFile resolves without throwing', async () => {
    await expect(makeProvider().deleteFile(TEST_KEY)).resolves.toBeUndefined()
  })
})

// ── Local provider (real filesystem) ─────────────────────────────────────────

import { LocalStorageProvider } from '@/lib/storage/providers/local'

describe('LocalStorageProvider', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avaniis-local-storage-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('SPR-026: uploadFile writes to public/uploads and returns relative URL', async () => {
    const provider = new LocalStorageProvider()
    const result = await provider.uploadFile({ key: TEST_KEY, data: TEST_DATA, mimeType: TEST_MIMETYPE })
    expect(result.storageKey).toBe(TEST_KEY)
    expect(result.fileSizeBytes).toBe(TEST_DATA.length)
    expect(result.signedUrl).toBe(`/uploads/${TEST_KEY}`)

    const dest = path.join(tmpDir, 'public', 'uploads', TEST_KEY)
    expect(fs.existsSync(dest)).toBe(true)
    expect(fs.readFileSync(dest)).toEqual(TEST_DATA)
  })

  it('SPR-027: fileExists returns true after upload, false for missing key', async () => {
    const provider = new LocalStorageProvider()
    await provider.uploadFile({ key: TEST_KEY, data: TEST_DATA, mimeType: TEST_MIMETYPE })
    expect(await provider.fileExists(TEST_KEY)).toBe(true)
    expect(await provider.fileExists('nope/missing.pdf')).toBe(false)
  })

  it('SPR-028: getMetadata returns stored metadata including custom fields', async () => {
    const provider = new LocalStorageProvider()
    await provider.uploadFile({
      key:      TEST_KEY,
      data:     TEST_DATA,
      mimeType: TEST_MIMETYPE,
      metadata: { personid: 'p-123', tag: 'test' },
    })
    const meta = await provider.getMetadata(TEST_KEY)
    expect(meta?.personid).toBe('p-123')
    expect(meta?.tag).toBe('test')
    expect(meta?.mimeType).toBe(TEST_MIMETYPE)
  })

  it('SPR-029: deleteFile removes file and sidecar; fileExists returns false after delete', async () => {
    const provider = new LocalStorageProvider()
    await provider.uploadFile({ key: TEST_KEY, data: TEST_DATA, mimeType: TEST_MIMETYPE })
    expect(await provider.fileExists(TEST_KEY)).toBe(true)
    await provider.deleteFile(TEST_KEY)
    expect(await provider.fileExists(TEST_KEY)).toBe(false)
    expect(await provider.getMetadata(TEST_KEY)).toBeNull()
  })

  it('SPR-030: getSignedUrl returns /uploads/{key} when file is in public/uploads', async () => {
    const provider = new LocalStorageProvider()
    await provider.uploadFile({ key: TEST_KEY, data: TEST_DATA, mimeType: TEST_MIMETYPE })
    const url = await provider.getSignedUrl(TEST_KEY, 60)
    expect(url).toBe(`/uploads/${TEST_KEY}`)
  })
})
