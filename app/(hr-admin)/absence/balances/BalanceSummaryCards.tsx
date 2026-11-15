import Link from 'next/link'

/**
 * Phase 1 — Leave Balances summary cards (server presentational component).
 *
 * All figures are DAY COUNTS, not monetary values (spec §4). Cards reflect the
 * currently-filtered set. "Expiring Leave Days" and "Negative Balances" are
 * clickable → apply the matching Balance Status filter. Responsive wrap:
 * single row → 2-up (tablet) → 1-up (mobile), never horizontal scroll.
 */
export interface SummaryCardData {
  totalEmployees: number
  availableDays:  number
  expiringDays:   number
  negativeCount:  number
  pendingImpact:  number
}

function fmt(n: number): string {
  // Trim trailing zeros on day counts (e.g. 12.50 → 12.5, 12.00 → 12).
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
}

function statusHref(base: string, status: string): string {
  const sp = new URLSearchParams(base)
  sp.set('status', status)
  sp.delete('expanded')
  return `/absence/balances?${sp.toString()}`
}

export function BalanceSummaryCards({
  cards, baseParams,
}: {
  cards: SummaryCardData
  baseParams: string
}) {
  const items: Array<{
    key: string; label: string; value: string; hint?: string; href?: string; tone?: 'warn' | 'danger'
  }> = [
    { key: 'emp', label: 'Total Employees', value: fmt(cards.totalEmployees), hint: 'in filtered set' },
    { key: 'avail', label: 'Total Available Leave Days', value: fmt(cards.availableDays), hint: 'days, not value' },
    { key: 'expiring', label: 'Expiring Leave Days', value: fmt(cards.expiringDays), hint: 'within 90 days', href: statusHref(baseParams, 'expiring'), tone: 'warn' },
    { key: 'neg', label: 'Negative Balances', value: fmt(cards.negativeCount), hint: 'rows below zero', href: statusHref(baseParams, 'negative'), tone: 'danger' },
    { key: 'pending', label: 'Pending Leave Impact', value: fmt(cards.pendingImpact), hint: 'pending days' },
  ]

  return (
    <div
      data-responsive-grid="true" style={{
        display: 'grid', gap: 12, marginBottom: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      }}
    >
      {items.map(it => {
        const accent =
          it.tone === 'danger' ? 'var(--status-rejected-fg)'
          : it.tone === 'warn' ? 'var(--status-pending-fg)'
          : 'var(--ink-1)'
        const body = (
          <div
            style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '14px 16px', height: '100%',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}
          >
            <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink-3)' }}>
              {it.label}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 600, color: accent, lineHeight: 1 }}>
              {it.value}
            </span>
            {it.hint && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{it.hint}</span>}
          </div>
        )
        return it.href ? (
          <Link key={it.key} href={it.href} style={{ textDecoration: 'none' }}>{body}</Link>
        ) : (
          <div key={it.key}>{body}</div>
        )
      })}
    </div>
  )
}
