/**
 * AVANIIS HR — Workflow SLA Calculator
 * UAE working-hours SLA: Sun–Thu 09:00–18:00 GST (UTC+4).
 * Ramadan reduced hours apply when the calendar has ramadan dates configured.
 * Public holidays from the public_holidays table are skipped.
 */
import { db } from '@/lib/db'
import { workflowSlaCalendars } from '@/drizzle/schema'
import { publicHolidays } from '@/drizzle/schema'
import { eq, and, lte, gte, isNull, or } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'

// ─── Internal types ──────────────────────────────────────────────────────────

interface SlaCalendarConfig {
  workingDays: number[]      // ISO day-of-week: 0=Sun, 1=Mon, ..., 6=Sat
  timezone: string
  dayStartTime: string       // 'HH:MM'
  dayEndTime: string         // 'HH:MM'
  ramadanStartTime?: string | null
  ramadanEndTime?: string | null
  ramadanStartDate?: string | null
  ramadanEndDate?: string | null
}

interface HolidayRange {
  start: Date
  end: Date
}

// ─── Time parsing helpers ────────────────────────────────────────────────────

function parseTime(hhmm: string): { hours: number; minutes: number } {
  const [h, m] = hhmm.split(':').map(Number)
  return { hours: h, minutes: m }
}

function minutesFromMidnight(hhmm: string): number {
  const { hours, minutes } = parseTime(hhmm)
  return hours * 60 + minutes
}

// ─── Date in UAE timezone ────────────────────────────────────────────────────

function toUAEDate(utcMs: number): Date {
  // UTC+4 = +240 minutes
  return new Date(utcMs + 4 * 60 * 60 * 1000)
}

function uaeDayOfWeek(utcMs: number): number {
  return toUAEDate(utcMs).getUTCDay()  // 0=Sun
}

function uaeDateString(utcMs: number): string {
  const d = toUAEDate(utcMs)
  return d.toISOString().slice(0, 10)
}

function minutesIntoUAEDay(utcMs: number): number {
  const d = toUAEDate(utcMs)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

// Midnight UTC+4 for the day containing utcMs
function uaeMidnightUtcMs(utcMs: number): number {
  const d = toUAEDate(utcMs)
  const midnightUAE = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return midnightUAE - 4 * 60 * 60 * 1000
}

// Advance to next calendar day midnight (UTC)
function nextDayMidnightUtcMs(utcMs: number): number {
  return uaeMidnightUtcMs(utcMs) + 24 * 60 * 60 * 1000
}

// ─── Holiday check ────────────────────────────────────────────────────────────

function isHoliday(dateStr: string, holidays: HolidayRange[]): boolean {
  const d = new Date(dateStr + 'T00:00:00Z').getTime()
  return holidays.some(h => d >= h.start.getTime() && d <= h.end.getTime())
}

// ─── Ramadan check ────────────────────────────────────────────────────────────

function isRamadan(dateStr: string, cal: SlaCalendarConfig): boolean {
  if (!cal.ramadanStartDate || !cal.ramadanEndDate) return false
  return dateStr >= cal.ramadanStartDate && dateStr <= cal.ramadanEndDate
}

// ─── Core SLA deadline calculator ────────────────────────────────────────────

/**
 * Calculate the SLA deadline by advancing `slaWorkingHours` of working time
 * from `fromUtcMs`, respecting the calendar's working days/hours and
 * skipping public holidays.
 *
 * Returns the deadline as a UTC millisecond timestamp.
 */
function calculateDeadlineFromMs(
  fromUtcMs: number,
  slaWorkingHours: number,
  cal: SlaCalendarConfig,
  holidays: HolidayRange[],
): number {
  let remainingMinutes = slaWorkingHours * 60
  let cursor = fromUtcMs

  // Cap iterations to prevent infinite loops (5 years of working days)
  let maxIterations = 5 * 260

  while (remainingMinutes > 0 && maxIterations-- > 0) {
    const dow = uaeDayOfWeek(cursor)
    const dateStr = uaeDateString(cursor)

    if (!cal.workingDays.includes(dow) || isHoliday(dateStr, holidays)) {
      // Non-working day: jump to next day's start
      cursor = nextDayMidnightUtcMs(cursor)
      continue
    }

    const ramadan = isRamadan(dateStr, cal)
    const startStr = ramadan && cal.ramadanStartTime ? cal.ramadanStartTime : cal.dayStartTime
    const endStr   = ramadan && cal.ramadanEndTime   ? cal.ramadanEndTime   : cal.dayEndTime

    const dayStartMin = minutesFromMidnight(startStr)
    const dayEndMin   = minutesFromMidnight(endStr)
    const workMinutesPerDay = dayEndMin - dayStartMin

    const cursorMinutes = minutesIntoUAEDay(cursor)
    const dayMidnightMs = uaeMidnightUtcMs(cursor)

    // If cursor is before day start, jump to day start
    if (cursorMinutes < dayStartMin) {
      cursor = dayMidnightMs + (dayStartMin - 4 * 60) * 60 * 1000
      // Recalculate: cursor is now at day start in UTC
      cursor = uaeMidnightUtcMs(fromUtcMs) + dayStartMin * 60 * 1000 - 4 * 60 * 60 * 1000
      // Actually recompute properly:
      cursor = dayMidnightMs + dayStartMin * 60 * 1000
      continue
    }

    // If cursor is at or after day end, jump to next day
    if (cursorMinutes >= dayEndMin) {
      cursor = nextDayMidnightUtcMs(cursor)
      continue
    }

    // Working time remaining in this day
    const minutesLeftToday = dayEndMin - cursorMinutes

    if (remainingMinutes <= minutesLeftToday) {
      // Deadline falls within this working day
      cursor = cursor + remainingMinutes * 60 * 1000
      remainingMinutes = 0
    } else {
      // Consume the rest of this working day
      remainingMinutes -= minutesLeftToday
      cursor = nextDayMidnightUtcMs(cursor)
    }
  }

  return cursor
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Load holidays for the legal entity within the next 2 years (covers any SLA window).
 */
async function loadHolidays(legalEntityId: string): Promise<HolidayRange[]> {
  const today = new Date()
  const futureDate = new Date(today.getFullYear() + 2, 11, 31)

  const rows = await db
    .select({
      holidayDate: publicHolidays.holidayDate,
      endDate: publicHolidays.endDate,
    })
    .from(publicHolidays)
    .where(
      and(
        eq(publicHolidays.tenantId, TENANT_ID),
        or(
          isNull(publicHolidays.legalEntityId),
          eq(publicHolidays.legalEntityId, legalEntityId),
        ),
        gte(publicHolidays.holidayDate, today.toISOString().slice(0, 10)),
        lte(publicHolidays.holidayDate, futureDate.toISOString().slice(0, 10)),
      ),
    )

  return rows.map(r => ({
    start: new Date(r.holidayDate + 'T00:00:00Z'),
    end:   new Date((r.endDate ?? r.holidayDate) + 'T23:59:59Z'),
  }))
}

/**
 * Load the default SLA calendar, or a specific one by ID.
 */
async function loadCalendar(calendarId?: string | null): Promise<SlaCalendarConfig | null> {
  const rows = await db
    .select()
    .from(workflowSlaCalendars)
    .where(
      and(
        eq(workflowSlaCalendars.tenantId, TENANT_ID),
        eq(workflowSlaCalendars.isActive, true),
        calendarId
          ? eq(workflowSlaCalendars.id, calendarId)
          : eq(workflowSlaCalendars.isDefault, true),
      ),
    )
    .limit(1)

  if (!rows.length) return null

  const row = rows[0]
  return {
    workingDays:      row.workingDays as number[],
    timezone:         row.timezone,
    dayStartTime:     row.dayStartTime,
    dayEndTime:       row.dayEndTime,
    ramadanStartTime: row.ramadanStartTime,
    ramadanEndTime:   row.ramadanEndTime,
    ramadanStartDate: row.ramadanStartDate,
    ramadanEndDate:   row.ramadanEndDate,
  }
}

/**
 * Calculate SLA deadline in working hours from now (or from a given start time).
 * Falls back to wall-clock hours if no calendar is configured.
 */
export async function calculateSLADeadline(params: {
  slaWorkingHours: number
  legalEntityId: string
  calendarId?: string | null
  fromDate?: Date
}): Promise<Date> {
  const { slaWorkingHours, legalEntityId, calendarId, fromDate } = params
  const fromMs = (fromDate ?? new Date()).getTime()

  const [cal, holidays] = await Promise.all([
    loadCalendar(calendarId),
    loadHolidays(legalEntityId),
  ])

  if (!cal) {
    // Fallback: wall-clock hours
    return new Date(fromMs + slaWorkingHours * 60 * 60 * 1000)
  }

  const deadlineMs = calculateDeadlineFromMs(fromMs, slaWorkingHours, cal, holidays)
  return new Date(deadlineMs)
}

/**
 * Calculate how many working hours remain until a deadline.
 * Used for SLA progress bars and reminder scheduling.
 */
export async function calculateWorkingHoursRemaining(params: {
  deadline: Date
  legalEntityId: string
  calendarId?: string | null
}): Promise<number> {
  const { deadline, legalEntityId, calendarId } = params
  const now = new Date()

  if (deadline <= now) return 0

  const [cal, holidays] = await Promise.all([
    loadCalendar(calendarId),
    loadHolidays(legalEntityId),
  ])

  if (!cal) {
    return Math.max(0, (deadline.getTime() - now.getTime()) / (60 * 60 * 1000))
  }

  let workingMinutes = 0
  let cursor = now.getTime()
  const endMs = deadline.getTime()
  let maxIterations = 5 * 260

  while (cursor < endMs && maxIterations-- > 0) {
    const dow = uaeDayOfWeek(cursor)
    const dateStr = uaeDateString(cursor)

    if (!cal.workingDays.includes(dow) || isHoliday(dateStr, holidays)) {
      cursor = nextDayMidnightUtcMs(cursor)
      continue
    }

    const ramadan = isRamadan(dateStr, cal)
    const startStr = ramadan && cal.ramadanStartTime ? cal.ramadanStartTime : cal.dayStartTime
    const endStr   = ramadan && cal.ramadanEndTime   ? cal.ramadanEndTime   : cal.dayEndTime

    const dayStartMin = minutesFromMidnight(startStr)
    const dayEndMin   = minutesFromMidnight(endStr)
    const cursorMin = minutesIntoUAEDay(cursor)
    const dayMidnightMs = uaeMidnightUtcMs(cursor)

    if (cursorMin < dayStartMin) {
      cursor = dayMidnightMs + dayStartMin * 60 * 1000
      continue
    }

    if (cursorMin >= dayEndMin) {
      cursor = nextDayMidnightUtcMs(cursor)
      continue
    }

    const dayEndMs = dayMidnightMs + dayEndMin * 60 * 1000
    const segmentEndMs = Math.min(endMs, dayEndMs)
    workingMinutes += (segmentEndMs - cursor) / (60 * 1000)
    cursor = segmentEndMs

    if (cursor >= dayEndMs) {
      cursor = nextDayMidnightUtcMs(cursor)
    }
  }

  return workingMinutes / 60
}

/**
 * Returns true if the given deadline is in SLA breach (past deadline).
 */
export function isSLABreached(deadline: Date): boolean {
  return new Date() > deadline
}

/**
 * Returns true if reminder should be sent (within 25% of SLA window remaining).
 */
export async function shouldSendReminder(params: {
  startedAt: Date
  deadline: Date
  legalEntityId: string
  calendarId?: string | null
}): Promise<boolean> {
  const { startedAt, deadline, legalEntityId, calendarId } = params
  const remaining = await calculateWorkingHoursRemaining({ deadline, legalEntityId, calendarId })
  const total = (deadline.getTime() - startedAt.getTime()) / (60 * 60 * 1000)
  if (total <= 0) return false
  return (remaining / total) <= 0.25
}
