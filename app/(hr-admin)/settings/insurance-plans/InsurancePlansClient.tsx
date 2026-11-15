'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toUserMessage } from '@/lib/app-error'
import { type Locale } from '@/lib/i18n'
import { tk } from '@/lib/i18n-messages'
import {
  createInsurancePlan,
  updateInsurancePlan,
  toggleInsurancePlanActive,
} from '@/modules/insurance/actions'
import type { MedicalInsurancePlan } from '@/drizzle/schema'
import { HeartPulse, Plus, Pencil, Power, Check, X } from 'lucide-react'

interface Props {
  plans:         MedicalInsurancePlan[]
  legalEntityId: string
  role:          string
  locale?:       Locale
}

const CATEGORIES = [
  { value: 'ESSENTIAL_BENEFITS', label: 'Essential Benefits' },
  { value: 'BASIC',    label: 'Basic' },
  { value: 'ENHANCED', label: 'Enhanced' },
  { value: 'PREMIUM',  label: 'Premium' },
  { value: 'EXECUTIVE',label: 'Executive' },
  { value: 'CUSTOM',   label: 'Custom' },
]

const CATEGORY_COLOR: Record<string, string> = {
  ESSENTIAL_BENEFITS: '#6B7280',
  BASIC:    '#3B82F6',
  ENHANCED: '#8B5CF6',
  PREMIUM:  '#F59E0B',
  EXECUTIVE:'#EF4444',
  CUSTOM:   '#10B981',
}

const emptyForm = {
  planCode: '', planNameEn: '', planNameAr: '', providerName: '', tpaName: '',
  policyNumber: '', networkName: '', planCategory: 'BASIC',
  inpatientLimitAed: '', outpatientLimitAed: '',
  dentalCovered: false, opticalCovered: false, maternityCovered: true,
  preExistingCovered: false, repatriationCovered: false,
  employeePremiumAed: '', spousePremiumAed: '', childPremiumAed: '', parentPremiumAed: '',
  policyStartDate: '', policyEndDate: '', renewalDate: '',
  isDefaultPlan: false, regulatoryScheme: '', employerContributionPct: '100',
  minServiceMonths: 0, dependentsCovered: true, maxDependents: 9,
}

export function InsurancePlansClient({ plans: initial, legalEntityId, role, locale = 'en' }: Props) {
  const router   = useRouter()
  const [plans, setPlans]         = useState(initial)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<MedicalInsurancePlan | null>(null)
  const [form, setForm]           = useState({ ...emptyForm })
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm })
    setError('')
    setSuccess('')
    setShowForm(true)
  }

  function openEdit(plan: MedicalInsurancePlan) {
    setEditing(plan)
    setForm({
      planCode:               plan.planCode ?? '',
      planNameEn:             plan.planNameEn ?? '',
      planNameAr:             plan.planNameAr ?? '',
      providerName:           plan.providerName ?? '',
      tpaName:                plan.tpaName ?? '',
      policyNumber:           plan.policyNumber ?? '',
      networkName:            plan.networkName ?? '',
      planCategory:           plan.planCategory ?? 'BASIC',
      inpatientLimitAed:      plan.inpatientLimitAed?.toString() ?? '',
      outpatientLimitAed:     plan.outpatientLimitAed?.toString() ?? '',
      dentalCovered:          plan.dentalCovered,
      opticalCovered:         plan.opticalCovered,
      maternityCovered:       plan.maternityCovered,
      preExistingCovered:     plan.preExistingCovered,
      repatriationCovered:    plan.repatriationCovered,
      employeePremiumAed:     plan.employeePremiumAed?.toString() ?? '',
      spousePremiumAed:       plan.spousePremiumAed?.toString() ?? '',
      childPremiumAed:        plan.childPremiumAed?.toString() ?? '',
      parentPremiumAed:       plan.parentPremiumAed?.toString() ?? '',
      policyStartDate:        plan.policyStartDate ?? '',
      policyEndDate:          plan.policyEndDate ?? '',
      renewalDate:            plan.renewalDate ?? '',
      isDefaultPlan:          plan.isDefaultPlan,
      regulatoryScheme:       plan.regulatoryScheme ?? '',
      employerContributionPct: plan.employerContributionPct?.toString() ?? '100',
      minServiceMonths:       plan.minServiceMonths ?? 0,
      dependentsCovered:      plan.dependentsCovered,
      maxDependents:          plan.maxDependents ?? 9,
    })
    setError('')
    setSuccess('')
    setShowForm(true)
  }

  function handleClose() {
    setShowForm(false)
    setEditing(null)
    setError('')
    setSuccess('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    startTransition(async () => {
      try {
        type PlanCategory = 'ESSENTIAL_BENEFITS' | 'BASIC' | 'ENHANCED' | 'PREMIUM' | 'EXECUTIVE' | 'CUSTOM'
        // Round all AED fields to exactly 2dp before sending to match numeric(12,2) DB column
        const round2 = (v: string) => v ? parseFloat(v).toFixed(2) : v
        const typedForm = {
          ...form,
          planCategory:           form.planCategory as PlanCategory,
          employeePremiumAed:     round2(form.employeePremiumAed),
          spousePremiumAed:       form.spousePremiumAed ? round2(form.spousePremiumAed) : form.spousePremiumAed,
          childPremiumAed:        form.childPremiumAed  ? round2(form.childPremiumAed)  : form.childPremiumAed,
          parentPremiumAed:       form.parentPremiumAed ? round2(form.parentPremiumAed) : form.parentPremiumAed,
        }
        if (editing) {
          await updateInsurancePlan({ id: editing.id, ...typedForm, legalEntityId })
          setSuccess(locale === 'ar' ? 'تم تحديث الخطة.' : 'Plan updated.')
        } else {
          await createInsurancePlan({ ...typedForm, legalEntityId })
          setSuccess(locale === 'ar' ? 'تم إنشاء الخطة.' : 'Plan created.')
        }
        handleClose()
        router.refresh()
      } catch (err) {
        setError(toUserMessage(err))
      }
    })
  }

  function handleToggleActive(plan: MedicalInsurancePlan) {
    startTransition(async () => {
      try {
        await toggleInsurancePlanActive(plan.id, !plan.isActive)
        router.refresh()
      } catch (err) {
        setError(toUserMessage(err))
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="font-serif text-2xl text-ink-1">
            {locale === 'ar' ? 'خطط التأمين الطبي' : 'Insurance Plans'}
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            {locale === 'ar'
              ? 'إدارة خطط التأمين الطبي لكل كيان قانوني. تتم مطابقة الموظفين بالخطط حسب الدرجة ونوع التوظيف.'
              : 'Manage medical insurance plans for each legal entity. Employees are matched to plans by grade and employment type.'}
          </p>
        </div>
        <Button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} />
          {locale === 'ar' ? 'خطة جديدة' : 'New Plan'}
        </Button>
      </div>

      {/* Plans table */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {plans.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <HeartPulse size={32} style={{ color: 'var(--ink-4)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>{locale === 'ar' ? 'لم يتم تكوين أي خطط تأمين بعد.' : 'No insurance plans configured yet.'}</p>
            <Button variant="outline" onClick={openCreate} style={{ marginTop: 12 }}>
              <Plus size={13} style={{ marginInlineEnd: 6 }} /> {locale === 'ar' ? 'إنشاء أول خطة' : 'Create first plan'}
            </Button>
          </div>
        ) : (
          <TableScrollRegion><table className="w-full text-sm">
            <thead style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <tr>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'الخطة' : 'Plan'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'المزوّد' : 'Provider'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'الفئة' : 'Category'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'قسط الموظف' : 'Employee Premium'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'فترة الوثيقة' : 'Policy Period'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="px-5 py-2.5 text-start text-xs font-medium uppercase text-ink-3">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plans.map(plan => (
                <tr key={plan.id} style={{ opacity: plan.isActive ? 1 : 0.55 }}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink-1">{plan.planNameEn}</p>
                    {plan.planNameAr && (
                      <p className="text-xs text-ink-3" dir="rtl" lang="ar">{plan.planNameAr}</p>
                    )}
                    <p className="font-mono text-xs text-ink-4">{plan.planCode}</p>
                  </td>
                  <td className="px-5 py-3 text-ink-2">
                    <p>{plan.providerName}</p>
                    {plan.networkName && <p className="text-xs text-ink-3">{plan.networkName}</p>}
                  </td>
                  <td className="px-5 py-3">
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                      fontSize: 'var(--text-caption)', fontWeight: 600,
                      background: `color-mix(in srgb, ${CATEGORY_COLOR[plan.planCategory] ?? '#6B7280'} 12%, transparent)`,
                      color: CATEGORY_COLOR[plan.planCategory] ?? '#6B7280',
                    }}>
                      {plan.planCategory}
                    </span>
                    {plan.isDefaultPlan && (
                      <Badge variant="outline" className="ml-1 text-xs">{locale === 'ar' ? 'افتراضية' : 'DEFAULT'}</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-ink-2">
                    AED {parseFloat(plan.employeePremiumAed ?? '0').toLocaleString()}
                    <span className="text-ink-4"> /yr</span>
                  </td>
                  <td className="px-5 py-3 text-xs text-ink-3">
                    {plan.policyStartDate} → {plan.policyEndDate}
                  </td>
                  <td className="px-5 py-3">
                    {plan.isActive
                      ? <Badge variant="outline" className="text-xs text-green-600">{locale === 'ar' ? 'نشطة' : 'ACTIVE'}</Badge>
                      : <Badge variant="secondary" className="text-xs">{locale === 'ar' ? 'غير نشطة' : 'INACTIVE'}</Badge>}
                  </td>
                  <td className="px-5 py-3">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(plan)} title={locale === 'ar' ? 'تعديل الخطة' : 'Edit plan'}>
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => handleToggleActive(plan)}
                        title={plan.isActive ? (locale === 'ar' ? 'إلغاء التنشيط' : 'Deactivate') : (locale === 'ar' ? 'تنشيط' : 'Activate')}
                        style={{ color: plan.isActive ? 'var(--ink-3)' : 'var(--brand-active)' }}
                      >
                        <Power size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></TableScrollRegion>
        )}
      </div>

      {/* Error / Success */}
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

      {/* Slide-in form panel */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
          background: 'rgba(0,0,0,0.35)',
        }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div style={{
            width: 560, height: '100vh', overflowY: 'auto',
            background: 'var(--card)', boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
            padding: 28, display: 'flex', flexDirection: 'column', gap: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 className="font-serif text-xl text-ink-1">
                {editing ? (locale === 'ar' ? 'تعديل خطة التأمين' : 'Edit Insurance Plan') : (locale === 'ar' ? 'خطة تأمين جديدة' : 'New Insurance Plan')}
              </h2>
              <Button variant="ghost" size="sm" onClick={handleClose}><X size={15} /></Button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Identification */}
              <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                <legend style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 6px' }}>
                  {locale === 'ar' ? 'التعريف' : 'Identification'}
                </legend>
                <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <Label htmlFor="planCode">{locale === 'ar' ? 'رمز الخطة *' : 'Plan Code *'}</Label>
                    <Input id="planCode" value={form.planCode} required
                      onChange={e => setForm(f => ({ ...f, planCode: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="planCategory">{locale === 'ar' ? 'الفئة *' : 'Category *'}</Label>
                    <Select value={form.planCategory} onValueChange={v => setForm(f => ({ ...f, planCategory: v }))}>
                      <SelectTrigger id="planCategory"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Label htmlFor="planNameEn">{locale === 'ar' ? 'اسم الخطة (بالإنجليزية) *' : 'Plan Name (English) *'}</Label>
                    <Input id="planNameEn" value={form.planNameEn} required
                      onChange={e => setForm(f => ({ ...f, planNameEn: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Label htmlFor="planNameAr">{locale === 'ar' ? 'اسم الخطة (بالعربية)' : 'Plan Name (Arabic)'}</Label>
                    <Input id="planNameAr" value={form.planNameAr} dir="rtl" lang="ar"
                      onChange={e => setForm(f => ({ ...f, planNameAr: e.target.value }))} />
                  </div>
                </div>
              </fieldset>

              {/* Provider */}
              <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                <legend style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 6px' }}>
                  {locale === 'ar' ? 'المزوّد' : 'Provider'}
                </legend>
                <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <Label htmlFor="providerName">{locale === 'ar' ? 'اسم المزوّد *' : 'Provider Name *'}</Label>
                    <Input id="providerName" value={form.providerName} required
                      onChange={e => setForm(f => ({ ...f, providerName: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="tpaName">{locale === 'ar' ? 'اسم المدير الخارجي (TPA)' : 'TPA Name'}</Label>
                    <Input id="tpaName" value={form.tpaName}
                      onChange={e => setForm(f => ({ ...f, tpaName: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="policyNumber">{locale === 'ar' ? 'رقم الوثيقة *' : 'Policy Number *'}</Label>
                    <Input id="policyNumber" value={form.policyNumber} required
                      onChange={e => setForm(f => ({ ...f, policyNumber: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="networkName">{locale === 'ar' ? 'اسم الشبكة' : 'Network Name'}</Label>
                    <Input id="networkName" value={form.networkName}
                      onChange={e => setForm(f => ({ ...f, networkName: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="regulatoryScheme">{locale === 'ar' ? 'الجهة التنظيمية' : 'Regulatory Scheme'}</Label>
                    <Input id="regulatoryScheme" placeholder="e.g. DHA, HAAD" value={form.regulatoryScheme}
                      onChange={e => setForm(f => ({ ...f, regulatoryScheme: e.target.value }))} />
                  </div>
                </div>
              </fieldset>

              {/* Policy dates */}
              <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                <legend style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 6px' }}>
                  {locale === 'ar' ? 'تواريخ الوثيقة' : 'Policy Dates'}
                </legend>
                <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <Label htmlFor="policyStartDate">{locale === 'ar' ? 'تاريخ البدء *' : 'Start Date *'}</Label>
                    <Input id="policyStartDate" type="date" value={form.policyStartDate} required
                      onChange={e => setForm(f => ({ ...f, policyStartDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="policyEndDate">{locale === 'ar' ? 'تاريخ الانتهاء *' : 'End Date *'}</Label>
                    <Input id="policyEndDate" type="date" value={form.policyEndDate} required
                      onChange={e => setForm(f => ({ ...f, policyEndDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="renewalDate">{locale === 'ar' ? 'تاريخ التجديد' : 'Renewal Date'}</Label>
                    <Input id="renewalDate" type="date" value={form.renewalDate}
                      onChange={e => setForm(f => ({ ...f, renewalDate: e.target.value }))} />
                  </div>
                </div>
              </fieldset>

              {/* Premiums */}
              <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                <legend style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 6px' }}>
                  {locale === 'ar' ? 'الأقساط السنوية (درهم)' : 'Annual Premiums (AED)'}
                </legend>
                <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <Label htmlFor="employeePremiumAed">{locale === 'ar' ? 'الموظف *' : 'Employee *'}</Label>
                    <Input id="employeePremiumAed" type="number" step="0.01" min="0" value={form.employeePremiumAed} required
                      onChange={e => setForm(f => ({ ...f, employeePremiumAed: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="spousePremiumAed">{locale === 'ar' ? 'الزوج/الزوجة' : 'Spouse'}</Label>
                    <Input id="spousePremiumAed" type="number" step="0.01" min="0" value={form.spousePremiumAed}
                      onChange={e => setForm(f => ({ ...f, spousePremiumAed: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="childPremiumAed">{locale === 'ar' ? 'الابن' : 'Child'}</Label>
                    <Input id="childPremiumAed" type="number" step="0.01" min="0" value={form.childPremiumAed}
                      onChange={e => setForm(f => ({ ...f, childPremiumAed: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="parentPremiumAed">{locale === 'ar' ? 'أحد الوالدين' : 'Parent'}</Label>
                    <Input id="parentPremiumAed" type="number" step="0.01" min="0" value={form.parentPremiumAed}
                      onChange={e => setForm(f => ({ ...f, parentPremiumAed: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="employerContributionPct">{locale === 'ar' ? 'مساهمة صاحب العمل %' : 'Employer Contribution %'}</Label>
                    <Input id="employerContributionPct" type="number" step="0.01" min="0" max="100" value={form.employerContributionPct}
                      onChange={e => setForm(f => ({ ...f, employerContributionPct: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="minServiceMonths">{locale === 'ar' ? 'الحد الأدنى لأشهر الخدمة' : 'Min. Service Months'}</Label>
                    <Input id="minServiceMonths" type="number" min="0" value={form.minServiceMonths}
                      onChange={e => {
                        const n = parseInt(e.target.value, 10)
                        if (!isNaN(n) && n >= 0) setForm(f => ({ ...f, minServiceMonths: n }))
                      }} />
                  </div>
                </div>
              </fieldset>

              {/* Coverage */}
              <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                <legend style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 6px' }}>
                  {locale === 'ar' ? 'خيارات التغطية' : 'Coverage Options'}
                </legend>
                <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {([
                    ['dentalCovered',       locale === 'ar' ? 'الأسنان' : 'Dental'],
                    ['opticalCovered',      locale === 'ar' ? 'البصريات' : 'Optical'],
                    ['maternityCovered',    locale === 'ar' ? 'الأمومة' : 'Maternity'],
                    ['preExistingCovered',  locale === 'ar' ? 'الحالات السابقة' : 'Pre-existing'],
                    ['repatriationCovered', locale === 'ar' ? 'الإعادة للوطن' : 'Repatriation'],
                    ['dependentsCovered',   locale === 'ar' ? 'المعالون' : 'Dependents'],
                    ['isDefaultPlan',       locale === 'ar' ? 'الخطة الافتراضية' : 'Default Plan'],
                  ] as [keyof typeof form, string][]).map(([key, label]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-body)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form[key] as boolean}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                        style={{ width: 15, height: 15, accentColor: 'var(--accent)' }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Form errors */}
              {error && (
                <p style={{ fontSize: 'var(--text-body)', color: '#EF4444', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px' }}>
                  {error}
                </p>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                <Button type="button" variant="outline" onClick={handleClose}>{tk(locale, 'common.cancel')}</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? tk(locale, 'common.saving') : editing ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save changes') : (locale === 'ar' ? 'إنشاء الخطة' : 'Create plan')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
