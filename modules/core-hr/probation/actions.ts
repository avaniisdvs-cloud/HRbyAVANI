'use server'

/**
 * P2-4 — Probation Confirmation Server Actions.
 *
 * confirmProbation — HR/Manager confirms employee passed, extends, or fails probation.
 * Updates persons.probation_status and optionally sets a new probation_end_date.
 *
 * Hard Rule 1: every DB write + audit in same transaction.
 * Hard Rule 3: no deletes — status transitions only.
 */
import { translateError } from '@/lib/app-error'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { persons } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { revalidatePath } from 'next/cache'

const ConfirmProbationSchema = z.object({
  personId:   z.string().uuid(),
  decision:   z.enum(['CONFIRMED', 'EXTENDED', 'FAILED']),
  newEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // required if EXTENDED
  reason:     z.string().max(500).optional(),
})

export type ConfirmProbationInput = z.infer<typeof ConfirmProbationSchema>

export async function confirmProbation(
  input: ConfirmProbationInput,
): Promise<void> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'SUPER_ADMIN'])
    const data = ConfirmProbationSchema.parse(input)

    if (data.decision === 'EXTENDED' && !data.newEndDate) {
      throw new Error('newEndDate is required when decision is EXTENDED')
    }

    await db.transaction(async tx => {
      const [person] = await tx
        .select({
          id:              persons.id,
          legalEntityId:   persons.legalEntityId,
          probationStatus: persons.probationStatus,
          probationEndDate:persons.probationEndDate,
        })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))
        .limit(1)

      if (!person) throw new Error('person not found')
      if (person.probationStatus !== 'ACTIVE') {
        throw new Error(`Probation already resolved: status is ${person.probationStatus}`)
      }
      if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== person.legalEntityId) {
        throw new Error('FORBIDDEN: cross-entity probation update not allowed')
      }

      await tx
        .update(persons)
        .set({
          probationStatus:  data.decision,
          ...(data.decision === 'EXTENDED' && { probationEndDate: data.newEndDate! }),
          updatedBy:        user.id,
          updatedByName:    user.name,
          updatedDate:      new Date(),
          lastUpdatedDate:  new Date(),
        })
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, data.personId)))

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: person.legalEntityId ?? '',
        channel:       'WEB',
        eventType:     `PROBATION.${data.decision}`,
        resourceType:  'persons',
        resourceId:    data.personId,
        entityId:      person.legalEntityId ?? '',
        newValues: {
          decision:    data.decision,
          newEndDate:  data.newEndDate ?? null,
          reason:      data.reason ?? null,
          previousEndDate: person.probationEndDate,
        },
      }, tx)
    })

    revalidatePath('/admin/probation')
    revalidatePath(`/persons/${data.personId}`)
  } catch (e) { translateError(e, 'confirmProbation') }
}
