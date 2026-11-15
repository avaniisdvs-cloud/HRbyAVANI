/**
 * Azure Blob Storage provider for the AVANIIS HR document storage abstraction.
 *
 * Required env vars:
 *   AZURE_STORAGE_CONNECTION_STRING  — Azure Portal → Storage Account → Access keys
 *   AZURE_STORAGE_CONTAINER_NAME     — container name (default: 'avaniis-documents')
 *
 * All blobs land in a private container in the UAE-North region.
 * Access is issued via short-lived SAS URLs so application code never proxies raw bytes.
 */
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'
import { createHash } from 'crypto'
import type { IDocumentStorage, UploadArgs, UploadResult } from '../types'
import { DocumentStorageError } from '../types'

const DEFAULT_TTL = 15 // minutes

function getContainer(): string {
  return (
    process.env.AZURE_STORAGE_CONTAINER_NAME ??
    process.env.AZURE_STORAGE_CONTAINER ??
    'avaniis-documents'
  )
}

export class AzureBlobProvider implements IDocumentStorage {
  private readonly client:      BlobServiceClient
  private readonly credential:  StorageSharedKeyCredential
  private readonly accountName: string
  private readonly container:   string

  constructor(connectionString: string) {
    try {
      this.client = BlobServiceClient.fromConnectionString(connectionString)
    } catch (err) {
      throw new DocumentStorageError('azure', 'init', 'Invalid AZURE_STORAGE_CONNECTION_STRING', err)
    }

    const m = /AccountName=([^;]+);AccountKey=([^;]+)/.exec(connectionString)
    if (!m) {
      throw new DocumentStorageError(
        'azure',
        'init',
        'Cannot parse AccountName/AccountKey from connection string',
      )
    }
    this.accountName = m[1]
    this.credential  = new StorageSharedKeyCredential(m[1], m[2])
    this.container   = getContainer()
  }

  async uploadFile({ key, data, mimeType, metadata }: UploadArgs): Promise<UploadResult> {
    try {
      const checksumSha256 = createHash('sha256').update(data).digest('hex')

      const containerClient = this.client.getContainerClient(this.container)
      await containerClient.createIfNotExists() // idempotent — private by default

      const blobClient = containerClient.getBlockBlobClient(key)
      await blobClient.uploadData(data, {
        blobHTTPHeaders: { blobContentType: mimeType },
        metadata: {
          ...metadata,
          checksumsha256: checksumSha256,
          uploadedat:     new Date().toISOString(),
        },
      })

      return {
        storageKey:    key,
        fileSizeBytes: data.length,
        mimeType,
        checksumSha256,
        signedUrl: await this.getSignedUrl(key),
      }
    } catch (err) {
      if (err instanceof DocumentStorageError) throw err
      throw new DocumentStorageError('azure', 'uploadFile', (err as Error).message ?? String(err), err)
    }
  }

  async getSignedUrl(key: string, ttlMinutes = DEFAULT_TTL): Promise<string> {
    try {
      const expiresOn = new Date(Date.now() + ttlMinutes * 60_000)
      const sas = generateBlobSASQueryParameters(
        {
          containerName: this.container,
          blobName:      key,
          permissions:   BlobSASPermissions.parse('r'),
          startsOn:      new Date(),
          expiresOn,
        },
        this.credential,
      ).toString()

      return `https://${this.accountName}.blob.core.windows.net/${this.container}/${encodeURI(key)}?${sas}`
    } catch (err) {
      throw new DocumentStorageError('azure', 'getSignedUrl', (err as Error).message ?? String(err), err)
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.client
        .getContainerClient(this.container)
        .getBlockBlobClient(key)
        .deleteIfExists()
    } catch (err) {
      throw new DocumentStorageError('azure', 'deleteFile', (err as Error).message ?? String(err), err)
    }
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      return this.client
        .getContainerClient(this.container)
        .getBlockBlobClient(key)
        .exists()
    } catch {
      return false
    }
  }

  async getMetadata(key: string): Promise<Record<string, string> | null> {
    try {
      const props = await this.client
        .getContainerClient(this.container)
        .getBlockBlobClient(key)
        .getProperties()
      return props.metadata ?? null
    } catch {
      return null
    }
  }

  async getFileData(key: string): Promise<Buffer | null> {
    try {
      const blob = this.client.getContainerClient(this.container).getBlockBlobClient(key)
      const dl   = await blob.download()
      if (!dl.readableStreamBody) return null
      const chunks: Buffer[] = []
      for await (const chunk of dl.readableStreamBody as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array))
      }
      return Buffer.concat(chunks)
    } catch {
      return null
    }
  }
}
