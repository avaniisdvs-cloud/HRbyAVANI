'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useTransition } from 'react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { generateAttendanceReport, type AttendanceReportRow } from '@/modules/timesheets/actions'

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  PRESENT:        { bg: 'var(--status-approved-bg)',  fg: 'var(--status-approved-fg)'  },
  LATE:           { bg: 'var(--status-draft-bg)',      fg: 'var(--status-draft-fg)'      },
  EARLY_LEAVE:    { bg: 'var(--status-draft-bg)',      fg: 'var(--status-draft-fg)'      },
  ABSENT:         { bg: 'var(--status-rejected-bg)',   fg: 'var(--status-rejected-fg)'   },
  ON_LEAVE:       { bg: 'var(--status-pending-bg)',    fg: 'var(--status-pending-fg)'    },
  PUBLIC_HOLIDAY: { bg: 'var(--accent)',               fg: 'var(--accent-foreground)'    },
  WEEKEND:        { bg: 'var(--muted)',                fg: 'var(--muted-foreground)'     },
  MISS_PUNCH:     { bg: 'var(--status-rejected-bg)',   fg: 'var(--status-rejected-fg)'   },
}

interface Filters {
  startDate: string
  endDate:   string
  status:    string
}

function today(): string { return new Date().toISOString().slice(0, 10) }
function monthStart(): string { return today().slice(0, 8) + '01' }

export function AttendanceReport() {
  const locale = useLocale()
  const [filters, setFilters] = useState<Filters>({
    startDate: monthStart(),
    endDate:   today(),
    status:    '',
  })
  const [rows,       setRows]       = useState<AttendanceReportRow[]>([])
  const [isPending,  startTransition] = useTransition()
  const [generated,  setGenerated]  = useState(false)

  function handleGenerate() {
    startTransition(async () => {
      const data = await generateAttendanceReport(filters)
      setRows(data)
      setGenerated(true)
    })
  }

  function exportCsv() {
    const header = [
      'Employee Number', 'Name', 'Date', 'Status', 'Time In', 'Time Out',
      'Worked Hours', 'Overtime Hours', 'Late (min)', 'Early Leave (min)', 'Source', 'Approval',
    ]
    const body = rows.map(r => [
      r.employeeNumber ?? '',
      r.personName,
      r.attendanceDate,
      r.status,
      r.timeIn   ? new Date(r.timeIn).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })  : '',
      r.timeOut  ? new Date(r.timeOut).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' }) : '',
      r.workedHours,
      r.overtimeHours,
      String(r.lateMinutes),
      String(r.earlyLeaveMinutes),
      r.source ?? '',
      r.approvalStatus ?? '',
    ])
    const csv  = [header, ...body].map(row => row.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `attendance_${filters.startDate}_${filters.endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem' }}>
          {locale === 'ar' ? 'تاريخ البدء' : 'Start Date'}
          <input
            type="date"
            value={filters.startDate}
            onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
            style={{
              padding:      '0.375rem 0.5rem',
              borderRadius: '0.375rem',
              border:       '1px solid var(--border)',
              background:   'var(--background)',
              color:        'var(--foreground)',
              fontSize:     '0.875rem',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem' }}>
          {locale === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}
          <input
            type="date"
            value={filters.endDate}
            onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
            style={{
              padding:      '0.375rem 0.5rem',
              borderRadius: '0.375rem',
              border:       '1px solid var(--border)',
              background:   'var(--background)',
              color:        'var(--foreground)',
              fontSize:     '0.875rem',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem' }}>
          {locale === 'ar' ? 'الحالة' : 'Status'}
          <select
            value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            style={{
              padding:      '0.375rem 0.5rem',
              borderRadius: '0.375rem',
              border:       '1px solid var(--border)',
              background:   'var(--background)',
              color:        'var(--foreground)',
              fontSize:     '0.875rem',
            }}
          >
            <option value="">{locale === 'ar' ? 'الكل' : 'All'}</option>
            <option value="PRESENT">{locale === 'ar' ? 'حاضر' : 'Present'}</option>
            <option value="LATE">{locale === 'ar' ? 'متأخر' : 'Late'}</option>
            <option value="ABSENT">{locale === 'ar' ? 'غائب' : 'Absent'}</option>
            <option value="EARLY_LEAVE">{locale === 'ar' ? 'انصراف مبكر' : 'Early Leave'}</option>
            <option value="ON_LEAVE">{locale === 'ar' ? 'في إجازة' : 'On Leave'}</option>
            <option value="MISS_PUNCH">{locale === 'ar' ? 'بصمة مفقودة' : 'Miss Punch'}</option>
          </select>
        </label>

        <button
          onClick={handleGenerate}
          disabled={isPending}
          style={{
            padding:      '0.5rem 1.25rem',
            borderRadius: '0.375rem',
            border:       'none',
            background:   'var(--accent)',
            color:        'var(--accent-foreground)',
            fontWeight:   600,
            cursor:       isPending ? 'not-allowed' : 'pointer',
            fontSize:     '0.875rem',
          }}
        >
          {isPending ? (locale === 'ar' ? 'جارٍ التحميل…' : 'Loading…') : (locale === 'ar' ? 'إنشاء' : 'Generate')}
        </button>

        {generated && rows.length > 0 && (
          <button
            onClick={exportCsv}
            style={{
              padding:      '0.5rem 1.25rem',
              borderRadius: '0.375rem',
              border:       '1px solid var(--border)',
              background:   'var(--background)',
              color:        'var(--foreground)',
              fontWeight:   500,
              cursor:       'pointer',
              fontSize:     '0.875rem',
            }}
          >
            {locale === 'ar' ? 'تصدير CSV' : 'Export CSV'}
          </button>
        )}
      </div>

      {/* Table */}
      {generated && (
        <div style={{ overflowX: 'auto' }}>
          {rows.length === 0 ? (
            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>{locale === 'ar' ? 'لا توجد سجلات.' : 'No records found.'}</p>
          ) : (
            <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[
                    { key: 'emp',    label: locale === 'ar' ? 'رقم الموظف' : 'Emp #' },
                    { key: 'name',   label: locale === 'ar' ? 'الاسم' : 'Name' },
                    { key: 'date',   label: locale === 'ar' ? 'التاريخ' : 'Date' },
                    { key: 'status', label: locale === 'ar' ? 'الحالة' : 'Status' },
                    { key: 'in',     label: locale === 'ar' ? 'الدخول' : 'In' },
                    { key: 'out',    label: locale === 'ar' ? 'الخروج' : 'Out' },
                    { key: 'worked', label: locale === 'ar' ? 'ساعات العمل' : 'Worked' },
                    { key: 'ot',     label: locale === 'ar' ? 'إضافي' : 'OT' },
                    { key: 'late',   label: locale === 'ar' ? 'تأخير' : 'Late' },
                    { key: 'source', label: locale === 'ar' ? 'المصدر' : 'Source' },
                  ].map(h => (
                    <th
                      key={h.key}
                      style={{
                        padding:   '0.5rem 0.75rem',
                        textAlign: 'left',
                        fontWeight: 600,
                        color:     'var(--muted-foreground)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const colors = STATUS_COLORS[r.status] ?? { bg: 'transparent', fg: 'var(--foreground)' }
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--muted-foreground)' }}>
                        {r.employeeNumber ?? '—'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{r.personName}</td>
                      <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>{r.attendanceDate}</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <span
                          style={{
                            display:      'inline-block',
                            padding:      '0.125rem 0.5rem',
                            borderRadius: '0.25rem',
                            background:   colors.bg,
                            color:        colors.fg,
                            fontSize:     '0.75rem',
                            fontWeight:   600,
                          }}
                        >
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>
                        {r.timeIn  ? new Date(r.timeIn).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })  : '—'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>
                        {r.timeOut ? new Date(r.timeOut).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>{parseFloat(r.workedHours).toFixed(1)}h</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        {parseFloat(r.overtimeHours) > 0 ? `+${parseFloat(r.overtimeHours).toFixed(1)}h` : '—'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        {r.lateMinutes > 0 ? `${r.lateMinutes}m` : '—'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                        {r.source ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></TableScrollRegion>
          )}
        </div>
      )}
    </div>
  )
}
