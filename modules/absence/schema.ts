/**
 * absence schema re-exports — Sprint 2 skeleton.
 * Tables that own absence/leave domain state — entries, balances, plans,
 * blackout periods, and the leave rule sets that drive eligibility.
 */
export {
  absencePlans,
  absenceTypes,
  absenceEntries,
  absenceBalances,
  blackoutPeriods,
  leaveRuleSets,
  leaveRuleLines,
  publicHolidays,
} from '@/drizzle/schema'

export type {
  AbsencePlan,
  AbsenceType,
  AbsenceEntry,
  AbsenceBalance,
  BlackoutPeriod,
  LeaveRuleSet,
  LeaveRuleLine,
  PublicHoliday,
  NewAbsenceEntry,
} from '@/drizzle/schema'
