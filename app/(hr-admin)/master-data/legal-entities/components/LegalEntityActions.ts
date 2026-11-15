'use server'

import { db } from '@/lib/db'
import { legalEntities, persons } from '@/drizzle/schema'
import { translateToArabic } from '@/lib/translation'
import { eq, count } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { auth } from '@/lib/auth'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

// ── Helpers ────────────────────────────────────────────────────────────────

function extractFields(fd: FormData) {
  return {
    entityCode:           (fd.get('entityCode')           as string | null)?.trim().toUpperCase() ?? '',
    nameEn:               (fd.get('nameEn')               as string | null)?.trim() ?? '',
    nameAr:               (fd.get('nameAr')               as string | null)?.trim() ?? '',
    entityType:           (fd.get('entityType')            as string | null)?.trim() ?? '',
    jurisdiction:         (fd.get('jurisdiction')          as string | null)?.trim() ?? '',
    eosbScheme:           (fd.get('eosbScheme')            as string | null)?.trim() ?? '',
    tradeLicenceNumber:   (fd.get('tradeLicenceNumber')    as string | null)?.trim() || null,
    tradeLicenceExpiry:   (fd.get('tradeLicenceExpiry')    as string | null)?.trim() || null,
    registrationNumber:   (fd.get('registrationNumber')    as string | null)?.trim() || null,
    wpsEmployerCode:      (fd.get('wpsEmployerCode')       as string | null)?.trim() || null,
    mohreEstablishmentId: (fd.get('mohreEstablishmentId')  as string | null)?.trim() || null,
    defaultCurrency:      (fd.get('defaultCurrency')       as string | null)?.trim() ?? 'AED',
    defaultLanguage:      (fd.get('defaultLanguage')       as string | null)?.trim() ?? 'en',
  }
}

/** BR-LE-001: DIFC entities must use DEWS. */
function applyBrLe001(fields: { entityType: string; eosbScheme: string }) {
  if (fields.entityType === 'DIFC') {
    fields.eosbScheme = 'DEWS'
  }
}

interface ValidationErrors {
  entityCode?: string
  nameEn?: string
  nameAr?: string
  entityType?: string
  jurisdiction?: string
  eosbScheme?: string
  defaultCurrency?: string
}

function validateCreateFields(fields: ReturnType<typeof extractFields>): ValidationErrors | null {
  const errors: ValidationErrors = {}

  if (!fields.entityCode) {
    errors.entityCode = 'Entity code is required.'
  } else if (fields.entityCode.length > 20) {
    errors.entityCode = 'Entity code must be 20 characters or fewer.'
  }
  if (!fields.nameEn)         errors.nameEn         = 'English name is required.'
  if (!fields.entityType)     errors.entityType     = 'Entity type is required.'
  if (!fields.jurisdiction)   errors.jurisdiction   = 'Jurisdiction is required.'
  if (!fields.eosbScheme)     errors.eosbScheme     = 'EOSB scheme is required.'
  if (!fields.defaultCurrency) errors.defaultCurrency = 'Default currency is required.'

  return Object.keys(errors).length > 0 ? errors : null
}

// ── createLegalEntity ──────────────────────────────────────────────────────

export async function createLegalEntity(
  fd: FormData,
): Promise<{ success: true } | { success: false; error: string; fieldErrors?: ValidationErrors }> {
  try {
    const session = await auth()
    if (!session?.user) return { success: false, error: 'Unauthenticated.' }

    const fields = extractFields(fd)
    applyBrLe001(fields)

    // Auto-translate Arabic if not provided (EN → AR only)
    if (!fields.nameAr) {
      fields.nameAr = (await translateToArabic(fields.nameEn)) ?? ''
    }

    const fieldErrors = validateCreateFields(fields)
    if (fieldErrors) {
      return { success: false, error: 'Validation failed.', fieldErrors }
    }

    const actor = session.user

    await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(legalEntities)
        .values({
          tenantId:             TENANT_ID,
          entityCode:           fields.entityCode,
          nameEn:               fields.nameEn,
          nameAr:               fields.nameAr,
          entityType:           fields.entityType,
          jurisdiction:         fields.jurisdiction,
          eosbScheme:           fields.eosbScheme,
          tradeLicenceNumber:   fields.tradeLicenceNumber,
          tradeLicenceExpiry:   fields.tradeLicenceExpiry,
          registrationNumber:   fields.registrationNumber,
          wpsEmployerCode:      fields.wpsEmployerCode,
          mohreEstablishmentId: fields.mohreEstablishmentId,
          defaultCurrency:      fields.defaultCurrency,
          defaultLanguage:      fields.defaultLanguage,
          isActive:             true,
          createdBy:            actor.id,
          createdByName:        actor.name ?? actor.email,
        })
        .returning({ id: legalEntities.id })

      await writeAuditLog(
        {
          actorId:      actor.id,
          actorName:    actor.name ?? actor.email,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'LEGAL_ENTITY_CREATED',
          resourceType: 'legal_entities',
          resourceId:   inserted.id,
          newValues:    fields as unknown as Record<string, unknown>,
          description:  `Created legal entity ${fields.entityCode} — ${fields.nameEn}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/legal-entities')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('unique') || message.includes('duplicate')) {
      return { success: false, error: 'An entity with this code already exists.' }
    }
    return { success: false, error: `Failed to create legal entity: ${message}` }
  }
}

// ── updateLegalEntity ──────────────────────────────────────────────────────

export async function updateLegalEntity(
  id: string,
  fd: FormData,
  changeReason: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth()
    if (!session?.user) return { success: false, error: 'Unauthenticated.' }

    if (!changeReason || changeReason.trim().length < 10) {
      return { success: false, error: 'Change reason must be at least 10 characters.' }
    }

    // Extract all mutable fields (entityCode is immutable per BR-LE-003)
    const rawFields = extractFields(fd)
    const fields = {
      nameEn:               rawFields.nameEn,
      nameAr:               rawFields.nameAr,
      entityType:           rawFields.entityType,
      jurisdiction:         rawFields.jurisdiction,
      eosbScheme:           rawFields.eosbScheme,
      tradeLicenceNumber:   rawFields.tradeLicenceNumber,
      tradeLicenceExpiry:   rawFields.tradeLicenceExpiry,
      registrationNumber:   rawFields.registrationNumber,
      wpsEmployerCode:      rawFields.wpsEmployerCode,
      mohreEstablishmentId: rawFields.mohreEstablishmentId,
      defaultCurrency:      rawFields.defaultCurrency,
      defaultLanguage:      rawFields.defaultLanguage,
    }

    // BR-LE-001
    if (fields.entityType === 'DIFC') {
      fields.eosbScheme = 'DEWS'
    }

    if (!fields.nameEn)       return { success: false, error: 'English name is required.' }
    if (!fields.entityType)   return { success: false, error: 'Entity type is required.' }
    if (!fields.jurisdiction) return { success: false, error: 'Jurisdiction is required.' }
    if (!fields.eosbScheme)   return { success: false, error: 'EOSB scheme is required.' }

    const actor = session.user
    const now   = new Date()

    // Fetch snapshot for audit diff
    const [existing] = await db
      .select()
      .from(legalEntities)
      .where(eq(legalEntities.id, id))
      .limit(1)

    if (!existing) return { success: false, error: 'Record not found.' }

    // Auto-translate Arabic if English changed or Arabic is empty (EN → AR only)
    if (!fields.nameAr || fields.nameEn !== existing.nameEn) {
      fields.nameAr = (await translateToArabic(fields.nameEn)) ?? fields.nameAr ?? ''
    }

    const snapshot: Record<string, unknown> = {
      nameEn:               existing.nameEn,
      nameAr:               existing.nameAr,
      entityType:           existing.entityType,
      jurisdiction:         existing.jurisdiction,
      eosbScheme:           existing.eosbScheme,
      tradeLicenceNumber:   existing.tradeLicenceNumber,
      tradeLicenceExpiry:   existing.tradeLicenceExpiry,
      registrationNumber:   existing.registrationNumber,
      wpsEmployerCode:      existing.wpsEmployerCode,
      mohreEstablishmentId: existing.mohreEstablishmentId,
      defaultCurrency:      existing.defaultCurrency,
      defaultLanguage:      existing.defaultLanguage,
    }

    await db.transaction(async (tx) => {
      await tx
        .update(legalEntities)
        .set({
          ...fields,
          updatedBy:       actor.id,
          updatedByName:   actor.name ?? actor.email,
          lastUpdatedDate: now,
          updatedDate:     now,
        })
        .where(eq(legalEntities.id, id))

      await writeAuditLog(
        {
          actorId:       actor.id,
          actorName:     actor.name ?? actor.email,
          actorRole:     actor.role,
          channel:       'WEB',
          eventType:     'LEGAL_ENTITY_UPDATED',
          resourceType:  'legal_entities',
          resourceId:    id,
          oldValues:     snapshot,
          newValues:     fields as unknown as Record<string, unknown>,
          changedFields: diffFields(snapshot, fields as unknown as Record<string, unknown>),
          metadata:      { changeReason: changeReason.trim(), resourceName: existing.nameEn, resourceNameAr: existing.nameAr },
          description:   `Updated legal entity ${existing.entityCode}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/legal-entities')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: `Failed to update legal entity: ${message}` }
  }
}

// ── disableLegalEntity ─────────────────────────────────────────────────────

export async function disableLegalEntity(
  id: string,
  reason: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth()
    if (!session?.user) return { success: false, error: 'Unauthenticated.' }

    if (!reason || reason.trim().length < 10) {
      return { success: false, error: 'Disable reason must be at least 10 characters.' }
    }

    const actor = session.user
    const now   = new Date()

    const [existing] = await db
      .select({ id: legalEntities.id, entityCode: legalEntities.entityCode, nameEn: legalEntities.nameEn })
      .from(legalEntities)
      .where(eq(legalEntities.id, id))
      .limit(1)

    if (!existing) return { success: false, error: 'Record not found.' }

    // BR-LE-004: block if any active employees are assigned to this entity
    const [{ activeCount }] = await db
      .select({ activeCount: count() })
      .from(persons)
      .where(
        eq(persons.legalEntityId, id),
      )
    if (activeCount > 0) {
      return {
        success: false,
        error: `Cannot disable: ${activeCount} active employee${activeCount === 1 ? '' : 's'} are assigned to this entity. Reassign or terminate them first. (BR-LE-004)`,
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(legalEntities)
        .set({
          isActive:        false,
          updatedBy:       actor.id,
          updatedByName:   actor.name ?? actor.email,
          lastUpdatedDate: now,
          updatedDate:     now,
        })
        .where(eq(legalEntities.id, id))

      await writeAuditLog(
        {
          actorId:      actor.id,
          actorName:    actor.name ?? actor.email,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'LEGAL_ENTITY_DISABLED',
          resourceType: 'legal_entities',
          resourceId:   id,
          metadata:     { changeReason: reason.trim() },
          description:  `Disabled legal entity ${existing.entityCode} — ${existing.nameEn}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/legal-entities')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: `Failed to disable legal entity: ${message}` }
  }
}

// ── enableLegalEntity ──────────────────────────────────────────────────────

export async function enableLegalEntity(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth()
    if (!session?.user) return { success: false, error: 'Unauthenticated.' }

    const actor = session.user
    const now   = new Date()

    const [existing] = await db
      .select({ id: legalEntities.id, entityCode: legalEntities.entityCode, nameEn: legalEntities.nameEn })
      .from(legalEntities)
      .where(eq(legalEntities.id, id))
      .limit(1)

    if (!existing) return { success: false, error: 'Record not found.' }

    await db.transaction(async (tx) => {
      await tx
        .update(legalEntities)
        .set({
          isActive:        true,
          updatedBy:       actor.id,
          updatedByName:   actor.name ?? actor.email,
          lastUpdatedDate: now,
          updatedDate:     now,
        })
        .where(eq(legalEntities.id, id))

      await writeAuditLog(
        {
          actorId:      actor.id,
          actorName:    actor.name ?? actor.email,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'LEGAL_ENTITY_ENABLED',
          resourceType: 'legal_entities',
          resourceId:   id,
          description:  `Re-enabled legal entity ${existing.entityCode} — ${existing.nameEn}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/legal-entities')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: `Failed to enable legal entity: ${message}` }
  }
}
