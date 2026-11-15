'use client'

import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal, Pencil, Clock, Ban, RotateCcw } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MdmRowMenuProps {
  isActive:         boolean
  onEdit:           () => void
  onHistory:        () => void
  onDisable:        () => void
  onEnable:         () => void
  isPending?:       boolean
  /** Disable (grey out) the Disable item — e.g. BR-POS-003: occupied position */
  canDisable?:      boolean
  /** Tooltip shown when canDisable is false */
  canDisableTitle?: string
  /** Hide the Enable / Disable option entirely — e.g. system / statutory records */
  noToggle?:        boolean
}

// ── Shared item style ─────────────────────────────────────────────────────────

const menuItemBase: React.CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        8,
  width:      '100%',
  padding:    '8px 14px',
  border:     'none',
  background: 'transparent',
  fontSize:   'var(--text-body)',
  color:      'var(--ink-1)',
  cursor:     'pointer',
  textAlign:  'left',
  whiteSpace: 'nowrap',
}

// ── Anchor rect (viewport-relative position of the trigger button) ─────────────

interface AnchorRect {
  top:    number
  bottom: number
  right:  number
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MdmRowMenu({
  isActive,
  onEdit,
  onHistory,
  onDisable,
  onEnable,
  isPending       = false,
  canDisable      = true,
  canDisableTitle,
  noToggle        = false,
}: MdmRowMenuProps) {
  const locale = useLocale()
  const [open,       setOpen]       = useState(false)
  const [anchor,     setAnchor]     = useState<AnchorRect | null>(null)
  const btnRef                      = useRef<HTMLButtonElement>(null)
  const panelRef                    = useRef<HTMLDivElement>(null)

  // ── Close on outside click (covers both trigger and fixed panel) ───────────
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node
      const inBtn   = btnRef.current?.contains(target)  ?? false
      const inPanel = panelRef.current?.contains(target) ?? false
      if (!inBtn && !inPanel) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  // ── Close on scroll (fixed panel would drift away from button) ─────────────
  useEffect(() => {
    if (open) {
      const close = () => setOpen(false)
      window.addEventListener('scroll', close, { capture: true, passive: true })
      return () => window.removeEventListener('scroll', close, { capture: true })
    }
  }, [open])

  // ── Toggle open / compute anchor rect ─────────────────────────────────────
  function handleToggle() {
    if (open) {
      setOpen(false)
      return
    }
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setAnchor({ top: r.top, bottom: r.bottom, right: r.right })
    }
    setOpen(true)
  }

  // ── Viewport geometry ─────────────────────────────────────────────────────
  const openUp       = anchor != null && (window.innerHeight - anchor.bottom) < 180
  const rightOffset  = anchor != null ? window.innerWidth - anchor.right : 0
  const topOffset    = anchor != null ? (openUp ? undefined : anchor.bottom + 4) : 0
  const bottomOffset = anchor != null && openUp ? (window.innerHeight - anchor.top + 4) : undefined

  return (
    <>
      {/* Trigger button */}
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        aria-label={locale === 'ar' ? 'إجراءات الصف' : 'Row actions'}
        style={{
          width:          32,
          height:         32,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          border:         '1px solid var(--border)',
          borderRadius:   7,
          background:     open ? 'var(--surface)' : 'transparent',
          cursor:         isPending ? 'not-allowed' : 'pointer',
          color:          'var(--ink-2)',
          transition:     'background 0.12s',
        }}
      >
        <MoreHorizontal size={16} strokeWidth={1.75} />
      </button>

      {/* Dropdown panel — position:fixed so it escapes overflow:hidden ancestors */}
      {open && anchor && (
        <div
          ref={panelRef}
          style={{
            position:     'fixed',
            right:        rightOffset,
            top:          topOffset,
            bottom:       bottomOffset,
            background:   'var(--card)',
            border:       '1px solid var(--border)',
            borderRadius: 10,
            boxShadow:    '0 8px 24px rgba(0,0,0,0.16)',
            zIndex:       9999,
            minWidth:     178,
            overflow:     'hidden',
            padding:      '4px 0',
          }}
        >
          {/* Edit */}
          <button
            type="button"
            style={menuItemBase}
            onClick={() => { setOpen(false); onEdit() }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Pencil size={14} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />
            {tk(locale, 'common.edit')}
          </button>

          {/* Audit History */}
          <button
            type="button"
            style={menuItemBase}
            onClick={() => { setOpen(false); onHistory() }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Clock size={14} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
            {locale === 'ar' ? 'سجل التدقيق' : 'Audit History'}
          </button>

          {/* Divider + Enable / Disable */}
          {!noToggle && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              {isActive ? (
                <button
                  type="button"
                  disabled={!canDisable}
                  title={!canDisable ? canDisableTitle : undefined}
                  style={{
                    ...menuItemBase,
                    color:  canDisable ? '#c62828' : 'var(--ink-4)',
                    cursor: canDisable ? 'pointer'  : 'not-allowed',
                  }}
                  onClick={() => { if (canDisable) { setOpen(false); onDisable() } }}
                  onMouseEnter={e => { if (canDisable) e.currentTarget.style.background = '#fce4e4' }}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <Ban size={14} style={{ flexShrink: 0 }} />
                  {locale === 'ar' ? 'تعطيل' : 'Disable'}
                </button>
              ) : (
                <button
                  type="button"
                  style={{ ...menuItemBase, color: 'var(--brand-active)' }}
                  onClick={() => { setOpen(false); onEnable() }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <RotateCcw size={14} style={{ flexShrink: 0 }} />
                  {locale === 'ar' ? 'تفعيل' : 'Enable'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
