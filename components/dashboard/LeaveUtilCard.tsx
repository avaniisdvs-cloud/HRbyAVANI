import type { LeaveUtilRow, UpcomingHoliday } from './AdminDashboard'

interface Props {
  locale?:   'en' | 'ar'
  leaveUtil: LeaveUtilRow[]
  holidays:  UpcomingHoliday[]
}

export function LeaveUtilCard({ locale = 'en', leaveUtil, holidays }: Props) {
  const COLORS = [
    'var(--avatar-1)',
    'var(--avatar-3)',
    'var(--avatar-8)',
    'var(--avatar-7)',
    'var(--avatar-5)',
  ]

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>
          {locale === 'ar' ? 'استخدام الإجازات (منذ بداية العام)' : 'Leave utilization (YTD)'}
        </h3>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {leaveUtil.length === 0 ? (
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
            {locale === 'ar' ? 'لا توجد بيانات' : 'No leave data'}
          </p>
        ) : leaveUtil.map((l, i) => {
          const pct = l.entitled > 0 ? Math.round((l.taken / l.entitled) * 100) : 0
          const label = locale === 'ar' ? (l.typeNameAr ?? l.typeNameEn ?? '—') : (l.typeNameEn ?? '—')
          return (
            <div key={l.typeNameEn ?? i}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                marginBottom: 6,
              }}>
                <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{label}</span>
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                  {l.taken} / {l.entitled} {locale === 'ar' ? 'أيام' : 'days'} · {pct}%
                </span>
              </div>
              <div style={{
                height: 6, borderRadius: 3, background: 'var(--border)',
                marginBottom: i < leaveUtil.length - 1 ? 14 : 0,
              }}>
                <div style={{
                  height: '100%', width: `${pct}%`, borderRadius: 3,
                  background: COLORS[i % COLORS.length],
                }} />
              </div>
            </div>
          )
        })}

        <div style={{ height: 1, background: 'var(--border)', margin: '14px 0 14px' }} />

        <div style={{
          fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)',
          textTransform: 'uppercase', letterSpacing: '1.2px',
          fontFamily: 'var(--font-mono)', marginBottom: 10,
        }}>
          {locale === 'ar' ? 'الإجازات الرسمية القادمة' : 'Upcoming Holidays'}
        </div>
        {holidays.length === 0 ? (
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
            {locale === 'ar' ? 'لا توجد إجازات قادمة' : 'No upcoming holidays'}
          </p>
        ) : holidays.map((h, i) => (
          <div key={h.nameEn} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: i < holidays.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
              {locale === 'ar' ? h.nameAr : h.nameEn}
            </span>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              {h.date}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
