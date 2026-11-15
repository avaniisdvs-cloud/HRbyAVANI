/**
 * Zod schemas for the contracts sub-module. Lives outside actions.ts so
 * the 'use server' file can satisfy "every export must be async".
 */
import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'

export const ContractTypeEnum   = z.enum(['FIXED_TERM']) // BR-CT-001
export const EmploymentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED'])
export const WorkLocationEnum   = z.enum(['OFFICE', 'REMOTE', 'HYBRID', 'FIELD'])

export const CreateContractSchema = z.object({
  personId:        z.string().uuid(),
  legalEntityId:   z.string().uuid(),
  contractType:    ContractTypeEnum.default('FIXED_TERM'),
  employmentType:  EmploymentTypeEnum,
  startDate:       hrDateString(),
  endDate:         hrDateString(),
  probationStart:  hrDateString().optional(),
  probationEnd:    hrDateString().optional(),
  noticePeriodDays:    z.number().int().min(0).max(180).default(30),
  workingHoursPerWeek: z.number().min(1).max(48).default(48),
  workLocation:        WorkLocationEnum.default('OFFICE'),
  contractDocumentId:  z.string().uuid().optional(),
  notes:               z.string().max(2000).optional(),
}).superRefine((d, ctx) => {
  // BR-CT-002: contract term must not exceed 3 years from start_date.
  const start = new Date(d.startDate)
  const end   = new Date(d.endDate)
  if (end <= start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'endDate must be after startDate' })
  }
  const threeYears = new Date(start)
  threeYears.setFullYear(threeYears.getFullYear() + 3)
  if (end > threeYears) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'BR-CT-002: contract term exceeds 3 years' })
  }
  // BR-PR-001: probation period max 6 months from start_date.
  if (d.probationEnd) {
    const probEnd = new Date(d.probationEnd)
    const sixMonths = new Date(start)
    sixMonths.setMonth(sixMonths.getMonth() + 6)
    if (probEnd > sixMonths) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probationEnd'], message: 'BR-PR-001: probation exceeds 6 months' })
    }
    if (probEnd < start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probationEnd'], message: 'probationEnd cannot precede startDate' })
    }
  }
})
export type CreateContractInput = z.infer<typeof CreateContractSchema>

export const AmendContractSchema = z.object({
  contractId:     z.string().uuid(),
  effectiveDate:  hrDateString(),
  reason:         z.string().min(1).max(500),
  newEndDate:        hrDateString().optional(),
  newEmploymentType: EmploymentTypeEnum.optional(),
  newWorkingHoursPerWeek: z.number().min(1).max(48).optional(),
  newWorkLocation:        WorkLocationEnum.optional(),
  newNoticePeriodDays:    z.number().int().min(0).max(180).optional(),
  notes:             z.string().max(2000).optional(),
})
export type AmendContractInput = z.infer<typeof AmendContractSchema>

export const TerminateContractSchema = z.object({
  contractId:        z.string().uuid(),
  terminationDate:   hrDateString(),
  terminationReason: z.string().min(1).max(200),
  notes:             z.string().max(2000).optional(),
})
export type TerminateContractInput = z.infer<typeof TerminateContractSchema>

// CORRECTION — in-place fix of a data-entry error (HR_DIRECTOR / SUPER_ADMIN only)
export const CorrectContractSchema = z.object({
  contractId:          z.string().uuid(),
  correctionNote:      z.string().min(1).max(1000),
  // All fields below are optional — only corrected fields need to be supplied
  employmentType:      EmploymentTypeEnum.optional(),
  startDate:           hrDateString().optional(),
  endDate:             hrDateString().optional(),
  probationEnd:        hrDateString().nullable().optional(),
  noticePeriodDays:    z.number().int().min(0).max(180).optional(),
  workingHoursPerWeek: z.number().min(1).max(48).optional(),
  workLocation:        WorkLocationEnum.optional(),
  notes:               z.string().max(2000).optional(),
}).refine(d => {
  // At least one field to correct must be provided
  const fields = ['employmentType', 'startDate', 'endDate', 'probationEnd',
                  'noticePeriodDays', 'workingHoursPerWeek', 'workLocation', 'notes'] as const
  return fields.some(f => d[f] !== undefined)
}, { message: 'At least one field must be provided for correction' })
export type CorrectContractInput = z.infer<typeof CorrectContractSchema>
