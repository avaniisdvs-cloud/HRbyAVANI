import { PageTitle } from '@/components/ui/typography'
import Link from 'next/link'

interface Props {
  firstName:    string
  greeting:     string
  todayDisplay: string
  pendingCount: number
  hoursThisWeek?: number
  locale?: string
}

export function EmployeeHero({ firstName, greeting, todayDisplay, pendingCount, hoursThisWeek = 0, locale = 'en' }: Props) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--accent-900) 0%, var(--accent-700) 100%)',
      borderRadius: 16,
      padding: '28px 32px',
      color: "var(--on-accent)",
      position: 'relative',
      overflow: 'hidden',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Decorative circles */}
      <div style={{ position: 'absolute', right: -60, top: -80, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          width: 320, height: 320, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
        }} />
      </div>
      <div style={{
        position: 'absolute', right: 60, top: 40,
        width: 220, height: 220, borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.03)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 'var(--text-body)', opacity: 0.75, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {todayDisplay.toUpperCase()}
        </div>
        <PageTitle style={{
          fontFamily: 'var(--font-serif)', fontSize: 34, fontWeight: 500, margin: '6px 0 4px',
          letterSpacing: '-0.8px', color: "var(--on-accent)",
        }}>
          {greeting}, {firstName}.
        </PageTitle>
        <p style={{ opacity: 0.82, fontSize: 'var(--text-body)', margin: 0, maxWidth: 520, color: "var(--on-accent)" }}>
          {pendingCount > 0
            ? (locale === 'ar'
                ? `لديك ${pendingCount} طلب إجازة${pendingCount > 1 ? '' : ''} قيد المراجعة.`
                : `You have ${pendingCount} leave request${pendingCount > 1 ? 's' : ''} pending review.`)
            : (locale === 'ar'
                ? 'لا يوجد ما يستدعي انتباهك. يوم منتج!'
                : 'Nothing needs your attention. Have a productive day.')}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <Link
            href="/absence/new"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: "var(--card)", color: 'var(--accent-900)',
              borderRadius: 7, padding: '9px 16px', fontSize: 'var(--text-body)',
              fontWeight: 600, fontFamily: 'var(--font-sans)', textDecoration: 'none',
              letterSpacing: '0.01em',
            }}
          >
            {locale === 'ar' ? '+ طلب إجازة' : '+ Request Leave'}
          </Link>
          <Link
            href="/timesheet"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.12)', color: "var(--on-accent)",
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 7, padding: '9px 16px', fontSize: 'var(--text-body)',
              fontWeight: 500, fontFamily: 'var(--font-sans)', textDecoration: 'none',
              letterSpacing: '0.01em',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {locale === 'ar' ? `تسجيل الساعات (${hoursThisWeek} س هذا الأسبوع)` : `Log hours (${hoursThisWeek}h this week)`}
          </Link>
        </div>
      </div>
    </div>
  )
}
