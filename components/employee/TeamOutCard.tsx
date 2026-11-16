interface TeamMemberOut {
  id:        string
  firstName: string | null
  lastName:  string | null
  typeLabel: string | null
  typeCode:  string | null
  startDate: string
  endDate:   string
}

const AVATAR_COLOR: Record<string, string> = {
  SICK:      '#2E8B57',
  ANNUAL:    '#2E6170',
  EMERGENCY: '#B33A3A',
}

function initials(first: string | null, last: string | null) {
  return `${(first ?? '?')[0]}${(last ?? '?')[0]}`.toUpperCase()
}

function fmtShort(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })
}

export function TeamOutCard({ teamOut, locale = 'en' }: { teamOut: TeamMemberOut[]; locale?: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', letterSpacing: -0.1 }}>
          {locale === 'ar' ? 'من في إجازة هذا الأسبوع' : 'Who\'s out this week'}
        </h3>
      </div>
      {teamOut.length === 0 ? (
        <div style={{ padding: 20, fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
          {locale === 'ar' ? 'الفريق بالكامل حاضر هذا الأسبوع.' : 'Full team in this week.'}
        </div>
      ) : (
        teamOut.map((m, i) => (
          <div key={m.id} style={{
            padding: '12px 20px',
            borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {/* Avatar */}
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: AVATAR_COLOR[m.typeCode ?? ''] ?? 'var(--accent)',
              color: "var(--on-accent)",
              display: 'grid', placeItems: 'center',
              fontSize: 'var(--text-caption)', fontWeight: 700, flexShrink: 0,
            }}>
              {initials(m.firstName, m.lastName)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
                {m.firstName} {m.lastName}
              </div>
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 1 }}>
                {m.typeLabel ?? m.typeCode} · {fmtShort(m.startDate)}–{fmtShort(m.endDate)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
