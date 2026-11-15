'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'

/** Selects all focusable elements inside a container that are not disabled. */
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(el => !el.closest('[aria-hidden="true"]'))
}

interface MdmDrawerProps {
  open:     boolean
  onClose:  () => void
  titleEn:  string
  titleAr:  string
  children: React.ReactNode
  footer?:  React.ReactNode
  width?:   number
}

export function MdmDrawer({
  open,
  onClose,
  titleEn,
  titleAr,
  children,
  footer,
  width = 560,
}: MdmDrawerProps) {
  const locale = useLocale()
  const dirtyRef = useRef(false)
  const requestClose = useCallback(() => {
    if (dirtyRef.current && !window.confirm(locale === 'ar' ? 'تجاهل التغييرات غير المحفوظة؟' : 'Discard unsaved changes?')) return
    onClose()
  }, [onClose, locale])
  useEffect(() => { if (open) dirtyRef.current = false }, [open])
  const overlayRef   = useRef<HTMLDivElement>(null)
  const dialogRef    = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  // ── Escape key ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose()
    }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, requestClose])

  // ── Body scroll lock ───────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // ── Auto-focus first focusable element; restore on close ──────────────────
  useEffect(() => {
    if (open) {
      // Save the element that had focus before the drawer opened
      prevFocusRef.current = document.activeElement as HTMLElement | null
      // Focus first focusable element inside the drawer (Close button is first)
      const panel = dialogRef.current
      if (panel) {
        const items = getFocusable(panel)
        if (items.length > 0) items[0].focus()
      }
    } else {
      // Restore focus to the trigger element when drawer closes
      prevFocusRef.current?.focus()
      prevFocusRef.current = null
    }
  }, [open])

  // ── Focus trap: Tab / Shift+Tab stays within the drawer ───────────────────
  useEffect(() => {
    if (!open) return
    function onTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const panel = dialogRef.current
      if (!panel) return
      const items = getFocusable(panel)
      if (items.length === 0) return
      const first = items[0]
      const last  = items[items.length - 1]
      if (e.shiftKey) {
        // Shift+Tab on first element → wrap to last
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        // Tab on last element → wrap to first
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onTab)
    return () => document.removeEventListener('keydown', onTab)
  }, [open])

  if (!open) return null

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 400 }}>
      {/* Overlay */}
      <div
        ref={overlayRef}
        onClick={requestClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}
      />

      {/* Panel */}
      <div
        ref={dialogRef}
        onChangeCapture={() => { dirtyRef.current = true }}
        style={{
          position: 'absolute',
          top: 0,
          insetInlineEnd: 0,
          bottom: 0,
          width,
          maxWidth: '100vw',
          background: 'var(--card)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
          animation: 'slideInRight 220ms ease',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={locale === 'ar' ? titleAr : titleEn}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--ink-1)',
              margin: 0,
              letterSpacing: '-0.3px',
            }}>
              {titleEn}
            </h2>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl', display: 'block', marginTop: 2 }}>
              {titleAr}
            </span>
          </div>
          <button
            onClick={requestClose}
            style={{
              width: 32, height: 32,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-3)',
              flexShrink: 0,
            }}
            aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '16px 24px',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            flexShrink: 0,
            background: 'var(--card)',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
