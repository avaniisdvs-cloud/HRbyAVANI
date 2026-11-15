/**
 * Foundation Stewardship P1-H4 — deterministic identity hashing.
 *
 * Emirates ID and passport number are stored AES-256-GCM encrypted
 * (non-deterministic IV), so the ciphertext columns can never carry a
 * uniqueness constraint. This module derives a deterministic, keyed
 * HMAC-SHA256 digest of the NORMALISED identifier. The digest:
 *   • is stable for the same identifier  → supports UNIQUE indexes
 *   • is keyed with ENCRYPTION_KEY       → not reversible by rainbow table
 *   • never contains the identifier      → safe to index and log counts of
 *
 * Enforcement is gated behind IDENTITY_UNIQUENESS_ENFORCEMENT=true so the
 * application remains fully compatible with databases where migration 0065
 * (hash columns + unique indexes) has not been applied yet. Sequence:
 *   1. apply 0065 (columns + indexes, per migration ledger process)
 *   2. run scripts/backfill-identity-hashes.mjs (guarded)
 *   3. set IDENTITY_UNIQUENESS_ENFORCEMENT=true
 */

import { createHmac } from 'crypto'

const HASH_CONTEXT_EID      = 'avaniis:identity:eid:v1'
const HASH_CONTEXT_PASSPORT = 'avaniis:identity:passport:v1'

function hmacKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? ''
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error('ENCRYPTION_KEY must be 64 hex chars — identity hashing uses the same key material as field encryption')
  }
  return Buffer.from(hex, 'hex')
}

/** Canonical Emirates ID form for hashing: digits only (dashes/spaces removed). */
export function normalizeEmiratesIdForHash(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

/** Canonical passport form for hashing: uppercase alphanumerics only. */
export function normalizePassportForHash(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function hash(context: string, normalised: string): string {
  return createHmac('sha256', hmacKey()).update(`${context}|${normalised}`).digest('hex')
}

export function emiratesIdHash(value: string | null | undefined): string | null {
  if (!value) return null
  const normalised = normalizeEmiratesIdForHash(value)
  if (!normalised) return null
  return hash(HASH_CONTEXT_EID, normalised)
}

export function passportNumberHash(value: string | null | undefined): string | null {
  if (!value) return null
  const normalised = normalizePassportForHash(value)
  if (!normalised) return null
  return hash(HASH_CONTEXT_PASSPORT, normalised)
}

/** Hash-backed uniqueness is active only after 0065 is applied + backfilled. */
export function isIdentityHashEnforcementEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.IDENTITY_UNIQUENESS_ENFORCEMENT === 'true'
}
