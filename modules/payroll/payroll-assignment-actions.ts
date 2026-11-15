'use server'

import { db } from '@/lib/db'
import { payrollAssignments, payrollDefinitions } from '@/drizzle/schema'
import { eq, and } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { requireRole } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { addDays, EFFECTIVE_END_OF_TIME } from '@/lib/effective-date'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getErrorMessage } from '@/lib/app-error'
import { isPayrollWorkstreamEnabled, PAYROLL_DISABLED_MESSAGE } from '@/lib/features/payroll-feature-gate'

// ── Schemas ───────────────────────────────────────────────────────────────────

const PAYROLL_GROUPS = ['STANDARD', 'EXECUTIVE', 'HOURLY', 'DAILY'] as const

const AssignPayrollSchema = z.object({
  personId:           z.string().uuid(),
  legalEntityId:      z.string().uuid(),
  payrollId:          z.string().uuid(),
  payrollGroup:       z.enum(PAYROLL_GROUPS).default('STANDARD'),
  effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  changeReason:       z.string().max(200).optional().nullable(),
  notes:              z.string().max(2000).optional().nullable(),
})

export type AssignPayrollInput = z.infer<typeof AssignPayrollSchema>

const CorrectPayrollAssignmentSchema = z.object({
  assignmentId:       z.string().uuid(),
  correctionNote:     z.string().min(1).max(1000),
  payrollId:          z.string().uuid().optional(),
  payrollGroup:       z.enum(PAYROLL_GROUPS).optional(),
  effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  changeReason:       z.string().max(200).optional().nullable(),
  notes:              z.string().max(2000).optional().nullable(),
})

export type CorrectPayrollAssignmentInput = z.infer<typeof CorrectPayrollAssignmentSchema>

// ── assignToPayroll ───────────────────────────────────────────────────────────
// Business event: close current payroll assignment + open new one.
// Triggered when employee moves between payroll groups (e.g., standard → executive).

export async function assignToPayroll(
  input: AssignPayrollInput,
): Promise<{ error?: string }> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data  = AssignPayrollSchema.parse(input)

    // Verify payroll definition exists
    const [payroll] = await db
      .select({ id: payrollDefinitions.id, payrollNameEn: payrollDefinitions.payrollNameEn })
      .from(payrollDefinitions)
      .where(and(eq(payrollDefinitions.id, data.payrollId), eq(payrollDefinitions.tenantId, TENANT_ID)))
      .limit(1)

    if (!payroll) throw new Error('Payroll definition not found.')

    await db.transaction(async tx => {
      // Close the current open payroll assignment
      const [existing] = await tx
        .select({ id: payrollAssignments.id })
        .from(payrollAssignments)
        .where(
          and(
            eq(payrollAssignments.tenantId, TENANT_ID),
            eq(payrollAssignments.personId, data.personId),
            eq(payrollAssignments.isCurrent, true),
          ),
        )
        .limit(1)

      if (existing) {
        await tx
          .update(payrollAssignments)
          .set({
            effectiveEndDate: addDays(data.effectiveStartDate, -1),
            isCurrent:        false,
            updatedBy:        actor.id,
            updatedByName:    actor.name,
            lastUpdatedDate:  new Date(),
          })
          .where(eq(payrollAssignments.id, existing.id))
      }

      // Open new payroll assignment row
      const [inserted] = await tx
        .insert(payrollAssignments)
        .values({
          tenantId:           TENANT_ID,
          personId:           data.personId,
          legalEntityId:      data.legalEntityId,
          payrollId:          data.payrollId,
          payrollGroup:       data.payrollGroup,
          changeReason:       data.changeReason ?? null,
          effectiveStartDate: data.effectiveStartDate,
          effectiveEndDate:   EFFECTIVE_END_OF_TIME,
          isCurrent:          true,
          actionMode:         'UPDATE',
          changedBy:          actor.id,
          notes:              data.notes ?? null,
          createdBy:          actor.id,
          createdByName:      actor.name,
        })
        .returning({ id: payrollAssignments.id })

      await writeAuditLog(
        {
          actorId:       actor.id,
          actorName:     actor.name,
          actorRole:     actor.role,
          actorEntityId: data.legalEntityId,
          channel:       'WEB',
          eventType:     'PAYROLL.ASSIGNMENT.CREATED',
          resourceType:  'payroll_assignments',
          resourceId:    inserted.id,
          entityId:      data.legalEntityId,
          newValues:     { ...data, payrollName: payroll.payrollNameEn } as unknown as Record<string, unknown>,
          description:   `Payroll assignment created: person ${data.personId} → ${payroll.payrollNameEn} (${data.payrollGroup})`,
        },
        tx,
      )
    })

    revalidatePath('/employees')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'assignToPayroll') }
  }
}

// ── correctPayrollAssignment ──────────────────────────────────────────────────
// In-place correction: updates current row without creating history.
// Requires HR_DIRECTOR or SUPER_ADMIN.

export async function correctPayrollAssignment(
  input: CorrectPayrollAssignmentInput,
): Promise<{ error?: string }> {
  try {
    // Payroll workstream feature gate (defence-in-depth, additional to RBAC).
    if (!isPayrollWorkstreamEnabled()) return { error: PAYROLL_DISABLED_MESSAGE }
    const actor = await requireRole(['HR_DIRECTOR', 'SUPER_ADMIN'])
    const data  = CorrectPayrollAssignmentSchema.parse(input)

    await db.transaction(async tx => {
      const [current] = await tx
        .select()
        .from(payrollAssignments)
        .where(eq(payrollAssignments.id, data.assignmentId))
        .limit(1)

      if (!current) throw new Error('Payroll assignment not found.')

      const oldValues = { ...current } as unknown as Record<string, unknown>

      await tx
        .update(payrollAssignments)
        .set({
          payrollId:          data.payrollId          ?? current.payrollId,
          payrollGroup:       data.payrollGroup       ?? current.payrollGroup,
          effectiveStartDate: data.effectiveStartDate ?? current.effectiveStartDate,
          changeReason:       data.changeReason       !== undefined ? data.changeReason : current.changeReason,
          notes:              data.notes              !== undefined ? data.notes         : current.notes,
          actionMode:         'CORRECTION',
          correctsRowId:      null,
          updatedBy:          actor.id,
          updatedByName:      actor.name,
          lastUpdatedDate:    new Date(),
        })
        .where(eq(payrollAssignments.id, data.assignmentId))

      await writeAuditLog(
        {
          actorId:       actor.id,
          actorName:     actor.name,
          actorRole:     actor.role,
          actorEntityId: current.legalEntityId,
          channel:       'WEB',
          eventType:     'PAYROLL.ASSIGNMENT.CORRECTED',
          resourceType:  'payroll_assignments',
          resourceId:    data.assignmentId,
          entityId:      current.legalEntityId,
          oldValues,
          newValues:     data as unknown as Record<string, unknown>,
          metadata:      { correctionNote: data.correctionNote },
          description:   `Payroll assignment corrected for person ${current.personId}`,
        },
        tx,
      )
    })

    revalidatePath('/employees')
    return {}
  } catch (err) {
    return { error: getErrorMessage(err, 'correctPayrollAssignment') }
  }
}

// ── getPayrollAssignmentHistory ───────────────────────────────────────────────

export async function getPayrollAssignmentHistory(personId: string) {
  return db
    .select({
      id:                 payrollAssignments.id,
      payrollId:          payrollAssignments.payrollId,
      payrollNameEn:      payrollDefinitions.payrollNameEn,
      payrollNameAr:      payrollDefinitions.payrollNameAr,
      payrollGroup:       payrollAssignments.payrollGroup,
      effectiveStartDate: payrollAssignments.effectiveStartDate,
      effectiveEndDate:   payrollAssignments.effectiveEndDate,
      isCurrent:          payrollAssignments.isCurrent,
      actionMode:         payrollAssignments.actionMode,
      changeReason:       payrollAssignments.changeReason,
      createdDate:        payrollAssignments.createdDate,
    })
    .from(payrollAssignments)
    .leftJoin(payrollDefinitions, eq(payrollAssignments.payrollId, payrollDefinitions.id))
    .where(
      and(
        eq(payrollAssignments.tenantId, TENANT_ID),
        eq(payrollAssignments.personId, personId),
      ),
    )
    .orderBy(payrollAssignments.effectiveStartDate)
}
