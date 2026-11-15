import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'

export const HireSchema = z.object({
  personId:           z.string().uuid(),
  legalEntityId:      z.string().uuid(),
  effectiveStartDate: hrDateString(),
  positionId:         z.string().uuid().optional(),
  jobId:              z.string().uuid().optional(),
  departmentId:       z.string().uuid(),
  locationId:         z.string().uuid().optional(),
  gradeId:            z.string().uuid().optional(),
  businessUnitId:     z.string().uuid().optional(),
  lineManagerId:      z.string().uuid().optional(),
  employmentType:     z.enum(['FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED']),
  contractedHoursPerWeek: z.number().min(1).max(48).default(48),
  reasonText:         z.string().max(500).optional(),
})
export type HireInput = z.infer<typeof HireSchema>

export const TransferSchema = z.object({
  personId:        z.string().uuid(),
  effectiveDate:   hrDateString(),
  reasonText:      z.string().min(1).max(500),
  newDepartmentId:       z.string().uuid().optional(),
  newLocationId:         z.string().uuid().optional(),
  newBusinessUnitId:     z.string().uuid().optional(),
  newLineManagerId:      z.string().uuid().optional(),
  // BR-PRJ-001: project cost-centre assignment (optional)
  newProjectId:          z.string().uuid().optional(),
  newProjectAllocationPct: z.number().min(0).max(100).optional(),
})
export type TransferInput = z.infer<typeof TransferSchema>

export const PromotionSchema = z.object({
  personId:      z.string().uuid(),
  effectiveDate: hrDateString(),
  reasonText:    z.string().min(1).max(500),
  newGradeId:    z.string().uuid(),
  newPositionId: z.string().uuid().optional(),
  newJobId:      z.string().uuid().optional(),
})
export type PromotionInput = z.infer<typeof PromotionSchema>

export const GradeChangeSchema = z.object({
  personId:      z.string().uuid(),
  effectiveDate: hrDateString(),
  reasonText:    z.string().min(1).max(500),
  newGradeId:    z.string().uuid(),
})
export type GradeChangeInput = z.infer<typeof GradeChangeSchema>
