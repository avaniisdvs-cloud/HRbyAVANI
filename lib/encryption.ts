/**
 * AES-256-GCM field-level encryption for PDPL-sensitive fields:
 *   emirates_id, passport_number, iban
 *
 * Wire format: base64( iv[12] || tag[16] || ciphertext )
 * Stored in varchar(500) — accommodates ciphertext + encoding overhead.
 *
 * Key: ENCRYPTION_KEY env var — 64 hex chars (32 bytes).
 * Zero key (64 zeros) is rejected in production.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM    = 'aes-256-gcm'
const IV_BYTES     = 12
const TAG_BYTES    = 16
const KEY_HEX_LEN  = 64

function loadKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? ''
  // QA-Audit-L3 — Buffer.from('garbage', 'hex') silently truncates; require
  // strict hex charset before parsing.
  if (hex.length !== KEY_HEX_LEN) {
    throw new Error(`ENCRYPTION_KEY must be ${KEY_HEX_LEN} hex chars (32 bytes)`)
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('ENCRYPTION_KEY must be hex-encoded (0-9, a-f only)')
  }
  // QA-Audit-L4 — only DEVELOPMENT may use a zero key (test/CI/dev only).
  // Staging, preview, test, production, and any other env reject it.
  if (hex === '0'.repeat(KEY_HEX_LEN) && process.env.NODE_ENV !== 'development') {
    throw new Error(
      `Zero ENCRYPTION_KEY is only permitted in NODE_ENV=development (got ${process.env.NODE_ENV ?? 'undefined'})`,
    )
  }
  return Buffer.from(hex, 'hex')
}

// Cached once per process
let _key: Buffer | null = null
function getKey(): Buffer {
  if (!_key) _key = loadKey()
  return _key
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv  = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ct  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decrypt(ciphertext: string): string {
  const key  = getKey()
  // Empty input is never valid — reject immediately
  if (!ciphertext) throw new Error('decrypt: empty ciphertext')
  const buf  = Buffer.from(ciphertext, 'base64')
  // Buffers shorter than IV_BYTES can't contain a valid IV — definitely invalid
  if (buf.length < IV_BYTES) throw new Error(`decrypt: ciphertext too short (${buf.length} bytes)`)
  // Buffers between IV_BYTES and IV+TAG could be legacy plaintext stored before encryption.
  // Return as-is to preserve backward compatibility with pre-encryption data.
  // Note: encrypted empty strings produce exactly IV_BYTES + TAG_BYTES (28 bytes).
  if (buf.length < IV_BYTES + TAG_BYTES) return ciphertext
  try {
    const iv   = buf.subarray(0, IV_BYTES)
    const tag  = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
    const ct   = buf.subarray(IV_BYTES + TAG_BYTES)
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  } catch (err) {
    // GCM authentication failures indicate tampered/corrupted data — always re-throw
    // so callers can detect integrity violations.
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('authenticate') || msg.includes('auth') || msg.includes('Unsupported state')) {
      throw err
    }
    // For other decode errors (legacy plaintext that happens to be ≥ 28 bytes),
    // return the raw stored value rather than crashing.
    return ciphertext
  }
}

/** Returns null if value is null/undefined; encrypts otherwise. */
export function encryptNullable(value: string | null | undefined): string | null {
  if (value == null) return null
  return encrypt(value)
}

/** Returns null if ciphertext is null/undefined; decrypts otherwise. */
export function decryptNullable(ciphertext: string | null | undefined): string | null {
  if (ciphertext == null) return null
  return decrypt(ciphertext)
}
