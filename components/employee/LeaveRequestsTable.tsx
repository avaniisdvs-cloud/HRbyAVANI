'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useMemo } from 'react'
import { Inbox } from 'lucide-react'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { useTableSort } from '@/hooks/useTableSort'
import { useLocale } from '@/components/providers/LocaleProvider'

interface LeaveRequest {
  id: string
  absenceTypeCode:   string | null
  absenceTypeNameEn: string | null
  startDate:         string
  endDate:           string
  durationDays:      string | number | null
  createdDate:       Date | string | null
  status:            string
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; dot: string; label: string; labelAr: string }> = {
  APPROVED:  { bg: 'var(--status-approved-bg)',  fg: 'var(--status-approved-fg)',  dot: 'var(--status-approved-dot)',  label: 'Approved',  labelAr: 'معتمد'   },
  REJECTED:  { bg: 'var(--status-rejected-bg)',  fg: 'var(--status-rejected-fg)',  dot: 'var(--status-rejected-dot)',  label: 'Rejected',  labelAr: 'مرفوض'   },
  CANCELLED: { bg: 'var(--status-draft-bg)',     fg: 'var(--status-draft-fg)',     dot: 'var(--status-draft-dot)',     label: 'Cancelled', labelAr: 'ملغى'    },
  TAKEN:     { bg: 'var(--status-approved-bg)',  fg: 'var(--status-approved-fg)',  dot: 'var(--status-approved-dot)',  label: 'Taken',     labelAr: 'مُستخدَم' },
  RECALLED:  { bg: 'var(--status-draft-bg)',     fg: 'var(--status-draft-fg)',     dot: 'var(--status-draft-dot)',     label: 'Recalled', labelAr: 'مُستدعى'  },
}
const PENDING_STYLE = { bg: 'var(--status-pending-bg)', fg: 'var(--status-pending-fg)', dot: 'var(--status-pending-dot)', label: 'Pending', labelAr: 'قيد الانتظار' }

function getStatus(status: string) {
  return STATUS_STYLE[status] ?? PENDING_STYLE
}

export function LeaveRequestsTable({ requests }: { requests: LeaveRequest[] }) {
  const locale = useLocale()
  const { sort, handleSort } = useTableSort('createdDate', 'desc')

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return requests
    return [...requests].sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''
      switch (sort.column) {
        case 'type':
          aVal = a.absenceTypeNameEn ?? a.absenceTypeCode ?? ''
          bVal = b.absenceTypeNameEn ?? b.absenceTypeCode ?? ''
          break
        case 'startDate':
          aVal = a.startDate
          bVal = b.startDate
          break
        case 'endDate':
          aVal = a.endDate
          bVal = b.endDate
          break
        case 'days':
          aVal = Number(a.durationDays ?? 0)
          bVal = Number(b.durationDays ?? 0)
          break
        case 'status':
          aVal = a.status
          bVal = b.status
          break
        case 'createdDate': {
          const aD = a.createdDate instanceof Date ? a.createdDate.toISOString() : String(a.createdDate ?? '')
          const bD = b.createdDate instanceof Date ? b.createdDate.toISOString() : String(b.createdDate ?? '')
          aVal = aD
          bVal = bD
          break
        }
        default:
          return 0
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sort.direction === 'asc' ? aVal - bVal : bVal - aVal
      }
      return sort.direction === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  }, [requests, sort])

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-card py-10 text-ink-3">
        <Inbox className="h-7 w-7" aria-hidden strokeWidth={1.25} />
        <p className="text-sm">{locale === 'ar' ? 'لا توجد طلبات بعد' : 'No requests yet'}</p>
      </div>
    )
  }

  const thCls = 'px-4 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-[1px] text-ink-3'

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
      <TableScrollRegion><table className="w-full text-sm">
        <thead className="border-b border-border bg-surface">
          <tr>
            <SortableHeader
              label={locale === 'ar' ? 'النوع' : 'Type'}
              column="type"
              activeColumn={sort.column}
              direction={sort.direction}
              onSort={handleSort}
            />
            <SortableHeader
              label={locale === 'ar' ? 'من' : 'From'}
              column="startDate"
              activeColumn={sort.column}
              direction={sort.direction}
              onSort={handleSort}
            />
            <SortableHeader
              label={locale === 'ar' ? 'إلى' : 'To'}
              column="endDate"
              activeColumn={sort.column}
              direction={sort.direction}
              onSort={handleSort}
            />
            <SortableHeader
              label={locale === 'ar' ? 'الأيام' : 'Days'}
              column="days"
              activeColumn={sort.column}
              direction={sort.direction}
              onSort={handleSort}
            />
            <SortableHeader
              label={locale === 'ar' ? 'الحالة' : 'Status'}
              column="status"
              activeColumn={sort.column}
              direction={sort.direction}
              onSort={handleSort}
            />
            <SortableHeader
              label={locale === 'ar' ? 'تاريخ التقديم' : 'Submitted'}
              column="createdDate"
              activeColumn={sort.column}
              direction={sort.direction}
              onSort={handleSort}
            />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map(r => {
            const s = getStatus(r.status)
            return (
              <tr key={r.id} className="transition-colors hover:bg-surface">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-accent-050 px-2 py-0.5 font-mono text-xs font-medium text-accent-700">
                    {r.absenceTypeCode ?? '—'}
                  </span>
                  <div className="mt-0.5 text-xs text-ink-3">{r.absenceTypeNameEn ?? ''}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-2">{r.startDate}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-2">{r.endDate}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-2">{String(r.durationDays ?? '—')}</td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ background: s.bg, color: s.fg }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} aria-hidden />
                    {locale === 'ar' ? s.labelAr : s.label}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-3">
                  {r.createdDate
                    ? (r.createdDate instanceof Date
                        ? r.createdDate.toISOString().slice(0, 10)
                        : String(r.createdDate).slice(0, 10))
                    : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table></TableScrollRegion>
    </div>
  )
}
