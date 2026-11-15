import type { WorkflowInstanceDetailV2 } from '@/modules/workflow'

/** One row of workflow_intelligence_view, camelCased + coerced. */
export interface WorkflowIntelligenceRow {
  instanceId:              string
  tenantId:                string
  legalEntityId:           string
  workflowCode:            string
  workflowNameEn:          string
  workflowNameAr:          string | null
  status:                  string
  resourceStatus:          string
  resourceType:            string
  resourceId:              string
  initiatedByPersonId:     string
  initiatorName:           string | null
  currentStepOrder:        number
  totalSteps:              number
  currentStepName:         string | null
  currentApproverPersonId: string | null
  currentApproverName:     string | null
  nextStepName:            string | null
  nextApproverName:        string | null
  startedAt:               string
  ageHours:                number
  slaDeadline:             string | null
  slaHoursRemaining:       number | null
  isSlaBreached:           boolean
  escalatedAt:             string | null
  escalationCount:         number
  previousDecisions:       PreviousDecision[]
}

export interface PreviousDecision {
  stepOrder:    number
  stepName:     string | null
  approver:     string | null
  decision:     string | null
  decisionNote: string | null
  decidedAt:    string | null
}

/** Full authorized timeline: existing detail (steps + audit) + view intelligence. */
export interface WorkflowTimeline {
  instance:     WorkflowInstanceDetailV2
  intelligence: WorkflowIntelligenceRow | null
}

/** Compact bell projection (same auth gate as the timeline). */
export interface NotificationPreview {
  instanceId:            string
  workflowNameEn:        string
  status:                string
  resourceType:          string
  resourceId:            string
  currentStepName:       string | null
  currentApproverName:   string | null
  nextApproverName:      string | null
  previousDecisions:     PreviousDecision[]
  ageHours:              number
  isSlaBreached:         boolean
  viewerIsActiveApprover: boolean
  activeStepInstanceId:  string | null
}

export interface WorkflowOpsFilters {
  workflowCode?:     string
  status?:           string
  slaBreachedOnly?:  boolean
  limit?:            number
  offset?:           number
}

export interface WorkflowOpsResult {
  rows:  WorkflowIntelligenceRow[]
  total: number
  aggregates: {
    pending:    number
    breached:   number
    byApprover: Array<{ approver: string | null; count: number }>
  }
}
