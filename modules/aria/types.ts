/**
 * ARIA module — TypeScript types (Sprint 11).
 *
 * Hard Rule 8: ARIA cross-module calls only via module index.ts barrels.
 */

// ── Intent classification ─────────────────────────────────────────────────

export type AriaIntentCode =
  | 'LEAVE_BALANCE_QUERY'
  | 'ORG_CHART_QUERY'
  | 'LEAVE_REQUEST_STATUS'
  | 'LEAVE_REQUEST_DRAFT'
  | 'LEAVE_REQUEST_CONFIRM'
  | 'LEAVE_REQUEST_CANCEL'
  | 'DEPARTMENT_QUERY'
  | 'HEADCOUNT_QUERY'
  | 'COMPLIANCE_QUERY'
  | 'WORKFLOW_QUERY'
  | 'POLICY_QUERY'
  | 'TEAM_QUERY'
  | 'TRANSFER_REQUEST_DRAFT'
  | 'TRANSFER_REQUEST_CONFIRM'
  | 'TRANSFER_REQUEST_CANCEL'
  | 'PROMOTION_REQUEST_DRAFT'
  | 'EXECUTIVE_SUMMARY'

export interface AriaIntentResult {
  intent:     AriaIntentCode | null
  language:   'en' | 'ar'
  confidence: number
  entities:   AriaIntentEntities
}

export interface AriaIntentEntities {
  leave_type?:       string
  start_date?:       string
  end_date?:         string
  days?:             number
  notes?:            string
  target_person_id?: string
  active_only?:      boolean
  scope?:            'total' | 'on_leave' | 'new_hires' | 'by_department'
  topic?:            string
  // Transfer / promotion entities
  target_department?: string   // department name or code (resolved to an id)
  target_grade?:      string   // grade code, name, or level (resolved to an id) — promotion
  effective_date?:    string   // YYYY-MM-DD
  transfer_reason?:   string   // CAREER_GROWTH | ORG_NEED | PERFORMANCE | PERSONAL | OTHER
}

// ── Session context — passed with every message ───────────────────────────

export interface AriaSessionContext {
  personId:         string
  role:             string
  legalEntityId:    string
  legalEntityName?: string
  language:         'en' | 'ar'
  userName?:        string
}

// ── Chat message ──────────────────────────────────────────────────────────

export type AriaRole = 'user' | 'assistant'

export interface AriaChatMessage {
  role:    AriaRole
  content: string
}

// ── Response returned to the UI ───────────────────────────────────────────

export interface AriaResponse {
  message:      string
  intentCode:   AriaIntentCode | null
  dataSource:   string | null
  language:     'en' | 'ar'
  /** Pending leave draft — carried in UI state for the confirmation step */
  pendingDraft?: AriaLeaveDraft
  /** Pending transfer/promotion draft — separate carrier so the leave flow is untouched */
  pendingTransferDraft?: AriaTransferDraft
  /** Optional quick-reply suggestions shown as pill buttons in the UI */
  quickReplies?: string[]
}

// ── Transfer draft (Phase 4 confirmation flow) ────────────────────────────
// Read-only snapshot ARIA shows for confirmation. On Yes, submitConfirmedTransfer
// calls the core-hr requestTransfer orchestrator (create request + start approval).
// ARIA never applies the change directly — the workflow engine does, on approval.

export interface AriaTransferDraft {
  requestType:          'TRANSFER' | 'PROMOTION'
  personId:             string
  personName:           string
  // Transfer target (department); Promotion target (grade). One applies per requestType.
  targetDepartmentId?:  string
  targetDepartmentName?: string
  targetGradeId?:       string
  targetGradeName?:     string
  targetPositionId?:    string
  effectiveDate:        string   // YYYY-MM-DD
  reason:               string   // CAREER_GROWTH | ORG_NEED | PERFORMANCE | PERSONAL | OTHER
}

// ── Leave draft (S11-06 confirmation flow) ────────────────────────────────

export interface AriaLeaveDraft {
  absenceTypeId:   string
  absenceTypeCode: string
  absenceTypeNameEn: string
  absenceTypeNameAr: string
  startDate:       string
  endDate:         string
  durationDays:    number
  currentBalanceDays: number
  balanceAfterDays:   number
  /**
   * The legal entity ID resolved from the employee's active worker assignment
   * (may differ from ctx.legalEntityId sourced from session auth).
   * Used by submitConfirmedLeaveRequest to avoid cross-entity scope errors.
   */
  legalEntityId:   string
  /**
   * True when an absence_balances row exists for this person/type/year.
   * False means the accrual engine hasn't initialised balances yet (show
   * "contact HR" note rather than treating as a genuine 0-day balance).
   */
  balanceSeeded:   boolean
}

// ── ARIA Leave Approval Recommendation ───────────────────────────────────────

export type AriaLeaveRecommendationCode = 'APPROVE' | 'REJECT' | 'REVIEW'

export interface AriaRecommendationFactor {
  /** Factor name, e.g. 'Balance', 'Team Coverage', 'Compliance', 'Notice Period', 'History' */
  factor:   string
  status:   'OK' | 'WARN' | 'FAIL'
  detailEn: string
  detailAr: string
}

export interface AriaLeaveRecommendation {
  recommendation: AriaLeaveRecommendationCode
  /** 0.0 – 1.0 */
  confidence:     number
  summaryEn:      string
  summaryAr:      string
  factors:        AriaRecommendationFactor[]
  /** ISO timestamp of generation */
  generatedAt:    string
  /** Model used, e.g. claude-sonnet-4-6 */
  model:          string
}
