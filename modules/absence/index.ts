/**
 * Absence module — public API barrel (Sprint 5).
 *
 * Hard Rule 6: cross-module imports MUST come through this file.
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

// ── Server Actions ────────────────────────────────────────────────────────
export {
  enrolPersonInLeavePlan,
  correctLeavePlanEnrolment,
  getLeavePlanEnrolmentHistory,
  findLeavePlanEnrolmentAsOfTx,
  type EnrolLeavePlanInput,
  type CorrectEnrolmentInput,
} from './leave-plan-enrolment-actions'

export {
  leavePlanEnrolments,
  type LeavePlanEnrolment,
} from '@/drizzle/schema'

export {
  createLeaveRequest,
  submitLeaveRequest,
  getLeaveRequest,
  listLeaveRequests,
  cancelLeaveRequest,
  decideLeaveRequest,
  saveLeaveRuleSet,
  requestDisabilityParentalAccommodation,
  getLeaveHistoryForEmployee,
  uploadLeaveMedicalCert,
  type AccommodationRequestInput,
  type AccommodationRequestResult,
  type LeaveHistoryRow,
} from './actions'

// NOTE: services.ts (accrueMonthlyBalance, enforceCarryForwardExpiry,
// grantCompensatoryLeaveCredit) is intentionally NOT re-exported here.
// Re-exporting pulls postgres/Node-only deps into client bundles — those
// helpers are called by cron jobs (server-only) which import directly
// from `@/modules/absence/services`.

// ── View-model + DTO types ────────────────────────────────────────────────
export type {
  LeaveRequestListRow,
  LeaveRequestDetail,
  PaginatedLeaveRequests,
  LeaveBalanceSnapshot,
  AccrualResult,
  CarryForwardExpiryResult,
  CalendarOverlay,
} from './types'

// ── Validation schemas (re-exported for typed forms) ─────────────────────
export type {
  CreateLeaveRequestInput,
  CancelLeaveRequestInput,
  ListLeaveRequestsFilter,
  LeaveDecisionInput,
  SaveLeaveRuleSetInput,
  UpsertBackdatePolicyInput,
} from './validations'

export { UpsertBackdatePolicySchema } from './validations'

// ── Leave Backdate Policy ─────────────────────────────────────────────────
export {
  listBackdatePolicies,
  resolveBackdatePolicy,
  upsertBackdatePolicy,
  type BackdatePolicyRow,
} from './backdate-policy-actions'
