'use server'

/**
 * S3-11 — Person document upload + retrieval.
 *
 * Two upload paths:
 *  uploadPersonDocument — HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN only
 *  uploadMyDocument     — EMPLOYEE only (self-upload, limited type set)
 *
 * Files go through lib/blob-storage.ts → Azure Blob (UAE North) and the
 * resulting storageKey, fileSizeBytes, mimeType, checksumSha256 land in
 * person_documents. Retrieval re-issues a 15-minute SAS URL each time so a
 * stale link can never leak.
 *
 * Document taxonomy is defined in lib/documents/document-types.ts — never
 * hardcode type lists here.
 */
import { translateError } from '@/lib/app-error'
import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'
import { and, eq } from 'drizzle-orm'
import { personDocuments, persons } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { uploadDocument as blobUpload, deleteDocument as blobDelete } from '@/lib/blob-storage'
import { isLocalStorageActive, isPostgresStorageActive, getStorageProvider, getStorageUIState } from '@/lib/storage'
import {
  TENANT_ID, MAX_DOCUMENT_BYTES, ALLOWED_DOCUMENT_MIME_TYPES,
} from '@/lib/constants'
import {
  HR_UPLOADABLE_TYPES,
  EMPLOYEE_UPLOADABLE_TYPES,
  EMPLOYEE_VISIBLE_TYPES,
  getDocTypeCategory,
  computeDocumentStatus,
} from '@/lib/documents/document-types'

// ── Shared validation helpers ─────────────────────────────────────────────────

const UploadBaseSchema = z.object({
  personId:         z.string().uuid(),
  documentTitle:    z.string().min(1).max(200),
  documentNumber:   z.string().max(100).optional(),
  issuingAuthority: z.string().max(200).optional(),
  issuingCountry:   z.string().regex(/^[A-Z]{3}$/).optional(),
  issueDate:        hrDateString().optional(),
  expiryDate:       hrDateString().optional(),
  isMandatory:      z.boolean().default(false),
  notes:            z.string().max(2000).optional(),
})

const HrUploadSchema = UploadBaseSchema.extend({
  // HR_UPLOADABLE_TYPES now includes 'OTHER' via the taxonomy (legacy backward-compat entry)
  documentType:   z.string().refine(v => HR_UPLOADABLE_TYPES.includes(v), {
    message: 'Invalid document type for HR upload',
  }),
  hrOnlyVisibility: z.boolean().default(false),
})

const EmployeeUploadSchema = UploadBaseSchema.extend({
  documentType: z.string().refine(v => EMPLOYEE_UPLOADABLE_TYPES.includes(v), {
    message: 'This document type cannot be uploaded by employees',
  }),
})

// ── File validation helper ────────────────────────────────────────────────────

function validateFile(file: unknown): File {
  if (!(file instanceof File)) throw new Error('file is required')
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`File exceeds maximum size of ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`)
  }
  if (file.size === 0) throw new Error('file is empty')
  if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new Error(
      `Unsupported file type (${file.type || 'unknown'}). Allowed: PDF, JPEG, PNG, WebP, DOCX.`,
    )
  }
  return file
}

// ── HR upload (HR_ADMIN | HR_DIRECTOR | SUPER_ADMIN) ──────────────────────────

/**
 * Server Action — HR-side document upload.
 * Allows full HR_UPLOADABLE_TYPES taxonomy + 'OTHER' fallback.
 * Accepts FormData: file (binary) + metadata (JSON string).
 */
export async function uploadPersonDocument(
  formData: FormData,
): Promise<{ id: string; sasUrl: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    await requirePermission(user, 'EMPLOYEE_PROFILE', 'edit')

    const file     = validateFile(formData.get('file'))
    const rawMeta  = formData.get('metadata')
    if (typeof rawMeta !== 'string') throw new Error('metadata is required')

    let metadata: z.infer<typeof HrUploadSchema>
    try {
      metadata = HrUploadSchema.parse(JSON.parse(rawMeta))
    } catch {
      throw new Error('invalid metadata payload')
    }

    // Pre-flight: person exists + entity scope (before blob upload to avoid orphans)
    const [scopeRow] = await db
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons).where(eq(persons.id, metadata.personId)).limit(1)
    if (!scopeRow) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== scopeRow.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity document upload denied')
    }

    const uploaded = await blobUpload({
      personId: metadata.personId,
      file,
      fileName: file.name,
      mimeType: file.type || undefined,
    })

    let newId = ''
    try {
      await db.transaction(async tx => {
        // TOCTOU defence: re-read inside transaction
        const [person] = await tx
          .select({ id: persons.id, legalEntityId: persons.legalEntityId })
          .from(persons).where(eq(persons.id, metadata.personId)).limit(1)
        if (!person) throw new Error('person not found')
        if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
          throw new Error('FORBIDDEN: cross-entity document upload denied')
        }

        const category = getDocTypeCategory(metadata.documentType)

        const [row] = await tx
          .insert(personDocuments)
          .values({
            tenantId:          TENANT_ID,
            personId:          metadata.personId,
            legalEntityId:     person.legalEntityId,
            documentType:      metadata.documentType,
            documentCategory:  category,
            documentTitle:     metadata.documentTitle,
            documentNumber:    metadata.documentNumber,
            issuingAuthority:  metadata.issuingAuthority,
            issuingCountry:    metadata.issuingCountry,
            issueDate:         metadata.issueDate,
            expiryDate:        metadata.expiryDate,
            isMandatory:       metadata.isMandatory,
            storageKey:        uploaded.storageKey,
            fileName:          uploaded.fileName,
            fileSizeBytes:     uploaded.fileSizeBytes,
            mimeType:          uploaded.mimeType,
            checksumSha256:    uploaded.checksumSha256,
            documentStatus:    'VALID',
            sourceType:        'HR',
            employeeCanReplace: false,
            hrOnlyVisibility:  metadata.hrOnlyVisibility ?? false,
            notes:             metadata.notes,
            createdBy:         user.id,
            createdByName:     user.name,
          })
          .returning({ id: personDocuments.id })
        newId = row.id

        await writeAuditLog({
          actorId:       user.id,
          actorName:     user.name,
          actorRole:     user.role,
          actorEntityId: person.legalEntityId,
          channel:       'WEB',
          eventType:     'DOCUMENT.UPLOADED',
          resourceType:  'person_documents',
          resourceId:    newId,
          entityId:      person.legalEntityId,
          newValues: {
            documentType:     metadata.documentType,
            documentCategory: category,
            documentTitle:    metadata.documentTitle,
            fileName:         uploaded.fileName,
            fileSizeBytes:    uploaded.fileSizeBytes,
            checksumSha256:   uploaded.checksumSha256,
            sourceType:       'HR',
          },
        }, tx)
      })
    } catch (err) {
      try { await blobDelete(uploaded.storageKey) } catch { /* best-effort cleanup */ }
      throw err
    }

    return { id: newId, sasUrl: uploaded.sasUrl }
  } catch (e) { translateError(e, 'uploadPersonDocument') }
}

// ── Employee self-upload (EMPLOYEE role only) ─────────────────────────────────

/**
 * Server Action — Employee self-upload from ESS.
 * Restricted to EMPLOYEE_UPLOADABLE_TYPES only (identity, personal, education, etc.).
 * Employee can only upload for their own personId.
 * sourceType is always set to 'EMPLOYEE'; employeeCanReplace = true.
 */
export async function uploadMyDocument(
  formData: FormData,
): Promise<{ id: string; sasUrl: string; isTemporaryStorage: boolean } | { error: string }> {
  try {
    // Guard: respect the storage mode.
    // 'not-configured' = durable mode required but no provider set → block upload.
    // 'disabled' = file ops explicitly disabled.
    // 'uat-temporary' = local/tmp storage — allowed with UAT warning shown in UI.
    // 'operational' = durable cloud provider active — full ops.
    const uiState = getStorageUIState()
    if (uiState === 'not-configured') {
      return {
        error:
          'Document storage is not configured for this environment. ' +
          'Upload is disabled until Azure Blob Storage or AWS S3 is configured. ' +
          'Contact your system administrator.',
      }
    }
    if (uiState === 'disabled') {
      return { error: 'Document file operations are disabled in this environment.' }
    }

    const isTemporary = isLocalStorageActive()
    if (isTemporary) {
      console.info(
        '[uploadMyDocument] Using local storage provider (developer mode). ' +
        'DOCUMENT_STORAGE_PROVIDER=local — files written to /tmp or public/uploads. ' +
        'Files are ephemeral and will be lost on server restart. ' +
        'Only suitable for local developer machines. ' +
        'Set DOCUMENT_STORAGE_PROVIDER=azure or aws for any shared environment.',
      )
    }

    const user = await requireRole(['EMPLOYEE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const file    = validateFile(formData.get('file'))
    const rawMeta = formData.get('metadata')
    if (typeof rawMeta !== 'string') throw new Error('metadata is required')

    let metadata: z.infer<typeof EmployeeUploadSchema>
    try {
      metadata = EmployeeUploadSchema.parse(JSON.parse(rawMeta))
    } catch (e) {
      throw new Error(e instanceof z.ZodError ? e.errors[0]?.message ?? 'invalid metadata' : 'invalid metadata payload')
    }

    // EMPLOYEE role: enforce self-only upload (HR roles can call this on behalf of employees)
    if (user.role === 'EMPLOYEE') {
      if (!user.personId) throw new Error('Your employee profile is not linked. Contact HR.')
      if (user.personId !== metadata.personId) {
        throw new Error('FORBIDDEN: you may only upload documents for yourself')
      }
    }

    // Pre-flight: person exists + entity scope
    const [scopeRow] = await db
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons).where(eq(persons.id, metadata.personId)).limit(1)
    if (!scopeRow) throw new Error('person not found')
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'EMPLOYEE' && user.legalEntityId !== scopeRow.legalEntityId) {
      throw new Error('FORBIDDEN: cross-entity document upload denied')
    }

    const uploaded = await blobUpload({
      personId: metadata.personId,
      file,
      fileName: file.name,
      mimeType: file.type || undefined,
    })

    let newId = ''
    try {
      await db.transaction(async tx => {
        const [person] = await tx
          .select({ id: persons.id, legalEntityId: persons.legalEntityId })
          .from(persons).where(eq(persons.id, metadata.personId)).limit(1)
        if (!person) throw new Error('person not found')

        const category = getDocTypeCategory(metadata.documentType)

        const [row] = await tx
          .insert(personDocuments)
          .values({
            tenantId:          TENANT_ID,
            personId:          metadata.personId,
            legalEntityId:     person.legalEntityId,
            documentType:      metadata.documentType,
            documentCategory:  category,
            documentTitle:     metadata.documentTitle,
            documentNumber:    metadata.documentNumber,
            issuingAuthority:  metadata.issuingAuthority,
            issuingCountry:    metadata.issuingCountry,
            issueDate:         metadata.issueDate,
            expiryDate:        metadata.expiryDate,
            isMandatory:       false,
            storageKey:        uploaded.storageKey,
            fileName:          uploaded.fileName,
            fileSizeBytes:     uploaded.fileSizeBytes,
            mimeType:          uploaded.mimeType,
            checksumSha256:    uploaded.checksumSha256,
            documentStatus:    'VALID',
            sourceType:        'EMPLOYEE',
            employeeCanReplace: true,
            hrOnlyVisibility:  false,
            notes:             metadata.notes,
            createdBy:         user.id,
            createdByName:     user.name,
          })
          .returning({ id: personDocuments.id })
        newId = row.id

        await writeAuditLog({
          actorId:       user.id,
          actorName:     user.name,
          actorRole:     user.role,
          actorEntityId: person.legalEntityId,
          channel:       'WEB',
          eventType:     'DOCUMENT.SELF_UPLOADED',
          resourceType:  'person_documents',
          resourceId:    newId,
          entityId:      person.legalEntityId,
          newValues: {
            documentType:     metadata.documentType,
            documentCategory: category,
            documentTitle:    metadata.documentTitle,
            fileName:         uploaded.fileName,
            fileSizeBytes:    uploaded.fileSizeBytes,
            checksumSha256:   uploaded.checksumSha256,
            sourceType:       'EMPLOYEE',
          },
        }, tx)
      })
    } catch (err) {
      try { await blobDelete(uploaded.storageKey) } catch { /* best-effort cleanup */ }
      throw err
    }

    return { id: newId, sasUrl: uploaded.sasUrl, isTemporaryStorage: isTemporary }
  } catch (e) {
    // Return an error object rather than throwing.
    // In production Next.js 15, Server Action throws are sanitized to a generic
    // "An error occurred in the Server Components render" before reaching the
    // client — the real message is lost. Returning { error } keeps it intact.
    const msg = e instanceof Error ? e.message : 'Upload failed. Please try again.'
    console.error('[uploadMyDocument]', msg, e)
    return { error: msg }
  }
}

// ── Document access result type ───────────────────────────────────────────────

/** Error codes returned when document access fails. */
export type DocumentAccessErrorCode =
  | 'FILE_MISSING'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'STORAGE_MISCONFIGURED'
  | 'SIGNED_URL_FAILED'

/**
 * Result of getDocumentUrl — either a secure serve URL or a typed error.
 * The URL points to /api/documents/[id] which handles auth + delivery.
 */
export type DocumentUrlResult =
  | { url: string }
  | { error: string; code: DocumentAccessErrorCode }

// ── SAS URL retrieval (all roles) ─────────────────────────────────────────────

/**
 * Authorises access to a document and returns the secure serve URL.
 *
 * The returned URL is /api/documents/[id] — an authenticated route that handles
 * provider-specific delivery: redirect for cloud (Azure/AWS), filesystem stream
 * for local /tmp (UAT on Vercel).  This design means:
 *  - No raw signed URLs are ever sent to the client
 *  - /tmp files on Vercel can be served (streamed through the API route)
 *  - File existence is pre-checked for local provider to give inline UI errors
 *
 * Download tracking (download_count, last_viewed_at) is updated by the API route
 * when the file is actually served, not here.
 */
export async function getDocumentUrl(
  documentId: string,
): Promise<DocumentUrlResult> {
  try {
    const user = await requireRole([
      'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE', 'SUPER_ADMIN',
    ])

    const [row] = await db
      .select({
        id:               personDocuments.id,
        personId:         personDocuments.personId,
        legalEntityId:    personDocuments.legalEntityId,
        storageKey:       personDocuments.storageKey,
        hrOnlyVisibility: personDocuments.hrOnlyVisibility,
      })
      .from(personDocuments)
      .where(and(
        eq(personDocuments.tenantId, TENANT_ID),
        eq(personDocuments.id, documentId),
      ))
      .limit(1)

    if (!row) return { error: 'Document not found.', code: 'NOT_FOUND' }

    // EMPLOYEE: self-only access
    if (user.role === 'EMPLOYEE' && user.personId !== row.personId) {
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: user.legalEntityId ?? '', channel: 'WEB',
        eventType: 'DOCUMENT.ACCESS_DENIED', resourceType: 'person_documents',
        resourceId: documentId, entityId: row.legalEntityId,
        metadata: { failureReason: 'UNAUTHORIZED' },
      })
      return { error: 'You do not have permission to access this document.', code: 'UNAUTHORIZED' }
    }
    // EMPLOYEE: cannot see HR-only documents
    if (user.role === 'EMPLOYEE' && row.hrOnlyVisibility) {
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: user.legalEntityId ?? '', channel: 'WEB',
        eventType: 'DOCUMENT.ACCESS_DENIED', resourceType: 'person_documents',
        resourceId: documentId, entityId: row.legalEntityId,
        metadata: { failureReason: 'UNAUTHORIZED' },
      })
      return { error: 'You do not have permission to access this document.', code: 'UNAUTHORIZED' }
    }
    // Cross-entity check for HR roles
    const isSelfDoc = user.personId === row.personId
    if (
      user.role !== 'SUPER_ADMIN'
      && !isSelfDoc
      && user.legalEntityId !== row.legalEntityId
    ) {
      await writeAuditLog({
        actorId: user.id, actorName: user.name, actorRole: user.role,
        actorEntityId: user.legalEntityId ?? '', channel: 'WEB',
        eventType: 'DOCUMENT.ACCESS_DENIED', resourceType: 'person_documents',
        resourceId: documentId, entityId: row.legalEntityId,
        metadata: { failureReason: 'UNAUTHORIZED' },
      })
      return { error: 'You do not have permission to access this document.', code: 'UNAUTHORIZED' }
    }

    if (!row.storageKey) {
      return { error: 'No file attached to this document.', code: 'NOT_FOUND' }
    }

    // Pre-flight file existence check for local (/tmp) and durable Postgres
    // providers.  Both expose a cheap fileExists — local is a stat, Postgres is
    // a single-row SELECT — so the user sees an inline error instead of a blank
    // tab when the bytes are absent.  Skipped for cloud providers (the API route
    // does its own existence check before issuing a signed URL).
    const localActive    = isLocalStorageActive()
    const postgresActive = isPostgresStorageActive()
    if (localActive || postgresActive) {
      const exists = await getStorageProvider().fileExists(row.storageKey).catch(() => true)
      if (!exists) {
        await writeAuditLog({
          actorId: user.id, actorName: user.name, actorRole: user.role,
          actorEntityId: row.legalEntityId, channel: 'WEB',
          eventType: 'DOCUMENT.ACCESS_DENIED', resourceType: 'person_documents',
          resourceId: documentId, entityId: row.legalEntityId,
          metadata: { failureReason: 'FILE_MISSING' },
        })
        return {
          error: postgresActive
            ? 'The file bytes for this document were not found in storage. Please re-upload the document.'
            : 'Temporary UAT file is unavailable — it may have been lost due to serverless container isolation or after redeployment. Please re-upload to continue testing.',
          code: 'FILE_MISSING',
        }
      }
    }

    // Access authorised — log and return the secure API endpoint URL.
    // The API route performs defence-in-depth auth + handles provider-specific
    // delivery (stream for /tmp, redirect for cloud).
    await writeAuditLog({
      actorId:       user.id,
      actorName:     user.name,
      actorRole:     user.role,
      actorEntityId: row.legalEntityId,
      channel:       'WEB',
      eventType:     'DOCUMENT.URL_ISSUED',
      resourceType:  'person_documents',
      resourceId:    row.id,
      entityId:      row.legalEntityId,
      metadata:      { ttlMinutes: 5 },
    })

    return { url: `/api/documents/${documentId}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to retrieve document.'
    console.error('[getDocumentUrl]', msg, e)
    return { error: msg, code: 'STORAGE_MISCONFIGURED' }
  }
}

// ── List documents for a person (with filtering) ──────────────────────────────

export interface PersonDocumentRow {
  id:               string
  documentType:     string
  documentCategory: string | null
  documentTitle:    string
  documentNumber:   string | null
  fileName:         string | null
  fileSizeBytes:    number
  mimeType:         string | null
  issueDate:        string | null
  expiryDate:       string | null
  isMandatory:      boolean
  documentStatus:   string
  sourceType:       string
  employeeCanReplace: boolean
  hrOnlyVisibility: boolean
  downloadCount:    number
  createdByName:    string | null
  createdDate:      string | null
  hasFile:          boolean
}

export async function listPersonDocuments(
  personId: string,
): Promise<PersonDocumentRow[]> {
  try {
    const user = await requireRole([
      'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE', 'SUPER_ADMIN',
    ])

    // EMPLOYEE: self-only
    if (user.role === 'EMPLOYEE' && user.personId !== personId) {
      throw new Error('FORBIDDEN: employees may only list their own documents')
    }

    // Entity scope for HR roles
    if (!['SUPER_ADMIN', 'EMPLOYEE'].includes(user.role)) {
      const [person] = await db
        .select({ legalEntityId: persons.legalEntityId })
        .from(persons).where(eq(persons.id, personId)).limit(1)
      if (person && person.legalEntityId !== user.legalEntityId) {
        throw new Error('FORBIDDEN: cross-entity access denied')
      }
    }

    const isEmployee = user.role === 'EMPLOYEE'
    const rows = await db
      .select({
        id:               personDocuments.id,
        documentType:     personDocuments.documentType,
        documentCategory: personDocuments.documentCategory,
        documentTitle:    personDocuments.documentTitle,
        documentNumber:   personDocuments.documentNumber,
        fileName:         personDocuments.fileName,
        fileSizeBytes:    personDocuments.fileSizeBytes,
        mimeType:         personDocuments.mimeType,
        issueDate:        personDocuments.issueDate,
        expiryDate:       personDocuments.expiryDate,
        isMandatory:      personDocuments.isMandatory,
        documentStatus:   personDocuments.documentStatus,
        sourceType:       personDocuments.sourceType,
        employeeCanReplace: personDocuments.employeeCanReplace,
        hrOnlyVisibility: personDocuments.hrOnlyVisibility,
        downloadCount:    personDocuments.downloadCount,
        createdByName:    personDocuments.createdByName,
        createdDate:      personDocuments.createdDate,
        storageKey:       personDocuments.storageKey,
      })
      .from(personDocuments)
      .where(and(
        eq(personDocuments.tenantId, TENANT_ID),
        eq(personDocuments.personId, personId),
        // Employees cannot see HR-only documents
        ...(isEmployee ? [eq(personDocuments.hrOnlyVisibility, false)] : []),
      ))
      .orderBy(personDocuments.createdDate)

    return rows.map(r => ({
      ...r,
      fileSizeBytes:  Number(r.fileSizeBytes ?? 0),
      downloadCount:  Number(r.downloadCount ?? 0),
      issueDate:      r.issueDate ?? null,
      expiryDate:     r.expiryDate ?? null,
      createdDate:    r.createdDate?.toISOString() ?? null,
      hasFile:        !!r.storageKey,
    }))
  } catch (e) {
    // Return empty list on error — same safe-default pattern as BUG-NAV-001.
    // translateError re-throws as AppError which crashes the calling Server Component.
    console.error('[listPersonDocuments]', e instanceof Error ? e.message : e)
    return []
  }
}

// ── Employee self-service: edit document metadata ─────────────────────────────

const UpdateMyDocSchema = z.object({
  documentTitle:  z.string().min(1).max(200),
  documentNumber: z.string().max(100).optional().nullable(),
  issueDate:      hrDateString().optional().nullable(),
  expiryDate:     hrDateString().optional().nullable(),
  notes:          z.string().max(2000).optional().nullable(),
})

export type UpdateMyDocumentInput = z.infer<typeof UpdateMyDocSchema>

/**
 * Server Action — employee edits the metadata of one of their own self-uploaded
 * documents (title, document number, issue/start date, expiry/end date, notes).
 *
 * Guard: EMPLOYEE may only edit documents where personId == own personId AND
 * sourceType == 'EMPLOYEE' AND employeeCanReplace == true.  HR-uploaded docs
 * (contracts, warning letters, etc.) are never editable by the employee.
 *
 * Returns { success: true } or { error } — never throws (Next.js 15 sanitises
 * Server Action throws in production).
 */
export async function updateMyDocumentMeta(
  documentId: string,
  input:      UpdateMyDocumentInput,
): Promise<{ success: true } | { error: string }> {
  try {
    const user = await requireRole(['EMPLOYEE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    let data: UpdateMyDocumentInput
    try {
      data = UpdateMyDocSchema.parse(input)
    } catch (e) {
      return { error: e instanceof z.ZodError ? (e.errors[0]?.message ?? 'Invalid input') : 'Invalid input' }
    }

    const [row] = await db
      .select({
        id:                 personDocuments.id,
        personId:           personDocuments.personId,
        legalEntityId:      personDocuments.legalEntityId,
        sourceType:         personDocuments.sourceType,
        employeeCanReplace: personDocuments.employeeCanReplace,
        documentStatus:     personDocuments.documentStatus,
      })
      .from(personDocuments)
      .where(and(eq(personDocuments.tenantId, TENANT_ID), eq(personDocuments.id, documentId)))
      .limit(1)

    if (!row) return { error: 'Document not found.' }

    // Ownership + editability gate.
    if (user.role === 'EMPLOYEE') {
      if (user.personId !== row.personId) {
        return { error: 'You can only edit your own documents.' }
      }
      if (!(row.sourceType === 'EMPLOYEE' && row.employeeCanReplace)) {
        return { error: 'This document was added by HR and cannot be edited here. Please contact HR.' }
      }
    } else if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== row.legalEntityId) {
      return { error: 'You do not have permission to edit this document.' }
    }

    // Recompute the stored status from the (possibly changed) expiry date.
    const newStatus = computeDocumentStatus(row.documentStatus ?? 'VALID', data.expiryDate ?? null)

    await db.transaction(async tx => {
      await tx
        .update(personDocuments)
        .set({
          documentTitle:   data.documentTitle,
          documentNumber:  data.documentNumber ?? null,
          issueDate:       data.issueDate ?? null,
          expiryDate:      data.expiryDate ?? null,
          notes:           data.notes ?? null,
          documentStatus:  newStatus,
          updatedBy:       user.id,
          updatedByName:   user.name,
          lastUpdatedDate: new Date(),
          updatedDate:     new Date(),
        })
        .where(and(eq(personDocuments.tenantId, TENANT_ID), eq(personDocuments.id, documentId)))

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: row.legalEntityId,
        channel:       'WEB',
        eventType:     'DOCUMENT.METADATA_UPDATED',
        resourceType:  'person_documents',
        resourceId:    documentId,
        entityId:      row.legalEntityId,
        newValues: {
          documentTitle:  data.documentTitle,
          documentNumber: data.documentNumber ?? null,
          issueDate:      data.issueDate ?? null,
          expiryDate:     data.expiryDate ?? null,
          documentStatus: newStatus,
        },
      }, tx)
    })

    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to update document.'
    console.error('[updateMyDocumentMeta]', msg, e)
    return { error: msg }
  }
}

// ── Employee self-service: delete a self-uploaded document ────────────────────

/**
 * Server Action — employee deletes one of their own self-uploaded documents
 * (e.g. a wrong file uploaded by mistake), so they can re-upload the correct one.
 *
 * Guard: identical to updateMyDocumentMeta — EMPLOYEE self-only, sourceType
 * 'EMPLOYEE', employeeCanReplace true.  HR-uploaded docs are never deletable here.
 *
 * The person_documents row is removed inside a transaction with a
 * DOCUMENT.DELETED audit entry that captures the deleted metadata (permanent
 * record of the deletion).  The backing file bytes are removed best-effort after
 * commit via the active storage provider (PostgreSQL row / Azure blob / S3 / tmp).
 */
export async function deleteMyDocument(
  documentId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const user = await requireRole(['EMPLOYEE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [row] = await db
      .select({
        id:                 personDocuments.id,
        personId:           personDocuments.personId,
        legalEntityId:      personDocuments.legalEntityId,
        sourceType:         personDocuments.sourceType,
        employeeCanReplace: personDocuments.employeeCanReplace,
        documentType:       personDocuments.documentType,
        documentTitle:      personDocuments.documentTitle,
        storageKey:         personDocuments.storageKey,
      })
      .from(personDocuments)
      .where(and(eq(personDocuments.tenantId, TENANT_ID), eq(personDocuments.id, documentId)))
      .limit(1)

    if (!row) return { error: 'Document not found.' }

    if (user.role === 'EMPLOYEE') {
      if (user.personId !== row.personId) {
        return { error: 'You can only delete your own documents.' }
      }
      if (!(row.sourceType === 'EMPLOYEE' && row.employeeCanReplace)) {
        return { error: 'This document was added by HR and cannot be deleted here. Please contact HR.' }
      }
    } else if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== row.legalEntityId) {
      return { error: 'You do not have permission to delete this document.' }
    }

    await db.transaction(async tx => {
      await tx
        .delete(personDocuments)
        .where(and(eq(personDocuments.tenantId, TENANT_ID), eq(personDocuments.id, documentId)))

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: row.legalEntityId,
        channel:       'WEB',
        eventType:     'DOCUMENT.DELETED',
        resourceType:  'person_documents',
        resourceId:    documentId,
        entityId:      row.legalEntityId,
        // Permanent record of what was deleted (storageKey, not file content).
        newValues: {
          documentType:  row.documentType,
          documentTitle: row.documentTitle,
          storageKey:    row.storageKey,
          deletedBy:     user.role,
        },
      }, tx)
    })

    // Best-effort removal of the backing file bytes after the row is gone.
    if (row.storageKey) {
      try { await blobDelete(row.storageKey) } catch { /* orphaned bytes are harmless */ }
    }

    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete document.'
    console.error('[deleteMyDocument]', msg, e)
    return { error: msg }
  }
}
