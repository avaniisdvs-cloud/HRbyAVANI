'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import { updateNotificationTemplate } from '@/modules/config'
import type { NotificationTemplateRow } from '@/modules/config'

interface Props {
  template: NotificationTemplateRow
}

export function NotificationEditForm({ template }: Props) {
  const [open,      setOpen]      = useState(false)
  const [subjectEn, setSubjectEn] = useState(template.subjectEn ?? '')
  const [subjectAr, setSubjectAr] = useState(template.subjectAr ?? '')
  const [bodyEn,    setBodyEn]    = useState(template.bodyEn)
  const [bodyAr,    setBodyAr]    = useState(template.bodyAr ?? '')

  const [pending, start] = useTransition()
  const { toast } = useToast()
  const locale = useLocale()

  function onSave() {
    start(async () => {
      try {
        await updateNotificationTemplate(template.id, {
          subjectEn: subjectEn || undefined,
          subjectAr: subjectAr || undefined,
          bodyEn,
          bodyAr:    bodyAr || undefined,
        })
        toast({ title: locale === 'ar' ? 'تم حفظ القالب' : 'Template saved', description: template.templateCode })
        setOpen(false)
      } catch (err: unknown) {
        toast({
          title: locale === 'ar' ? 'فشل الحفظ' : 'Save failed',
          description: err instanceof Error ? err.message : (locale === 'ar' ? 'حدث خطأ ما. يرجى المحاولة مرة أخرى أو الاتصال بدعم تقنية المعلومات.' : 'Something went wrong. Please try again or contact IT support.'),
          variant: 'destructive',
        })
      }
    })
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="text-xs">
        {tk(locale, 'common.edit')}
      </Button>
    )
  }

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'الموضوع (إنجليزي)' : 'Subject EN'}</Label>
          <Input value={subjectEn} onChange={e => setSubjectEn(e.target.value)} disabled={pending} className="text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'الموضوع (عربي)' : 'Subject AR'}</Label>
          <Input dir="rtl" lang="ar" value={subjectAr} onChange={e => setSubjectAr(e.target.value)} disabled={pending} className="text-xs" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'النص (إنجليزي)' : 'Body EN'}<span className="text-destructive ms-0.5">*</span></Label>
        <Textarea rows={5} value={bodyEn} onChange={e => setBodyEn(e.target.value)} disabled={pending} className="font-mono text-xs" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'النص (عربي)' : 'Body AR'}</Label>
        <Textarea dir="rtl" lang="ar" rows={5} value={bodyAr} onChange={e => setBodyAr(e.target.value)} disabled={pending} className="font-mono text-xs" />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={pending} className="text-xs">{tk(locale, 'common.cancel')}</Button>
        <Button size="sm" onClick={onSave} disabled={pending} className="text-xs">
          {pending ? tk(locale, 'common.saving') : (locale === 'ar' ? 'حفظ القالب' : 'Save template')}
        </Button>
      </div>
    </div>
  )
}
