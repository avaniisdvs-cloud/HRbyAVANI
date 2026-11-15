'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { markNotificationRead } from '@/modules/notification'
import { type Locale } from '@/lib/i18n'

export interface NotificationItem {
  id:        string
  subjectEn: string
  subjectAr: string
  bodyEn:    string
  bodyAr:    string
  type:      string
  isRead:    boolean
  createdAt: string
}

/**
 * S6-07 — Notification bell (Client side).
 *
 * Renders the trigger + dropdown. Mark-as-read fires the Server Action
 * via `useTransition` so the icon stays interactive while the audit row
 * commits. After the action returns we `router.refresh()` so the next
 * server-rendered count reflects reality (avoids local-state drift).
 */
export function NotificationBellClient({
  unread,
  items,
  locale = 'en',
}: {
  unread: number
  items:  NotificationItem[]
  locale?: Locale
}) {
  const [open, setOpen]       = useState(false)
  const [pending, start]      = useTransition()
  const [localRead, setRead]  = useState<Set<string>>(new Set())
  const router                = useRouter()
  const wrapperRef            = useRef<HTMLDivElement>(null)

  // Click-outside to close.
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function onItemClick(id: string) {
    if (localRead.has(id) || items.find(i => i.id === id)?.isRead) return
    setRead(prev => new Set(prev).add(id))
    start(async () => {
      try {
        await markNotificationRead({ notificationId: id })
        router.refresh()
      } catch {
        // Roll back the optimistic flip if the server rejected.
        setRead(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    })
  }

  const visibleUnread = Math.max(0, unread - localRead.size)

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${locale === 'ar' ? 'إشعارات' : 'Notifications'}${visibleUnread > 0 ? ` (${visibleUnread})` : ''}`}
        onClick={() => setOpen(o => !o)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-ink-2 transition-colors hover:bg-accent-100 hover:text-accent-700 focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {visibleUnread > 0 && (
          <span
            className="absolute -end-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-primary-foreground"
            aria-hidden
          >
            {visibleUnread > 99 ? '99+' : visibleUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          // S6-Q12 fix — dropped `role="menu"` in favour of native button
          // semantics. ARIA Authoring Practices §3.21 requires arrow-key
          // navigation + focus trapping for a strict menu role; for an
          // in-app bell the keyboard tab order through `<button>` siblings
          // is the inclusive-components-recommended pattern.
          className="absolute end-0 z-20 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-md border border-border bg-card shadow-lg"
        >
          <header className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-medium text-ink-1">
              {locale === 'ar' ? 'إشعارات' : 'Notifications'}
            </span>
          </header>
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-ink-3">
              {locale === 'ar' ? 'لا توجد إشعارات.' : 'No notifications.'}
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-border">
              {items.map(item => {
                const isRead = item.isRead || localRead.has(item.id)
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onItemClick(item.id)}
                      disabled={pending}
                      className={`block w-full px-3 py-2.5 text-start transition-colors hover:bg-surface ${
                        isRead ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className={`truncate text-sm ${isRead ? 'text-ink-2' : 'font-medium text-ink-1'}`}>
                            {item.subjectEn}
                          </div>
                          {item.subjectAr && (
                            <div className="truncate text-xs text-ink-3" dir="rtl" lang="ar">
                              {item.subjectAr}
                            </div>
                          )}
                          <div className="mt-0.5 font-mono text-xs text-ink-3">
                            {item.createdAt.slice(0, 10)} · {item.type}
                          </div>
                        </div>
                        {!isRead && (
                          <span
                            className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent"
                            aria-label="unread"
                          />
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
