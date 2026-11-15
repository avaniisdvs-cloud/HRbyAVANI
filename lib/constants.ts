/**
 * Central constants — single source of truth.
 *
 * QA-Audit-M2 fix: TENANT_ID was hardcoded as a literal in 15 files.
 * Phase 3 multi-tenant rollout would have required 15-file surgery.
 * Every module imports from here now.
 */

/** Avaniis single tenant for Phase 1. Phase 3 SaaS swaps this for per-request lookup. */
export const AVANIIS_TENANT_ID = '00000000-0000-0000-0000-000000000001'

/** Shorthand re-export to keep callsites terse. */
export const TENANT_ID = AVANIIS_TENANT_ID

/** Document upload limits — QA-Audit-M3. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024 // 10 MB
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  // Office docs (CV / employment contracts)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
] as const
export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number]

/** SAS URL TTL for blob retrieval — Security spec §4.1. */
export const SAS_URL_TTL_MINUTES = 15

// Company identity constants — re-export for convenience
export { COMPANY } from './constants/company'
