/**
 * S5-02 / S5-07 — Absence pure services.
 *
 * Pure helpers (sync where possible) that the Server Actions call. No
 * `'use server'` directive — exporting sync helpers from a `'use server'`
 * file is illegal in Next.js 14, and these helpers are also the test
 * surface for the leave-balance engine.
 *
 * Functions:
 *   • computeClosingBalance  — pure ledger arithmetic
 *   • monthsBetween          — service-months helper used by accrual + entitlement
 *   • computeMonthlyAccrualDays — BR-AL-001 / BR-AL-002 prorate helper
 *   • computeCarryForwardExpiry — BR-AL-003 expiry calc
 *   • accrueMonthlyBalance   — DB-aware (idempotent) balance accrual
 *   • enforceCarryForwardExpiry — DB-aware forfeiture sweep
 *   • computeRequestDurationDays — calendar-day count between two YYYY-MM-DD dates
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  absenceBalances, absenceTypes, persons, legalEntities, publicHolidays,
  workerAssignments,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { todayUae, daysBetween, addMonths, addDays } from '@/lib/effective-date'
import {
  resolveLeaveRuleSet,
  entitlementForService,
  type ResolvedLeaveRule,
} from '@/lib/leave-rule-resolver'
import { writeAuditLog } from '@/lib/audit'
import type { AccrualResult, CarryForwardExpiryResult } from './types'

// S5-Q8 — system-driven balance writes record this as `created_by` /
// `updated_by`. The `created_by` column has no `.references()` FK, so the
// zero-UUID is safe; matching the audit-row `actorId` keeps the trail
// consistent (system action, system actor on both sides).
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

// ── Pure helpers ──────────────────────────────────────────────────────────

export interface BalanceLedger {
  openingBalanceDays: number
  accruedDays:        number
  takenDays:          number
  pendingDays:        number
  adjustedDays:       number
  carriedForwardDays: number
  forfeitedDays:      number
}

/**
 * Closing balance per BR-AL-002 (calendar-day arithmetic):
 *   closing = opening + accrued + carriedForward + adjusted − taken − pending − forfeited
 *
 * `pendingDays` is reserved (not yet taken) — it must reduce the available
 * balance so back-to-back submissions don't double-spend.
 */
export function computeClosingBalance(led: BalanceLedger): number {
  const closing =
      led.openingBalanceDays
    + led.accruedDays
    + led.carriedForwardDays
    + led.adjustedDays
    - led.takenDays
    - led.pendingDays
    - led.forfeitedDays
  return Math.round(closing * 100) / 100
}

/** BR-AL-002 — calendar-month service span (a month = 30 days). */
export function monthsBetween(fromDate: string, toDate: string): number {
  // Anchor to UTC midnight so DST has no effect.
  const days = daysBetween(fromDate, toDate)
  return Math.floor(days / 30)
}

/**
 * BR-AL-001 — annual leave: 30 days/yr → 30 / 12 = 2.5 days per calendar month.
 * `daysEntitled` is the FULL ANNUAL entitlement. The MONTHLY accrual rate is
 * always `daysEntitled / 12`; `isProRated` is a flag tracked on the rule line
 * for downstream payroll consumption (it does not change the monthly rate
 * itself — pro-rating happens at hire-date / termination boundaries via
 * `computeRequestDurationDays`). Returns 0 when the employee is below the
 * rule's minServiceMonths floor.
 *
 * S5-Q7 fix: previously had a no-op `isProRated ? x / 12 : x / 12` ternary.
 */
export function computeMonthlyAccrualDays(
  rule:           Pick<ResolvedLeaveRule, 'accrualFrequency' | 'isProRated' | 'minServiceMonths'>,
  daysEntitled:   number,
  serviceMonths:  number,
): number {
  if (serviceMonths < rule.minServiceMonths) return 0
  if (rule.accrualFrequency !== 'MONTHLY') return 0
  // isProRated is informational here; both monthly callers want days/12.
  void rule.isProRated
  return Math.round((daysEntitled / 12) * 100) / 100
}

/**
 * BR-AL-003 — carry-forward postponement window.
 * Returns the `forfeit_after` date (YYYY-MM-DD) given the rule's
 * `carryForwardExpiryMonths`. `null` rule = no expiry → never forfeits.
 */
export function computeCarryForwardExpiry(
  asOf:                       string,
  carryForwardExpiryMonths:   number,
): string | null {
  if (carryForwardExpiryMonths <= 0) return null
  // Guard against nonsensical balance_year values (0, 9999, etc.) that would
  // produce meaningless expiry dates and trigger incorrect forfeiture sweeps.
  // Valid HR balance years are 2000–2100; anything outside skips the row.
  const year = parseInt(asOf.slice(0, 4), 10)
  if (isNaN(year) || year < 2000 || year > 2100) return null
  return addMonths(asOf, carryForwardExpiryMonths)
}

/** Calendar-day duration of an inclusive [start, end] range. */
export function computeRequestDurationDays(
  startDate: string,
  endDate:   string,
  isHalfDay: boolean,
): number {
  if (isHalfDay) return 0.5
  // BR-AL-002 — endDate must not precede startDate.
  if (endDate < startDate) {
    throw new Error(
      `endDate must be on or after startDate · يجب أن يكون تاريخ الانتهاء في أو بعد تاريخ البدء (got startDate=${startDate}, endDate=${endDate})`,
    )
  }
  return daysBetween(startDate, endDate) + 1
}

/**
 * C2 (approved) — split an inclusive leave range into per-calendar-year portions
 * so each year's balance is debited/credited only for the days that fall in it.
 *
 * Calendar-day basis (consistent with C2/D4). Returns one `{ year, days }` per
 * calendar year the range spans, where `days` is the inclusive calendar-day
 * count of that year's segment. Properties:
 *   • Same-year range            → a single portion (unchanged behavior).
 *   • Dec→Jan range              → two portions, one per year.
 *   • Leap years                 → handled by real-date arithmetic (daysBetween).
 *   • Half-day (single-day)      → a single portion carrying `quantity` (0.5).
 * The portions' `days` sum to the range's calendar duration.
 *
 * Pure: no DB, no payroll. `quantity` is used only for the same-year/half-day
 * portion value; multi-year portions are derived from the dates.
 */
export function splitLeaveRangeByCalendarYear(
  startDate: string,
  endDate:   string,
  quantity:  number,
  isHalfDay = false,
): Array<{ year: number; days: number }> {
  if (endDate < startDate) {
    throw new Error(
      `endDate must be on or after startDate (got startDate=${startDate}, endDate=${endDate})`,
    )
  }
  const startYear = Number(startDate.slice(0, 4))
  const endYear   = Number(endDate.slice(0, 4))

  // Half-day or any single-year range: one portion carrying the supplied quantity
  // (preserves 0.5 half-days and the exact stored durationDays).
  if (isHalfDay || startYear === endYear) {
    return [{ year: startYear, days: quantity }]
  }

  const portions: Array<{ year: number; days: number }> = []
  for (let year = startYear; year <= endYear; year++) {
    const segStart = year === startYear ? startDate : `${year}-01-01`
    const segEnd   = year === endYear   ? endDate   : `${year}-12-31`
    portions.push({ year, days: daysBetween(segStart, segEnd) + 1 })
  }
  return portions
}

// ── DB-aware engines ──────────────────────────────────────────────────────

interface PersonForAccrual {
  id:                  string
  legalEntityId:       string
  hireDate:            string
  nationalityCategory: string
  employmentType:      string
}

async function loadPersonForAccrual(
  personId: string,
): Promise<PersonForAccrual | null> {
  const [row] = await db
    .select({
      id:                  persons.id,
      legalEntityId:       persons.legalEntityId,
      hireDate:            persons.hireDate,
      nationalityCategory: persons.nationalityCategory,
      employmentType:      persons.employmentType,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
    .limit(1)
  return row ?? null
}

/**
 * Idempotent monthly accrual.
 *
 * Idempotency contract: if `last_accrual_date` is already on or after the
 * 1st of the month implied by `asOf`, the call is a no-op — useful when the
 * cron runs twice or the admin re-triggers a backfill manually.
 *
 * Hard Rule 1 — write path is wrapped in db.transaction with writeAuditLog.
 */
export async function accrueMonthlyBalance(
  personId:      string,
  absenceTypeId: string,
  asOf:          string = todayUae(),
): Promise<AccrualResult> {
  const person = await loadPersonForAccrual(personId)
  if (!person) {
    return {
      personId, absenceTypeId, balanceYear: Number(asOf.slice(0, 4)),
      monthAccruedFor: asOf.slice(0, 7) + '-01', daysAccrued: 0, newAccruedDays: 0,
      skipped: true, skipReason: 'person not found',
    }
  }

  const [type] = await db
    .select()
    .from(absenceTypes)
    .where(and(eq(absenceTypes.tenantId, TENANT_ID), eq(absenceTypes.id, absenceTypeId)))
    .limit(1)
  if (!type) {
    return {
      personId, absenceTypeId, balanceYear: Number(asOf.slice(0, 4)),
      monthAccruedFor: asOf.slice(0, 7) + '-01', daysAccrued: 0, newAccruedDays: 0,
      skipped: true, skipReason: 'absence type not found',
    }
  }

  const rule = await resolveLeaveRuleSet(personId, type.typeCode, asOf)
  if (!rule) {
    return {
      personId, absenceTypeId, balanceYear: Number(asOf.slice(0, 4)),
      monthAccruedFor: asOf.slice(0, 7) + '-01', daysAccrued: 0, newAccruedDays: 0,
      skipped: true, skipReason: `no rule for ${type.typeCode}`,
    }
  }

  // Annual / monthly accrual driven by the rule. ANNUAL rules accrue once
  // per balance_year via a separate path (handled here as a single yearly
  // top-up when last_accrual_date < Jan 1 of the year).
  const serviceMonths = monthsBetween(person.hireDate, asOf)
  const yearTier = entitlementForService(rule, serviceMonths)
  if (yearTier <= 0) {
    return {
      personId, absenceTypeId, balanceYear: Number(asOf.slice(0, 4)),
      monthAccruedFor: asOf.slice(0, 7) + '-01', daysAccrued: 0, newAccruedDays: 0,
      skipped: true, skipReason: 'serviceMonths below tier minimum',
    }
  }

  const balanceYear = Number(asOf.slice(0, 4))
  const monthAccruedFor = asOf.slice(0, 7) + '-01'

  // BR-AL-001 — calendar-month rate.
  const daysToAccrue =
    rule.accrualFrequency === 'MONTHLY'
      ? Math.round((yearTier / 12) * 100) / 100
      : rule.accrualFrequency === 'ANNUALLY'
        ? yearTier
        : 0
  if (daysToAccrue <= 0) {
    return {
      personId, absenceTypeId, balanceYear,
      monthAccruedFor, daysAccrued: 0, newAccruedDays: 0,
      skipped: true, skipReason: `accrualFrequency=${rule.accrualFrequency}`,
    }
  }

  // S5-Q6 fix: the balance-row lookup now lives INSIDE the tx so the
  // existence check + INSERT/UPDATE are atomic. Combined with the unique
  // index on (tenant_id, person_id, absence_type_id, balance_year) added
  // by migration 0006 (S5-Q3), concurrent accrual calls converge cleanly:
  // either both go through the UPDATE branch on the same row, or one
  // INSERT wins and the other rolls back via unique_violation.
  let newAccruedDays = 0
  let skippedAlreadyAccrued = false
  let existingAccruedDays = 0
  await db.transaction(async tx => {
    const [existing] = await tx
      .select()
      .from(absenceBalances)
      .where(
        and(
          eq(absenceBalances.tenantId, TENANT_ID),
          eq(absenceBalances.personId, personId),
          eq(absenceBalances.absenceTypeId, absenceTypeId),
          eq(absenceBalances.balanceYear, balanceYear),
        ),
      )
      .limit(1)

    // Idempotency: if last_accrual_date covers the month already, skip
    // both the write AND the audit row (no-op call).
    if (existing?.lastAccrualDate && existing.lastAccrualDate >= monthAccruedFor) {
      skippedAlreadyAccrued = true
      existingAccruedDays = Number(existing.accruedDays)
      return
    }

    if (existing) {
      const accrued = Number(existing.accruedDays) + daysToAccrue
      newAccruedDays = Math.round(accrued * 100) / 100
      const closing = computeClosingBalance({
        openingBalanceDays: Number(existing.openingBalanceDays),
        accruedDays:        newAccruedDays,
        takenDays:          Number(existing.takenDays),
        pendingDays:        Number(existing.pendingDays),
        adjustedDays:       Number(existing.adjustedDays),
        carriedForwardDays: Number(existing.carriedForwardDays),
        forfeitedDays:      Number(existing.forfeitedDays),
      })
      await tx
        .update(absenceBalances)
        .set({
          accruedDays:        String(newAccruedDays),
          closingBalanceDays: String(closing),
          lastAccrualDate:    monthAccruedFor,
          nextAccrualDate:    addMonths(monthAccruedFor, 1),
          updatedDate:        new Date(),
          lastUpdatedDate:    new Date(),
          updatedBy:          SYSTEM_ACTOR_ID,
          updatedByName:      'system: monthly accrual',
        })
        .where(eq(absenceBalances.id, existing.id))

      await writeAuditLog({
        actorId:       SYSTEM_ACTOR_ID,
        actorName:     'system: accrueMonthlyBalance',
        actorRole:     'SUPER_ADMIN',
        actorEntityId: person.legalEntityId,
        channel:       'SYSTEM',
        eventType:     'ABSENCE_BALANCE.ACCRUED',
        resourceType:  'absence_balances',
        resourceId:    existing.id,
        entityId:      person.legalEntityId,
        metadata: {
          personId, absenceTypeId, balanceYear, monthAccruedFor,
          daysAccrued: daysToAccrue,
          ruleSetCode: rule.ruleSetCode,
          ruleSource:  rule.source,
        },
      }, tx)
    } else {
      newAccruedDays = daysToAccrue
      const closing = computeClosingBalance({
        openingBalanceDays: 0,
        accruedDays:        daysToAccrue,
        takenDays:          0,
        pendingDays:        0,
        adjustedDays:       0,
        carriedForwardDays: 0,
        forfeitedDays:      0,
      })
      const [inserted] = await tx
        .insert(absenceBalances)
        .values({
          tenantId:           TENANT_ID,
          personId,
          absenceTypeId,
          legalEntityId:      person.legalEntityId,
          balanceYear,
          openingBalanceDays: '0',
          accruedDays:        String(daysToAccrue),
          takenDays:          '0',
          pendingDays:        '0',
          adjustedDays:       '0',
          carriedForwardDays: '0',
          forfeitedDays:      '0',
          closingBalanceDays: String(closing),
          lastAccrualDate:    monthAccruedFor,
          nextAccrualDate:    addMonths(monthAccruedFor, 1),
          createdBy:          SYSTEM_ACTOR_ID,
          createdByName:      'system: monthly accrual',
        })
        .returning({ id: absenceBalances.id })

      await writeAuditLog({
        actorId:       SYSTEM_ACTOR_ID,
        actorName:     'system: accrueMonthlyBalance',
        actorRole:     'SUPER_ADMIN',
        actorEntityId: person.legalEntityId,
        channel:       'SYSTEM',
        eventType:     'ABSENCE_BALANCE.ACCRUED',
        resourceType:  'absence_balances',
        resourceId:    inserted?.id,
        entityId:      person.legalEntityId,
        metadata: {
          personId, absenceTypeId, balanceYear, monthAccruedFor,
          daysAccrued: daysToAccrue,
          ruleSetCode: rule.ruleSetCode,
          ruleSource:  rule.source,
        },
      }, tx)
    }
  })

  if (skippedAlreadyAccrued) {
    return {
      personId, absenceTypeId, balanceYear,
      monthAccruedFor, daysAccrued: 0,
      newAccruedDays: existingAccruedDays,
      skipped: true, skipReason: 'already accrued for this month',
    }
  }

  return {
    personId, absenceTypeId, balanceYear,
    monthAccruedFor, daysAccrued: daysToAccrue, newAccruedDays,
    skipped: false,
  }
}

/**
 * BR-AL-003 — carry-forward expiry sweep.
 *
 * Walks the person's open balance rows; for each row whose carry-forward
 * window has lapsed (now > lastAccrualDate + carryForwardExpiryMonths),
 * the carriedForwardDays is moved into forfeitedDays in a single tx.
 */
export async function enforceCarryForwardExpiry(
  personId: string,
  asOf:     string = todayUae(),
): Promise<CarryForwardExpiryResult[]> {
  const person = await loadPersonForAccrual(personId)
  if (!person) return []

  const rows = await db
    .select({
      bal:  absenceBalances,
      type: absenceTypes,
    })
    .from(absenceBalances)
    .leftJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
    .where(
      and(
        eq(absenceBalances.tenantId, TENANT_ID),
        eq(absenceBalances.personId, personId),
        // S5-Q12 — parameterized via the `sql` template tag; the column
        // reference is bound, no user input on either side.
        sql`${absenceBalances.carriedForwardDays} > 0`,
      ),
    )

  const out: CarryForwardExpiryResult[] = []
  for (const r of rows) {
    if (!r.type) continue
    const rule = await resolveLeaveRuleSet(personId, r.type.typeCode, asOf)
    if (!rule || rule.carryForwardExpiryMonths <= 0) continue

    // Anchor the expiry window on Jan 1 of the balance_year.
    const yearStart = `${r.bal.balanceYear}-01-01`
    const expiry = computeCarryForwardExpiry(yearStart, rule.carryForwardExpiryMonths)
    if (!expiry) continue
    if (asOf < expiry) continue  // window still open

    const oldCarry  = Number(r.bal.carriedForwardDays)
    if (oldCarry <= 0) continue
    const newCarry  = 0
    const newForfeit = Number(r.bal.forfeitedDays) + oldCarry
    const closing = computeClosingBalance({
      openingBalanceDays: Number(r.bal.openingBalanceDays),
      accruedDays:        Number(r.bal.accruedDays),
      takenDays:          Number(r.bal.takenDays),
      pendingDays:        Number(r.bal.pendingDays),
      adjustedDays:       Number(r.bal.adjustedDays),
      carriedForwardDays: newCarry,
      forfeitedDays:      newForfeit,
    })

    await db.transaction(async tx => {
      await tx
        .update(absenceBalances)
        .set({
          carriedForwardDays: String(newCarry),
          forfeitedDays:      String(newForfeit),
          closingBalanceDays: String(closing),
          updatedDate:        new Date(),
          lastUpdatedDate:    new Date(),
          updatedBy:          SYSTEM_ACTOR_ID,
          updatedByName:      'system: carry-forward expiry',
        })
        .where(eq(absenceBalances.id, r.bal.id))

      await writeAuditLog({
        actorId:       SYSTEM_ACTOR_ID,
        actorName:     'system: enforceCarryForwardExpiry',
        actorRole:     'SUPER_ADMIN',
        actorEntityId: person.legalEntityId,
        channel:       'SYSTEM',
        eventType:     'ABSENCE_BALANCE.CARRY_FORWARD_EXPIRED',
        resourceType:  'absence_balances',
        resourceId:    r.bal.id,
        entityId:      person.legalEntityId,
        metadata:      {
          personId,
          absenceTypeId: r.bal.absenceTypeId,
          expiredDays:   oldCarry,
          expiryDate:    expiry,
          ruleSetCode:   rule.ruleSetCode,
        },
      }, tx)
    })

    out.push({
      balanceId:             r.bal.id,
      personId,
      absenceTypeId:         r.bal.absenceTypeId,
      expiredDays:           oldCarry,
      newCarriedForwardDays: newCarry,
    })
  }

  return out
}

/**
 * Sums durations for in-flight + approved leave overlapping a date range —
 * used by `createLeaveRequest` to flag overlap before INSERT.
 */
export function rangesOverlap(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string,
): boolean {
  // [a] and [b] overlap iff aStart ≤ bEnd AND bStart ≤ aEnd.
  return aStart <= bEnd && bStart <= aEnd
}

/** Returns first day of next month — used by accrual scheduling. */
export function firstOfNextMonth(date: string): string {
  const firstOfThis = date.slice(0, 7) + '-01'
  return addDays(addMonths(firstOfThis, 1), 0)
}

// ── GAP-N06 FIX (FIX-S9-05): Compensatory leave for public-holiday work ──

export interface CompLeaveCreditResult {
  personId:       string
  workDate:       string
  holidayCode:    string
  holidayNameEn:  string
  daysGranted:    number
  balanceId:      string
}

/**
 * Grants 1 compensatory leave day when an employee works on a confirmed
 * public holiday. Validates the date is a confirmed public holiday before
 * any write — throws if not. Idempotent only at the DB write level: callers
 * must dedupe by (personId, workDate) themselves before invoking.
 *
 * BR-PH-003 / BR-OT-001 — Article 26 FDL 33/2021: public-holiday work earns
 * 150% pay PLUS one compensatory leave day. The 150% pay is handled by the
 * payroll module; this function only grants the leave-balance credit.
 *
 * Hard Rule 1: writes the absenceBalances delta + audit row in the same tx.
 */
export async function grantCompensatoryLeaveCredit(
  personId:    string,
  workDate:    string,
  hoursWorked: number,
  actorId:     string,
  actorName:   string = 'System',
): Promise<CompLeaveCreditResult> {
  void hoursWorked // reserved for future partial-day proration

  const person = await loadPersonForAccrual(personId)
  if (!person) throw new Error(`person not found: ${personId}`)

  // Verify the date is a confirmed public holiday — entity-scoped or tenant-wide.
  const [holiday] = await db
    .select({
      holidayCode:   publicHolidays.holidayCode,
      holidayNameEn: publicHolidays.holidayNameEn,
    })
    .from(publicHolidays)
    .where(
      and(
        eq(publicHolidays.tenantId, TENANT_ID),
        eq(publicHolidays.holidayDate, workDate),
        eq(publicHolidays.isConfirmed, true),
      ),
    )
    .limit(1)
  if (!holiday) {
    throw new Error(`Date ${workDate} is not a confirmed public holiday`)
  }

  // Look up the COMP absence type for this entity.
  const [compType] = await db
    .select({ id: absenceTypes.id })
    .from(absenceTypes)
    .where(
      and(
        eq(absenceTypes.tenantId, TENANT_ID),
        eq(absenceTypes.typeCode, 'COMP'),
        eq(absenceTypes.isActive, true),
      ),
    )
    .limit(1)
  if (!compType) {
    throw new Error('COMP absence type not seeded — run drizzle/seed.ts')
  }

  const balanceYear = Number(workDate.slice(0, 4))
  const grantDays   = 1 // BR-PH-003: 1 comp day per public holiday worked.
  let balanceId = ''

  await db.transaction(async tx => {
    const [existing] = await tx
      .select()
      .from(absenceBalances)
      .where(
        and(
          eq(absenceBalances.tenantId, TENANT_ID),
          eq(absenceBalances.personId, personId),
          eq(absenceBalances.absenceTypeId, compType.id),
          eq(absenceBalances.balanceYear, balanceYear),
        ),
      )
      .limit(1)

    if (existing) {
      const newAdjusted = Number(existing.adjustedDays) + grantDays
      const closing = computeClosingBalance({
        openingBalanceDays: Number(existing.openingBalanceDays),
        accruedDays:        Number(existing.accruedDays),
        takenDays:          Number(existing.takenDays),
        pendingDays:        Number(existing.pendingDays),
        adjustedDays:       newAdjusted,
        carriedForwardDays: Number(existing.carriedForwardDays),
        forfeitedDays:      Number(existing.forfeitedDays),
      })
      await tx
        .update(absenceBalances)
        .set({
          adjustedDays:       String(newAdjusted),
          closingBalanceDays: String(closing),
          updatedDate:        new Date(),
          lastUpdatedDate:    new Date(),
          updatedBy:          actorId,
          updatedByName:      actorName,
        })
        .where(eq(absenceBalances.id, existing.id))
      balanceId = existing.id
    } else {
      const closing = computeClosingBalance({
        openingBalanceDays: 0,
        accruedDays:        0,
        takenDays:          0,
        pendingDays:        0,
        adjustedDays:       grantDays,
        carriedForwardDays: 0,
        forfeitedDays:      0,
      })
      const [inserted] = await tx
        .insert(absenceBalances)
        .values({
          tenantId:           TENANT_ID,
          personId,
          absenceTypeId:      compType.id,
          legalEntityId:      person.legalEntityId,
          balanceYear,
          openingBalanceDays: '0',
          accruedDays:        '0',
          takenDays:          '0',
          pendingDays:        '0',
          adjustedDays:       String(grantDays),
          carriedForwardDays: '0',
          forfeitedDays:      '0',
          closingBalanceDays: String(closing),
          createdBy:          actorId,
          createdByName:      actorName,
        })
        .returning({ id: absenceBalances.id })
      balanceId = inserted!.id
    }

    await writeAuditLog({
      actorId,
      actorName,
      actorRole:     'SYSTEM',
      actorEntityId: person.legalEntityId,
      channel:       'SYSTEM',
      eventType:     'ABSENCE_BALANCE.COMP_LEAVE_GRANTED',
      resourceType:  'absence_balances',
      resourceId:    balanceId,
      entityId:      person.legalEntityId,
      newValues: {
        personId,
        absenceTypeCode: 'COMP',
        adjustmentDays:  grantDays,
        workDate,
        holidayCode:     holiday.holidayCode,
        holidayNameEn:   holiday.holidayNameEn,
        // BR-PH-003 — Article 26 FDL 33/2021
      },
    }, tx)
  })

  return {
    personId,
    workDate,
    holidayCode:   holiday.holidayCode,
    holidayNameEn: holiday.holidayNameEn,
    daysGranted:   grantDays,
    balanceId,
  }
}

// Touch reference so unused import warnings disappear (legalEntities is read
// only via the persons join in resolveLeaveRuleSet).
void legalEntities

// ── Nursing Break Entitlement (GAP-C09) ───────────────────────────────────

/**
 * BR-NB-001 — UAE FDL 33/2021 Article 30, Cabinet Resolution 1/2022:
 * A nursing mother is entitled to two 30-minute nursing breaks per working
 * day for up to 18 months from the child's date of birth. The system sets
 * `nursing_break_end_date` on the person record so the timesheet engine can
 * deduct 1 hour per day from the expected hours automatically.
 *
 * This function is called by:
 *   1. The accommodation request approval action (when requestType=NURSING_BREAK).
 *   2. Directly by HR Admin via the absence settings page.
 *
 * It is idempotent — calling again with a later end date silently extends.
 */
export async function setNursingBreakEntitlement(
  personId:   string,
  childDob:   string,
): Promise<{ endDate: string }> {
  // BR-NB-001: 18 months from child's date of birth
  const dob = new Date(childDob)
  const end = new Date(dob)
  end.setMonth(end.getMonth() + 18)
  const endDate = end.toISOString().slice(0, 10)

  await db.transaction(async tx => {
    const [person] = await tx
      .select({ id: persons.id, legalEntityId: persons.legalEntityId })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
      .limit(1)
    if (!person) throw new Error('NOT_FOUND: person record not found')

    await tx
      .update(persons)
      .set({ nursingBreakEndDate: endDate, updatedBy: SYSTEM_ACTOR_ID, lastUpdatedDate: new Date() })
      .where(eq(persons.id, personId))

    await writeAuditLog({
      actorId:      SYSTEM_ACTOR_ID,
      actorName:    'System',
      actorRole:    'SYSTEM',
      channel:      'SYSTEM',
      eventType:    'PERSON.NURSING_BREAK_SET',
      resourceType: 'persons',
      resourceId:   personId,
      entityId:     person.legalEntityId ?? undefined,
      newValues:    { nursingBreakEndDate: endDate, childDob },
    }, tx)
  })

  return { endDate }
}

/**
 * Returns true if the given person is currently within their nursing-break
 * entitlement window (today ≤ nursingBreakEndDate). Used by the timesheet
 * engine to apply the 1-hour daily reduction.
 */
export async function isNursingBreakActive(personId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10)
  const [row] = await db
    .select({ nursingBreakEndDate: persons.nursingBreakEndDate })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
    .limit(1)
  if (!row?.nursingBreakEndDate) return false
  return row.nursingBreakEndDate >= today
}

// Touch workerAssignments to suppress unused-import lint (used by services
// that may extend this file in future sprints for schedule-aware accrual).
void workerAssignments
