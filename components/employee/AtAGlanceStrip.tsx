'use client'

import { useLocale } from '@/components/providers/LocaleProvider'

interface AtAGlanceStripProps {
  annualRemaining: number | null
  pendingCount: number
  nextApprovedDate: string | null
}

export function AtAGlanceStrip({ annualRemaining, pendingCount, nextApprovedDate }: AtAGlanceStripProps) {
  const locale = useLocale()
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-2">
      <span>
        <span className="font-semibold text-ink-1">{annualRemaining ?? '—'}</span>
        {' '}{locale === 'ar' ? 'يوماً من الإجازة السنوية المتبقية' : 'days annual leave remaining'}
      </span>

      <span className="hidden h-4 w-px bg-border sm:inline-block" aria-hidden />

      <span>
        <span className="font-semibold text-ink-1">{pendingCount}</span>
        {' '}{locale === 'ar'
          ? (pendingCount === 1 ? 'طلب قيد الموافقة' : 'طلبات قيد الموافقة')
          : <>{pendingCount === 1 ? 'request' : 'requests'} pending approval</>}
      </span>

      <span className="hidden h-4 w-px bg-border sm:inline-block" aria-hidden />

      <span>
        {nextApprovedDate ? (
          <>
            {locale === 'ar' ? 'الإجازة المعتمدة القادمة:' : 'Next approved:'}{' '}
            <span className="font-semibold text-ink-1 font-mono text-xs">{nextApprovedDate}</span>
          </>
        ) : (
          <span className="text-ink-3">{locale === 'ar' ? 'لا توجد إجازة معتمدة قادمة' : 'No upcoming approved leave'}</span>
        )}
      </span>
    </div>
  )
}
