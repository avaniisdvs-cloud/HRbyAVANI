export function CompanyUpdatesCard({ locale = 'en' }: { locale?: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: -0.1 }}>
          {locale === 'ar' ? 'أخبار الشركة' : 'Company updates'}
        </h3>
      </div>
      <div style={{
        padding: '28px 20px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 10, textAlign: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ink-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--ink-3)', lineHeight: 1.5 }}>
          {locale === 'ar'
            ? 'لا توجد إعلانات في الوقت الحالي.'
            : 'No company announcements at this time.'}
        </p>
      </div>
    </div>
  )
}
