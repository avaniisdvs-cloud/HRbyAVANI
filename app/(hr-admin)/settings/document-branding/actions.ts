'use server'

import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { uploadBrandingAsset } from '@/lib/blob-storage'
import { legalEntities } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'

// Allowed branding image fields mapped to their DB column
const BRANDING_FIELDS = {
  primaryLogoUrl:        'primary_logo_url',
  secondaryLogoUrl:      'secondary_logo_url',
  headerImageUrl:        'header_image_url',
  footerImageUrl:        'footer_image_url',
  signatorySignatureUrl: 'signatory_signature_url',
} as const
type BrandingField = keyof typeof BRANDING_FIELDS

export async function uploadBrandingImage(formData: FormData): Promise<{ url: string }> {
  const user     = await requireRole(['HR_ADMIN', 'SUPER_ADMIN'])
  const entityId = formData.get('entityId') as string | null
  const field    = formData.get('field')    as string | null
  const file     = formData.get('file')     as File   | null

  if (!entityId || !field || !file || !(field in BRANDING_FIELDS)) {
    throw new Error('Missing entityId, field, or file')
  }

  const uploaded = await uploadBrandingAsset({
    entityId,
    file,
    fileName: file.name,
    mimeType: file.type || undefined,
  })

  // Persist the URL immediately so the page reflects it on refresh
  await db.transaction(async tx => {
    await tx
      .update(legalEntities)
      .set({
        [field]:         uploaded.sasUrl,
        updatedBy:       user.id,
        updatedByName:   user.name ?? user.email ?? 'system',
        lastUpdatedDate: new Date(),
      })
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.id, entityId)))

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name ?? user.email ?? 'system',
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    'DOCUMENT_BRANDING_IMAGE_UPLOADED',
      resourceType: 'legal_entities',
      resourceId:   entityId,
      newValues:    { field, fileName: file.name },
      description:  `Branding image uploaded: ${field}`,
    }, tx)
  })

  return { url: uploaded.sasUrl }
}
const SaveBrandingInput = z.object({
  entityId:          z.string().uuid(),
  signatoryName:     z.string().max(200).optional(),
  signatoryTitle:    z.string().max(200).optional(),
  letterEmailFooter: z.string().max(2000).optional(),
  letterLogoChoice:  z.enum(['primary', 'secondary']).default('primary'),
})

export async function saveDocumentBranding(
  input: z.infer<typeof SaveBrandingInput>,
): Promise<void> {
  const user = await requireRole(['HR_ADMIN', 'SUPER_ADMIN'])
  const data = SaveBrandingInput.parse(input)

  await db.transaction(async tx => {
    await tx
      .update(legalEntities)
      .set({
        signatoryName:     data.signatoryName     ?? null,
        signatoryTitle:    data.signatoryTitle    ?? null,
        letterEmailFooter: data.letterEmailFooter ?? null,
        letterLogoChoice:  data.letterLogoChoice,
        updatedBy:         user.id,
        updatedByName:     user.name ?? user.email ?? 'system',
        lastUpdatedDate:   new Date(),
      })
      .where(
        and(
          eq(legalEntities.tenantId, TENANT_ID),
          eq(legalEntities.id, data.entityId),
        ),
      )

    await writeAuditLog(
      {
        actorId:      user.id,
        actorName:    user.name ?? user.email ?? 'system',
        actorRole:    user.role,
        channel:      'WEB',
        eventType:    'DOCUMENT_BRANDING_UPDATED',
        resourceType: 'legal_entities',
        resourceId:   data.entityId,
        newValues:    { signatoryName: data.signatoryName, signatoryTitle: data.signatoryTitle },
        description:  'Document branding config updated',
      },
      tx,
    )
  })
}
