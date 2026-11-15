'use server'

/**
 * uploadProfilePhoto — Server Action.
 *
 * Accepts a multipart form containing a single image file and stores it as
 * the employee's profile photo.
 *
 * Storage strategy (dual-write for durability):
 *   1. profilePhotoData  — base64 data URL written to Neon TEXT column.
 *                          Always populated. Durable across Vercel container
 *                          restarts and container-to-container routing.
 *   2. profilePhotoUrl   — cloud storage signed URL (Azure/AWS, 7-day TTL).
 *                          Populated when DOCUMENT_STORAGE_PROVIDER=azure/aws.
 *                          Empty string when cloud is not configured.
 *
 * Display priority (callers): profilePhotoUrl || profilePhotoData
 *   - Cloud configured  → use profilePhotoUrl (fast CDN delivery)
 *   - No cloud (UAT)    → profilePhotoUrl='', falls back to profilePhotoData base64
 *
 * Roles allowed:
 *   - EMPLOYEE              — own photo only (personId must equal session.user.personId)
 *   - HR_ADMIN, HR_DIRECTOR — any employee in same legal entity
 *   - SUPER_ADMIN           — any employee across all entities
 *
 * Hard Rule 1: DB write + audit in same Drizzle transaction.
 * FIX-2G-002:  Only storageKey (not the live credential) goes into audit log.
 */
import { translateError }        from '@/lib/app-error'
import { eq, and }               from 'drizzle-orm'
import { persons }               from '@/drizzle/schema'
import { db }                    from '@/lib/db'
import { writeAuditLog }         from '@/lib/audit'
import { requireRole }           from '@/lib/auth'
import { TENANT_ID }             from '@/lib/constants'
import { revalidatePath }        from 'next/cache'
import { getStorageProvider }    from '@/lib/storage'
import { PHOTO_SAS_TTL_MINUTES } from '@/lib/blob-storage'
import { randomUUID }            from 'crypto'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
const MAX_BYTES    = 2 * 1024 * 1024 // 2 MB

export async function uploadProfilePhoto(
  personId: string,
  formData:  FormData,
): Promise<{ photoUrl: string; photoData: string }> {
  try {
    // Allow employees to upload their own photo; HR roles can upload for anyone.
    const user = await requireRole([
      'EMPLOYEE', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
    ])

    // EMPLOYEE may only update their own photo.
    if (user.role === 'EMPLOYEE' && user.personId !== personId) {
      throw new Error('FORBIDDEN: employees can only update their own profile photo')
    }

    const file = formData.get('photo') as File | null
    if (!file || file.size === 0) throw new Error('No file provided')
    if (file.size > MAX_BYTES)    throw new Error('File exceeds 2 MB limit')
    if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
      throw new Error('Only JPEG, PNG, WebP, or GIF images are accepted')
    }

    // Verify person exists and is in scope.
    const [person] = await db
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
      .limit(1)
    if (!person) throw new Error('Person not found')

    // Non-SUPER_ADMIN HR roles are scoped to their own entity.
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'EMPLOYEE' && user.legalEntityId !== person.legalEntityId) {
      throw new Error('FORBIDDEN: cannot update profiles in another legal entity')
    }

    const buf          = Buffer.from(await file.arrayBuffer())
    // ── Durable base64 fallback — always computed ─────────────────────────
    const base64DataUrl = `data:${file.type};base64,${buf.toString('base64')}`

    // ── Cloud storage attempt (best-effort) ───────────────────────────────
    const ext       = file.type.split('/')[1] ?? 'jpg'
    const key       = `persons/${personId}/photos/${randomUUID()}.${ext}`
    let   cloudUrl  = ''
    let   storageKey = key

    try {
      const storage = getStorageProvider()
      const result  = await storage.uploadFile({
        key,
        data:     buf,
        mimeType: file.type,
        metadata: { personid: personId, uploadedAt: new Date().toISOString() },
      })
      storageKey = result.storageKey
      cloudUrl   = await storage.getSignedUrl(result.storageKey, PHOTO_SAS_TTL_MINUTES)
      if (!cloudUrl) {
        console.info(
          `[photo-upload] Cloud storage returned empty URL for key ${result.storageKey}. ` +
          'Base64 fallback will be used. Set DOCUMENT_STORAGE_PROVIDER=azure or aws ' +
          'for CDN-delivered photos.',
        )
      }
    } catch (storageErr) {
      // Cloud storage not configured or unavailable — base64 is the canonical copy.
      console.info(
        `[photo-upload] Cloud storage unavailable (${(storageErr as Error).message}). ` +
        'Storing photo as base64 in Neon — durable but not CDN-delivered.',
      )
    }

    // ── Persist to DB in a transaction ────────────────────────────────────
    await db.transaction(async tx => {
      await tx
        .update(persons)
        .set({
          // Cloud URL when available; empty string otherwise.
          profilePhotoUrl:  cloudUrl,
          // Base64 data URL — always populated, always durable.
          profilePhotoData: base64DataUrl,
          lastUpdatedDate:  new Date(),
          updatedBy:        user.id,
          updatedByName:    user.name,
          updatedDate:      new Date(),
        })
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: person.legalEntityId,
        channel:       'WEB',
        eventType:     'PERSON.PROFILE_PHOTO_UPDATED',
        resourceType:  'persons',
        resourceId:    personId,
        entityId:      person.legalEntityId,
        // FIX-2G-002: log storageKey, not live credential
        newValues:     { storageKey, hasBase64: true },
      }, tx)
    })

    revalidatePath(`/persons/${personId}`)
    revalidatePath(`/me/profile`)

    // Return the most-useful URL for the caller:
    // Cloud URL if available; base64 data URL otherwise.
    // The caller MUST receive a non-empty string to confirm persistence.
    const photoUrl = cloudUrl || base64DataUrl
    return { photoUrl, photoData: base64DataUrl }
  } catch (e) { translateError(e, 'uploadProfilePhoto') }
}
