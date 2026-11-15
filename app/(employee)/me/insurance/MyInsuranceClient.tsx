'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState } from 'react'
import type { MedicalInsuranceEnrolment, PersonDependent } from '@/drizzle/schema'
import { HeartPulse, ShieldCheck, ShieldOff, Clock, Users, CreditCard, type LucideIcon } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { Locale } from '@/lib/i18n'

const HISTORY_PAGE_SIZE = 10

interface PersonSnapshot {
  fullNameEn:            string
  insuranceStatus:       string
  insuranceCardNumber?:  string | null
  insuranceMemberId?:    string | null
  insuranceProviderName?: string | null
  insuranceNetwork?:     string | null
  insuranceCategory?:    string | null
  insuranceEffectiveDate?: string | null
  insuranceExpiryDate?:  string | null
  annualPremiumAed?:     string | null
  employeePremiumAed?:   string | null
  dependentCountInsured?: number | null
}

interface Props {
  person:      PersonSnapshot
  enrolments:  MedicalInsuranceEnrolment[]
  dependents:  PersonDependent[]
}

const STATUS_CONFIG: Record<string, { label: string; labelAr: string; color: string; Icon: LucideIcon }> = {
  ENROLLED:           { label: 'Enrolled',            labelAr: 'مسجّل',              color: '#16A34A', Icon: ShieldCheck },
  PENDING_ENROLMENT:  { label: 'Pending Enrolment',   labelAr: 'قيد التسجيل',        color: '#D97706', Icon: Clock       },
  RENEWAL_DUE:        { label: 'Renewal Due',          labelAr: 'التجديد مستحق',      color: '#EA580C', Icon: Clock       },
  CANCELLED:          { label: 'Cancelled',            labelAr: 'ملغى',               color: '#DC2626', Icon: ShieldOff   },
  EXPIRED:            { label: 'Expired',              labelAr: 'منتهي الصلاحية',     color: '#6B7280', Icon: ShieldOff   },
  NOT_ENROLLED:       { label: 'Not Enrolled',         labelAr: 'غير مسجّل',          color: '#6B7280', Icon: ShieldOff   },
}

const CATEGORY_LABEL: Record<string, string> = {
  ESSENTIAL_BENEFITS: 'Essential Benefits',
  BASIC:              'Basic',
  ENHANCED:           'Enhanced',
  PREMIUM:            'Premium',
  EXECUTIVE:          'Executive',
  CUSTOM:             'Custom',
}

const CATEGORY_LABEL_AR: Record<string, string> = {
  ESSENTIAL_BENEFITS: 'المنافع الأساسية',
  BASIC:              'أساسي',
  ENHANCED:           'مُحسّن',
  PREMIUM:            'متميّز',
  EXECUTIVE:          'تنفيذي',
  CUSTOM:             'مخصّص',
}

function StatusBadge({ status, locale }: { status: string; locale: Locale }) {
  const cfg  = STATUS_CONFIG[status] ?? STATUS_CONFIG.NOT_ENROLLED
  const Icon = cfg.Icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 999, fontSize: 'var(--text-caption)', fontWeight: 600,
      background: cfg.color + '18', color: cfg.color, border: `1px solid ${cfg.color}40`,
    }}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {locale === 'ar' ? cfg.labelAr : cfg.label}
    </span>
  )
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  )
}

export function MyInsuranceClient({ person, enrolments, dependents }: Props) {
  const locale    = useLocale()
  const status    = person.insuranceStatus ?? 'NOT_ENROLLED'
  const cfg       = STATUS_CONFIG[status] ?? STATUS_CONFIG.NOT_ENROLLED
  const isEnrolled = status === 'ENROLLED' || status === 'RENEWAL_DUE'

  const activeEnrolment = enrolments.find(e => e.enrolmentType === 'EMPLOYEE' && e.enrolmentStatus === 'ACTIVE')
  const depEnrolments   = enrolments.filter(e => e.enrolmentType === 'DEPENDENT' && e.enrolmentStatus === 'ACTIVE')
  const [showAllHistory, setShowAllHistory] = useState(false)
  const visibleEnrolments = showAllHistory ? enrolments : enrolments.slice(0, HISTORY_PAGE_SIZE)

  const card: React.CSSProperties = {
    background: 'var(--card)',
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: "var(--border)",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
    borderLeftWidth: "1px",
    borderLeftStyle: "solid",
    borderLeftColor: "var(--border)",
    borderRadius: 12,
    padding: '20px 24px',
  }

  return (
    <div style={{ padding: 'calc(24px * var(--density))', maxWidth: 800, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 24 }}>
        <HeartPulse style={{ width: 22, height: 22, color: 'var(--brand-active)' }} strokeWidth={1.75} />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
            My Insurance
          </h1>
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
          marginTop: 2 }}>
            التأمين الطبي الخاص بي
          </p>
        </div>
      </div>

      {/* Status card */}
      <div style={{ ...card, marginBottom: 16,
      borderTopColor: cfg.color + '40',
      borderRightColor: cfg.color + '40',
      borderBottomColor: cfg.color + '40',
      borderLeftColor: cfg.color + '40', background: cfg.color + '08' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
            marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{locale === 'ar' ? 'حالة التغطية' : 'Coverage Status'}</p>
            <StatusBadge status={status} locale={locale} />
          </div>
          {isEnrolled && person.insuranceExpiryDate && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginBottom: 2 }}>{locale === 'ar' ? 'تنتهي' : 'Expires'}</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>{person.insuranceExpiryDate}</p>
            </div>
          )}
        </div>

        {!isEnrolled && (
          <p style={{ marginTop: 12, fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
            {locale === 'ar'
              ? 'أنت غير مسجّل حالياً في التأمين الطبي الخاص بالشركة. يرجى التواصل مع إدارة الموارد البشرية إذا كنت تعتقد أن هذا خطأ.'
              : 'You are not currently enrolled in company medical insurance. Please contact HR Admin if you believe this is an error.'}
          </p>
        )}
      </div>

      {/* Insurance card details */}
      {isEnrolled && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 16 }}>
            <CreditCard style={{ width: 16, height: 16, color: 'var(--brand-active)' }} strokeWidth={1.75} />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'بطاقة التأمين' : 'Insurance Card'}</h2>
          </div>
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
            <DetailRow label={locale === 'ar' ? 'رقم البطاقة' : 'Card Number'}      value={person.insuranceCardNumber} />
            <DetailRow label={locale === 'ar' ? 'رقم العضوية' : 'Member ID'}        value={person.insuranceMemberId} />
            <DetailRow label={locale === 'ar' ? 'مزوّد الخدمة' : 'Provider'}         value={person.insuranceProviderName} />
            <DetailRow label={locale === 'ar' ? 'الشبكة' : 'Network'}          value={person.insuranceNetwork} />
            <DetailRow label={locale === 'ar' ? 'فئة الخطة' : 'Plan Category'}    value={person.insuranceCategory ? ((locale === 'ar' ? CATEGORY_LABEL_AR[person.insuranceCategory] : CATEGORY_LABEL[person.insuranceCategory]) ?? person.insuranceCategory) : undefined} />
            <DetailRow label={locale === 'ar' ? 'سارية من' : 'Effective From'}   value={person.insuranceEffectiveDate ?? undefined} />
            <DetailRow label={locale === 'ar' ? 'تاريخ الانتهاء' : 'Expiry Date'}      value={person.insuranceExpiryDate ?? undefined} />
            <DetailRow label={locale === 'ar' ? 'قسطك (درهم/سنة)' : 'Your Premium (AED/yr)'} value={person.employeePremiumAed ? `AED ${parseFloat(person.employeePremiumAed).toLocaleString()}` : undefined} />
          </div>
        </div>
      )}

      {/* Dependents */}
      {dependents.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 16 }}>
            <Users style={{ width: 16, height: 16, color: 'var(--brand-active)' }} strokeWidth={1.75} />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>
              {locale === 'ar'
                ? `المعالون (${person.dependentCountInsured ?? 0} مؤمَّن عليهم)`
                : `Dependents (${person.dependentCountInsured ?? 0} insured)`}
            </h2>
          </div>
          <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {(locale === 'ar' ? ['الاسم', 'صلة القرابة', 'التأمين'] : ['Name', 'Relationship', 'Insurance']).map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dependents.map(dep => {
                const depEnrol = depEnrolments.find(e => e.dependentId === dep.id)
                // Use live enrolment record as source of truth; dep.insuranceStatus snapshot can be stale
                const depStatus = depEnrol
                  ? (depEnrol.enrolmentStatus === 'ACTIVE' ? 'ENROLLED' : depEnrol.enrolmentStatus)
                  : 'NOT_ENROLLED'
                return (
                  <tr key={dep.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 10px' }}>
                      <span style={{ fontWeight: 500, color: 'var(--ink-1)' }}>
                        {dep.firstNameEn} {dep.lastNameEn}
                      </span>
                    </td>
                    <td style={{ padding: '10px 10px', color: 'var(--ink-2)', textTransform: 'capitalize' }}>
                      {dep.relationship?.toLowerCase().replace(/_/g, ' ') ?? '—'}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <StatusBadge status={depStatus} locale={locale} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></TableScrollRegion>
        </div>
      )}

      {/* Active plan history */}
      {enrolments.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'سجل التسجيل' : 'Enrolment History'}</h2>
            {enrolments.length > HISTORY_PAGE_SIZE && (
              <button
                onClick={() => setShowAllHistory(v => !v)}
                style={{ fontSize: 'var(--text-caption)', color: 'var(--brand-active)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {showAllHistory ? (locale === 'ar' ? 'عرض أقل' : 'Show less') : (locale === 'ar' ? `عرض الكل (${enrolments.length})` : `Show all ${enrolments.length}`)}
              </button>
            )}
          </div>
          <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {(locale === 'ar' ? ['النوع', 'الفترة', 'قسطك (درهم)', 'الحالة'] : ['Type', 'Period', 'Your Premium (AED)', 'Status']).map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEnrolments.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', color: 'var(--ink-2)' }}>
                    {e.enrolmentType === 'EMPLOYEE' ? (locale === 'ar' ? 'الموظف' : 'Self') : (locale === 'ar' ? 'معال' : 'Dependent')}
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
                    {e.effectiveDate} → {e.expiryDate}
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--ink-1)' }}>
                    {e.employeePremiumAed ? `AED ${parseFloat(e.employeePremiumAed).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <StatusBadge status={e.enrolmentStatus ?? 'NOT_ENROLLED'} locale={locale} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table></TableScrollRegion>
          {!showAllHistory && enrolments.length > HISTORY_PAGE_SIZE && (
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', textAlign: 'center', padding: '10px 0 2px' }}>
              {locale === 'ar'
                ? `عرض ${HISTORY_PAGE_SIZE} من ${enrolments.length} سجلاً`
                : `Showing ${HISTORY_PAGE_SIZE} of ${enrolments.length} records`}
            </p>
          )}
        </div>
      )}

      <p style={{ marginTop: 20, fontSize: 'var(--text-caption)', color: 'var(--ink-3)', textAlign: 'center' }}>
        For changes to your insurance coverage, please contact HR Admin.
        للاستفسارات والتعديلات، يرجى التواصل مع الموارد البشرية.
      </p>
    </div>
  )
}
