/**
 * GET /api/documents/[id]?mode=view|download&src=<page>
 *
 * Secure document serving endpoint.  All access is authorised server-side
 * before any file content is returned.  Three delivery strategies:
 *
 *  1. Local provider + public/uploads  → 302 to /uploads/{key} (static serving)
 *  2. Local provider + /tmp            → stream file bytes (local dev only)
 *  3. Cloud provider (Azure/AWS)       → 302 to short-lived (5 min) signed URL
 *
 * Vercel deployed + local storage → 503 immediately (container isolation makes
 * /tmp unreliable; caller must configure Azure/AWS).
 * File missing after container recycle → 404 with user-friendly message.
 * Unauthorised                          → 403.
 * Storage misconfigured                → 503.
 *
 * Every access writes a DOCUMENT.ACCESSED or DOCUMENT.ACCESS_DENIED audit row.
 *
 * S3-11 security requirement: no public bucket/container access; no raw storage
 * keys exposed to clients; signed URLs are read-only and short-lived.
 */
import { NextRequest, NextResponse } from 'next/server'
import * as fs   from 'fs'
import * as path from 'path'
import { eq, and, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { personDocuments, documentFiles } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { writeAuditLog } from '@/lib/audit'
import { getStorageProvider, isLocalStorageActive, isPostgresStorageActive, getStorageUIState } from '@/lib/storage'
import { rateLimit, rateLimitKey, clientIp, RATE_LIMITS } from '@/lib/rate-limit'

// ── Helpers ───────────────────────────────────────────────────────────────────

type AuditActor = {
  id:            string
  name:          string
  role:          string
  legalEntityId: string
}

async function auditAccess(
  actor:          AuditActor,
  documentId:     string,
  entityId:       string,
  sourcePage:     string,
  mode:           string,
  success:        boolean,
  failureReason?: string,
) {
  await writeAuditLog({
    actorId:       actor.id,
    actorName:     actor.name,
    actorRole:     actor.role,
    actorEntityId: actor.legalEntityId,
    channel:       'WEB',
    eventType:     success ? 'DOCUMENT.ACCESSED' : 'DOCUMENT.ACCESS_DENIED',
    resourceType:  'person_documents',
    resourceId:    documentId,
    entityId,
    metadata: {
      mode,
      sourcePage,
      ...(failureReason ? { failureReason } : {}),
    },
  }).catch(() => undefined) // best-effort
}

/** Fire-and-forget download counter + last_viewed_at update. */
function trackAccess(documentId: string, mode: string) {
  db.update(personDocuments)
    .set({
      downloadCount:    sql`${personDocuments.downloadCount} + 1`,
      lastViewedAt:     new Date(),
      ...(mode === 'download' ? { lastDownloadedAt: new Date() } : {}),
    })
    .where(eq(personDocuments.id, documentId))
    .catch(() => undefined)
}

/** Simple HTML error page so browser-opened tabs show a readable message. */
function htmlError(title: string, detail: string, status: number) {
  return new NextResponse(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>` +
    `<style>body{font-family:sans-serif;max-width:520px;margin:80px auto;padding:0 20px;color:#374151}` +
    `h1{font-size:1.25rem;margin-bottom:.5rem}p{color:#6B7280;font-size:.9rem}` +
    `a{color:#2563EB;text-decoration:none}a:hover{text-decoration:underline}</style></head>` +
    `<body><h1>${title}</h1><p>${detail}</p><p><a href="javascript:window.close()">Close this tab</a></p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await context.params
  const mode       = (request.nextUrl.searchParams.get('mode') ?? 'view') as 'view' | 'download'
  const sourcePage = request.nextUrl.searchParams.get('src') ?? 'UNKNOWN'

  // Determine whether the caller is a browser (prefers HTML errors) or a
  // programmatic fetch (prefers JSON errors).
  const acceptsHtml = (request.headers.get('accept') ?? '').includes('text/html')

  function errorResponse(title: string, detail: string, code: string, status: number) {
    if (acceptsHtml) return htmlError(title, detail, status)
    return NextResponse.json({ error: detail, code }, { status })
  }

  // ── 0. Storage mode guard ────────────────────────────────────────────────
  // 'not-configured': durable mode required but no provider set → 503.
  // 'disabled': file ops explicitly turned off → 503.
  // 'uat-temporary': local/tmp storage allowed (UAT) → proceed (file may be missing).
  // 'operational': cloud provider active → proceed.
  const uiState = getStorageUIState()
  if (uiState === 'not-configured') {
    return errorResponse(
      'Storage Not Configured',
      'Document storage is not configured for this environment. ' +
      'Upload, view and download are disabled until Azure Blob Storage or ' +
      'AWS S3 is configured. Contact your system administrator.',
      'STORAGE_MISCONFIGURED',
      503,
    )
  }
  if (uiState === 'disabled') {
    return errorResponse(
      'File Operations Disabled',
      'Document file operations are disabled in this environment.',
      'STORAGE_DISABLED',
      503,
    )
  }

  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const session = await auth()
  if (!session?.user) {
    return errorResponse(
      'Authentication Required',
      'You must be signed in to access documents.',
      'UNAUTHENTICATED',
      401,
    )
  }

  const rawUser = session.user as {
    id?: string; name?: string; role?: string;
    personId?: string; legalEntityId?: string
  }
  const actor: AuditActor = {
    id:            rawUser.id            ?? '',
    name:          rawUser.name          ?? 'Unknown',
    role:          rawUser.role          ?? 'EMPLOYEE',
    legalEntityId: rawUser.legalEntityId ?? '',
  }

  // EPRC-01 B2 (RATE-01): throttle document fetches per user+IP.
  const docRl = rateLimit(
    rateLimitKey('documents', clientIp(request.headers), actor.id),
    RATE_LIMITS.DOCUMENTS,
  )
  if (!docRl.allowed) {
    return errorResponse(
      'Too Many Requests',
      'Too many document requests — please wait a moment and try again.',
      'RATE_LIMITED',
      429,
    )
  }

  // ── 2. DB lookup ─────────────────────────────────────────────────────────
  let row: {
    id: string; personId: string; legalEntityId: string;
    storageKey: string | null; fileName: string | null;
    mimeType: string | null; hrOnlyVisibility: boolean
  } | null = null

  try {
    const [found] = await db
      .select({
        id:               personDocuments.id,
        personId:         personDocuments.personId,
        legalEntityId:    personDocuments.legalEntityId,
        storageKey:       personDocuments.storageKey,
        fileName:         personDocuments.fileName,
        mimeType:         personDocuments.mimeType,
        hrOnlyVisibility: personDocuments.hrOnlyVisibility,
      })
      .from(personDocuments)
      .where(and(
        eq(personDocuments.id, documentId),
        eq(personDocuments.tenantId, TENANT_ID),
      ))
      .limit(1)
    row = found ?? null
  } catch {
    return errorResponse('Service Unavailable', 'Failed to retrieve document. Please try again.', 'DB_ERROR', 503)
  }

  if (!row) {
    await auditAccess(actor, documentId, actor.legalEntityId, sourcePage, mode, false, 'NOT_FOUND')
    return errorResponse('Document Not Found', 'The requested document does not exist.', 'NOT_FOUND', 404)
  }

  const entityId = row.legalEntityId

  // ── 3. Access control ────────────────────────────────────────────────────
  if (actor.role === 'EMPLOYEE') {
    if (rawUser.personId !== row.personId) {
      await auditAccess(actor, documentId, entityId, sourcePage, mode, false, 'UNAUTHORIZED')
      return errorResponse('Access Denied', 'You do not have permission to access this document.', 'UNAUTHORIZED', 403)
    }
    if (row.hrOnlyVisibility) {
      await auditAccess(actor, documentId, entityId, sourcePage, mode, false, 'UNAUTHORIZED')
      return errorResponse('Access Denied', 'You do not have permission to access this document.', 'UNAUTHORIZED', 403)
    }
  } else if (actor.role !== 'SUPER_ADMIN') {
    const isSelfDoc = rawUser.personId === row.personId
    if (!isSelfDoc && actor.legalEntityId !== row.legalEntityId) {
      await auditAccess(actor, documentId, entityId, sourcePage, mode, false, 'UNAUTHORIZED')
      return errorResponse('Access Denied', 'You do not have permission to access this document.', 'UNAUTHORIZED', 403)
    }
  }

  if (!row.storageKey) {
    await auditAccess(actor, documentId, entityId, sourcePage, mode, false, 'FILE_MISSING')
    return errorResponse('No File', 'No file is attached to this document record.', 'FILE_MISSING', 404)
  }

  const contentType        = row.mimeType ?? 'application/octet-stream'
  const safeFileName       = encodeURIComponent(row.fileName ?? 'document')
  const contentDisposition = mode === 'download'
    ? `attachment; filename="${safeFileName}"`
    : `inline; filename="${safeFileName}"`

  // ── 4. Serve file ────────────────────────────────────────────────────────

  if (isPostgresStorageActive()) {
    // Durable in-DB storage: stream bytes from document_files (migration 0052).
    let fileRow: { fileData: Buffer; mimeType: string } | null = null
    try {
      const [found] = await db
        .select({ fileData: documentFiles.fileData, mimeType: documentFiles.mimeType })
        .from(documentFiles)
        .where(eq(documentFiles.storageKey, row.storageKey))
        .limit(1)
      fileRow = found ? { fileData: Buffer.from(found.fileData), mimeType: found.mimeType } : null
    } catch {
      return errorResponse('Service Unavailable', 'Failed to retrieve document. Please try again.', 'DB_ERROR', 503)
    }

    if (!fileRow) {
      await auditAccess(actor, documentId, entityId, sourcePage, mode, false, 'FILE_MISSING')
      return errorResponse(
        'File Not Found',
        'The file bytes for this document were not found in storage. Please re-upload the document.',
        'FILE_MISSING',
        404,
      )
    }

    await auditAccess(actor, documentId, entityId, sourcePage, mode, true)
    trackAccess(documentId, mode)
    // Wrap in Uint8Array — a clean BodyInit regardless of the Buffer<ArrayBufferLike> type.
    const body = new Uint8Array(fileRow.fileData)
    return new NextResponse(body, {
      status:  200,
      headers: {
        'Content-Type':        fileRow.mimeType || contentType,
        'Content-Disposition': contentDisposition,
        'Content-Length':      String(body.length),
        'Cache-Control':       'private, no-store',
        'X-Storage-Mode':      'postgres',
      },
    })
  }

  if (isLocalStorageActive()) {
    // Local provider: check public/uploads first, then /tmp
    const publicDest = path.join(process.cwd(), 'public', 'uploads', row.storageKey)
    const tmpDest    = path.join('/tmp', 'avaniis-uploads', row.storageKey)

    if (fs.existsSync(publicDest)) {
      await auditAccess(actor, documentId, entityId, sourcePage, mode, true)
      trackAccess(documentId, mode)
      // Redirect to static Next.js-served path; browser handles Content-Type
      return NextResponse.redirect(new URL(`/uploads/${row.storageKey}`, request.url), 302)
    }

    if (fs.existsSync(tmpDest)) {
      // Stream from /tmp — the only way to serve ephemeral Vercel files
      await auditAccess(actor, documentId, entityId, sourcePage, mode, true)
      trackAccess(documentId, mode)
      const fileData = fs.readFileSync(tmpDest)
      return new NextResponse(fileData, {
        status:  200,
        headers: {
          'Content-Type':        contentType,
          'Content-Disposition': contentDisposition,
          'Content-Length':      String(fileData.length),
          'Cache-Control':       'private, no-store',
          'X-Storage-Mode':      'uat-tmp',
        },
      })
    }

    // File existed at upload time but /tmp was recycled (different Lambda / container restart)
    await auditAccess(actor, documentId, entityId, sourcePage, mode, false, 'FILE_MISSING')
    return errorResponse(
      'File No Longer Available',
      'Temporary UAT file is unavailable — it may have been lost due to serverless container isolation or after redeployment. Please re-upload to continue testing.',
      'FILE_MISSING',
      404,
    )
  }

  // Cloud provider (Azure Blob / AWS S3): issue a short-lived signed URL and redirect.
  // 5-minute TTL satisfies the security requirement for short-lived read-only URLs.
  const provider = getStorageProvider()

  const fileExists = await provider.fileExists(row.storageKey).catch(() => true)
  if (!fileExists) {
    await auditAccess(actor, documentId, entityId, sourcePage, mode, false, 'FILE_MISSING')
    return errorResponse(
      'File Not Found',
      'Temporary UAT file is unavailable — it may have been lost due to serverless container isolation or after redeployment. Please re-upload to continue testing.',
      'FILE_MISSING',
      404,
    )
  }

  const signedUrl = await provider.getSignedUrl(row.storageKey, 5).catch(() => '')
  if (!signedUrl) {
    await auditAccess(actor, documentId, entityId, sourcePage, mode, false, 'SIGNED_URL_FAILED')
    return errorResponse(
      'Storage Unavailable',
      'Failed to generate access link. Please try again.',
      'SIGNED_URL_FAILED',
      503,
    )
  }

  await auditAccess(actor, documentId, entityId, sourcePage, mode, true)
  trackAccess(documentId, mode)
  return NextResponse.redirect(signedUrl, 302)
}
