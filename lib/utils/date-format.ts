/**
 * AVANIIS HR — Canonical date formatters
 * All table date displays use these functions.
 * Standard: DD-Mon-YYYY  e.g. "06-May-2026"
 *
 * UAE TIMEZONE NOTE:
 * Dates stored as UTC in PostgreSQL.
 * When displaying, use local parts to avoid
 * off-by-one from UTC offset (UTC+4 in UAE).
 * We use getDate/getMonth/getFullYear (local)
 * NOT getUTCDate etc. to match UAE display.
 */

const MONTH_ABBR = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
] as const

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

/**
 * formatDMY — primary table date display
 * Input:  any date value
 * Output: "06-May-2026" or "—" if null/invalid
 */
export function formatDMY(
  value: Date | string | null | undefined
): string {
  const d = toDate(value)
  if (!d) return '—'
  const dd  = String(d.getDate()).padStart(2, '0')
  const mon = MONTH_ABBR[d.getMonth()]
  const yy  = d.getFullYear()
  return `${dd}-${mon}-${yy}`
}

/**
 * formatDMYTime — for audit trail, last login
 * Output: "06-May-2026 14:32" or "—"
 */
export function formatDMYTime(
  value: Date | string | null | undefined
): string {
  const d = toDate(value)
  if (!d) return '—'
  const dd  = String(d.getDate()).padStart(2, '0')
  const mon = MONTH_ABBR[d.getMonth()]
  const yy  = d.getFullYear()
  const hh  = String(d.getHours()).padStart(2, '0')
  const mm  = String(d.getMinutes()).padStart(2, '0')
  return `${dd}-${mon}-${yy} ${hh}:${mm}`
}

/**
 * formatRelative — for "Last Login" column
 * Today:      "Today 14:32"
 * Yesterday:  "Yesterday 09:15"
 * This year:  "06-May 14:32"
 * Older:      "06-May-2025"
 * Null:       "Never"
 */
export function formatRelative(
  value: Date | string | null | undefined
): string {
  const d = toDate(value)
  if (!d) return 'Never'
  const now   = new Date()
  const sod   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yest  = new Date(sod); yest.setDate(sod.getDate() - 1)
  const hh    = String(d.getHours()).padStart(2, '0')
  const mm    = String(d.getMinutes()).padStart(2, '0')
  const dd    = String(d.getDate()).padStart(2, '0')
  const mon   = MONTH_ABBR[d.getMonth()]
  if (d >= sod)  return `Today ${hh}:${mm}`
  if (d >= yest) return `Yesterday ${hh}:${mm}`
  if (d.getFullYear() === now.getFullYear())
    return `${dd}-${mon} ${hh}:${mm}`
  return `${dd}-${mon}-${d.getFullYear()}`
}

/**
 * dateToInputValue — for HTML <input type="date">
 * Always returns YYYY-MM-DD (required by browser)
 * Output: "2026-05-06" or "" if null
 */
export function dateToInputValue(
  value: Date | string | null | undefined
): string {
  const d = toDate(value)
  if (!d) return ''
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * isExpiringSoon — for document expiry alerts
 * Returns true if date is within N days from today
 */
export function isExpiringSoon(
  value: Date | string | null | undefined,
  withinDays = 90
): boolean {
  const d = toDate(value)
  if (!d) return false
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + withinDays)
  return d <= cutoff && d >= new Date()
}

/**
 * isExpired — returns true if date is in the past
 */
export function isExpired(
  value: Date | string | null | undefined
): boolean {
  const d = toDate(value)
  if (!d) return false
  return d < new Date()
}
