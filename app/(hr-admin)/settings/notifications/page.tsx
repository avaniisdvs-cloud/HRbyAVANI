import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getNotificationTemplates } from '@/modules/config'
import { Badge } from '@/components/ui/badge'
import { NotificationEditForm } from './NotificationEditForm'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'Notification templates · AVANIIS HR' }

/**
 * S10-04 — Notification template editor (Server Component).
 *
 * Lists all notification_templates rows grouped by eventType. Each row
 * shows the channel, language, bilingual subject preview, and an inline
 * edit button (Client Component) that calls updateNotificationTemplate.
 */
export default async function NotificationTemplatesPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  const locale = await resolveLocale(session.user.personId)
  const templates = await getNotificationTemplates()

  const grouped = templates.reduce<Record<string, typeof templates>>((acc, t) => {
    acc[t.eventType] ??= []
    acc[t.eventType].push(t)
    return acc
  }, {})

  const channelBadge: Record<string, string> = {
    EMAIL: 'text-accent',
    PUSH:  'text-ink-2',
    IN_APP: 'text-ink-3',
    SMS:   'text-accent-700',
  }

  return (
    <div className="page-in">
      <div>
        <h1 className="font-serif text-2xl text-ink-1">{locale === 'ar' ? 'قوالب الإشعارات' : 'Notification templates'}</h1>
        <p className="mt-1 text-sm text-ink-3">
          Bilingual email and push templates. Use <span className="font-mono text-ink-2">{'{{variable}}'}</span> placeholders.
        </p>
      </div>

      {Object.entries(grouped).map(([eventType, rows]) => (
        <div key={eventType} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-sans text-sm font-semibold text-ink-1">{eventType}</h2>
              <Badge variant="outline" className="text-xs">{rows.length} template{rows.length !== 1 ? 's' : ''}</Badge>
            </header>
            <div className="divide-y divide-border">
              {rows.map(t => (
                <div key={t.id} className="px-5 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${channelBadge[t.channel] ?? 'text-ink-3'}`}>
                        {t.channel}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{t.language.toUpperCase()}</Badge>
                      {t.recipientRoles.map(r => (
                        <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                      ))}
                      {!t.isActive && <Badge variant="destructive" className="text-xs">INACTIVE</Badge>}
                    </div>
                    <NotificationEditForm template={t} />
                  </div>
                  <p className="mt-2 font-medium text-sm text-ink-1">{t.subjectEn ?? t.templateNameEn}</p>
                  {t.subjectAr && (
                    <p className="mt-0.5 text-xs text-ink-3" dir="rtl" lang="ar">{t.subjectAr}</p>
                  )}
                  <p className="mt-1.5 line-clamp-2 text-xs text-ink-3">{t.bodyEn}</p>
                </div>
              ))}
            </div>
        </div>
      ))}

      {Object.keys(grouped).length === 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div className="px-5 py-8 text-center text-sm text-ink-3">
            No notification templates seeded yet.
          </div>
        </div>
      )}
    </div>
  )
}
