/**
 * ARIA module — public API barrel (Sprint 11).
 *
 * Hard Rule 8: other modules MUST import ARIA only through this file.
 * Server Actions ('use server') are the public write surface.
 * Types are re-exported for use in UI components.
 */

// ── Server Actions ────────────────────────────────────────────────────────
export { getPendingApprovalsForUser, getLeaveRecommendationForInstance, getLeaveRequestSummaryForInstance } from './approval-queries'
export type { PendingApproval, LeaveRequestSummary }       from './approval-queries'

export { generateLeaveRecommendation } from './leave-recommendation'

export { approveRequest, rejectRequest } from '@/modules/notification'

export { getPeopleIntelligence }   from './people-queries'
export type { PeopleIntelligence, DeptStat } from './people-queries'

export { sendAriaMessage, generateDailyBriefing } from './actions'
export { getEmployeeAriaContext, getManagerAriaContext }  from './employee-context'
export {
  getAriaConfig,
  updateAgentIdentity,
  updateAriaBranding,
  updateModelConfig,
  updateBehaviourConfig,
  uploadKnowledgeSource,
  deleteKnowledgeSource,
  testAriaConnection,
} from './config-actions'

export { getWorkflowSummary }           from './workflow-queries'
export type { WorkflowSummary, WorkflowItem } from './workflow-queries'

// ── OS View Actions ───────────────────────────────────────────────────────
export {
  getExpiryAlerts,
  getWorkflowPipeline,
  getComplianceData,
  getAuditLogEntries,
  getKnowledgeSources,
} from './os-actions'
export type {
  AlertItem,
  WorkflowRow,
  ComplianceData,
  AuditEntry,
  KnowledgeSource,
} from './os-actions'

// ── Employee / Manager Context Types ─────────────────────────────────────
export type { EmployeeAriaContext, ManagerAriaContext } from './employee-context'

// ── Types ─────────────────────────────────────────────────────────────────
export type {
  AriaIntentCode,
  AriaIntentResult,
  AriaIntentEntities,
  AriaSessionContext,
  AriaChatMessage,
  AriaRole,
  AriaResponse,
  AriaLeaveDraft,
  AriaTransferDraft,
  AriaLeaveRecommendationCode,
  AriaRecommendationFactor,
  AriaLeaveRecommendation,
} from './types'
