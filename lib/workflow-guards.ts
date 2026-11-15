/**
 * Foundation Stewardship P2-T3 — Workflow self-approval prevention.
 *
 * Segregation-of-duties guard: no actor may decide (approve/reject) a workflow
 * instance they initiated, and no step may be delegated to the instance
 * initiator or to the delegating actor themselves. Applies to ALL roles
 * including HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN — the privileged-role
 * override in takeWorkflowAction authorises acting on OTHERS' steps, never
 * on the actor's own request. Only the SYSTEM actor (SLA auto-actions,
 * cron-driven escalation) is exempt.
 *
 * Pure module — no DB access — so every future program (Payroll, Talent, …)
 * inherits identical semantics and the logic is unit-testable in isolation.
 */

export type WorkflowDecision = 'APPROVE' | 'REJECT' | 'DELEGATE'

export interface SelfApprovalGuardInput {
  decision:             WorkflowDecision
  actorPersonId:        string
  initiatedByPersonId:  string | null | undefined
  delegateToPersonId?:  string | null
  isSystemAction:       boolean
}

export interface SelfApprovalGuardResult {
  blocked: boolean
  /** Stable machine-readable code for audit + tests. */
  code?:   'SELF_APPROVAL' | 'SELF_REJECTION' | 'DELEGATE_TO_INITIATOR' | 'DELEGATE_TO_SELF'
  /** User-safe English message (BR-WF-SOD-001). */
  error?:  string
}

// BR-WF-SOD-001: a workflow participant must never be the effective decision
// maker on their own request, directly or via delegation.
export function evaluateSelfApprovalGuard(input: SelfApprovalGuardInput): SelfApprovalGuardResult {
  const { decision, actorPersonId, initiatedByPersonId, delegateToPersonId, isSystemAction } = input

  if (isSystemAction) return { blocked: false }
  if (!initiatedByPersonId) return { blocked: false }

  if (decision === 'APPROVE' && actorPersonId === initiatedByPersonId) {
    return {
      blocked: true,
      code:    'SELF_APPROVAL',
      error:   'SELF_APPROVAL_BLOCKED: You cannot approve a request you submitted. Another authorised approver must action it.',
    }
  }

  if (decision === 'REJECT' && actorPersonId === initiatedByPersonId) {
    return {
      blocked: true,
      code:    'SELF_REJECTION',
      error:   'SELF_APPROVAL_BLOCKED: You cannot reject your own request from the approval queue — withdraw it via Cancel instead.',
    }
  }

  if (decision === 'DELEGATE' && delegateToPersonId) {
    if (delegateToPersonId === initiatedByPersonId) {
      return {
        blocked: true,
        code:    'DELEGATE_TO_INITIATOR',
        error:   'SELF_APPROVAL_BLOCKED: This step cannot be delegated to the person who submitted the request.',
      }
    }
    if (delegateToPersonId === actorPersonId) {
      return {
        blocked: true,
        code:    'DELEGATE_TO_SELF',
        error:   'DELEGATION_BLOCKED: You cannot delegate a step to yourself.',
      }
    }
  }

  return { blocked: false }
}
