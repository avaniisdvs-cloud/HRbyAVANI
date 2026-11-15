import { AlertTriangle, Clock, FileText } from 'lucide-react'
import { isoDateDiff } from '@/lib/date-utils'

interface ExpiringDoc {
  id: string
  documentType:   string
  documentNumber: string | null
  expiryDate:     string | null
  documentStatus: string | null
}

export function ExpiringDocsList({ docs, today, locale = 'en' }: { docs: ExpiringDoc[]; today: string; locale?: string }) {
  if (docs.length === 0) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-border bg-card px-5 py-6 text-sm text-ink-3">
        {locale === 'ar' ? 'لا توجد وثائق تنتهي خلال الـ 90 يومًا القادمة.' : 'No documents expiring in the next 90 days.'}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
      {docs.map(d => {
        const daysLeft = isoDateDiff(today, d.expiryDate ?? today)
        const isUrgent = daysLeft <= 14
        const isSoon   = daysLeft <= 30
        const toneClass = isUrgent ? 'text-destructive' : isSoon ? 'text-accent-700' : 'text-ink-2'
        const Icon = isUrgent ? AlertTriangle : isSoon ? Clock : FileText
        return (
          <li key={d.id} className="flex items-center justify-between px-5 py-3 text-sm transition-colors hover:bg-surface">
            <div className="flex items-center gap-3">
              <Icon className={`h-4 w-4 shrink-0 ${toneClass}`} aria-hidden strokeWidth={1.75} />
              <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 font-mono text-xs font-medium text-ink-2 ring-1 ring-border">
                {d.documentType}
              </span>
              {d.documentNumber && (
                <span className="font-mono text-xs text-ink-3">{d.documentNumber}</span>
              )}
            </div>
            <div className={`flex items-center gap-2 font-mono text-xs ${toneClass}`}>
              <span>{d.expiryDate ?? '—'}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                isUrgent ? 'bg-status-rejected-bg text-status-rejected-fg'
                  : isSoon ? 'bg-accent-050 text-accent-700'
                  : 'bg-surface text-ink-3'
              }`}>
                {locale === 'ar' ? `${daysLeft} يوم` : `${daysLeft}d left`}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
