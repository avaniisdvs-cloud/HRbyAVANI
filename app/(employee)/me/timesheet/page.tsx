import { requireRole } from '@/lib/auth'
import { getMyAttendance } from '@/modules/timesheets/actions'
import { AttendanceCalendar } from '@/components/timesheets/AttendanceCalendar'
import { AttendanceSummary } from '@/components/timesheets/AttendanceSummary'
import { ExceptionRequestForm } from './ExceptionRequestForm'

export const metadata = { title: 'My Timesheet · Self Service' }

function currentYearMonth(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export default async function MyTimesheetPage() {
  await requireRole(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE', 'SUPER_ADMIN'])

  const { year, month } = currentYearMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const startDate = `${year}-${pad(month)}-01`
  const endDate   = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`

  const { records, summary } = await getMyAttendance({ startDate, endDate })

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box', maxWidth: 960 }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily:    'var(--font-serif)',
            fontSize:      30,
            fontWeight:    500,
            letterSpacing: '-0.5px',
            color:         'var(--ink-1)',
            margin:        0,
          }}
        >
          My Timesheet
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: '4px 0 0' }}>
          View your attendance records and submit exception requests.
        </p>
      </div>

      {/* Summary strip */}
      <AttendanceSummary summary={summary} />

      {/* Calendar + exception form side by side on wider screens */}
      <div
        data-responsive-grid="true" style={{
          display:             'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 340px)',
          gap:                 '1.5rem',
          alignItems:          'start',
        }}
      >
        <div
          style={{
            background:   'var(--card)',
            borderRadius: '0.75rem',
            padding:      '1.25rem',
            border:       '1px solid var(--border)',
          }}
        >
          <AttendanceCalendar year={year} month={month} records={records} />
        </div>

        <div
          style={{
            background:   'var(--card)',
            borderRadius: '0.75rem',
            padding:      '1.25rem',
            border:       '1px solid var(--border)',
          }}
        >
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem', color: 'var(--ink-1)' }}>
            Submit Exception Request
          </h2>
          <ExceptionRequestForm />
        </div>
      </div>

      {/* Attendance log table */}
      {records.length > 0 && (
        <div
          style={{
            marginTop:    '1.5rem',
            background:   'var(--card)',
            borderRadius: '0.75rem',
            padding:      '1.25rem',
            border:       '1px solid var(--border)',
          }}
        >
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem', color: 'var(--ink-1)' }}>
            Attendance Log
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Status', 'In', 'Out', 'Worked', 'Late', 'Notes'].map(h => (
                    <th
                      key={h}
                      style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>{r.attendanceDate}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{
                        display:      'inline-block',
                        padding:      '0.125rem 0.5rem',
                        borderRadius: '0.25rem',
                        background:   r.status === 'PRESENT' ? 'var(--status-approved-bg)'
                                    : r.status === 'ABSENT'  ? 'var(--status-rejected-bg)'
                                    : r.status === 'ON_LEAVE' ? 'var(--status-pending-bg)'
                                    : 'var(--status-draft-bg)',
                        color:        r.status === 'PRESENT' ? 'var(--status-approved-fg)'
                                    : r.status === 'ABSENT'  ? 'var(--status-rejected-fg)'
                                    : r.status === 'ON_LEAVE' ? 'var(--status-pending-fg)'
                                    : 'var(--status-draft-fg)',
                        fontSize:     '0.75rem',
                        fontWeight:   600,
                      }}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>
                      {r.timeIn  ? new Date(r.timeIn).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })  : '—'}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>
                      {r.timeOut ? new Date(r.timeOut).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{parseFloat(r.workedHours ?? '0').toFixed(1)}h</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {(r.lateMinutes ?? 0) > 0 ? `${r.lateMinutes}m` : '—'}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--muted-foreground)' }}>
                      {r.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
