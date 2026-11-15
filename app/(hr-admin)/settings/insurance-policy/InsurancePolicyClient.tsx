'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toUserMessage } from '@/lib/app-error'
import { type Locale } from '@/lib/i18n'
import { tk } from '@/lib/i18n-messages'
import { upsertInsurancePolicySettings } from '@/modules/insurance/actions'
import type { MedicalInsurancePolicySetting } from '@/drizzle/schema'

interface Props {
  settings:      MedicalInsurancePolicySetting | null
  legalEntityId: string
  locale?:       Locale
}

function defaultForm(s: MedicalInsurancePolicySetting | null) {
  return {
    maxDependentsPerEmployee: s?.maxDependentsPerEmployee ?? 9,
    maxSpouses:               s?.maxSpouses ?? 1,
    maxChildren:              s?.maxChildren ?? 9,
    parentsCovered:           s?.parentsCovered ?? false,
    parentsInLawCovered:      s?.parentsInLawCovered ?? false,
    childMaxAge:              s?.childMaxAge ?? 18,
    childStudentExtensionAge: s?.childStudentExtensionAge ?? 25,
    employerPaysSpouse:       s?.employerPaysSpouse ?? true,
    employerPaysChildren:     s?.employerPaysChildren ?? true,
    employerPaysParents:      s?.employerPaysParents ?? false,
    employeeDependentCostPct: s?.employeeDependentCostPct?.toString() ?? '0',
    autoEnrolOnHire:          s?.autoEnrolOnHire ?? true,
    enrolmentGraceDays:       s?.enrolmentGraceDays ?? 30,
    dependentAddGraceDays:    s?.dependentAddGraceDays ?? 30,
    renewalAlertDaysRaw:      (s?.renewalAlertDays ?? [90, 60, 30, 14]).join(', '),
  }
}

export function InsurancePolicyClient({ settings, legalEntityId, locale = 'en' }: Props) {
  const router   = useRouter()
  const [form, setForm]           = useState(defaultForm(settings))
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const parsedAlertDays = form.renewalAlertDaysRaw
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n))

    const invalidDays = parsedAlertDays.filter(n => n < 1 || n > 365)
    if (invalidDays.length > 0) {
      setError(locale === 'ar'
        ? `يجب أن تكون أيام تنبيه التجديد بين 1 و365. قيم غير صالحة: ${invalidDays.join(', ')}`
        : `Renewal alert days must be between 1 and 365. Invalid values: ${invalidDays.join(', ')}`)
      return
    }
    const renewalAlertDays = parsedAlertDays

    startTransition(async () => {
      try {
        await upsertInsurancePolicySettings({
          legalEntityId,
          maxDependentsPerEmployee: form.maxDependentsPerEmployee,
          maxSpouses:               form.maxSpouses,
          maxChildren:              form.maxChildren,
          parentsCovered:           form.parentsCovered,
          parentsInLawCovered:      form.parentsInLawCovered,
          childMaxAge:              form.childMaxAge,
          childStudentExtensionAge: form.childStudentExtensionAge,
          employerPaysSpouse:       form.employerPaysSpouse,
          employerPaysChildren:     form.employerPaysChildren,
          employerPaysParents:      form.employerPaysParents,
          employeeDependentCostPct: form.employeeDependentCostPct,
          autoEnrolOnHire:          form.autoEnrolOnHire,
          enrolmentGraceDays:       form.enrolmentGraceDays,
          dependentAddGraceDays:    form.dependentAddGraceDays,
          renewalAlertDays,
        })
        setSuccess(locale === 'ar' ? 'تم حفظ إعدادات سياسة التأمين.' : 'Insurance policy settings saved.')
        router.refresh()
      } catch (err) {
        setError(toUserMessage(err))
      }
    })
  }

  const fieldset: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px',
  }
  const legend: React.CSSProperties = {
    fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)',
    letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 6px',
  }
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }
  const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
      <div>
        <h1 className="font-serif text-2xl text-ink-1">
          {locale === 'ar' ? 'سياسة التأمين الطبي' : 'Insurance Policy Settings'}
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          {locale === 'ar'
            ? 'تهيئة قواعد أهلية المعالين، وتقاسم التكلفة، وفترات السماح للتسجيل، وتنبيهات التجديد.'
            : 'Configure dependent eligibility rules, cost sharing, enrolment grace periods, and renewal alerts.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Dependent limits */}
        <fieldset style={fieldset}>
          <legend style={legend}>{locale === 'ar' ? 'حدود المعالين' : 'Dependent Limits'}</legend>
          <div style={grid3}>
            <div>
              <Label>{locale === 'ar' ? 'الحد الأقصى للمعالين لكل موظف' : 'Max dependents per employee'}</Label>
              <Input type="number" min={0} value={form.maxDependentsPerEmployee}
                onChange={e => setForm(f => ({ ...f, maxDependentsPerEmployee: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <Label>{locale === 'ar' ? 'الحد الأقصى للأزواج' : 'Max spouses'}</Label>
              <Input type="number" min={0} value={form.maxSpouses}
                onChange={e => setForm(f => ({ ...f, maxSpouses: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <Label>{locale === 'ar' ? 'الحد الأقصى للأبناء' : 'Max children'}</Label>
              <Input type="number" min={0} value={form.maxChildren}
                onChange={e => setForm(f => ({ ...f, maxChildren: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <Label>{locale === 'ar' ? 'الحد الأقصى لعمر الابن' : 'Child max age'}</Label>
              <Input type="number" min={0} value={form.childMaxAge}
                onChange={e => setForm(f => ({ ...f, childMaxAge: parseInt(e.target.value) || 18 }))} />
            </div>
            <div>
              <Label>{locale === 'ar' ? 'الحد الأقصى لعمر الابن (تمديد الدراسة)' : 'Child (student extension) max age'}</Label>
              <Input type="number" min={0} value={form.childStudentExtensionAge}
                onChange={e => setForm(f => ({ ...f, childStudentExtensionAge: parseInt(e.target.value) || 25 }))} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {([
              ['parentsCovered',      locale === 'ar' ? 'تغطية الوالدين' : 'Parents covered'],
              ['parentsInLawCovered', locale === 'ar' ? 'تغطية والدي الزوج/الزوجة' : 'Parents-in-law covered'],
            ] as [keyof typeof form, string][]).map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-body)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form[key] as boolean}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                  style={{ width: 15, height: 15, accentColor: 'var(--accent)' }} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Cost sharing */}
        <fieldset style={fieldset}>
          <legend style={legend}>{locale === 'ar' ? 'تقاسم التكلفة' : 'Cost Sharing'}</legend>
          <div style={{ marginBottom: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {([
              ['employerPaysSpouse',   locale === 'ar' ? 'صاحب العمل يدفع قسط الزوج/الزوجة' : 'Employer pays spouse premium'],
              ['employerPaysChildren', locale === 'ar' ? 'صاحب العمل يدفع قسط الأبناء' : 'Employer pays children premium'],
              ['employerPaysParents',  locale === 'ar' ? 'صاحب العمل يدفع قسط الوالدين' : 'Employer pays parents premium'],
            ] as [keyof typeof form, string][]).map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-body)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form[key] as boolean}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                  style={{ width: 15, height: 15, accentColor: 'var(--accent)' }} />
                {label}
              </label>
            ))}
          </div>
          <div style={{ maxWidth: 260 }}>
            <Label>{locale === 'ar' ? 'نسبة تكلفة المعال على الموظف % (تجاوز)' : 'Employee dependent cost % (override)'}</Label>
            <Input type="number" step="0.01" min="0" max="100"
              value={form.employeeDependentCostPct}
              onChange={e => setForm(f => ({ ...f, employeeDependentCostPct: e.target.value }))} />
            <p className="mt-1 text-xs text-ink-3">
              {locale === 'ar'
                ? 'نسبة قسط المعال المحمّلة على الموظف. 0 = صاحب العمل يدفع 100%.'
                : '% of dependent premium charged to employee. 0 = employer pays 100%.'}
            </p>
          </div>
        </fieldset>

        {/* Enrolment rules */}
        <fieldset style={fieldset}>
          <legend style={legend}>{locale === 'ar' ? 'قواعد التسجيل' : 'Enrolment Rules'}</legend>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-body)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.autoEnrolOnHire}
                onChange={e => setForm(f => ({ ...f, autoEnrolOnHire: e.target.checked }))}
                style={{ width: 15, height: 15, accentColor: 'var(--accent)' }} />
              {locale === 'ar' ? 'تسجيل الموظف تلقائياً عند التعيين' : 'Auto-enrol employee on hire'}
            </label>
          </div>
          <div style={grid2}>
            <div>
              <Label>{locale === 'ar' ? 'فترة سماح التسجيل (أيام)' : 'Enrolment grace period (days)'}</Label>
              <Input type="number" min={0} value={form.enrolmentGraceDays}
                onChange={e => setForm(f => ({ ...f, enrolmentGraceDays: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <Label>{locale === 'ar' ? 'فترة سماح إضافة معال (أيام)' : 'Dependent add grace period (days)'}</Label>
              <Input type="number" min={0} value={form.dependentAddGraceDays}
                onChange={e => setForm(f => ({ ...f, dependentAddGraceDays: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>
        </fieldset>

        {/* Renewal alerts */}
        <fieldset style={fieldset}>
          <legend style={legend}>{locale === 'ar' ? 'جدول تنبيهات التجديد' : 'Renewal Alert Schedule'}</legend>
          <div>
            <Label>{locale === 'ar' ? 'أيام التنبيه قبل انتهاء الصلاحية (مفصولة بفواصل)' : 'Alert days before expiry (comma-separated)'}</Label>
            <Input value={form.renewalAlertDaysRaw}
              placeholder="e.g. 90, 60, 30, 14"
              onChange={e => setForm(f => ({ ...f, renewalAlertDaysRaw: e.target.value }))} />
            <p className="mt-1 text-xs text-ink-3">
              {locale === 'ar'
                ? 'تُرسل الإشعارات إلى مسؤول الموارد البشرية عند كل حد. يجب أن تكون القيم بين 1 و365 يوماً. مثال: 90, 60, 30, 14.'
                : 'Notifications are sent to HR Admin at each threshold. Values must be 1–365 days. Example: 90, 60, 30, 14.'}
            </p>
          </div>
        </fieldset>

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

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" disabled={isPending}>
            {isPending ? tk(locale, 'common.saving') : (locale === 'ar' ? 'حفظ إعدادات السياسة' : 'Save policy settings')}
          </Button>
        </div>
      </form>
    </div>
  )
}
