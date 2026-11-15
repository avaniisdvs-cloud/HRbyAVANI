/**
 * Contracts — pure helpers (no DB, no async). Sits alongside actions.ts so
 * the 'use server' file stays compliant with "every export must be async".
 */

/**
 * BR-NP-001 — derive notice period (days) from years of service.
 *  < 5 yrs   → 30
 *  5–10 yrs  → 60
 *  ≥ 10 yrs  → 90
 */
export function deriveNoticePeriodDays(yearsOfService: number): number {
  if (yearsOfService >= 10) return 90
  if (yearsOfService >= 5)  return 60
  return 30
}
