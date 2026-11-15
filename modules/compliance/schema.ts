/**
 * compliance schema re-exports — Sprint 2 skeleton.
 * UAE BR-xx rule catalogue plus medical insurance enrolments
 * (DHA / DOH / Northern-Emirates mandate compliance — BR-INS-001..010).
 */
export {
  complianceRules,
  medicalInsuranceEnrolments,
} from '@/drizzle/schema'

export type {
  ComplianceRule,
  MedicalInsuranceEnrolment,
  NewComplianceRule,
} from '@/drizzle/schema'
