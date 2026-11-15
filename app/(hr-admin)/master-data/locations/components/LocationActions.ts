'use server'

import { db } from '@/lib/db'
import { locations, persons, positions } from '@/drizzle/schema'
import { translateToArabic } from '@/lib/translation'
import { eq, and, or, count } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { auth } from '@/lib/auth'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { writeLocationHistory } from '@/lib/mdm-history'
import { revalidatePath } from 'next/cache'
import { getErrorMessage } from '@/lib/app-error'

// ── Types ──────────────────────────────────────────────────────────────────

export interface LocationFieldErrors {
  legalEntityId?: string
  code?:          string
  nameEn?:        string
  nameAr?:        string
  country?:       string
  timezone?:      string
  phone?:         string
}

// ── Helpers ────────────────────────────────────────────────────────────────

const PHONE_REGEX = /^\+971[0-9]{8,9}$/

function extractFields(fd: FormData) {
  return {
    legalEntityId: (fd.get('legalEntityId') as string | null)?.trim() ?? '',
    code:          (fd.get('code')          as string | null)?.trim().toUpperCase() ?? '',
    nameEn:        (fd.get('nameEn')        as string | null)?.trim() ?? '',
    nameAr:        (fd.get('nameAr')        as string | null)?.trim() || null,
    addressLine1:  (fd.get('addressLine1')  as string | null)?.trim() || null,
    addressLine2:  (fd.get('addressLine2')  as string | null)?.trim() || null,
    city:          (fd.get('city')          as string | null)?.trim() || null,
    emirate:       (fd.get('emirate')       as string | null)?.trim() || null,
    country:       (fd.get('country')       as string | null)?.trim() ?? 'ARE',
    poBox:         (fd.get('poBox')         as string | null)?.trim() || null,
    phone:         (fd.get('phone')         as string | null)?.trim() || null,
    timezone:      (fd.get('timezone')      as string | null)?.trim() ?? 'Asia/Dubai',
  }
}

function validateFields(fields: ReturnType<typeof extractFields>): LocationFieldErrors | null {
  const errors: LocationFieldErrors = {}

  if (!fields.legalEntityId) errors.legalEntityId = 'Legal entity is required.'
  if (!fields.code)           errors.code          = 'Location code is required.'
  if (!fields.nameEn)         errors.nameEn        = 'Location name (EN) is required.'
  if (!fields.country)        errors.country       = 'Country is required.'
  if (!fields.timezone)       errors.timezone      = 'Timezone is required.'

  // BR-LOC-003: phone format validation
  if (fields.phone && !PHONE_REGEX.test(fields.phone)) {
    errors.phone = 'Phone must be in +971XXXXXXXX format (BR-LOC-003).'
  }

  return Object.keys(errors).length > 0 ? errors : null
}

// ── createLocation ─────────────────────────────────────────────────────────

export async function createLocation(
  fd: FormData,
): Promise<{ success: true } | { success: false; error: string; fieldErrors?: LocationFieldErrors }> {
  try {
    const session = await auth()
    if (!session?.user) return { success: false, error: 'Unauthenticated.' }

    const fields = extractFields(fd)

    // Auto-translate Arabic if not provided (EN → AR only)
    if (!fields.nameAr) {
      fields.nameAr = (await translateToArabic(fields.nameEn)) ?? null
    }

    const fieldErrors = validateFields(fields)
    if (fieldErrors) return { success: false, error: 'Validation failed.', fieldErrors }

    const actor = session.user

    await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(locations)
        .values({
          tenantId:      TENANT_ID,
          legalEntityId: fields.legalEntityId,
          code:          fields.code,
          nameEn:        fields.nameEn,
          nameAr:        fields.nameAr,
          addressLine1:  fields.addressLine1,
          addressLine2:  fields.addressLine2,
          city:          fields.city,
          emirate:       fields.emirate,
          country:       fields.country,
          poBox:         fields.poBox,
          phone:         fields.phone,
          timezone:      fields.timezone,
          isActive:      true,
          actionMode:    'UPDATE',
          createdBy:     actor.id,
          createdByName: actor.name ?? actor.email,
        })
        .returning({ id: locations.id })

      await writeAuditLog(
        {
          actorId:      actor.id,
          actorName:    actor.name ?? actor.email,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'LOCATION_CREATED',
          resourceType: 'locations',
          resourceId:   inserted.id,
          newValues:    fields as unknown as Record<string, unknown>,
          description:  `Created location ${fields.code} — ${fields.nameEn}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/locations')
    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err, 'createLocation') }
  }
}

// ── updateLocation ─────────────────────────────────────────────────────────

export async function updateLocation(
  id: string,
  fd: FormData,
  changeReason: string,
): Promise<{ success: true } | { success: false; error: string; fieldErrors?: LocationFieldErrors }> {
  try {
    const session = await auth()
    if (!session?.user) return { success: false, error: 'Unauthenticated.' }

    if (!changeReason || changeReason.trim().length < 10) {
      return { success: false, error: 'Change reason must be at least 10 characters.' }
    }

    const fields = extractFields(fd)

    const actor = session.user
    const now   = new Date()

    const [existing] = await db
      .select()
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1)

    if (!existing) return { success: false, error: 'Record not found.' }

    // Auto-translate Arabic if English changed or Arabic is empty (EN → AR only)
    if (!fields.nameAr || fields.nameEn !== existing.nameEn) {
      fields.nameAr = (await translateToArabic(fields.nameEn)) ?? fields.nameAr ?? null
    }

    const fieldErrors = validateFields(fields)
    if (fieldErrors) return { success: false, error: 'Validation failed.', fieldErrors }

    const snapshot: Record<string, unknown> = {
      legalEntityId: existing.legalEntityId,
      code:          existing.code,
      nameEn:        existing.nameEn,
      nameAr:        existing.nameAr,
      addressLine1:  existing.addressLine1,
      addressLine2:  existing.addressLine2,
      city:          existing.city,
      emirate:       existing.emirate,
      country:       existing.country,
      poBox:         existing.poBox,
      phone:         existing.phone,
      timezone:      existing.timezone,
    }

    await db.transaction(async (tx) => {
      await tx
        .update(locations)
        .set({
          nameEn:          fields.nameEn,
          nameAr:          fields.nameAr,
          addressLine1:    fields.addressLine1,
          addressLine2:    fields.addressLine2,
          city:            fields.city,
          emirate:         fields.emirate,
          country:         fields.country,
          poBox:           fields.poBox,
          phone:           fields.phone,
          timezone:        fields.timezone,
          updatedBy:       actor.id,
          updatedByName:   actor.name ?? actor.email,
          lastUpdatedDate: now,
          updatedDate:     now,
        })
        .where(eq(locations.id, id))

      await writeLocationHistory(tx, id, {
        code:         existing.code,
        nameEn:       fields.nameEn,
        nameAr:       fields.nameAr,
        addressLine1: fields.addressLine1,
        city:         fields.city,
        emirate:      fields.emirate,
        country:      fields.country,
        timezone:     fields.timezone,
      }, actor.personId ?? undefined, changeReason.trim())

      await writeAuditLog(
        {
          actorId:       actor.id,
          actorName:     actor.name ?? actor.email,
          actorRole:     actor.role,
          channel:       'WEB',
          eventType:     'LOCATION_UPDATED',
          resourceType:  'locations',
          resourceId:    id,
          oldValues:     snapshot,
          newValues:     fields as unknown as Record<string, unknown>,
          changedFields: diffFields(snapshot, fields as unknown as Record<string, unknown>),
          metadata:      { changeReason: changeReason.trim(), resourceName: existing.nameEn, resourceNameAr: existing.nameAr },
          description:   `Updated location ${existing.code} — ${existing.nameEn}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/locations')
    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err, 'updateLocation') }
  }
}

// ── disableLocation ────────────────────────────────────────────────────────

export async function disableLocation(
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
      .select({ id: locations.id, code: locations.code, nameEn: locations.nameEn })
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1)

    if (!existing) return { success: false, error: 'Record not found.' }

    // BR-LOC-001: block if any active employees or positions are assigned here
    const [[{ activePeople }], [{ activePositions }]] = await Promise.all([
      db.select({ activePeople: count() })
        .from(persons)
        .where(eq(persons.currentLocationId, id)),
      db.select({ activePositions: count() })
        .from(positions)
        .where(and(eq(positions.locationId, id), eq(positions.isActive, true))),
    ])
    const total = activePeople + activePositions
    if (total > 0) {
      const parts: string[] = []
      if (activePeople  > 0) parts.push(`${activePeople} employee${activePeople   === 1 ? '' : 's'}`)
      if (activePositions > 0) parts.push(`${activePositions} position${activePositions === 1 ? '' : 's'}`)
      return {
        success: false,
        error: `Cannot disable: ${parts.join(' and ')} are assigned to this location. Reassign them first. (BR-LOC-001)`,
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(locations)
        .set({
          isActive:        false,
          updatedBy:       actor.id,
          updatedByName:   actor.name ?? actor.email,
          lastUpdatedDate: now,
          updatedDate:     now,
        })
        .where(eq(locations.id, id))

      await writeAuditLog(
        {
          actorId:      actor.id,
          actorName:    actor.name ?? actor.email,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'LOCATION_DISABLED',
          resourceType: 'locations',
          resourceId:   id,
          metadata:     { changeReason: reason.trim() },
          description:  `Disabled location ${existing.code} — ${existing.nameEn}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/locations')
    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err, 'disableLocation') }
  }
}

// ── correctLocation ────────────────────────────────────────────────────────

export async function correctLocation(
  id:             string,
  fd:             FormData,
  correctionNote: string,
): Promise<{ success: true } | { success: false; error: string; fieldErrors?: LocationFieldErrors }> {
  try {
    const session = await auth()
    if (!session?.user) return { success: false, error: 'Unauthenticated.' }

    const { role } = session.user
    if (!['HR_DIRECTOR', 'SUPER_ADMIN'].includes(role)) {
      return { success: false, error: 'Only HR Directors and Super Admins may use Correction Mode.' }
    }

    if (!correctionNote || correctionNote.trim().length < 5) {
      return { success: false, error: 'Correction note must be at least 5 characters.' }
    }

    const fields = extractFields(fd)
    const fieldErrors = validateFields(fields)
    if (fieldErrors) return { success: false, error: 'Validation failed.', fieldErrors }

    const actor = session.user
    const now   = new Date()

    const [existing] = await db
      .select()
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1)

    if (!existing) return { success: false, error: 'Record not found.' }

    const snapshot: Record<string, unknown> = {
      nameEn:       existing.nameEn,
      nameAr:       existing.nameAr,
      addressLine1: existing.addressLine1,
      addressLine2: existing.addressLine2,
      city:         existing.city,
      emirate:      existing.emirate,
      country:      existing.country,
      poBox:        existing.poBox,
      phone:        existing.phone,
      timezone:     existing.timezone,
    }

    await db.transaction(async (tx) => {
      await tx
        .update(locations)
        .set({
          nameEn:          fields.nameEn,
          nameAr:          fields.nameAr,
          addressLine1:    fields.addressLine1,
          addressLine2:    fields.addressLine2,
          city:            fields.city,
          emirate:         fields.emirate,
          country:         fields.country,
          poBox:           fields.poBox,
          phone:           fields.phone,
          timezone:        fields.timezone,
          actionMode:      'CORRECTION',
          correctsRowId:   null,
          updatedBy:       actor.id,
          updatedByName:   actor.name ?? actor.email,
          lastUpdatedDate: now,
          updatedDate:     now,
        })
        .where(eq(locations.id, id))

      await writeAuditLog(
        {
          actorId:      actor.id,
          actorName:    actor.name ?? actor.email,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'LOCATION_CORRECTED',
          resourceType: 'locations',
          resourceId:   id,
          oldValues:    snapshot,
          newValues:    fields as unknown as Record<string, unknown>,
          changedFields: diffFields(snapshot, fields as unknown as Record<string, unknown>),
          metadata:     { correctionNote: correctionNote.trim(), resourceName: existing.nameEn, resourceNameAr: existing.nameAr },
          description:  `Location ${existing.code} corrected: ${correctionNote.trim()}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/locations')
    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err, 'correctLocation') }
  }
}

// ── enableLocation ─────────────────────────────────────────────────────────

export async function enableLocation(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth()
    if (!session?.user) return { success: false, error: 'Unauthenticated.' }

    const actor = session.user
    const now   = new Date()

    const [existing] = await db
      .select({ id: locations.id, code: locations.code, nameEn: locations.nameEn })
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1)

    if (!existing) return { success: false, error: 'Record not found.' }

    await db.transaction(async (tx) => {
      await tx
        .update(locations)
        .set({
          isActive:        true,
          updatedBy:       actor.id,
          updatedByName:   actor.name ?? actor.email,
          lastUpdatedDate: now,
          updatedDate:     now,
        })
        .where(eq(locations.id, id))

      await writeAuditLog(
        {
          actorId:      actor.id,
          actorName:    actor.name ?? actor.email,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'LOCATION_ENABLED',
          resourceType: 'locations',
          resourceId:   id,
          description:  `Re-enabled location ${existing.code} — ${existing.nameEn}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/locations')
    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err, 'enableLocation') }
  }
}
