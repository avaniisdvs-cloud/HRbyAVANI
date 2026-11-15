/**
 * Migration package store — durable, storage-provider-backed.
 *
 * Uses getStorageProvider() so session data survives Vercel container recycles.
 * On Vercel (VERCEL_ENV=production|preview): auto-selects PostgreSQL because
 * DATABASE_URL is present and no other provider is configured — sessions are
 * stored as blobs in document_files and persist across all serverless instances.
 * In local dev: local filesystem (public/uploads or /tmp).
 *
 * Keys:
 *   migration-sessions/{sessionId}/session.json
 *   migration-sessions/{sessionId}/package.json
 *
 * F-03 fix: sessionId is validated as UUID v4 before use in any storage key
 * to prevent key injection / path traversal.
 *
 * Server-side only. Never import from client components.
 */

import { getStorageProvider } from '@/lib/storage'
import type { V2ParsedPackage }                        from './v2-types'
import type { SourceFileAnalysis, RawSourceRow, TransformationSummary } from './source-types'

// ── UUID v4 validation ────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidSessionId(sessionId: string): boolean {
  return UUID_RE.test(sessionId)
}

function assertValidSessionId(sessionId: string): void {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Invalid sessionId: must be a UUID v4. Received: "${sessionId.slice(0, 64)}"`)
  }
}

// ── Storage keys ──────────────────────────────────────────────────────────────

function sessionKey(sessionId: string): string {
  return `migration-sessions/${sessionId}/session.json`
}

function packageKey(sessionId: string): string {
  return `migration-sessions/${sessionId}/package.json`
}

// ── Stored types (plain JSON — no Map/Set) ────────────────────────────────────

/** Per-file entry in the session store. sheets is plain object (not Map). */
export interface StoredFileEntry {
  analysis: SourceFileAnalysis
  /** sheetName → rows */
  sheets:   Record<string, RawSourceRow[]>
}

export interface StoredSession {
  sessionId:  string
  createdAt:  string
  fileCount:  number
  files:      StoredFileEntry[]
}

export interface StoredPackage {
  pkg:      V2ParsedPackage
  summary:  TransformationSummary
  mode:     string
  builtAt:  string
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function saveSession(
  sessionId: string,
  files:     StoredFileEntry[],
): Promise<void> {
  assertValidSessionId(sessionId)
  const data: StoredSession = {
    sessionId,
    createdAt:  new Date().toISOString(),
    fileCount:  files.length,
    files,
  }
  const storage = getStorageProvider()
  await storage.uploadFile({
    key:      sessionKey(sessionId),
    data:     Buffer.from(JSON.stringify(data), 'utf-8'),
    mimeType: 'application/json',
    metadata: { purpose: 'migration-session', sessionId, createdAt: data.createdAt },
  })
}

export async function savePackage(
  sessionId: string,
  pkg:       V2ParsedPackage,
  summary:   TransformationSummary,
  mode:      string,
): Promise<void> {
  assertValidSessionId(sessionId)
  const data: StoredPackage = { pkg, summary, mode, builtAt: new Date().toISOString() }
  const storage = getStorageProvider()
  await storage.uploadFile({
    key:      packageKey(sessionId),
    data:     Buffer.from(JSON.stringify(data), 'utf-8'),
    mimeType: 'application/json',
    metadata: { purpose: 'migration-package', sessionId, builtAt: data.builtAt },
  })
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function loadSession(sessionId: string): Promise<StoredSession | null> {
  assertValidSessionId(sessionId)
  try {
    const storage = getStorageProvider()
    const buf = await storage.getFileData(sessionKey(sessionId))
    if (!buf) return null
    return JSON.parse(buf.toString('utf-8')) as StoredSession
  } catch {
    return null
  }
}

export async function loadPackage(sessionId: string): Promise<StoredPackage | null> {
  assertValidSessionId(sessionId)
  try {
    const storage = getStorageProvider()
    const buf = await storage.getFileData(packageKey(sessionId))
    if (!buf) return null
    return JSON.parse(buf.toString('utf-8')) as StoredPackage
  } catch {
    return null
  }
}

// ── Existence checks ──────────────────────────────────────────────────────────

export async function sessionExists(sessionId: string): Promise<boolean> {
  if (!isValidSessionId(sessionId)) return false
  try {
    return getStorageProvider().fileExists(sessionKey(sessionId))
  } catch {
    return false
  }
}

export async function packageExists(sessionId: string): Promise<boolean> {
  if (!isValidSessionId(sessionId)) return false
  try {
    return getStorageProvider().fileExists(packageKey(sessionId))
  } catch {
    return false
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export async function clearSession(sessionId: string): Promise<void> {
  assertValidSessionId(sessionId)
  const storage = getStorageProvider()
  // Best-effort: delete both artefacts; ignore errors (storage may already be gone)
  await Promise.allSettled([
    storage.deleteFile(sessionKey(sessionId)),
    storage.deleteFile(packageKey(sessionId)),
  ])
}
