'use client'

import { useState, useEffect } from 'react'
import {
  Shield, FileText, FileCheck, Users,
  GitBranch, CreditCard, Award,
  AlertCircle, CheckCircle, ChevronRight,
} from 'lucide-react'
import { getComplianceData } from '@/modules/aria'
import type { ComplianceData } from '@/modules/aria'

interface Props {
  onAskAria: (prompt: string) => void
}

// ── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r   = 42
  const cx  = 56
  const cy  = 56
  const circ = 2 * Math.PI * r
  const dash = circ * (score / 100)

  return (
    <svg width={112} height={112} viewBox="0 0 112 112" style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={10} />
      {/* Progress */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={circ / 4}
        style={{ transition: 'stroke-dasharray 0.9s ease' }}
      />
      {/* Label */}
      <text
        x={cx} y={cy - 6}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize={22}
        fontWeight={700}
        fontFamily="var(--font-sans)"
      >
        {score}
      </text>
      <text
        x={cx} y={cy + 14}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--ink-4)"
        fontSize={10}
        fontFamily="var(--font-sans)"
      >
        /100
      </text>
    </svg>
  )
}

// ── Area Card ─────────────────────────────────────────────────────────────────

interface AreaCardProps {
  icon:    React.ReactNode
  title:   string
  detail:  string[]
  ok:      boolean
  prompt:  string
  loading: boolean
  onAskAria: (p: string) => void
}

function AreaCard({ icon, title, detail, ok, prompt, loading, onAskAria }: AreaCardProps) {
  if (loading) {
    return (
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
      }}>
        <div style={{ height: 72, background: 'var(--surface)', borderRadius: 8 }} />
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${!ok ? 'color-mix(in srgb, var(--status-rejected-fg) 30%, transparent)' : 'var(--border)'}`,
      borderRadius: 12,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: ok ? 'var(--status-approved-bg)' : 'var(--status-rejected-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: ok ? 'var(--status-approved-fg)' : 'var(--status-rejected-fg)',
            flexShrink: 0,
          }}>
            {icon}
          </div>
          <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
            {title}
          </span>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 999,
          fontSize: 'var(--text-caption)', fontWeight: 700,
          background: ok ? 'var(--status-approved-bg)' : 'var(--status-rejected-bg)',
          color:      ok ? 'var(--status-approved-fg)' : 'var(--status-rejected-fg)',
        }}>
          {ok ? <CheckCircle size={9} /> : <AlertCircle size={9} />}
          {ok ? 'OK' : 'Action Required'}
        </span>
      </div>

      {/* Detail lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {detail.map(d => (
          <p key={d} style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{d}</p>
        ))}
      </div>

      {/* Ask ARIA */}
      <button
        onClick={() => onAskAria(prompt)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          marginTop: 'auto', padding: '5px 10px', borderRadius: 7,
          cursor: 'pointer', fontSize: 'var(--text-caption)', fontWeight: 500,
          background: 'transparent', color: 'var(--brand-active)',
          border: '1px solid var(--accent)', alignSelf: 'flex-start',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Ask ARIA <ChevronRight size={11} />
      </button>
    </div>
  )
}

// ── Main View ────────────────────────────────────────────────────────────────

export default function AriaComplianceView({ onAskAria }: Props) {
  const [data, setData]      = useState<ComplianceData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      try {
        const d = await getComplianceData()
        setData(d)
      } catch (e) {
        console.error('[Compliance]', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const scoreColor = !data ? 'var(--ink-3)'
    : data.score >= 80 ? 'var(--status-approved-fg)'
    : data.score >= 60 ? 'var(--status-warning-fg)'
    : 'var(--status-rejected-fg)'

  const areas: Omit<AreaCardProps, 'loading' | 'onAskAria'>[] = data ? [
    {
      icon:   <FileText size={15} />,
      title:  'Document Compliance',
      detail: [
        `Expired: ${data.expiredDocs}`,
        `Expiring within 30d: ${data.expiringDocs30}`,
        `Current: ${data.allDocsCurrent}`,
      ],
      ok:     data.expiredDocs === 0,
      prompt: 'Summarise current document compliance status — expired passports, visas, and Emirates IDs — and list employees who need action.',
    },
    {
      icon:   <FileCheck size={15} />,
      title:  'Contract Renewals',
      detail: [
        `Expired contracts: ${data.expiredContracts}`,
        `Expiring within 30d: ${data.expiringContracts30}`,
      ],
      ok:     data.expiredContracts === 0 && data.expiringContracts30 === 0,
      prompt: 'List all employees with expiring or expired contracts and recommended next steps for each.',
    },
    {
      icon:   <Award size={15} />,
      title:  'Emiratisation',
      detail: [
        `Current: ${data.emiratisationPct != null ? data.emiratisationPct.toFixed(1) + '%' : 'N/A'}`,
        `Target: 4%`,
        `Gap: ${data.emiratisationPct != null ? Math.max(0, 4 - data.emiratisationPct).toFixed(1) + '%' : 'N/A'}`,
      ],
      ok:     data.emiratisationPct != null && data.emiratisationPct >= 4,
      prompt: 'Give me an Emiratisation status report with current percentage, gap to 4% target, and recommended actions.',
    },
    {
      icon:   <GitBranch size={15} />,
      title:  'Pending Approvals',
      detail: [
        `Pending: ${data.pendingApprovals}`,
        `SLA Breached: ${data.slaBreachedCount}`,
      ],
      ok:     data.pendingApprovals < 5 && data.slaBreachedCount === 0,
      prompt: 'List all pending approvals with SLA deadlines. Highlight any SLA breaches and suggest priority order.',
    },
    {
      icon:   <CreditCard size={15} />,
      title:  'WPS Status',
      detail: ['Real-time WPS data available via ARIA'],
      ok:     true,
      prompt: 'What is the current WPS (Wage Protection System) status? Are all salaries paid on time this month?',
    },
    {
      icon:   <Users size={15} />,
      title:  'GPSSA',
      detail: ['Real-time GPSSA data via ARIA'],
      ok:     true,
      prompt: 'What is the current GPSSA contribution status? Are all UAE national employees enrolled and contributions submitted?',
    },
  ] : []

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24, background: 'var(--bg)', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{
          margin: 0, fontSize: 20, fontWeight: 700,
          fontFamily: 'var(--font-serif)', color: 'var(--ink-1)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Shield size={20} /> Compliance Overview
        </h2>
      </div>

      {/* Summary banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20,
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 20,
      }}>
        {/* Score ring */}
        {loading ? (
          <div style={{ width: 112, height: 112, borderRadius: '50%', background: 'var(--surface)', flexShrink: 0 }} />
        ) : (
          <ScoreRing score={data?.score ?? 0} color={scoreColor} />
        )}

        {/* Description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: '0 0 4px', fontSize: 'var(--text-caption)', fontWeight: 700,
            color: 'var(--ink-3)', textTransform: 'uppercase',
            letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)',
          }}>
            Compliance Score
          </p>
          {loading ? (
            <div style={{ height: 16, width: 160, background: 'var(--surface)', borderRadius: 4, marginBottom: 6 }} />
          ) : (
            <p style={{ margin: '0 0 6px', fontSize: 14, color: 'var(--ink-2)' }}>
              {data && data.score >= 80
                ? 'All critical compliance areas are in good standing.'
                : data && data.score >= 60
                ? 'Some areas require attention. Review action-required cards below.'
                : 'Multiple compliance issues need immediate attention.'}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data && [
              { label: 'Expired Docs', value: data.expiredDocs, bad: data.expiredDocs > 0 },
              { label: 'Expired Contracts', value: data.expiredContracts, bad: data.expiredContracts > 0 },
              { label: 'SLA Breached', value: data.slaBreachedCount, bad: data.slaBreachedCount > 0 },
            ].map(p => (
              <span key={p.label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 9px', borderRadius: 999,
                fontSize: 'var(--text-caption)', fontWeight: 600,
                background: p.bad ? 'var(--status-rejected-bg)' : 'var(--surface)',
                color:      p.bad ? 'var(--status-rejected-fg)' : 'var(--ink-4)',
                border: p.bad ? 'none' : '1px solid var(--border)',
              }}>
                {p.value} {p.label}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={() => onAskAria('Give me a comprehensive compliance overview including document status, contracts, Emiratisation, WPS, and GPSSA.')}
          style={{
            flexShrink: 0, padding: '8px 16px', borderRadius: 8,
            cursor: 'pointer', fontSize: 'var(--text-caption)', fontWeight: 600,
            background: 'transparent', color: 'var(--brand-active)',
            border: '1px solid var(--accent)', fontFamily: 'var(--font-sans)',
          }}
        >
          Full Report
        </button>
      </div>

      {/* 2-column card grid */}
      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <AreaCard
                key={i}
                icon={null}
                title=""
                detail={[]}
                ok
                prompt=""
                loading
                onAskAria={onAskAria}
              />
            ))
          : areas.map(area => (
              <AreaCard
                key={area.title}
                {...area}
                loading={false}
                onAskAria={onAskAria}
              />
            ))
        }
      </div>
    </div>
  )
}
