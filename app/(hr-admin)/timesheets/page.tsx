import { requireRole } from '@/lib/auth'
import { getFullAttendance } from '@/modules/timesheets/actions'
import { AttendanceSummary } from '@/components/timesheets/AttendanceSummary'
import { AttendanceReport } from '@/components/timesheets/AttendanceReport'
import { ExcelUpload } from '@/components/timesheets/ExcelUpload'

export const metadata = { title: 'Attendance · HR Admin' }

function currentMonthRange(): { startDate: string; endDate: string } {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  const pad   = (n: number) => String(n).padStart(2, '0')
  return {
    startDate: `${year}-${pad(month)}-01`,
    endDate:   `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`,
  }
}

export default async function TimesheetsPage() {
  await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

  const { startDate, endDate } = currentMonthRange()
  const { summary }            = await getFullAttendance({ startDate, endDate, pageSize: 1 })

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 1200, boxSizing: 'border-box' }}>
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
          Attendance
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: '4px 0 0' }}>
          Monitor and manage employee attendance. Upload bulk records or generate reports.
        </p>
      </div>

      {/* Current month summary */}
      <AttendanceSummary summary={summary} />

      {/* Tabs: Report | Upload */}
      <div
        data-responsive-grid="true" style={{
          display:             'grid',
          gridTemplateColumns: '1fr 380px',
          gap:                 '1.5rem',
          alignItems:          'start',
        }}
      >
        {/* Report */}
        <div
          style={{
            background:   'var(--card)',
            borderRadius: '0.75rem',
            padding:      '1.25rem',
            border:       '1px solid var(--border)',
          }}
        >
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem', color: 'var(--ink-1)' }}>
            Attendance Report
          </h2>
          <AttendanceReport />
        </div>

        {/* Bulk Upload */}
        <div
          style={{
            background:   'var(--card)',
            borderRadius: '0.75rem',
            padding:      '1.25rem',
            border:       '1px solid var(--border)',
          }}
        >
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem', color: 'var(--ink-1)' }}>
            Bulk Upload
          </h2>
          <ExcelUpload />
        </div>
      </div>
    </div>
  )
}
