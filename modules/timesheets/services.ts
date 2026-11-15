/**
 * timesheets pure services — Sprint 2 skeleton.
 * Hours roll-up, overtime classification, weekly/monthly aggregators.
 */

import { isNursingBreakActive } from '@/modules/absence/services'

// ── Nursing Break Reduction (GAP-C09) ─────────────────────────────────────

/**
 * BR-NB-001 — UAE FDL 33/2021 Article 30 / Cabinet Resolution 1/2022:
 * A nursing mother receives two 30-minute breaks per day for up to 18 months
 * from the child's date of birth.
 *
 * Returns the number of hours to subtract from the expected daily hours for
 * the given person on the given date. Returns 0 if no active entitlement.
 *
 * This is a pure reduction — it does NOT create absence entries or affect
 * leave balances. The timesheet engine applies it to the "contracted hours"
 * calculation when computing overtime/undertime for the day.
 */
export async function getNursingBreakReduction(personId: string): Promise<number> {
  const active = await isNursingBreakActive(personId)
  // BR-NB-001: 2 × 30 min = 1 hour per working day
  return active ? 1.0 : 0.0
}
