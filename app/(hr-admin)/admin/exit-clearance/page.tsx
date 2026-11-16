import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { onboardingChecklists, persons, legalEntities } from '@/drizzle/schema'
import { and, eq, desc } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { getLocale, t } from '@/lib/locale-server'
import type { Locale } from '@/lib/i18n'
import Link from 'next/link'
import { LogOut, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'

export const metadata = { title: 'Exit Clearance' }

const ALLOWED_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'] as const

export default async function ExitClearancePage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    redirect('/dashboard')
  }

  const locale = await getLocale()

  const checklists = await db
    .select({
      id:              onboardingChecklists.id,
      personId:        onboardingChecklists.personId,
      fullNameEn:      persons.fullNameEn,
      fullNameAr:      persons.fullNameAr,
      personNumber:    persons.personNumber,
      legalEntityName: legalEntities.nameEn,
      initiatedDate:   onboardingChecklists.initiatedDate,
      targetDate:      onboardingChecklists.targetDate,
      status:          onboardingChecklists.status,
      completionPct:   onboardingChecklists.completionPct,
    })
    .from(onboardingChecklists)
    .leftJoin(persons,        eq(onboardingChecklists.personId,        persons.id))
    .leftJoin(legalEntities,  eq(onboardingChecklists.legalEntityId,  legalEntities.id))
    .where(
      and(
        eq(onboardingChecklists.tenantId,      TENANT_ID),
        eq(onboardingChecklists.checklistType, 'OFFBOARDING'),
      ),
    )
    .orderBy(desc(onboardingChecklists.initiatedDate))

  const inProgress = checklists.filter(c => c.status !== 'COMPLETED')
  const completed  = checklists.filter(c => c.status === 'COMPLETED')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
        <LogOut size={22} color="var(--accent)" strokeWidth={1.5} />
        <div>
          <PageTitle style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
            {t(locale, 'Exit Clearance', 'إخلاء الطرف')}
          </PageTitle>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
            {t(locale, 'Manage offboarding checklists for departing employees', 'إدارة قوائم إنهاء الخدمة للموظفين المغادرين')}
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {inProgress.length > 0 && (
            <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: 'rgba(217,119,6,0.1)', color: '#d97706' }}>
              {locale === 'ar' ? `${inProgress.length} قيد التنفيذ` : `${inProgress.length} In Progress`}
            </span>
          )}
          <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: 'var(--surface)', color: 'var(--ink-2)' }}>
            {locale === 'ar' ? `${completed.length} مكتملة` : `${completed.length} Completed`}
          </span>
        </div>
      </div>

      {checklists.length === 0 ? (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '48px 24px', textAlign: 'center',
        }}>
          <LogOut size={36} color="var(--ink-4)" strokeWidth={1.5} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
            {t(locale,
              'No offboarding checklists found. They are created automatically when a contract is terminated.',
              'لا توجد قوائم إنهاء خدمة. يتم إنشاؤها تلقائياً عند إنهاء أي عقد.')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {inProgress.length > 0 && (
            <ClearanceGroup title="In Progress" titleAr="قيد التنفيذ" items={inProgress} locale={locale} />
          )}
          {completed.length > 0 && (
            <ClearanceGroup title="Completed" titleAr="مكتملة" items={completed} locale={locale} />
          )}
        </div>
      )}
    </div>
  )
}

type ChecklistRow = {
  id: string
  personId: string
  fullNameEn: string | null
  fullNameAr: string | null
  personNumber: string | null
  legalEntityName: string | null
  initiatedDate: string | null
  targetDate: string | null
  status: string | null
  completionPct: number | null
}

function ClearanceGroup({
  title, titleAr, items, locale,
}: { title: string; titleAr: string; items: ChecklistRow[]; locale: Locale }) {
  const isComplete = title === 'Completed'
  const borderColor = isComplete ? 'var(--border)' : 'rgba(217,119,6,0.2)'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 'var(--text-body)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
          color: isComplete ? 'var(--ink-3)' : '#d97706',
        }}>
          {locale === 'ar' ? titleAr : title}
        </span>
        {locale !== 'ar' && (
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>({titleAr})</span>
        )}
        <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--surface)', color: 'var(--ink-3)', marginLeft: 4 }}>
          {items.length}
        </span>
      </div>

      <div style={{ border: `1px solid ${borderColor}`, borderRadius: 10, overflow: 'hidden' }}>
        {items.map((item, idx) => {
          const pct = item.completionPct ?? 0
          const isOverdue = item.targetDate && new Date(item.targetDate) < new Date() && item.status !== 'COMPLETED'

          return (
            <div
              data-responsive-grid="true" key={item.id}
              style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                gap: 16, alignItems: 'center', padding: '14px 16px',
                background: idx % 2 === 0 ? 'var(--card)' : 'var(--surface)',
                borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              {/* Person info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: isComplete ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.1)',
                  color: isComplete ? '#16a34a' : '#d97706',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--text-caption)', fontWeight: 700, flexShrink: 0,
                }}>
                  {(item.fullNameEn || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
                    {item.fullNameEn || '—'}
                  </div>
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                    {item.personNumber} · {item.legalEntityName ?? (locale === 'ar' ? 'كيان غير معروف' : 'Unknown Entity')}
                  </div>
                </div>
              </div>

              {/* Target date */}
              <div style={{ textAlign: 'right', minWidth: 120 }}>
                {item.targetDate && (
                  <>
                    <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
                      {locale === 'ar' ? 'آخر يوم: ' : 'Last day: '}{new Date(item.targetDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    {isOverdue && (
                      <div style={{ fontSize: 'var(--text-caption)', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                        <AlertTriangle size={10} />
                        {locale === 'ar' ? 'متأخر' : 'Overdue'}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Progress bar */}
              <div style={{ minWidth: 100 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{locale === 'ar' ? 'التقدّم' : 'Progress'}</span>
                  <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: pct === 100 ? '#16a34a' : 'var(--ink-2)' }}>{pct}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4,
                    background: pct === 100 ? '#16a34a' : pct >= 50 ? 'var(--accent)' : '#d97706',
                    width: `${pct}%`, transition: 'width 0.3s',
                  }} />
                </div>
              </div>

              {/* View link */}
              <Link
                href={`/admin/exit-clearance/${item.personId}`}
                style={{
                  height: 30, padding: '0 14px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--ink-2)', fontSize: 'var(--text-caption)', fontWeight: 600,
                  textDecoration: 'none', display: 'flex', alignItems: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {locale === 'ar' ? 'عرض ←' : 'View →'}
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
