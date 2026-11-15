/**
 * Pure, stateless helpers for the insurance module.
 * No DB, no auth — safe to import in unit tests.
 */

/** Convert AED string to integer fils (×100) for lossless arithmetic. */
export function aedToFils(aed: string): number {
  return Math.round(parseFloat(aed || '0') * 100)
}

/** Convert fils integer back to AED string with exactly 2 decimal places. */
export function filsToAed(fils: number): string {
  return (fils / 100).toFixed(2)
}

/**
 * Split an annual AED premium into employer / employee portions.
 * Uses integer (fils) math to avoid floating-point residuals.
 * Guarantees: employerAed + employeeAed === annualAed (to the fils).
 */
export function splitPremium(
  annualAed: string,
  employerContributionPct: string,
): { annualAed: string; employerAed: string; employeeAed: string } {
  const annualFils   = aedToFils(annualAed)
  const rawPct       = parseFloat(employerContributionPct)
  // Clamp to [0, 100]; treat NaN or empty as 100 (employer pays all)
  const pct          = (isNaN(rawPct) ? 100 : Math.max(0, Math.min(100, rawPct))) / 100
  const employerFils = Math.round(annualFils * pct)
  const employeeFils = annualFils - employerFils
  return {
    annualAed:   filsToAed(annualFils),
    employerAed: filsToAed(employerFils),
    employeeAed: filsToAed(employeeFils),
  }
}

/**
 * Compute enrolment expiry: effectiveDate + 12 months − 1 day,
 * capped by the plan's policyEndDate.
 *
 * Rationale: an enrolment starting on 2026-05-16 runs to 2027-05-15
 * (inclusive), not to the plan's blanket end date.
 */
export function computeExpiryDate(
  effectiveDate: string,
  policyEndDate: string | null | undefined,
): string {
  // Parse components explicitly and use UTC methods to avoid local-timezone drift
  // on servers whose TZ differs from UAE (e.g. Docker/Azure running UTC).
  const [year, month, day] = effectiveDate.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  d.setUTCDate(d.getUTCDate() - 1)
  const plus12Str = d.toISOString().split('T')[0]
  if (!policyEndDate) return plus12Str
  return plus12Str <= policyEndDate ? plus12Str : policyEndDate
}

/**
 * Returns true if the ISO date string is within `graceDays` of today (inclusive).
 * Used to validate effectiveDate is not excessively backdated.
 */
export function isWithinBackdateGrace(isoDate: string, graceDays: number): boolean {
  const date  = new Date(isoDate)
  const limit = new Date()
  limit.setUTCHours(0, 0, 0, 0)
  limit.setDate(limit.getDate() - graceDays)
  return date >= limit
}
