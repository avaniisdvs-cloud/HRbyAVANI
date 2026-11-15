/**
 * Pure helpers used by the Create Person form (and testable in isolation).
 * All date arithmetic is timezone-safe: dates are parsed from ISO string
 * parts into the local calendar rather than from UTC midnight.
 */

/**
 * Days elapsed since `dateIso` (positive = past, negative = future).
 * Uses local midnight for both endpoints so the result matches what the
 * user sees in their browser — no UTC-midnight parse that could slip a day
 * in UTC+4.
 */
export function diffDays(dateIso: string, now: Date = new Date()): number {
  const todayMidnight = new Date(now)
  todayMidnight.setHours(0, 0, 0, 0)
  const [y, m, d] = dateIso.split('-').map(Number)
  const then = new Date(y, m - 1, d)   // local midnight of the target date
  return Math.floor((todayMidnight.getTime() - then.getTime()) / 86_400_000)
}

/**
 * Adds N calendar months to a YYYY-MM-DD string.
 * End-of-month dates are clamped to the last valid day of the target month
 * (e.g. Jan 31 + 1 month → Feb 28, not the JS-default March 3).
 */
export function addMonths(dateIso: string, months: number): string {
  const [y, m, d] = dateIso.split('-').map(Number)
  // Anchor to 1st of target month — always a valid date, avoids overflow.
  const anchor = new Date(y, m - 1 + months, 1)
  const ay = anchor.getFullYear()
  const am = anchor.getMonth()          // 0-indexed
  // Last day of target month: day-0 of the FOLLOWING month.
  const lastDay = new Date(ay, am + 1, 0).getDate()
  const day = Math.min(d, lastDay)
  return `${ay}-${String(am + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Counts UAE working days (Mon–Thu) between two ISO dates.
 * Start date is EXCLUSIVE, end date is INCLUSIVE.
 */
export function countUaeWorkingDays(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  const start = new Date(fy, fm - 1, fd)
  const end   = new Date(ty, tm - 1, td)
  let count = 0
  const cur = new Date(start)
  cur.setDate(cur.getDate() + 1)    // start is exclusive
  while (cur <= end) {
    const dow = cur.getDay()  // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
    if (dow >= 1 && dow <= 4) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

/**
 * Whole months remaining until `expiryIso` from `now` (negative = expired).
 * Parsed directly from string parts — no UTC-midnight TZ shift.
 */
export function monthsUntil(expiryIso: string, now: Date = new Date()): number {
  const [ey, em] = expiryIso.split('-').map(Number)
  return (ey - now.getFullYear()) * 12 + (em - 1 - now.getMonth())
}
