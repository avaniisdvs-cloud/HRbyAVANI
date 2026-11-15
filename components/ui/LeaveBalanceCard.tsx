interface LeaveBalanceCardProps {
  label: string
  labelAr?: string
  remaining: number | string | null
  total: number | string | null
}

export function LeaveBalanceCard({ label, labelAr, remaining, total }: LeaveBalanceCardProps) {
  const rem = remaining !== null && remaining !== undefined ? Math.floor(Number(remaining)) : '—'
  const tot = total !== null && total !== undefined && Number(total) > 0 ? Math.floor(Number(total)) : null

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-[var(--shadow-sm)]">
      <div className="absolute inset-y-0 left-0 w-[3px] rounded-r-sm bg-accent" />
      <div className="px-5 py-4 pl-6">
        <p className="font-mono text-xs font-semibold uppercase leading-none tracking-[1.2px] text-ink-3">
          {label}
        </p>
        {labelAr && (
          <p className="mt-0.5 text-xs text-ink-4" dir="rtl" lang="ar">{labelAr}</p>
        )}
        <p className="mt-3 font-serif text-[32px] font-medium leading-none tracking-[-0.4px] text-ink-1">
          {rem}
        </p>
        {tot !== null && (
          <p className="mt-1.5 text-xs text-ink-4">of {tot} days</p>
        )}
      </div>
    </div>
  )
}
