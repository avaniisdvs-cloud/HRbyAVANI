/**
 * Insurance module schema re-exports.
 * Cross-module imports must go through modules/insurance/index.ts.
 */
export {
  medicalInsurancePlans,
  medicalInsuranceEnrolments,
  medicalInsurancePolicySettings,
} from '@/drizzle/schema'

export type {
  MedicalInsurancePlan,
  MedicalInsuranceEnrolment,
  MedicalInsurancePolicySetting,
} from '@/drizzle/schema'
