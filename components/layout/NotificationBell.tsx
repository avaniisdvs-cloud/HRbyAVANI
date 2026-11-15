import { and, count, desc, eq, ne } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notificationLog } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { resolveLocale } from '@/lib/language-preference'
import { NotificationBellClient } from './NotificationBellClient'

/**
 * S6-07 — Notification bell (Server Component shell).
 *
 * Fetches the latest 10 notifications + unread count for the signed-in
 * user (`session.user.personId`) and hands off to the Client Component
 * that renders the dropdown and wires the mark-as-read Server Action.
 *
 * Renders nothing if the session lacks a `personId` (e.g. fresh SSO user
 * without a person record yet).
 */
export async function NotificationBell() {
  const session = await auth()
  const personId = session?.user?.personId
  if (!personId) return null

  const locale = await resolveLocale(personId)

  const [recent, [{ unread }]] = await Promise.all([
    db
      .select({
        id:        notificationLog.id,
        subjectEn: notificationLog.subjectEn,
        subjectAr: notificationLog.subjectAr,
        bodyEn:    notificationLog.bodyEn,
        bodyAr:    notificationLog.bodyAr,
        type:      notificationLog.notificationType,
        status:    notificationLog.status,
        createdAt: notificationLog.createdDate,
        referenceType: notificationLog.referenceType,
        referenceId:   notificationLog.referenceId,
      })
      .from(notificationLog)
      .where(and(
        eq(notificationLog.tenantId,          TENANT_ID),
        eq(notificationLog.recipientPersonId, personId),
      ))
      .orderBy(desc(notificationLog.createdDate))
      .limit(10),
    db
      .select({ unread: count() })
      .from(notificationLog)
      .where(and(
        eq(notificationLog.tenantId,          TENANT_ID),
        eq(notificationLog.recipientPersonId, personId),
        // S6-Q5 fix — anything not READ counts as unread. Tighter and
        // future-proof: a new status value (e.g. 'BOUNCED') auto-counts
        // as unread until explicitly read by the user.
        ne(notificationLog.status, 'READ'),
      )),
  ])

  return (
    <NotificationBellClient
      unread={unread}
      locale={locale}
      items={recent.map(r => ({
        id:        r.id,
        subjectEn: r.subjectEn ?? '—',
        subjectAr: r.subjectAr ?? '',
        bodyEn:    r.bodyEn ?? '',
        bodyAr:    r.bodyAr ?? '',
        type:      r.type,
        isRead:    r.status === 'READ',
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }))}
    />
  )
}
