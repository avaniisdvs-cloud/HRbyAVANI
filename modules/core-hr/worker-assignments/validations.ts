import { z } from 'zod'
import { hrDateString } from '@/lib/validation/date-validators'

const ActionTypeEnum = z.enum([
  'HIRE', 'TRANSFER', 'PROMOTION', 'DEMOTION', 'SALARY_REVISION',
  'CONTRACT_EXTEND', 'SUSPEND', 'REINSTATE', 'TERMINATE', 'RETIRE',
  'SECONDMENT', 'RETURN_FROM_SECONDMENT',
])
const EmploymentTypeEnum = z.enum([
  'FULL_TIME', 'PART_TIME', 'TEMPORARY', 'TASK_BASED', 'FLEXIBLE', 'REMOTE', 'SHARED',
])

export const CreateWorkerAssignmentSchema = z.object({
  personId:           z.string().uuid(),
  legalEntityId:      z.string().uuid(),
  effectiveStartDate: hrDateString(),
  positionId:         z.string().uuid().optional(),
  jobId:              z.string().uuid().optional(),
  departmentId:       z.string().uuid(),
  locationId:         z.string().uuid().optional(),
  gradeId:            z.string().uuid().optional(),
  businessUnitId:     z.string().uuid().optional(),
  lineManagerId:       z.string().uuid().optional(),
  dottedLineManagerId: z.string().uuid().optional(),
  employmentType:         EmploymentTypeEnum,
  contractedHoursPerWeek: z.number().min(1).max(48).default(48),
  workScheduleId:         z.string().uuid().optional(),
  actionType:             ActionTypeEnum.default('HIRE'),
  actionReason:           z.string().max(200).optional(),
  primaryCostCentreCode:   z.string().max(50).optional(),
  secondaryCostCentreCode: z.string().max(50).optional(),
  costSplitPercentage:     z.number().min(0).max(100).optional(),
  notes:                   z.string().max(2000).optional(),
})
export type CreateWorkerAssignmentInput = z.infer<typeof CreateWorkerAssignmentSchema>

export const ChangeWorkerAssignmentSchema = z.object({
  personId:        z.string().uuid(),
  effectiveDate:   hrDateString(),
  actionType:      ActionTypeEnum,
  actionReason:    z.string().min(1).max(200),
  positionId:          z.string().uuid().optional(),
  jobId:               z.string().uuid().optional(),
  departmentId:        z.string().uuid().optional(),
  locationId:          z.string().uuid().optional(),
  gradeId:             z.string().uuid().optional(),
  businessUnitId:      z.string().uuid().optional(),
  lineManagerId:       z.string().uuid().optional(),
  dottedLineManagerId: z.string().uuid().optional(),
  employmentType:      EmploymentTypeEnum.optional(),
  contractedHoursPerWeek: z.number().min(1).max(48).optional(),
  workScheduleId:      z.string().uuid().optional(),
  primaryCostCentreCode:   z.string().max(50).optional(),
  secondaryCostCentreCode: z.string().max(50).optional(),
  costSplitPercentage:     z.number().min(0).max(100).optional(),
  notes:                   z.string().max(2000).optional(),
})
export type ChangeWorkerAssignmentInput = z.infer<typeof ChangeWorkerAssignmentSchema>
