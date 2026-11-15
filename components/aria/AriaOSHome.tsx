'use client'

import { useState, useEffect } from 'react'
import { generateDailyBriefing } from '@/modules/aria'
import type { AriaSessionContext } from '@/modules/aria'
import type { ReasoningStep } from './AriaReasoningPanel'
import { Loader2, ArrowRight } from 'lucide-react'

export interface AriaOSKpis {
  headcount:         number
  emiratisationPct:  number | null
  pendingApprovals:  number
}

interface KpiCardProps {
  label:    string
  value:    string
  subtext?: string
  accent?:  boolean
}

function KpiCard({ label, value, subtext, accent }: KpiCardProps) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px 22px',
      flex: 1,
      minWidth: 0,
      position: 'relative',
      overflow: 'hidden',
      transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
    }}>
      {/* Top accent bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: 'var(--accent)',
        opacity: 0.35,
      }} />
      <p style={{
        fontSize: 'var(--text-caption)',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
        margin: '0 0 10px',
        fontFamily: 'var(--font-mono, monospace)',
      }}>
        {label}
      </p>
      {value === '—' ? (
        <div style={{
          height: 32,
          width: 80,
          borderRadius: 6,
          backgroundImage: 'linear-gradient(90deg, var(--border) 0%, var(--surface) 50%, var(--border) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.8s ease-in-out infinite',
        }} />
      ) : (
        <p style={{
          fontSize: 32,
          fontWeight: 700,
          color: accent ? 'var(--brand-active)' : 'var(--ink-1)',
          margin: 0,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </p>
      )}
      {subtext && (
        <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '6px 0 0' }}>
          {subtext}
        </p>
      )}
    </div>
  )
}

interface SuggestedPrompt {
  en: string
  ar: string
}

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { en: 'What approvals need me today?',   ar: 'ما الموافقات التي تحتاجني اليوم؟'  },
  { en: 'Show document expiry alerts',      ar: 'اعرض تنبيهات انتهاء صلاحية المستندات' },
  { en: 'Who is on leave this week?',       ar: 'من في إجازة هذا الأسبوع؟'           },
  { en: 'Emiratisation status report',      ar: 'تقرير حالة التوطين'                  },
]

interface Props {
  kpis:       AriaOSKpis
  sessionCtx: AriaSessionContext
  locale:     'en' | 'ar'
  userName:   string
  onPromptClick?: (prompt: string) => void
  onReasoningStep?: (step: ReasoningStep) => void
}

export default function AriaOSHome({ kpis, sessionCtx, locale, userName, onPromptClick, onReasoningStep }: Props) {
  const [briefing, setBriefing]     = useState<string | null>(null)
  const [briefingError, setBriefingError] = useState(false)
  const [briefLoading, setBriefLoading]   = useState(true)
  const isRtl = locale === 'ar'

  const firstName = userName.split(' ')[0]
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12
    ? (isRtl ? `صباح الخير، ${firstName}` : `Good morning, ${firstName}`)
    : hour < 17
    ? (isRtl ? `مساء الخير، ${firstName}` : `Good afternoon, ${firstName}`)
    : (isRtl ? `مساء النور، ${firstName}` : `Good evening, ${firstName}`)

  const dateLabel = now.toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-AE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const text = await generateDailyBriefing(kpis, sessionCtx)
        if (cancelled) return
        setBriefing(text)
        if (onReasoningStep) {
          onReasoningStep({ id: 'brief-1', description: 'Generated daily HR briefing from live data', time: new Date().toLocaleTimeString() })
        }
      } catch (err) {
        if (cancelled) return
        console.error('[ARIA Briefing]', err)
        setBriefingError(true)
      } finally {
        if (!cancelled) setBriefLoading(false)
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emirDisplay = kpis.emiratisationPct != null
    ? `${kpis.emiratisationPct.toFixed(1)}%`
    : '—'

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}
    >
      {/* KPI Row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard
          label={locale === 'ar' ? 'إجمالي الموظفين' : 'Headcount'}
          value={kpis.headcount > 0 ? kpis.headcount.toLocaleString() : '—'}
          subtext={locale === 'ar' ? 'موظف نشط' : 'active employees'}
        />
        <KpiCard
          label={locale === 'ar' ? 'نسبة التوطين' : 'Emiratisation'}
          value={emirDisplay}
          subtext={locale === 'ar' ? 'من إجمالي القوى العاملة' : 'of total workforce'}
          accent={kpis.emiratisationPct != null && kpis.emiratisationPct < 4}
        />
        <KpiCard
          label={locale === 'ar' ? 'الموافقات المعلقة' : 'Pending Approvals'}
          value={kpis.pendingApprovals > 0 ? String(kpis.pendingApprovals) : '0'}
          subtext={locale === 'ar' ? 'تحتاج إجراء' : 'require action'}
          accent={kpis.pendingApprovals > 0}
        />
        <KpiCard
          label={locale === 'ar' ? 'طلبات التوظيف المفتوحة' : 'Open Headcount Reqs'}
          value="—"
          subtext={locale === 'ar' ? 'قريباً' : 'coming soon'}
        />
        <KpiCard
          label={locale === 'ar' ? 'معدل الاستقالات' : 'Voluntary Attrition'}
          value="—"
          subtext={locale === 'ar' ? 'قريباً' : 'coming soon'}
        />
        <KpiCard
          label={locale === 'ar' ? 'مخصص نهاية الخدمة' : 'EOSB Provision'}
          value="—"
          subtext={locale === 'ar' ? 'قريباً' : 'coming soon'}
        />
      </div>

      {/* Two-panel row */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, flexWrap: 'wrap' }}>

        {/* Daily Briefing */}
        <div style={{
          flex: '1 1 340px',
          minWidth: 0,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 20px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 'var(--text-caption)',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-2)',
              fontFamily: 'var(--font-mono, monospace)',
            }}>
              {locale === 'ar' ? 'إحاطة يومية' : 'DAILY BRIEFING'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--status-approved-fg, var(--accent))',
                display: 'inline-block',
                flexShrink: 0,
                animation: 'aria-pulse 2s infinite',
              }} />
              <span style={{
                fontSize: 'var(--text-caption)',
                fontWeight: 700,
                color: 'var(--status-approved-fg, var(--accent))',
              }}>
                {locale === 'ar' ? 'ARIA نشطة' : 'ARIA ACTIVE'}
              </span>
            </div>
          </div>
          <div style={{ padding: '18px 20px', flex: 1, overflowY: 'auto' }}>
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: '0 0 4px' }}>{dateLabel}</p>
            <p style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)', margin: '0 0 14px' }}>{greeting}</p>
            {briefLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-3)', fontSize: 'var(--text-body)' }}>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                {locale === 'ar' ? 'يجهّز ARIA إحاطتك...' : 'ARIA is preparing your briefing…'}
              </div>
            ) : briefing ? (
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>
                {briefing}
              </p>
            ) : briefingError ? (
              <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', lineHeight: 1.5 }}>
                <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--ink-2)' }}>
                  {locale === 'ar' ? 'تعذّر تحميل الإحاطة' : 'Briefing unavailable'}
                </p>
                <p style={{ margin: 0, fontSize: 'var(--text-caption)' }}>
                  {locale === 'ar'
                    ? 'تأكد من إعداد ARIA API وأن المفتاح صحيح.'
                    : 'Check that the ARIA API key is configured in Settings → AI Agent.'}
                </p>
              </div>
            ) : (
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', margin: 0 }}>
                {locale === 'ar' ? 'لا توجد بيانات إحاطة.' : 'No briefing data available.'}
              </p>
            )}
          </div>
        </div>

        {/* Ask ARIA */}
        <div style={{
          flex: '1 1 280px',
          minWidth: 0,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 20px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 'var(--text-caption)',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-2)',
              fontFamily: 'var(--font-mono, monospace)',
            }}>
              {locale === 'ar' ? 'اسأل آريا' : 'ASK ARIA'}
            </span>
            <span style={{
              fontSize: 'var(--text-caption)',
              fontWeight: 700,
              padding: '2px 10px',
              borderRadius: 10,
              background: 'var(--status-approved-bg)',
              color: 'var(--status-approved-fg)',
              border: '1px solid color-mix(in srgb, var(--status-approved-fg) 40%, transparent)',
            }}>
              {locale === 'ar' ? 'جاهز' : 'Ready'}
            </span>
          </div>
          <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SUGGESTED_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => onPromptClick?.(locale === 'ar' ? p.ar : p.en)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--ink-2)',
                  fontSize: 'var(--text-body)',
                  cursor: 'pointer',
                  textAlign: isRtl ? 'right' : 'left',
                  fontFamily: 'var(--font-sans)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.color = 'var(--accent)'
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, transparent)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.color = 'var(--ink-2)'
                  e.currentTarget.style.background = 'var(--card)'
                }}
              >
                <span>{locale === 'ar' ? p.ar : p.en}</span>
                <ArrowRight size={14} style={{ flexShrink: 0,
                marginLeft: 'auto' }} aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
