'use server'

import { db }                  from '@/lib/db'
import { eq }                  from 'drizzle-orm'
import { z }                   from 'zod'
import { revalidatePath }      from 'next/cache'
import { pagePersonalization } from '@/drizzle/schema'
import { writeAuditLog }       from '@/lib/audit'
import { requireRole }         from '@/lib/auth'
import { TENANT_ID }           from '@/lib/constants'

// ── Types ──────────────────────────────────────────────────────────────────

export type CarouselImage = {
  id:          string
  url:         string        // DB-backed base64 data: URL (or legacy http URL)
  alt:         string
  order:       number
  uploadedAt:  string
  fileSize?:   number
  mimeType?:   string
}

export type UpdatePersonalizationInput = {
  top_banner_text?:     string
  top_banner_visible?:  boolean
  ticker_text?:         string
  ticker_visible?:      boolean
  ticker_speed?:        number
  carousel_height_pct?: number
  logo_url?:            string | null
}

// ── Validation ─────────────────────────────────────────────────────────────

const UpdateSchema = z.object({
  top_banner_text:     z.string().max(120).optional(),
  top_banner_visible:  z.boolean().optional(),
  ticker_text:         z.string().max(500).optional(),
  ticker_visible:      z.boolean().optional(),
  ticker_speed:        z.number().int().min(5).max(120).optional(),
  carousel_height_pct: z.number().int().min(40).max(85).optional(),
  logo_url:            z.string().url().nullable().optional(),
})

// ── Branding asset upload limits ─────────────────────────────────────────────
// Branding logo + carousel images are stored DB-backed as base64 data: URLs
// (mirrors the employee profile-photo pattern in modules/core-hr/photo-upload.ts
// — persons.profile_photo_data). This makes branding durable across Vercel
// container recycles / redeploys with NO external storage provider required.
// logo_url is `text` (unbounded) and carousel_images is `jsonb`, so no migration.
const MAX_BRANDING_BYTES   = 2 * 1024 * 1024 // 2 MB
const ALLOWED_BRANDING_MIME = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp']

/** Reads an uploaded image File into a durable base64 data: URL. */
async function fileToDataUrl(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer())
  return `data:${file.type};base64,${buf.toString('base64')}`
}

// ── getPagePersonalization ─────────────────────────────────────────────────
// No auth required — used by the public sign-in page.

const DEFAULT_PERSONALIZATION = (entityId: string) => ({
  id:                null as unknown as string,
  entityId,
  topBannerText:     'AI Driven HR System',
  topBannerVisible:  true,
  tickerText:        'Avaniis HR · People, leave, payroll and approvals',
  tickerVisible:     true,
  tickerSpeed:       30,
  carouselImages:    [] as CarouselImage[],
  logoUrl:           null as string | null,
  carouselHeightPct: 70,
  createdAt:         new Date(),
  updatedAt:         new Date(),
  updatedBy:         null as string | null,
})

// Match the public fallback on first save/upload rather than historical DB copy.
const NEW_PERSONALIZATION = { topBannerText: 'AI Driven HR System', tickerText: 'Company news and announcements', tickerSpeed: 30, carouselHeightPct: 70 }

export async function getPagePersonalization(entityId: string) {
  try {
    const rows = await db
      .select()
      .from(pagePersonalization)
      .where(eq(pagePersonalization.entityId, entityId))
      .limit(1)

    if (rows.length > 0) return rows[0]
  } catch {
    // DB unreachable (e.g. container not started) — sign-in page must always render.
  }

  return DEFAULT_PERSONALIZATION(entityId)
}

// ── updatePagePersonalization ──────────────────────────────────────────────

export async function updatePagePersonalization(
  entityId: string,
  data:      UpdatePersonalizationInput,
) {
  const user   = await requireRole(['SUPER_ADMIN'])
  const parsed = UpdateSchema.parse(data)

  const now = new Date()

  const patch: Partial<typeof pagePersonalization.$inferInsert> = {
    updatedAt: now,
    updatedBy: user.id,
  }
  if (parsed.top_banner_text    !== undefined) patch.topBannerText    = parsed.top_banner_text
  if (parsed.top_banner_visible !== undefined) patch.topBannerVisible = parsed.top_banner_visible
  if (parsed.ticker_text        !== undefined) patch.tickerText       = parsed.ticker_text
  if (parsed.ticker_visible     !== undefined) patch.tickerVisible    = parsed.ticker_visible
  if (parsed.ticker_speed       !== undefined) patch.tickerSpeed      = parsed.ticker_speed
  if (parsed.carousel_height_pct !== undefined) patch.carouselHeightPct = parsed.carousel_height_pct
  if ('logo_url' in parsed)                    patch.logoUrl          = parsed.logo_url ?? null

  return db.transaction(async tx => {
    const existing = await tx
      .select({ id: pagePersonalization.id })
      .from(pagePersonalization)
      .where(eq(pagePersonalization.entityId, entityId))
      .limit(1)

    let updated: typeof pagePersonalization.$inferSelect

    if (existing.length === 0) {
      const [row] = await tx
        .insert(pagePersonalization)
        .values({ ...NEW_PERSONALIZATION, entityId, ...patch, createdAt: now })
        .returning()
      updated = row
    } else {
      const [row] = await tx
        .update(pagePersonalization)
        .set(patch)
        .where(eq(pagePersonalization.entityId, entityId))
        .returning()
      updated = row
    }

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name ?? user.email,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    'PAGE_PERSONALIZATION_UPDATED',
      resourceType: 'page_personalization',
      resourceId:   updated.id,
      entityId,
      newValues:    parsed as Record<string, unknown>,
    }, tx)

    revalidatePath('/', 'layout')
    return updated
  })
}

// ── uploadBrandingLogo ─────────────────────────────────────────────────────
// Dedicated logo upload. Stores the image DB-backed as a base64 data: URL in
// page_personalization.logo_url (no external storage provider). Never touches
// carousel_images. Returns { error } instead of throwing so the real, actionable
// message reaches the client (a thrown Server Action error is sanitized to the
// generic "Server Components render" digest in Next.js 15 production — BUG-DMG-002).

export async function uploadBrandingLogo(
  entityId: string,
  formData:  FormData,
): Promise<{ logoUrl: string } | { error: string }> {
  const user = await requireRole(['SUPER_ADMIN'])

  try {
    const file = formData.get('file') as File | null
    if (!file || file.size === 0)         return { error: 'No file provided.' }
    if (file.size > MAX_BRANDING_BYTES)   return { error: 'File too large (max 2 MB).' }
    if (!ALLOWED_BRANDING_MIME.includes(file.type)) {
      return { error: 'Invalid file type. Use PNG, SVG, JPG, or WebP.' }
    }

    const logoUrl = await fileToDataUrl(file)
    const now     = new Date()

    const updated = await db.transaction(async tx => {
      const existing = await tx
        .select({ id: pagePersonalization.id })
        .from(pagePersonalization)
        .where(eq(pagePersonalization.entityId, entityId))
        .limit(1)

      let row: typeof pagePersonalization.$inferSelect
      if (existing.length === 0) {
        const [r] = await tx
          .insert(pagePersonalization)
          .values({ ...NEW_PERSONALIZATION, entityId, logoUrl, createdAt: now, updatedAt: now, updatedBy: user.id })
          .returning()
        row = r
      } else {
        const [r] = await tx
          .update(pagePersonalization)
          .set({ logoUrl, updatedAt: now, updatedBy: user.id })
          .where(eq(pagePersonalization.entityId, entityId))
          .returning()
        row = r
      }

      await writeAuditLog({
        actorId:      user.id,
        actorName:    user.name ?? user.email,
        actorRole:    user.role,
        channel:      'WEB',
        eventType:    'BRANDING_LOGO_UPDATED',
        resourceType: 'page_personalization',
        resourceId:   row.id,
        entityId,
        // Never log the base64 payload itself — metadata only.
        newValues:    { logoStored: 'db-base64', mimeType: file.type, fileSize: file.size },
      }, tx)

      return row
    })

    revalidatePath('/sign-in')
    revalidatePath('/', 'layout')
    return { logoUrl: updated.logoUrl ?? logoUrl }
  } catch (e) {
    console.error('[uploadBrandingLogo] failed:', e)
    return { error: 'Could not save the logo. Please try again.' }
  }
}

// ── uploadCarouselImage ────────────────────────────────────────────────────

// Stores the carousel image DB-backed as a base64 data: URL in carousel_images
// (jsonb). No external storage provider. Returns { error } instead of throwing.
export async function uploadCarouselImage(
  entityId: string,
  formData:  FormData,
): Promise<{ images: CarouselImage[] } | { error: string }> {
  const user = await requireRole(['SUPER_ADMIN'])

  try {
    const file = formData.get('file') as File | null
    if (!file || file.size === 0)         return { error: 'No file provided.' }
    if (file.size > MAX_BRANDING_BYTES)   return { error: 'File too large (max 2 MB).' }
    if (!ALLOWED_BRANDING_MIME.includes(file.type)) {
      return { error: 'Invalid file type. Use PNG, SVG, JPG, or WebP.' }
    }

    const dataUrl = await fileToDataUrl(file)
    const newImage: CarouselImage = {
      id:         crypto.randomUUID(),
      url:        dataUrl,
      alt:        (file.name ?? '').replace(/\.[^.]+$/, '') || 'Carousel image',
      order:      0,
      uploadedAt: new Date().toISOString(),
      fileSize:   file.size,
      mimeType:   file.type,
    }

    const images = await db.transaction(async tx => {
      const existing = await tx
        .select()
        .from(pagePersonalization)
        .where(eq(pagePersonalization.entityId, entityId))
        .limit(1)

      const currentImages: CarouselImage[] = existing[0]
        ? (existing[0].carouselImages as CarouselImage[]) ?? []
        : []

      const nextImages = [...currentImages, newImage]
        .map((img, idx) => ({ ...img, order: idx }))

      let rowId: string
      if (existing.length === 0) {
        const [r] = await tx
          .insert(pagePersonalization)
          .values({ ...NEW_PERSONALIZATION, entityId, carouselImages: nextImages, createdAt: new Date(), updatedAt: new Date(), updatedBy: user.id })
          .returning({ id: pagePersonalization.id })
        rowId = r.id
      } else {
        const [r] = await tx
          .update(pagePersonalization)
          .set({ carouselImages: nextImages, updatedAt: new Date(), updatedBy: user.id })
          .where(eq(pagePersonalization.entityId, entityId))
          .returning({ id: pagePersonalization.id })
        rowId = r.id
      }

      await writeAuditLog({
        actorId:      user.id,
        actorName:    user.name ?? user.email,
        actorRole:    user.role,
        channel:      'WEB',
        eventType:    'CAROUSEL_IMAGE_UPLOADED',
        resourceType: 'page_personalization',
        resourceId:   rowId,
        entityId,
        // Never log the base64 payload itself — metadata only.
        newValues:    { imageId: newImage.id, stored: 'db-base64', mimeType: file.type, fileSize: file.size },
      }, tx)

      return nextImages
    })

    revalidatePath('/sign-in')
    return { images }
  } catch (e) {
    console.error('[uploadCarouselImage] failed:', e)
    return { error: 'Could not save the image. Please try again.' }
  }
}

// ── deleteCarouselImage ────────────────────────────────────────────────────

export async function deleteCarouselImage(
  entityId: string,
  imageId:  string,
): Promise<CarouselImage[]> {
  const user = await requireRole(['SUPER_ADMIN'])

  const [row] = await db
    .select()
    .from(pagePersonalization)
    .where(eq(pagePersonalization.entityId, entityId))
    .limit(1)

  if (!row) throw new Error('No personalization record found')

  const images = (row.carouselImages as CarouselImage[]) ?? []
  const target = images.find(img => img.id === imageId)
  if (!target) throw new Error('Image not found')

  // Best-effort blob deletion (only for Azure-hosted URLs)
  try {
    if (process.env.AZURE_STORAGE_CONNECTION_STRING && target.url?.startsWith('http')) {
      const storageKey = new URL(target.url).pathname.replace(/^\/[^/]+\//, '')
      const { deleteDocument } = await import('@/lib/blob-storage')
      await deleteDocument(storageKey)
    }
  } catch {}

  const nextImages = images
    .filter(img => img.id !== imageId)
    .map((img, idx) => ({ ...img, order: idx }))

  await db
    .update(pagePersonalization)
    .set({ carouselImages: nextImages, updatedAt: new Date(), updatedBy: user.id })
    .where(eq(pagePersonalization.entityId, entityId))

  try {
    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name ?? user.email,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    'CAROUSEL_IMAGE_DELETED',
      resourceType: 'page_personalization',
      resourceId:   row.id,
      entityId,
      oldValues:    { imageId },
    })
  } catch (auditErr) {
    console.error('[deleteCarouselImage] audit write failed (non-fatal):', auditErr)
  }

  return nextImages
}

// ── reorderCarouselImages ──────────────────────────────────────────────────

export async function reorderCarouselImages(
  entityId:   string,
  orderedIds: string[],
): Promise<CarouselImage[]> {
  const user = await requireRole(['SUPER_ADMIN'])

  const [row] = await db
    .select()
    .from(pagePersonalization)
    .where(eq(pagePersonalization.entityId, entityId))
    .limit(1)

  if (!row) throw new Error('No personalization record found')

  const images   = (row.carouselImages as CarouselImage[]) ?? []
  const imageMap = new Map(images.map(img => [img.id, img]))

  const nextImages = orderedIds
    .filter(id => imageMap.has(id))
    .map((id, idx) => ({ ...imageMap.get(id)!, order: idx }))

  await db
    .update(pagePersonalization)
    .set({ carouselImages: nextImages, updatedAt: new Date(), updatedBy: user.id })
    .where(eq(pagePersonalization.entityId, entityId))

  try {
    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name ?? user.email,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    'CAROUSEL_IMAGES_REORDERED',
      resourceType: 'page_personalization',
      resourceId:   row.id,
      entityId,
      newValues:    { orderedIds },
    })
  } catch (auditErr) {
    console.error('[reorderCarouselImages] audit write failed (non-fatal):', auditErr)
  }

  return nextImages
}
