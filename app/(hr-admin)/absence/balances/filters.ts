/**
 * Phase 1 — Leave (Absence) Balances filter helpers.
 *
 * Shared by the Balances page, the CSV export route, and unit tests so the
 * grid, summary cards, and export always agree. Pure functions only here
 * (status derivation + plan-level expiry approximation); the drizzle SQL
 * condition builder lives alongside them and is imported by page + export.
 *
 * Spec: docs/LEAVE-BALANCES-REDESIGN-SPEC.md (§2.2, §2.3, §6.1–§6.3).
 *
 * Phase 1 scope notes:
 *   • Carry-forward expiry uses the PLAN-LEVEL approximation
 *     (absence_plans.carry_forward_expiry_months). Exact per-person
 *     resolution is deferred to Phase 2 (Decision #1).
 *   • Department / Project filters are Phase 2 — NOT handled here.
 */
import { and, eq, gt, lt, sql, ilike, or, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { absenceBalances, absenceTypes, absencePlans, persons, workerAssignments } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'

// ─── Filter value enums ──────────────────────────────────────────────────────

export const BALANCE_STATUSES = ['positive', 'negative', 'zero', 'expiring'] as const
export type BalanceStatus = (typeof BALANCE_STATUSES)[number]

export const CARRY_FORWARD_STATUSES = ['eligible', 'not_eligible', 'expired'] as const
export type CarryForwardStatus = (typeof CARRY_FORWARD_STATUSES)[number]

/** Days-before-expiry window that counts as "Expiring Soon" (spec: 90 days). */
export const EXPIRING_SOON_DAYS = 90

// ─── Search-param schema ───────────────────────────────────────────────────────
// S5-Q11 — clamp `year`; default falls through to current year in the page.

export const BalancesSearchSchema = z.object({
  year:         z.coerce.number().int().min(2000).max(3000).optional().catch(undefined),
  entityId:     z.string().uuid().optional().catch(undefined),
  typeId:       z.string().uuid().optional().catch(undefined),
  departmentId: z.string().uuid().optional().catch(undefined),
  projectId:    z.string().uuid().optional().catch(undefined),
  q:            z.string().trim().min(1).max(100).optional().catch(undefined),
  startDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  endDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  status:       z.enum(BALANCE_STATUSES).optional().catch(undefined),
  cf:           z.enum(CARRY_FORWARD_STATUSES).optional().catch(undefined),
  expanded:     z.string().uuid().optional().catch(undefined),
})

export type BalancesFilters = z.infer<typeof BalancesSearchSchema>

// ─── Pure derivations (used for badges, card maths, export labels, tests) ──────

/**
 * Plan-level carry-forward expiry date (Phase 1 approximation).
 * Returns an ISO YYYY-MM-DD string, or null when the plan never expires
 * (carryForwardExpiryMonths <= 0) or the year is out of the sane HR range.
 * Mirrors modules/absence/services.ts computeCarryForwardExpiry, anchored to
 * the balance year start (Jan 1, UTC).
 */
export function computePlanExpiryISO(
  balanceYear: number,
  carryForwardExpiryMonths: number,
): string | null {
  if (!Number.isFinite(carryForwardExpiryMonths) || carryForwardExpiryMonths <= 0) return null
  if (!Number.isInteger(balanceYear) || balanceYear < 2000 || balanceYear > 2100) return null
  // Year start + N months, all in UTC to match the rest of the page (§5.12).
  const d = new Date(Date.UTC(balanceYear, 0, 1))
  d.setUTCMonth(d.getUTCMonth() + carryForwardExpiryMonths)
  return d.toISOString().slice(0, 10)
}

/** True when carry-forward expiry falls within the next EXPIRING_SOON_DAYS. */
export function isExpiringSoon(
  carriedForwardDays: number,
  forfeitedDays: number,
  expiryISO: string | null,
  todayISO: string,
): boolean {
  if (carriedForwardDays <= 0 || forfeitedDays > 0 || !expiryISO) return false
  const today = new Date(`${todayISO}T00:00:00Z`).getTime()
  const expiry = new Date(`${expiryISO}T00:00:00Z`).getTime()
  const horizon = today + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000
  return expiry >= today && expiry <= horizon
}

/**
 * Balance status for a row. "Expiring Soon" takes precedence over Positive
 * for the grid badge so HR sees the actionable state first; Positive/Negative/
 * Zero otherwise. NULL closing → null (not yet computed).
 */
export function deriveBalanceStatus(args: {
  closingBalanceDays: number | null
  carriedForwardDays: number
  forfeitedDays: number
  expiryISO: string | null
  todayISO: string
}): BalanceStatus | null {
  const { closingBalanceDays, carriedForwardDays, forfeitedDays, expiryISO, todayISO } = args
  if (isExpiringSoon(carriedForwardDays, forfeitedDays, expiryISO, todayISO)) return 'expiring'
  if (closingBalanceDays == null) return null
  if (closingBalanceDays > 0) return 'positive'
  if (closingBalanceDays < 0) return 'negative'
  return 'zero'
}

/** Carry-forward status. Plan-level expiry in Phase 1. */
export function deriveCarryForwardStatus(args: {
  carriedForwardDays: number
  forfeitedDays: number
  expiryISO: string | null
  todayISO: string
}): CarryForwardStatus {
  const { carriedForwardDays, forfeitedDays, expiryISO, todayISO } = args
  if (forfeitedDays > 0) return 'expired'
  if (carriedForwardDays <= 0) return 'not_eligible'
  // carried > 0, not forfeited: eligible if never-expires OR expiry still future.
  if (!expiryISO) return 'eligible'
  const today = new Date(`${todayISO}T00:00:00Z`).getTime()
  const expiry = new Date(`${expiryISO}T00:00:00Z`).getTime()
  return expiry > today ? 'eligible' : 'not_eligible'
}

export const BALANCE_STATUS_LABEL_EN: Record<BalanceStatus, string> = {
  positive: 'Positive', negative: 'Negative', zero: 'Zero', expiring: 'Expiring Soon',
}
export const CARRY_FORWARD_STATUS_LABEL_EN: Record<CarryForwardStatus, string> = {
  eligible: 'Eligible', not_eligible: 'Not Eligible', expired: 'Expired',
}

// ─── Drizzle condition builder (shared by page + export) ───────────────────────

/**
 * Builds the WHERE conditions for the balances query from validated filters.
 * Expects the query to JOIN persons, absence_types AND absence_plans
 * (absence_types.absence_plan_id → absence_plans) so the plan-level expiry
 * predicate can be expressed in SQL.
 *
 * `scopedEntityId` is the RBAC-enforced entity pin (null only for SUPER_ADMIN).
 * It is applied first and always wins over any caller-supplied entityId.
 */
export function buildBalanceConditions(
  filters: { year: number; entityId?: string; typeId?: string; departmentId?: string; projectId?: string; q?: string; startDate?: string; endDate?: string; status?: BalanceStatus; cf?: CarryForwardStatus },
  scopedEntityId: string | null,
): SQL[] {
  const conds: SQL[] = [
    eq(absenceBalances.tenantId, TENANT_ID),
    eq(absenceBalances.balanceYear, filters.year),
  ]

  // Entity: RBAC pin wins; SUPER_ADMIN may optionally narrow by entityId.
  if (scopedEntityId) {
    conds.push(eq(absenceBalances.legalEntityId, scopedEntityId))
  } else if (filters.entityId) {
    conds.push(eq(absenceBalances.legalEntityId, filters.entityId))
  }

  if (filters.typeId) conds.push(eq(absenceBalances.absenceTypeId, filters.typeId))

  // Department / Project — match ANY current worker assignment (EXISTS avoids
  // join fan-out, so each balance row appears once = automatic de-dup).
  // Terminated/inactive staff without a current assignment only appear when
  // these filters are unset (approved Decision #6).
  if (filters.departmentId || filters.projectId) {
    const waConds: SQL[] = [
      sql`${workerAssignments.personId} = ${absenceBalances.personId}`,
      sql`${workerAssignments.tenantId} = ${absenceBalances.tenantId}`,
      eq(workerAssignments.isCurrent, true),
    ]
    if (filters.departmentId) waConds.push(eq(workerAssignments.departmentId, filters.departmentId))
    if (filters.projectId)    waConds.push(eq(workerAssignments.projectId, filters.projectId))
    conds.push(sql`EXISTS (SELECT 1 FROM ${workerAssignments} WHERE ${and(...waConds)})`)
  }

  if (filters.q) {
    const term = `%${filters.q}%`
    const m = or(
      ilike(persons.fullNameEn, term),
      ilike(persons.fullNameAr, term),
      ilike(persons.personNumber, term),
    )
    if (m) conds.push(m)
  }

  // System date range (§2.1): match created / updated / last-accrual dates.
  if (filters.startDate || filters.endDate) {
    const lo = filters.startDate ?? '2000-01-01'
    const hi = filters.endDate ?? '2100-12-31'
    conds.push(sql`(
      ${absenceBalances.createdDate}::date BETWEEN ${lo}::date AND ${hi}::date
      OR ${absenceBalances.lastUpdatedDate}::date BETWEEN ${lo}::date AND ${hi}::date
      OR ${absenceBalances.lastAccrualDate} BETWEEN ${lo}::date AND ${hi}::date
    )`)
  }

  // Plan-level expiry expression (Phase 1): year start + N months.
  const expiryExpr = sql`(make_date(${absenceBalances.balanceYear}, 1, 1) + (${absencePlans.carryForwardExpiryMonths} * interval '1 month'))::date`

  // Balance status (SQL — §6.3).
  switch (filters.status) {
    case 'positive': conds.push(gt(absenceBalances.closingBalanceDays, '0')); break
    case 'negative': conds.push(lt(absenceBalances.closingBalanceDays, '0')); break
    case 'zero':     conds.push(eq(absenceBalances.closingBalanceDays, '0')); break
    case 'expiring':
      conds.push(sql`${absenceBalances.carriedForwardDays} > 0
        AND ${absenceBalances.forfeitedDays} = 0
        AND ${absencePlans.carryForwardExpiryMonths} > 0
        AND ${expiryExpr} BETWEEN CURRENT_DATE AND (CURRENT_DATE + interval '${sql.raw(String(EXPIRING_SOON_DAYS))} days')`)
      break
  }

  // Carry-forward status (SQL — §6.3).
  switch (filters.cf) {
    case 'not_eligible':
      conds.push(sql`${absenceBalances.carriedForwardDays} = 0`)
      break
    case 'expired':
      conds.push(gt(absenceBalances.forfeitedDays, '0'))
      break
    case 'eligible':
      conds.push(sql`${absenceBalances.carriedForwardDays} > 0
        AND ${absenceBalances.forfeitedDays} = 0
        AND (${absencePlans.carryForwardExpiryMonths} = 0 OR ${expiryExpr} > CURRENT_DATE)`)
      break
  }

  return conds
}

/** Convenience: AND-combine the conditions for a single .where(...) call. */
export function balanceWhere(
  filters: Parameters<typeof buildBalanceConditions>[0],
  scopedEntityId: string | null,
): SQL | undefined {
  return and(...buildBalanceConditions(filters, scopedEntityId))
}
