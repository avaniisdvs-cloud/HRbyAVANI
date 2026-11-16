import { SectionTitle } from '@/components/ui/typography'
import Link from 'next/link'

interface SectionHeaderProps {
  title: string
  titleAr?: string
  action?: { label: string; href: string }
  badge?: number
}

export function SectionHeader({ title, titleAr, action, badge }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle className="text-[length:var(--text-section-title)] font-semibold leading-snug text-ink-1">{title}</SectionTitle>
        {titleAr && (
          <span className="text-sm text-ink-3" dir="rtl" lang="ar">{titleAr}</span>
        )}
        {badge !== undefined && badge > 0 && (
          <span className="inline-flex items-center rounded-full bg-status-pending-bg px-2 py-0.5 text-xs font-semibold text-status-pending-fg">
            {badge}
          </span>
        )}
      </div>
      {action && (
        <Link
          href={action.href}
          className="shrink-0 rounded-[var(--radius)] bg-accent px-[18px] py-[10px] text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-700"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
