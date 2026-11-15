'use client'
import type { ReactNode } from 'react'
import { useLocale } from '@/components/providers/LocaleProvider'

export function TableScrollRegion({ children }: { children: ReactNode }) {
  const locale = useLocale()
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={locale === 'ar' ? 'جدول بيانات قابل للتمرير' : 'Scrollable data table'}>{children}</div>
}
