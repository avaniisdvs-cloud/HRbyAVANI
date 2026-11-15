/**
 * workflow schema re-exports — Sprint 2 skeleton.
 * Definitions/stages/routing rules drive the engine; instances + delegations
 * are the operational state of in-flight approvals.
 */
export {
  workflowDefinitions,
  workflowStages,
  workflowRoutingRules,
  workflowInstances,
  approvalDelegations,
} from '@/drizzle/schema'

export type {
  WorkflowDefinition,
  WorkflowStage,
  WorkflowRoutingRule,
  WorkflowInstance,
  ApprovalDelegation,
  NewWorkflowInstance,
} from '@/drizzle/schema'
