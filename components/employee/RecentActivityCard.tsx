interface ActivityItem {
  id:                  string
  typeCode:            string | null
  typeLabel:           string | null
  durationDays:        string | number | null
  startDate:           string
  endDate:             string
  createdDate:         Date | string | null
  status:              string
  pendingApproverName?:  string | null
  pendingApproverSince?: Date | string | null
}

const ICON_STYLE: Record<string, { bg: string; fg: string }> = {
  ANNUAL:    { bg: '#D9E7E9', fg: '#0F4C5C' },
  SICK:      { bg: '#FAE8DC', fg: '#B56B45' },
  EMERGENCY: { bg: '#F9DEDE', fg: '#B33A3A' },
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; dot: string; label: string; labelAr: string }> = {
  APPROVED:  { bg: 'var(--status-approved-bg)',  fg: 'var(--status-approved-fg)',  dot: 'var(--status-approved-dot)',  label: 'Approved',  labelAr: 'موافق'         },
  REJECTED:  { bg: 'var(--status-rejected-bg)',  fg: 'var(--status-rejected-fg)',  dot: 'var(--status-rejected-dot)',  label: 'Rejected',  labelAr: 'مرفوض'         },
  CANCELLED: { bg: 'var(--status-draft-bg)',     fg: 'var(--status-draft-fg)',     dot: 'var(--status-draft-dot)',     label: 'Cancelled', labelAr: 'ملغى'          },
  TAKEN:     { bg: 'var(--status-approved-bg)',  fg: 'var(--status-approved-fg)',  dot: 'var(--status-approved-dot)',  label: 'Taken',     labelAr: 'مأخوذة'        },
  RECALLED:  { bg: 'var(--status-draft-bg)',     fg: 'var(--status-draft-fg)',     dot: 'var(--status-draft-dot)',     label: 'Recalled',  labelAr: 'مسحوب'         },
  PENDING:   { bg: 'var(--status-pending-bg)',   fg: 'var(--status-pending-fg)',   dot: 'var(--status-pending-dot)',   label: 'Pending',   labelAr: 'قيد المراجعة' },
}

function fmtShort(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })
}

function fmtSubmitted(d: Date | string | null) {
  if (!d) return ''
  const iso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
  return new Date(iso).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })
}

function pendingDuration(since: Date | string | null, locale: string): string {
  if (!since) return ''
  const sinceMs = since instanceof Date ? since.getTime() : new Date(since).getTime()
  if (isNaN(sinceMs)) return ''
  const diffMs   = Date.now() - sinceMs
  const diffHrs  = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays >= 1) {
    return locale === 'ar'
      ? `منذ ${diffDays} ${diffDays === 1 ? 'يوم' : 'أيام'}`
      : `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`
  }
  return locale === 'ar'
    ? `منذ ${diffHrs} ${diffHrs === 1 ? 'ساعة' : 'ساعات'}`
    : `${diffHrs} ${diffHrs === 1 ? 'hour' : 'hours'} ago`
}

export function RecentActivityCard({ items, locale = 'en' }: { items: ActivityItem[]; locale?: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: -0.1 }}>
          {locale === 'ar' ? 'الطلبات الأخيرة' : 'My recent activity'}
        </h3>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: 20, fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
          {locale === 'ar' ? 'لا توجد طلبات بعد.' : 'No leave requests yet.'}
        </div>
      ) : (
        items.map((item, i) => {
          const iconStyle = ICON_STYLE[item.typeCode ?? ''] ?? { bg: 'var(--surface)', fg: 'var(--ink-3)' }
          const s = STATUS_STYLE[item.status] ?? STATUS_STYLE.PENDING
          const days = Number(item.durationDays ?? 0)
          const isPending = item.status === 'PENDING'
          const dur = isPending ? pendingDuration(item.pendingApproverSince ?? null, locale) : ''
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 20px',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            }}>
              {/* Icon square */}
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: iconStyle.bg,
                color: iconStyle.fg,
                display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
                  {item.typeLabel ?? item.typeCode}{' · '}
                  {days} {locale === 'ar' ? (days === 1 ? 'يوم' : 'أيام') : (days === 1 ? 'day' : 'days')}
                </div>
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
                  {fmtShort(item.startDate)} → {fmtShort(item.endDate)}
                  {item.createdDate
                    ? (locale === 'ar'
                        ? ` · أُرسل في ${fmtSubmitted(item.createdDate)}`
                        : ` · Submitted ${fmtSubmitted(item.createdDate)}`)
                    : ''}
                </div>
              </div>

              {/* Status + pending info */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: s.bg, color: s.fg,
                  borderRadius: 999, padding: '3px 10px', fontSize: 'var(--text-caption)', fontWeight: 600,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} aria-hidden />
                  {locale === 'ar' ? s.labelAr : s.label}
                </span>
                {isPending && (
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', textAlign: 'right', lineHeight: 1.4 }}>
                    {item.pendingApproverName
                      ? (locale === 'ar'
                          ? `مع: ${item.pendingApproverName}`
                          : `With: ${item.pendingApproverName}`)
                      : (locale === 'ar' ? 'قيد المراجعة' : 'Awaiting review')}
                    {dur ? <><br />{dur}</> : null}
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
