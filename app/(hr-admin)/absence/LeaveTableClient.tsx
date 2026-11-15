'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { useTableSort, type SortDirection } from '@/hooks/useTableSort'
import type { LeaveRequestListRow } from '@/modules/absence/types'
import { formatDMY, formatDMYTime } from '@/lib/utils'

type Props = {
  rows:          LeaveRequestListRow[]
  locale:        string
  sortColumn:    string | null
  sortDirection: 'asc' | 'desc' | null
}

function StatusPill({ status, locale }: { status: string; locale: string }) {
  type Variant = { bg: string; fg: string; dot: string }
  const variants: Record<string, Variant> = {
    APPROVED:  { bg: 'var(--status-approved-bg)',  fg: 'var(--status-approved-fg)',  dot: 'var(--status-approved-dot)'  },
    TAKEN:     { bg: 'var(--status-approved-bg)',  fg: 'var(--status-approved-fg)',  dot: 'var(--status-approved-dot)'  },
    PENDING:   { bg: 'var(--status-pending-bg)',   fg: 'var(--status-pending-fg)',   dot: 'var(--status-pending-dot)'   },
    REJECTED:  { bg: 'var(--status-rejected-bg)',  fg: 'var(--status-rejected-fg)',  dot: 'var(--status-rejected-dot)'  },
    DRAFT:     { bg: 'var(--status-draft-bg)',     fg: 'var(--status-draft-fg)',     dot: 'var(--status-draft-dot)'     },
    RECALLED:  { bg: 'var(--surface)',             fg: 'var(--ink-3)',               dot: 'var(--ink-4)'                },
    CANCELLED: { bg: 'var(--surface)',             fg: 'var(--ink-3)',               dot: 'var(--ink-4)'                },
  }
  const statusLabels: Record<string, { en: string; ar: string }> = {
    APPROVED:  { en: 'APPROVED',  ar: 'موافق'        },
    TAKEN:     { en: 'TAKEN',     ar: 'مُستهلك'      },
    PENDING:   { en: 'PENDING',   ar: 'قيد المراجعة' },
    REJECTED:  { en: 'REJECTED',  ar: 'مرفوض'        },
    DRAFT:     { en: 'DRAFT',     ar: 'مسودة'        },
    RECALLED:  { en: 'RECALLED',  ar: 'مُسترجع'      },
    CANCELLED: { en: 'CANCELLED', ar: 'ملغى'         },
  }
  const v = variants[status] ?? variants.CANCELLED
  const label = statusLabels[status]
    ? (locale === 'ar' ? statusLabels[status].ar : statusLabels[status].en)
    : status.replace('_', ' ')
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: v.bg, color: v.fg,
      borderRadius: 999, padding: '3px 10px',
      fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
      flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.dot, flexShrink: 0 }} />
      {label}
    </span>
  )
}

function nextSort(col: string, current: { column: string | null; direction: SortDirection }): { column: string | null; direction: SortDirection } {
  if (current.column !== col) return { column: col, direction: 'asc' }
  if (current.direction === 'asc')  return { column: col, direction: 'desc' }
  if (current.direction === 'desc') return { column: null, direction: null }
  return { column: col, direction: 'asc' }
}

export function LeaveTableClient({ rows, locale, sortColumn, sortDirection }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const pathname     = usePathname()
  const [isPending, startTransition] = useTransition()

  const { sort, handleSort } = useTableSort(
    sortColumn ?? undefined,
    sortDirection ?? undefined,
  )

  function onSort(col: string) {
    const next = nextSort(col, sort)
    handleSort(col)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page')
    if (next.column && next.direction) {
      params.set('sortBy',  next.column)
      params.set('sortDir', next.direction)
    } else {
      params.delete('sortBy')
      params.delete('sortDir')
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12,
    }}>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <SortableHeader
                label={locale === 'ar' ? 'رقم الطلب' : 'Request #'}
                column="request_number"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={onSort}
              />
              <SortableHeader
                label={locale === 'ar' ? 'الموظف' : 'Person'}
                column="person"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={onSort}
              />
              <SortableHeader
                label={locale === 'ar' ? 'النوع' : 'Type'}
                column="type"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={onSort}
              />
              <SortableHeader
                label={locale === 'ar' ? 'الفترة' : 'Range'}
                column="start_date"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={onSort}
              />
              <SortableHeader
                label={locale === 'ar' ? 'أيام' : 'Days'}
                column="days"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={onSort}
              />
              <SortableHeader
                label={locale === 'ar' ? 'الحالة' : 'Status'}
                column="status"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={onSort}
              />
              <SortableHeader
                label={locale === 'ar' ? 'تاريخ التقديم' : 'Submitted'}
                column="submitted"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={onSort}
              />
            </tr>
          </thead>
          <tbody style={{ opacity: isPending ? 0.5 : 1, transition: 'opacity 150ms' }}>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      background: 'var(--accent-100)', display: 'grid',
                      placeItems: 'center', color: 'var(--brand-active)',
                    }}>
                      <Inbox size={20} strokeWidth={1.75} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)' }}>
                      {locale === 'ar' ? 'لا توجد طلبات إجازة' : 'No leave requests found'}
                    </div>
                    <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', maxWidth: 300 }}>
                      {locale === 'ar' ? 'لا توجد طلبات تطابق الفلاتر الحالية. ' : 'No leave requests match the current filters. '}
                      <Link href="/absence/new" style={{ color: 'var(--brand-active)', textDecoration: 'underline' }}>
                        {locale === 'ar' ? 'إنشاء طلب ←' : 'Create one →'}
                      </Link>
                    </div>
                  </div>
                </td>
              </tr>
            ) : rows.map((r, i) => (
              <tr
                key={r.id}
                className="hover:bg-surface"
                style={{
                  borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background 120ms',
                }}
              >
                <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', verticalAlign: 'middle' }}>
                  <Link href={`/absence/${r.id}`} style={{ color: 'var(--brand-active)', textDecoration: 'none', fontWeight: 600 }}>
                    {r.requestNumber}
                  </Link>
                </td>
                <td style={{ padding: '14px 20px', verticalAlign: 'middle' }}>
                  <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{r.personFullNameEn ?? '—'}</div>
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{r.personNumber ?? '—'}</div>
                </td>
                <td style={{ padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', verticalAlign: 'middle' }}>
                  {r.absenceTypeNameEn ?? r.absenceTypeCode ?? '—'}
                </td>
                <td style={{ padding: '14px 20px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {formatDMY(r.startDate)} → {formatDMY(r.endDate)}
                  {r.isHalfDay ? ` (½ ${r.halfDayPeriod ?? ''})` : ''}
                </td>
                <td style={{ padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', verticalAlign: 'middle' }}>
                  {r.durationDays}
                </td>
                <td style={{ padding: '14px 20px', verticalAlign: 'middle' }}>
                  <StatusPill status={r.status} locale={locale} />
                </td>
                <td style={{ padding: '14px 20px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {formatDMYTime(r.createdDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table></TableScrollRegion>
      </div>
    </div>
  )
}
