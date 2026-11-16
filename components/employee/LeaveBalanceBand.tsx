interface LeaveBalance {
  code:      string
  label:     string
  remaining: number
  total:     number
  used:      number
}

const TYPE_COLOR: Record<string, string> = {
  ANNUAL:    '#0F4C5C',
  SICK:      '#E2956A',
  EMERGENCY: '#B33A3A',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function LeaveBalanceBand({
  balances,
  locale = 'en',
  isOnProbation = false,
  probationEndDate,
  onTypeClick,
  selectedTypeCode,
}: {
  balances: LeaveBalance[]
  locale?: string
  isOnProbation?: boolean
  probationEndDate?: string | null
  onTypeClick?: (typeCode: string) => void
  selectedTypeCode?: string | null
}) {
  const display = (['ANNUAL', 'SICK', 'EMERGENCY'] as const).map(code => {
    const b = balances.find(x => x.code === code)
    return {
      code,
      label:     b?.label     ?? code.charAt(0) + code.slice(1).toLowerCase(),
      remaining: b?.remaining ?? 0,
      total:     b?.total     ?? 0,
      used:      b?.used      ?? 0,
      color:     TYPE_COLOR[code] ?? 'var(--brand-active)',
    }
  })

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', letterSpacing: -0.1 }}>
          {locale === 'ar' ? `رصيد الإجازة — ${new Date().getFullYear()}` : `Leave balance — ${new Date().getFullYear()}`}
        </h3>
        <a
          href="/absence"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: 'transparent', color: 'var(--brand-active)',
            fontSize: 'var(--text-caption)', fontWeight: 600, textDecoration: 'none',
          }}
        >
          {locale === 'ar' ? '← عرض الكل' : 'View all →'}
        </a>
      </div>

      {/* Probation eligibility notice — BR-37 */}
      {isOnProbation && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 20px',
          background: '#FFF8E1',
          borderBottom: '1px solid #F0E68C',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#92610A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ fontSize: 'var(--text-body)', color: '#7A5C00', lineHeight: 1.4 }}>
            {locale === 'ar'
              ? `أنت في فترة التجربة. يبدأ استحقاق الإجازة بعد انتهاء فترة التجربة${probationEndDate ? ` في ${fmtDate(probationEndDate)}` : ''}.`
              : `You are on probation. Leave accrual begins after probation ends${probationEndDate ? ` on ${fmtDate(probationEndDate)}` : ''}.`}
          </span>
        </div>
      )}

      {/* 3-column band */}
      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {display.map((b, i) => {
          const pct       = b.total > 0 ? Math.round((b.used / b.total) * 100) : 0
          const isSelected = selectedTypeCode === b.code
          const isClickable = !!onTypeClick

          const cardContent = (
            <>
              <div style={{
                fontSize: 'var(--text-caption)', fontWeight: 600, color: isSelected ? b.color : 'var(--ink-3)',
                letterSpacing: '0.05em', textTransform: 'uppercase',
                marginBottom: 10,
              }}>
                {locale === 'ar'
                  ? (b.code === 'ANNUAL' ? 'سنوية' : b.code === 'SICK' ? 'مرضية' : b.code === 'EMERGENCY' ? 'طارئة' : b.label)
                  : b.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6,
              marginBottom: 10 }}>
                <span style={{
                  fontSize: 32, fontWeight: 600, color: 'var(--ink-1)',
                  fontFamily: 'var(--font-serif)', letterSpacing: -1,
                }}>
                  {b.remaining}
                </span>
                <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
                  {locale === 'ar' ? `/ ${b.total} أيام` : `/ ${b.total} days`}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`, background: b.color,
                  borderRadius: 4, transition: 'width .4s',
                }} />
              </div>
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginTop: 6 }}>
                {locale === 'ar'
                  ? `${b.used} ${b.used === 1 ? 'يوم' : 'أيام'} مستخدمة`
                  : `${b.used} ${b.used === 1 ? 'day' : 'days'} used`}
              </div>
              {isClickable && (
                <div style={{ fontSize: 'var(--text-caption)', color: isSelected ? b.color : 'var(--ink-3)',
                marginTop: 8, fontWeight: 500 }}>
                  {isSelected
                    ? (locale === 'ar' ? '▲ إخفاء التاريخ' : '▲ Hide history')
                    : (locale === 'ar' ? '▼ عرض التاريخ' : '▼ View history')}
                </div>
              )}
            </>
          )

          const sharedStyle: React.CSSProperties = {
            padding: '22px 24px',
            borderRightWidth: (i < 2) ? "1px" : "0px",
            borderRightStyle: (i < 2) ? "solid" : "none",
            borderRightColor: (i < 2) ? "var(--border)" : "currentColor",
            background: isSelected ? `${b.color}08` : 'transparent',
            transition: 'background 0.15s',
          }

          if (isClickable) {
            return (
              <button
                key={b.code}
                onClick={() => onTypeClick(b.code)}
                style={{
                  ...sharedStyle,
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderTopWidth: "0px",
                  borderTopStyle: "none",
                  borderTopColor: "currentColor",
                  borderBottomWidth: "0px",
                  borderBottomStyle: "none",
                  borderBottomColor: "currentColor",
                  borderLeftWidth: "0px",
                  borderLeftStyle: "none",
                  borderLeftColor: "currentColor",
                  borderRightWidth: (i < 2) ? "1px" : "0px",
                  borderRightStyle: (i < 2) ? "solid" : "none",
                  borderRightColor: (i < 2) ? "var(--border)" : "currentColor",
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
                aria-pressed={isSelected}
                aria-label={`${b.label} leave history`}
              >
                {cardContent}
              </button>
            )
          }

          return (
            <div key={b.code} style={sharedStyle}>
              {cardContent}
            </div>
          )
        })}
      </div>
    </div>
  )
}
