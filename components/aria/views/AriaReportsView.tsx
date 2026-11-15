'use client'

import {
  Users, Calendar, Clock, FileText,
  TrendingUp, CheckSquare, BarChart2,
  ChevronRight, Shield,
} from 'lucide-react'
import { type Locale } from '@/lib/i18n'

interface Props {
  onAskAria: (prompt: string) => void
  userRole:  string
  locale?:   Locale
}

const REPORTS = [
  {
    id: 'headcount',
    title: 'Headcount Report',
    titleAr: 'تقرير القوى العاملة',
    description: 'Active employees by department, grade and entity. Includes new hires and terminations.',
    descriptionAr: 'الموظفون النشطون حسب القسم والدرجة والكيان. يشمل التعيينات الجديدة وحالات إنهاء الخدمة.',
    icon: Users,
    color: 'var(--brand-active)',
    allowedRoles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'MANAGER'],
    prompt:
      'Generate a headcount report showing: ' +
      '1) Total active employees ' +
      '2) Breakdown by department ' +
      '3) Breakdown by grade ' +
      '4) New hires this month ' +
      '5) Terminations this month. ' +
      'Format as a structured summary.',
  },
  {
    id: 'leave-utilisation',
    title: 'Leave Utilisation',
    titleAr: 'استخدام الإجازات',
    description: 'Leave taken vs entitlement across all leave types. Highlights employees with low or high utilisation.',
    descriptionAr: 'الإجازات المستخدمة مقابل الاستحقاق لجميع أنواع الإجازات. يبرز الموظفين ذوي الاستخدام المنخفض أو المرتفع.',
    icon: Calendar,
    color: 'var(--status-approved-fg)',
    allowedRoles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'MANAGER'],
    prompt:
      'Generate a leave utilisation report showing: ' +
      '1) Total leave days taken this year by type ' +
      '2) Average utilisation percentage per leave type ' +
      '3) Employees with 0 leave taken ' +
      '4) Pending leave requests count. ' +
      'Format as a structured summary.',
  },
  {
    id: 'attendance',
    title: 'Attendance Summary',
    titleAr: 'ملخص الحضور',
    description: 'Monthly attendance overview showing present, late, absent and exception rates.',
    descriptionAr: 'نظرة عامة شهرية على الحضور تعرض معدلات الحضور والتأخير والغياب والاستثناءات.',
    icon: Clock,
    color: 'var(--status-pending-fg)',
    allowedRoles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'MANAGER'],
    prompt:
      'Generate an attendance summary report showing: ' +
      '1) Overall attendance rate this month ' +
      '2) Late arrivals count and percentage ' +
      '3) Absent days count ' +
      '4) Employees with most exceptions. ' +
      'Format as a structured summary.',
  },
  {
    id: 'document-expiry',
    title: 'Document Expiry',
    titleAr: 'انتهاء صلاحية الوثائق',
    description: 'Passports, visas and Emirates IDs expiring within 30, 60 and 90 days.',
    descriptionAr: 'جوازات السفر والتأشيرات وبطاقات الهوية الإماراتية التي تنتهي صلاحيتها خلال 30 و60 و90 يومًا.',
    icon: FileText,
    color: 'var(--status-rejected-fg)',
    allowedRoles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN'],
    prompt:
      'Generate a document expiry report showing: ' +
      '1) Documents expiring within 30 days (critical) ' +
      '2) Documents expiring within 31-60 days (warning) ' +
      '3) Documents expiring within 61-90 days (info) ' +
      'Group by document type (passport, visa, EID). ' +
      'Format as a structured list per employee.',
  },
  {
    id: 'emiratisation',
    title: 'Emiratisation Status',
    titleAr: 'حالة التوطين',
    description: 'UAE national ratio vs Nafis target. Breakdown by department and Emiratisation-eligible roles.',
    descriptionAr: 'نسبة المواطنين الإماراتيين مقابل هدف نافس. تفصيل حسب القسم والأدوار المؤهلة للتوطين.',
    icon: TrendingUp,
    color: 'var(--brand-active)',
    allowedRoles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN'],
    prompt:
      'Generate an Emiratisation report showing: ' +
      '1) Current UAE national percentage of workforce ' +
      '2) Target percentage (4%) and gap ' +
      '3) UAE nationals by department ' +
      '4) Emiratisation-eligible open roles. ' +
      'Format as a structured summary.',
  },
  {
    id: 'pending-approvals',
    title: 'Pending Approvals',
    titleAr: 'الموافقات المعلقة',
    description: 'All pending workflow items including leave requests, salary changes and exceptions.',
    descriptionAr: 'جميع عناصر سير العمل المعلقة بما في ذلك طلبات الإجازة وتغييرات الرواتب والاستثناءات.',
    icon: CheckSquare,
    color: 'var(--status-pending-fg)',
    allowedRoles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN', 'MANAGER'],
    prompt:
      'Generate a pending approvals report showing: ' +
      '1) Total pending items by workflow type ' +
      '2) Items beyond SLA deadline ' +
      '3) Oldest pending item ' +
      '4) Approvals by assigned approver. ' +
      'Format as a structured summary.',
  },
  {
    id: 'eosb-provision',
    title: 'EOSB Provision',
    titleAr: 'مخصص مكافأة نهاية الخدمة',
    description: 'Estimated EOSB liability across all eligible employees based on current service and salary.',
    descriptionAr: 'الالتزام التقديري لمكافأة نهاية الخدمة لجميع الموظفين المؤهلين بناءً على مدة الخدمة والراتب الحاليين.',
    icon: BarChart2,
    color: 'var(--brand-active)',
    allowedRoles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'FINANCE_ADMIN'],
    prompt:
      'Generate an EOSB provision report showing: ' +
      '1) Total estimated EOSB liability in AED ' +
      '2) Employees in year 1-5 bracket (21 days/year) ' +
      '3) Employees in 5+ year bracket (30 days/year) ' +
      '4) Top 10 highest EOSB liabilities. ' +
      'Format as a structured financial summary.',
  },
  {
    id: 'team-document-expiry',
    title: 'Team Document Expiry',
    titleAr: 'انتهاء وثائق الفريق',
    description: 'Passports, visas and Emirates IDs expiring within 90 days for your direct and indirect reports.',
    descriptionAr: 'جوازات السفر والتأشيرات وبطاقات الهوية الإماراتية التي تنتهي صلاحيتها خلال 90 يومًا لمرؤوسيك المباشرين وغير المباشرين.',
    icon: FileText,
    color: 'var(--status-rejected-fg)',
    allowedRoles: ['MANAGER'],
    prompt:
      'Generate a document expiry report for my direct and indirect reports showing: ' +
      '1) Documents expiring within 30 days (critical) ' +
      '2) Documents expiring within 31–60 days (warning) ' +
      '3) Documents expiring within 61–90 days (info) ' +
      'Group by document type (passport, visa, EID). ' +
      'Format as a structured list per employee.',
  },
  {
    id: 'new-joiners-month',
    title: 'New Joiners This Month',
    titleAr: 'الموظفون الجدد هذا الشهر',
    description: 'Employees who joined your team this calendar month, with their role, department and start date.',
    descriptionAr: 'الموظفون الذين انضموا إلى فريقك خلال هذا الشهر الميلادي، مع أدوارهم وأقسامهم وتاريخ المباشرة.',
    icon: Users,
    color: 'var(--status-approved-fg)',
    allowedRoles: ['MANAGER'],
    prompt:
      'List all employees who joined my team (my direct or indirect reports) this calendar month showing: ' +
      '1) Employee name and employee number ' +
      '2) Position title and department ' +
      '3) Start date ' +
      '4) Probation end date ' +
      'Format as a structured list.',
  },
  {
    id: 'compliance',
    title: 'Compliance Health',
    titleAr: 'الامتثال التنظيمي',
    description: 'WPS status, GPSSA submissions, contract renewals and overall compliance score.',
    descriptionAr: 'حالة نظام حماية الأجور، وإقرارات الهيئة العامة للمعاشات، وتجديد العقود، ودرجة الامتثال الإجمالية.',
    icon: Shield,
    color: 'var(--status-approved-fg)',
    allowedRoles: ['SUPER_ADMIN', 'HR_DIRECTOR', 'HR_ADMIN'],
    prompt:
      'Generate a compliance health report showing: ' +
      '1) WPS payment status for current month ' +
      '2) GPSSA last submission date and status ' +
      '3) Contracts expiring this month ' +
      '4) Overall compliance score out of 100. ' +
      'Format as a structured compliance summary.',
  },
]

export default function AriaReportsView({ onAskAria, userRole, locale = 'en' }: Props) {
  const isAr = locale === 'ar'
  const visibleReports = REPORTS.filter(r => r.allowedRoles.includes(userRole))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '20px',
          fontWeight: 600,
          color: 'var(--ink-1)',
          margin: '0 0 4px',
        }}>
          {isAr ? 'التقارير' : 'Reports'}
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--ink-3)', margin: 0 }}>
          {userRole === 'MANAGER'
            ? (isAr ? 'اختر تقريرًا — ستقوم آريا بإنشائه لفريقك على الفور' : 'Select a report — ARIA will generate it for your team instantly')
            : (isAr ? 'اختر تقريرًا — ستقوم آريا بإنشائه على الفور باستخدام البيانات الحية' : 'Select a report — ARIA will generate it instantly using live data')}
        </p>
      </div>

      {/* Report grid — scrollable */}
      <div data-responsive-grid="true" style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 24px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        alignContent: 'start',
      }}>
        {visibleReports.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', paddingTop: 60, color: 'var(--ink-4)', fontSize: 'var(--text-body)' }}>
            {isAr ? 'لا توجد تقارير متاحة لدورك.' : 'No reports available for your role.'}
          </div>
        )}

        {visibleReports.map(report => {
          const Icon = report.icon
          return (
            <div
              key={report.id}
              role="article"
              data-testid="report-card"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '18px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                transition: 'border-color 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              {/* Icon + title */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, color: report.color,
                }}>
                  <Icon size={17} />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.3, marginBottom: 2 }}
                    {...(isAr ? { dir: 'rtl' as const, lang: 'ar' } : {})}
                  >
                    {isAr ? report.titleAr : report.title}
                  </div>
                  <div
                    style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', direction: isAr ? 'ltr' : 'rtl', textAlign: isAr ? 'left' : 'right' }}
                  >
                    {isAr ? report.title : report.titleAr}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p
                style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: 0, lineHeight: 1.5, flex: 1 }}
                {...(isAr ? { dir: 'rtl' as const, lang: 'ar' } : {})}
              >
                {isAr ? report.descriptionAr : report.description}
              </p>

              {/* Generate button */}
              <button
                onClick={() => onAskAria(report.prompt)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '9px 14px',
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 'var(--text-caption)',
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {isAr ? 'إنشاء التقرير' : 'Generate Report'}
                <ChevronRight size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
