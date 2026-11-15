import { requireRole } from '@/lib/auth'
import { getTeamAttendance } from '@/modules/timesheets/actions'
import { AttendanceSummary } from '@/components/timesheets/AttendanceSummary'

export const metadata = { title: 'Team Timesheets · HR Admin' }

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

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PRESENT:        { bg: 'var(--status-approved-bg)',  fg: 'var(--status-approved-fg)'  },
  LATE:           { bg: 'var(--status-draft-bg)',      fg: 'var(--status-draft-fg)'      },
  EARLY_LEAVE:    { bg: 'var(--status-draft-bg)',      fg: 'var(--status-draft-fg)'      },
  ABSENT:         { bg: 'var(--status-rejected-bg)',   fg: 'var(--status-rejected-fg)'   },
  ON_LEAVE:       { bg: 'var(--status-pending-bg)',    fg: 'var(--status-pending-fg)'    },
  PUBLIC_HOLIDAY: { bg: 'var(--accent)',               fg: 'var(--accent-foreground)'    },
  WEEKEND:        { bg: 'var(--muted)',                fg: 'var(--muted-foreground)'     },
  MISS_PUNCH:     { bg: 'var(--status-rejected-bg)',   fg: 'var(--status-rejected-fg)'   },
}

export default async function TeamTimesheetsPage() {
  await requireRole(['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

  const { startDate, endDate } = currentMonthRange()
  const { records, summary }   = await getTeamAttendance({ startDate, endDate })

  // Group by person — pivot date→status for a heatmap-style table
  const byPerson = new Map<string, { name: string; dates: Map<string, string> }>()
  for (const r of records) {
    if (!byPerson.has(r.personId)) {
      byPerson.set(r.personId, { name: r.personName ?? r.personId, dates: new Map() })
    }
    byPerson.get(r.personId)!.dates.set(r.attendanceDate, r.status)
  }

  // Collect all unique dates in range
  const allDates: string[] = []
  const start = new Date(startDate)
  const end   = new Date(endDate)
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().slice(0, 10))
  }

  // Pending manual approvals
  const pendingApprovals = records.filter(r => r.source === 'MANUAL' && r.approvalStatus === 'PENDING')

  return (
    <div style={{ padding: '1.5rem 2rem', boxSizing: 'border-box' }}>
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
          Team Timesheets
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: '4px 0 0' }}>
          Review your team&apos;s attendance this month and approve manual entries.
        </p>
      </div>

      <AttendanceSummary summary={summary} />

      {/* Pending approvals */}
      {pendingApprovals.length > 0 && (
        <div
          style={{
            background:   'var(--status-pending-bg)',
            color:        'var(--status-pending-fg)',
            borderRadius: '0.5rem',
            padding:      '0.875rem 1rem',
            marginBottom: '1.25rem',
            fontSize:     '0.875rem',
          }}
        >
          <strong>{pendingApprovals.length} manual attendance record(s)</strong> awaiting your approval.
          Go to the Attendance page to review and approve.
        </div>
      )}

      {/* Attendance heatmap table */}
      {byPerson.size === 0 ? (
        <div
          style={{
            background:   'var(--card)',
            borderRadius: '0.75rem',
            padding:      '3rem',
            textAlign:    'center',
            border:       '1px solid var(--border)',
            color:        'var(--muted-foreground)',
            fontSize:     '0.875rem',
          }}
        >
          No attendance records found for your team this month.
        </div>
      ) : (
        <div
          style={{
            background:   'var(--card)',
            borderRadius: '0.75rem',
            padding:      '1.25rem',
            border:       '1px solid var(--border)',
            overflowX:    'auto',
          }}
        >
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem', color: 'var(--ink-1)' }}>
            Monthly Overview
          </h2>

          <table style={{ borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th
                  style={{
                    padding:    '0.375rem 0.75rem',
                    textAlign:  'left',
                    fontWeight: 600,
                    color:      'var(--muted-foreground)',
                    whiteSpace: 'nowrap',
                    position:   'sticky',
                    left:       0,
                    background: 'var(--card)',
                  }}
                >
                  Employee
                </th>
                {allDates.map(d => (
                  <th
                    key={d}
                    style={{
                      padding:    '0.375rem 0.25rem',
                      textAlign:  'center',
                      fontWeight: 500,
                      color:      'var(--muted-foreground)',
                      minWidth:   28,
                    }}
                  >
                    {d.slice(8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(byPerson.values()).map(person => (
                <tr key={person.name} style={{ borderTop: '1px solid var(--border)' }}>
                  <td
                    style={{
                      padding:    '0.375rem 0.75rem',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      position:   'sticky',
                      left:       0,
                      background: 'var(--card)',
                    }}
                  >
                    {person.name}
                  </td>
                  {allDates.map(d => {
                    const status = person.dates.get(d)
                    const colors = status ? STATUS_STYLE[status] : null
                    return (
                      <td
                        key={d}
                        title={status ?? 'No record'}
                        style={{
                          padding:    '0.25rem',
                          textAlign:  'center',
                        }}
                      >
                        {colors && (
                          <span
                            style={{
                              display:      'inline-block',
                              width:        22,
                              height:       22,
                              borderRadius: '0.25rem',
                              background:   colors.bg,
                              lineHeight:   '22px',
                              color:        colors.fg,
                              fontSize:     '0.6rem',
                              fontWeight:   700,
                            }}
                          >
                            {status === 'PRESENT'        ? 'P'
                             : status === 'ABSENT'       ? 'A'
                             : status === 'LATE'         ? 'L'
                             : status === 'ON_LEAVE'     ? 'OL'
                             : status === 'MISS_PUNCH'   ? 'MP'
                             : status === 'EARLY_LEAVE'  ? 'EL'
                             : status === 'WEEKEND'      ? 'W'
                             : status === 'PUBLIC_HOLIDAY' ? 'PH'
                             : '?'}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
