/**
 * Workflow Intelligence — canonical read surface.
 * The single module that reads workflow_intelligence_view.
 *
 * 6 read services:
 *   1. getWorkflowTimeline            (this module — row-level authorized)
 *   2. getPendingApprovalsForUser     (re-exported; existing impl, unchanged)
 *   3. getApprovalHistoryForUser      (re-exported; existing impl, unchanged)
 *   4. getApprovalNotificationPreview (this module — same auth gate)
 *   5. getWorkflowOperations          (this module — HR+ org-wide, entity-scoped)
 *   6. getWorkflowIntelligence        (this module — ARIA-facing, scoped)
 */
export {
  getWorkflowTimeline,
  getApprovalNotificationPreview,
  getWorkflowOperations,
  getWorkflowIntelligence,
  getMyRequests,
} from './queries'

export type {
  WorkflowIntelligenceRow,
  WorkflowTimeline,
  NotificationPreview,
  PreviousDecision,
  WorkflowOpsFilters,
  WorkflowOpsResult,
} from './types'

// Re-homed (existing implementations kept verbatim — no behavior change).
export { getPendingApprovalsForUser } from '@/modules/aria'
export { getApprovalHistoryForUser } from '@/modules/workflow'
