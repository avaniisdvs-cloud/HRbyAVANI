'use server'

import { db } from '@/lib/db'
import { businessUnits } from '@/drizzle/schema'
import { translateToArabic } from '@/lib/translation'
import { eq, and } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ── Zod schema ───────────────────────────────────────────────────────────────

const businessUnitSchema = z.object({
  legalEntityId: z.string().uuid({ message: 'Legal entity is required' }),
  code:          z.string().min(1, 'Code is required').max(30),
  nameEn:        z.string().min(1, 'English name is required').max(200),
  nameAr:        z.string().max(200).default(''),
  glSegmentCode: z.string().max(50).optional().nullable(),
})

type BusinessUnitInput = z.infer<typeof businessUnitSchema>

function parseForm(fd: FormData): BusinessUnitInput {
  return businessUnitSchema.parse({
    legalEntityId: fd.get('legalEntityId'),
    code:          fd.get('code'),
    nameEn:        fd.get('nameEn'),
    nameAr:        fd.get('nameAr'),
    glSegmentCode: fd.get('glSegmentCode') || null,
  })
}

// ── Duplicate code guard ─────────────────────────────────────────────────────

async function assertCodeUnique(
  legalEntityId: string,
  code: string,
  excludeId?: string,
): Promise<void> {
  const existing = await db
    .select({ id: businessUnits.id })
    .from(businessUnits)
    .where(
      and(
        eq(businessUnits.legalEntityId, legalEntityId),
        eq(businessUnits.code, code),
        eq(businessUnits.tenantId, TENANT_ID),
      ),
    )
    .limit(1)

  const conflict = existing.find(r => r.id !== excludeId)
  if (conflict) {
    throw new Error('Business Unit code already exists for this legal entity.')
  }
}

// ── Server Actions ───────────────────────────────────────────────────────────

export async function createBusinessUnit(fd: FormData): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseForm(fd)

    // Auto-translate Arabic if not provided (EN → AR only)
    if (!input.nameAr) {
      input.nameAr = (await translateToArabic(input.nameEn)) ?? ''
    }

    await assertCodeUnique(input.legalEntityId, input.code)

    const [row] = await db
      .insert(businessUnits)
      .values({
        tenantId:      TENANT_ID,
        legalEntityId: input.legalEntityId,
        code:          input.code,
        nameEn:        input.nameEn,
        nameAr:        input.nameAr,
        glSegmentCode: input.glSegmentCode ?? null,
        isActive:      true,
        createdBy:     actor.id,
        createdByName: actor.name,
      })
      .returning({ id: businessUnits.id })

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'BUSINESS_UNIT_CREATED',
      resourceType:  'business_units',
      resourceId:    row.id,
      entityId:      input.legalEntityId,
      newValues:     input as unknown as Record<string, unknown>,
      description:   `Business Unit ${input.code} created`,
    })

    revalidatePath('/master-data/business-units')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
}

export async function updateBusinessUnit(
  id: string,
  fd: FormData,
  changeReason: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseForm(fd)

    await assertCodeUnique(input.legalEntityId, input.code, id)

    const [before] = await db
      .select()
      .from(businessUnits)
      .where(eq(businessUnits.id, id))
      .limit(1)

    if (!before) throw new Error('Business Unit not found.')

    // Auto-translate Arabic if English changed or Arabic is empty (EN → AR only)
    if (!input.nameAr || input.nameEn !== before.nameEn) {
      input.nameAr = (await translateToArabic(input.nameEn)) ?? input.nameAr ?? ''
    }

    const beforeValues = before as unknown as Record<string, unknown>
    const afterValues  = input as unknown as Record<string, unknown>

    await db.transaction(async (tx) => {
      await tx
        .update(businessUnits)
        .set({
          legalEntityId:   input.legalEntityId,
          code:            input.code,
          nameEn:          input.nameEn,
          nameAr:          input.nameAr,
          glSegmentCode:   input.glSegmentCode ?? null,
          updatedBy:       actor.id,
          updatedByName:   actor.name,
          lastUpdatedDate: new Date(),
        })
        .where(eq(businessUnits.id, id))

      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: actor.legalEntityId,
        channel:       'WEB',
        eventType:     'BUSINESS_UNIT_UPDATED',
        resourceType:  'business_units',
        resourceId:    id,
        entityId:      input.legalEntityId,
        oldValues:     beforeValues,
        newValues:     afterValues,
        changedFields: diffFields(beforeValues, afterValues),
        metadata:      { changeReason, resourceName: before.nameEn, resourceNameAr: before.nameAr },
        description:   `Business Unit ${input.code} updated: ${changeReason}`,
      }, tx)
    })

    revalidatePath('/master-data/business-units')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
}

export async function disableBusinessUnit(
  id: string,
  reason: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [bu] = await db
      .select({ code: businessUnits.code, nameEn: businessUnits.nameEn, legalEntityId: businessUnits.legalEntityId })
      .from(businessUnits)
      .where(eq(businessUnits.id, id))
      .limit(1)

    if (!bu) throw new Error('Business Unit not found.')

    await db
      .update(businessUnits)
      .set({
        isActive:        false,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(businessUnits.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'BUSINESS_UNIT_DISABLED',
      resourceType:  'business_units',
      resourceId:    id,
      entityId:      bu.legalEntityId,
      newValues:     { isActive: false },
      metadata:      { reason },
      description:   `Business Unit ${bu.code} disabled: ${reason}`,
    })

    revalidatePath('/master-data/business-units')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
}

export async function enableBusinessUnit(id: string): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [bu] = await db
      .select({ code: businessUnits.code, legalEntityId: businessUnits.legalEntityId })
      .from(businessUnits)
      .where(eq(businessUnits.id, id))
      .limit(1)

    if (!bu) throw new Error('Business Unit not found.')

    await db
      .update(businessUnits)
      .set({
        isActive:        true,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(businessUnits.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'BUSINESS_UNIT_ENABLED',
      resourceType:  'business_units',
      resourceId:    id,
      entityId:      bu.legalEntityId,
      newValues:     { isActive: true },
      description:   `Business Unit ${bu.code} re-enabled`,
    })

    revalidatePath('/master-data/business-units')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
}
