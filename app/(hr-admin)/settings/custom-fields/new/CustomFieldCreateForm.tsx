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
import { tk } from '@/lib/i18n-messages'
import { createCustomField } from '@/modules/config'

const OBJECT_TYPES  = ['persons', 'worker_assignments', 'positions', 'departments']
const DATA_TYPES    = ['TEXT', 'NUMBER', 'DATE', 'CURRENCY', 'CHECKBOX', 'PICKLIST', 'LONG_TEXT', 'URL']
const SECTION_CODES = ['PERSONAL', 'EMPLOYMENT', 'COMPENSATION', 'DOCUMENTS', 'CUSTOM']

export function CustomFieldCreateForm({ legalEntityId }: { legalEntityId: string }) {
  const [objectType,   setObjectType]   = useState('persons')
  const [apiName,      setApiName]      = useState('')
  const [labelEn,      setLabelEn]      = useState('')
  const [labelAr,      setLabelAr]      = useState('')
  const [dataType,     setDataType]     = useState('TEXT')
  const [sectionCode,  setSectionCode]  = useState('CUSTOM')
  const [displayOrder, setDisplayOrder] = useState(0)
  const [isRequired,   setIsRequired]   = useState(false)
  const [isSearchable, setIsSearchable] = useState(false)

  const [pending, start] = useTransition()
  const { toast } = useToast()
  const router    = useRouter()
  const locale    = useLocale()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    start(async () => {
      try {
        await createCustomField({
          legalEntityId,
          objectType,
          apiName:      apiName.trim().toLowerCase().replace(/\s+/g, '_'),
          labelEn:      labelEn.trim(),
          labelAr:      labelAr.trim() || undefined,
          dataType:     dataType as Parameters<typeof createCustomField>[0]['dataType'],
          sectionCode,
          displayOrder,
          isRequired,
          isSearchable,
          isEncrypted:  false,
        })
        toast({ title: locale === 'ar' ? 'تم إنشاء الحقل المخصص' : 'Custom field created', description: apiName })
        router.push('/settings/custom-fields')
      } catch (err: unknown) {
        toast({
          title: locale === 'ar' ? 'تعذّر إنشاء الحقل' : 'Could not create field',
          description: err instanceof Error ? err.message : (locale === 'ar' ? 'حدث خطأ ما. يرجى المحاولة مرة أخرى أو الاتصال بدعم تقنية المعلومات.' : 'Something went wrong. Please try again or contact IT support.'),
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'نوع الكائن' : 'Object type'}<span className="text-destructive ms-0.5">*</span></Label>
          <Select value={objectType} onValueChange={setObjectType} disabled={pending}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OBJECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'نوع البيانات' : 'Data type'}<span className="text-destructive ms-0.5">*</span></Label>
          <Select value={dataType} onValueChange={setDataType} disabled={pending}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATA_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="apiName" className="text-xs font-medium text-ink-2">
          {locale === 'ar' ? 'اسم واجهة البرمجة' : 'API name'}<span className="text-destructive ms-0.5">*</span>
          <span className="ms-2 text-xs text-ink-3">{locale === 'ar' ? 'lowercase_snake_case — يُستخدم كمفتاح JSONB' : 'lowercase_snake_case — used as JSONB key'}</span>
        </Label>
        <Input id="apiName" required value={apiName} onChange={e => setApiName(e.target.value)}
          placeholder="custom_field_name" pattern="[a-z_]+" disabled={pending} className="font-mono" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="labelEn" className="text-xs font-medium text-ink-2">
            {locale === 'ar' ? 'التسمية (إنجليزي)' : 'Label EN'}<span className="text-destructive ms-0.5">*</span>
          </Label>
          <Input id="labelEn" required value={labelEn} onChange={e => setLabelEn(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="labelAr" className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'التسمية (عربي)' : 'Label AR'}</Label>
          <Input id="labelAr" dir="rtl" lang="ar" value={labelAr} onChange={e => setLabelAr(e.target.value)} disabled={pending} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'القسم' : 'Section'}</Label>
          <Select value={sectionCode} onValueChange={setSectionCode} disabled={pending}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SECTION_CODES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="displayOrder" className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'ترتيب العرض' : 'Display order'}</Label>
          <Input id="displayOrder" type="number" min={0} value={displayOrder}
            onChange={e => setDisplayOrder(Number(e.target.value))} disabled={pending} />
        </div>
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={isRequired} onChange={e => setIsRequired(e.target.checked)}
            disabled={pending} className="h-4 w-4 accent-accent" />
          {tk(locale, 'common.required')}
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={isSearchable} onChange={e => setIsSearchable(e.target.checked)}
            disabled={pending} className="h-4 w-4 accent-accent" />
          {locale === 'ar' ? 'قابل للبحث' : 'Searchable'}
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push('/settings/custom-fields')} disabled={pending}>
          {tk(locale, 'common.cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (locale === 'ar' ? 'جارٍ الإنشاء…' : 'Creating…') : (locale === 'ar' ? 'إنشاء الحقل' : 'Create field')}
        </Button>
      </div>
    </form>
  )
}
