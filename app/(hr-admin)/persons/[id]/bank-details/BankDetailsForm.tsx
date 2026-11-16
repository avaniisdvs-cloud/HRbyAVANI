'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useLocale } from '@/components/providers/LocaleProvider'
import { HijriDatePicker } from '@/components/forms/HijriDatePicker'
import { createBankDetails } from '@/modules/core-hr'

type AccountType = 'CURRENT' | 'SAVINGS' | 'SALARY'

const UAE_IBAN_REGEX = /^AE\d{21}$/

const todayIso = () => new Date().toISOString().slice(0, 10)

export function BankDetailsForm({ personId }: { personId: string }) {
  const [bankName,    setBankName]    = useState('')
  const [bankCode,    setBankCode]    = useState('')
  const [iban,        setIban]        = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('CURRENT')
  const [currency,    setCurrency]    = useState('AED')
  const [isWpsAccount, setIsWpsAccount] = useState(true)
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso())

  const [pending, start] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { toast } = useToast()
  const locale = useLocale()
  const router    = useRouter()

  const ibanCleaned   = iban.replace(/\s+/g, '').toUpperCase()
  const ibanIsValid   = UAE_IBAN_REGEX.test(ibanCleaned)
  const ibanShowError = iban !== '' && !ibanIsValid

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})

    if (!bankName.trim()) { setErrors({ bankName: locale === 'ar' ? 'اسم البنك مطلوب' : 'Bank name required' }); return }
    if (!bankCode.trim()) { setErrors({ bankCode: locale === 'ar' ? 'رمز البنك مطلوب' : 'Bank code required' }); return }
    if (!ibanIsValid)     { setErrors({ iban: locale === 'ar' ? 'BR-WPS-004: يجب أن يكون IBAN الإماراتي AE + 21 رقماً' : 'BR-WPS-004: UAE IBAN must be AE + 21 digits' }); return }
    if (!accountName.trim()) { setErrors({ accountName: locale === 'ar' ? 'اسم صاحب الحساب مطلوب' : 'Account holder name required' }); return }

    start(async () => {
      try {
        await createBankDetails({
          personId,
          bankName:      bankName.trim(),
          bankCode:      bankCode.trim(),
          iban:          ibanCleaned,
          accountName:   accountName.trim(),
          accountType,
          currency:      currency.trim().toUpperCase().slice(0, 3),
          isWpsAccount,
          effectiveFrom,
        })
        toast({
          title: locale === 'ar' ? 'تم حفظ التفاصيل المصرفية' : 'Bank details saved',
          description: locale === 'ar'
            ? `مُشفّرة (AES-256-GCM). أُغلق السجل الأساسي السابق بتاريخ ${
                new Date(new Date(effectiveFrom).getTime() - 86_400_000).toISOString().slice(0, 10)
              }.`
            : `Encrypted (AES-256-GCM). Previous primary record closed on ${
                new Date(new Date(effectiveFrom).getTime() - 86_400_000).toISOString().slice(0, 10)
              }.`,
        })
        router.refresh()
        // Soft-reset so a follow-up edit can be made.
        setIban('')
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الحفظ' : 'Save failed')
        toast({ title: locale === 'ar' ? 'تعذّر الحفظ' : 'Could not save', description: message, variant: 'destructive' })
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

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'إضافة سجل جديد' : 'Add new record'}</h3></div>
      <div style={{ padding: '16px 20px' }}>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="bankName" label={locale === 'ar' ? 'اسم البنك' : 'Bank name'} required error={errors['bankName']}>
              <Input id="bankName" required maxLength={200}
                value={bankName} onChange={e => setBankName(e.target.value)}
                placeholder="Emirates NBD" disabled={pending} />
            </Field>
            <Field id="bankCode" label={locale === 'ar' ? 'رمز البنك' : 'Bank code'} required error={errors['bankCode']}>
              <Input id="bankCode" required maxLength={20}
                value={bankCode} onChange={e => setBankCode(e.target.value)}
                placeholder="EBILAEAD" disabled={pending} />
            </Field>
          </div>

          <Field id="iban" label="IBAN" required
            error={errors['iban'] || (ibanShowError ? (locale === 'ar' ? 'BR-WPS-004: يجب أن يكون IBAN الإماراتي AE + 21 رقماً (23 خانة)' : 'BR-WPS-004: UAE IBAN must be AE + 21 digits (23 chars)') : undefined)}
            help={!errors['iban'] && !ibanShowError
              ? (locale === 'ar' ? 'AE + 21 رقماً — مُشفّر بـ AES-256-GCM قبل الإدراج.' : 'AE + 21 digits — encrypted with AES-256-GCM before INSERT.')
              : undefined}>
            <Input id="iban" required className="font-mono uppercase tracking-wider"
              value={iban}
              onChange={e => setIban(e.target.value.toUpperCase())}
              placeholder="AE070331234567890123456" disabled={pending} />
          </Field>

          <Field id="accountName" label={locale === 'ar' ? 'اسم صاحب الحساب' : 'Account holder name'} required error={errors['accountName']}>
            <Input id="accountName" required maxLength={200}
              value={accountName} onChange={e => setAccountName(e.target.value)}
              disabled={pending} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="accountType" label={locale === 'ar' ? 'نوع الحساب' : 'Account type'}>
              <Select value={accountType}
                onValueChange={v => setAccountType(v as AccountType)}
                disabled={pending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CURRENT">{locale === 'ar' ? 'جاري' : 'Current'}</SelectItem>
                  <SelectItem value="SAVINGS">{locale === 'ar' ? 'توفير' : 'Savings'}</SelectItem>
                  <SelectItem value="SALARY">{locale === 'ar' ? 'راتب' : 'Salary'}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="currency" label={locale === 'ar' ? 'العملة (ISO-3)' : 'Currency (ISO-3)'}>
              <Input id="currency" maxLength={3} className="uppercase"
                value={currency}
                onChange={e => setCurrency(e.target.value.toUpperCase())}
                disabled={pending} />
            </Field>
            <HijriDatePicker
              label={locale === 'ar' ? 'سارٍ من' : 'Effective from'}
              required
              value={effectiveFrom}
              onChange={setEffectiveFrom}
              disabled={pending}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={isWpsAccount}
              onChange={e => setIsWpsAccount(e.target.checked)} disabled={pending}
              className="h-4 w-4 rounded border-border accent-accent" />
            {locale === 'ar' ? 'حساب مؤهّل لنظام حماية الأجور (BR-WPS-001 — مطلوب لصرف الراتب عبر ملف WPS SIF)' : 'WPS-eligible account (BR-WPS-001 — required for salary disbursement via WPS SIF)'}
          </label>

          <div className="flex items-center justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ التفاصيل المصرفية' : 'Save bank details')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  id, label, required, error, help, children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-ink-2">
        {label}{required && <span className="ms-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error
        ? <p className="text-xs text-destructive">{error}</p>
        : help ? <p className="text-xs text-ink-3">{help}</p> : null}
    </div>
  )
}
