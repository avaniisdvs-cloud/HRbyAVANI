'use server'

import { db } from '@/lib/db'
import { workSchedules } from '@/drizzle/schema'
import { translateToArabic } from '@/lib/translation'
import { eq } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/app-error'

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionResult = { error?: string; warning?: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcHours(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const total = (eh * 60 + em) - (sh * 60 + sm)
  if (total <= 0) return 0
  // Subtract 1h break if shift > 5h (300 min)
  return total > 300 ? (total - 60) / 60 : total / 60
}

function computeTotalHours(fd: FormData): number {
  const days: Array<[string, string]> = [
    ['mondayStart', 'mondayEnd'],
    ['tuesdayStart', 'tuesdayEnd'],
    ['wednesdayStart', 'wednesdayEnd'],
    ['thursdayStart', 'thursdayEnd'],
    ['fridayStart', 'fridayEnd'],
    ['saturdayStart', 'saturdayEnd'],
    ['sundayStart', 'sundayEnd'],
  ]
  return days.reduce((sum, [s, e]) => {
    return sum + calcHours(
      fd.get(s) as string | null,
      fd.get(e) as string | null,
    )
  }, 0)
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/

const optionalTime = z.string().regex(timeRe).optional().or(z.literal('').transform(() => undefined))

const workScheduleSchema = z.object({
  legalEntityId:       z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  scheduleCode:        z.string().min(1, 'Schedule code is required').max(30),
  scheduleNameEn:      z.string().min(1, 'English name is required').max(200),
  scheduleNameAr:      z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
  scheduleType:        z.enum(['STANDARD', 'RAMADAN', 'SHIFT', 'FLEXIBLE', 'PART_TIME']),
  mondayStart:         optionalTime,
  mondayEnd:           optionalTime,
  tuesdayStart:        optionalTime,
  tuesdayEnd:          optionalTime,
  wednesdayStart:      optionalTime,
  wednesdayEnd:        optionalTime,
  thursdayStart:       optionalTime,
  thursdayEnd:         optionalTime,
  fridayStart:         optionalTime,
  fridayEnd:           optionalTime,
  saturdayStart:       optionalTime,
  saturdayEnd:         optionalTime,
  sundayStart:         optionalTime,
  sundayEnd:           optionalTime,
  breakMinutes:        z.coerce.number().int().min(0).max(120).default(60),
  isRamadanSchedule:   z.coerce.boolean().default(false),
  ramadanHoursPerDay:  z.coerce.number().min(0).max(8).optional().nullable(),
  isDefault:           z.coerce.boolean().default(false),
})

type WorkScheduleInput = z.infer<typeof workScheduleSchema>

function parseWorkScheduleForm(fd: FormData): WorkScheduleInput {
  return workScheduleSchema.parse({
    legalEntityId:       fd.get('legalEntityId') || undefined,
    scheduleCode:        fd.get('scheduleCode'),
    scheduleNameEn:      fd.get('scheduleNameEn'),
    scheduleNameAr:      fd.get('scheduleNameAr') || undefined,
    scheduleType:        fd.get('scheduleType') || 'STANDARD',
    mondayStart:         fd.get('mondayStart') || '',
    mondayEnd:           fd.get('mondayEnd') || '',
    tuesdayStart:        fd.get('tuesdayStart') || '',
    tuesdayEnd:          fd.get('tuesdayEnd') || '',
    wednesdayStart:      fd.get('wednesdayStart') || '',
    wednesdayEnd:        fd.get('wednesdayEnd') || '',
    thursdayStart:       fd.get('thursdayStart') || '',
    thursdayEnd:         fd.get('thursdayEnd') || '',
    fridayStart:         fd.get('fridayStart') || '',
    fridayEnd:           fd.get('fridayEnd') || '',
    saturdayStart:       fd.get('saturdayStart') || '',
    saturdayEnd:         fd.get('saturdayEnd') || '',
    sundayStart:         fd.get('sundayStart') || '',
    sundayEnd:           fd.get('sundayEnd') || '',
    breakMinutes:        fd.get('breakMinutes') ?? 60,
    isRamadanSchedule:   fd.get('isRamadanSchedule') === 'true' || fd.get('isRamadanSchedule') === '1',
    ramadanHoursPerDay:  fd.get('ramadanHoursPerDay') ? Number(fd.get('ramadanHoursPerDay')) : null,
    isDefault:           fd.get('isDefault') === 'true' || fd.get('isDefault') === '1',
  })
}

// ── Server Actions ────────────────────────────────────────────────────────────

export async function createWorkSchedule(fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseWorkScheduleForm(fd)

    // Auto-translate Arabic if not provided (EN → AR only)
    if (!input.scheduleNameAr) {
      input.scheduleNameAr = (await translateToArabic(input.scheduleNameEn)) ?? undefined
    }

    const totalHours = computeTotalHours(fd)

    // BR-WH-001: hard block at 60h
    if (totalHours > 60) {
      return { error: `BR-WH-001: Total weekly hours (${totalHours.toFixed(1)}h) exceeds the absolute maximum of 60h. Please adjust the schedule.` }
    }

    const [row] = await db
      .insert(workSchedules)
      .values({
        tenantId:           TENANT_ID,
        legalEntityId:      input.legalEntityId ?? null,
        scheduleCode:       input.scheduleCode,
        scheduleNameEn:     input.scheduleNameEn,
        scheduleNameAr:     input.scheduleNameAr ?? null,
        scheduleType:       input.scheduleType,
        mondayStart:        input.mondayStart ?? null,
        mondayEnd:          input.mondayEnd ?? null,
        tuesdayStart:       input.tuesdayStart ?? null,
        tuesdayEnd:         input.tuesdayEnd ?? null,
        wednesdayStart:     input.wednesdayStart ?? null,
        wednesdayEnd:       input.wednesdayEnd ?? null,
        thursdayStart:      input.thursdayStart ?? null,
        thursdayEnd:        input.thursdayEnd ?? null,
        fridayStart:        input.fridayStart ?? null,
        fridayEnd:          input.fridayEnd ?? null,
        saturdayStart:      input.saturdayStart ?? null,
        saturdayEnd:        input.saturdayEnd ?? null,
        sundayStart:        input.sundayStart ?? null,
        sundayEnd:          input.sundayEnd ?? null,
        totalHoursPerWeek:  totalHours.toFixed(2),
        breakMinutes:       input.breakMinutes,
        isRamadanSchedule:  input.isRamadanSchedule,
        ramadanHoursPerDay: input.ramadanHoursPerDay != null ? String(input.ramadanHoursPerDay) : null,
        isDefault:          input.isDefault,
        isActive:           true,
        createdBy:          actor.id,
        createdByName:      actor.name,
      })
      .returning({ id: workSchedules.id })

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'WORK_SCHEDULE_CREATED',
      resourceType:  'work_schedules',
      resourceId:    row.id,
      newValues:     input as unknown as Record<string, unknown>,
      description:   `Work schedule ${input.scheduleCode} created`,
    })

    revalidatePath('/master-data/work-schedules')

    // BR-WH-001: warn (not block) at 48h
    if (totalHours > 48) {
      return { warning: `BR-WH-001: Schedule created, but total weekly hours (${totalHours.toFixed(1)}h) exceeds the 48h recommended limit. Verify compliance with legal counsel.` }
    }

    return {}
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { error: err.errors.map(e => e.message).join('; ') }
    }
    return { error: getErrorMessage(err, 'createWorkSchedule') }
  }
}

export async function updateWorkSchedule(
  id: string,
  fd: FormData,
  changeReason: string,
): Promise<ActionResult> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parseWorkScheduleForm(fd)

    const totalHours = computeTotalHours(fd)

    if (totalHours > 60) {
      return { error: `BR-WH-001: Total weekly hours (${totalHours.toFixed(1)}h) exceeds the absolute maximum of 60h.` }
    }

    const [before] = await db
      .select()
      .from(workSchedules)
      .where(eq(workSchedules.id, id))
      .limit(1)

    if (!before) return { error: 'Work schedule not found.' }

    // Auto-translate Arabic if English changed or Arabic is empty (EN → AR only)
    if (!input.scheduleNameAr || input.scheduleNameEn !== before.scheduleNameEn) {
      input.scheduleNameAr = (await translateToArabic(input.scheduleNameEn)) ?? input.scheduleNameAr ?? undefined
    }

    await db
      .update(workSchedules)
      .set({
        legalEntityId:      input.legalEntityId ?? null,
        scheduleCode:       input.scheduleCode,
        scheduleNameEn:     input.scheduleNameEn,
        scheduleNameAr:     input.scheduleNameAr ?? null,
        scheduleType:       input.scheduleType,
        mondayStart:        input.mondayStart ?? null,
        mondayEnd:          input.mondayEnd ?? null,
        tuesdayStart:       input.tuesdayStart ?? null,
        tuesdayEnd:         input.tuesdayEnd ?? null,
        wednesdayStart:     input.wednesdayStart ?? null,
        wednesdayEnd:       input.wednesdayEnd ?? null,
        thursdayStart:      input.thursdayStart ?? null,
        thursdayEnd:        input.thursdayEnd ?? null,
        fridayStart:        input.fridayStart ?? null,
        fridayEnd:          input.fridayEnd ?? null,
        saturdayStart:      input.saturdayStart ?? null,
        saturdayEnd:        input.saturdayEnd ?? null,
        sundayStart:        input.sundayStart ?? null,
        sundayEnd:          input.sundayEnd ?? null,
        totalHoursPerWeek:  totalHours.toFixed(2),
        breakMinutes:       input.breakMinutes,
        isRamadanSchedule:  input.isRamadanSchedule,
        ramadanHoursPerDay: input.ramadanHoursPerDay != null ? String(input.ramadanHoursPerDay) : null,
        isDefault:          input.isDefault,
        updatedBy:          actor.id,
        updatedByName:      actor.name,
        lastUpdatedDate:    new Date(),
      })
      .where(eq(workSchedules.id, id))

    const afterValues = { ...input, totalHoursPerWeek: totalHours } as unknown as Record<string, unknown>
    const beforeValues = before as unknown as Record<string, unknown>

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'WORK_SCHEDULE_UPDATED',
      resourceType:  'work_schedules',
      resourceId:    id,
      oldValues:     beforeValues,
      newValues:     afterValues,
      changedFields: diffFields(beforeValues, afterValues),
      metadata:      { changeReason, resourceName: before.scheduleNameEn, resourceNameAr: before.scheduleNameAr },
      description:   `Work schedule ${input.scheduleCode} updated: ${changeReason}`,
    })

    revalidatePath('/master-data/work-schedules')

    if (totalHours > 48) {
      return { warning: `BR-WH-001: Schedule saved, but total weekly hours (${totalHours.toFixed(1)}h) exceeds the 48h recommended limit.` }
    }

    return {}
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { error: err.errors.map(e => e.message).join('; ') }
    }
    return { error: getErrorMessage(err, 'updateWorkSchedule') }
  }
}

export async function disableWorkSchedule(
  id: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [ws] = await db
      .select({
        scheduleCode:  workSchedules.scheduleCode,
        legalEntityId: workSchedules.legalEntityId,
      })
      .from(workSchedules)
      .where(eq(workSchedules.id, id))
      .limit(1)

    if (!ws) return { error: 'Work schedule not found.' }

    await db
      .update(workSchedules)
      .set({
        isActive:        false,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(workSchedules.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'WORK_SCHEDULE_DISABLED',
      resourceType:  'work_schedules',
      resourceId:    id,
      entityId:      ws.legalEntityId ?? undefined,
      newValues:     { isActive: false },
      metadata:      { reason },
      description:   `Work schedule ${ws.scheduleCode} disabled: ${reason}`,
    })

    revalidatePath('/master-data/work-schedules')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'disableWorkSchedule') }
  }
}

export async function enableWorkSchedule(id: string): Promise<ActionResult> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [ws] = await db
      .select({
        scheduleCode:  workSchedules.scheduleCode,
        legalEntityId: workSchedules.legalEntityId,
      })
      .from(workSchedules)
      .where(eq(workSchedules.id, id))
      .limit(1)

    if (!ws) return { error: 'Work schedule not found.' }

    await db
      .update(workSchedules)
      .set({
        isActive:        true,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(workSchedules.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'WORK_SCHEDULE_ENABLED',
      resourceType:  'work_schedules',
      resourceId:    id,
      entityId:      ws.legalEntityId ?? undefined,
      newValues:     { isActive: true },
      description:   `Work schedule ${ws.scheduleCode} re-enabled`,
    })

    revalidatePath('/master-data/work-schedules')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'enableWorkSchedule') }
  }
}
