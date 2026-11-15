'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useLocale } from '@/components/providers/LocaleProvider'
import { HijriDatePicker } from '@/components/forms/HijriDatePicker'
import { addDependent } from '@/modules/core-hr'

type Relationship = 'SPOUSE' | 'CHILD' | 'PARENT' | 'PARENT_IN_LAW' | 'SIBLING' | 'OTHER'
type Gender       = 'MALE' | 'FEMALE' | 'NOT_SPECIFIED'

const todayIso = () => new Date().toISOString().slice(0, 10)
const EID_REGEX = /^(?:784-\d{4}-\d{7}-\d{1}|784\d{12})$/

interface Props {
  personId: string
  atCap:    boolean
}

export function DependentsManager({ personId, atCap }: Props) {
  const [relationship,  setRelationship]  = useState<Relationship | ''>('')
  const [firstNameEn,   setFirstNameEn]   = useState('')
  const [middleNameEn,  setMiddleNameEn]  = useState('')
  const [lastNameEn,    setLastNameEn]    = useState('')
  const [fullNameAr,    setFullNameAr]    = useState('')
  const [dateOfBirth,   setDateOfBirth]   = useState('')
  const [gender,        setGender]        = useState<Gender>('NOT_SPECIFIED')
  const [nationalityCode, setNationalityCode] = useState('ARE')
  const [emiratesId,        setEmiratesId]        = useState('')
  const [emiratesIdExpiry,  setEmiratesIdExpiry]  = useState('')
  const [passportNumber,    setPassportNumber]    = useState('')
  const [passportCountry,   setPassportCountry]   = useState('')
  const [passportExpiry,    setPassportExpiry]    = useState('')
  const [effectiveFrom,     setEffectiveFrom]     = useState(todayIso())

  const [pending, start] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { toast } = useToast()
  const locale = useLocale()
  const router    = useRouter()

  function reset() {
    setRelationship('')
    setFirstNameEn('')
    setMiddleNameEn('')
    setLastNameEn('')
    setFullNameAr('')
    setDateOfBirth('')
    setGender('NOT_SPECIFIED')
    setNationalityCode('ARE')
    setEmiratesId('')
    setEmiratesIdExpiry('')
    setPassportNumber('')
    setPassportCountry('')
    setPassportExpiry('')
    setEffectiveFrom(todayIso())
    setErrors({})
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})

    if (!relationship)  { setErrors({ relationship: locale === 'ar' ? 'مطلوب' : 'Required' }); return }
    if (!firstNameEn.trim()) { setErrors({ firstNameEn: locale === 'ar' ? 'مطلوب' : 'Required' }); return }
    if (!lastNameEn.trim())  { setErrors({ lastNameEn: locale === 'ar' ? 'مطلوب' : 'Required' }); return }
    if (!fullNameAr.trim())  { setErrors({ fullNameAr: locale === 'ar' ? 'FR-CH-15: الاسم بالعربية مطلوب' : 'FR-CH-15: Arabic name required' }); return }
    if (!dateOfBirth)        { setErrors({ dateOfBirth: locale === 'ar' ? 'مطلوب' : 'Required' }); return }
    if (!/^[A-Z]{3}$/.test(nationalityCode)) { setErrors({ nationalityCode: locale === 'ar' ? 'ISO-3 (مثال: ARE)' : 'ISO-3 (e.g. ARE)' }); return }
    if (emiratesId && !EID_REGEX.test(emiratesId)) {
      setErrors({ emiratesId: 'BR-EID-001: 784-XXXX-XXXXXXX-X' })
      return
    }
    if (passportCountry && !/^[A-Z]{3}$/.test(passportCountry)) {
      setErrors({ passportCountry: 'ISO-3' }); return
    }

    start(async () => {
      try {
        const result = await addDependent({
          personId,
          relationship,
          firstNameEn:  firstNameEn.trim(),
          middleNameEn: middleNameEn.trim() || undefined,
          lastNameEn:   lastNameEn.trim(),
          fullNameAr:   fullNameAr.trim(),
          dateOfBirth,
          gender,
          nationalityCode: nationalityCode.toUpperCase(),
          emiratesId:        emiratesId.trim() || undefined,
          emiratesIdExpiry:  emiratesIdExpiry || undefined,
          passportNumber:    passportNumber.trim() || undefined,
          passportCountry:   passportCountry.trim().toUpperCase() || undefined,
          passportExpiry:    passportExpiry || undefined,
          effectiveFrom,
        })
        toast({
          title: locale === 'ar' ? 'تمت إضافة المُعال' : 'Dependent added',
          description: locale === 'ar'
            ? `المُعال رقم ${result.dependentNumber}. الحالة: قيد الانتظار (تسجيل التأمين).`
            : `Dependent #${result.dependentNumber}. Status: PENDING (insurance enrolment).`,
        })
        reset()
        router.refresh()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الحفظ' : 'Save failed')
        toast({ title: locale === 'ar' ? 'تعذّرت إضافة المُعال' : 'Could not add dependent', description: message, variant: 'destructive' })
        if (message.startsWith('[')) {
          try {
            const issues = JSON.parse(message) as Array<{ path: string[]; message: string }>
            const next: Record<string, string> = {}
            for (const i of issues) next[i.path.join('.')] = i.message
            setErrors(next)
          } catch { /* ignore */ }
        }
      }
    })
  }

  if (atCap) {
    return (
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
            {locale === 'ar' ? 'إضافة مُعال' : 'Add dependent'}
            <Badge className="ms-2 align-middle" variant="outline">{locale === 'ar' ? 'تم بلوغ الحد الأقصى' : 'cap reached'}</Badge>
          </h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <p className="text-sm text-ink-3">
            {locale === 'ar'
              ? 'BR-INS-004: لدى هذا الشخص الحد الأقصى وهو 9 معالين مسجلين. أزل أو عطّل مُعالاً قائماً قبل إضافة آخر.'
              : 'BR-INS-004: this person has the maximum 9 dependents on file. Remove or deactivate an existing dependent before adding a new one.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'إضافة مُعال' : 'Add dependent'}</h3></div>
      <div style={{ padding: '16px 20px' }}>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="relationship" label={locale === 'ar' ? 'صلة القرابة' : 'Relationship'} required error={errors['relationship']}>
              <Select value={relationship || undefined}
                onValueChange={v => setRelationship(v as Relationship)}
                disabled={pending}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPOUSE">{locale === 'ar' ? 'الزوج/الزوجة' : 'Spouse'}</SelectItem>
                  <SelectItem value="CHILD">{locale === 'ar' ? 'ابن/ابنة' : 'Child'}</SelectItem>
                  <SelectItem value="PARENT">{locale === 'ar' ? 'أحد الوالدين' : 'Parent'}</SelectItem>
                  <SelectItem value="PARENT_IN_LAW">{locale === 'ar' ? 'حمو/حماة' : 'Parent-in-law'}</SelectItem>
                  <SelectItem value="SIBLING">{locale === 'ar' ? 'أخ/أخت' : 'Sibling'}</SelectItem>
                  <SelectItem value="OTHER">{locale === 'ar' ? 'أخرى' : 'Other'}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div>
              <HijriDatePicker
                label={locale === 'ar' ? 'تاريخ الميلاد' : 'Date of birth'}
                required
                value={dateOfBirth}
                onChange={setDateOfBirth}
                disabled={pending}
              />
              {errors['dateOfBirth'] && (
                <p className="mt-1 text-xs text-destructive">{errors['dateOfBirth']}</p>
              )}
            </div>
            <Field id="gender" label={locale === 'ar' ? 'الجنس' : 'Gender'} required>
              <Select value={gender}
                onValueChange={v => setGender(v as Gender)}
                disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">{locale === 'ar' ? 'ذكر' : 'Male'}</SelectItem>
                  <SelectItem value="FEMALE">{locale === 'ar' ? 'أنثى' : 'Female'}</SelectItem>
                  <SelectItem value="NOT_SPECIFIED">{locale === 'ar' ? 'غير محدد' : 'Not specified'}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="firstNameEn" label={locale === 'ar' ? 'الاسم الأول' : 'First name'} required suffix="EN" error={errors['firstNameEn']}>
              <Input id="firstNameEn" required maxLength={100}
                value={firstNameEn} onChange={e => setFirstNameEn(e.target.value)}
                disabled={pending} />
            </Field>
            <Field id="middleNameEn" label={locale === 'ar' ? 'الاسم الأوسط' : 'Middle name'} suffix="EN">
              <Input id="middleNameEn" maxLength={100}
                value={middleNameEn} onChange={e => setMiddleNameEn(e.target.value)}
                disabled={pending} />
            </Field>
            <Field id="lastNameEn" label={locale === 'ar' ? 'اسم العائلة' : 'Last name'} required suffix="EN" error={errors['lastNameEn']}>
              <Input id="lastNameEn" required maxLength={100}
                value={lastNameEn} onChange={e => setLastNameEn(e.target.value)}
                disabled={pending} />
            </Field>
          </div>

          <Field id="fullNameAr" label={locale === 'ar' ? 'الاسم الكامل' : 'Full name'} required suffix="AR" error={errors['fullNameAr']}
            help={locale === 'ar' ? 'FR-CH-15: الاسم الكامل بالعربية مطلوب.' : 'FR-CH-15: Arabic full name required.'}>
            <Input id="fullNameAr" required dir="rtl" lang="ar" className="text-end"
              maxLength={300}
              value={fullNameAr} onChange={e => setFullNameAr(e.target.value)}
              placeholder="أحمد علي" disabled={pending} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="nationalityCode" label={locale === 'ar' ? 'الجنسية (ISO-3)' : 'Nationality (ISO-3)'} required error={errors['nationalityCode']}>
              <Input id="nationalityCode" required maxLength={3} className="uppercase"
                value={nationalityCode}
                onChange={e => setNationalityCode(e.target.value.toUpperCase())}
                placeholder="ARE" disabled={pending} />
            </Field>
            <HijriDatePicker
              label={locale === 'ar' ? 'سارٍ من' : 'Effective from'}
              required
              value={effectiveFrom}
              onChange={setEffectiveFrom}
              disabled={pending}
            />
            <div /> {/* spacer */}
          </div>

          <div className="rounded-md border border-border bg-surface p-3">
            <p className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'بيانات شخصية (مشفّرة بـ AES-256-GCM قبل الإدراج)' : 'PII (encrypted with AES-256-GCM before INSERT)'}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field id="emiratesId" label={locale === 'ar' ? 'الهوية الإماراتية (BR-EID-001)' : 'Emirates ID (BR-EID-001)'} error={errors['emiratesId']}>
                <Input id="emiratesId" className="font-mono"
                  value={emiratesId} onChange={e => setEmiratesId(e.target.value)}
                  placeholder="784-XXXX-XXXXXXX-X" disabled={pending} />
              </Field>
              <HijriDatePicker
                label={locale === 'ar' ? 'انتهاء الهوية' : 'EID expiry'}
                value={emiratesIdExpiry}
                onChange={setEmiratesIdExpiry}
                disabled={pending}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field id="passportNumber" label={locale === 'ar' ? 'رقم جواز السفر' : 'Passport number'}>
                <Input id="passportNumber" className="font-mono"
                  value={passportNumber} onChange={e => setPassportNumber(e.target.value)}
                  disabled={pending} />
              </Field>
              <Field id="passportCountry" label={locale === 'ar' ? 'دولة الإصدار (ISO-3)' : 'Issuing country (ISO-3)'} error={errors['passportCountry']}>
                <Input id="passportCountry" maxLength={3} className="uppercase"
                  value={passportCountry}
                  onChange={e => setPassportCountry(e.target.value.toUpperCase())}
                  disabled={pending} />
              </Field>
              <HijriDatePicker
                label={locale === 'ar' ? 'انتهاء جواز السفر' : 'Passport expiry'}
                value={passportExpiry}
                onChange={setPassportExpiry}
                disabled={pending}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={reset} disabled={pending}>{locale === 'ar' ? 'إعادة تعيين' : 'Reset'}</Button>
            <Button type="submit" disabled={pending}>
              {pending ? (locale === 'ar' ? 'جارٍ الإضافة…' : 'Adding…') : (locale === 'ar' ? 'إضافة مُعال' : 'Add dependent')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  id, label, required, suffix, error, help, children,
}: {
  id: string
  label: string
  required?: boolean
  suffix?: string
  error?: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-ink-2">
        {label}{required && <span className="ms-0.5 text-destructive">*</span>}
        {suffix && <span className="ms-2 text-xs uppercase tracking-wide text-ink-3">{suffix}</span>}
      </Label>
      {children}
      {error
        ? <p className="text-xs text-destructive">{error}</p>
        : help ? <p className="text-xs text-ink-3">{help}</p> : null}
    </div>
  )
}
