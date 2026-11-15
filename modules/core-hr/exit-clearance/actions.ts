'use server'

/**
 * P2-3 — Exit Clearance Server Actions.
 *
 * completeOffboardingItem — marks a checklist item as COMPLETED.
 * waiveOffboardingItem    — marks a checklist item as WAIVED (with mandatory reason).
 *
 * Both update the parent checklist completionPct.
 * Hard Rule 1: every DB write + audit in same transaction.
 * Hard Rule 3: no deletes — status transitions only.
 */
import { translateError } from '@/lib/app-error'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { onboardingChecklistItems, onboardingChecklists } from '@/drizzle/schema'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { revalidatePath } from 'next/cache'

const CompleteItemSchema = z.object({
  itemId: z.string().uuid(),
  notes:  z.string().max(500).optional(),
})

const WaiveItemSchema = z.object({
  itemId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required').max(500),
})

export async function completeOffboardingItem(input: z.infer<typeof CompleteItemSchema>): Promise<void> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'PAYROLL_ADMIN', 'SUPER_ADMIN'])
    const data = CompleteItemSchema.parse(input)

    await db.transaction(async tx => {
      const [item] = await tx
        .select({
          id:          onboardingChecklistItems.id,
          checklistId: onboardingChecklistItems.checklistId,
          status:      onboardingChecklistItems.status,
        })
        .from(onboardingChecklistItems)
        .where(and(eq(onboardingChecklistItems.tenantId, TENANT_ID), eq(onboardingChecklistItems.id, data.itemId)))
        .limit(1)

      if (!item) throw new Error('checklist item not found')
      if (item.status === 'COMPLETED') throw new Error('item is already completed')

      const today = new Date().toISOString().split('T')[0]

      await tx
        .update(onboardingChecklistItems)
        .set({
          status:        'COMPLETED',
          completedBy:   user.id,
          completedDate: today,
          notes:         data.notes ?? null,
          updatedBy:     user.id,
          updatedByName: user.name,
          updatedDate:   new Date(),
          lastUpdatedDate: new Date(),
        })
        .where(eq(onboardingChecklistItems.id, item.id))

      await recalcChecklistPct(tx, item.checklistId, user)

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: '',
        channel:       'WEB',
        eventType:     'EXIT_CLEARANCE.ITEM_COMPLETED',
        resourceType:  'onboarding_checklist_items',
        resourceId:    item.id,
        entityId:      '',
        newValues:     { status: 'COMPLETED', notes: data.notes ?? null },
      }, tx)
    })

    revalidatePath('/admin/exit-clearance')
  } catch (e) { translateError(e, 'completeOffboardingItem') }
}

export async function waiveOffboardingItem(input: z.infer<typeof WaiveItemSchema>): Promise<void> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    const data = WaiveItemSchema.parse(input)

    await db.transaction(async tx => {
      const [item] = await tx
        .select({
          id:          onboardingChecklistItems.id,
          checklistId: onboardingChecklistItems.checklistId,
          status:      onboardingChecklistItems.status,
          isMandatory: onboardingChecklistItems.isMandatory,
        })
        .from(onboardingChecklistItems)
        .where(and(eq(onboardingChecklistItems.tenantId, TENANT_ID), eq(onboardingChecklistItems.id, data.itemId)))
        .limit(1)

      if (!item) throw new Error('checklist item not found')
      if (item.status === 'COMPLETED') throw new Error('cannot waive a completed item')
      if (item.status === 'WAIVED') throw new Error('item is already waived')
      if (item.isMandatory) throw new Error('mandatory items cannot be waived')

      await tx
        .update(onboardingChecklistItems)
        .set({
          status:          'WAIVED',
          notes:           data.reason,
          updatedBy:       user.id,
          updatedByName:   user.name,
          updatedDate:     new Date(),
          lastUpdatedDate: new Date(),
        })
        .where(eq(onboardingChecklistItems.id, item.id))

      await recalcChecklistPct(tx, item.checklistId, user)

      await writeAuditLog({
        actorId:       user.id,
        actorName:     user.name,
        actorRole:     user.role,
        actorEntityId: '',
        channel:       'WEB',
        eventType:     'EXIT_CLEARANCE.ITEM_WAIVED',
        resourceType:  'onboarding_checklist_items',
        resourceId:    item.id,
        entityId:      '',
        newValues:     { status: 'WAIVED', reason: data.reason },
      }, tx)
    })

    revalidatePath('/admin/exit-clearance')
  } catch (e) { translateError(e, 'waiveOffboardingItem') }
}

// Recalculates completion % and auto-marks checklist COMPLETED when all items done/waived.
async function recalcChecklistPct(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  checklistId: string,
  user: { id: string; name: string },
) {
  const items = await tx
    .select({ status: onboardingChecklistItems.status })
    .from(onboardingChecklistItems)
    .where(and(eq(onboardingChecklistItems.tenantId, TENANT_ID), eq(onboardingChecklistItems.checklistId, checklistId)))

  const total     = items.length
  const doneCount = items.filter(i => i.status === 'COMPLETED' || i.status === 'WAIVED').length
  const pct       = total > 0 ? Math.round((doneCount / total) * 100) : 0
  const allDone   = pct === 100

  await tx
    .update(onboardingChecklists)
    .set({
      completionPct:  pct,
      status:         allDone ? 'COMPLETED' : 'IN_PROGRESS',
      completionDate: allDone ? new Date().toISOString().split('T')[0] : null,
      updatedBy:      user.id,
      updatedByName:  user.name,
      updatedDate:    new Date(),
      lastUpdatedDate: new Date(),
    })
    .where(and(eq(onboardingChecklists.tenantId, TENANT_ID), eq(onboardingChecklists.id, checklistId)))
}
