/**
 * Absence Zod validators — Sprint 5 (S5-01).
 *
 * Schemas for leave-request lifecycle Server Actions:
 *   • CreateLeaveRequestSchema — used by createLeaveRequest + submitLeaveRequest
 *   • CancelLeaveRequestSchema — used by cancelLeaveRequest
 *   • LeaveActionSchema        — approve/reject decisions on a workflow step
 *   • ListLeaveRequestsFilter  — list-page filter parsing
 *
 * Cross-field rules:
 *   • startDate <= endDate (request range invariant)
 *   • durationDays > 0
 *   • half-day requires durationDays = 0.5 AND startDate = endDate AND
 *     halfDayPeriod ∈ { 'AM', 'PM' }
 *
 * Compliance hooks (enforced in services / actions, NOT here):
 *   • BR-AL-001  — annual leave ≥ 22 days (assertLeaveRuleNotBelowMinimum)
 *   • BR-SL-001  — sick-leave tiers (15/30/45)
 *   • BR-ML-001  — maternity 60 days (45 full + 15 half)
 *   • BR-STL-001 — study leave ≤ 10 days/year
 */
import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'

const dateString = hrDateString()

export const LeaveStatusEnum = z.enum([
  'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'TAKEN', 'RECALLED',
])
export type LeaveStatus = z.infer<typeof LeaveStatusEnum>

export const LeaveSubmittedViaEnum = z.enum([
  'PORTAL', 'MOBILE', 'ARIA_TEXT', 'ARIA_VOICE', 'HR_ADMIN',
])

// ── createLeaveRequest / submitLeaveRequest input ─────────────────────────

export const CreateLeaveRequestSchema = z.object({
  personId:        z.string().uuid(),
  legalEntityId:   z.string().uuid(),
  absenceTypeId:   z.string().uuid(),
  startDate:       dateString,
  endDate:         dateString,
  durationDays:    z.number().positive('durationDays must be > 0').max(365),
  isHalfDay:       z.boolean().default(false),
  halfDayPeriod:   z.enum(['AM', 'PM']).optional(),
  submittedVia:    LeaveSubmittedViaEnum.default('PORTAL'),
  notes:           z.string().max(2000).optional(),
  medicalCertRequired: z.boolean().default(false),
  extraData:       z.record(z.unknown()).optional(),
}).refine(d => d.startDate <= d.endDate, {
  path: ['endDate'],
  message: 'endDate must be on or after startDate · يجب أن يكون تاريخ الانتهاء في أو بعد تاريخ البدء',
}).refine(d => !d.isHalfDay || d.startDate === d.endDate, {
  path: ['endDate'],
  message: 'half-day requests must have startDate = endDate · يجب أن يكون تاريخ البدء مساوياً لتاريخ الانتهاء في طلبات نصف اليوم',
}).refine(d => !d.isHalfDay || d.durationDays === 0.5, {
  path: ['durationDays'],
  message: 'half-day requests must have durationDays = 0.5 · يجب أن تكون مدة طلبات نصف اليوم 0.5 يوم',
}).refine(d => !d.isHalfDay || !!d.halfDayPeriod, {
  path: ['halfDayPeriod'],
  message: 'halfDayPeriod (AM | PM) is required for half-day requests · حقل فترة نصف اليوم (صباحاً | مساءً) مطلوب',
})

export type CreateLeaveRequestInput = z.infer<typeof CreateLeaveRequestSchema>

// ── cancelLeaveRequest input ──────────────────────────────────────────────

export const CancelLeaveRequestSchema = z.object({
  requestId: z.string().uuid(),
  reason:    z.string().min(1).max(500),
})
export type CancelLeaveRequestInput = z.infer<typeof CancelLeaveRequestSchema>

// ── List filter ───────────────────────────────────────────────────────────

export const ListLeaveRequestsFilterSchema = z.object({
  page:          z.number().int().min(1).default(1),
  pageSize:      z.number().int().min(1).max(200).default(25),
  personId:      z.string().uuid().optional(),
  legalEntityId: z.string().uuid().optional(),
  absenceTypeId: z.string().uuid().optional(),
  status:        LeaveStatusEnum.optional(),
  fromDate:      dateString.optional(),
  toDate:        dateString.optional(),
  sortColumn:    z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
})
export type ListLeaveRequestsFilter = z.infer<typeof ListLeaveRequestsFilterSchema>

// ── Approve / Reject step input ───────────────────────────────────────────

export const LeaveDecisionSchema = z.object({
  requestId: z.string().uuid(),
  action:    z.enum(['APPROVE', 'REJECT']),
  comment:   z.string().max(2000).optional(),
})
export type LeaveDecisionInput = z.infer<typeof LeaveDecisionSchema>

// ── Leave-rule admin (S5-06) ──────────────────────────────────────────────
//
// BR-AL-001 / BR-AL-002 / BR-ML-001 / BR-SL-001 / BR-STL-001 — guard runs
// before INSERT/UPDATE in modules/absence/actions.ts (Hard Rule 7).

const EntitlementTier = z.object({
  minServiceMonths: z.number().int().min(0),
  maxServiceMonths: z.number().int().min(0).nullable().optional(),
  daysEntitled:     z.number().min(0).max(365),
})

export const SaveLeaveRuleSetSchema = z.object({
  ruleSetId:           z.string().uuid().optional(),
  legalEntityId:       z.string().uuid().nullable().optional(),
  ruleSetCode:         z.string().min(1).max(50),
  ruleSetNameEn:       z.string().min(1).max(200),
  ruleSetNameAr:       z.string().max(200).optional(),
  entityTypeScope:     z.enum(['MAINLAND', 'DIFC', 'ADGM', 'FREEZONE']).optional(),
  nationalityScope:    z.enum(['UAE_NATIONAL', 'GCC_NATIONAL', 'EXPAT', 'ALL']).default('ALL'),
  employmentTypeScope: z.enum(['FULL_TIME', 'PART_TIME', 'ALL']).default('ALL'),
  effectiveFrom:       dateString,
  effectiveTo:         dateString.optional(),
  isDefault:           z.boolean().default(false),
  lines: z.array(z.object({
    absenceTypeCode:      z.string().min(1).max(30),
    entitlementTiersJson: z.array(EntitlementTier).min(1),
    maxCarryForwardDays:  z.number().min(0).max(120).default(0),
    carryForwardExpiryMonths: z.number().int().min(0).max(36).default(0),
    isProRated:           z.boolean().default(true),
    accrualFrequency:     z.enum(['MONTHLY', 'DAILY', 'ANNUALLY']).default('MONTHLY'),
    minServiceMonths:     z.number().int().min(0).default(0),
    maxDaysPerYear:       z.number().min(0).max(365).optional(),
    encashmentAllowed:    z.boolean().default(false),
    encashmentMaxDays:    z.number().min(0).max(120).optional(),
  })).min(1),
})
export type SaveLeaveRuleSetInput = z.infer<typeof SaveLeaveRuleSetSchema>

// ── Leave Backdate Policy (admin config) ──────────────────────────────────────
// BR-LV-BDP-002: One policy per (legal_entity, absence_type) pair.
export const UpsertBackdatePolicySchema = z.object({
  legalEntityId:     z.string().uuid(),
  absenceTypeId:     z.string().uuid(),
  backdatingEnabled: z.boolean(),
  backdateLimitDays: z.number().int().min(0).nullable(),  // null = no limit when enabled
})
export type UpsertBackdatePolicyInput = z.infer<typeof UpsertBackdatePolicySchema>
