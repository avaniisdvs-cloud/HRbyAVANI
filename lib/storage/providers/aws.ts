/**
 * AWS S3 provider for the AVANIIS HR document storage abstraction.
 *
 * Required env vars:
 *   AWS_REGION               — e.g. 'me-central-1' (UAE) or 'eu-central-1'
 *   AWS_ACCESS_KEY_ID        — IAM user access key
 *   AWS_SECRET_ACCESS_KEY    — IAM user secret key
 *   AWS_S3_BUCKET_NAME       — target S3 bucket name
 *
 * The IAM user needs: s3:PutObject, s3:GetObject, s3:DeleteObject,
 * s3:HeadObject on the bucket. Objects are private by default; access
 * is issued via pre-signed GetObject URLs.
 *
 * Uses AWS SDK v3 (@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner).
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3'
import { getSignedUrl as s3GetSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHash } from 'crypto'
import type { IDocumentStorage, UploadArgs, UploadResult } from '../types'
import { DocumentStorageError } from '../types'

const DEFAULT_TTL = 15 // minutes

export class AWSS3Provider implements IDocumentStorage {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(region: string, accessKeyId: string, secretAccessKey: string, bucket: string) {
    this.client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    })
    this.bucket = bucket
  }

  async uploadFile({ key, data, mimeType, metadata }: UploadArgs): Promise<UploadResult> {
    try {
      const checksumSha256 = createHash('sha256').update(data).digest('hex')

      await this.client.send(new PutObjectCommand({
        Bucket:      this.bucket,
        Key:         key,
        Body:        data,
        ContentType: mimeType,
        // S3 metadata keys are case-insensitive and lowercased by the SDK
        Metadata: {
          ...metadata,
          checksumsha256: checksumSha256,
          uploadedat:     new Date().toISOString(),
        },
      }))

      return {
        storageKey:    key,
        fileSizeBytes: data.length,
        mimeType,
        checksumSha256,
        signedUrl: await this.getSignedUrl(key),
      }
    } catch (err) {
      if (err instanceof DocumentStorageError) throw err
      throw new DocumentStorageError('aws', 'uploadFile', (err as Error).message ?? String(err), err)
    }
  }

  async getSignedUrl(key: string, ttlMinutes = DEFAULT_TTL): Promise<string> {
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key })
      return s3GetSignedUrl(this.client, command, { expiresIn: ttlMinutes * 60 })
    } catch (err) {
      throw new DocumentStorageError('aws', 'getSignedUrl', (err as Error).message ?? String(err), err)
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
    } catch (err) {
      throw new DocumentStorageError('aws', 'deleteFile', (err as Error).message ?? String(err), err)
    }
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return true
    } catch (err: unknown) {
      // S3 returns 404 as an exception, not a null result
      if (
        typeof err === 'object' && err !== null &&
        ('$metadata' in err) &&
        (err as { $metadata: { httpStatusCode?: number } }).$metadata.httpStatusCode === 404
      ) {
        return false
      }
      // Any other error: assume not found rather than throwing
      return false
    }
  }

  async getMetadata(key: string): Promise<Record<string, string> | null> {
    try {
      const res: HeadObjectCommandOutput = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      return (res.Metadata as Record<string, string>) ?? null
    } catch {
      return null
    }
  }

  async getFileData(key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      if (!res.Body) return null
      const chunks: Uint8Array[] = []
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk)
      }
      return Buffer.concat(chunks)
    } catch {
      return null
    }
  }
}
