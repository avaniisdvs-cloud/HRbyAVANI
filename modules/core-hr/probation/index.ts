/**
 * Probation module barrel.
 * New workflow-driven actions are the canonical path for all probation changes.
 * The legacy confirmProbation action is kept for SUPER_ADMIN edge cases only.
 */

export {
  initiateProbationReview,
  submitLmRecommendation,
  applyProbationOutcome,
  finalizeProbationAfterSigning,
} from './workflow-actions'

/** @deprecated Use initiateProbationReview + workflow instead. Legacy direct-update action. */
export { confirmProbation } from './actions'
