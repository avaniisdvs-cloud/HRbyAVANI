'use server'

import { db } from '@/lib/db'
import { leavePlanEnrolments, absencePlans, persons } from '@/drizzle/schema'
import { eq, and } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { addDays, EFFECTIVE_END_OF_TIME } from '@/lib/effective-date'
import type { DateParam } from '@/lib/effective-date'
import { getAsOfRow, leavePlanEnrolmentAsOfAdapter } from '@/lib/as-of-query'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/app-error'
import type { LeavePlanEnrolment } from '@/drizzle/schema'

type Tx = {
  select: typeof db.select
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const EnrolSchema = z.object({
  personId:           z.string().uuid(),
  legalEntityId:      z.string().uuid(),
  absencePlanId:      z.string().uuid(),
  effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  enrollmentReason:   z.string().max(200).optional().nullable(),
  notes:              z.string().max(2000).optional().nullable(),
})

export type EnrolLeavePlanInput  = z.infer<typeof EnrolSchema>

const CorrectEnrolmentSchema = z.object({
  enrolmentId:        z.string().uuid(),
  correctionNote:     z.string().min(1).max(1000),
  absencePlanId:      z.string().uuid().optional(),
  effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  enrollmentReason:   z.string().max(200).optional().nullable(),
  notes:              z.string().max(2000).optional().nullable(),
})

export type CorrectEnrolmentInput = z.infer<typeof CorrectEnrolmentSchema>

// ── findLeavePlanEnrolmentAsOfTx ─────────────────────────────────────────────

export async function findLeavePlanEnrolmentAsOfTx(
  tx: Tx,
  input: {
    tenantId: string
    personId: string
    absencePlanId: string
    asOfDate: DateParam
  },
): Promise<LeavePlanEnrolment | null> {
  return getAsOfRow<LeavePlanEnrolment>(
    tx,
    leavePlanEnrolmentAsOfAdapter,
    {
      tenantId: input.tenantId,
      personId: input.personId,
      absencePlanId: input.absencePlanId,
    },
    input.asOfDate,
  )
}

// ── enrolPersonInLeavePlan ────────────────────────────────────────────────────
// Business event: close the current open row, open a new one.
// BR-ENROL-001: Only one active leave plan enrolment per person at a time.

export async function enrolPersonInLeavePlan(
  input: EnrolLeavePlanInput,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data  = EnrolSchema.parse(input)

    await db.transaction(async tx => {
      // Close any current open enrolment for this person
      const [existing] = await tx
        .select({ id: leavePlanEnrolments.id })
        .from(leavePlanEnrolments)
        .where(
          and(
            eq(leavePlanEnrolments.tenantId, TENANT_ID),
            eq(leavePlanEnrolments.personId, data.personId),
            eq(leavePlanEnrolments.isCurrent, true),
          ),
        )
        .limit(1)

      if (existing) {
        await tx
          .update(leavePlanEnrolments)
          .set({
            effectiveEndDate: addDays(data.effectiveStartDate, -1),
            isCurrent:        false,
            updatedBy:        actor.id,
            updatedByName:    actor.name,
            lastUpdatedDate:  new Date(),
          })
          .where(eq(leavePlanEnrolments.id, existing.id))
      }

      // Open new enrolment row
      const [inserted] = await tx
        .insert(leavePlanEnrolments)
        .values({
          tenantId:           TENANT_ID,
          personId:           data.personId,
          legalEntityId:      data.legalEntityId,
          absencePlanId:      data.absencePlanId,
          enrollmentReason:   data.enrollmentReason ?? null,
          effectiveStartDate: data.effectiveStartDate,
          effectiveEndDate:   EFFECTIVE_END_OF_TIME,
          isCurrent:          true,
          actionMode:         'UPDATE',
          enrolledBy:         actor.id,
          notes:              data.notes ?? null,
          createdBy:          actor.id,
          createdByName:      actor.name,
        })
        .returning({ id: leavePlanEnrolments.id })

      await writeAuditLog(
        {
          actorId:       actor.id,
          actorName:     actor.name,
          actorRole:     actor.role,
          actorEntityId: data.legalEntityId,
          channel:       'WEB',
          eventType:     'LEAVE_PLAN.ENROLMENT.CREATED',
          resourceType:  'leave_plan_enrolments',
          resourceId:    inserted.id,
          entityId:      data.legalEntityId,
          newValues:     data as unknown as Record<string, unknown>,
          description:   `Leave plan enrolment created for person ${data.personId}`,
        },
        tx,
      )
    })

    revalidatePath('/employees')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'enrolPersonInLeavePlan') }
  }
}

// ── correctLeavePlanEnrolment ─────────────────────────────────────────────────
// In-place correction: updates the current row without creating history.
// Requires HR_DIRECTOR or SUPER_ADMIN.

export async function correctLeavePlanEnrolment(
  input: CorrectEnrolmentInput,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
    const data  = CorrectEnrolmentSchema.parse(input)

    await db.transaction(async tx => {
      const [current] = await tx
        .select()
        .from(leavePlanEnrolments)
        .where(eq(leavePlanEnrolments.id, data.enrolmentId))
        .limit(1)

      if (!current) throw new Error('Enrolment record not found.')

      const oldValues = { ...current } as unknown as Record<string, unknown>

      await tx
        .update(leavePlanEnrolments)
        .set({
          absencePlanId:      data.absencePlanId      ?? current.absencePlanId,
          effectiveStartDate: data.effectiveStartDate ?? current.effectiveStartDate,
          enrollmentReason:   data.enrollmentReason   !== undefined ? data.enrollmentReason : current.enrollmentReason,
          notes:              data.notes              !== undefined ? data.notes              : current.notes,
          actionMode:         'CORRECTION',
          correctsRowId:      null,
          updatedBy:          actor.id,
          updatedByName:      actor.name,
          lastUpdatedDate:    new Date(),
        })
        .where(eq(leavePlanEnrolments.id, data.enrolmentId))

      await writeAuditLog(
        {
          actorId:       actor.id,
          actorName:     actor.name,
          actorRole:     actor.role,
          actorEntityId: current.legalEntityId,
          channel:       'WEB',
          eventType:     'LEAVE_PLAN.ENROLMENT.CORRECTED',
          resourceType:  'leave_plan_enrolments',
          resourceId:    data.enrolmentId,
          entityId:      current.legalEntityId,
          oldValues,
          newValues:     data as unknown as Record<string, unknown>,
          metadata:      { correctionNote: data.correctionNote },
          description:   `Leave plan enrolment corrected for person ${current.personId}`,
        },
        tx,
      )
    })

    revalidatePath('/employees')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'correctLeavePlanEnrolment') }
  }
}

// ── getLeavePlanEnrolmentHistory ──────────────────────────────────────────────

export async function getLeavePlanEnrolmentHistory(personId: string) {
  return db
    .select({
      id:                  leavePlanEnrolments.id,
      absencePlanId:       leavePlanEnrolments.absencePlanId,
      planNameEn:          absencePlans.planNameEn,
      planNameAr:          absencePlans.planNameAr,
      effectiveStartDate:  leavePlanEnrolments.effectiveStartDate,
      effectiveEndDate:    leavePlanEnrolments.effectiveEndDate,
      isCurrent:           leavePlanEnrolments.isCurrent,
      actionMode:          leavePlanEnrolments.actionMode,
      enrollmentReason:    leavePlanEnrolments.enrollmentReason,
      createdDate:         leavePlanEnrolments.createdDate,
    })
    .from(leavePlanEnrolments)
    .leftJoin(absencePlans, eq(leavePlanEnrolments.absencePlanId, absencePlans.id))
    .where(
      and(
        eq(leavePlanEnrolments.tenantId, TENANT_ID),
        eq(leavePlanEnrolments.personId, personId),
      ),
    )
    .orderBy(leavePlanEnrolments.effectiveStartDate)
}
