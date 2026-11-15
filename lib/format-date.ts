export type DateFormat = 'DD-Mon-YYYY' | 'MM/DD/YYYY'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatDate(
  date: Date | string | null | undefined,
  format: DateFormat = 'DD-Mon-YYYY',
): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  if (format === 'MM/DD/YYYY') {
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
  }
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`
}

export function formatAuditTimestamp(date: Date | string): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'

  const now       = new Date()
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  const timeStr = d.toLocaleTimeString('en-AE', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  if (target.getTime() === today.getTime())     return `Today ${timeStr}`
  if (target.getTime() === yesterday.getTime()) return `Yesterday ${timeStr}`
  return `${d.getDate()} ${d.toLocaleString('en-AE', { month: 'short' })} ${d.getFullYear()} · ${timeStr}`
}
