'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell } from 'lucide-react'
import { getUnreadCount } from '@/modules/notification'
import { NotificationPanel } from './NotificationPanel'

interface Props {
  initialCount: number
  personId:     string
  tenantId:     string
}

export function NotificationBell({ initialCount, personId, tenantId }: Props) {
  const [open, setOpen]   = useState(false)
  const [count, setCount] = useState(initialCount)
  const wrapperRef        = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const n = await getUnreadCount(personId, tenantId)
      setCount(n)
    } catch {
      // silent — stale count is acceptable
    }
  }, [personId, tenantId])

  useEffect(() => {
    refresh() // fetch real count immediately on mount — don't wait 60s
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function handleClose() {
    setOpen(false)
    refresh()
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}
        onClick={() => setOpen(o => !o)}
        style={{
          width: 36, height: 36, borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--card)', cursor: 'pointer',
          display: 'grid', placeItems: 'center',
          color: 'var(--ink-2)', position: 'relative', flexShrink: 0,
          transition: 'background 120ms',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--card)')}
      >
        <Bell size={18} strokeWidth={1.75} aria-hidden />
        {count > 0 && (
          <span
            aria-hidden
            style={{
              position: 'absolute', top: 5, right: 6,
              minWidth: 16, height: 16,
              borderRadius: 8, padding: '0 4px',
              background: 'var(--status-rejected-fg)',
              border: '2px solid var(--card)',
              color: 'var(--card)',
              fontSize: 'var(--text-caption)', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, fontFamily: 'var(--font-sans)',
            }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <NotificationPanel
          personId={personId}
          tenantId={tenantId}
          onClose={handleClose}
          onCountChange={setCount}
        />
      )}
    </div>
  )
}
