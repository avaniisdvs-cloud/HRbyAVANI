import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { persons, legalEntities } from '@/drizzle/schema'
import { and, eq, lte, gte, gt, isNotNull } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { ProbationActions } from './ProbationActions'
import { ClipboardCheck } from 'lucide-react'
import { getLocale, t } from '@/lib/locale-server'
import type { Locale } from '@/lib/i18n'

export const metadata = { title: 'Probation Management · AVANIIS HR' }

export type ProbationEmployee = {
  id:              string
  personNumber:    string
  fullNameEn:      string
  fullNameAr:      string
  probationEndDate: string
  probationStatus: string
  legalEntityId:   string
  legalEntityName: string | null
  daysRemaining:   number
  groupKey:        'OVERDUE' | 'DUE_SOON' | 'UPCOMING'
}

const ALLOWED_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'] as const

export default async function ProbationManagementPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    redirect('/dashboard')
  }

  const locale = await getLocale()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  // Fetch all ACTIVE probation employees
  const rows = await db
    .select({
      id:              persons.id,
      personNumber:    persons.personNumber,
      fullNameEn:      persons.fullNameEn,
      fullNameAr:      persons.fullNameAr,
      probationEndDate: persons.probationEndDate,
      probationStatus: persons.probationStatus,
      legalEntityId:   persons.legalEntityId,
      legalEntityName: legalEntities.nameEn,
    })
    .from(persons)
    .leftJoin(legalEntities, eq(persons.legalEntityId, legalEntities.id))
    .where(
      and(
        eq(persons.tenantId, TENANT_ID),
        eq(persons.probationStatus, 'ACTIVE'),
        eq(persons.assignmentStatus, 'ACTIVE'),
        isNotNull(persons.probationEndDate),
      ),
    )
    .orderBy(persons.probationEndDate)

  const employees: ProbationEmployee[] = rows.map(r => {
    const end  = new Date(r.probationEndDate!)
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    let groupKey: ProbationEmployee['groupKey']
    if (diff < 0)       groupKey = 'OVERDUE'
    else if (diff <= 14) groupKey = 'DUE_SOON'
    else                 groupKey = 'UPCOMING'

    return {
      id:              r.id,
      personNumber:    r.personNumber,
      fullNameEn:      r.fullNameEn ?? '',
      fullNameAr:      r.fullNameAr,
      probationEndDate: r.probationEndDate!,
      probationStatus: r.probationStatus ?? 'ACTIVE',
      legalEntityId:   r.legalEntityId,
      legalEntityName: r.legalEntityName ?? null,
      daysRemaining:   diff,
      groupKey,
    }
  })

  const overdue  = employees.filter(e => e.groupKey === 'OVERDUE')
  const dueSoon  = employees.filter(e => e.groupKey === 'DUE_SOON')
  const upcoming = employees.filter(e => e.groupKey === 'UPCOMING')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
        <ClipboardCheck size={22} color="var(--accent)" strokeWidth={1.5} />
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
            {t(locale, 'Probation Management', 'إدارة فترة التجربة')}
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
            {t(locale, 'Review and action employee probation periods — confirm, extend, or fail', 'راجع فترات تجربة الموظفين واتخذ الإجراء — تأكيد أو تمديد أو إنهاء')}
          </p>
        </div>

        {/* Summary chips */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {overdue.length > 0 && (
            <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>
              {overdue.length} {t(locale, 'Overdue', 'متأخرة')}
            </span>
          )}
          {dueSoon.length > 0 && (
            <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: 'rgba(217,119,6,0.1)', color: '#d97706' }}>
              {dueSoon.length} {t(locale, 'Due Soon', 'مستحقة قريباً')}
            </span>
          )}
          <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: 'var(--surface)', color: 'var(--ink-2)' }}>
            {employees.length} {t(locale, 'Total Active', 'إجمالي النشطة')}
          </span>
        </div>
      </div>

      {employees.length === 0 ? (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '48px 24px', textAlign: 'center',
        }}>
          <ClipboardCheck size={36} color="var(--ink-4)" strokeWidth={1.5} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: 0 }}>
            {t(locale, 'No employees with active probation periods found.', 'لا يوجد موظفون في فترة تجربة نشطة.')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {overdue.length > 0 && (
            <ProbationSection
              title="Overdue"
              titleAr="متأخرة"
              color="#dc2626"
              bg="rgba(220,38,38,0.06)"
              borderColor="rgba(220,38,38,0.2)"
              employees={overdue}
              locale={locale}
            />
          )}
          {dueSoon.length > 0 && (
            <ProbationSection
              title="Due in Next 14 Days"
              titleAr="مستحقة خلال 14 يومًا"
              color="#d97706"
              bg="rgba(217,119,6,0.06)"
              borderColor="rgba(217,119,6,0.2)"
              employees={dueSoon}
              locale={locale}
            />
          )}
          {upcoming.length > 0 && (
            <ProbationSection
              title="Upcoming"
              titleAr="قادمة"
              color="var(--ink-2)"
              bg="var(--surface)"
              borderColor="var(--border)"
              employees={upcoming}
              locale={locale}
            />
          )}
        </div>
      )}
    </div>
  )
}

function ProbationSection({
  title, titleAr, color, bg, borderColor, employees, locale,
}: {
  title: string; titleAr: string; color: string; bg: string; borderColor: string
  employees: ProbationEmployee[]; locale: Locale
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 'var(--text-body)', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {locale === 'ar' ? titleAr : title}
        </span>
        <span style={{
          marginLeft: 4, fontSize: 'var(--text-caption)', fontWeight: 700,
          background: bg, color, border: `1px solid ${borderColor}`,
          borderRadius: 20, padding: '2px 8px',
        }}>
          {employees.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, border: `1px solid ${borderColor}`, borderRadius: 10, overflow: 'hidden' }}>
        {employees.map((emp, idx) => (
          <div
            data-responsive-grid="true" key={emp.id}
            style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto',
              gap: 16, alignItems: 'center',
              padding: '14px 16px',
              background: idx % 2 === 0 ? 'var(--card)' : 'var(--surface)',
              borderBottom: idx < employees.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            {/* Person info */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'var(--accent-100)', color: 'var(--brand-active)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--text-caption)', fontWeight: 700, flexShrink: 0,
                }}>
                  {(emp.fullNameEn || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>
                    {emp.fullNameEn || '—'}
                  </div>
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                    {emp.personNumber} · {emp.legalEntityName ?? (locale === 'ar' ? 'كيان غير معروف' : 'Unknown Entity')}
                  </div>
                </div>
              </div>
            </div>

            {/* Probation end date + days */}
            <div style={{ textAlign: 'right', minWidth: 140 }}>
              <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>
                {new Date(emp.probationEndDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div style={{ fontSize: 'var(--text-caption)', color }}>
                {emp.daysRemaining < 0
                  ? (locale === 'ar' ? `متأخرة ${Math.abs(emp.daysRemaining)} يوماً` : `${Math.abs(emp.daysRemaining)} days overdue`)
                  : emp.daysRemaining === 0
                    ? (locale === 'ar' ? 'مستحقة اليوم' : 'Due today')
                    : (locale === 'ar' ? `${emp.daysRemaining} يوماً متبقياً` : `${emp.daysRemaining} days remaining`)}
              </div>
            </div>

            {/* Action buttons */}
            <ProbationActions employee={emp} />
          </div>
        ))}
      </div>
    </div>
  )
}
