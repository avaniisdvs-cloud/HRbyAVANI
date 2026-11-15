'use client'
/**
 * AriaRecommendationCard — Sprint 11 / Step 6
 *
 * Displays ARIA's leave approval recommendation to the approver.
 * Advisory only — final decision rests with the approver.
 *
 * States:
 *   - null → "recommendation unavailable" fallback (review manually)
 *   - APPROVE → green badge
 *   - REJECT  → red badge
 *   - REVIEW  → amber badge
 *
 * Design: inline styles + CSS token vars (ADR-001 — no raw hex).
 */
import { CheckCircle2, AlertTriangle, XCircle, Bot } from 'lucide-react'
import type { AriaLeaveRecommendation, AriaRecommendationFactor } from '@/modules/aria'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  recommendation: AriaLeaveRecommendation | null
  lang?: 'en' | 'ar'
}

// ── Recommendation badge config ───────────────────────────────────────────────

const BADGE_CONFIG = {
  APPROVE: {
    bg:    'var(--status-approved-bg, #dcfce7)',
    fg:    'var(--status-approved-fg, #166534)',
    label: { en: 'RECOMMEND APPROVE', ar: 'يُوصى بالموافقة' },
    icon:  <CheckCircle2 size={15} strokeWidth={2.5} />,
  },
  REJECT: {
    bg:    'var(--status-rejected-bg, #fee2e2)',
    fg:    'var(--status-rejected-fg, #991b1b)',
    label: { en: 'RECOMMEND REJECT', ar: 'يُوصى بالرفض' },
    icon:  <XCircle size={15} strokeWidth={2.5} />,
  },
  REVIEW: {
    bg:    'var(--status-warning-bg, #fef3c7)',
    fg:    'var(--status-warning-fg, #b45309)',
    label: { en: 'RECOMMEND REVIEW', ar: 'يُوصى بالمراجعة' },
    icon:  <AlertTriangle size={15} strokeWidth={2.5} />,
  },
} as const

// ── Factor status icon ────────────────────────────────────────────────────────

function FactorIcon({ status }: { status: 'OK' | 'WARN' | 'FAIL' }) {
  if (status === 'OK')   return <CheckCircle2  size={13} strokeWidth={2.5} style={{ color: 'var(--status-approved-fg, #166534)', flexShrink: 0 }} />
  if (status === 'WARN') return <AlertTriangle size={13} strokeWidth={2.5} style={{ color: 'var(--status-warning-fg, #b45309)',  flexShrink: 0 }} />
  return                        <XCircle       size={13} strokeWidth={2.5} style={{ color: 'var(--status-rejected-fg, #991b1b)', flexShrink: 0 }} />
}

// ── Factor row ────────────────────────────────────────────────────────────────

function FactorRow({ factor, lang }: { factor: AriaRecommendationFactor; lang: 'en' | 'ar' }) {
  const detail = lang === 'ar' ? factor.detailAr : factor.detailEn

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '6px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <FactorIcon status={factor.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-1)',
          minWidth: 110, display: 'inline-block',
        }}>
          {factor.factor}
        </span>
        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginLeft: 4 }}>
          {detail}
        </span>
      </div>
    </div>
  )
}

// ── Unavailable fallback ───────────────────────────────────────────────────────
// Shown when no recommendation could be generated (e.g. ARIA not configured, or
// generation failed). NEVER an indefinite in-progress/pending spinner — the
// approver is told plainly to review manually.

function Unavailable({ lang }: { lang: 'en' | 'ar' }) {
  const msg = lang === 'ar'
    ? 'توصية ARIA غير متاحة. يرجى مراجعة تفاصيل الطلب يدويًا.'
    : 'ARIA recommendation is unavailable. Please review the request details manually.'
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'color-mix(in srgb, var(--accent) 4%, var(--card))',
      }}>
        <Bot size={14} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          ARIA Recommendation
        </span>
      </div>
      <div style={{ padding: '16px', display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
        <AlertTriangle size={13} strokeWidth={2.5} style={{ color: 'var(--ink-4)', flexShrink: 0, marginTop: 1 }} />
        <span>{msg}</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AriaRecommendationCard({ recommendation: rec, lang = 'en' }: Props) {
  if (!rec) return <Unavailable lang={lang} />

  const cfg = BADGE_CONFIG[rec.recommendation]
  const summary = lang === 'ar' ? rec.summaryAr : rec.summaryEn
  const confidencePct = Math.round(rec.confidence * 100)

  const disclaimerEn = 'Advisory only — final decision rests with you'
  const disclaimerAr = 'للاستئناس فقط — القرار النهائي لكم'
  const disclaimer   = lang === 'ar' ? disclaimerAr : disclaimerEn

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'color-mix(in srgb, var(--accent) 4%, var(--card))',
      }}>
        <Bot size={14} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          ARIA Recommendation
        </span>
      </div>

      <div style={{ padding: '14px 16px' }}>
        {/* Badge row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10, gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: cfg.bg, color: cfg.fg,
            borderRadius: 999, padding: '5px 12px',
            fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.3px',
          }}>
            {cfg.icon}
            {cfg.label[lang]}
          </div>
          <span style={{
            fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
            fontFamily: 'var(--font-mono)',
          }}>
            {confidencePct}% confidence
          </span>
        </div>

        {/* Summary */}
        {summary && (
          <p style={{
            fontSize: 'var(--text-caption)', color: 'var(--ink-2)', margin: '0 0 10px 0',
            lineHeight: 1.5,
          }}>
            {summary}
          </p>
        )}

        {/* Factors */}
        {rec.factors.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            {rec.factors.map((f, i) => (
              <FactorRow key={i} factor={f} lang={lang} />
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <p style={{
          fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '10px 0 0 0',
          fontStyle: 'italic', letterSpacing: '0.1px',
        }}>
          {disclaimer}
        </p>
      </div>
    </div>
  )
}
