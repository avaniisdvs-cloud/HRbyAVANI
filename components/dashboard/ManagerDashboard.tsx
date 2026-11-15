import Link from 'next/link'
import { Check, Users, Calendar, Clock } from 'lucide-react'

export interface TeamMember {
  id:          string
  fullNameEn:  string | null
  jobTitleEn:  string | null
  status:      string
}

export interface PendingWorkflowItem {
  id:           string
  personNameEn: string | null
  detail:       string
  type:         string
}

export interface ManagerDashboardProps {
  userName:         string
  locale?:          'en' | 'ar'
  teamSize:         number
  pendingApprovals: number
  onLeaveThisMonth: number
  teamMembers:      TeamMember[]
  pendingItems:     PendingWorkflowItem[]
}

function avatarColor(str: string): string {
  let h = 0
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff
  return `var(--avatar-${(h % 10) + 1})`
}

function initials(name: string | null): string {
  if (!name) return '??'
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function Avatar({ name }: { name: string | null }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: avatarColor(name ?? '?'),
      color: 'var(--primary-foreground)',
      display: 'grid', placeItems: 'center',
      fontSize: 'var(--text-caption)', fontWeight: 700, flexShrink: 0,
      fontFamily: 'var(--font-sans)',
    }}>
      {initials(name)}
    </div>
  )
}

export function ManagerDashboard({
  userName,
  locale = 'en',
  teamSize,
  pendingApprovals,
  onLeaveThisMonth,
  teamMembers,
  pendingItems,
}: ManagerDashboardProps) {
  const firstName = userName.split(' ')[0] || 'Manager'
  const uaeHour   = (new Date().getUTCHours() + 4) % 24
  const greeting  = uaeHour < 12
    ? (locale === 'ar' ? 'صباح الخير' : 'Good morning')
    : uaeHour < 18
    ? (locale === 'ar' ? 'مساء الخير' : 'Good afternoon')
    : (locale === 'ar' ? 'مساء النور' : 'Good evening')

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box' }}>

      {/* Section 1 — Greeting */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 24 }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 500,
          letterSpacing: '-0.6px', color: 'var(--ink-1)', margin: 0,
        }}>
          {greeting}, {firstName}.
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: 0 }}>
          {locale === 'ar'
            ? `أنت تقود ${teamSize} موظفين في فريقك.`
            : `You lead ${teamSize} ${teamSize === 1 ? 'person' : 'people'} on your team.`}
        </p>
      </div>

      {/* Section 2 — KPI Cards */}
      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>

        {/* Pending Approvals */}
        <Link href="/workflows" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'var(--accent-050)', border: '1px solid var(--accent-200)',
            borderRadius: 12, padding: '20px 22px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={16} strokeWidth={2} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />
              <span style={{
                fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--brand-active)',
                textTransform: 'uppercase', letterSpacing: '1.2px',
                fontFamily: 'var(--font-mono)',
              }}>
                {locale === 'ar' ? 'الموافقات المعلقة' : 'Pending Approvals'}
              </span>
            </div>
            <div style={{
              fontFamily: 'var(--font-serif)', fontSize: 40, fontWeight: 500,
              color: 'var(--accent-900)', lineHeight: 1, marginTop: 10,
            }}>
              {pendingApprovals}
            </div>
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--brand-active)', marginTop: 4 }}>
              {locale === 'ar' ? 'طلبات تحتاج مراجعة' : 'Requests awaiting review'}
            </div>
          </div>
        </Link>

        {/* Team Size */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '20px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={16} strokeWidth={1.75} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
            <span style={{
              fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)',
              textTransform: 'uppercase', letterSpacing: '1.2px',
              fontFamily: 'var(--font-mono)',
            }}>
              {locale === 'ar' ? 'حجم الفريق' : 'Team Size'}
            </span>
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)', fontSize: 40, fontWeight: 500,
            color: 'var(--ink-1)', lineHeight: 1, marginTop: 10,
          }}>
            {teamSize}
          </div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 4 }}>
            {locale === 'ar' ? 'موظفون نشطون' : 'Active employees'}
          </div>
        </div>

        {/* On Leave This Month */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '20px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={16} strokeWidth={1.75} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
            <span style={{
              fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)',
              textTransform: 'uppercase', letterSpacing: '1.2px',
              fontFamily: 'var(--font-mono)',
            }}>
              {locale === 'ar' ? 'في إجازة هذا الشهر' : 'On Leave This Month'}
            </span>
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)', fontSize: 40, fontWeight: 500,
            color: 'var(--ink-1)', lineHeight: 1, marginTop: 10,
          }}>
            {onLeaveThisMonth}
          </div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 4 }}>
            {locale === 'ar' ? 'طلبات موافق عليها' : 'Approved requests'}
          </div>
        </div>

        {/* Avg Hours placeholder */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '20px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} strokeWidth={1.75} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
            <span style={{
              fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)',
              textTransform: 'uppercase', letterSpacing: '1.2px',
              fontFamily: 'var(--font-mono)',
            }}>
              {locale === 'ar' ? 'متوسط الساعات' : 'Avg Hours / Week'}
            </span>
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)', fontSize: 40, fontWeight: 500,
            color: 'var(--ink-1)', lineHeight: 1, marginTop: 10,
          }}>
            —
          </div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 4 }}>
            {locale === 'ar' ? 'جداول الدوام قريباً' : 'Timesheets coming soon'}
          </div>
        </div>
      </div>

      {/* Section 3 — Two-column layout */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', width: '100%' }}>

        {/* LEFT — Needs your review */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>
                {locale === 'ar' ? 'تحتاج مراجعتك' : 'Needs your review'}
              </h3>
              <Link href="/workflows" style={{
                fontSize: 'var(--text-body)', color: 'var(--brand-active)', textDecoration: 'none',
              }}>
                {locale === 'ar' ? '‹ فتح القائمة' : 'Open queue ›'}
              </Link>
            </div>
            {pendingItems.length === 0 ? (
              <div style={{ padding: '24px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
                  {locale === 'ar' ? 'لا توجد طلبات معلقة' : 'No pending requests'}
                </p>
              </div>
            ) : pendingItems.map((item, i) => {
              const pill = item.type === 'TIMESHEET'
                ? { bg: 'var(--status-info)', fg: 'var(--nav-fg-strong)', dot: 'var(--status-info)' }
                : { bg: 'var(--status-pending-bg)', fg: 'var(--status-pending-fg)', dot: 'var(--status-pending-dot)' }
              const pillLabel = item.type === 'TIMESHEET'
                ? (locale === 'ar' ? 'دوام' : 'TIMESHEET')
                : (locale === 'ar' ? 'إجازة' : 'LEAVE')
              return (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 20px',
                  borderBottom: i === pendingItems.length - 1 ? 'none' : '1px solid var(--border)',
                }}>
                  <Avatar name={item.personNameEn} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.3 }}>
                      {item.personNameEn ?? '—'}
                    </div>
                    <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
                      {item.detail}
                    </div>
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: pill.bg, color: pill.fg,
                    borderRadius: 999, padding: '3px 10px',
                    fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.5px', flexShrink: 0,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: pill.dot, display: 'inline-block' }} />
                    {pillLabel}
                  </span>
                  <Link
                    href="/workflows"
                    style={{
                      background: 'var(--card)', border: '1px solid var(--border)',
                      color: 'var(--ink-1)', borderRadius: 7,
                      padding: '6px 14px', fontSize: 'var(--text-caption)', fontWeight: 600,
                      cursor: 'pointer', textDecoration: 'none', flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {locale === 'ar' ? 'مراجعة' : 'Review'}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT — Team at a glance */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>
                {locale === 'ar' ? 'الفريق بلمحة' : 'Team at a glance'}
              </h3>
            </div>
            {teamMembers.length === 0 ? (
              <div style={{ padding: '24px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
                  {locale === 'ar' ? 'لا يوجد فريق مرتبط بحسابك' : 'No team members linked to your account'}
                </p>
              </div>
            ) : teamMembers.map((member, i) => (
              <div key={member.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 20px',
                borderBottom: i === teamMembers.length - 1 ? 'none' : '1px solid var(--border)',
              }}>
                <Avatar name={member.fullNameEn} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.3 }}>
                    {member.fullNameEn ?? '—'}
                  </div>
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
                    {member.jobTitleEn ?? '—'}
                  </div>
                </div>
                {member.status === 'ON_LEAVE' ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'var(--status-pending-bg)', color: 'var(--status-pending-fg)',
                    borderRadius: 999, padding: '3px 8px',
                    fontSize: 'var(--text-caption)', fontWeight: 700, flexShrink: 0,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-pending-dot)', display: 'inline-block' }} />
                    {locale === 'ar' ? 'في إجازة' : 'ON LEAVE'}
                  </span>
                ) : (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--status-approved-dot)', display: 'inline-block', flexShrink: 0 }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
