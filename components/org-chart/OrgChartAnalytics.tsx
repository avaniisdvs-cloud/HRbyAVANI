'use client'

import { useState, useEffect }           from 'react'
import { X, AlertTriangle, CheckCircle } from 'lucide-react'
import { useLocale }                     from '@/components/providers/LocaleProvider'
import { getOrgChartPendingCounts }      from '@/modules/core-hr/org-chart-actions'
import type { OrgTreeMeta, OrgFlowNode } from '@/lib/org-chart/types'

interface OrgChartAnalyticsProps {
  meta:    OrgTreeMeta
  nodes:   OrgFlowNode[]
  onClose: () => void
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.07em', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)',
      marginBottom: 12, textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function StatRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 7 }}>
      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>{label}</span>
      <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>
        {value}{sub && <span style={{ fontSize: 'var(--text-caption)', fontWeight: 400, color: 'var(--ink-3)',
        marginLeft: 4 }}>{sub}</span>}
      </span>
    </div>
  )
}

function ProgressBar({ filledPct, color = 'var(--accent)', bgColor = 'var(--org-vacant)' }: { filledPct: number; color?: string; bgColor?: string }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: bgColor, overflow: 'hidden',
    marginTop: 8,
    marginBottom: 4 }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, filledPct))}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function daysSince(d?: string): number {
  if (!d) return 0
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
}

export function OrgChartAnalytics({ meta, nodes, onClose }: OrgChartAnalyticsProps) {
  const locale = useLocale()
  const [pendingCounts, setPendingCounts] = useState<{ hiringRequests: number; transferRequests: number } | null>(null)

  useEffect(() => {
    void getOrgChartPendingCounts().then(res => {
      setPendingCounts({ hiringRequests: res.hiringRequests, transferRequests: res.transferRequests })
    })
  }, [])

  // ── Headcount calculations ────────────────────────────────────────────────
  const total     = meta.totalPositions || 1  // avoid /0
  const occupiedPct = Math.round((meta.occupiedCount / total) * 100)
  const vacantPct   = Math.round((meta.vacantCount   / total) * 100)

  const contractorCount = nodes.filter(n => n.data.employmentType === 'CONTRACTOR').length

  // ── Span of control ───────────────────────────────────────────────────────
  const managersWithReports  = nodes.filter(n => (n.data.directReportsCount ?? 0) > 0)
  const managersZeroReports  = nodes.filter(n => n.data.isManagementRole && (n.data.directReportsCount ?? 0) === 0)
  const managersOverloaded   = nodes.filter(n => (n.data.directReportsCount ?? 0) > 8)

  const avgSpan = managersWithReports.length > 0
    ? (managersWithReports.reduce((sum, n) => sum + (n.data.directReportsCount ?? 0), 0) / managersWithReports.length).toFixed(1)
    : '—'

  const top3Teams = [...managersWithReports]
    .sort((a, b) => (b.data.directReportsCount ?? 0) - (a.data.directReportsCount ?? 0))
    .slice(0, 3)

  // ── Emiratisation ─────────────────────────────────────────────────────────
  const emiratiTargetNodes  = nodes.filter(n => n.data.isEmiratisationTarget === true)
  const emiratiFilledNodes  = emiratiTargetNodes.filter(n => n.data.nationalityCategory === 'UAE_NATIONAL')
  const emiratiTargetCount  = emiratiTargetNodes.length
  const emiratiFilledCount  = emiratiFilledNodes.length
  const emiratiPct          = emiratiTargetCount > 0
    ? Math.round((emiratiFilledCount / emiratiTargetCount) * 100)
    : 0

  return (
    <div style={{
      position:    'fixed',
      right:       0,
      top:         56,
      height:      'calc(100vh - 56px)',
      width:       360,
      background:  'var(--card)',
      borderLeft:  '1px solid var(--border)',
      boxShadow:   '-4px 0 20px rgba(0,0,0,0.08)',
      overflowY:   'auto',
      zIndex:      40,
      display:     'flex',
      flexDirection:'column',
    }}>

      {/* Sticky header */}
      <div style={{
        position:     'sticky',
        top:          0,
        height:       52,
        display:      'flex',
        alignItems:   'center',
        justifyContent:'space-between',
        padding:      '0 20px',
        background:   'var(--card)',
        borderBottom: '1px solid var(--border)',
        zIndex:       1,
        flexShrink:   0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📊</span>
          <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)' }}>
            {locale === 'ar' ? 'التحليلات' : 'Analytics'}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4 }}
          aria-label={locale === 'ar' ? 'إغلاق التحليلات' : 'Close analytics'}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      {/* ── Section 1: Headcount ────────────────────────────────────────── */}
      <Section title={locale === 'ar' ? 'القوى العاملة' : 'Headcount'}>
        <StatRow label={locale === 'ar' ? 'إجمالي المناصب' : 'Total Positions'}     value={meta.totalPositions} />
        <StatRow label={locale === 'ar' ? 'مشغولة' : 'Occupied'}            value={meta.occupiedCount}  sub={`(${occupiedPct}%)`} />
        <StatRow label={locale === 'ar' ? 'شاغرة' : 'Vacant'}              value={meta.vacantCount}    sub={`(${vacantPct}%)`}   />
        <StatRow label={locale === 'ar' ? 'تكليفات بالإنابة' : 'Acting Assignments'}  value={meta.actingCount}    />
        <StatRow label={locale === 'ar' ? 'مجمّدة (معلّقة)' : 'Frozen (On Hold)'}    value={meta.frozenCount}    />
        <StatRow label={locale === 'ar' ? 'المتعاقدون' : 'Contractors'}         value={contractorCount}     />
        <ProgressBar filledPct={occupiedPct} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
          <span style={{ color: 'var(--brand-active)' }}>■ {locale === 'ar' ? 'مشغولة' : 'Occupied'} {occupiedPct}%</span>
          <span>■ {locale === 'ar' ? 'شاغرة' : 'Vacant'} {vacantPct}%</span>
        </div>
      </Section>

      {/* ── Section 2: Span of Control ──────────────────────────────────── */}
      <Section title={locale === 'ar' ? 'نطاق الإشراف' : 'Span of Control'}>
        <StatRow label={locale === 'ar' ? 'متوسط المرؤوسين المباشرين / مدير' : 'Avg direct reports / manager'} value={avgSpan} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 6 }}>
          {managersZeroReports.length > 0 && (
            <AlertTriangle size={13} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
          )}
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>
            {locale === 'ar' ? 'مدراء بلا مرؤوسين:' : 'Managers with 0 reports:'}
          </span>
          <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)',
          marginLeft: 'auto' }}>
            {managersZeroReports.length}
          </span>
        </div>
        {managersZeroReports.length > 0 && (
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--warning, #f59e0b)', fontFamily: 'var(--font-sans)',
          marginBottom: 8 }}>{locale === 'ar' ? 'يُنصح بالمراجعة' : 'Review suggested'}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 6 }}>
          {managersOverloaded.length > 0 && (
            <AlertTriangle size={13} style={{ color: 'var(--error, #ef4444)', flexShrink: 0 }} />
          )}
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>
            {locale === 'ar' ? 'مدراء لديهم أكثر من 8 مرؤوسين:' : 'Managers with >8 reports:'}
          </span>
          <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)',
          marginLeft: 'auto' }}>
            {managersOverloaded.length}
          </span>
        </div>
        {managersOverloaded.length > 0 && (
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--error, #ef4444)', fontFamily: 'var(--font-sans)',
          marginBottom: 8 }}>{locale === 'ar' ? 'خطر الإفراط في الأعباء' : 'Risk of overload'}</div>
        )}

        {top3Teams.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)',
            marginBottom: 6 }}>{locale === 'ar' ? 'أكبر 3 فرق' : 'Top 3 largest teams'}</div>
            {top3Teams.map(n => (
              <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>
                    {n.data.fullNameEn ?? n.data.positionTitleEn}
                  </div>
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
                    {n.data.deptNameEn}
                  </div>
                </div>
                <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--brand-active)', fontFamily: 'var(--font-sans)' }}>
                  {n.data.directReportsCount} {locale === 'ar' ? 'مرؤوس' : 'reports'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Section 3: Vacancy Analysis ─────────────────────────────────── */}
      <Section title={locale === 'ar' ? 'تحليل الشواغر' : 'Vacancy Analysis'}>
        {(() => {
          const vacantNodes = nodes.filter(n => n.type === 'vacant' || n.type === 'frozen')
          const over30 = vacantNodes.filter(n => daysSince(n.data.vacancyStartDate) > 30).length
          const over60 = vacantNodes.filter(n => daysSince(n.data.vacancyStartDate) > 60).length
          const over90 = vacantNodes.filter(n => daysSince(n.data.vacancyStartDate) > 90).length
          return (
            <>
              <StatRow label={locale === 'ar' ? 'شاغرة لأكثر من 30 يومًا' : 'Open > 30 days'} value={over30} />
              <StatRow label={locale === 'ar' ? 'شاغرة لأكثر من 60 يومًا' : 'Open > 60 days'} value={over60} />
              <StatRow label={locale === 'ar' ? 'شاغرة لأكثر من 90 يومًا' : 'Open > 90 days'} value={over90} />
            </>
          )
        })()}
        <StatRow label={locale === 'ar' ? 'مجمّدة' : 'Frozen'} value={meta.frozenCount} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 8,
        paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>{locale === 'ar' ? 'طلبات التوظيف المعلّقة' : 'Pending hiring requests'}</span>
          {pendingCounts === null
            ? <span style={{ width: 16, height: 16,
            borderTopWidth: "2px",
            borderTopStyle: "solid",
            borderRightWidth: "2px",
            borderRightStyle: "solid",
            borderRightColor: "var(--accent)",
            borderBottomWidth: "2px",
            borderBottomStyle: "solid",
            borderBottomColor: "var(--accent)",
            borderLeftWidth: "2px",
            borderLeftStyle: "solid",
            borderLeftColor: "var(--accent)",
            borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
            : <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>{pendingCounts.hiringRequests}</span>
          }
        </div>
      </Section>

      {/* ── Section 4: Emiratisation ─────────────────────────────────────── */}
      <Section title={locale === 'ar' ? 'التوطين' : 'Emiratisation'}>
        <StatRow label={locale === 'ar' ? 'الأدوار المستهدفة' : 'Target roles'}           value={emiratiTargetCount} />
        <StatRow label={locale === 'ar' ? 'مشغولة بمواطن إماراتي' : 'Filled by UAE National'} value={emiratiFilledCount} />
        <StatRow label={locale === 'ar' ? 'نسبة الامتثال %' : 'Compliance %'}           value={`${emiratiPct}%`}   />
        <ProgressBar filledPct={emiratiPct} />
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          {emiratiPct >= 75 ? (
            <>
              <CheckCircle size={12} style={{ color: 'var(--success, #22c55e)' }} />
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--success, #22c55e)', fontFamily: 'var(--font-sans)' }}>{locale === 'ar' ? 'ضمن المسار' : 'On track'}</span>
            </>
          ) : (
            <>
              <AlertTriangle size={12} style={{ color: 'var(--warning, #f59e0b)' }} />
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--warning, #f59e0b)', fontFamily: 'var(--font-sans)' }}>{locale === 'ar' ? 'دون المستهدف' : 'Below target'}</span>
            </>
          )}
        </div>
      </Section>

      {/* ── Section 5: Pending Actions ──────────────────────────────────── */}
      <Section title={locale === 'ar' ? 'إجراءات معلّقة' : 'Pending Actions'}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8 }}>
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>{locale === 'ar' ? 'طلبات التوظيف المعلّقة' : 'Hiring requests pending'}</span>
          {pendingCounts === null
            ? <span style={{ width: 16, height: 16,
            borderTopWidth: "2px",
            borderTopStyle: "solid",
            borderRightWidth: "2px",
            borderRightStyle: "solid",
            borderRightColor: "var(--accent)",
            borderBottomWidth: "2px",
            borderBottomStyle: "solid",
            borderBottomColor: "var(--accent)",
            borderLeftWidth: "2px",
            borderLeftStyle: "solid",
            borderLeftColor: "var(--accent)",
            borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
            : <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>{pendingCounts.hiringRequests}</span>
          }
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12 }}>
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>{locale === 'ar' ? 'طلبات النقل المعلّقة' : 'Transfer requests pending'}</span>
          {pendingCounts === null
            ? <span style={{ width: 16, height: 16,
            borderTopWidth: "2px",
            borderTopStyle: "solid",
            borderRightWidth: "2px",
            borderRightStyle: "solid",
            borderRightColor: "var(--accent)",
            borderBottomWidth: "2px",
            borderBottomStyle: "solid",
            borderBottomColor: "var(--accent)",
            borderLeftWidth: "2px",
            borderLeftStyle: "solid",
            borderLeftColor: "var(--accent)",
            borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
            : <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>{pendingCounts.transferRequests}</span>
          }
        </div>
        <a
          href="/admin/master-data"
          style={{ display: 'inline-block', fontSize: 'var(--text-caption)', color: 'var(--brand-active)', fontFamily: 'var(--font-sans)', fontWeight: 500, textDecoration: 'none' }}
        >
          {locale === 'ar' ? 'عرض الكل ←' : 'View all →'}
        </a>
      </Section>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
