'use server'

/**
 * notification Server Actions.
 *
 * S6-07 — `markNotificationRead`: flips notification_log.status → READ
 * and stamps `read_at` for the bell dropdown. Auth-gated to the
 * notification's recipient (or SUPER_ADMIN for diagnostics).
 *
 * Hard Rule 1 — every write is in a Drizzle tx with a paired audit row.
 */
import { translateError } from '@/lib/app-error'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notificationLog } from '@/drizzle/schema'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'

const MarkReadInput = z.object({
  notificationId: z.string().uuid(),
})

export async function markNotificationRead(
  input: z.infer<typeof MarkReadInput>,
): Promise<{ id: string; alreadyRead: boolean }> {
  try {
    const session = await auth()
    if (!session?.user) throw new Error('unauthenticated')

  const { notificationId } = MarkReadInput.parse(input)

  // Pull row first so we can entity-scope and fail fast.
  const [row] = await db
    .select({
      id:                notificationLog.id,
      recipientPersonId: notificationLog.recipientPersonId,
      status:            notificationLog.status,
      legalEntityId:     notificationLog.legalEntityId,
    })
    .from(notificationLog)
    .where(and(
      eq(notificationLog.tenantId, TENANT_ID),
      eq(notificationLog.id,       notificationId),
    ))
    .limit(1)
  if (!row) throw new Error('notification not found')

  // Recipient-only (or SUPER_ADMIN) per privacy rules.
  if (
    session.user.role !== 'SUPER_ADMIN'
    && row.recipientPersonId !== session.user.personId
  ) {
    throw new Error('forbidden')
  }

  if (row.status === 'READ') {
    return { id: row.id, alreadyRead: true }
  }

  await db.transaction(async tx => {
    await tx
      .update(notificationLog)
      .set({
        status:           'READ',
        readAt:           new Date(),
        lastUpdatedDate:  new Date(),
        updatedBy:        session.user.id,
        updatedByName:    session.user.name ?? session.user.email ?? 'unknown',
      })
      .where(and(
        eq(notificationLog.tenantId, TENANT_ID),
        eq(notificationLog.id,       row.id),
        isNull(notificationLog.readAt),
      ))

    await writeAuditLog({
      actorId:       session.user.id,
      actorName:     session.user.name ?? session.user.email ?? 'unknown',
      actorRole:     session.user.role,
      actorEntityId: session.user.legalEntityId ?? undefined,
      channel:       'WEB',
      eventType:     'NOTIFICATION.MARKED_READ',
      resourceType:  'notification_log',
      resourceId:    row.id,
      entityId:      row.legalEntityId ?? undefined,
    }, tx)
  })

    return { id: row.id, alreadyRead: false }
  } catch (e) { translateError(e, 'markNotificationRead') }
}
