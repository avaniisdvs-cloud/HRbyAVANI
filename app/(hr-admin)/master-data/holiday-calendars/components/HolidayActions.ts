'use server'

import { db } from '@/lib/db'
import { publicHolidays } from '@/drizzle/schema'
import { translateToArabic } from '@/lib/translation'
import { eq, and } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { hrDateString, hrDateStringOrEmpty } from '@/lib/validation/date-validators'
import { getErrorMessage } from '@/lib/app-error'

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionResult = { error?: string }

// ── Zod schema ────────────────────────────────────────────────────────────────

const holidaySchema = z.object({
  legalEntityId:  z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  holidayYear:    z.coerce.number().int().min(2020).max(2040),
  holidayCode:    z.string().min(1, 'Holiday code is required').max(30),
  holidayNameEn:  z.string().min(1, 'English name is required').max(200),
  holidayNameAr:  z.string().max(200).default(''),
  holidayDate:    hrDateString(),
  endDate:        hrDateStringOrEmpty(),
  durationDays:   z.coerce.number().int().min(1).max(10).default(1),
  isFloating:     z.coerce.boolean().default(false),
  announcedDate:  hrDateStringOrEmpty(),
  isConfirmed:    z.coerce.boolean().default(false),
  appliesTo:      z.enum(['ALL', 'MUSLIMS_ONLY', 'PUBLIC_SECTOR_ONLY']).default('ALL'),
  emirate:        z.string().max(50).optional().or(z.literal('').transform(() => undefined)),
})

type HolidayInput = z.infer<typeof holidaySchema>

function parseHolidayForm(fd: FormData): HolidayInput {
  return holidaySchema.parse({
    legalEntityId:  fd.get('legalEntityId') || undefined,
    holidayYear:    fd.get('holidayYear'),
    holidayCode:    fd.get('holidayCode'),
    holidayNameEn:  fd.get('holidayNameEn'),
    holidayNameAr:  fd.get('holidayNameAr'),
    holidayDate:    fd.get('holidayDate'),
    endDate:        fd.get('endDate') || undefined,
    durationDays:   fd.get('durationDays') ?? 1,
    isFloating:     fd.get('isFloating') === 'true' || fd.get('isFloating') === '1',
    announcedDate:  fd.get('announcedDate') || undefined,
    isConfirmed:    fd.get('isConfirmed') === 'true' || fd.get('isConfirmed') === '1',
    appliesTo:      fd.get('appliesTo') || 'ALL',
    emirate:        fd.get('emirate') || undefined,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertNoDuplicateDate(
  holidayDate: string,
  holidayYear: number,
  legalEntityId: string | undefined,
  excludeId?: string,
): Promise<void> {
  // BR-HOL-001: no duplicate dates in the same year (for the same entity scope)
  const rows = await db
    .select({ id: publicHolidays.id })
    .from(publicHolidays)
    .where(
      and(
        eq(publicHolidays.tenantId, TENANT_ID),
        eq(publicHolidays.holidayDate, holidayDate),
        eq(publicHolidays.holidayYear, holidayYear),
      ),
    )
    .limit(5)

  const conflict = rows.find(r => r.id !== excludeId)
  if (conflict) {
    throw new Error(`BR-HOL-001: A holiday on ${holidayDate} already exists for year ${holidayYear}.`)
  }
}

// ── Server Actions ────────────────────────────────────────────────────────────

export async function createHoliday(fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseHolidayForm(fd)

    // Auto-translate Arabic if not provided (EN → AR only)
    if (!input.holidayNameAr) {
      input.holidayNameAr = (await translateToArabic(input.holidayNameEn)) ?? ''
    }

    await assertNoDuplicateDate(input.holidayDate, input.holidayYear, input.legalEntityId)

    const [row] = await db
      .insert(publicHolidays)
      .values({
        tenantId:       TENANT_ID,
        legalEntityId:  input.legalEntityId ?? null,
        holidayYear:    input.holidayYear,
        holidayCode:    input.holidayCode,
        holidayNameEn:  input.holidayNameEn,
        holidayNameAr:  input.holidayNameAr,
        holidayDate:    input.holidayDate,
        endDate:        input.endDate ?? null,
        durationDays:   input.durationDays,
        isFloating:     input.isFloating,
        announcedDate:  input.announcedDate ?? null,
        isConfirmed:    input.isConfirmed,
        appliesTo:      input.appliesTo,
        emirate:        input.emirate ?? null,
        createdBy:      actor.id,
        createdByName:  actor.name,
      })
      .returning({ id: publicHolidays.id })

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'HOLIDAY_CREATED',
      resourceType:  'public_holidays',
      resourceId:    row.id,
      newValues:     input as unknown as Record<string, unknown>,
      description:   `Holiday ${input.holidayCode} (${input.holidayDate}) created`,
    })

    revalidatePath('/master-data/holiday-calendars')
    return {}
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { error: err.errors.map(e => e.message).join('; ') }
    }
    return { error: getErrorMessage(err, 'createHoliday') }
  }
}

export async function updateHoliday(
  id: string,
  fd: FormData,
  changeReason: string,
): Promise<ActionResult> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseHolidayForm(fd)

    await assertNoDuplicateDate(input.holidayDate, input.holidayYear, input.legalEntityId, id)

    const [before] = await db
      .select()
      .from(publicHolidays)
      .where(eq(publicHolidays.id, id))
      .limit(1)

    if (!before) return { error: 'Holiday not found.' }

    // Auto-translate Arabic if English changed or Arabic is empty (EN → AR only)
    if (!input.holidayNameAr || input.holidayNameEn !== before.holidayNameEn) {
      input.holidayNameAr = (await translateToArabic(input.holidayNameEn)) ?? input.holidayNameAr ?? ''
    }

    await db
      .update(publicHolidays)
      .set({
        legalEntityId:  input.legalEntityId ?? null,
        holidayYear:    input.holidayYear,
        holidayCode:    input.holidayCode,
        holidayNameEn:  input.holidayNameEn,
        holidayNameAr:  input.holidayNameAr,
        holidayDate:    input.holidayDate,
        endDate:        input.endDate ?? null,
        durationDays:   input.durationDays,
        isFloating:     input.isFloating,
        announcedDate:  input.announcedDate ?? null,
        isConfirmed:    input.isConfirmed,
        appliesTo:      input.appliesTo,
        emirate:        input.emirate ?? null,
        updatedBy:      actor.id,
        updatedByName:  actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(publicHolidays.id, id))

    const afterValues  = input as unknown as Record<string, unknown>
    const beforeValues = before as unknown as Record<string, unknown>

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'HOLIDAY_UPDATED',
      resourceType:  'public_holidays',
      resourceId:    id,
      oldValues:     beforeValues,
      newValues:     afterValues,
      changedFields: diffFields(beforeValues, afterValues),
      metadata:      { changeReason, resourceName: before.holidayNameEn, resourceNameAr: before.holidayNameAr },
      description:   `Holiday ${input.holidayCode} updated: ${changeReason}`,
    })

    revalidatePath('/master-data/holiday-calendars')
    return {}
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { error: err.errors.map(e => e.message).join('; ') }
    }
    return { error: getErrorMessage(err, 'updateHoliday') }
  }
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    // Fetch before-snapshot for audit trail (BR-AUDIT-001)
    const [holiday] = await db
      .select()
      .from(publicHolidays)
      .where(eq(publicHolidays.id, id))
      .limit(1)

    if (!holiday) return { error: 'Holiday not found.' }

    // The public_holidays table has no is_active column.
    // We audit the deletion first (immutable record), then hard-delete.
    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'HOLIDAY_DELETED',
      resourceType:  'public_holidays',
      resourceId:    id,
      entityId:      holiday.legalEntityId ?? undefined,
      oldValues:     holiday as unknown as Record<string, unknown>,
      newValues:     { deleted: true },
      description:   `Holiday ${holiday.holidayCode} (${holiday.holidayDate}) removed`,
    })

    // Hard delete — deletion is durably recorded in the audit log above.
    await db.delete(publicHolidays).where(eq(publicHolidays.id, id))

    revalidatePath('/master-data/holiday-calendars')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'deleteHoliday') }
  }
}
