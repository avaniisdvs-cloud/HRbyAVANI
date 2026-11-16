'use client'
/**
 * AriaChatClient — shared bilingual chat UI for both admin and employee ARIA pages.
 *
 * Session history is held in React state only — NOT persisted to the DB.
 * UAE PDPL Art 4 — privacy by design; no conversation storage on client exit.
 *
 * Hard Rule 5: all design tokens via var(--accent) — no raw hex.
 * Hard Rule 4: all user-facing strings have EN + AR variants.
 */
import { useState, useRef, useEffect } from 'react'
import { sendAriaMessage } from '@/modules/aria'
import type { AriaChatMessage, AriaResponse, AriaSessionContext, AriaLeaveDraft, AriaTransferDraft } from '@/modules/aria'
import { Loader2, Mic, MicOff, Send } from 'lucide-react'
import { useMicPermission } from './useMicPermission'
import MicPermissionGuide from './MicPermissionGuide'

// ── Animated ARIA logo ─────────────────────────────────────────────────────

function AriaLogo({ size = 32 }: { size?: number }) {
  const cx = size / 2
  const cy = size / 2
  const innerR = size * 0.34
  const arcR   = size * 0.44

  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0, display: 'block' }}
    >
      <style>{`
        @keyframes aria-logo-spin   { to { transform: rotate(360deg) } }
        @keyframes aria-logo-pulse  { 0%,100% { opacity:.12 } 50% { opacity:.35 } }
        .aria-arc   { animation: aria-logo-spin  2.4s linear     infinite; transform-origin: ${cx}px ${cy}px; }
        .aria-glow  { animation: aria-logo-pulse 2s   ease-in-out infinite; }
      `}</style>

      {/* Outer glow ring */}
      <circle className="aria-glow" cx={cx} cy={cy} r={arcR + 2}
        fill="none" stroke="var(--accent)" strokeWidth="1.5" />

      {/* Spinning arc */}
      <circle className="aria-arc" cx={cx} cy={cy} r={arcR}
        fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"
        strokeDasharray={`${arcR * 1.3} ${arcR * 5.3}`} />

      {/* Inner filled circle */}
      <circle cx={cx} cy={cy} r={innerR} fill="var(--accent)" />

      {/* AI label */}
      <text
        x={cx} y={cy + size * 0.105}
        textAnchor="middle"
        fill="white"
        fontSize={size * 0.27}
        fontWeight="800"
        fontFamily="inherit"
        letterSpacing="-0.5"
      >AI</text>
    </svg>
  )
}

// ── Role-based suggested questions ───────────────────────────────────────────

const MANAGER_SUGGESTED_EN = [
  'Who is on leave from my team today?',
  'Show my pending approvals',
  'Who joined my team this month?',
  "What is my team's leave balance?",
  'Show document expiry alerts for my team',
]
const MANAGER_SUGGESTED_AR = [
  'من في فريقي في إجازة اليوم؟',
  'أظهر الموافقات المعلقة لديّ',
  'من انضم لفريقي هذا الشهر؟',
  'ما هو رصيد إجازة فريقي؟',
  'أظهر تنبيهات انتهاء الوثائق لفريقي',
]

interface AriaChatClientProps {
  sessionCtx: AriaSessionContext
  prefilledPrompt?: string
  /** Role of the current user — used to render role-specific suggested questions */
  userRole?: string
}

interface DisplayMessage {
  role:    'user' | 'aria'
  content: string
  intent?: string | null
  source?: string | null
  isCard?: boolean
}

// ─── Mic button visual state ──────────────────────────────────────────────────

type MicBtnState = 'idle' | 'requesting' | 'active' | 'denied' | 'error'

function micBtnStyle(s: MicBtnState): React.CSSProperties {
  const base: React.CSSProperties = {
    flexShrink: 0, width: 34, height: 34,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s ease',
  }
  switch (s) {
    case 'requesting': return { ...base, background: 'var(--accent)', opacity: 0.7, border: '1px solid var(--accent)', color: "var(--on-accent)", cursor: 'default' }
    case 'active':     return { ...base, background: 'var(--accent-deep, var(--accent))', border: '1px solid var(--accent-deep, var(--accent))', color: "var(--on-accent)" }
    case 'denied':     return { ...base, background: 'transparent', border: '1px solid var(--status-rejected-fg)', color: 'var(--status-rejected-fg)' }
    case 'error':      return { ...base, background: 'transparent', border: '1px solid var(--status-pending-fg)', color: 'var(--status-pending-fg)' }
    default:           return { ...base, background: 'transparent', border: '1px solid var(--border)', color: 'var(--ink-3)' }
  }
}

function micBtnTitle(s: MicBtnState, isRtl: boolean): string {
  if (isRtl) {
    switch (s) {
      case 'requesting': return 'جارٍ طلب الإذن...'
      case 'active':     return 'جارٍ الاستماع... انقر للإيقاف'
      case 'denied':     return 'الميكروفون محظور — انقر للمساعدة'
      case 'error':      return 'خطأ في الميكروفون — انقر للمساعدة'
      default:           return 'الإدخال الصوتي'
    }
  }
  switch (s) {
    case 'requesting': return 'Waiting for permission...'
    case 'active':     return 'Listening... click to stop'
    case 'denied':     return 'Microphone blocked — click for help'
    case 'error':      return 'Microphone error — click for help'
    default:           return 'Speak'
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AriaChatClient({ sessionCtx, prefilledPrompt, userRole }: AriaChatClientProps) {
  // Session-scoped storage key — different users on the same device don't share history
  const storageKey = `aria-chat-${sessionCtx.personId}`

  const [messages, setMessages] = useState<DisplayMessage[]>(() => {
    try {
      const raw = sessionStorage.getItem(`${storageKey}-messages`)
      if (raw) return JSON.parse(raw) as DisplayMessage[]
    } catch { /* fall through */ }
    // First visit — show personalised greeting
    const lang = (sessionCtx as { language?: string }).language === 'ar' ? 'ar' : 'en'
    const firstName = (sessionCtx.userName ?? '').split(' ')[0].trim()
    const greet = lang === 'ar'
      ? (firstName
          ? `مرحباً، ${firstName}! أنا آريا، مساعدك في AVANIIS HR. يمكنني المساعدة في رصيد الإجازات، الهيكل التنظيمي، وطلبات الإجازة.`
          : 'مرحباً! أنا آريا، مساعدك في AVANIIS HR. يمكنني المساعدة في رصيد الإجازات، الهيكل التنظيمي، وطلبات الإجازة.')
      : (firstName
          ? `Hi, ${firstName}! I'm ARIA, your AVANIIS HR assistant. Ask me about leave balances, org chart, leave requests, and more.`
          : "Hi! I'm ARIA, your AVANIIS HR assistant. Ask me about leave balances, org chart, leave requests, and more.")
    return [{ role: 'aria', content: greet }]
  })
  const [history, setHistory] = useState<AriaChatMessage[]>(() => {
    try {
      const raw = sessionStorage.getItem(`${storageKey}-history`)
      return raw ? (JSON.parse(raw) as AriaChatMessage[]) : []
    } catch { return [] }
  })
  const [input, setInput]       = useState('')
  const [pendingDraft, setPendingDraft] = useState<AriaLeaveDraft | null>(null)
  const [pendingTransferDraft, setPendingTransferDraft] = useState<AriaTransferDraft | null>(null)
  const [isPending, setIsPending]      = useState(false)
  const [isListening, setIsListening]  = useState(false)
  const [quickReplies, setQuickReplies] = useState<string[]>([])
  const [micHovered, setMicHovered]    = useState(false)
  const recognitionRef    = useRef<any>(null)
  const bottomRef         = useRef<HTMLDivElement>(null)
  const msgScrollRef      = useRef<HTMLDivElement>(null)

  // Derive locale from sessionCtx if available, default to 'en'
  const locale = (sessionCtx as { language?: string }).language === 'ar' ? 'ar' : 'en'
  const isRtl  = locale === 'ar'

  // Persist chat state to sessionStorage so navigation doesn't wipe history
  useEffect(() => {
    try { sessionStorage.setItem(`${storageKey}-messages`, JSON.stringify(messages)) } catch { /* quota */ }
  }, [messages, storageKey])

  useEffect(() => {
    try { sessionStorage.setItem(`${storageKey}-history`, JSON.stringify(history)) } catch { /* quota */ }
  }, [history, storageKey])

  // ── Mic permission hook ───────────────────────────────────────────────────
  const { permState, guideType, showHint, requestPermission, retry, dismissGuide } =
    useMicPermission({
      onRevoked: () => {
        recognitionRef.current?.stop()
        setIsListening(false)
      },
    })

  // Derived button display state
  const btnState: MicBtnState = isListening ? 'active'
    : permState === 'requesting' ? 'requesting'
    : permState === 'denied'     ? 'denied'
    : (permState === 'no-device' || permState === 'in-use' || permState === 'error') ? 'error'
    : 'idle'

  useEffect(() => {
    // Scroll the message list container directly — avoids scrollIntoView
    // bubbling up to the page viewport and causing the header jump on tab switch.
    const el = msgScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // ── Pre-filled prompt from ARIA OS home suggested prompts ─────────────────
  useEffect(() => {
    if (!prefilledPrompt) return
    setInput(prefilledPrompt)
    const t = setTimeout(() => {
      if (prefilledPrompt.trim()) send(prefilledPrompt)
    }, 400)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledPrompt])

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

  // ── Send message ──────────────────────────────────────────────────────────
  function send(text: string) {
    if (!text.trim() || isPending) return
    setInput('')
    setQuickReplies([])

    const userDisplay: DisplayMessage = { role: 'user', content: text }
    setMessages(prev => [...prev, userDisplay])

    const userMsg: AriaChatMessage = { role: 'user', content: text }
    const nextHistory = [...history, userMsg].slice(-10)

    setIsPending(true)
    ;(async () => {
      try {
        const response: AriaResponse = await sendAriaMessage(
          text,
          sessionCtx,
          history,
          pendingDraft,
          pendingTransferDraft,
        )

        const ariaDisplay: DisplayMessage = {
          role:    'aria',
          content: response.message,
          intent:  response.intentCode,
          source:  response.dataSource,
          isCard:  response.intentCode === 'LEAVE_REQUEST_DRAFT' || response.intentCode === 'TRANSFER_REQUEST_DRAFT',
        }

        setMessages(prev => [...prev, ariaDisplay])
        setQuickReplies(response.quickReplies ?? [])

        const assistantMsg: AriaChatMessage = { role: 'assistant', content: response.message }
        setHistory([...nextHistory, assistantMsg].slice(-10))

        if (response.intentCode === 'LEAVE_REQUEST_DRAFT') {
          setPendingDraft(response.pendingDraft ?? null)
        } else if (
          response.intentCode === 'LEAVE_REQUEST_CONFIRM' ||
          response.intentCode === 'LEAVE_REQUEST_CANCEL'
        ) {
          setPendingDraft(null)
        }
        // Transfer draft round-trip (separate carrier — leave flow untouched)
        if (response.intentCode === 'TRANSFER_REQUEST_DRAFT') {
          setPendingTransferDraft(response.pendingTransferDraft ?? null)
        } else if (
          response.intentCode === 'TRANSFER_REQUEST_CONFIRM' ||
          response.intentCode === 'TRANSFER_REQUEST_CANCEL'
        ) {
          setPendingTransferDraft(null)
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Something went wrong. Please try again or contact IT support.'
        const isNotConfigured = errMsg.includes('ARIA_NOT_CONFIGURED')
        setMessages(prev => [
          ...prev,
          {
            role:    'aria',
            content: isNotConfigured
              ? (locale === 'ar'
                  ? 'ARIA غير متاحة بعد — تواصل مع مسؤول النظام.'
                  : 'ARIA is not yet available — contact your system administrator.')
              : (locale === 'ar'
                  ? 'عذراً، حدث خطأ. يرجى المحاولة مجدداً.'
                  : 'Sorry, something went wrong. Please try again.'),
          },
        ])
        setHistory(nextHistory)
        setQuickReplies([])
      } finally {
        setIsPending(false)
      }
    })()
  }

  async function handleSend() {
    send(input.trim())
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', maxWidth: '48rem', marginLeft: 'auto', marginRight: 'auto', width: '100%', padding: '0 24px' }}>
      {/* ── Message list ─────────────────────────────────────────────── */}
      <div ref={msgScrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} className="space-y-4 pb-4 px-1">
        {messages.length === 0 && (() => {
          const isManager = (userRole ?? sessionCtx.role) === 'MANAGER'
          const suggestions = isManager
            ? (isRtl ? MANAGER_SUGGESTED_AR : MANAGER_SUGGESTED_EN)
            : []
          return (
            <div className="text-center text-[var(--ink-3)] mt-16 space-y-2">
              <div className="flex justify-center mb-3">
                <AriaLogo size={72} />
              </div>
              <p className="text-sm">
                {isManager
                  ? (isRtl ? 'مساعد الموارد البشرية · مدير الفريق' : 'Your Team HR Assistant · Line Manager')
                  : (isRtl ? 'مساعدك في AVANIIS HR' : 'Your AVANIIS HR Assistant')}
              </p>
              {isManager ? (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  {suggestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => send(q)}
                      style={{
                        padding: '7px 16px',
                        borderRadius: '999px',
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--ink-2)',
                        fontSize: '12.5px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        transition: 'all 0.15s ease',
                        maxWidth: '320px',
                        textAlign: 'center',
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs mt-4 text-[var(--ink-4)]">
                  {isRtl
                    ? 'اسأل عن رصيد إجازتك، مديرك، أو حالة طلب إجازتك.'
                    : 'Ask about leave balances, your manager, or leave request status.'}
                </p>
              )}
            </div>
          )
        })()}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'aria' && (
              <span className="me-2 mt-1 shrink-0">
                <AriaLogo size={28} />
              </span>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[var(--accent)] text-white rounded-ee-sm'
                  : 'bg-[var(--card)] border border-[var(--border)] text-[var(--ink-1)] rounded-es-sm'
              } ${msg.isCard ? 'font-mono text-xs' : ''}`}
            >
              {msg.content}
              {msg.source && (
                <p className="mt-2 text-xs opacity-60">
                  {msg.source} · {isRtl ? 'بيانات مباشرة' : 'Live data'}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Manager starter questions — shown on a fresh conversation (only the
            seeded greeting present) so Line Managers get role-scoped prompts. */}
        {!isPending
          && (userRole ?? sessionCtx.role) === 'MANAGER'
          && messages.length === 1
          && messages[0]?.role === 'aria'
          && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, paddingInlineStart: 36 }}>
            {(isRtl ? MANAGER_SUGGESTED_AR : MANAGER_SUGGESTED_EN).map((q, i) => (
              <button
                key={i}
                onClick={() => send(q)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '999px',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--ink-2)',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  textAlign: 'start',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Typing indicator */}
        {isPending && (
          <div className="flex justify-start items-center gap-2">
            <span className="me-2 shrink-0"><AriaLogo size={28} /></span>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl rounded-es-sm px-4 py-3 flex gap-1">
              {[0, 1, 2].map(dot => (
                <span
                  key={dot}
                  className="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce"
                  style={{ animationDelay: `${dot * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Quick reply pills ────────────────────────────────────────── */}
      {!isPending && quickReplies.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px 0 4px' }}>
          {quickReplies.map((label, i) => {
            const isConfirm = /^(yes|نعم)/i.test(label)
            const isCancel  = /^(no|cancel|لا)/i.test(label)
            return (
              <button
                key={i}
                onClick={async () => {
                  const text = label.trim()
                  if (!text || isPending) return
                  setQuickReplies([])
                  const userDisplay: DisplayMessage = { role: 'user', content: text }
                  setMessages(prev => [...prev, userDisplay])
                  const userMsg: AriaChatMessage = { role: 'user', content: text }
                  const nextHistory = [...history, userMsg].slice(-10)
                  setIsPending(true)
                  ;(async () => {
                    try {
                      const response: AriaResponse = await sendAriaMessage(text, sessionCtx, history, pendingDraft, pendingTransferDraft)
                      const ariaDisplay: DisplayMessage = { role: 'aria', content: response.message, intent: response.intentCode, source: response.dataSource, isCard: response.intentCode === 'LEAVE_REQUEST_DRAFT' || response.intentCode === 'TRANSFER_REQUEST_DRAFT' }
                      setMessages(prev => [...prev, ariaDisplay])
                      setQuickReplies(response.quickReplies ?? [])
                      const assistantMsg: AriaChatMessage = { role: 'assistant', content: response.message }
                      setHistory([...nextHistory, assistantMsg].slice(-10))
                      if (response.intentCode === 'LEAVE_REQUEST_DRAFT') { setPendingDraft(response.pendingDraft ?? null) }
                      else if (response.intentCode === 'LEAVE_REQUEST_CONFIRM' || response.intentCode === 'LEAVE_REQUEST_CANCEL') { setPendingDraft(null) }
                      if (response.intentCode === 'TRANSFER_REQUEST_DRAFT') { setPendingTransferDraft(response.pendingTransferDraft ?? null) }
                      else if (response.intentCode === 'TRANSFER_REQUEST_CONFIRM' || response.intentCode === 'TRANSFER_REQUEST_CANCEL') { setPendingTransferDraft(null) }
                    } catch (err) {
                      const errMsg = err instanceof Error ? err.message : 'Something went wrong. Please try again or contact IT support.'
                      const isNotConfigured = errMsg.includes('ARIA_NOT_CONFIGURED')
                      setMessages(prev => [...prev, { role: 'aria', content: isNotConfigured ? (locale === 'ar' ? 'ARIA غير متاحة بعد — تواصل مع مسؤول النظام.' : 'ARIA is not yet available — contact your system administrator.') : (locale === 'ar' ? 'عذراً، حدث خطأ. يرجى المحاولة مجدداً.' : 'Sorry, something went wrong. Please try again.') }])
                      setHistory(nextHistory)
                      setQuickReplies([])
                    } finally {
                      setIsPending(false)
                    }
                  })()
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  border: `1px solid ${isConfirm ? 'var(--accent)' : 'var(--border)'}`,
                  background: isConfirm ? 'var(--accent)' : 'var(--card)',
                  color: isConfirm ? 'white' : isCancel ? 'var(--status-rejected-fg)' : 'var(--ink-2)',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'all 0.15s ease',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Mic permission guide (replaces old raw-text error banner) ── */}
      {guideType && (
        <MicPermissionGuide
          type={guideType}
          onTryAgain={retry}
          onUseText={dismissGuide}
          isRtl={isRtl}
        />
      )}

      {/* ── Input bar ────────────────────────────────────────────────── */}
      <style>{`
        @keyframes aria-mic-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(0.95); }
        }
        @keyframes aria-mic-ripple {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 40%, transparent); }
          50%       { box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 0%, transparent); }
        }
        .aria-mic-requesting { animation: aria-mic-pulse 1.5s ease-in-out infinite; }
        .aria-mic-active     { animation: aria-mic-ripple 1s ease-in-out infinite; }
      `}</style>
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        margin: '12px 0 12px',
      }}>
        {/* Text input */}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRtl ? 'اسأل آريا...' : 'Ask ARIA anything...'}
          disabled={isPending}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '14px',
            color: 'var(--ink-1)',
            fontFamily: 'var(--font-sans)',
            minWidth: 0,
          }}
        />

        {/* Mic button with first-time hint tooltip */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {/* Hover tooltip — shown only when browser permission is 'prompt' */}
          {showHint && micHovered && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 8px)',
              [isRtl ? 'left' : 'right']: 0,
              background: 'var(--ink-1)', color: "var(--on-accent)",
              borderRadius: 7, padding: '8px 12px',
              width: 180, fontSize: 'var(--text-caption)', lineHeight: 1.4,
              zIndex: 10, pointerEvents: 'none',
            }}>
              {isRtl
                ? '🎤 انقر للتحدث. سيطلب متصفحك إذن الميكروفون.'
                : '🎤 Click to speak. Your browser will ask for microphone permission.'}
              <span style={{
                position: 'absolute', top: '100%',
                [isRtl ? 'left' : 'right']: 10,
                borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                borderTop: '5px solid var(--ink-1)',
              }} />
            </div>
          )}

          <button
            onClick={toggleMic}
            disabled={permState === 'requesting'}
            title={micBtnTitle(btnState, isRtl)}
            aria-label={micBtnTitle(btnState, isRtl)}
            className={
              btnState === 'requesting' ? 'aria-mic-requesting' :
              btnState === 'active'     ? 'aria-mic-active'     : ''
            }
            onMouseEnter={() => setMicHovered(true)}
            onMouseLeave={() => setMicHovered(false)}
            style={micBtnStyle(btnState)}
          >
            {btnState === 'active' ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0 }} />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!input.trim() || isPending}
          aria-label={isRtl ? 'إرسال' : 'Send'}
          style={{
            flexShrink: 0,
            width: '34px',
            height: '34px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: input.trim() && !isPending ? 'var(--accent)' : 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: input.trim() && !isPending ? 'pointer' : 'not-allowed',
            color: input.trim() && !isPending ? 'white' : 'var(--ink-4)',
            transition: 'all 0.2s ease',
          }}
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  )
}
