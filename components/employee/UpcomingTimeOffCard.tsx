interface UpcomingLeave {
  id:          string
  typeCode:    string | null
  typeLabel:   string | null
  startDate:   string
  endDate:     string
  durationDays: string | number | null
  notes:       string | null
}

export function UpcomingTimeOffCard({ upcoming, locale = 'en' }: { upcoming: UpcomingLeave[]; locale?: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: -0.1 }}>
          {locale === 'ar' ? 'الإجازات القادمة' : 'Upcoming time off'}
        </h3>
      </div>
      {upcoming.length === 0 ? (
        <div style={{ padding: 20, fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
          {locale === 'ar' ? 'لا توجد إجازات معتمدة قادمة.' : 'No approved leave coming up.'}
        </div>
      ) : (
        upcoming.map((l, i) => {
          const d = new Date(l.startDate)
          const month = d.toLocaleDateString('en', { month: 'short' }).toUpperCase()
          const day   = d.getDate()
          const days  = Number(l.durationDays ?? 0)
          return (
            <div key={l.id} style={{
              padding: '14px 20px',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 44, textAlign: 'center', padding: '4px 0', borderRadius: 8,
                background: 'var(--accent-100)', color: 'var(--brand-active)', flexShrink: 0,
              }}>
                <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.05em' }}>{month}</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-serif)', lineHeight: 1.2 }}>{day}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
                  {l.typeLabel ?? l.typeCode}
                </div>
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
                  {locale === 'ar'
                    ? `${days} ${days === 1 ? 'يوم' : 'أيام'}${l.notes ? ` · ${l.notes}` : ''}`
                    : `${days} ${days === 1 ? 'day' : 'days'}${l.notes ? ` · ${l.notes}` : ''}`}
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
