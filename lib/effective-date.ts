/**
 * Effective-date query helpers.
 *
 * Avaniis HR uses point-in-time data everywhere — salary elements, assignments,
 * leave balances etc. are ALL effective-dated. These helpers build the WHERE
 * clauses to retrieve the record(s) active on a given date.
 *
 * Convention:
 *   effectiveStartDate <= asOf AND effectiveEndDate >= asOf
 *
 * During Phase 1 migration, NULL is still accepted as legacy open-ended data,
 * but new open-ended rows use EFFECTIVE_END_OF_TIME.
 */
import { and, isNull, lte, gte, or, desc, SQL } from 'drizzle-orm'
import { AnyColumn } from 'drizzle-orm'

export type DateParam = Date | string

export const EFFECTIVE_END_OF_TIME = '9999-12-31' as const

export function normalizeEffectiveEndDate(value?: string | null): string {
  return value || EFFECTIVE_END_OF_TIME
}

export function isOpenEndedEffectiveDate(value?: string | null): boolean {
  return value == null || value === EFFECTIVE_END_OF_TIME
}

function toIsoDate(d: DateParam): string {
  return d instanceof Date ? d.toISOString().split('T')[0] : d
}

/**
 * Returns a Drizzle SQL condition for "record is effective on asOf".
 *
 * @param startCol  Column for effective start date (lte asOf)
 * @param endCol    Column for effective end date   (sentinel = open-ended; legacy NULL also accepted)
 * @param asOf      Target date — defaults to today
 */
export function effectiveOn(
  startCol: AnyColumn,
  endCol:   AnyColumn,
  asOf:     DateParam = new Date(),
): SQL {
  const dt = toIsoDate(asOf)
  return and(
    lte(startCol, dt),
    or(isNull(endCol), gte(endCol, dt)),
  )!
}

/**
 * Returns an SQL condition for records effective across [fromDate, toDate].
 * Useful for absence period overlap checks.
 */
export function overlapsRange(
  startCol: AnyColumn,
  endCol:   AnyColumn,
  fromDate: DateParam,
  toDate:   DateParam,
): SQL {
  const from = toIsoDate(fromDate)
  const to   = toIsoDate(toDate)
  // Overlap condition: start <= rangeEnd AND end >= rangeStart; legacy NULL remains accepted during migration.
  return and(
    lte(startCol, to),
    or(isNull(endCol), gte(endCol, from)),
  )!
}

/** Returns today's date as YYYY-MM-DD string (Dubai/UTC+4 aware). */
export function todayUae(): string {
  return new Date(
    Date.now() + 4 * 60 * 60 * 1000, // UTC+4
  ).toISOString().split('T')[0]
}

/** Returns true if dateA is strictly before dateB (both YYYY-MM-DD or Date). */
export function isBefore(a: DateParam, b: DateParam): boolean {
  return toIsoDate(a) < toIsoDate(b)
}

/** Returns the number of calendar days between two dates (absolute). */
export function daysBetween(a: DateParam, b: DateParam): number {
  const msPerDay = 86_400_000
  const da = new Date(toIsoDate(a)).getTime()
  const db = new Date(toIsoDate(b)).getTime()
  return Math.abs(Math.round((db - da) / msPerDay))
}

/** Adds N calendar days to a date, returns YYYY-MM-DD. */
export function addDays(date: DateParam, days: number): string {
  const d = new Date(toIsoDate(date))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/** Adds N months to a date, returns YYYY-MM-DD. */
export function addMonths(date: DateParam, months: number): string {
  const d = new Date(toIsoDate(date))
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().split('T')[0]
}

/**
 * Returns Drizzle ORDER BY and LIMIT clauses for resolving the latest row when
 * two or more rows share the same effectiveStartDate (same-day multiple changes).
 * Use as the final ORDER BY on any point-in-time query that includes effectiveSequence.
 *
 * Pattern:
 *   .where(effectiveOn(start, end, asOf))
 *   .orderBy(...effectiveOnLatestOrder(startCol, seqCol))
 *   .limit(1)
 */
export function effectiveOnLatestOrder(
  startCol: AnyColumn,
  seqCol:   AnyColumn,
): [ReturnType<typeof desc>, ReturnType<typeof desc>] {
  return [desc(startCol), desc(seqCol)]
}

/** Returns true when effectiveDate is strictly after today (UAE UTC+4). */
export function isFutureDated(effectiveDate: DateParam): boolean {
  return toIsoDate(effectiveDate) > todayUae()
}

/**
 * Returns the next effective_sequence value for a given person + table on a
 * specific effectiveStartDate. Pass a raw sql count from the caller's tx.
 * Increment this result by 1 before inserting the new row.
 */
export function nextEffectiveSequence(existingCount: number): number {
  return existingCount + 1
}

/**
 * Calculates complete years of service between hireDate and asOf.
 * Accounts for service gaps (unpaid leave days excluded via netServiceDays).
 */
export function yearsOfService(
  hireDate:        DateParam,
  asOf:            DateParam = new Date(),
  totalUnpaidDays: number    = 0,
): number {
  const totalDays = daysBetween(hireDate, asOf)
  const netDays   = Math.max(0, totalDays - totalUnpaidDays)
  return netDays / 365.25
}
