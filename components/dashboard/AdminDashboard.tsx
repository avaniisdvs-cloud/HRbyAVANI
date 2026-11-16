import { BrandText } from '@/components/providers/BrandingProvider'
import { PageTitle } from '@/components/ui/typography'
import Link from 'next/link'
import { Download, Plus, Users, Calendar, Check, Clock } from 'lucide-react'
import { DeptBarRow }    from './DeptBarRow'
import { LeaveUtilCard } from './LeaveUtilCard'
import { KpiCardLink }   from './KpiCardLink'

export interface DeptRow {
  id:           string
  nameEn:       string
  nameAr:       string | null
  entityNameEn: string | null
  count:        number
}

export interface LeaveUtilRow {
  typeNameEn: string | null
  typeNameAr: string | null
  taken:      number
  entitled:   number
}

export interface UpcomingHoliday {
  nameEn: string
  nameAr: string
  date:   string
}

export interface AdminDashboardProps {
  locale?:          'en' | 'ar'
  /** Today as YYYY-MM-DD (server-computed) — used for the On-Leave-Today drill-down. */
  today:            string
  headcount:        number
  onLeaveToday:     number
  pendingApprovals: number
  departments:      DeptRow[]
  leaveUtil:        LeaveUtilRow[]
  holidays:         UpcomingHoliday[]
}

const card: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)',
  borderRadius: 12, padding: '22px 24px',
  display: 'flex', flexDirection: 'column', gap: 6,
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '1.2px', fontFamily: 'var(--font-mono)',
}

const numStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)', fontSize: 40, fontWeight: 500,
  lineHeight: 1, marginTop: 8,
}

export function AdminDashboard({
  locale = 'en',
  today,
  headcount,
  onLeaveToday,
  pendingApprovals,
  departments,
  leaveUtil,
  holidays,
}: AdminDashboardProps) {
  const maxCount = Math.max(1, ...departments.map(d => d.count))
  const deptCount  = departments.filter(d => d.count > 0).length
  const entityCount = new Set(departments.map(d => d.entityNameEn).filter(Boolean)).size

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box' }}>

      {/* Section 1 — Page Header */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <PageTitle style={{
            fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500,
            letterSpacing: '-0.5px', color: 'var(--ink-1)', margin: 0,
          }}>
            <BrandText>{locale === 'ar' ? 'موظفو Avaniis — نظرة عامة' : 'Avaniis People — Overview'}</BrandText>
          </PageTitle>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
            <BrandText>{locale === 'ar'
              ? 'مؤشرات الموارد البشرية لجميع كيانات مجموعة Avaniis'
              : 'Org-wide HR metrics across all Avaniis entities'}</BrandText>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link
            href="/reports?report=headcount"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--card)', border: '1px solid var(--border)',
              color: 'var(--ink-1)', borderRadius: 7,
              padding: '9px 16px', fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer',
              textDecoration: 'none',
            }}
          >
            <Download size={16} strokeWidth={1.75} />
            {locale === 'ar' ? 'تصدير' : 'Export'}
          </Link>
          <Link
            href="/persons/new"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: 'var(--primary-foreground)',
              borderRadius: 7, padding: '9px 16px', fontSize: 'var(--text-body)',
              fontWeight: 600, textDecoration: 'none',
            }}
          >
            <Plus size={16} strokeWidth={2} />
            {locale === 'ar' ? 'إضافة موظف' : 'Add employee'}
          </Link>
        </div>
      </div>

      {/* Section 2 — KPI Cards */}
      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>

        {/* Card 1 — Active Headcount → active employees list (status=ACTIVE & isActive=1) */}
        <KpiCardLink
          href="/persons?status=ACTIVE&isActive=1"
          hint={locale === 'ar' ? 'عرض الموظفين ←' : 'View employees →'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} strokeWidth={1.75} style={{ color: 'var(--ink-3)' }} />
            <span style={{ ...labelStyle, color: 'var(--ink-3)' }}>
              {locale === 'ar' ? 'إجمالي الموظفين' : 'Active Headcount'}
            </span>
          </div>
          <div style={{ ...numStyle, color: 'var(--ink-1)' }}>{headcount}</div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
            {locale === 'ar'
              ? `${deptCount} أقسام · ${entityCount} كيانات`
              : `${deptCount} departments · ${entityCount} entities`}
          </div>
        </KpiCardLink>

        {/* Card 2 — On Leave Today → approved absences overlapping today */}
        <KpiCardLink
          href={`/absence?status=APPROVED&fromDate=${today}&toDate=${today}`}
          hint={locale === 'ar' ? 'عرض الإجازات ←' : 'View leave →'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} strokeWidth={1.75} style={{ color: 'var(--ink-3)' }} />
            <span style={{ ...labelStyle, color: 'var(--ink-3)' }}>
              {locale === 'ar' ? 'في إجازة اليوم' : 'On Leave Today'}
            </span>
          </div>
          <div style={{ ...numStyle, color: 'var(--ink-1)' }}>{onLeaveToday}</div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
            {locale === 'ar' ? 'غيابات موافق عليها' : 'Approved absences'}
          </div>
        </KpiCardLink>

        {/* Card 3 — Pending Approvals */}
        <KpiCardLink
          href="/workflows"
          accent
          hint={locale === 'ar' ? 'فتح القائمة ←' : 'Open queue →'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={16} strokeWidth={2} style={{ color: 'var(--brand-active)' }} />
            <span style={{ ...labelStyle, color: 'var(--brand-active)' }}>
              {locale === 'ar' ? 'الموافقات المعلقة' : 'Pending Approvals'}
            </span>
          </div>
          <div style={{ ...numStyle, color: 'var(--accent-900)' }}>{pendingApprovals}</div>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--brand-active)', marginTop: 2 }}>
            {locale === 'ar' ? 'قائمة المدير' : 'Manager queue'}
          </div>
        </KpiCardLink>

        {/*
          Card 4 — Overtime Alerts.
          There is no defined "overtime alert" metric/business rule yet, so this
          card is intentionally NOT a clickable metric. It is rendered as an
          explicitly disabled "coming soon" state (muted, non-interactive) rather
          than a fake "—" value that looks like real data. When a grounded
          overtime-alert query + drill-down route exist, replace this with a
          <Link> following the Active Headcount / On Leave Today pattern.
        */}
        <div
          style={{ ...card, opacity: 0.6, cursor: 'default' }}
          aria-disabled="true"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} strokeWidth={1.75} style={{ color: 'var(--ink-3)' }} />
              <span style={{ ...labelStyle, color: 'var(--ink-3)' }}>
                {locale === 'ar' ? 'تنبيهات الإضافي' : 'Overtime Alerts'}
              </span>
            </div>
            <span style={{
              fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px',
              fontFamily: 'var(--font-mono)', color: 'var(--ink-3)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 999, padding: '2px 7px',
            }}>
              {locale === 'ar' ? 'قريباً' : 'Coming soon'}
            </span>
          </div>
          <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', marginTop: 10, lineHeight: 1.4 }}>
            {locale === 'ar'
              ? 'تنبيهات العمل الإضافي ستتوفر عند إطلاق وحدة جداول الدوام.'
              : 'Overtime alerts will be available once the timesheets module is live.'}
          </div>
        </div>
      </div>

      {/* Section 3 — Two-column layout */}
      <div className="dashboard-columns" style={{ display: 'flex', gap: 20, alignItems: 'flex-start', width: '100%' }}>

        {/* LEFT — Headcount by department */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
                {locale === 'ar' ? 'توزيع الموظفين حسب القسم' : 'Headcount by department'}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                {locale === 'ar'
                  ? 'انقر على قسم لعرض موظفيه النشطين'
                  : 'Click a department to view its active employees'}
              </p>
            </div>
            <div style={{ padding: '12px 20px 20px' }}>
              {departments.length === 0 ? (
                <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', textAlign: 'center', padding: '24px 0' }}>
                  {locale === 'ar' ? 'لا توجد بيانات' : 'No departments found'}
                </p>
              ) : departments.map((d, i) => (
                <DeptBarRow
                  key={d.id}
                  id={d.id}
                  name={d.nameEn}
                  count={d.count}
                  entity={d.entityNameEn ?? ''}
                  maxCount={maxCount}
                  isLast={i === departments.length - 1}
                />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — Leave utilization + holidays */}
        <div style={{ width: 320, maxWidth: '100%', flexShrink: 0 }}>
          <LeaveUtilCard locale={locale} leaveUtil={leaveUtil} holidays={holidays} />
        </div>
      </div>

    </div>
  )
}
