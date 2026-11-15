'use server'

import { db } from '@/lib/db'
import { grades, positions } from '@/drizzle/schema'
import { translateToArabic } from '@/lib/translation'
import { eq, and, count } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole, type SessionUser } from '@/lib/auth'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { writeGradeHistory } from '@/lib/mdm-history'
import { revalidatePath } from 'next/cache'

// ── Types ──────────────────────────────────────────────────────────────────

export interface GradeFieldErrors {
  gradeCode?:        string
  gradeNameEn?:      string
  gradeNameAr?:      string
  gradeLevel?:       string
  minSalary?:        string
  maxSalary?:        string
  midSalary?:        string
  noticePeriodDays?: string
  salaryRange?:      string  // BR-GRADE-002
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractFields(fd: FormData) {
  const rawMin = (fd.get('minSalary') as string | null)?.trim() || null
  const rawMax = (fd.get('maxSalary') as string | null)?.trim() || null

  // BR-GRADE: auto-compute midpoint when both min/max present
  let midSalary: string | null = null
  if (rawMin && rawMax) {
    const min = parseFloat(rawMin)
    const max = parseFloat(rawMax)
    if (!isNaN(min) && !isNaN(max)) {
      midSalary = ((min + max) / 2).toFixed(2)
    }
  }

  return {
    legalEntityId:    (fd.get('legalEntityId') as string | null)?.trim() || null,
    gradeCode:        (fd.get('gradeCode')     as string | null)?.trim().toUpperCase() ?? '',
    gradeNameEn:      (fd.get('gradeNameEn')   as string | null)?.trim() ?? '',
    gradeNameAr:      (fd.get('gradeNameAr')   as string | null)?.trim() ?? '',
    gradeLevel:       parseInt((fd.get('gradeLevel') as string | null) ?? '0', 10),
    minSalary:        rawMin,
    maxSalary:        rawMax,
    midSalary,
    noticePeriodDays: parseInt((fd.get('noticePeriodDays') as string | null) ?? '30', 10),
  }
}

function validateFields(fields: ReturnType<typeof extractFields>): GradeFieldErrors | null {
  const errors: GradeFieldErrors = {}

  if (!fields.gradeCode)   errors.gradeCode   = 'Grade code is required.'
  if (!fields.gradeNameEn) errors.gradeNameEn = 'Grade name (EN) is required.'

  if (!fields.gradeLevel || isNaN(fields.gradeLevel)) {
    errors.gradeLevel = 'Grade level is required.'
  } else if (fields.gradeLevel < 1 || fields.gradeLevel > 20) {
    errors.gradeLevel = 'Grade level must be between 1 and 20.'
  }

  if (![30, 60, 90].includes(fields.noticePeriodDays)) {
    errors.noticePeriodDays = 'Notice period must be 30, 60, or 90 days.'
  }

  for (const [key, label] of [
    ['minSalary', 'Minimum salary'],
    ['maxSalary', 'Maximum salary'],
  ] as const) {
    const raw = fields[key]
    if (!raw) continue
    const value = Number(raw)
    if (!Number.isFinite(value)) {
      errors[key] = `${label} must be a valid number.`
    } else if (value < 0) {
      errors[key] = `${label} cannot be negative.`
    }
  }

  // BR-GRADE-002: Min < Midpoint < Max
  if (fields.minSalary && fields.maxSalary) {
    const min = Number(fields.minSalary)
    const max = Number(fields.maxSalary)
    if (Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= 0) {
      if (min >= max) {
        errors.salaryRange = 'Minimum salary must be less than maximum salary (BR-GRADE-002).'
      } else if (fields.midSalary) {
        const mid = Number(fields.midSalary)
        if (Number.isFinite(mid) && (mid <= min || mid >= max)) {
          errors.salaryRange = 'Midpoint salary must be between minimum and maximum (BR-GRADE-002).'
        }
      }
    }
  }

  return Object.keys(errors).length > 0 ? errors : null
}

function assertGradeEntityScope(actor: SessionUser, legalEntityId: string | null): void {
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'HR_DIRECTOR') return
  if (!legalEntityId) {
    throw new Error('GRADE_ENTITY_SCOPE: HR Admins cannot create or modify enterprise-wide grades')
  }
  if (actor.legalEntityId !== legalEntityId) {
    throw new Error('GRADE_ENTITY_SCOPE: HR Admins can only manage grades in their own legal entity')
  }
}

// ── createGrade ────────────────────────────────────────────────────────────

export async function createGrade(
  fd: FormData,
): Promise<{ success: true } | { success: false; error: string; fieldErrors?: GradeFieldErrors }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const fields = extractFields(fd)

    // Auto-translate Arabic if not provided (EN → AR only)
    if (!fields.gradeNameAr) {
      fields.gradeNameAr = (await translateToArabic(fields.gradeNameEn)) ?? ''
    }

    const fieldErrors = validateFields(fields)
    if (fieldErrors) return { success: false, error: 'Validation failed.', fieldErrors }

    assertGradeEntityScope(actor, fields.legalEntityId)

    await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(grades)
        .values({
          tenantId:         TENANT_ID,
          legalEntityId:    fields.legalEntityId,
          gradeCode:        fields.gradeCode,
          gradeNameEn:      fields.gradeNameEn,
          gradeNameAr:      fields.gradeNameAr,
          gradeLevel:       fields.gradeLevel,
          minSalary:        fields.minSalary,
          maxSalary:        fields.maxSalary,
          midSalary:        fields.midSalary,
          noticePeriodDays: fields.noticePeriodDays,
          isActive:         true,
          actionMode:       'UPDATE',
          createdBy:        actor.id,
          createdByName:    actor.name ?? actor.email,
        })
        .returning({ id: grades.id })

      await writeAuditLog(
        {
          actorId:      actor.id,
          actorName:    actor.name ?? actor.email,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'GRADE_CREATED',
          resourceType: 'grades',
          resourceId:   inserted.id,
          newValues:    fields as unknown as Record<string, unknown>,
          description:  `Created grade ${fields.gradeCode} — ${fields.gradeNameEn}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/grades')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    if (message.includes('unique') || message.includes('duplicate')) {
      return { success: false, error: 'A grade with this code already exists.' }
    }
    return { success: false, error: `Failed to create grade: ${message}` }
  }
}

// ── updateGrade ────────────────────────────────────────────────────────────

export async function updateGrade(
  id: string,
  fd: FormData,
  changeReason: string,
): Promise<{ success: true } | { success: false; error: string; fieldErrors?: GradeFieldErrors }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    if (!changeReason || changeReason.trim().length < 10) {
      return { success: false, error: 'Change reason must be at least 10 characters.' }
    }

    const fields = extractFields(fd)

    const now   = new Date()

    const [existing] = await db
      .select()
      .from(grades)
      .where(eq(grades.id, id))
      .limit(1)

    if (!existing) return { success: false, error: 'Record not found.' }
    assertGradeEntityScope(actor, existing.legalEntityId)

    // Auto-translate Arabic if English changed or Arabic is empty (EN → AR only)
    if (!fields.gradeNameAr || fields.gradeNameEn !== existing.gradeNameEn) {
      fields.gradeNameAr = (await translateToArabic(fields.gradeNameEn)) ?? fields.gradeNameAr ?? ''
    }

    const fieldErrors = validateFields(fields)
    if (fieldErrors) return { success: false, error: 'Validation failed.', fieldErrors }
    assertGradeEntityScope(actor, fields.legalEntityId)

    const snapshot: Record<string, unknown> = {
      legalEntityId:    existing.legalEntityId,
      gradeCode:        existing.gradeCode,
      gradeNameEn:      existing.gradeNameEn,
      gradeNameAr:      existing.gradeNameAr,
      gradeLevel:       existing.gradeLevel,
      minSalary:        existing.minSalary,
      maxSalary:        existing.maxSalary,
      midSalary:        existing.midSalary,
      noticePeriodDays: existing.noticePeriodDays,
    }

    await db.transaction(async (tx) => {
      await tx
        .update(grades)
        .set({
          legalEntityId:    fields.legalEntityId,
          gradeNameEn:      fields.gradeNameEn,
          gradeNameAr:      fields.gradeNameAr,
          gradeLevel:       fields.gradeLevel,
          minSalary:        fields.minSalary,
          maxSalary:        fields.maxSalary,
          midSalary:        fields.midSalary,
          noticePeriodDays: fields.noticePeriodDays,
          updatedBy:        actor.id,
          updatedByName:    actor.name ?? actor.email,
          lastUpdatedDate:  now,
          updatedDate:      now,
        })
        .where(eq(grades.id, id))

      await writeGradeHistory(tx, id, {
        gradeCode:        existing.gradeCode,
        gradeNameEn:      fields.gradeNameEn,
        gradeNameAr:      fields.gradeNameAr,
        gradeLevel:       fields.gradeLevel,
        minSalary:        fields.minSalary,
        maxSalary:        fields.maxSalary,
        midSalary:        fields.midSalary,
        noticePeriodDays: fields.noticePeriodDays,
      }, actor.personId ?? undefined, changeReason.trim())

      await writeAuditLog(
        {
          actorId:       actor.id,
          actorName:     actor.name ?? actor.email,
          actorRole:     actor.role,
          channel:       'WEB',
          eventType:     'GRADE_UPDATED',
          resourceType:  'grades',
          resourceId:    id,
          oldValues:     snapshot,
          newValues:     fields as unknown as Record<string, unknown>,
          changedFields: diffFields(snapshot, fields as unknown as Record<string, unknown>),
          metadata:      { changeReason: changeReason.trim(), resourceName: existing.gradeNameEn, resourceNameAr: existing.gradeNameAr },
          description:   `Updated grade ${existing.gradeCode} — ${existing.gradeNameEn}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/grades')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { success: false, error: `Failed to update grade: ${message}` }
  }
}

// ── disableGrade ───────────────────────────────────────────────────────────

export async function disableGrade(
  id: string,
  reason: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    if (!reason || reason.trim().length < 10) {
      return { success: false, error: 'Disable reason must be at least 10 characters.' }
    }

    const now   = new Date()

    const [existing] = await db
      .select({ id: grades.id, gradeCode: grades.gradeCode, gradeNameEn: grades.gradeNameEn, legalEntityId: grades.legalEntityId })
      .from(grades)
      .where(eq(grades.id, id))
      .limit(1)

    if (!existing) return { success: false, error: 'Record not found.' }
    assertGradeEntityScope(actor, existing.legalEntityId)

    // BR-GRADE-004: block if any active positions reference this grade
    const [{ activePositions }] = await db
      .select({ activePositions: count() })
      .from(positions)
      .where(and(eq(positions.gradeId, id), eq(positions.isActive, true)))
    if (activePositions > 0) {
      return {
        success: false,
        error: `Cannot disable: ${activePositions} active position${activePositions === 1 ? '' : 's'} are assigned to this grade. Reassign positions first. (BR-GRADE-004)`,
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(grades)
        .set({
          isActive:        false,
          updatedBy:       actor.id,
          updatedByName:   actor.name ?? actor.email,
          lastUpdatedDate: now,
          updatedDate:     now,
        })
        .where(eq(grades.id, id))

      await writeAuditLog(
        {
          actorId:      actor.id,
          actorName:    actor.name ?? actor.email,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'GRADE_DISABLED',
          resourceType: 'grades',
          resourceId:   id,
          metadata:     { changeReason: reason.trim() },
          description:  `Disabled grade ${existing.gradeCode} — ${existing.gradeNameEn}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/grades')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { success: false, error: `Failed to disable grade: ${message}` }
  }
}

// ── enableGrade ────────────────────────────────────────────────────────────

// ── correctGrade ───────────────────────────────────────────────────────────
// In-place correction — fixes a data-entry error without creating a new history row.
// Restricted to HR_DIRECTOR and SUPER_ADMIN.

export async function correctGrade(
  id:             string,
  fd:             FormData,
  correctionNote: string,
): Promise<{ success: true } | { success: false; error: string; fieldErrors?: GradeFieldErrors }> {
  try {
    const actor = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])

    if (!correctionNote || correctionNote.trim().length < 5) {
      return { success: false, error: 'Correction note must be at least 5 characters.' }
    }

    const fields = extractFields(fd)
    const fieldErrors = validateFields(fields)
    if (fieldErrors) return { success: false, error: 'Validation failed.', fieldErrors }

    const now   = new Date()

    const [existing] = await db
      .select()
      .from(grades)
      .where(eq(grades.id, id))
      .limit(1)

    if (!existing) return { success: false, error: 'Record not found.' }

    const snapshot: Record<string, unknown> = {
      gradeNameEn:      existing.gradeNameEn,
      gradeNameAr:      existing.gradeNameAr,
      gradeLevel:       existing.gradeLevel,
      minSalary:        existing.minSalary,
      maxSalary:        existing.maxSalary,
      midSalary:        existing.midSalary,
      noticePeriodDays: existing.noticePeriodDays,
    }

    await db.transaction(async (tx) => {
      await tx
        .update(grades)
        .set({
          gradeNameEn:      fields.gradeNameEn,
          gradeNameAr:      fields.gradeNameAr,
          gradeLevel:       fields.gradeLevel,
          minSalary:        fields.minSalary,
          maxSalary:        fields.maxSalary,
          midSalary:        fields.midSalary,
          noticePeriodDays: fields.noticePeriodDays,
          actionMode:       'CORRECTION',
          correctsRowId:    null,
          updatedBy:        actor.id,
          updatedByName:    actor.name ?? actor.email,
          lastUpdatedDate:  now,
          updatedDate:      now,
        })
        .where(eq(grades.id, id))

      await writeAuditLog(
        {
          actorId:       actor.id,
          actorName:     actor.name ?? actor.email,
          actorRole:     actor.role,
          channel:       'WEB',
          eventType:     'GRADE_CORRECTED',
          resourceType:  'grades',
          resourceId:    id,
          oldValues:     snapshot,
          newValues:     fields as unknown as Record<string, unknown>,
          changedFields: diffFields(snapshot, fields as unknown as Record<string, unknown>),
          metadata:      { correctionNote: correctionNote.trim(), resourceName: existing.gradeNameEn, resourceNameAr: existing.gradeNameAr },
          description:   `Grade ${existing.gradeCode} corrected: ${correctionNote.trim()}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/grades')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { success: false, error: `Failed to correct grade: ${message}` }
  }
}

export async function enableGrade(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const now   = new Date()

    const [existing] = await db
      .select({ id: grades.id, gradeCode: grades.gradeCode, gradeNameEn: grades.gradeNameEn, legalEntityId: grades.legalEntityId })
      .from(grades)
      .where(eq(grades.id, id))
      .limit(1)

    if (!existing) return { success: false, error: 'Record not found.' }
    assertGradeEntityScope(actor, existing.legalEntityId)

    await db.transaction(async (tx) => {
      await tx
        .update(grades)
        .set({
          isActive:        true,
          updatedBy:       actor.id,
          updatedByName:   actor.name ?? actor.email,
          lastUpdatedDate: now,
          updatedDate:     now,
        })
        .where(eq(grades.id, id))

      await writeAuditLog(
        {
          actorId:      actor.id,
          actorName:    actor.name ?? actor.email,
          actorRole:    actor.role,
          channel:      'WEB',
          eventType:    'GRADE_ENABLED',
          resourceType: 'grades',
          resourceId:   id,
          description:  `Re-enabled grade ${existing.gradeCode} — ${existing.gradeNameEn}`,
        },
        tx,
      )
    })

    revalidatePath('/master-data/grades')
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    return { success: false, error: `Failed to enable grade: ${message}` }
  }
}
