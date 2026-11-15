/**
 * compliance public API barrel — Sprint 2 / Sprint 10.
 * Cross-module imports MUST come through this file (Hard Rule 6).
 */
export * from './schema'
export * from './types'

// Server Actions
export {
  updateComplianceRule,
  type UpdateComplianceRuleInput,
} from './actions'
