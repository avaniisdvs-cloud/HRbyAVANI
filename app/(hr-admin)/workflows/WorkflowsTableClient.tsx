'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useMemo } from 'react'
import Link from 'next/link'
import { Inbox, AlertTriangle } from 'lucide-react'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { useTableSort } from '@/hooks/useTableSort'
import { formatDMYTime } from '@/lib/utils'

type WorkflowRow = {
  instanceId:    string
  workflowNameEn: string
  workflowCode:   string
  initiatorName:  string
  stepOrder:      number
  stepName:       string
  startedAt:      Date
  slaDeadline:    Date | null
  isBreached:     boolean
}

type Props = {
  rows:     WorkflowRow[]
  locale:   string
  userRole: string
}

function StatusPill({ breached, locale }: { breached: boolean; locale: string }) {
  if (breached) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)',
        borderRadius: 999, padding: '3px 10px',
        fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
        flexShrink: 0,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-rejected-dot)' }} />
        {locale === 'ar' ? 'متأخّر' : 'BREACHED'}
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: 'var(--status-pending-bg)', color: 'var(--status-pending-fg)',
      borderRadius: 999, padding: '3px 10px',
      fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
      flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-pending-dot)' }} />
      {locale === 'ar' ? 'معلّق' : 'PENDING'}
    </span>
  )
}

export function WorkflowsTableClient({ rows, locale, userRole }: Props) {
  const { sort, handleSort } = useTableSort('startedAt', 'desc')

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return rows
    return [...rows].sort((a, b) => {
      let aVal: string | number | Date = ''
      let bVal: string | number | Date = ''
      switch (sort.column) {
        case 'workflow':
          aVal = a.workflowNameEn ?? ''
          bVal = b.workflowNameEn ?? ''
          break
        case 'initiator':
          aVal = a.initiatorName
          bVal = b.initiatorName
          break
        case 'stage':
          aVal = a.stepOrder
          bVal = b.stepOrder
          break
        case 'startedAt':
          aVal = a.startedAt
          bVal = b.startedAt
          break
        case 'slaDeadline':
          aVal = a.slaDeadline ?? new Date(0)
          bVal = b.slaDeadline ?? new Date(0)
          break
        default:
          return 0
      }
      if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [rows, sort])

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12,
    }}>
      <div style={{ flexShrink: 0, padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
          My queue ({userRole})
        </h3>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortableHeader
                label={locale === 'ar' ? 'سير العمل' : 'Workflow'}
                column="workflow"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={handleSort}
              />
              <SortableHeader
                label={locale === 'ar' ? 'المقدِّم' : 'Initiator'}
                column="initiator"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={handleSort}
              />
              <SortableHeader
                label={locale === 'ar' ? 'المرحلة' : 'Stage'}
                column="stage"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={handleSort}
              />
              <SortableHeader
                label={locale === 'ar' ? 'أُرسل في' : 'Submitted'}
                column="startedAt"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={handleSort}
              />
              <SortableHeader
                label={locale === 'ar' ? 'موعد SLA' : 'SLA Deadline'}
                column="slaDeadline"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={handleSort}
              />
              <th style={{
                padding: '12px 20px', fontSize: 'var(--text-caption)', fontWeight: 700,
                color: 'var(--ink-3)', background: 'var(--surface)',
                borderBottom: '1px solid var(--border)', width: 100,
              }} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      background: 'var(--accent-100)', display: 'grid',
                      placeItems: 'center', color: 'var(--brand-active)',
                    }}>
                      <Inbox size={20} strokeWidth={1.75} />
                    </div>
                    <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--ink-1)' }}>
                      {locale === 'ar' ? 'أنجزت جميع المهام' : 'All caught up'}
                    </div>
                    <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', maxWidth: 300 }}>
                      {locale === 'ar' ? 'لا توجد موافقات معلقة معيّنة لدورك الآن.' : 'No pending approvals assigned to your role right now.'}
                    </div>
                  </div>
                </td>
              </tr>
            ) : sorted.map((r, i) => (
              <tr
                key={r.instanceId}
                className="hover:bg-surface"
                style={{
                  borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none',
                  background: r.isBreached ? 'var(--status-pending-bg)' : 'transparent',
                  transition: 'background 120ms',
                }}
              >
                <td style={{ padding: '14px 20px', verticalAlign: 'middle' }}>
                  <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
                    {r.workflowNameEn}
                  </div>
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {r.workflowCode}
                  </div>
                </td>
                <td style={{ padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', verticalAlign: 'middle' }}>
                  {r.initiatorName}
                </td>
                <td style={{ padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', verticalAlign: 'middle' }}>
                  {r.stepOrder}. {r.stepName}
                </td>
                <td style={{ padding: '14px 20px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {formatDMYTime(r.startedAt.toISOString())}
                </td>
                <td style={{ padding: '14px 20px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {r.slaDeadline ? (
                    <span style={{ fontSize: 'var(--text-caption)', fontFamily: 'var(--font-mono)', color: r.isBreached ? 'var(--status-rejected-fg)' : 'var(--ink-3)' }}>
                      {formatDMYTime(r.slaDeadline.toISOString())}
                    </span>
                  ) : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                  {r.isBreached && (
                    <div style={{ marginTop: 4 }}>
                      <StatusPill breached={true} locale={locale} />
                    </div>
                  )}
                </td>
                <td style={{ padding: '14px 20px', textAlign: 'right', verticalAlign: 'middle' }}>
                  <Link
                    href={`/workflows/${r.instanceId}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center',
                      background: 'var(--card)', border: '1px solid var(--border)',
                      color: 'var(--ink-1)', borderRadius: 6,
                      padding: '5px 12px', fontSize: 'var(--text-caption)', fontWeight: 600,
                      textDecoration: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    {locale === 'ar' ? 'مراجعة' : 'Review'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table></TableScrollRegion>
      </div>
    </div>
  )
}
