/**
 * Insurance Reports — HR Admin / HR Director / Super Admin only.
 *
 * Five report sections:
 *   1. Coverage summary — enrolled vs uninsured headcount
 *   2. Dependent coverage — insured dependent breakdown
 *   3. Expiring policies — enrolments expiring in 30 / 60 / 90 days
 *   4. Contractor exceptions — employees with exception flag
 *   5. Premium cost summary — total employer + employee annual premiums
 */
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect }  from 'next/navigation'
import Link          from 'next/link'
import { and, count, eq, gte, lte, sql } from 'drizzle-orm'
import { HeartPulse, ShieldCheck, ShieldOff, Clock, Users, DollarSign } from 'lucide-react'
import { auth }       from '@/lib/auth'
import { db }         from '@/lib/db'
import {
  medicalInsuranceEnrolments,
  persons,
  workerAssignments,
} from '@/drizzle/schema'
import { TENANT_ID }  from '@/lib/constants'
import { getLocale }  from '@/lib/locale-server'
import { isoDateAddDays, todayUae } from '@/lib/date-utils'

export const metadata = { title: 'Insurance Reports · AVANIIS HR' }

const card: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '20px 24px',
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-1)', margin: '0 0 14px' }}>
      {children}
    </h2>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: '6px 12px', textAlign: 'left', fontSize: 'var(--text-caption)', fontWeight: 600,
      color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em',
      borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </th>
  )
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td style={{
      padding: '9px 12px', fontSize: 'var(--text-body)', color: 'var(--ink-1)',
      borderBottom: '1px solid var(--border)',
      fontFamily: mono ? 'var(--font-mono)' : undefined,
    }}>
      {children}
    </td>
  )
}

export default async function InsuranceReportsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/reports')

  const locale = await getLocale()
  const legalEntityId = session.user.legalEntityId
  const today   = todayUae()
  const in30    = isoDateAddDays(today, 30)
  const in60    = isoDateAddDays(today, 60)
  const in90    = isoDateAddDays(today, 90)

  // ── 1. Coverage summary ─────────────────────────────────────────────────
  const [totalPersons] = await db
    .select({ count: count() })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.legalEntityId, legalEntityId),
      eq(persons.isActive, true),
    ))

  const statusGroups = await db
    .select({
      status: persons.insuranceStatus,
      count:  count(),
    })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.legalEntityId, legalEntityId),
      eq(persons.isActive, true),
    ))
    .groupBy(persons.insuranceStatus)

  const enrolled        = statusGroups.find(g => g.status === 'ENROLLED')?.count ?? 0
  const pendingEnrol    = statusGroups.find(g => g.status === 'PENDING_ENROLMENT')?.count ?? 0
  // Sum across all non-enrolled statuses — groupBy may produce multiple rows for NOT_ENROLLED, CANCELLED, EXPIRED
  const notEnrolled     = statusGroups
    .filter(g => !g.status || g.status === 'NOT_ENROLLED' || g.status === 'CANCELLED' || g.status === 'EXPIRED')
    .reduce((sum, g) => sum + Number(g.count), 0)
  const coveragePct     = totalPersons.count > 0
    ? Math.round((enrolled / Number(totalPersons.count)) * 100)
    : 0

  // ── 2. Dependent coverage ───────────────────────────────────────────────
  const [totalDependents] = await db
    .select({ count: count() })
    .from(medicalInsuranceEnrolments)
    .where(and(
      eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
      eq(medicalInsuranceEnrolments.legalEntityId, legalEntityId),
      eq(medicalInsuranceEnrolments.enrolmentType, 'DEPENDENT'),
      eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
    ))

  const [totalInsuredDeps] = await db
    .select({ total: sql<string>`COALESCE(SUM(${persons.dependentCountInsured}), 0)` })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.legalEntityId, legalEntityId),
      eq(persons.isActive, true),
    ))

  // ── 3. Expiring policies ────────────────────────────────────────────────
  const expiringIn30 = await db
    .select({
      personId:     medicalInsuranceEnrolments.personId,
      enrolmentId:  medicalInsuranceEnrolments.id,
      enrolmentType: medicalInsuranceEnrolments.enrolmentType,
      expiryDate:   medicalInsuranceEnrolments.expiryDate,
      memberId:     medicalInsuranceEnrolments.insuranceMemberId,
      personName:   persons.fullNameEn,
      personNumber: persons.personNumber,
    })
    .from(medicalInsuranceEnrolments)
    .leftJoin(persons, eq(medicalInsuranceEnrolments.personId, persons.id))
    .where(and(
      eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
      eq(medicalInsuranceEnrolments.legalEntityId, legalEntityId),
      eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
      gte(medicalInsuranceEnrolments.expiryDate, today),
      lte(medicalInsuranceEnrolments.expiryDate, in90),
    ))
    .orderBy(medicalInsuranceEnrolments.expiryDate)
    .limit(100)

  // ── 4. Contractor exceptions ────────────────────────────────────────────
  const contractorExceptions = await db
    .select({
      personId:     workerAssignments.personId,
      personName:   persons.fullNameEn,
      personNumber: persons.personNumber,
      empType:      workerAssignments.employmentType,
      insStatus:    persons.insuranceStatus,
      effectiveDate: workerAssignments.effectiveStartDate,
    })
    .from(workerAssignments)
    .leftJoin(persons, eq(workerAssignments.personId, persons.id))
    .where(and(
      eq(workerAssignments.tenantId, TENANT_ID),
      eq(workerAssignments.legalEntityId, legalEntityId),
      eq(workerAssignments.isCurrent, true),
      eq(workerAssignments.insuranceExceptionGranted, true),
    ))
    .orderBy(persons.fullNameEn)
    .limit(200)

  // ── 5. Premium cost summary ─────────────────────────────────────────────
  const [premiumSummary] = await db
    .select({
      totalAnnual:   sql<string>`COALESCE(SUM(CAST(${medicalInsuranceEnrolments.annualPremiumAed} AS NUMERIC)), 0)`,
      totalEmployer: sql<string>`COALESCE(SUM(CAST(${medicalInsuranceEnrolments.employerPremiumAed} AS NUMERIC)), 0)`,
      totalEmployee: sql<string>`COALESCE(SUM(CAST(${medicalInsuranceEnrolments.employeePremiumAed} AS NUMERIC)), 0)`,
      enrolCount:    count(),
    })
    .from(medicalInsuranceEnrolments)
    .where(and(
      eq(medicalInsuranceEnrolments.tenantId, TENANT_ID),
      eq(medicalInsuranceEnrolments.legalEntityId, legalEntityId),
      eq(medicalInsuranceEnrolments.enrolmentStatus, 'ACTIVE'),
    ))

  const fmtAed = (v: string | number) =>
    `AED ${parseFloat(String(v)).toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const expiryBucket = (date: string | null) => {
    if (!date) return '90+'
    if (date <= in30) return locale === 'ar' ? '0–30 يوماً' : '0–30 days'
    if (date <= in60) return locale === 'ar' ? '31–60 يوماً' : '31–60 days'
    return locale === 'ar' ? '61–90 يوماً' : '61–90 days'
  }

  return (
    <div style={{ padding: 'calc(24px * var(--density))', maxWidth: 1000 }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
        <Link href="/reports" style={{ color: 'var(--brand-active)', textDecoration: 'none' }}>{locale === 'ar' ? 'التقارير' : 'Reports'}</Link>
        <span>/</span>
        <span style={{ color: 'var(--ink-1)' }}>{locale === 'ar' ? 'التأمين' : 'Insurance'}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <HeartPulse style={{ width: 22, height: 22, color: 'var(--brand-active)' }} strokeWidth={1.75} />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
            {locale === 'ar' ? 'تقارير التأمين' : 'Insurance Reports'}
          </h1>
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>{locale === 'ar' ? 'Insurance Reports' : 'تقارير التأمين الطبي'}</p>
        </div>
      </div>

      {/* ── Section 1: Coverage summary KPIs ─────────────────────────────── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <SectionTitle>
          <ShieldCheck style={{ display: 'inline', width: 15, height: 15, marginRight: 6 }} strokeWidth={1.75} />
          {locale === 'ar' ? 'ملخص التغطية' : 'Coverage Summary'}
        </SectionTitle>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
          {[
            { label: locale === 'ar' ? 'إجمالي الموظفين النشطين' : 'Total Active Employees', value: String(totalPersons.count), color: 'var(--ink-1)' },
            { label: locale === 'ar' ? 'مسجَّل' : 'Enrolled',               value: String(enrolled),            color: '#16A34A'      },
            { label: locale === 'ar' ? 'بانتظار التسجيل' : 'Pending Enrolment',       value: String(pendingEnrol),        color: '#D97706'      },
            { label: locale === 'ar' ? 'غير مسجَّل' : 'Not Enrolled',            value: String(notEnrolled),         color: '#DC2626'      },
            { label: locale === 'ar' ? 'نسبة التغطية' : 'Coverage Rate',           value: `${coveragePct}%`,           color: coveragePct >= 80 ? '#16A34A' : '#DC2626' },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--surface)', borderRadius: 8, padding: '14px 16px' }}>
              <p style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.label}</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: k.color, lineHeight: 1.2, marginTop: 4 }}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 2: Dependent coverage ────────────────────────────────── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <SectionTitle>
          <Users style={{ display: 'inline', width: 15, height: 15, marginRight: 6 }} strokeWidth={1.75} />
          {locale === 'ar' ? 'تغطية المُعالين' : 'Dependent Coverage'}
        </SectionTitle>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 400 }}>
          {[
            { label: locale === 'ar' ? 'تسجيلات المُعالين النشطة' : 'Active Dependent Enrolments', value: String(totalDependents.count) },
            { label: locale === 'ar' ? 'المُعالون المؤمَّن عليهم المسجَّلون' : 'Insured Dependents on Record', value: String(Math.round(parseFloat(totalInsuredDeps.total))) },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--surface)', borderRadius: 8, padding: '14px 16px' }}>
              <p style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.label}</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink-1)', lineHeight: 1.2, marginTop: 4 }}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 3: Expiring policies ─────────────────────────────────── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <SectionTitle>
          <Clock style={{ display: 'inline', width: 15, height: 15, marginRight: 6 }} strokeWidth={1.75} />
          {locale === 'ar' ? 'وثائق تنتهي خلال 90 يوماً' : 'Policies Expiring in 90 Days'} ({expiringIn30.length})
        </SectionTitle>
        {expiringIn30.length === 0 ? (
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>{locale === 'ar' ? 'لا توجد تسجيلات تنتهي خلال الـ 90 يوماً القادمة.' : 'No enrolments expiring within the next 90 days.'}</p>
        ) : (
          <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th>{locale === 'ar' ? 'الموظف' : 'Employee'}</Th>
                <Th>{locale === 'ar' ? 'النوع' : 'Type'}</Th>
                <Th>{locale === 'ar' ? 'معرّف العضو' : 'Member ID'}</Th>
                <Th>{locale === 'ar' ? 'تاريخ الانتهاء' : 'Expiry Date'}</Th>
                <Th>{locale === 'ar' ? 'الأولوية' : 'Urgency'}</Th>
              </tr>
            </thead>
            <tbody>
              {expiringIn30.map(row => (
                <tr key={row.enrolmentId}>
                  <Td>
                    <Link href={`/persons/${row.personId}/insurance`} style={{ color: 'var(--brand-active)', textDecoration: 'none', fontWeight: 500 }}>
                      {row.personName ?? row.personNumber ?? '—'}
                    </Link>
                  </Td>
                  <Td>{row.enrolmentType === 'EMPLOYEE' ? (locale === 'ar' ? 'الموظف نفسه' : 'Self') : (locale === 'ar' ? 'مُعال' : 'Dependent')}</Td>
                  <Td mono>{row.memberId ?? '—'}</Td>
                  <Td mono>{row.expiryDate ?? '—'}</Td>
                  <Td>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 'var(--text-caption)', fontWeight: 600,
                      background: row.expiryDate && row.expiryDate <= in30 ? '#FEF2F2' : row.expiryDate && row.expiryDate <= in60 ? '#FFFBEB' : '#F0FDF4',
                      color:      row.expiryDate && row.expiryDate <= in30 ? '#DC2626' : row.expiryDate && row.expiryDate <= in60 ? '#D97706' : '#16A34A',
                    }}>
                      {expiryBucket(row.expiryDate ?? null)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table></TableScrollRegion>
        )}
      </div>

      {/* ── Section 4: Contractor exceptions ─────────────────────────────── */}
      <div style={{ ...card, marginBottom: 20 }}>
        <SectionTitle>
          <ShieldOff style={{ display: 'inline', width: 15, height: 15, marginRight: 6 }} strokeWidth={1.75} />
          {locale === 'ar' ? 'استثناءات تأمين المقاولين' : 'Contractor Insurance Exceptions'} ({contractorExceptions.length})
        </SectionTitle>
        {contractorExceptions.length === 0 ? (
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>{locale === 'ar' ? 'لا توجد استثناءات تأمين ممنوحة للمقاولين.' : 'No contractor insurance exceptions granted.'}</p>
        ) : (
          <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th>{locale === 'ar' ? 'الموظف' : 'Employee'}</Th>
                <Th>{locale === 'ar' ? 'نوع التوظيف' : 'Employment Type'}</Th>
                <Th>{locale === 'ar' ? 'حالة التأمين' : 'Insurance Status'}</Th>
                <Th>{locale === 'ar' ? 'تاريخ بدء التعيين' : 'Assignment Since'}</Th>
              </tr>
            </thead>
            <tbody>
              {contractorExceptions.map(row => (
                <tr key={row.personId}>
                  <Td>
                    <Link href={`/persons/${row.personId}/insurance`} style={{ color: 'var(--brand-active)', textDecoration: 'none', fontWeight: 500 }}>
                      {row.personName ?? row.personNumber ?? '—'}
                    </Link>
                  </Td>
                  <Td>{row.empType?.replace(/_/g, ' ') ?? '—'}</Td>
                  <Td>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 'var(--text-caption)', fontWeight: 600,
                      background: row.insStatus === 'ENROLLED' ? '#F0FDF4' : '#FEF2F2',
                      color:      row.insStatus === 'ENROLLED' ? '#16A34A' : '#DC2626',
                    }}>
                      {row.insStatus ?? 'NOT_ENROLLED'}
                    </span>
                  </Td>
                  <Td mono>{row.effectiveDate ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table></TableScrollRegion>
        )}
      </div>

      {/* ── Section 5: Premium cost summary ──────────────────────────────── */}
      <div style={card}>
        <SectionTitle>
          <DollarSign style={{ display: 'inline', width: 15, height: 15, marginRight: 6 }} strokeWidth={1.75} />
          {locale === 'ar' ? 'ملخص تكلفة الأقساط السنوية (التسجيلات النشطة)' : 'Annual Premium Cost Summary (Active Enrolments)'}
        </SectionTitle>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {[
            { label: locale === 'ar' ? 'التسجيلات النشطة' : 'Active Enrolments',   value: String(premiumSummary.enrolCount) },
            { label: locale === 'ar' ? 'إجمالي القسط السنوي' : 'Total Annual Premium', value: fmtAed(premiumSummary.totalAnnual) },
            { label: locale === 'ar' ? 'مساهمة صاحب العمل' : 'Employer Contribution', value: fmtAed(premiumSummary.totalEmployer) },
            { label: locale === 'ar' ? 'مساهمة الموظف' : 'Employee Contribution', value: fmtAed(premiumSummary.totalEmployee) },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--surface)', borderRadius: 8, padding: '14px 16px' }}>
              <p style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.label}</p>
              <p style={{ fontSize: k.value.startsWith('AED') ? 18 : 28, fontWeight: 700, color: 'var(--ink-1)', lineHeight: 1.2, marginTop: 4 }}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
