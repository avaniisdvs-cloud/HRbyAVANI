'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useEffect, useTransition, useCallback } from 'react'
import { getLeaveHistoryForEmployee } from '@/modules/absence/actions'
import type { LeaveHistoryRow } from '@/modules/absence/actions'

const STATUS_STYLE: Record<string, { bg: string; fg: string; dot: string; label: string; labelAr: string }> = {
  APPROVED:  { bg: 'var(--status-approved-bg)',  fg: 'var(--status-approved-fg)',  dot: 'var(--status-approved-dot)',  label: 'Approved',  labelAr: 'موافق'         },
  REJECTED:  { bg: 'var(--status-rejected-bg)',  fg: 'var(--status-rejected-fg)',  dot: 'var(--status-rejected-dot)',  label: 'Rejected',  labelAr: 'مرفوض'         },
  CANCELLED: { bg: 'var(--status-draft-bg)',     fg: 'var(--status-draft-fg)',     dot: 'var(--status-draft-dot)',     label: 'Cancelled', labelAr: 'ملغى'          },
  TAKEN:     { bg: 'var(--status-approved-bg)',  fg: 'var(--status-approved-fg)',  dot: 'var(--status-approved-dot)',  label: 'Taken',     labelAr: 'مأخوذة'        },
  RECALLED:  { bg: 'var(--status-draft-bg)',     fg: 'var(--status-draft-fg)',     dot: 'var(--status-draft-dot)',     label: 'Recalled',  labelAr: 'مسحوب'         },
  PENDING:   { bg: 'var(--status-pending-bg)',   fg: 'var(--status-pending-fg)',   dot: 'var(--status-pending-dot)',   label: 'Pending',   labelAr: 'قيد المراجعة' },
}

type FilterMode = 'year' | 'range'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })
}

function pendingDuration(since: Date | string | null, locale: string): string {
  if (!since) return ''
  const sinceMs = since instanceof Date ? since.getTime() : new Date(since).getTime()
  if (isNaN(sinceMs)) return ''
  const diffMs   = Date.now() - sinceMs
  const diffHrs  = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays >= 1) {
    return locale === 'ar'
      ? `منذ ${diffDays} ${diffDays === 1 ? 'يوم' : 'أيام'}`
      : `${diffDays}d ago`
  }
  return locale === 'ar' ? `منذ ${diffHrs} ساعة` : `${diffHrs}h ago`
}

export function LeaveHistoryPanel({
  initialTypeCode,
  locale = 'en',
}: {
  initialTypeCode: string
  locale?: string
}) {
  const currentYear = new Date().getFullYear()

  const [filterMode,  setFilterMode]  = useState<FilterMode>('year')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [fromDate,    setFromDate]    = useState('')
  const [toDate,      setToDate]      = useState('')
  const [page,        setPage]        = useState(1)

  const [rows,        setRows]        = useState<LeaveHistoryRow[]>([])
  const [total,       setTotal]       = useState(0)
  const [totalPages,  setTotalPages]  = useState(0)
  const [isPending,   startTransition] = useTransition()
  const [fetchError,  setFetchError]  = useState<string | null>(null)

  const PAGE_SIZE = 10

  const load = useCallback(() => {
    setFetchError(null)
    startTransition(async () => {
      try {
        const result = await getLeaveHistoryForEmployee({
          typeCode: initialTypeCode,
          year:     filterMode === 'year'  ? selectedYear : null,
          fromDate: filterMode === 'range' ? (fromDate || null) : null,
          toDate:   filterMode === 'range' ? (toDate   || null) : null,
          page,
          pageSize: PAGE_SIZE,
        })
        setRows(result.rows)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      } catch {
        setFetchError(locale === 'ar' ? 'تعذّر تحميل السجلات.' : 'Failed to load history.')
      }
    })
  }, [initialTypeCode, filterMode, selectedYear, fromDate, toDate, page, locale])

  useEffect(() => { load() }, [load])

  const yearsAvailable = Array.from({ length: 5 }, (_, i) => currentYear - i)

  const inputStyle: React.CSSProperties = {
    fontSize: 'var(--text-caption)', padding: '5px 10px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--card)',
    color: 'var(--ink-1)', outline: 'none', height: 32,
  }
  const btnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 'var(--text-caption)', fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
    border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--card)',
    color: active ? '#fff' : 'var(--ink-2)',
  })

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Panel header + filters */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
      }}>
        <h3 style={{ marginTop: 0,
        marginBottom: 0,
        marginLeft: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', letterSpacing: -0.1,
        marginRight: 8 }}>
          {locale === 'ar' ? `سجل ${initialTypeCode} الإجازات` : `${initialTypeCode.charAt(0) + initialTypeCode.slice(1).toLowerCase()} leave history`}
        </h3>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={btnStyle(filterMode === 'year')}  onClick={() => { setFilterMode('year');  setPage(1) }}>
            {locale === 'ar' ? 'حسب السنة' : 'By year'}
          </button>
          <button style={btnStyle(filterMode === 'range')} onClick={() => { setFilterMode('range'); setPage(1) }}>
            {locale === 'ar' ? 'نطاق تاريخ' : 'Date range'}
          </button>
        </div>

        {/* Year picker */}
        {filterMode === 'year' && (
          <select
            value={selectedYear}
            onChange={e => { setSelectedYear(Number(e.target.value)); setPage(1) }}
            style={inputStyle}
            aria-label={locale === 'ar' ? 'السنة' : 'Year'}
          >
            {yearsAvailable.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}

        {/* Date range pickers */}
        {filterMode === 'range' && (
          <>
            <input
              type="date"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setPage(1) }}
              style={inputStyle}
              aria-label={locale === 'ar' ? 'من تاريخ' : 'From date'}
            />
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>→</span>
            <input
              type="date"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setPage(1) }}
              style={inputStyle}
              aria-label={locale === 'ar' ? 'إلى تاريخ' : 'To date'}
            />
          </>
        )}

        {/* Total count */}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
          {isPending ? '…' : `${total} ${locale === 'ar' ? 'طلب' : total === 1 ? 'request' : 'requests'}`}
        </span>
      </div>

      {/* Table */}
      {fetchError ? (
        <div style={{ padding: 20, fontSize: 'var(--text-body)', color: 'var(--status-rejected-fg)' }}>{fetchError}</div>
      ) : isPending ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
          {locale === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
          {locale === 'ar' ? 'لا توجد سجلات للفترة المحددة.' : 'No records for the selected period.'}
        </div>
      ) : (
        <>
          <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {[
                  locale === 'ar' ? 'رقم الطلب' : 'Request #',
                  locale === 'ar' ? 'تاريخ البدء' : 'Start date',
                  locale === 'ar' ? 'تاريخ الانتهاء' : 'End date',
                  locale === 'ar' ? 'الأيام' : 'Days',
                  locale === 'ar' ? 'الحالة' : 'Status',
                  locale === 'ar' ? 'تفاصيل' : 'Details',
                ].map(h => (
                  <th key={h} style={{
                    padding: '9px 16px', textAlign: 'left', fontWeight: 600,
                    fontSize: 'var(--text-caption)', color: 'var(--ink-3)', letterSpacing: '0.03em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const s   = STATUS_STYLE[r.status] ?? STATUS_STYLE.PENDING
                const dur = r.status === 'PENDING' ? pendingDuration(r.pendingApproverSince, locale) : ''
                return (
                  <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
                      {r.requestNumber ?? '—'}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink-1)' }}>{fmtDate(r.startDate)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--ink-2)' }}>{fmtDate(r.endDate)}</td>
                    <td style={{ padding: '10px 16px', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-1)', fontWeight: 500 }}>
                      {Number(r.durationDays ?? 0)}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: s.bg, color: s.fg,
                        borderRadius: 999, padding: '2px 9px', fontSize: 'var(--text-caption)', fontWeight: 600,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }} aria-hidden />
                        {locale === 'ar' ? s.labelAr : s.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                      {r.status === 'PENDING' && (
                        <>
                          {r.pendingApproverName
                            ? (locale === 'ar' ? `مع: ${r.pendingApproverName}` : `With: ${r.pendingApproverName}`)
                            : (locale === 'ar' ? 'قيد المراجعة' : 'Awaiting review')}
                          {dur && <span style={{ marginLeft: 6, opacity: 0.7 }}>{dur}</span>}
                        </>
                      )}
                      {r.status === 'REJECTED' && r.rejectionReason && (
                        <span title={r.rejectionReason}>
                          {r.rejectionReason.length > 40
                            ? r.rejectionReason.slice(0, 40) + '…'
                            : r.rejectionReason}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></TableScrollRegion>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              padding: '12px 20px', borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ ...btnStyle(false), opacity: page <= 1 ? 0.4 : 1 }}
              >
                {locale === 'ar' ? '→ السابق' : '← Prev'}
              </button>
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                {locale === 'ar' ? `${page} من ${totalPages}` : `${page} / ${totalPages}`}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ ...btnStyle(false), opacity: page >= totalPages ? 0.4 : 1 }}
              >
                {locale === 'ar' ? '← التالي' : 'Next →'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
