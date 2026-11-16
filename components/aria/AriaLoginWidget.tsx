'use client'
/**
 * AriaLoginWidget — floating pre-sign-in ARIA chat widget.
 * Displayed on the login page for anonymous users.
 *
 * Handles: password reset, job application tracking, 2FA help, HR FAQs.
 * Uses local response logic — no Claude API call (user is not authenticated).
 * UAE PDPL Art 4: no personal data is stored or logged.
 *
 * HR contact info, lockout policy, and reset method are supplied from
 * policy_settings (AUTH.* keys) via the parent Server Component so this
 * widget never hardcodes operational strings.
 */
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Send, X, ArrowRight } from 'lucide-react'
import { useMicPermission } from './useMicPermission'
import MicPermissionGuide from './MicPermissionGuide'
import type { AriaLoginConfig } from '@/lib/aria/login-config'

const ARIA_GOLD       = '#A6803A'
const ARIA_GOLD_LIGHT = '#C29A4F'
const ARIA_GOLD_DARK  = '#6E5424'
const ARIA_GREEN      = '#2F5D4F'

interface Message {
  from:      'aria' | 'user'
  text:      string
  card?:     { rows: [string, string][]; note?: string }
  followups?: string[]
}

const QUICK_STARTS_EN = [
  'I forgot my password',
  'Track my job application',
  'How do I set up 2FA?',
  'Contact HR support',
]
const QUICK_STARTS_AR = [
  'نسيت كلمة المرور',
  'تتبع طلب توظيف',
  'كيف أُفعّل المصادقة الثنائية؟',
  'التواصل مع الموارد البشرية',
]

function respond(q: string, lang: 'en' | 'ar', cfg: AriaLoginConfig): Omit<Message, 'from'> {
  const ql = q.toLowerCase()

  if (ql.includes('password') || ql.includes('forgot') || ql.includes('reset') ||
      ql.includes('كلمة') || ql.includes('نسيت')) {
    return {
      text: lang === 'ar'
        ? 'يستخدم نظام AVANIIS HR تسجيل الدخول عبر Microsoft، لذا تتم إعادة تعيين كلمة المرور على صفحة Microsoft الآمنة — وليس هنا. ولأنك لم تسجّل الدخول بعد، لا أعرف هويتك ولن أطلب بريدك أو رقم الموظف. اضغط «تسجيل الدخول عبر Microsoft» بالأعلى، ثم اختر «لا يمكنك الوصول إلى حسابك؟» للتحقق من هويتك وإعادة التعيين بأمان.'
        : "AVANIIS HR uses Microsoft sign-in, so password resets are done on Microsoft's secure page — not here. You haven't signed in yet, so I don't know who you are and won't ask for your email or ID. Click 'Sign in with Microsoft' above, then choose 'Can't access your account?' to verify your identity and reset securely.",
      card: {
        rows: [
          [lang === 'ar' ? 'مكان إعادة التعيين' : 'Where to reset', lang === 'ar' ? 'صفحة تسجيل الدخول عبر Microsoft' : 'Microsoft sign-in page'],
          [lang === 'ar' ? 'نافذة القفل'   : 'Lockout window',  lang === 'ar'
            ? `${cfg.lockoutWindowMinutes} دقيقة بعد ${cfg.lockoutAttempts} محاولات`
            : `${cfg.lockoutWindowMinutes} minutes after ${cfg.lockoutAttempts} attempts`],
          [lang === 'ar' ? 'تحتاج مساعدة؟' : 'Need help?',      lang === 'ar' ? cfg.hrContactAr : cfg.hrContactEn],
        ],
        note: lang === 'ar'
          ? 'تسجيل الدخول بكلمة المرور مخصص لحسابات المدير العام فقط؛ جميع المستخدمين الآخرين يسجّلون عبر Microsoft.'
          : 'Password login is for Super Admin accounts only; all other users sign in with Microsoft.',
      },
      followups: lang === 'ar'
        ? ['كيف أستخدم تسجيل الدخول عبر Microsoft؟', 'حسابي مُقفَل', 'التحدث مع شخص']
        : ['How do I use Microsoft sign-in?', "I'm locked out", 'Talk to a human'],
    }
  }

  if (ql.includes('apply') || ql.includes('application') || ql.includes('job') || ql.includes('track') ||
      ql.includes('توظيف') || ql.includes('تتبع')) {
    return {
      text: lang === 'ar'
        ? 'التتبع متاح للمرشحين. أرسل لي رقم طلبك (مثال: APP-2026-...) وسأعرض المرحلة.'
        : "Tracking is open to candidates. Share your application reference (e.g. APP-2026-...) and I'll show the stage.",
      followups: lang === 'ar'
        ? ['ليس لديّ رقم مرجعي', 'اعرض وظائف المبيعات', 'التحدث مع المُجنِّد']
        : ["I don't have a reference", 'Show open Sales roles', 'Talk to recruiter'],
    }
  }

  if (ql.includes('payslip') || ql.includes('salary') || ql.includes('راتب')) {
    return {
      text: lang === 'ar'
        ? 'قسائم الراتب تتطلب تسجيل الدخول — البيانات مقيدة ولا يمكن الوصول إليها قبل المصادقة. هل تحتاج مساعدة في تسجيل الدخول؟'
        : 'Payslip data requires authentication and is not accessible before sign-in. Need help logging in or unlocking your account?',
      followups: lang === 'ar'
        ? ['نسيت كلمة المرور', 'حسابي مُقفَل']
        : ['I forgot my password', "I'm locked out of my account"],
    }
  }

  if (ql.includes('2fa') || ql.includes('factor') || ql.includes('authenticator') ||
      ql.includes('مصادقة') || ql.includes('تحقق')) {
    return {
      text: lang === 'ar'
        ? 'المصادقة الثنائية مطلوبة لجميع حسابات أفانيس. بعد تسجيل الدخول، اذهب إلى الملف الشخصي ← الأمان.'
        : "2FA is required for all AVANIIS accounts. Once signed in, go to Profile → Security. I can walk you through it.",
      followups: lang === 'ar'
        ? ['إرشدني خطوة بخطوة', 'فقدت تطبيق المصادقة']
        : ['Walk me through it', 'I lost my authenticator'],
    }
  }

  if (ql.includes('human') || ql.includes('person') || ql.includes('hr') ||
      ql.includes('شخص') || ql.includes('موارد')) {
    return {
      text: lang === 'ar'
        ? 'سأنشئ تذكرة لفريق الموارد البشرية. ما هو الموضوع لأملأ التفاصيل مسبقاً؟'
        : "I'll create a ticket for the HR team. What's the topic so I can pre-fill it?",
      followups: lang === 'ar'
        ? ['أمر شخصي', 'راتب ومزايا', 'تأشيرة / وثائق']
        : ["It's personal", 'Pay and benefits', 'Visa / docs'],
    }
  }

  if (ql.includes('microsoft') || ql.includes('sign in') || ql.includes('sign-in') ||
      ql.includes('log in') || ql.includes('login') || ql.includes('locked') || ql.includes('lock') ||
      ql.includes('مايكروسوفت') || ql.includes('تسجيل الدخول') || ql.includes('مقفل') || ql.includes('قفل')) {
    return {
      text: lang === 'ar'
        ? 'اضغط «تسجيل الدخول عبر Microsoft» بالأعلى وسجّل الدخول بحساب العمل الخاص بك مع المصادقة الثنائية. إذا كان حسابك مقفلاً، انتظر انتهاء نافذة القفل ثم حاول مجدداً، أو تواصل مع الدعم.'
        : "Click 'Sign in with Microsoft' above and sign in with your work account and 2FA. If your account is locked, wait for the lockout window to pass and try again, or contact support.",
      card: {
        rows: [
          [lang === 'ar' ? 'نافذة القفل'   : 'Lockout window',  lang === 'ar'
            ? `${cfg.lockoutWindowMinutes} دقيقة بعد ${cfg.lockoutAttempts} محاولات`
            : `${cfg.lockoutWindowMinutes} minutes after ${cfg.lockoutAttempts} attempts`],
          [lang === 'ar' ? 'تحتاج مساعدة؟' : 'Need help?',      lang === 'ar' ? cfg.hrContactAr : cfg.hrContactEn],
        ],
      },
      followups: lang === 'ar'
        ? ['نسيت كلمة المرور', 'كيف أُفعّل المصادقة الثنائية؟', 'التحدث مع شخص']
        : ['I forgot my password', 'How do I set up 2FA?', 'Talk to a human'],
    }
  }

  return {
    text: lang === 'ar'
      ? 'قبل تسجيل الدخول يمكنني المساعدة في إعادة كلمة المرور، تتبع الطلبات، والأسئلة الشائعة. بعد تسجيل الدخول أستطيع مساعدتك في الإجازات، الرواتب، والمزيد.'
      : 'Before sign-in I can help with password reset, application tracking, and HR FAQs. Once signed in, I can help with leave, payslips, EOSB, and more.',
    followups: lang === 'ar' ? QUICK_STARTS_AR : QUICK_STARTS_EN,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export default function AriaLoginWidget({
  lang = 'en',
  ariaConfig,
}: {
  lang?: 'en' | 'ar'
  ariaConfig: AriaLoginConfig
}) {
  const [open, setOpen]         = useState(false)
  const [msgs, setMsgs]         = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [thinking, setThinking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [micHovered, setMicHovered]   = useState(false)
  const recognitionRef = useRef<any>(null)
  const scrollRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  const isRtl       = lang === 'ar'
  const quickStarts = lang === 'ar' ? QUICK_STARTS_AR : QUICK_STARTS_EN
  const greet       = lang === 'ar'
    ? 'أهلاً! أنا آريا. هل نسيت كلمة المرور؟ تريد تتبع طلب توظيف؟ هل تحتاج مساعدة في حسابك؟ يمكنني المساعدة قبل تسجيل الدخول.'
    : "Hi, I'm ARIA. Forgot your password? Tracking an application? Need 2FA help? I can assist before you sign in."

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
    if (open && msgs.length === 0) {
      setMsgs([{ from: 'aria', text: greet }])
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [msgs, thinking])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120)
  }, [open])

  // ── Local response (unchanged) ───────────────────────────────────────────
  function send(text: string) {
    if (!text.trim() || thinking) return
    setMsgs(m => [...m, { from: 'user', text }])
    setInput('')
    setThinking(true)
    setTimeout(() => {
      setMsgs(m => [...m, { from: 'aria', ...respond(text, lang, ariaConfig) }])
      setThinking(false)
    }, 750)
  }

  // ── Speech recognition (unchanged logic) ─────────────────────────────────
  function startSpeechRecognition() {
    const w = window as any
    const SR: (new () => any) | undefined = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) return

    const r = new SR()
    r.lang            = lang === 'ar' ? 'ar-AE' : 'en-US'
    r.continuous      = false
    r.interimResults  = false
    r.maxAlternatives = 1

    r.onstart  = () => setIsListening(true)
    r.onend    = () => setIsListening(false)
    r.onerror  = (event: any) => { console.error('[ARIA MIC]', event.error); setIsListening(false) }
    r.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setInput(prev => (prev + ' ' + transcript).trim())
      setIsListening(false)
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
    if (granted) startSpeechRecognition()
  }

  // ARIA sits on the login-panel side (right in LTR, left in RTL), below the
  // footer copyright text. The 88px bottom padding on the panel reserves the
  // space so the FAB never overlaps the footer.
  const side = isRtl ? 'left' : 'right'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── FAB trigger button ──────────────────────────────────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={lang === 'ar' ? 'فتح مساعد ARIA' : 'Open ARIA Assistant'}
          style={{
            position: 'fixed', bottom: 24, [side]: 24, zIndex: 400,
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 18px 10px 12px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 999, cursor: 'pointer',
            boxShadow: '0 24px 48px -20px rgba(15,26,46,0.30), 0 4px 12px -4px rgba(15,26,46,0.10)',
            transition: 'transform 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <AriaOrb size={32} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: 'var(--font-serif, serif)', fontSize: 17, lineHeight: 1, fontStyle: 'italic', color: 'var(--ink-1)' }}>
              ARIA
            </span>
            <span style={{ fontSize: 'var(--text-caption)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              {lang === 'ar' ? 'قبل تسجيل الدخول' : 'pre-sign-in help'}
            </span>
          </div>
          <span style={{
            position: 'absolute', top: 8, [side === 'right' ? 'right' : 'left']: 8,
            width: 8, height: 8, borderRadius: '50%',
            background: ARIA_GREEN, animation: 'aria-pulse 2s infinite',
          }} />
        </button>
      )}

      {/* ── Chat panel ─────────────────────────────────────────────────── */}
      {open && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          style={{
            position: 'fixed', bottom: 24, [isRtl ? 'left' : 'right']: 24, zIndex: 400,
            width: 380, height: 560, maxHeight: 'calc(100vh - 48px)',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 24px 48px -20px rgba(15,26,46,0.30), 0 4px 12px -4px rgba(15,26,46,0.10)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            animation: 'aria-fadeup 0.35s ease both',
          }}>

          {/* Header */}
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AriaOrb size={24} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-serif, serif)', fontSize: 17, lineHeight: 1, color: 'var(--ink-1)' }}>
                ARIA
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                <PulseDot />
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {lang === 'ar' ? 'قبل تسجيل الدخول' : 'PRE-SIGN-IN'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label={lang === 'ar' ? 'إغلاق ARIA' : 'Close ARIA'}
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
          <div
            ref={scrollRef}
            style={{
              flex: 1, overflowY: 'auto', padding: '12px 14px 8px',
              background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10,
            }}>

            {/* Quick-start grid — shown only before first user message */}
            {msgs.length <= 1 && !thinking && (
              <>
                {msgs.length === 1 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', gap: 6, animation: 'aria-fadeup 0.3s ease both' }}>
                    <span style={{
                      marginInlineEnd: 6, marginBottom: 2, color: ARIA_GOLD,
                      fontWeight: 700, fontSize: 'var(--text-caption)', flexShrink: 0,
                      fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic',
                    }}>آريا</span>
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
                    {quickStarts.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => send(s)}
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
                        <span style={{ color: ARIA_GOLD, fontSize: 'var(--text-caption)', flexShrink: 0 }}><ArrowRight size={11} /></span>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* WhatsApp-style message bubbles */}
            {msgs.length > 1 && msgs.map((m, i) => (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: m.from === 'user' ? 'flex-end' : 'flex-start',
                animation: 'aria-fadeup 0.3s ease both',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start',
                  alignItems: 'flex-end', gap: 6,
                }}>
                  {m.from === 'aria' && (
                    <span style={{
                      color: ARIA_GOLD, fontWeight: 700, fontSize: 'var(--text-caption)', flexShrink: 0,
                      marginBottom: 2, fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic',
                    }}>آريا</span>
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

                {/* Info card (ARIA only) */}
                {m.from === 'aria' && m.card && (
                  <div style={{
                    marginInlineStart: 34, marginTop: 6,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 12px', maxWidth: '80%',
                  }}>
                    <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {m.card.rows.map((row, j) => (
                          <tr key={j}>
                            <td style={{ color: 'var(--ink-3)', fontSize: 'var(--text-caption)', padding: '3px 12px 3px 0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                              {row[0]}
                            </td>
                            <td style={{ fontSize: 'var(--text-caption)', padding: '3px 0', color: 'var(--ink-1)' }}>
                              {row[1]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table></TableScrollRegion>
                    {m.card.note && (
                      <p style={{
                        fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontStyle: 'italic',
                        margin: '8px 0 0', borderTop: '1px solid var(--border)', paddingTop: 6,
                      }}>
                        {m.card.note}
                      </p>
                    )}
                  </div>
                )}

                {/* Follow-up chips (ARIA only) */}
                {m.from === 'aria' && m.followups && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginInlineStart: 34, marginTop: 6, maxWidth: '85%' }}>
                    {m.followups.map((f, j) => (
                      <button
                        key={j}
                        onClick={() => send(f)}
                        style={{
                          fontSize: 'var(--text-caption)', padding: '5px 12px', borderRadius: 999,
                          border: '1px solid var(--border)', background: 'var(--card)',
                          color: 'var(--ink-2)', cursor: 'pointer',
                          transition: 'border-color 0.15s, color 0.15s',
                          fontFamily: 'var(--font-sans)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = ARIA_GOLD; e.currentTarget.style.color = ARIA_GOLD }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--ink-2)' }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Thinking indicator */}
            {thinking && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <span style={{ color: ARIA_GOLD, fontWeight: 700, fontSize: 'var(--text-caption)', flexShrink: 0, fontFamily: 'var(--font-serif, serif)', fontStyle: 'italic' }}>آريا</span>
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
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
                placeholder={lang === 'ar' ? 'اسأل قبل تسجيل الدخول...' : 'Ask before you sign in…'}
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
                <Send size={13} />
              </button>
            </div>
          </div>

          {/* Privacy footer */}
          <div style={{
            padding: '4px 14px 10px', textAlign: 'center',
            fontSize: 'var(--text-caption)', color: 'var(--ink-3)', letterSpacing: '0.06em',
            lineHeight: 1.5, background: 'var(--card)',
          }}>
            {lang === 'ar'
              ? 'جلسات قبل تسجيل الدخول مجهولة. لا تُحفظ بيانات شخصية.'
              : 'Pre-sign-in sessions are anonymous. No personal data is logged.'}
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
