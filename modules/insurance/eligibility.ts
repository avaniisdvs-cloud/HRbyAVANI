/**
 * Insurance eligibility resolution.
 *
 * Resolves which plan an employee is eligible for based on:
 *   • gradeIds[]        — plan's allowed grades (NULL = all)
 *   • employmentTypes[] — plan's allowed employment types (NULL = all)
 *   • minServiceMonths  — waiting period from hire date
 *   • isActive          — plan must be active
 *
 * BR-INS-007: contractors are excluded unless insuranceExceptionGranted.
 * BR-INS-005: dependent child age cap enforced here.
 * BR-INS-004: max 9 active dependents enforced in actions.ts.
 */
import { and, eq, or, isNull } from 'drizzle-orm'
import { medicalInsurancePlans } from '@/drizzle/schema'
import type { MedicalInsurancePlan } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'

type Tx = {
  select: typeof import('@/lib/db').db.select
}

export interface EligibilityContext {
  legalEntityId:    string
  gradeId?:         string | null
  employmentType:   string
  hireDateOrStart:  string   // ISO date — used for minServiceMonths check
  /** BR-INS-007: set to true when a contractor exception has been granted */
  insuranceExceptionGranted?: boolean
}

/**
 * Returns the first eligible active plan for the employee.
 * Preference order: isDefaultPlan first, then by policyStartDate desc.
 */
export async function resolveEligiblePlan(
  tx: Tx,
  ctx: EligibilityContext,
): Promise<MedicalInsurancePlan | null> {
  // BR-INS-007: contractors excluded unless exception granted
  if (
    ctx.employmentType === 'CONTRACTOR' &&
    !ctx.insuranceExceptionGranted
  ) {
    return null
  }

  const plans = await tx
    .select()
    .from(medicalInsurancePlans)
    .where(and(
      eq(medicalInsurancePlans.tenantId, TENANT_ID),
      eq(medicalInsurancePlans.legalEntityId, ctx.legalEntityId),
      eq(medicalInsurancePlans.isActive, true),
    ))

  if (!plans.length) return null

  const now = new Date()
  const serviceMonths = ctx.hireDateOrStart
    ? monthsBetween(new Date(ctx.hireDateOrStart), now)
    : 0

  const eligible = plans.filter(plan => {
    // Waiting period
    if (plan.minServiceMonths && serviceMonths < plan.minServiceMonths) return false

    // Employment type filter (null = all allowed)
    if (plan.employmentTypes && plan.employmentTypes.length > 0) {
      if (!plan.employmentTypes.includes(ctx.employmentType)) return false
    }

    // Grade filter (null = all allowed)
    if (plan.gradeIds && plan.gradeIds.length > 0) {
      if (!ctx.gradeId) return false
      if (!plan.gradeIds.includes(ctx.gradeId)) return false
    }

    return true
  })

  if (!eligible.length) return null

  // Prefer default plan; otherwise pick highest-tier by employee premium desc
  const sorted = eligible.sort((a, b) => {
    if (a.isDefaultPlan && !b.isDefaultPlan) return -1
    if (!a.isDefaultPlan && b.isDefaultPlan) return 1
    const aP = parseFloat(a.employeePremiumAed ?? '0')
    const bP = parseFloat(b.employeePremiumAed ?? '0')
    return bP - aP
  })

  return sorted[0] ?? null
}

/**
 * BR-INS-005: child/student age check for dependent enrolment.
 * Returns null if eligible, or an error message string if not.
 */
export function checkDependentAgeEligibility(
  relationship: string,
  dateOfBirth:  string | null | undefined,
  isStudent:    boolean | null | undefined,
  childMaxAge:  number,
  childStudentExtensionAge: number,
): string | null {
  if (!['CHILD', 'SON', 'DAUGHTER'].includes(relationship.toUpperCase())) {
    return null // not a child relationship — age cap doesn't apply
  }
  if (!dateOfBirth) return null

  const ageYears = yearsBetween(new Date(dateOfBirth), new Date())
  const maxAge = isStudent ? childStudentExtensionAge : childMaxAge

  if (ageYears > maxAge) {
    return `BR-INS-005: dependent age ${ageYears} exceeds maximum ${maxAge} years (${isStudent ? 'student extension' : 'standard'})`
  }
  return null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12
       + (to.getMonth() - from.getMonth())
}

function yearsBetween(from: Date, to: Date): number {
  let years = to.getFullYear() - from.getFullYear()
  const m = to.getMonth() - from.getMonth()
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) years--
  return years
}
