'use client'
import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Loader2, Mic, MicOff, Send, X } from 'lucide-react'
import { sendAriaMessage } from '@/modules/aria'
import type { AriaChatMessage, AriaSessionContext, AriaLeaveDraft, AriaTransferDraft } from '@/modules/aria'
import { useMicPermission } from './useMicPermission'
import MicPermissionGuide from './MicPermissionGuide'

/**
 * Pages that have their own embedded ARIA experience.
 * The global floating widget is suppressed on these routes so the user
 * sees exactly one ARIA entry-point and the left sidebar stays accessible.
 */
const ARIA_SUPPRESSED_ROUTES = ['/org-chart', '/aria']

const ARIA_GOLD       = '#A6803A'
const ARIA_GOLD_LIGHT = '#C29A4F'
const ARIA_GOLD_DARK  = '#6E5424'
const ARIA_GREEN      = '#2F5D4F'

interface DisplayMsg {
  from:  'aria' | 'user'
  text:  string
}

interface Props {
  sessionCtx: AriaSessionContext
  locale?:    'en' | 'ar'
  /** Configured agent name (Settings → AI Agent → Identity). Defaults to ARIA. */
  agentName?: string
}

function AriaOrb({ size = 28 }: { size?: number }) {
  const inner  = Math.round(size * 0.21)
  const center = Math.round(size * 0.39)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `radial-gradient(circle at 30% 30%, ${ARIA_GOLD_LIGHT}, ${ARIA_GOLD} 60%, ${ARIA_GOLD_DARK})`,
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
      position: 'relative',
    }}>
      <span style={{ position: 'absolute', inset: inner, borderRadius: '50%', background: 'var(--card)' }} />
      <span style={{ position: 'absolute', inset: center, borderRadius: '50%', background: ARIA_GOLD, zIndex: 1 }} />
    </div>
  )
}

function PulseDot() {
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
      background: ARIA_GREEN, animation: 'aria-pulse 2s infinite', flexShrink: 0,
    }} />
  )
}

// ─── Mic button helpers ───────────────────────────────────────────────────────

type MicBtnState = 'idle' | 'requesting' | 'active' | 'denied' | 'error'

function micBtnStyle(s: MicBtnState): React.CSSProperties {
  const base: React.CSSProperties = {
    flexShrink: 0, width: 30, height: 30,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s ease',
  }
  switch (s) {
    case 'requesting': return { ...base, background: 'var(--accent)', opacity: 0.7, border: '1px solid var(--accent)', color: "var(--on-accent)", cursor: 'default' }
    case 'active':     return { ...base, background: '#1E5B38', border: '1px solid #1E5B38', color: "var(--on-accent)" }
    case 'denied':     return { ...base, background: 'transparent', border: '1px solid var(--status-rejected-fg, #B33A3A)', color: 'var(--status-rejected-fg, #A32D2D)' }
    case 'error':      return { ...base, background: 'transparent', border: '1px solid var(--status-pending-fg, #D98A00)', color: 'var(--status-pending-fg, #8A5A0B)' }
    default:           return { ...base, background: 'transparent', border: '1px solid var(--border)', color: 'var(--ink-3)' }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AriaAuthWidget({ sessionCtx, locale = 'en', agentName = 'ARIA' }: Props) {
  // Arabic display name: use the configured name unless it is the default 'ARIA'.
  const agentNameAr = agentName === 'ARIA' ? 'آريا' : agentName
  const pathname = usePathname()

  const [open, setOpen]       = useState(false)
  const [msgs, setMsgs]       = useState<DisplayMsg[]>([])
  const [history, setHistory] = useState<AriaChatMessage[]>([])
  const [pendingDraft, setPendingDraft] = useState<AriaLeaveDraft | null>(null)
  const [pendingTransferDraft, setPendingTransferDraft] = useState<AriaTransferDraft | null>(null)
  const [quickReplies, setQuickReplies] = useState<string[]>([])
  const [input, setInput]     = useState('')
  const [thinking, setThinking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [micHovered, setMicHovered]   = useState(false)
  const scrollRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const isRtl = locale === 'ar'
  const isSupressed = ARIA_SUPPRESSED_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

  // ── Draggable position (persisted per user/browser) ───────────────────────
  // pos = top-left corner of the widget in px. null → default bottom-right.
  const DRAG_KEY  = 'aria_widget_pos'
  const PANEL_W   = 380
  const PANEL_H   = 560
  // Approximate FAB footprint — used to clamp the collapsed button on-screen so
  // a stale/off-screen persisted position can never hide it.
  const FAB_W     = 200
  const FAB_H     = 64
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const panelRef  = useRef<HTMLDivElement>(null)
  const dragRef   = useRef<
    { startX: number; startY: number; origX: number; origY: number; w: number; h: number; moved: boolean } | null
  >(null)

  // Load any saved position once on mount (client-only), clamped into view so a
  // stale/off-screen stored value never hides the button.
  useEffect(() => {
    try {
      const s = localStorage.getItem(DRAG_KEY)
      if (s) { const p = JSON.parse(s); if (typeof p?.x === 'number' && typeof p?.y === 'number') setPos(clampPos(p.x, p.y, FAB_W, FAB_H)) }
    } catch { /* ignore */ }
  }, [])

  // Re-clamp on viewport resize so shrinking the window can't push the button
  // off-screen. Keeps the FAB reachable on every screen size.
  useEffect(() => {
    function onResize() {
      setPos(prev => (prev ? clampPos(prev.x, prev.y, FAB_W, FAB_H) : prev))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function clampPos(x: number, y: number, w: number, h: number) {
    if (typeof window === 'undefined') return { x, y }
    const maxX = window.innerWidth  - w - 8
    const maxY = window.innerHeight - h - 8
    return { x: Math.max(8, Math.min(x, maxX)), y: Math.max(8, Math.min(y, maxY)) }
  }

  function beginDrag(e: React.PointerEvent, rect: DOMRect) {
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origX: rect.left, origY: rect.top, w: rect.width, h: rect.height, moved: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onDragMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) d.moved = true
    if (d.moved) setPos(clampPos(d.origX + dx, d.origY + dy, d.w, d.h))
  }

  // Returns true if the pointer actually moved (a drag, not a click).
  function finishDrag(): boolean {
    const d = dragRef.current
    dragRef.current = null
    if (d?.moved) {
      setPos(prev => {
        if (prev) { try { localStorage.setItem(DRAG_KEY, JSON.stringify(prev)) } catch { /* ignore */ } }
        return prev
      })
    }
    return d?.moved ?? false
  }

  const firstName = (sessionCtx.userName ?? '').split(' ')[0].trim()
  const greet = isRtl
    ? (firstName
        ? `مرحباً، ${firstName}! أنا ${agentNameAr}، مساعدك في AVANIIS HR. يمكنني المساعدة في رصيد الإجازات، الهيكل التنظيمي، وطلبات الإجازة.`
        : `مرحباً! أنا ${agentNameAr}، مساعدك في AVANIIS HR. يمكنني المساعدة في رصيد الإجازات، الهيكل التنظيمي، وطلبات الإجازة.`)
    : (firstName
        ? `Hi, ${firstName}! I'm ${agentName}, your AVANIIS HR assistant. Ask me about leave balances, org chart, leave requests, and more.`
        : `Hi! I'm ${agentName}, your AVANIIS HR assistant. Ask me about leave balances, org chart, leave requests, and more.`)

  // ── Mic permission hook ─────────────────────────────────────────────────
  const { permState, guideType, showHint, requestPermission, retry, dismissGuide } =
    useMicPermission({
      onRevoked: () => {
        recognitionRef.current?.stop()
        setIsListening(false)
      },
    })

  const btnState: MicBtnState = isListening ? 'active'
    : permState === 'requesting' ? 'requesting'
    : permState === 'denied'     ? 'denied'
    : (permState === 'no-device' || permState === 'in-use' || permState === 'error') ? 'error'
    : 'idle'

  useEffect(() => {
    if (open && msgs.length === 0) setMsgs([{ from: 'aria', text: greet }])
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs, thinking])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120)
  }, [open])

  // Suppress on pages that embed their own ARIA experience (after all hooks)
  if (isSupressed) return null

  // ── Send message (unchanged logic) ───────────────────────────────────────
  async function send(text: string) {
    if (!text.trim() || thinking) return
    const userText = text.trim()
    setMsgs(m => [...m, { from: 'user', text: userText }])
    setInput('')
    setQuickReplies([])
    setThinking(true)

    const newHistory: AriaChatMessage[] = [
      ...history,
      { role: 'user' as const, content: userText },
    ].slice(-10)
    setHistory(newHistory)

    ;(async () => {
      try {
        const ctx: AriaSessionContext = { ...sessionCtx, language: locale }
        const res = await sendAriaMessage(userText, ctx, newHistory, pendingDraft, pendingTransferDraft)
        setMsgs(m => [...m, { from: 'aria', text: res.message }])
        setHistory(h => [...h, { role: 'assistant' as const, content: res.message }].slice(-10))
        setPendingDraft(res.pendingDraft ?? null)
        setPendingTransferDraft(res.pendingTransferDraft ?? null)
        setQuickReplies(res.quickReplies ?? [])
      } catch {
        setMsgs(m => [...m, {
          from: 'aria',
          text: isRtl
            ? 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.'
            : 'Sorry, something went wrong. Please try again.',
        }])
        setQuickReplies([])
      } finally {
        setThinking(false)
      }
    })()
  }

  // ── Speech recognition ───────────────────────────────────────────────────
  function startSpeechRecognition() {
    const w = window as any
    const SR: (new () => any) | undefined = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) return

    const r = new SR()
    r.lang            = locale === 'ar' ? 'ar-AE' : 'en-US'
    r.continuous      = false
    r.interimResults  = false
    r.maxAlternatives = 1

    r.onstart  = () => setIsListening(true)
    r.onend    = () => setIsListening(false)
    r.onerror  = (event: any) => {
      setIsListening(false)
      if (event.error === 'no-speech') return  // user didn't speak — silent reset
      console.error('[ARIA MIC]', event.error)
    }
    r.onresult = (event: any) => {
      const transcript = (event.results[0][0].transcript ?? '').trim()
      setIsListening(false)
      if (transcript) send(transcript)  // auto-send after voice capture
    }

    recognitionRef.current = r
    try { r.start() } catch (err) { console.error('[ARIA MIC] Failed to start:', err); setIsListening(false) }
  }

  // ── Mic button click ──────────────────────────────────────────────────────
  async function toggleMic() {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const granted = await requestPermission()
    if (granted) {
      // Allow browser to fully release the permission-probe stream before SR starts
      await new Promise<void>(resolve => setTimeout(resolve, 200))
      startSpeechRecognition()
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── FAB ─────────────────────────────────────────────────────────── */}
      {!open && (
        <button
          onClick={e => { if (e.detail === 0) setOpen(true) }}
          onPointerDown={e => beginDrag(e, e.currentTarget.getBoundingClientRect())}
          onPointerMove={onDragMove}
          onPointerUp={() => { const moved = finishDrag(); if (!moved) setOpen(true) }}
          aria-label={isRtl ? 'فتح مساعد ARIA' : 'Open ARIA Assistant'}
          title={isRtl ? 'اسحب لتحريك · انقر للفتح' : 'Drag to move · click to open'}
          className="aria-launcher"
          style={{
            position: 'fixed', zIndex: 49,
            ...(pos
              ? (() => { const p = clampPos(pos.x, pos.y, FAB_W, FAB_H); return { left: p.x, top: p.y } })()
              : { bottom: 24, right: 24 }),
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 18px 10px 12px',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 999, cursor: 'grab', touchAction: 'none',
            boxShadow: '0 24px 48px -20px rgba(15,26,46,0.30), 0 4px 12px -4px rgba(15,26,46,0.10)',
            transition: 'transform 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <AriaOrb size={32} />
          <div className="aria-launcher-label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: 'var(--font-serif, serif)', fontSize: 17, lineHeight: 1, fontStyle: 'italic', color: 'var(--ink-1)' }}>
              ARIA
            </span>
            <span style={{ fontSize: 'var(--text-caption)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              {isRtl ? 'مساعد HR' : 'HR Assistant'}
            </span>
          </div>
          <span style={{
            position: 'absolute', top: 8, right: 8,
            width: 8, height: 8, borderRadius: '50%',
            background: ARIA_GREEN, animation: 'aria-pulse 2s infinite',
          }} />
        </button>
      )}

      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      {open && (
        <div
          ref={panelRef}
          dir={isRtl ? 'rtl' : 'ltr'}
          className="aria-launcher"
          style={{
            position: 'fixed', zIndex: 49,
            ...(pos
              ? (() => { const p = clampPos(pos.x, pos.y, PANEL_W, PANEL_H); return { left: p.x, top: p.y } })()
              : { bottom: 24, right: 24 }),
            width: PANEL_W, height: PANEL_H, maxHeight: 'calc(100vh - 48px)',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 24px 48px -20px rgba(15,26,46,0.30), 0 4px 12px -4px rgba(15,26,46,0.10)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            animation: 'aria-fadeup 0.35s ease both',
          }}
        >
          {/* Header — drag handle */}
          <div
            onPointerDown={e => { if (panelRef.current) beginDrag(e, panelRef.current.getBoundingClientRect()) }}
            onPointerMove={onDragMove}
            onPointerUp={() => finishDrag()}
            title={isRtl ? 'اسحب لتحريك' : 'Drag to move'}
            style={{
              padding: '12px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'grab', touchAction: 'none', userSelect: 'none',
            }}
          >
            <AriaOrb size={24} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-serif, serif)', fontSize: 17, lineHeight: 1, color: 'var(--ink-1)' }}>
                ARIA
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                <PulseDot />
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {isRtl ? 'مساعد HR' : 'HR ASSISTANT'}
                </span>
              </div>
            </div>
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => setOpen(false)}
              aria-label={isRtl ? 'إغلاق ARIA' : 'Close ARIA'}
              style={{
                width: 28, height: 28, borderRadius: 8, border: 'none',
                background: 'transparent', cursor: 'pointer',
                color: 'var(--ink-3)', display: 'grid', placeItems: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <X size={14} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{
            flex: 1, overflowY: 'auto', padding: '12px 14px 8px',
            background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {/* Quick-start grid — shown only before first user message */}
            {msgs.length <= 1 && !thinking && (
              <>
                {msgs.length === 1 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'aria-fadeup 0.3s ease both' }}>
                    <span style={{
                      marginInlineEnd: 6, marginTop: 4, color: ARIA_GOLD,
                      fontWeight: 700, fontSize: 'var(--text-caption)', flexShrink: 0,
                      fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic',
                    }}>{agentNameAr}</span>
                    <div style={{
                      maxWidth: '82%', borderRadius: '18px 18px 18px 4px',
                      padding: '10px 14px', fontSize: 'var(--text-body)', lineHeight: 1.6,
                      whiteSpace: 'pre-wrap', background: 'var(--card)',
                      color: 'var(--ink-1)', border: '1px solid var(--border)',
                    }}>{msgs[0].text}</div>
                  </div>
                )}
                <div style={{ paddingInlineStart: 4, marginTop: 4 }}>
                  <p style={{ fontSize: 'var(--text-caption)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '0 0 8px' }}>
                    {isRtl ? 'ابدأ بسؤال' : 'Quick starts'}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(isRtl
                      ? ['رصيد إجازتي', 'من مديري؟', 'تقديم طلب إجازة', 'حالة طلب الإجازة']
                      : ['What is my leave balance?', 'Who is my manager?', 'Apply for leave', 'My leave request status']
                    ).map((qs, i) => (
                      <button
                        key={i}
                        onClick={() => send(qs)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                          background: 'var(--card)', border: '1px solid var(--border)',
                          color: 'var(--ink-1)', fontSize: 'var(--text-body)', textAlign: 'start',
                          fontFamily: 'var(--font-sans)', transition: 'border-color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = ARIA_GOLD; e.currentTarget.style.background = `${ARIA_GOLD}0a` }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--card)' }}
                      >
                        <span style={{ color: ARIA_GOLD, fontSize: 'var(--text-caption)', flexShrink: 0 }}>→</span>
                        {qs}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* WhatsApp-style message bubbles */}
            {msgs.length > 1 && msgs.map((m, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start',
                alignItems: 'flex-end', gap: 6,
                animation: 'aria-fadeup 0.3s ease both',
              }}>
                {m.from === 'aria' && (
                  <span style={{
                    color: ARIA_GOLD, fontWeight: 700, fontSize: 'var(--text-caption)', flexShrink: 0,
                    marginBottom: 2, fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic',
                  }}>{agentNameAr}</span>
                )}
                <div style={{
                  maxWidth: '80%',
                  borderRadius: m.from === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  padding: '9px 13px', fontSize: 'var(--text-body)', lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  background: m.from === 'user' ? 'var(--accent)' : 'var(--card)',
                  color: m.from === 'user' ? 'white' : 'var(--ink-1)',
                  border: m.from === 'user' ? 'none' : '1px solid var(--border)',
                }}>
                  {m.text}
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {thinking && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <span style={{ color: ARIA_GOLD, fontWeight: 700, fontSize: 'var(--text-caption)', flexShrink: 0, fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic' }}>{agentNameAr}</span>
                <div style={{
                  borderRadius: '18px 18px 18px 4px', padding: '10px 14px',
                  background: 'var(--card)', border: '1px solid var(--border)',
                  display: 'flex', gap: 4, alignItems: 'center',
                }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: 'var(--accent)', display: 'inline-block',
                      animation: `aria-bounce 1s ease-in-out ${i * 0.15}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            {/* Quick reply pills */}
            {!thinking && quickReplies.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, paddingInlineStart: 34, animation: 'aria-fadeup 0.25s ease both' }}>
                {quickReplies.map((label, i) => {
                  const isConfirm = /^(yes|نعم)/i.test(label)
                  const isCancel  = /^(no|cancel|لا)/i.test(label)
                  return (
                    <button key={i} onClick={() => send(label)} style={{
                      padding: '6px 14px', borderRadius: 999, fontSize: 'var(--text-caption)', fontWeight: 500,
                      cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      transition: 'all 0.15s ease',
                      border: `1px solid ${isConfirm ? 'var(--accent)' : 'var(--border)'}`,
                      background: isConfirm ? 'var(--accent)' : 'var(--card)',
                      color: isConfirm ? 'white' : isCancel ? 'var(--status-rejected-fg)' : 'var(--ink-2)',
                    }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Mic permission guide */}
          {guideType && (
            <div style={{ padding: '0 12px', background: 'var(--card)' }}>
              <MicPermissionGuide
                type={guideType}
                onTryAgain={retry}
                onUseText={() => { dismissGuide(); inputRef.current?.focus() }}
                isRtl={isRtl}
                compact
              />
            </div>
          )}

          {/* Input bar */}
          <div style={{ padding: '10px 12px 8px', background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 12,
            }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={isRtl ? `اسأل ${agentNameAr}...` : `Ask ${agentName} anything...`}
                disabled={thinking}
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontFamily: 'var(--font-sans)', minWidth: 0,
                }}
              />

              {/* Mic button with first-time hint tooltip */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {showHint && micHovered && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)',
                    [isRtl ? 'left' : 'right']: 0,
                    background: 'var(--ink-1)', color: "var(--on-accent)",
                    borderRadius: 7, padding: '7px 10px',
                    width: 160, fontSize: 'var(--text-caption)', lineHeight: 1.4,
                    zIndex: 10, pointerEvents: 'none',
                  }}>
                    {isRtl
                      ? '🎤 سيطلب متصفحك إذن الميكروفون.'
                      : '🎤 Your browser will ask for mic permission.'}
                    <span style={{
                      position: 'absolute', top: '100%',
                      [isRtl ? 'left' : 'right']: 8,
                      borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
                      borderTop: '4px solid var(--ink-1)',
                    }} />
                  </div>
                )}
                <button
                  onClick={toggleMic}
                  disabled={permState === 'requesting'}
                  aria-label={isListening ? (isRtl ? 'إيقاف الميكروفون' : 'Stop mic') : (isRtl ? 'الإدخال الصوتي' : 'Voice input')}
                  className={btnState === 'requesting' ? 'aria-mic-requesting' : btnState === 'active' ? 'aria-mic-active' : ''}
                  onMouseEnter={() => setMicHovered(true)}
                  onMouseLeave={() => setMicHovered(false)}
                  style={micBtnStyle(btnState)}
                >
                  {btnState === 'active' ? <MicOff size={13} /> : <Mic size={13} />}
                </button>
              </div>

              <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

              <button
                onClick={() => send(input)}
                disabled={!input.trim() || thinking}
                aria-label={isRtl ? 'إرسال' : 'Send'}
                style={{
                  flexShrink: 0, width: 30, height: 30, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: input.trim() && !thinking ? 'var(--accent)' : 'transparent',
                  border: '1px solid var(--border)', borderRadius: 8,
                  cursor: input.trim() && !thinking ? 'pointer' : 'not-allowed',
                  color: input.trim() && !thinking ? 'white' : 'var(--ink-4)',
                  transition: 'all 0.2s ease',
                }}
              >
                {thinking ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '4px 14px 8px', textAlign: 'center',
            fontSize: 'var(--text-caption)', color: 'var(--ink-3)', letterSpacing: '0.06em',
            lineHeight: 1.5, background: 'var(--card)',
          }}>
            {isRtl
              ? 'الجلسات غير محفوظة · لا تُخزَّن بيانات شخصية'
              : 'Sessions are not stored · No personal data is logged'}
          </div>
        </div>
      )}

      <style>{`
        @keyframes aria-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes aria-fadeup {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes aria-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.6; }
          50%       { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes aria-mic-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(0.95); }
        }
        @keyframes aria-mic-ripple {
          0%, 100% { box-shadow: 0 0 0 0 rgba(30,91,56,0.4); }
          50%       { box-shadow: 0 0 0 5px rgba(30,91,56,0); }
        }
        .aria-mic-requesting { animation: aria-mic-pulse 1.5s ease-in-out infinite; }
        .aria-mic-active     { animation: aria-mic-ripple 1s ease-in-out infinite; }
      `}</style>
    </>
  )
}
