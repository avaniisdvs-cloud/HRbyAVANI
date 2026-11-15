/**
 * payroll Zod validators.
 * Used by Server Actions to validate input before any DB write.
 */
import { z } from 'zod'

// ── Payroll Definition ────────────────────────────────────────────────────────

export const payrollDefinitionSchema = z.object({
  legalEntityId:        z.string().uuid('Legal entity required'),
  payrollCode:          z.string().min(1, 'Code required').max(30).toUpperCase(),
  payrollNameEn:        z.string().min(1, 'English name required').max(200),
  payrollNameAr:        z.string().max(200).optional().nullable(),
  payFrequency:         z.enum(['MONTHLY', 'BIWEEKLY', 'WEEKLY', 'OFF_CYCLE']),
  paymentDayOfMonth:    z.coerce.number().int().min(1).max(31),
  currency:             z.string().length(3).toUpperCase().default('AED'),
  legislativeDataGroup: z.string().max(50).default('UAE'),
  wpsBankCode:          z.string().max(20).optional().nullable(),
  oracleLedgerId:       z.string().max(50).optional().nullable(),
})

export type PayrollDefinitionInput = z.infer<typeof payrollDefinitionSchema>

// ── Payroll Run ───────────────────────────────────────────────────────────────

export const createPayrollRunSchema = z.object({
  payrollId:      z.string().uuid('Payroll definition required'),
  legalEntityId:  z.string().uuid('Legal entity required'),
  runType:        z.enum(['REGULAR', 'OFF_CYCLE', 'CORRECTION', 'FINAL_SETTLEMENT']),
  payPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  payPeriodEnd:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  paymentDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  notes:          z.string().max(2000).optional().nullable(),
})
  .refine(d => d.payPeriodEnd >= d.payPeriodStart, {
    message: 'Period end must be on or after period start',
    path: ['payPeriodEnd'],
  })
  .refine(d => d.paymentDate >= d.payPeriodStart, {
    message: 'Payment date must be on or after period start',
    path: ['paymentDate'],
  })

export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>

export const lockPayrollRunSchema = z.object({
  runId:      z.string().uuid(),
  lockReason: z.string().max(1000).optional().nullable(),
})

export const submitForApprovalSchema = z.object({
  runId: z.string().uuid(),
})

export const approvePayrollRunSchema = z.object({
  runId: z.string().uuid(),
  note:  z.string().max(1000).optional().nullable(),
})

export const rejectPayrollRunSchema = z.object({
  runId:  z.string().uuid(),
  reason: z.string().min(1, 'Rejection reason required').max(1000),
})

// ── Salary Element ────────────────────────────────────────────────────────────

export const salaryElementSchema = z.object({
  personId:              z.string().uuid('Person required'),
  assignmentId:          z.string().uuid('Assignment required'),
  legalEntityId:         z.string().uuid('Legal entity required'),
  payrollId:             z.string().uuid('Payroll definition required'),
  elementCode:           z.string().min(1, 'Element code required').max(50).toUpperCase(),
  elementNameEn:         z.string().min(1, 'English name required').max(200),
  elementNameAr:         z.string().max(200).optional().nullable(),
  elementClassification: z.enum(['EARNINGS', 'DEDUCTION', 'EMPLOYER_COST', 'EMPLOYER_LIABILITY', 'INFO']),
  amount:                z.coerce.number().min(0, 'Amount must be ≥ 0').optional().nullable(),
  percentageBasis:       z.string().max(30).optional().nullable(),
  percentageValue:       z.coerce.number().min(0).max(1).optional().nullable(),
  currency:              z.string().length(3).default('AED'),
  isRecurring:           z.boolean().default(true),
  effectiveStartDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  effectiveEndDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  processingOrder:       z.coerce.number().int().min(1).default(100),
  isSubjectToEosb:       z.boolean().default(false),
  isSubjectToGpssa:      z.boolean().default(false),
  isWpsReportable:       z.boolean().default(true),
  glAccountCode:         z.string().max(50).optional().nullable(),
  notes:                 z.string().max(2000).optional().nullable(),
})
  .refine(
    d => d.amount !== undefined || d.percentageValue !== undefined,
    { message: 'Either amount or percentage value is required' },
  )

export type SalaryElementInput = z.infer<typeof salaryElementSchema>

// ── WPS Staging ───────────────────────────────────────────────────────────────

export const wpsUpdateRecordSchema = z.object({
  sifRecordId:    z.string().uuid(),
  sifStatus:      z.enum(['INCLUDED', 'EXCLUDED', 'ON_HOLD']),
  exclusionReason: z.string().max(500).optional().nullable(),
})

export type WpsUpdateRecordInput = z.infer<typeof wpsUpdateRecordSchema>

// ── EOSB Manual Trigger ───────────────────────────────────────────────────────

export const eosbCalculationTriggerSchema = z.object({
  personId:         z.string().uuid(),
  legalEntityId:    z.string().uuid(),
  calculationType:  z.enum(['MONTHLY_PROVISION', 'ON_DEMAND_ESTIMATE', 'FINAL_SETTLEMENT']),
  calculationDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  terminationDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  payrollRunId:     z.string().uuid().optional().nullable(),
  notes:            z.string().max(1000).optional().nullable(),
})

export type EosbCalculationTriggerInput = z.infer<typeof eosbCalculationTriggerSchema>
