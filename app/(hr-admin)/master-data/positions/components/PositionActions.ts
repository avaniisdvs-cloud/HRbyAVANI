'use server'

import { db } from '@/lib/db'
import { positions } from '@/drizzle/schema'
import { translateToArabic } from '@/lib/translation'
import { eq, and, isNotNull } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog, diffFields } from '@/lib/audit'
import { writePositionHistory } from '@/lib/mdm-history'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/app-error'

// ── Zod schema ──────────────────────────────────────────────────────────────

const FTE_VALUES = ['0.25', '0.50', '0.75', '1.00'] as const

const positionSchema = z.object({
  legalEntityId:       z.string().uuid({ message: 'Legal entity is required' }),
  departmentId:        z.string().uuid({ message: 'Department is required' }),
  jobId:               z.string().uuid({ message: 'Job is required' }),
  positionCode:        z.string().min(1, 'Position code is required').max(30),
  positionTitleEn:     z.string().min(1, 'English title is required').max(200),
  positionTitleAr:     z.string().max(200).optional().nullable(),
  gradeId:             z.string().uuid().optional().nullable(),
  locationId:          z.string().uuid().optional().nullable(),
  fteCount:            z.enum(FTE_VALUES, { errorMap: () => ({ message: 'FTE must be 0.25, 0.50, 0.75, or 1.00' }) }),
  reportsToPositionId: z.string().uuid().optional().nullable(),
  budgetAmount:        z.coerce.number().positive().optional().nullable(),
})

type PositionInput = z.infer<typeof positionSchema>

function parsePositionForm(fd: FormData): PositionInput {
  const rawFte = (fd.get('fteCount') as string | null) ?? '1.00'
  // Normalise to 2dp string for the enum check
  const fteNormalised = parseFloat(rawFte).toFixed(2) as typeof FTE_VALUES[number]

  return positionSchema.parse({
    legalEntityId:       fd.get('legalEntityId'),
    departmentId:        fd.get('departmentId'),
    jobId:               fd.get('jobId'),
    positionCode:        fd.get('positionCode'),
    positionTitleEn:     fd.get('positionTitleEn'),
    positionTitleAr:     fd.get('positionTitleAr') || null,
    gradeId:             fd.get('gradeId') || null,
    locationId:          fd.get('locationId') || null,
    fteCount:            fteNormalised,
    reportsToPositionId: fd.get('reportsToPositionId') || null,
    budgetAmount:        fd.get('budgetAmount') ? Number(fd.get('budgetAmount')) : null,
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function assertCodeUnique(
  legalEntityId: string,
  positionCode: string,
  excludeId?: string,
): Promise<void> {
  const existing = await db
    .select({ id: positions.id })
    .from(positions)
    .where(
      and(
        eq(positions.legalEntityId, legalEntityId),
        eq(positions.positionCode, positionCode),
        eq(positions.tenantId, TENANT_ID),
      ),
    )
    .limit(1)

  const conflict = existing.find(r => r.id !== excludeId)
  if (conflict) {
    throw new Error('BR-POS-001: Position code already exists for this legal entity.')
  }
}

// ── Server Actions ───────────────────────────────────────────────────────────

export async function createPosition(fd: FormData): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parsePositionForm(fd)

    // Auto-translate Arabic if not provided (EN → AR only)
    if (!input.positionTitleAr) {
      input.positionTitleAr = (await translateToArabic(input.positionTitleEn)) ?? null
    }

    await assertCodeUnique(input.legalEntityId, input.positionCode)

    const [row] = await db
      .insert(positions)
      .values({
        tenantId:            TENANT_ID,
        legalEntityId:       input.legalEntityId,
        departmentId:        input.departmentId,
        jobId:               input.jobId,
        positionCode:        input.positionCode,
        positionTitleEn:     input.positionTitleEn,
        positionTitleAr:     input.positionTitleAr ?? null,
        gradeId:             input.gradeId ?? null,
        locationId:          input.locationId ?? null,
        fteCount:            input.fteCount,
        reportsToPositionId: input.reportsToPositionId ?? null,
        budgetAmount:        input.budgetAmount != null ? String(input.budgetAmount) : null,
        isOccupied:          false,
        isActive:            true,
        isCurrent:           true,
        actionMode:          'UPDATE',
        createdBy:           actor.id,
        createdByName:       actor.name,
      })
      .returning({ id: positions.id })

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'POSITION_CREATED',
      resourceType:  'positions',
      resourceId:    row.id,
      entityId:      input.legalEntityId,
      newValues:     input as unknown as Record<string, unknown>,
      description:   `Position ${input.positionCode} created`,
    })

    revalidatePath('/master-data/positions')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'createPosition') }
  }
}

// BR-POS-004: walk the reportsTo chain from `candidateId` upward.
// Returns an error string if `positionId` is found in the chain (circular),
// or null if the chain is clean. Caps at 25 hops to guard against orphaned cycles.
async function detectCircularChain(
  positionId:  string,
  candidateId: string,
): Promise<string | null> {
  let current: string | null = candidateId
  let hops = 0
  while (current && hops < 25) {
    if (current === positionId) {
      return `Cannot set "Reports To": this would create a circular reporting chain. (BR-POS-004)`
    }
    const [row] = await db
      .select({ reportsToPositionId: positions.reportsToPositionId })
      .from(positions)
      .where(eq(positions.id, current))
      .limit(1)
    current = row?.reportsToPositionId ?? null
    hops++
  }
  return null
}

export async function updatePosition(
  id: string,
  fd: FormData,
  changeReason: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const input = parsePositionForm(fd)

    // Fetch before-snapshot (also confirms row exists)
    const [before] = await db
      .select()
      .from(positions)
      .where(eq(positions.id, id))
      .limit(1)

    if (!before) throw new Error('Position not found.')

    // Auto-translate Arabic if English changed or Arabic is empty (EN → AR only)
    if (!input.positionTitleAr || input.positionTitleEn !== before.positionTitleEn) {
      input.positionTitleAr = (await translateToArabic(input.positionTitleEn)) ?? input.positionTitleAr ?? null
    }

    // BR-POS-001: positionCode is immutable once saved
    if (before.positionCode !== input.positionCode) {
      throw new Error('BR-POS-001: Position code cannot be changed after creation.')
    }

    // BR-POS-004: prevent circular reporting chain
    if (input.reportsToPositionId) {
      const circularError = await detectCircularChain(id, input.reportsToPositionId)
      if (circularError) throw new Error(circularError)
    }

    const afterValues  = input as unknown as Record<string, unknown>
    const beforeValues = before as unknown as Record<string, unknown>

    await db.transaction(async (tx) => {
      await tx
        .update(positions)
        .set({
          legalEntityId:       input.legalEntityId,
          departmentId:        input.departmentId,
          jobId:               input.jobId,
          positionTitleEn:     input.positionTitleEn,
          positionTitleAr:     input.positionTitleAr ?? null,
          gradeId:             input.gradeId ?? null,
          locationId:          input.locationId ?? null,
          fteCount:            input.fteCount,
          reportsToPositionId: input.reportsToPositionId ?? null,
          budgetAmount:        input.budgetAmount != null ? String(input.budgetAmount) : null,
          updatedBy:           actor.id,
          updatedByName:       actor.name,
          lastUpdatedDate:     new Date(),
        })
        .where(eq(positions.id, id))

      await writePositionHistory(tx, id, {
        positionCode:        before.positionCode,
        positionTitleEn:     input.positionTitleEn,
        positionTitleAr:     input.positionTitleAr ?? null,
        departmentId:        input.departmentId,
        jobId:               input.jobId,
        gradeId:             input.gradeId ?? null,
        locationId:          input.locationId ?? null,
        fteCount:            input.fteCount,
        reportsToPositionId: input.reportsToPositionId ?? null,
        budgetAmount:        input.budgetAmount != null ? String(input.budgetAmount) : null,
      }, actor.personId ?? undefined, changeReason.trim())

      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: actor.legalEntityId,
        channel:       'WEB',
        eventType:     'POSITION_UPDATED',
        resourceType:  'positions',
        resourceId:    id,
        entityId:      input.legalEntityId,
        oldValues:     beforeValues,
        newValues:     afterValues,
        changedFields: diffFields(beforeValues, afterValues),
        metadata:      { changeReason, resourceName: before.positionTitleEn, resourceNameAr: before.positionTitleAr },
        description:   `Position ${input.positionCode} updated: ${changeReason}`,
      }, tx)
    })

    revalidatePath('/master-data/positions')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'updatePosition') }
  }
}

export async function disablePosition(
  id: string,
  reason: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [pos] = await db
      .select({
        positionCode: positions.positionCode,
        legalEntityId: positions.legalEntityId,
        isOccupied: positions.isOccupied,
      })
      .from(positions)
      .where(eq(positions.id, id))
      .limit(1)

    if (!pos) throw new Error('Position not found.')

    // BR-POS-003: Cannot disable an occupied position
    if (pos.isOccupied) {
      throw new Error('BR-POS-003: Position is currently occupied. Unassign the employee before disabling.')
    }

    await db
      .update(positions)
      .set({
        isActive:        false,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(positions.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'POSITION_DISABLED',
      resourceType:  'positions',
      resourceId:    id,
      entityId:      pos.legalEntityId ?? undefined,
      newValues:     { isActive: false },
      metadata:      { reason },
      description:   `Position ${pos.positionCode} disabled: ${reason}`,
    })

    revalidatePath('/master-data/positions')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'disablePosition') }
  }
}

export async function correctPosition(
  id:             string,
  fd:             FormData,
  correctionNote: string,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
    if (!correctionNote || correctionNote.trim().length < 5) {
      return { error: 'Correction note must be at least 5 characters.' }
    }

    const input = parsePositionForm(fd)

    const [before] = await db
      .select()
      .from(positions)
      .where(eq(positions.id, id))
      .limit(1)

    if (!before) throw new Error('Position not found.')

    // BR-POS-004: validate reporting chain even on corrections
    if (input.reportsToPositionId) {
      const circularError = await detectCircularChain(id, input.reportsToPositionId)
      if (circularError) throw new Error(circularError)
    }

    const snapshot: Record<string, unknown> = {
      positionTitleEn:     before.positionTitleEn,
      positionTitleAr:     before.positionTitleAr,
      departmentId:        before.departmentId,
      jobId:               before.jobId,
      gradeId:             before.gradeId,
      locationId:          before.locationId,
      fteCount:            before.fteCount,
      reportsToPositionId: before.reportsToPositionId,
      budgetAmount:        before.budgetAmount,
    }

    await db
      .update(positions)
      .set({
        positionTitleEn:     input.positionTitleEn,
        positionTitleAr:     input.positionTitleAr ?? null,
        departmentId:        input.departmentId,
        jobId:               input.jobId,
        gradeId:             input.gradeId ?? null,
        locationId:          input.locationId ?? null,
        fteCount:            input.fteCount,
        reportsToPositionId: input.reportsToPositionId ?? null,
        budgetAmount:        input.budgetAmount != null ? String(input.budgetAmount) : null,
        actionMode:          'CORRECTION',
        correctsRowId:       null,
        updatedBy:           actor.id,
        updatedByName:       actor.name,
        lastUpdatedDate:     new Date(),
      })
      .where(eq(positions.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'POSITION_CORRECTED',
      resourceType:  'positions',
      resourceId:    id,
      entityId:      input.legalEntityId,
      oldValues:     snapshot,
      newValues:     input as unknown as Record<string, unknown>,
      changedFields: diffFields(snapshot, input as unknown as Record<string, unknown>),
      metadata:      { correctionNote: correctionNote.trim(), resourceName: before.positionTitleEn, resourceNameAr: before.positionTitleAr },
      description:   `Position ${before.positionCode} corrected: ${correctionNote.trim()}`,
    })

    revalidatePath('/master-data/positions')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'correctPosition') }
  }
}

export async function enablePosition(id: string): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    const [pos] = await db
      .select({ positionCode: positions.positionCode, legalEntityId: positions.legalEntityId })
      .from(positions)
      .where(eq(positions.id, id))
      .limit(1)

    if (!pos) throw new Error('Position not found.')

    await db
      .update(positions)
      .set({
        isActive:        true,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(positions.id, id))

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'WEB',
      eventType:     'POSITION_ENABLED',
      resourceType:  'positions',
      resourceId:    id,
      entityId:      pos.legalEntityId ?? undefined,
      newValues:     { isActive: true },
      description:   `Position ${pos.positionCode} re-enabled`,
    })

    revalidatePath('/master-data/positions')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'enablePosition') }
  }
}
