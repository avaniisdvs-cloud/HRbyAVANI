/**
 * Workflow approval-inbox constants and types.
 *
 * NOT a 'use server' module — these are plain values/types shared by the inbox
 * query, the notification bell, and the dashboard so every surface uses ONE
 * definition of "actionable". (queries.ts is 'use server' and may only export
 * async functions, so the constants must live here.)
 */

/**
 * Workflow-instance statuses that still genuinely await an approver's action.
 * Anything else (APPROVED / REJECTED / CANCELLED / RECALLED) is terminal.
 */
export const ACTIONABLE_INSTANCE_STATUSES = ['PENDING', 'IN_PROGRESS', 'ESCALATED', 'ON_HOLD'] as const

/**
 * Underlying-resource statuses that make an approval step NON-actionable even
 * when the workflow instance/step row has not yet been reconciled. A leave that
 * was CANCELLED/REJECTED/WITHDRAWN/TAKEN must never be approvable, regardless of
 * the workflow row state (the two can diverge for legacy/seeded data — this is
 * the LR-0000001 class of defect). Keyed by resourceType; resource types not
 * listed here impose no extra constraint.
 */
export const TERMINAL_RESOURCE_STATUSES: Record<string, readonly string[]> = {
  absence_entries: ['CANCELLED', 'REJECTED', 'WITHDRAWN', 'TAKEN'],
}

export interface ApprovalInboxRow {
  // Identity
  stepInstanceId: string
  instanceId: string
  resourceId: string              // request id (e.g. absence entry id)
  stepId: string
  // Workflow context
  workflowCode: string
  workflowNameEn: string
  resourceType: string            // request type
  stepOrder: number
  stepName: string
  // People
  initiatorPersonId: string
  initiatorName: string
  assignedToPersonId: string | null   // assigned actor
  // Request detail (leave only; null otherwise)
  startDate: string | null
  endDate: string | null
  leaveTypeName: string | null
  // Status
  businessStatus: string | null   // underlying resource status
  workflowStatus: string          // workflow instance status
  // Actionability — the single contract every consumer obeys
  isActionable: boolean
  actionDisabledReason: string | null
  // SLA
  slaDeadline: Date | null
  isBreached: boolean
  hoursUntilBreach: number | null
  // Timeline
  startedAt: Date                 // submitted
  decidedAt: Date | null          // actioned (null while pending)
  // Capabilities
  isFyiOnly: boolean
  canDelegate: boolean
}
