'use server'

import { db } from '@/lib/db'
import { persons, workScheduleAssignments, workerAssignments, workSchedules } from '@/drizzle/schema'
import { eq, and } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { addDays, EFFECTIVE_END_OF_TIME, todayUae } from '@/lib/effective-date'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/app-error'

// ── Schemas ───────────────────────────────────────────────────────────────────

const AssignSchema = z.object({
  personId:           z.string().uuid(),
  legalEntityId:      z.string().uuid(),
  workScheduleId:     z.string().uuid(),
  effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  assignmentReason:   z.string().max(200).optional().nullable(),
  notes:              z.string().max(2000).optional().nullable(),
})

export type AssignWorkScheduleInput = z.infer<typeof AssignSchema>

const CorrectAssignmentSchema = z.object({
  assignmentId:       z.string().uuid(),
  correctionNote:     z.string().min(1).max(1000),
  workScheduleId:     z.string().uuid().optional(),
  effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assignmentReason:   z.string().max(200).optional().nullable(),
  notes:              z.string().max(2000).optional().nullable(),
})

export type CorrectWorkScheduleAssignmentInput = z.infer<typeof CorrectAssignmentSchema>

// ── assignWorkSchedule ────────────────────────────────────────────────────────
// Business event: close the current open row, open a new one.

export async function assignWorkSchedule(
  input: AssignWorkScheduleInput,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    await requirePermission(actor, 'ASSIGNMENTS', 'edit')
    const data  = AssignSchema.parse(input)

    await db.transaction(async tx => {
      if (data.effectiveStartDate > todayUae()) {
        throw new Error('WORK_SCHEDULE_FUTURE_DATED_UNSUPPORTED: future-dated work schedule assignment requires an activation workflow')
      }

      const [person] = await tx
        .select({ id: persons.id, legalEntityId: persons.legalEntityId })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))
        .limit(1)
      if (!person) throw new Error('WORK_SCHEDULE_PERSON_NOT_FOUND: person not found')
      if (actor.role !== 'SUPER_ADMIN' && actor.legalEntityId !== person.legalEntityId) {
        throw new Error('FORBIDDEN: cross-entity work schedule assignment denied')
      }
      if (data.legalEntityId !== person.legalEntityId) {
        throw new Error('WORK_SCHEDULE_ENTITY_MISMATCH: assignment legalEntityId must match the employee legal entity')
      }

      const [schedule] = await tx
        .select({
          id:            workSchedules.id,
          legalEntityId: workSchedules.legalEntityId,
          isActive:      workSchedules.isActive,
        })
        .from(workSchedules)
        .where(and(eq(workSchedules.tenantId, TENANT_ID), eq(workSchedules.id, data.workScheduleId)))
        .limit(1)
      if (!schedule) throw new Error('WORK_SCHEDULE_NOT_FOUND: work schedule not found')
      if (!schedule.isActive) throw new Error('WORK_SCHEDULE_INACTIVE: work schedule is inactive')
      if (schedule.legalEntityId && schedule.legalEntityId !== person.legalEntityId) {
        throw new Error('WORK_SCHEDULE_ENTITY_MISMATCH: work schedule legal entity must match the employee legal entity')
      }

      // Close any current open assignment for this person
      const [existing] = await tx
        .select({
          id:                 workScheduleAssignments.id,
          effectiveStartDate: workScheduleAssignments.effectiveStartDate,
        })
        .from(workScheduleAssignments)
        .where(
          and(
            eq(workScheduleAssignments.tenantId, TENANT_ID),
            eq(workScheduleAssignments.personId, data.personId),
            eq(workScheduleAssignments.isCurrent, true),
          ),
        )
        .limit(1)

      if (existing) {
        if (data.effectiveStartDate <= String(existing.effectiveStartDate)) {
          throw new Error('WORK_SCHEDULE_EFFECTIVE_DATE_ORDER: new schedule effectiveStartDate must be after the current schedule start date')
        }
        await tx
          .update(workScheduleAssignments)
          .set({
            effectiveEndDate: addDays(data.effectiveStartDate, -1),
            isCurrent:        false,
            updatedBy:        actor.id,
            updatedByName:    actor.name,
            lastUpdatedDate:  new Date(),
          })
          .where(eq(workScheduleAssignments.id, existing.id))
      }

      // Open new assignment row
      const [inserted] = await tx
        .insert(workScheduleAssignments)
        .values({
          tenantId:           TENANT_ID,
          personId:           data.personId,
          legalEntityId:      person.legalEntityId,
          workScheduleId:     data.workScheduleId,
          assignmentReason:   data.assignmentReason ?? null,
          effectiveStartDate: data.effectiveStartDate,
          effectiveEndDate:   EFFECTIVE_END_OF_TIME,
          isCurrent:          true,
          actionMode:         'UPDATE',
          assignedBy:         actor.id,
          notes:              data.notes ?? null,
          createdBy:          actor.id,
          createdByName:      actor.name,
        })
        .returning({ id: workScheduleAssignments.id })

      await writeAuditLog(
        {
          actorId:       actor.id,
          actorName:     actor.name,
          actorRole:     actor.role,
          actorEntityId: person.legalEntityId,
          channel:       'WEB',
          eventType:     'WORK_SCHEDULE.ASSIGNMENT.CREATED',
          resourceType:  'work_schedule_assignments',
          resourceId:    inserted.id,
          entityId:      person.legalEntityId,
          newValues:     data as unknown as Record<string, unknown>,
          description:   `Work schedule assigned to person ${data.personId}`,
        },
        tx,
      )

      // Sync workerAssignments.workScheduleId so getPersonSchedule (timesheets)
      // immediately reflects the new schedule without needing a separate update.
      await tx
        .update(workerAssignments)
        .set({ workScheduleId: data.workScheduleId })
        .where(
          and(
            eq(workerAssignments.tenantId, TENANT_ID),
            eq(workerAssignments.personId, data.personId),
            eq(workerAssignments.isCurrent, true),
          ),
        )
    })

    revalidatePath('/employees')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'assignWorkSchedule') }
  }
}

// ── correctWorkScheduleAssignment ─────────────────────────────────────────────
// In-place correction: updates the current row without creating history.
// Requires HR_DIRECTOR or SUPER_ADMIN.

export async function correctWorkScheduleAssignment(
  input: CorrectWorkScheduleAssignmentInput,
): Promise<{ error?: string }> {
  try {
    const actor = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
    await requirePermission(actor, 'ASSIGNMENTS', 'edit')
    const data  = CorrectAssignmentSchema.parse(input)

    await db.transaction(async tx => {
      const [current] = await tx
        .select()
        .from(workScheduleAssignments)
        .where(eq(workScheduleAssignments.id, data.assignmentId))
        .limit(1)

      if (!current) throw new Error('Work schedule assignment not found.')
      if (actor.role !== 'SUPER_ADMIN' && actor.legalEntityId !== current.legalEntityId) {
        throw new Error('FORBIDDEN: cross-entity work schedule correction denied')
      }
      if (data.effectiveStartDate && data.effectiveStartDate > todayUae()) {
        throw new Error('WORK_SCHEDULE_FUTURE_DATED_UNSUPPORTED: future-dated work schedule correction requires an activation workflow')
      }

      if (data.workScheduleId) {
        const [schedule] = await tx
          .select({
            id:            workSchedules.id,
            legalEntityId: workSchedules.legalEntityId,
            isActive:      workSchedules.isActive,
          })
          .from(workSchedules)
          .where(and(eq(workSchedules.tenantId, TENANT_ID), eq(workSchedules.id, data.workScheduleId)))
          .limit(1)
        if (!schedule) throw new Error('WORK_SCHEDULE_NOT_FOUND: work schedule not found')
        if (!schedule.isActive) throw new Error('WORK_SCHEDULE_INACTIVE: work schedule is inactive')
        if (schedule.legalEntityId && schedule.legalEntityId !== current.legalEntityId) {
          throw new Error('WORK_SCHEDULE_ENTITY_MISMATCH: work schedule legal entity must match the assignment legal entity')
        }
      }

      const oldValues = { ...current } as unknown as Record<string, unknown>

      await tx
        .update(workScheduleAssignments)
        .set({
          workScheduleId:     data.workScheduleId     ?? current.workScheduleId,
          effectiveStartDate: data.effectiveStartDate ?? current.effectiveStartDate,
          assignmentReason:   data.assignmentReason   !== undefined ? data.assignmentReason : current.assignmentReason,
          notes:              data.notes              !== undefined ? data.notes              : current.notes,
          actionMode:         'CORRECTION',
          correctsRowId:      null,
          updatedBy:          actor.id,
          updatedByName:      actor.name,
          lastUpdatedDate:    new Date(),
        })
        .where(eq(workScheduleAssignments.id, data.assignmentId))

      await writeAuditLog(
        {
          actorId:       actor.id,
          actorName:     actor.name,
          actorRole:     actor.role,
          actorEntityId: current.legalEntityId,
          channel:       'WEB',
          eventType:     'WORK_SCHEDULE.ASSIGNMENT.CORRECTED',
          resourceType:  'work_schedule_assignments',
          resourceId:    data.assignmentId,
          entityId:      current.legalEntityId,
          oldValues,
          newValues:     data as unknown as Record<string, unknown>,
          metadata:      { correctionNote: data.correctionNote },
          description:   `Work schedule assignment corrected for person ${current.personId}`,
        },
        tx,
      )
    })

    revalidatePath('/employees')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'correctWorkScheduleAssignment') }
  }
}

// ── getWorkScheduleAssignmentHistory ─────────────────────────────────────────

export async function getWorkScheduleAssignmentHistory(personId: string) {
  const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'EMPLOYEE'])
  await requirePermission(actor, 'ASSIGNMENTS', 'view')
  const parsedPersonId = z.string().uuid().parse(personId)

  const [person] = await db
    .select({ id: persons.id, legalEntityId: persons.legalEntityId })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, parsedPersonId)))
    .limit(1)
  if (!person) throw new Error('WORK_SCHEDULE_PERSON_NOT_FOUND: person not found')
  const isSelf = actor.personId === parsedPersonId
  if (actor.role === 'EMPLOYEE' && !isSelf) {
    throw new Error('FORBIDDEN: employees may only read their own work schedule history')
  }
  if (actor.role !== 'SUPER_ADMIN' && !isSelf && actor.legalEntityId !== person.legalEntityId) {
    throw new Error('FORBIDDEN: cross-entity work schedule history denied')
  }

  return db
    .select({
      id:                 workScheduleAssignments.id,
      workScheduleId:     workScheduleAssignments.workScheduleId,
      effectiveStartDate: workScheduleAssignments.effectiveStartDate,
      effectiveEndDate:   workScheduleAssignments.effectiveEndDate,
      isCurrent:          workScheduleAssignments.isCurrent,
      actionMode:         workScheduleAssignments.actionMode,
      assignmentReason:   workScheduleAssignments.assignmentReason,
      createdDate:        workScheduleAssignments.createdDate,
    })
    .from(workScheduleAssignments)
    .where(
      and(
        eq(workScheduleAssignments.tenantId, TENANT_ID),
        eq(workScheduleAssignments.personId, parsedPersonId),
      ),
    )
    .orderBy(workScheduleAssignments.effectiveStartDate)
}
