'use client'

import type { AttendanceRecord } from '@/drizzle/schema'

interface Props {
  year:    number
  month:   number   // 1-12
  records: AttendanceRecord[]
  onDayClick?: (date: string) => void
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  PRESENT:        { bg: 'var(--status-approved-bg)',  fg: 'var(--status-approved-fg)',  label: 'P'  },
  LATE:           { bg: 'var(--status-draft-bg)',      fg: 'var(--status-draft-fg)',      label: 'L'  },
  EARLY_LEAVE:    { bg: 'var(--status-draft-bg)',      fg: 'var(--status-draft-fg)',      label: 'EL' },
  ABSENT:         { bg: 'var(--status-rejected-bg)',   fg: 'var(--status-rejected-fg)',   label: 'A'  },
  ON_LEAVE:       { bg: 'var(--status-pending-bg)',    fg: 'var(--status-pending-fg)',    label: 'OL' },
  PUBLIC_HOLIDAY: { bg: 'var(--accent)',               fg: 'var(--accent-foreground)',    label: 'PH' },
  WEEKEND:        { bg: 'var(--muted)',                fg: 'var(--muted-foreground)',     label: 'W'  },
  MISS_PUNCH:     { bg: 'var(--status-rejected-bg)',   fg: 'var(--status-rejected-fg)',   label: 'MP' },
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay() // 0 = Sunday
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function AttendanceCalendar({ year, month, records, onDayClick }: Props) {
  const recordMap = new Map<string, AttendanceRecord>()
  for (const r of records) {
    recordMap.set(r.attendanceDate, r)
  }

  const daysInMonth  = getDaysInMonth(year, month)
  const firstDayDow  = getFirstDayOfWeek(year, month)
  const totalCells   = Math.ceil((firstDayDow + daysInMonth) / 7) * 7

  const cells: Array<number | null> = []
  for (let i = 0; i < firstDayDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length < totalCells) cells.push(null)

  return (
    <div>
      <div style={{ textAlign: 'center', fontWeight: 600, marginBottom: '0.75rem', fontSize: '1rem' }}>
        {MONTH_NAMES[month - 1]} {year}
      </div>

      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {DAY_HEADERS.map(d => (
          <div
            key={d}
            style={{
              textAlign:  'center',
              fontSize:   '0.7rem',
              fontWeight: 600,
              padding:    '0.25rem 0',
              color:      'var(--muted-foreground)',
            }}
          >
            {d}
          </div>
        ))}

        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />

          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const record  = recordMap.get(dateStr)
          const info    = record ? STATUS_STYLE[record.status] : null

          return (
            <div
              key={dateStr}
              onClick={() => onDayClick?.(dateStr)}
              style={{
                aspectRatio:  '1',
                display:      'flex',
                flexDirection: 'column',
                alignItems:   'center',
                justifyContent: 'center',
                borderRadius: '0.375rem',
                cursor:       onDayClick ? 'pointer' : 'default',
                background:   info?.bg ?? 'transparent',
                color:        info?.fg ?? 'var(--foreground)',
                fontSize:     '0.75rem',
                userSelect:   'none',
                transition:   'opacity 0.1s',
              }}
            >
              <span style={{ fontWeight: 500 }}>{day}</span>
              {info && (
                <span style={{ fontSize: '0.6rem', fontWeight: 600, marginTop: '1px' }}>
                  {info.label}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
        {Object.entries(STATUS_STYLE).map(([, v]) => (
          <div
            key={v.label}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '0.25rem',
              fontSize:     '0.65rem',
              color:        'var(--muted-foreground)',
            }}
          >
            <span
              style={{
                display:      'inline-block',
                width:        '0.875rem',
                height:       '0.875rem',
                borderRadius: '0.2rem',
                background:   v.bg,
              }}
            />
            {v.label}
          </div>
        ))}
      </div>
    </div>
  )
}
