/**
 * workflow public API barrel.
 * Cross-module imports MUST come through this file (Hard Rule 6).
 */
export * from './schema'
export * from './types'

// v2 engine
export { submitWorkflow, takeWorkflowAction, previewWorkflow, processSLABreaches } from '@/lib/workflow-engine'
export { getActionableApprovalInbox, getPendingApprovalsV2, getWorkflowInstanceDetailV2, getMyWorkflowRequests, getWorkflowStatusForRequest, resolvePendingApprover, getApprovalHistoryForUser } from './queries'
export type { PendingApprovalV2, WorkflowInstanceDetailV2, MyRequestRow, WorkflowStatusDetail, PendingApproverInfo, ApprovalHistoryRow } from './queries'
export { ACTIONABLE_INSTANCE_STATUSES, TERMINAL_RESOURCE_STATUSES } from './constants'
export type { ApprovalInboxRow } from './constants'

// ME-1 — Employment-action workflow triggers (BR-WF-020/021/022)
export {
  triggerTransferApproval,
  triggerPromotionApproval,
  triggerTerminationApproval,
} from './actions'
export type {
  TransferWorkflowResult,
  PromotionWorkflowResult,
  TerminationWorkflowResult,
} from './actions'

// P2-4 / P2-3 — Probation confirmation + Exit clearance workflow triggers
export {
  triggerProbationConfirmationWorkflow,
  triggerExitClearanceWorkflow,
} from './actions'
export type {
  ProbationWorkflowResult,
  ExitClearanceWorkflowResult,
} from './actions'
