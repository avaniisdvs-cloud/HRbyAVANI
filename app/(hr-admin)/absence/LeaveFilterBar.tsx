'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { HijriDatePicker } from '@/components/forms/HijriDatePicker'

interface FilterState {
  status?:   string
  fromDate?: string
  toDate?:   string
}

interface LeaveFilterBarProps {
  filter: FilterState
  locale?: string
}

/**
 * S5-08 — Leave-requests filter bar.
 *
 * Pushes filter changes back into the URL so the Server Component re-fetches
 * with the new conditions. Stays bookmarkable and screen-reader friendly.
 */
export function LeaveFilterBar({ filter, locale = 'en' }: LeaveFilterBarProps) {
  const router   = useRouter()
  const params   = useSearchParams()
  const pathname = usePathname()

  const setParam = useCallback(
    (key: string, value: string | undefined) => {
      const sp = new URLSearchParams(params.toString())
      if (value && value !== '__any__') sp.set(key, value)
      else                              sp.delete(key)
      sp.delete('page')
      router.push(`${pathname}?${sp.toString()}`)
    },
    [params, router, pathname],
  )

  return (
    <div className="mb-4 grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'الحالة' : 'Status'}</Label>
        <Select value={filter.status ?? '__any__'} onValueChange={v => setParam('status', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">{locale === 'ar' ? 'أي حالة' : 'Any status'}</SelectItem>
            <SelectItem value="DRAFT">{locale === 'ar' ? 'مسودة' : 'Draft'}</SelectItem>
            <SelectItem value="PENDING">{locale === 'ar' ? 'قيد المراجعة' : 'Pending'}</SelectItem>
            <SelectItem value="APPROVED">{locale === 'ar' ? 'موافق' : 'Approved'}</SelectItem>
            <SelectItem value="REJECTED">{locale === 'ar' ? 'مرفوض' : 'Rejected'}</SelectItem>
            <SelectItem value="CANCELLED">{locale === 'ar' ? 'ملغى' : 'Cancelled'}</SelectItem>
            <SelectItem value="TAKEN">{locale === 'ar' ? 'مُستهلك' : 'Taken'}</SelectItem>
            <SelectItem value="RECALLED">{locale === 'ar' ? 'مُسترجع' : 'Recalled'}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <HijriDatePicker
        label={locale === 'ar' ? 'من تاريخ' : 'From date'}
        value={filter.fromDate ?? ''}
        onChange={v => setParam('fromDate', v || undefined)}
      />
      <HijriDatePicker
        label={locale === 'ar' ? 'إلى تاريخ' : 'To date'}
        value={filter.toDate ?? ''}
        onChange={v => setParam('toDate', v || undefined)}
      />
    </div>
  )
}
