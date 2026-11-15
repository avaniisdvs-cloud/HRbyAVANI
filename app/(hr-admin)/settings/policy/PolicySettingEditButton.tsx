'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useLocale } from '@/components/providers/LocaleProvider'
import { updatePolicySetting } from '@/modules/config'

interface Props {
  settingId:    string
  legalEntityId: string
  settingKey:   string
  currentValue: string
  valueType:    string
}

export function PolicySettingEditButton({
  legalEntityId, settingKey, currentValue, valueType,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(currentValue)
  const [pending, start]      = useTransition()
  const { toast }             = useToast()
  const locale                = useLocale()

  function onSave() {
    start(async () => {
      try {
        await updatePolicySetting(legalEntityId, settingKey, value)
        toast({ title: locale === 'ar' ? 'تم حفظ الإعداد' : 'Setting saved', description: settingKey })
        setEditing(false)
      } catch (err: unknown) {
        toast({
          title: locale === 'ar' ? 'فشل الحفظ' : 'Save failed',
          description: err instanceof Error ? err.message : (locale === 'ar' ? 'حدث خطأ ما. يرجى المحاولة مرة أخرى أو الاتصال بدعم تقنية المعلومات.' : 'Something went wrong. Please try again or contact IT support.'),
          variant: 'destructive',
        })
      }
    })
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="rounded border border-border bg-surface px-2 py-0.5 font-mono text-xs text-ink-2 hover:border-accent hover:text-accent"
      >
        {currentValue}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type={valueType === 'NUMBER' ? 'number' : 'text'}
        value={value}
        onChange={e => setValue(e.target.value)}
        className="h-7 w-40 font-mono text-xs"
        autoFocus
        disabled={pending}
      />
      <Button size="sm" onClick={onSave} disabled={pending} className="h-7 px-2 text-xs">
        {pending ? '…' : 'Save'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setValue(currentValue) }} disabled={pending} className="h-7 px-2 text-xs">
        Cancel
      </Button>
    </div>
  )
}
