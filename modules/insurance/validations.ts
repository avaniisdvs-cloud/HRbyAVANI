import { z } from 'zod'
import { isWithinBackdateGrace } from './utils'

const effectiveDateField = z
  .string()
  .min(1)
  .refine((d) => isWithinBackdateGrace(d, 30), {
    message: 'effectiveDate cannot be more than 30 days in the past',
  })

// ── Plan CRUD ──────────────────────────────────────────────────────────────

export const CreateInsurancePlanSchema = z.object({
  legalEntityId:        z.string().uuid(),
  planCode:             z.string().min(1).max(50),
  planNameEn:           z.string().min(1).max(200),
  planNameAr:           z.string().max(200).optional(),
  providerName:         z.string().min(1).max(200),
  tpaName:              z.string().max(200).optional(),
  policyNumber:         z.string().min(1).max(100),
  networkName:          z.string().max(100).optional(),
  planCategory:         z.enum(['ESSENTIAL_BENEFITS', 'BASIC', 'ENHANCED', 'PREMIUM', 'EXECUTIVE', 'CUSTOM']),
  inpatientLimitAed:    z.string().optional(),
  outpatientLimitAed:   z.string().optional(),
  dentalCovered:        z.boolean().default(false),
  opticalCovered:       z.boolean().default(false),
  maternityCovered:     z.boolean().default(true),
  preExistingCovered:   z.boolean().default(false),
  repatriationCovered:  z.boolean().default(false),
  gradeIds:             z.array(z.string().uuid()).optional(),
  employmentTypes:      z.array(z.string()).optional(),
  minServiceMonths:     z.number().int().min(0).default(0),
  dependentsCovered:    z.boolean().default(true),
  maxDependents:        z.number().int().min(0).default(9),
  employeePremiumAed:   z.string().min(1).refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, { message: 'employeePremiumAed must be a non-negative number' }),
  spousePremiumAed:     z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, { message: 'spousePremiumAed must be a non-negative number' }).optional(),
  childPremiumAed:      z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, { message: 'childPremiumAed must be a non-negative number' }).optional(),
  parentPremiumAed:     z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, { message: 'parentPremiumAed must be a non-negative number' }).optional(),
  policyStartDate:      z.string().min(1),
  policyEndDate:        z.string().min(1),
  renewalDate:          z.string().optional(),
  isDefaultPlan:        z.boolean().default(false),
  regulatoryScheme:     z.string().max(20).optional(),
  employerContributionPct: z.string().default('100'),
})

export const UpdateInsurancePlanSchema = CreateInsurancePlanSchema.partial().extend({
  id: z.string().uuid(),
})

export type CreateInsurancePlanInput = z.infer<typeof CreateInsurancePlanSchema>
export type UpdateInsurancePlanInput = z.infer<typeof UpdateInsurancePlanSchema>

// ── Policy Settings ────────────────────────────────────────────────────────

export const UpsertPolicySettingsSchema = z.object({
  legalEntityId:            z.string().uuid(),
  maxDependentsPerEmployee: z.number().int().min(0).default(9),
  maxSpouses:               z.number().int().min(0).default(1),
  maxChildren:              z.number().int().min(0).default(9),
  parentsCovered:           z.boolean().default(false),
  parentsInLawCovered:      z.boolean().default(false),
  childMaxAge:              z.number().int().min(0).default(18),
  childStudentExtensionAge: z.number().int().min(0).default(25),
  employerPaysSpouse:       z.boolean().default(true),
  employerPaysChildren:     z.boolean().default(true),
  employerPaysParents:      z.boolean().default(false),
  employeeDependentCostPct: z.string().default('0').refine(
    (v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0 && parseFloat(v) <= 100,
    { message: 'employeeDependentCostPct must be a number between 0 and 100' },
  ),
  autoEnrolOnHire:          z.boolean().default(true),
  enrolmentGraceDays:       z.number().int().min(0).default(30),
  dependentAddGraceDays:    z.number().int().min(0).default(30),
  renewalAlertDays:         z.array(z.number().int().min(1).max(365)).default([90, 60, 30, 14]),
})

export type UpsertPolicySettingsInput = z.infer<typeof UpsertPolicySettingsSchema>

// ── Enrolment ──────────────────────────────────────────────────────────────

export const EnrolEmployeeSchema = z.object({
  personId:      z.string().uuid(),
  legalEntityId: z.string().uuid(),
  planId:        z.string().uuid().optional(),   // resolved from eligibility if omitted
  effectiveDate: effectiveDateField,
  notes:         z.string().optional(),
})

export const EnrolDependentSchema = z.object({
  personId:      z.string().uuid(),
  dependentId:   z.string().uuid(),
  legalEntityId: z.string().uuid(),
  planId:        z.string().uuid().optional(),
  effectiveDate: effectiveDateField,
  isStudent:     z.boolean().optional(),
  notes:         z.string().optional(),
})

export const UpdateEnrolmentCardSchema = z.object({
  enrolmentId:          z.string().uuid(),
  insuranceCardNumber:  z.string().max(100).optional(),
  insuranceMemberId:    z.string().max(100).optional(),
  cardDocumentId:       z.string().uuid().optional(),
  submittedToInsurerDate: z.string().optional(),
  insurerReference:     z.string().max(100).optional(),
  notes:                z.string().optional(),
})

export const CancelEnrolmentSchema = z.object({
  enrolmentId:            z.string().uuid(),
  cancellationDate:       z.string().min(1),
  cancellationReason:     z.string().min(1).max(200),
  extensionDate:          z.string().optional(),
  extensionReason:        z.string().max(200).optional(),
})

export const GrantContractorExceptionSchema = z.object({
  workerAssignmentId: z.string().uuid(),
  personId:           z.string().uuid(),
  legalEntityId:      z.string().uuid(),
  planId:             z.string().uuid().optional(),
  effectiveDate:      z.string().min(1),
})

export const ExtendExpirySchema = z.object({
  enrolmentId:     z.string().uuid(),
  extensionDate:   z.string().min(1),
  extensionReason: z.string().min(1).max(200),
})

export type EnrolEmployeeInput           = z.infer<typeof EnrolEmployeeSchema>
export type EnrolDependentInput          = z.infer<typeof EnrolDependentSchema>
export type UpdateEnrolmentCardInput     = z.infer<typeof UpdateEnrolmentCardSchema>
export type CancelEnrolmentInput         = z.infer<typeof CancelEnrolmentSchema>
export type GrantContractorExceptionInput = z.infer<typeof GrantContractorExceptionSchema>
export type ExtendExpiryInput            = z.infer<typeof ExtendExpirySchema>
