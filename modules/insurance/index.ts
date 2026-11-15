/**
 * Medical Insurance module — public API.
 * All cross-module imports must go through this file.
 */

// Server Actions (HR Admin use)
export {
  getInsurancePlans,
  getInsurancePlan,
  createInsurancePlan,
  updateInsurancePlan,
  toggleInsurancePlanActive,
  getInsurancePolicySettings,
  upsertInsurancePolicySettings,
  enrolEmployee,
  enrolDependent,
  updateEnrolmentCard,
  cancelEnrolment,
  extendEnrolmentExpiry,
  grantContractorInsuranceException,
  getPersonEnrolments,
  getActiveEnrolment,
} from './actions'

// Tx-aware lifecycle helpers (for use inside other modules' transactions)
export {
  enrolEmployeeTx,
  enrolDependentTx,
  cancelEnrolmentTx,
  changePlanTx,
  getPolicySettingsTx,
} from './lifecycle'

export type { ChangePlanTxInput } from './lifecycle'

// Eligibility utilities
export { resolveEligiblePlan, checkDependentAgeEligibility } from './eligibility'

// Types
export type {
  CreateInsurancePlanInput,
  UpdateInsurancePlanInput,
  UpsertPolicySettingsInput,
  EnrolEmployeeInput,
  EnrolDependentInput,
  CancelEnrolmentInput,
  ExtendExpiryInput,
  GrantContractorExceptionInput,
} from './validations'
