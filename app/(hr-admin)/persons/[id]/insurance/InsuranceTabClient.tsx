'use client'

import { PageTitle, SectionTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toUserMessage } from '@/lib/app-error'
import { type Locale } from '@/lib/i18n'
import {
  enrolEmployee,
  enrolDependent,
  cancelEnrolment,
  updateEnrolmentCard,
  extendEnrolmentExpiry,
} from '@/modules/insurance/actions'
import type {
  MedicalInsurancePlan,
  MedicalInsuranceEnrolment,
  MedicalInsurancePolicySetting,
} from '@/drizzle/schema'
import { HeartPulse, Plus, X, AlertTriangle, CheckCircle } from 'lucide-react'

interface PersonSnap {
  id:              string
  fullNameEn:      string
  legalEntityId:   string
  employmentType:  string
  insuranceStatus: string
  insuranceCardNumber?:   string | null
  insuranceMemberId?:     string | null
  insuranceProviderName?: string | null
  insuranceNetwork?:      string | null
  insuranceCategory?:     string | null
  insuranceEffectiveDate?: string | null
  insuranceExpiryDate?:    string | null
  annualPremiumAed?:       string | null
  employerPremiumAed?:     string | null
  employeePremiumAed?:     string | null
  dependentCountInsured?:  number
}

interface Dependent {
  id:          string
  firstNameEn: string | null
  lastNameEn:  string | null
  relationship:   string | null
  dateOfBirth:    string | null
  visaDocumentId: string | null
  isOnCompanyInsurance: boolean
  insuranceStatus: string | null
  insuranceCardNumber?: string | null
}

interface Props {
  person:     PersonSnap
  enrolments: MedicalInsuranceEnrolment[]
  plans:      MedicalInsurancePlan[]
  policy:     MedicalInsurancePolicySetting | null
  dependents: Dependent[]
  locale?:    Locale
}

const STATUS_COLOR: Record<string, string> = {
  ENROLLED:          '#16A34A',
  ACTIVE:            '#16A34A',
  PENDING_ENROLMENT: '#D97706',
  PENDING:           '#D97706',
  RENEWAL_DUE:       '#D97706',
  EXPIRED:           '#EF4444',
  CANCELLED:         '#6B7280',
  SUSPENDED:         '#EF4444',
  NOT_ENROLLED:      '#9CA3AF',
}

export function InsuranceTabClient({ person, enrolments, plans, policy, dependents, locale = 'en' }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')

  // Enrol employee form state
  const [showEnrol, setShowEnrol] = useState(false)
  const [enrolPlanId, setEnrolPlanId] = useState('')
  const [enrolDate, setEnrolDate]     = useState(new Date().toISOString().slice(0, 10))

  // Cancel form
  const [cancelTarget, setCancelTarget] = useState<MedicalInsuranceEnrolment | null>(null)
  const [cancelDate, setCancelDate]     = useState(new Date().toISOString().slice(0, 10))
  const [cancelReason, setCancelReason] = useState('')
  const [extDate, setExtDate]           = useState('')
  const [extReason, setExtReason]       = useState('')

  // Update card form
  const [cardTarget, setCardTarget]     = useState<MedicalInsuranceEnrolment | null>(null)
  const [cardNumber, setCardNumber]     = useState('')
  const [memberId, setMemberId]         = useState('')

  // Enrol dependent form
  const [depTarget, setDepTarget]       = useState<Dependent | null>(null)
  const [depPlanId, setDepPlanId]       = useState('')
  const [depDate, setDepDate]           = useState(new Date().toISOString().slice(0, 10))
  const [depIsStudent, setDepIsStudent] = useState(false)

  const employeeEnrolment = enrolments.find(e => e.enrolmentType === 'EMPLOYEE' && e.enrolmentStatus === 'ACTIVE')
  // M16: only show plans belonging to this employee's legal entity
  const activePlans = plans.filter(p => p.isActive && p.legalEntityId === person.legalEntityId)

  function clearMessages() { setError(''); setSuccess('') }

  function handleEnrolEmployee(e: React.FormEvent) {
    e.preventDefault()
    clearMessages()
    startTransition(async () => {
      try {
        await enrolEmployee({
          personId:      person.id,
          legalEntityId: person.legalEntityId,
          planId:        enrolPlanId || undefined,
          effectiveDate: enrolDate,
        })
        setSuccess(locale === 'ar' ? 'تم تسجيل الموظف بنجاح.' : 'Employee enrolled successfully.')
        setShowEnrol(false)
        router.refresh()
      } catch (err) { setError(toUserMessage(err)) }
    })
  }

  function handleCancelEnrolment(e: React.FormEvent) {
    e.preventDefault()
    if (!cancelTarget) return
    clearMessages()
    startTransition(async () => {
      try {
        await cancelEnrolment({
          enrolmentId:        cancelTarget.id,
          cancellationDate:   cancelDate,
          cancellationReason: cancelReason,
          extensionDate:      extDate || undefined,
          extensionReason:    extReason || undefined,
        })
        setSuccess(locale === 'ar' ? 'تم إلغاء التسجيل.' : 'Enrolment cancelled.')
        setCancelTarget(null)
        router.refresh()
      } catch (err) { setError(toUserMessage(err)) }
    })
  }

  function handleUpdateCard(e: React.FormEvent) {
    e.preventDefault()
    if (!cardTarget) return
    clearMessages()
    startTransition(async () => {
      try {
        await updateEnrolmentCard({
          enrolmentId:         cardTarget.id,
          insuranceCardNumber: cardNumber || undefined,
          insuranceMemberId:   memberId || undefined,
        })
        setSuccess(locale === 'ar' ? 'تم تحديث بيانات البطاقة.' : 'Card details updated.')
        setCardTarget(null)
        router.refresh()
      } catch (err) { setError(toUserMessage(err)) }
    })
  }

  function handleEnrolDependent(e: React.FormEvent) {
    e.preventDefault()
    if (!depTarget) return
    clearMessages()
    startTransition(async () => {
      try {
        await enrolDependent({
          personId:      person.id,
          dependentId:   depTarget.id,
          legalEntityId: person.legalEntityId,
          planId:        depPlanId || undefined,
          effectiveDate: depDate,
          isStudent:     depIsStudent,
        })
        setSuccess(locale === 'ar'
          ? `تم تسجيل ${depTarget.firstNameEn ?? 'المُعال'} بنجاح.`
          : `${depTarget.firstNameEn ?? 'Dependent'} enrolled successfully.`)
        setDepTarget(null)
        router.refresh()
      } catch (err) { setError(toUserMessage(err)) }
    })
  }

  const statusColor = STATUS_COLOR[person.insuranceStatus] ?? '#9CA3AF'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href={`/persons/${person.id}`} style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', textDecoration: 'none' }}>
              ← {person.fullNameEn}
            </Link>
          </div>
          <PageTitle className="font-serif text-2xl text-ink-1" style={{ marginTop: 4 }}>
            {locale === 'ar' ? 'التأمين الطبي' : 'Medical Insurance'}
          </PageTitle>
        </div>
        {!employeeEnrolment && (
          <Button onClick={() => setShowEnrol(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} />
            {locale === 'ar' ? 'تسجيل الموظف' : 'Enrol Employee'}
          </Button>
        )}
      </div>

      {/* Current enrolment summary card */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <HeartPulse size={20} style={{ color: statusColor }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
                  {person.insuranceProviderName ?? (locale === 'ar' ? 'غير مُسجَّل' : 'Not enrolled')}
                </span>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                  fontSize: 'var(--text-caption)', fontWeight: 700,
                  background: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
                  color: statusColor,
                }}>
                  {person.insuranceStatus.replace(/_/g, ' ')}
                </span>
              </div>
              {person.insuranceNetwork && (
                <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '2px 0 0' }}>
                  {person.insuranceNetwork} · {person.insuranceCategory}
                </p>
              )}
            </div>
          </div>
          {employeeEnrolment && (
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="outline" size="sm" onClick={() => {
                setCardTarget(employeeEnrolment)
                setCardNumber(employeeEnrolment.insuranceCardNumber ?? '')
                setMemberId(employeeEnrolment.insuranceMemberId ?? '')
              }}>
                {locale === 'ar' ? 'تحديث البطاقة' : 'Update Card'}
              </Button>
              <Button variant="outline" size="sm" style={{ color: '#EF4444' }} onClick={() => {
                setCancelTarget(employeeEnrolment)
                setCancelDate(new Date().toISOString().slice(0, 10))
                setCancelReason('')
                setExtDate('')
                setExtReason('')
              }}>
                {locale === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          )}
        </div>

        {/* Snapshot details */}
        {person.insuranceStatus !== 'NOT_ENROLLED' && (
          <div data-responsive-grid="true" style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {[
              [locale === 'ar' ? 'رقم البطاقة' : 'Card Number',    person.insuranceCardNumber ?? '—'],
              [locale === 'ar' ? 'معرّف العضو' : 'Member ID',      person.insuranceMemberId ?? '—'],
              [locale === 'ar' ? 'تاريخ السريان' : 'Effective',      person.insuranceEffectiveDate ?? '—'],
              [locale === 'ar' ? 'تاريخ الانتهاء' : 'Expiry',         person.insuranceExpiryDate ?? '—'],
              [locale === 'ar' ? 'القسط السنوي' : 'Annual Premium', person.annualPremiumAed ? `AED ${parseFloat(person.annualPremiumAed).toLocaleString()}` : '—'],
              [locale === 'ar' ? 'مساهمة صاحب العمل' : 'Employer Pays',  person.employerPremiumAed ? `AED ${parseFloat(person.employerPremiumAed).toLocaleString()}` : '—'],
              [locale === 'ar' ? 'مساهمة الموظف' : 'Employee Pays',  person.employeePremiumAed ? `AED ${parseFloat(person.employeePremiumAed).toLocaleString()}` : '—'],
              [locale === 'ar' ? 'المعالون' : 'Dependents',     String(person.dependentCountInsured ?? 0)],
            ].map(([label, value]) => (
              <div key={label}>
                <p style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>{label}</p>
                <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', margin: '3px 0 0', fontFamily: 'var(--font-mono)' }}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enrolment history */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionTitle style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'سجل التسجيل' : 'Enrolment History'}</SectionTitle>
        </div>
        {enrolments.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 'var(--text-body)' }}>
            {locale === 'ar' ? 'لا توجد سجلات تسجيل.' : 'No enrolment records.'}
          </div>
        ) : (
          <TableScrollRegion><table className="w-full text-sm">
            <thead style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <tr>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'النوع' : 'Type'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'الخطة / المزوّد' : 'Plan / Provider'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'رقم البطاقة' : 'Card #'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'الفترة' : 'Period'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'القسط' : 'Premium'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {enrolments.map(e => {
                const plan = plans.find(p => p.id === e.planId)
                const sc   = STATUS_COLOR[e.enrolmentStatus] ?? '#9CA3AF'
                return (
                  <tr key={e.id}>
                    <td className="px-5 py-3 text-ink-2">
                      {e.enrolmentType}
                      {e.enrolmentType === 'DEPENDENT' && <p className="text-xs text-ink-3">{locale === 'ar' ? 'تسجيل مُعال' : 'Dep. enrolment'}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-ink-1">{plan?.planNameEn ?? e.planId.slice(0, 8)}</p>
                      <p className="text-xs text-ink-3">{plan?.providerName}</p>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-ink-2">{e.insuranceCardNumber ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-ink-3">{e.effectiveDate} → {e.expiryDate}</td>
                    <td className="px-5 py-3 font-mono text-xs text-ink-2">
                      AED {parseFloat(e.annualPremiumAed ?? '0').toLocaleString()}
                      <p className="text-ink-3">Emp: AED {parseFloat(e.employeePremiumAed ?? '0').toLocaleString()}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span style={{
                        display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                        fontSize: 'var(--text-caption)', fontWeight: 600,
                        background: `color-mix(in srgb, ${sc} 12%, transparent)`,
                        color: sc,
                      }}>
                        {e.enrolmentStatus}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></TableScrollRegion>
        )}
      </div>

      {/* Dependents insurance section */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionTitle style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
            {locale === 'ar' ? 'تأمين المعالين' : 'Dependent Insurance'}
          </SectionTitle>
        </div>
        {dependents.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 'var(--text-body)' }}>
            {locale === 'ar' ? 'لا يوجد معالون مسجلون.' : 'No dependents on record.'}{' '}
            <Link href={`/persons/${person.id}/dependents`} style={{ color: 'var(--brand-active)' }}>
              {locale === 'ar' ? 'إضافة معالين' : 'Add dependents'}
            </Link>
          </div>
        ) : (
          <TableScrollRegion><table className="w-full text-sm">
            <thead style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <tr>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'المُعال' : 'Dependent'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'صلة القرابة' : 'Relationship'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'وثيقة التأشيرة' : 'Visa Doc'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'التأمين' : 'Insurance'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dependents.map(dep => {
                const sc = STATUS_COLOR[dep.insuranceStatus ?? 'NOT_ENROLLED'] ?? '#9CA3AF'
                const depEnrolment = enrolments.find(
                  e => e.enrolmentType === 'DEPENDENT' && e.dependentId === dep.id && e.enrolmentStatus === 'ACTIVE'
                )
                return (
                  <tr key={dep.id}>
                    <td className="px-5 py-3">
                      <p className="text-ink-1">{dep.firstNameEn} {dep.lastNameEn}</p>
                      {dep.dateOfBirth && <p className="text-xs text-ink-3">{locale === 'ar' ? 'تاريخ الميلاد' : 'DOB'}: {dep.dateOfBirth}</p>}
                    </td>
                    <td className="px-5 py-3 text-ink-2">{dep.relationship ?? '—'}</td>
                    <td className="px-5 py-3">
                      {dep.visaDocumentId ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-caption)', color: '#16A34A' }}>
                          <CheckCircle size={13} /> {locale === 'ar' ? 'مرفوعة' : 'Uploaded'}
                        </span>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-caption)', color: '#D97706' }}>
                          <AlertTriangle size={13} /> {locale === 'ar' ? 'مفقودة' : 'Missing'}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span style={{
                        display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                        fontSize: 'var(--text-caption)', fontWeight: 600,
                        background: `color-mix(in srgb, ${sc} 12%, transparent)`,
                        color: sc,
                      }}>
                        {(dep.insuranceStatus ?? 'NOT_ENROLLED').replace(/_/g, ' ')}
                      </span>
                      {dep.insuranceCardNumber && (
                        <p className="mt-0.5 font-mono text-xs text-ink-3">{dep.insuranceCardNumber}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {dep.isOnCompanyInsurance ? (
                        depEnrolment && (
                          <Button variant="ghost" size="sm" style={{ fontSize: 'var(--text-caption)', color: '#EF4444' }}
                            onClick={() => {
                              setCancelTarget(depEnrolment)
                              setCancelDate(new Date().toISOString().slice(0, 10))
                              setCancelReason('')
                              setExtDate('')
                              setExtReason('')
                            }}>
                            {locale === 'ar' ? 'إزالة' : 'Remove'}
                          </Button>
                        )
                      ) : (
                        <Button
                          variant="outline" size="sm"
                          disabled={!dep.visaDocumentId}
                          title={!dep.visaDocumentId ? (locale === 'ar' ? 'ارفع وثيقة تأشيرة المُعال أولاً' : 'Upload dependent visa document first') : (locale === 'ar' ? 'تسجيل هذا المُعال' : 'Enrol this dependent')}
                          onClick={() => {
                            setDepTarget(dep)
                            setDepPlanId('')
                            setDepDate(new Date().toISOString().slice(0, 10))
                            setDepIsStudent(false)
                          }}
                        >
                          {locale === 'ar' ? 'تسجيل' : 'Enrol'}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></TableScrollRegion>
        )}
      </div>

      {/* Feedback messages */}
      {error && (
        <p style={{ fontSize: 'var(--text-body)', color: '#EF4444', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px' }}>
          {error}
        </p>
      )}
      {success && (
        <p style={{ fontSize: 'var(--text-body)', color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '10px 14px' }}>
          {success}
        </p>
      )}

      {/* ── Enrol employee modal ──────────────────────────────────────────── */}
      {showEnrol && (
        <Modal title={locale === 'ar' ? 'تسجيل الموظف في التأمين' : 'Enrol Employee in Insurance'} onClose={() => setShowEnrol(false)}>
          <form onSubmit={handleEnrolEmployee} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Label>{locale === 'ar' ? 'خطة التأمين' : 'Insurance Plan'}</Label>
              <Select value={enrolPlanId} onValueChange={setEnrolPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder={locale === 'ar' ? 'تحديد تلقائي من قواعد الأهلية' : 'Auto-resolve from eligibility rules'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{locale === 'ar' ? 'تحديد تلقائي من الأهلية' : 'Auto-resolve from eligibility'}</SelectItem>
                  {activePlans.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.planNameEn} ({p.planCategory}) · AED {parseFloat(p.employeePremiumAed ?? '0').toLocaleString()}/yr
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-ink-3">{locale === 'ar' ? 'اتركها فارغة للتعيين التلقائي حسب الدرجة ونوع التوظيف.' : 'Leave blank to auto-assign based on grade and employment type.'}</p>
            </div>
            <div>
              <Label>{locale === 'ar' ? 'تاريخ السريان *' : 'Effective Date *'}</Label>
              <Input type="date" value={enrolDate} required onChange={e => setEnrolDate(e.target.value)} />
            </div>
            {error && <p style={{ fontSize: 'var(--text-body)', color: '#EF4444' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button type="button" variant="outline" onClick={() => setShowEnrol(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
              <Button type="submit" disabled={isPending}>{isPending ? (locale === 'ar' ? 'جارٍ التسجيل…' : 'Enrolling…') : (locale === 'ar' ? 'تسجيل' : 'Enrol')}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Cancel enrolment modal ─────────────────────────────────────────── */}
      {cancelTarget && (
        <Modal title={locale === 'ar' ? 'إلغاء تسجيل التأمين' : 'Cancel Insurance Enrolment'} onClose={() => setCancelTarget(null)}>
          <form onSubmit={handleCancelEnrolment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
              {locale === 'ar'
                ? 'BR-INS-006: تستمر التغطية التأمينية حتى نهاية فترة الإشعار. يمكنك التمديد بعد ذلك التاريخ عند الحاجة.'
                : 'BR-INS-006: Insurance coverage continues until the end of the notice period. You may extend beyond that date if needed.'}
            </p>
            <div>
              <Label>{locale === 'ar' ? 'تاريخ الإلغاء (نهاية فترة الإشعار) *' : 'Cancellation Date (notice period end) *'}</Label>
              <Input type="date" value={cancelDate} required onChange={e => setCancelDate(e.target.value)} />
            </div>
            <div>
              <Label>{locale === 'ar' ? 'سبب الإلغاء *' : 'Cancellation Reason *'}</Label>
              <Input value={cancelReason} required placeholder={locale === 'ar' ? 'مثال: استقالة، إنهاء خدمة' : 'e.g. Resignation, Termination'}
                onChange={e => setCancelReason(e.target.value)} />
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <p style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                {locale === 'ar' ? 'تمديد استثنائي (اختياري)' : 'Exception extension (optional)'}
              </p>
              <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <Label>{locale === 'ar' ? 'تاريخ التمديد' : 'Extension date'}</Label>
                  <Input type="date" value={extDate} onChange={e => setExtDate(e.target.value)} />
                </div>
                <div>
                  <Label>{locale === 'ar' ? 'سبب التمديد' : 'Extension reason'}</Label>
                  <Input value={extReason} placeholder={locale === 'ar' ? 'مثال: تأخر معالجة التأشيرة' : 'e.g. Visa processing delay'}
                    onChange={e => setExtReason(e.target.value)} />
                </div>
              </div>
            </div>
            {error && <p style={{ fontSize: 'var(--text-body)', color: '#EF4444' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button type="button" variant="outline" onClick={() => setCancelTarget(null)}>{locale === 'ar' ? 'رجوع' : 'Back'}</Button>
              <Button type="submit" disabled={isPending} style={{ background: '#EF4444', color: "var(--on-accent)" }}>
                {isPending ? (locale === 'ar' ? 'جارٍ الإلغاء…' : 'Cancelling…') : (locale === 'ar' ? 'تأكيد الإلغاء' : 'Confirm cancellation')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Update card modal ─────────────────────────────────────────────── */}
      {cardTarget && (
        <Modal title={locale === 'ar' ? 'تحديث بيانات بطاقة التأمين' : 'Update Insurance Card Details'} onClose={() => setCardTarget(null)}>
          <form onSubmit={handleUpdateCard} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Label>{locale === 'ar' ? 'رقم البطاقة' : 'Card Number'}</Label>
              <Input value={cardNumber} placeholder={locale === 'ar' ? 'رقم بطاقة التأمين' : 'Insurance card number'}
                onChange={e => setCardNumber(e.target.value)} />
            </div>
            <div>
              <Label>{locale === 'ar' ? 'معرّف العضو' : 'Member ID'}</Label>
              <Input value={memberId} placeholder={locale === 'ar' ? 'معرّف العضو / شركة التأمين' : 'Member / insurer ID'}
                onChange={e => setMemberId(e.target.value)} />
            </div>
            {error && <p style={{ fontSize: 'var(--text-body)', color: '#EF4444' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button type="button" variant="outline" onClick={() => setCardTarget(null)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
              <Button type="submit" disabled={isPending}>{isPending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ بيانات البطاقة' : 'Save card details')}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Enrol dependent modal ──────────────────────────────────────────── */}
      {depTarget && (
        <Modal title={locale === 'ar' ? `تسجيل ${depTarget.firstNameEn ?? 'المُعال'} في التأمين` : `Enrol ${depTarget.firstNameEn ?? 'Dependent'} in Insurance`} onClose={() => setDepTarget(null)}>
          <form onSubmit={handleEnrolDependent} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Label>{locale === 'ar' ? 'خطة التأمين' : 'Insurance Plan'}</Label>
              <Select value={depPlanId} onValueChange={setDepPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder={locale === 'ar' ? 'استخدام نفس خطة الموظف' : 'Use same plan as employee'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{locale === 'ar' ? 'استخدام نفس خطة الموظف' : 'Use same plan as employee'}</SelectItem>
                  {activePlans.filter(p => p.dependentsCovered).map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.planNameEn} · {p.planCategory}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{locale === 'ar' ? 'تاريخ السريان *' : 'Effective Date *'}</Label>
              <Input type="date" value={depDate} required onChange={e => setDepDate(e.target.value)} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-body)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={depIsStudent}
                onChange={e => setDepIsStudent(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: 'var(--accent)' }}
              />
              {locale === 'ar' ? 'المُعال طالب بدوام كامل (يمدّد الحد العمري للأبناء إلى 25)' : 'Dependent is a full-time student (extends child age cap to 25)'}
            </label>
            {error && <p style={{ fontSize: 'var(--text-body)', color: '#EF4444' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button type="button" variant="outline" onClick={() => setDepTarget(null)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
              <Button type="submit" disabled={isPending}>{isPending ? (locale === 'ar' ? 'جارٍ التسجيل…' : 'Enrolling…') : (locale === 'ar' ? 'تسجيل المُعال' : 'Enrol dependent')}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ── Reusable modal shell ───────────────────────────────────────────────────────

function Modal({
  title, children, onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', padding: 28, width: 480, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <SectionTitle className="font-serif text-lg text-ink-1">{title}</SectionTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X size={15} /></Button>
        </div>
        {children}
      </div>
    </div>
  )
}
