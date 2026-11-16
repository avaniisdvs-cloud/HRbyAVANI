'use client'

/**
 * Phase 5 — Pending Future Changes — Client Component.
 *
 * Displays all future-dated pending changes with filter tabs,
 * type badges, and optional cancel action for HR_DIRECTOR / SUPER_ADMIN.
 */

import { PageTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState } from 'react'
import { CalendarClock, CheckCircle2, Loader2 } from 'lucide-react'
import type { PendingChange } from './actions'
import { cancelFutureDatedChange } from './actions'

// ── Types ─────────────────────────────────────────────────────────────────────

type ChangeType = PendingChange['changeType'] | 'ALL'

const TAB_LABELS: { type: ChangeType; labelEn: string }[] = [
  { type: 'ALL',           labelEn: 'All' },
  { type: 'ASSIGNMENT',    labelEn: 'Assignments' },
  { type: 'LEAVE_PLAN',    labelEn: 'Leave Plan' },
  { type: 'WORK_SCHEDULE', labelEn: 'Work Schedule' },
  { type: 'PAYROLL',       labelEn: 'Payroll' },
  { type: 'SALARY',        labelEn: 'Salary' },
  { type: 'CONTRACT',      labelEn: 'Contracts' },
]

const TYPE_LABEL: Record<PendingChange['changeType'], string> = {
  ASSIGNMENT:    'Assignment',
  LEAVE_PLAN:    'Leave Plan',
  WORK_SCHEDULE: 'Work Schedule',
  PAYROLL:       'Payroll',
  SALARY:        'Salary',
  CONTRACT:      'Contract',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialData: PendingChange[]
  canCancel:   boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PendingChangesClient({ initialData, canCancel }: Props) {
  const [data, setData]           = useState<PendingChange[]>(initialData)
  const [activeTab, setActiveTab] = useState<ChangeType>('ALL')
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  const filtered = activeTab === 'ALL'
    ? data
    : data.filter(r => r.changeType === activeTab)

  const tabCount = (type: ChangeType): number =>
    type === 'ALL' ? data.length : data.filter(r => r.changeType === type).length

  function handleCancel(row: PendingChange) {
    if (pendingIds.has(row.id)) return

    setPendingIds(prev => new Set(prev).add(row.id))

    cancelFutureDatedChange(row.changeType, row.id).then(result => {
      setPendingIds(prev => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })

      if (result.error) {
        setErrors(prev => ({ ...prev, [row.id]: result.error! }))
      } else {
        setData(prev => prev.filter(r => r.id !== row.id))
        setErrors(prev => {
          const next = { ...prev }
          delete next[row.id]
          return next
        })
      }
    })
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12,
      marginBottom: 8 }}>
        <CalendarClock size={28} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />
        <div>
          <PageTitle style={{
            fontFamily:  'var(--font-serif)',
            fontSize:    22,
            fontWeight:  700,
            color:       'var(--ink-1)',
            margin:      0,
            lineHeight:  1.2,
          }}>
            Pending Future Changes
          </PageTitle>
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize:   'var(--text-body)',
            color:      'var(--ink-3)',
            marginRight: 0,
            marginBottom: 0,
            marginLeft: 0,
            marginTop:  2,
            direction:  'rtl',
            textAlign:  'right',
          }}>
            التغييرات المستقبلية المعلقة
          </p>
        </div>
        {/* Count badge */}
        <div style={{
          marginLeft:   'auto',
          background:   'var(--accent-100)',
          color:        'var(--brand-active)',
          borderRadius: 20,
          padding:      '4px 14px',
          fontFamily:   'var(--font-sans)',
          fontSize:     'var(--text-body)',
          fontWeight:   600,
          display:      'flex',
          alignItems:   'center',
          gap:          6,
        }}>
          <CalendarClock size={14} />
          {data.length} pending
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <div style={{
        display:       'flex',
        gap:           4,
        marginTop:     24,
        marginBottom:  20,
        borderBottom:  '1px solid var(--border)',
        paddingBottom: 0,
        flexWrap:      'wrap',
      }}>
        {TAB_LABELS.map(({ type, labelEn }) => {
          const isActive = activeTab === type
          const count    = tabCount(type)
          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              style={{
                padding:      '8px 16px',
                background:   'transparent',
                borderTopWidth: "0px",
                borderTopStyle: "none",
                borderTopColor: "currentColor",
                borderRightWidth: "0px",
                borderRightStyle: "none",
                borderRightColor: "currentColor",
                borderLeftWidth: "0px",
                borderLeftStyle: "none",
                borderLeftColor: "currentColor",
                borderBottomWidth: "2px",
                borderBottomStyle: "solid",
                borderBottomColor: (isActive) ? "var(--accent)" : "transparent",
                color:        isActive ? 'var(--brand-active)' : 'var(--ink-2)',
                fontFamily:   'var(--font-sans)',
                fontSize:     'var(--text-body)',
                fontWeight:   isActive ? 600 : 400,
                cursor:       'pointer',
                display:      'flex',
                alignItems:   'center',
                gap:          6,
                marginBottom: -1,
                transition:   'color 0.15s',
                whiteSpace:   'nowrap',
              }}
            >
              {labelEn}
              {count > 0 && (
                <span style={{
                  background:   isActive ? 'var(--accent)' : 'var(--surface)',
                  color:        isActive ? '#fff' : 'var(--ink-3)',
                  borderRadius: 10,
                  padding:      '1px 7px',
                  fontSize:     'var(--text-caption)',
                  fontWeight:   600,
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Table / Empty State ── */}
      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{
          background:   'var(--card)',
          border:       '1px solid var(--border)',
          borderRadius: 10,
          overflow:     'hidden',
        }}>
          <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Employee', 'Effective Date', 'Type', 'Description', canCancel ? 'Actions' : ''].filter(Boolean).map(col => (
                  <th key={col} style={{
                    padding:       '12px 16px',
                    textAlign:     'left',
                    fontFamily:    'var(--font-sans)',
                    fontSize:      'var(--text-caption)',
                    fontWeight:    600,
                    color:         'var(--ink-3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    background:    'var(--surface)',
                    whiteSpace:    'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const isRowPending = pendingIds.has(row.id)
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                      background:   'var(--card)',
                      transition:   'background 0.1s',
                      opacity:      isRowPending ? 0.6 : 1,
                    }}
                    onMouseEnter={e => { if (!isRowPending) e.currentTarget.style.background = 'var(--surface)' }}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--card)')}
                  >
                    {/* Employee */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
                        {row.personName}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
                      marginTop: 2 }}>
                        {row.personNumber}
                      </div>
                    </td>

                    {/* Effective Date */}
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-body)', color: 'var(--ink-1)' }}>
                        {formatDate(row.effectiveDate)}
                      </span>
                    </td>

                    {/* Type */}
                    <td style={{ padding: '12px 16px' }}>
                      <TypeBadge type={row.changeType} />
                    </td>

                    {/* Description */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
                        {row.description}
                      </span>
                    </td>

                    {/* Actions — only rendered when user has cancel permission */}
                    {canCancel && (
                      <td style={{ padding: '12px 16px' }}>
                        {row.canCancel ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            <button
                              onClick={() => handleCancel(row)}
                              disabled={isRowPending}
                              style={{
                                padding:      '5px 12px',
                                background:   'transparent',
                                border:       '1px solid var(--org-vacant)',
                                borderRadius: 6,
                                color:        'var(--org-vacant)',
                                fontFamily:   'var(--font-sans)',
                                fontSize:     'var(--text-caption)',
                                fontWeight:   500,
                                cursor:       isRowPending ? 'not-allowed' : 'pointer',
                                transition:   'all 0.15s',
                                display:      'flex',
                                alignItems:   'center',
                                gap:          6,
                              }}
                              onMouseEnter={e => {
                                if (!isRowPending) {
                                  e.currentTarget.style.background = 'var(--org-vacant)'
                                  e.currentTarget.style.color = '#fff'
                                }
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'transparent'
                                e.currentTarget.style.color = 'var(--org-vacant)'
                              }}
                            >
                              {isRowPending && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                              {isRowPending ? 'Cancelling…' : 'Cancel'}
                            </button>
                            {errors[row.id] && (
                              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-caption)', color: 'var(--org-vacant)' }}>
                                {errors[row.id]}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table></TableScrollRegion>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<PendingChange['changeType'], { bg: string; fg: string }> = {
  ASSIGNMENT:    { bg: 'color-mix(in srgb, #2563EB 12%, transparent)', fg: '#2563EB' },
  LEAVE_PLAN:    { bg: 'color-mix(in srgb, #7C3AED 12%, transparent)', fg: '#7C3AED' },
  WORK_SCHEDULE: { bg: 'color-mix(in srgb, #D97706 12%, transparent)', fg: '#D97706' },
  PAYROLL:       { bg: 'color-mix(in srgb, #0D7D8C 12%, transparent)', fg: '#0D7D8C' },
  SALARY:        { bg: 'color-mix(in srgb, #16A34A 12%, transparent)', fg: '#16A34A' },
  CONTRACT:      { bg: 'color-mix(in srgb, #DC2626 12%, transparent)', fg: '#DC2626' },
}

function TypeBadge({ type }: { type: PendingChange['changeType'] }) {
  const { bg, fg } = TYPE_COLORS[type]
  return (
    <span style={{
      display:      'inline-block',
      padding:      '3px 10px',
      borderRadius: 12,
      background:   bg,
      color:        fg,
      fontFamily:   'var(--font-sans)',
      fontSize:     'var(--text-caption)',
      fontWeight:   600,
      whiteSpace:   'nowrap',
    }}>
      {TYPE_LABEL[type]}
    </span>
  )
}

function EmptyState() {
  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '64px 32px',
      background:     'var(--card)',
      border:         '1px solid var(--border)',
      borderRadius:   10,
      gap:            12,
    }}>
      <CheckCircle2 size={40} style={{ color: '#16A34A' }} />
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize:   'var(--text-body)',
        fontWeight: 600,
        color:      'var(--ink-1)',
        margin:     0,
      }}>
        No pending future changes
      </p>
      <p style={{
        fontFamily: 'var(--font-sans)',
        fontSize:   'var(--text-body)',
        color:      'var(--ink-3)',
        margin:     0,
      }}>
        All HR records are up to date — no changes are scheduled for future dates.
      </p>
    </div>
  )
}
