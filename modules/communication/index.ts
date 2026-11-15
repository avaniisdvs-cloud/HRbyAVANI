/**
 * Communication module public barrel (server-side consumers).
 *
 * Cross-module rule: other modules import from here, not from internal files.
 * NOTE: server actions live in ./actions ('use server') and are imported
 * directly by client components; they are intentionally not re-exported here.
 */
export { queueEmail, queueWorkflowApprovalEmail } from './orchestrator'
export {
  dispatchBatch,
  dispatchQueued,
  dispatchQueuedMessageById,
  retryFailedEmail,
  sendTestEmail,
  sendTemplateEmail,
} from './email-service'
export {
  buildEmploymentActionDecisionContext,
  buildGenericDecisionContext,
  buildLeaveDecisionContext,
  buildLetterRequestDecisionContext,
  renderDecisionContextHtml,
} from './decision-context'
export type {
  DecisionContext,
  DecisionContextFact,
  DecisionContextParty,
  DecisionContextType,
} from './decision-context'
export {
  EMAIL_DELIVERY_REJECTION_EVENT,
  emailDeliveryPolicyMetadata,
  validateEmailDeliveryPolicy,
} from './delivery-policy'
export {
  getActiveProvider,
  getActiveProviderRow,
  getSenderDefaults,
} from './settings'
export type { ProviderType, OutboundEmail, EmailProvider } from './providers/types'
