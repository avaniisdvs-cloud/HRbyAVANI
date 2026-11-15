/**
 * payroll public API barrel — Sprint 11/12.
 * Cross-module imports MUST come through this file (Hard Rule 6).
 */
export * from './schema'
export * from './types'

// Priority D — Payroll assignment history
export {
  assignToPayroll,
  correctPayrollAssignment,
  getPayrollAssignmentHistory,
  type AssignPayrollInput,
  type CorrectPayrollAssignmentInput,
} from './payroll-assignment-actions'
export { payrollAssignments, type PayrollAssignment } from '@/drizzle/schema'
export * from './validations'
export * from './queries'
// Re-export services — GpssaContribution interface takes precedence over schema table type
export { calculateEosb, calculateGpssaContribution, determineSuspensionPayTreatment } from './services'
export type { GpssaInput, GpssaContribution, EosbResult, EosbInput, SuspensionPayInput, SuspensionPayResult, SuspensionPayTreatment } from './services'
export * from './calculation-engine'
