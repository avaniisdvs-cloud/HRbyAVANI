'use client'

import { SectionTitle } from '@/components/ui/typography'
import { useState, useEffect, useCallback } from 'react'
import {
  GitBranch, AlertTriangle, CheckCircle,
  RefreshCw, ChevronRight,
} from 'lucide-react'
import { getWorkflowSummary } from '@/modules/aria'
import type { WorkflowSummary, WorkflowItem } from '@/modules/aria'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import type { Locale } from '@/lib/i18n'

interface Props {
  onAskAria: (prompt: string) => void
}

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected' | 'sla'

const STATUS_CONFIG: Record<string, { label: string; labelAr: string; bg: string; fg: string }> = {
  PENDING:    { label: 'Pending',     labelAr: 'قيد الانتظار', bg: 'var(--status-pending-bg)',  fg: 'var(--status-pending-fg)'  },
  IN_PROGRESS:{ label: 'In Progress', labelAr: 'قيد التنفيذ',  bg: 'var(--status-pending-bg)',  fg: 'var(--status-pending-fg)'  },
  APPROVED:   { label: 'Approved',    labelAr: 'معتمد',        bg: 'var(--status-approved-bg)', fg: 'var(--status-approved-fg)' },
  REJECTED:   { label: 'Rejected',    labelAr: 'مرفوض',        bg: 'var(--status-rejected-bg)', fg: 'var(--status-rejected-fg)' },
  CANCELLED:  { label: 'Cancelled',   labelAr: 'ملغى',         bg: 'var(--surface)',            fg: 'var(--ink-3)'              },
  ESCALATED:  { label: 'Escalated',   labelAr: 'مُصعّد',        bg: 'var(--status-warning-bg)',  fg: 'var(--status-warning-fg)'  },
  ON_HOLD:    { label: 'On Hold',     labelAr: 'معلّق',         bg: 'var(--surface)',            fg: 'var(--ink-3)'              },
  RECALLED:   { label: 'Recalled',    labelAr: 'مُستدعى',       bg: 'var(--surface)',            fg: 'var(--ink-4)'              },
}

const TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  LEAVE:            { en: 'Leave',           ar: 'إجازة' },
  LEAVE_REQUEST:    { en: 'Leave Request',   ar: 'طلب إجازة' },
  SALARY_REVISION:  { en: 'Salary Change',   ar: 'تعديل راتب' },
  TERMINATION:      { en: 'Termination',     ar: 'إنهاء خدمة' },
  TRANSFER:         { en: 'Transfer',        ar: 'نقل' },
  HIRE:             { en: 'Hire',            ar: 'تعيين' },
  OVERTIME:         { en: 'Overtime',        ar: 'عمل إضافي' },
  EXIT_CLEARANCE:   { en: 'Exit Clearance',  ar: 'إخلاء طرف' },
  DOCUMENT_VERIFY:  { en: 'Document Verify', ar: 'تدقيق مستند' },
  DEPENDENT_ADD:    { en: 'Dependent Add',   ar: 'إضافة معال' },
}

function typeLabel(code: string, locale: Locale): string | undefined {
  const t = TYPE_LABELS[code]
  return t ? (locale === 'ar' ? t.ar : t.en) : undefined
}

function WorkflowRowCard({
  row,
  onAskAria,
  locale,
}: {
  row:       WorkflowItem
  onAskAria: (p: string) => void
  locale:    Locale
}) {
  const st = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.PENDING
  const stLabel = locale === 'ar' ? st.labelAr : st.label

  function askPrompt() {
    onAskAria(
      `Tell me about the ${typeLabel(row.triggerEvent, 'en') ?? row.workflowNameEn} workflow ` +
      `for ${row.initiatorName} submitted on ${row.startedAt}. ` +
      `Current status: ${row.status}, stage: ${row.currentStage}. ` +
      `What action is needed?`
    )
  }

  return (
    <div data-responsive-grid="true" style={{
      display: 'grid',
      gridTemplateColumns: '1fr 110px 110px 60px 80px 32px',
      gap: 8,
      alignItems: 'center',
      padding: '10px 14px',
      background: row.isBreached ? 'var(--status-rejected-bg)' : 'var(--card)',
      border: `1px solid ${row.isBreached ? 'var(--status-rejected-fg)' : 'var(--border)'}`,
      borderRadius: 8,
    }}>
      {/* Employee + type */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 2,
        }}>
          {row.initiatorName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {typeLabel(row.triggerEvent, locale) ?? row.workflowNameEn}
          </span>
          {row.isBreached && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--status-rejected-fg)', fontWeight: 700, flexShrink: 0 }}>
              <AlertTriangle size={9} /> SLA
            </span>
          )}
        </div>
      </div>

      {/* Status pill */}
      <div>
        <span style={{
          display: 'inline-flex',
          padding: '3px 8px',
          borderRadius: 999,
          fontSize: 'var(--text-caption)', fontWeight: 700,
          background: st.bg, color: st.fg,
          whiteSpace: 'nowrap',
        }}>
          {stLabel}
        </span>
      </div>

      {/* Approver role */}
      <div style={{
        fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {row.approverRole}
      </div>

      {/* Days open */}
      <div style={{
        fontSize: 'var(--text-caption)', fontWeight: 600, textAlign: 'center',
        color: row.daysOpen > 3 ? 'var(--status-rejected-fg)' : 'var(--ink-3)',
      }}>
        {row.daysOpen}d
      </div>

      {/* Dept */}
      <div style={{
        fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {row.department}
      </div>

      {/* Ask ARIA */}
      <button
        onClick={askPrompt}
        title={locale === 'ar' ? 'اسأل آريا عن سير العمل هذا' : 'Ask ARIA about this workflow'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--brand-active)', padding: 2,
          display: 'flex', alignItems: 'center',
        }}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}

export default function AriaWorkflowsView({ onAskAria }: Props) {
  const locale = useLocale()
  const [data, setData]           = useState<WorkflowSummary | null>(null)
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  const load = useCallback(() => {
    setLoading(true)
    ;(async () => {
      try {
        const result = await getWorkflowSummary()
        setData(result)
      } catch (err) {
        console.error('[AriaWorkflowsView]', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = (data?.rows ?? []).filter(r => {
    if (activeTab === 'all')      return true
    if (activeTab === 'pending')  return r.status === 'PENDING' || r.status === 'IN_PROGRESS'
    if (activeTab === 'approved') return r.status === 'APPROVED'
    if (activeTab === 'rejected') return r.status === 'REJECTED'
    if (activeTab === 'sla')      return r.isBreached
    return true
  })

  const TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all',      label: locale === 'ar' ? 'الكل' : 'All',                count: data?.rows.length ?? 0    },
    { key: 'pending',  label: locale === 'ar' ? 'قيد الانتظار' : 'Pending',     count: data?.pending ?? 0        },
    { key: 'approved', label: locale === 'ar' ? 'معتمد' : 'Approved',           count: data?.approvedToday ?? 0  },
    { key: 'rejected', label: locale === 'ar' ? 'مرفوض' : 'Rejected',           count: data?.rejectedToday ?? 0  },
    { key: 'sla',      label: locale === 'ar' ? '⚠ تجاوز SLA' : '⚠ SLA Breach', count: data?.slaBreached ?? 0    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '20px 24px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 12 }}>
          <div>
            <SectionTitle style={{
              fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600,
              color: 'var(--ink-1)', margin: '0 0 2px',
            }}>
              {locale === 'ar' ? 'حالة سير العمل' : 'Workflow Status'}
            </SectionTitle>
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: 0 }}>
              {loading
                ? tk(locale, 'common.loading')
                : locale === 'ar'
                  ? `${data?.rows.length ?? 0} ${(data?.rows.length ?? 0) === 1 ? 'سير عمل' : 'مسارات عمل'}`
                  : `${data?.rows.length ?? 0} workflow${(data?.rows.length ?? 0) !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* SLA breach alert button */}
            {!loading && (data?.slaBreached ?? 0) > 0 && (
              <button
                onClick={() => onAskAria(
                  `There are ${data!.slaBreached} workflow item${data!.slaBreached !== 1 ? 's' : ''} that ` +
                  `have breached SLA. Which are most urgent and what action should I take?`
                )}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px',
                  background: 'var(--status-rejected-bg)',
                  border: '1px solid var(--status-rejected-fg)',
                  borderRadius: 7, fontSize: 'var(--text-caption)',
                  color: 'var(--status-rejected-fg)', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}
              >
                <AlertTriangle size={12} />
                {locale === 'ar'
                  ? `${data!.slaBreached} ${data!.slaBreached === 1 ? 'تجاوز SLA' : 'تجاوزات SLA'}`
                  : `${data!.slaBreached} SLA breach${data!.slaBreached !== 1 ? 'es' : ''}`}
              </button>
            )}

            <button
              onClick={load}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 7, fontSize: 'var(--text-caption)', color: 'var(--ink-2)',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                fontFamily: 'var(--font-sans)',
              }}
            >
              <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {locale === 'ar' ? 'تحديث' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Summary pills */}
        {!loading && data && (
          <div style={{ display: 'flex', gap: 8,
          marginBottom: 12, flexWrap: 'wrap' }}>
            {[
              { label: locale === 'ar' ? 'قيد الانتظار' : 'Pending',        value: data.pending,       bg: 'var(--status-pending-bg)',  fg: 'var(--status-pending-fg)'  },
              { label: locale === 'ar' ? 'معتمد اليوم' : 'Approved today',   value: data.approvedToday, bg: 'var(--status-approved-bg)', fg: 'var(--status-approved-fg)' },
              { label: locale === 'ar' ? 'مرفوض اليوم' : 'Rejected today',   value: data.rejectedToday, bg: 'var(--status-rejected-bg)', fg: 'var(--status-rejected-fg)' },
              {
                label: locale === 'ar' ? 'تجاوز SLA' : 'SLA breached', value: data.slaBreached,
                bg: data.slaBreached > 0 ? 'var(--status-rejected-bg)' : 'var(--surface)',
                fg: data.slaBreached > 0 ? 'var(--status-rejected-fg)' : 'var(--ink-4)',
              },
            ].map(p => (
              <span key={p.label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 999,
                fontSize: 'var(--text-caption)', fontWeight: 600,
                background: p.bg, color: p.fg,
              }}>
                {p.value} {p.label}
              </span>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 14px',
                  borderTopWidth: "0px",
                  borderTopStyle: "none",
                  borderTopColor: "currentColor",
                  borderRightWidth: "0px",
                  borderRightStyle: "none",
                  borderRightColor: "currentColor",
                  borderLeftWidth: "0px",
                  borderLeftStyle: "none",
                  borderLeftColor: "currentColor", background: 'transparent',
                  cursor: 'pointer', fontSize: 'var(--text-caption)',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--brand-active)' : 'var(--ink-3)',
                  borderBottomWidth: "2px",
                  borderBottomStyle: "solid",
                  borderBottomColor: (isActive) ? "var(--accent)" : "transparent",
                  whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)',
                  marginBottom: -1,
                  transition: 'color 0.15s ease',
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span style={{
                    marginLeft: 5, padding: '1px 6px', borderRadius: 999,
                    fontSize: 'var(--text-caption)', fontWeight: 700,
                    background: isActive ? 'var(--accent)' : 'var(--surface)',
                    color: isActive ? 'white' : 'var(--ink-3)',
                    border: isActive ? 'none' : '1px solid var(--border)',
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table column headers */}
      {!loading && filtered.length > 0 && (
        <div data-responsive-grid="true" style={{
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 110px 110px 60px 80px 32px',
          gap: 8, padding: '8px 14px',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        }}>
          {(locale === 'ar'
            ? ['الموظف / النوع', 'الحالة', 'المعتمد', 'الأيام', 'القسم', '']
            : ['Employee / Type', 'Status', 'Approver', 'Days', 'Dept', '']).map((h, hi) => (
            <div key={h || `col-${hi}`} style={{
              fontSize: 'var(--text-caption)', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: 'var(--ink-4)',
            }}>
              {h}
            </div>
          ))}
        </div>
      )}

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ height: 56, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.6 }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          paddingTop: 60, gap: 12, textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--ink-4)',
            }}>
              <CheckCircle size={22} />
            </div>
            <div>
              <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-2)', margin: '0 0 4px', fontFamily: 'var(--font-serif)' }}>
                {locale === 'ar'
                  ? (activeTab === 'all' ? 'لا توجد مسارات عمل' : 'لا توجد مسارات عمل مطابقة')
                  : (activeTab === 'all' ? 'No workflows found' : `No ${activeTab} workflows`)}
              </p>
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: 0 }}>
                {locale === 'ar'
                  ? (activeTab === 'sla' ? 'جميع مسارات العمل ضمن اتفاقية مستوى الخدمة' : 'جرّب فلتراً مختلفاً')
                  : (activeTab === 'sla' ? 'All workflows are within SLA' : 'Try a different filter')}
              </p>
            </div>
          </div>
        )}

        {/* Rows */}
        {!loading && filtered.map(row => (
          <WorkflowRowCard key={row.instanceId} row={row} onAskAria={onAskAria} locale={locale} />
        ))}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
