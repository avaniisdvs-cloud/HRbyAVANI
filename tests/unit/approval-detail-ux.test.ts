import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { friendlyAuditLabel, AUDIT_LABELS } from '@/lib/workflow-audit-labels'

/**
 * Approval Detail Page UX hardening — ADX-001 … ADX-020
 *
 * Fixes (this session):
 *  1. "Request summary" card added so HR Admin sees what leave was requested.
 *  2. Header subtitle describes the request in plain English.
 *  3. ARIA recommendation: generate-on-demand if missing; NEVER an indefinite
 *     "being generated" state — graceful "unavailable, review manually" fallback.
 *  4. Audit trail shows business-friendly labels (raw ENUM only in logs).
 *
 * friendlyAuditLabel is a pure function → tested directly.
 * Page / card / query wiring → source-inspection (matches repo convention).
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const PAGE    = read('app/(hr-admin)/approvals/[instanceId]/page.tsx')
const CARD    = read('components/aria/AriaRecommendationCard.tsx')
const QUERIES = read('modules/aria/approval-queries.ts')
const ENGINE  = read('lib/workflow-engine.ts')
const INBOX   = read('app/(hr-admin)/approvals/page.tsx')
const SIDEBAR = read('components/employee/EmployeeSidebar.tsx')
const WFQ     = read('modules/workflow/queries.ts')

describe('Audit trail business-friendly labels (ADX-001…008)', () => {
  it('ADX-001: SUBMITTED → "Request submitted"', () => {
    expect(friendlyAuditLabel('SUBMITTED')).toBe('Request submitted')
  })
  it('ADX-002: TOKEN_ISSUED → "Approval request sent"', () => {
    expect(friendlyAuditLabel('TOKEN_ISSUED')).toBe('Approval request sent')
  })
  it('ADX-003: STEP_APPROVED → "Approved"', () => {
    expect(friendlyAuditLabel('STEP_APPROVED')).toBe('Approved')
  })
  it('ADX-004: STEP_REJECTED → "Rejected"', () => {
    expect(friendlyAuditLabel('STEP_REJECTED')).toBe('Rejected')
  })
  it('ADX-005: unknown action falls back to Title Case (no ENUM jargon)', () => {
    expect(friendlyAuditLabel('SOME_NEW_EVENT')).toBe('Some New Event')
    expect(friendlyAuditLabel('SOME_NEW_EVENT')).not.toContain('_')
  })
  it('ADX-006: every known label has both EN and AR', () => {
    for (const [, v] of Object.entries(AUDIT_LABELS)) {
      expect(v.en.length).toBeGreaterThan(0)
      expect(v.ar.length).toBeGreaterThan(0)
    }
  })
  it('ADX-007: Arabic variant differs from English', () => {
    expect(friendlyAuditLabel('SUBMITTED', 'ar')).toBe('تم تقديم الطلب')
    expect(friendlyAuditLabel('SUBMITTED', 'ar')).not.toBe(friendlyAuditLabel('SUBMITTED', 'en'))
  })
  it('ADX-008: audit labels use friendlyAuditLabel (now in the shared WorkflowTimeline), never raw replace(/_/g)', () => {
    // Phase B moved audit rendering into components/workflow/WorkflowTimeline.tsx.
    const TIMELINE = read('components/workflow/WorkflowTimeline.tsx')
    expect(TIMELINE).toContain('friendlyAuditLabel(e.action')
    expect(PAGE).not.toContain("e.action.replace(/_/g")
  })
})

describe('ARIA card — no indefinite "being generated" (ADX-009…012)', () => {
  it('ADX-009: card no longer renders "being generated"', () => {
    expect(CARD).not.toContain('being generated')
  })
  it('ADX-010: card renders an unavailable fallback (EN)', () => {
    expect(CARD).toContain('ARIA recommendation is unavailable. Please review the request details manually.')
  })
  it('ADX-011: card renders an unavailable fallback (AR)', () => {
    expect(CARD).toContain('توصية ARIA غير متاحة')
  })
  it('ADX-012: null recommendation → Unavailable, not Skeleton', () => {
    expect(CARD).toContain('if (!rec) return <Unavailable')
    expect(CARD).not.toContain('function Skeleton')
  })
})

describe('ARIA recommendation fetch is read-only (ADX-013…014)', () => {
  // SUPERSEDED by the P1 review-performance hotfix: the render-path fetch must NOT
  // generate (no synchronous Claude call). Generation is asynchronous only.
  it('ADX-013: getLeaveRecommendationForInstance does NOT generate on the render path', () => {
    const fn = QUERIES.slice(QUERIES.indexOf('export async function getLeaveRecommendationForInstance'))
    expect(fn).not.toContain('generateLeaveRecommendation')
  })
  it('ADX-014: missing recommendation returns null (→ fallback), no re-read/generate loop', () => {
    expect(QUERIES).toContain('if (!row.ariaRecommendationJson) return null')
    expect(QUERIES).not.toContain('const [refreshed] = await read()')
  })
})

describe('Leave request summary visible to approver (ADX-015…020)', () => {
  it('ADX-015: summary query selects employee identity', () => {
    expect(QUERIES).toContain('employeeName:    persons.fullNameEn')
    expect(QUERIES).toContain('employeeNumber:  persons.personNumber')
  })
  it('ADX-016: summary query selects type, dates, duration', () => {
    expect(QUERIES).toContain('typeNameEn:      absenceTypes.typeNameEn')
    expect(QUERIES).toContain('startDate:       absenceEntries.startDate')
    expect(QUERIES).toContain('durationDays:    absenceEntries.durationDays')
  })
  it('ADX-017: summary query selects half-day, notes, balance, attachment', () => {
    expect(QUERIES).toContain('isHalfDay:       absenceEntries.isHalfDay')
    expect(QUERIES).toContain('notes:           absenceEntries.notes')
    expect(QUERIES).toContain('balanceBefore:   absenceEntries.balanceBeforeDays')
    expect(QUERIES).toContain('attachmentId:    absenceEntries.medicalCertDocumentId')
  })
  it('ADX-018: page renders the "Leave Request Details" section with core fields', () => {
    expect(PAGE).toContain('Leave Request Details')
    expect(PAGE).toContain("['Employee',")
    expect(PAGE).toContain("['Leave type',")
    expect(PAGE).toContain("['Duration',")
    expect(PAGE).toContain("['Reason / comments',")
    expect(PAGE).toContain("['Attachment',")
  })
  it('ADX-019: page builds a plain-English request summary subtitle', () => {
    expect(PAGE).toContain('requestSummaryLine')
    expect(PAGE).toContain('pending ${currentPendingStep.stepName} approval')
  })
  it('ADX-020: inbox leave-detail filter uses correct resourceType', () => {
    expect(QUERIES).toContain("r.resourceType === 'absence_entries' && r.resourceId")
    expect(QUERIES).not.toContain("r.resourceType === 'LEAVE_REQUEST'")
  })
})

describe('Review page improvements — top actions · balance · two-column (RVI-001…006)', () => {
  it('RVI-001: a single decision area avoids duplicated controls', () => {
    const count = (PAGE.match(/<WorkflowActionForm/g) || []).length
    expect(count).toBe(1)
  })
  it('RVI-002: responsive two-column layout (stacks on mobile, sidebar on lg+)', () => {
    expect(PAGE).toContain('lg:grid-cols-[minmax(0,1fr)_340px]')
  })
  it('RVI-003: chain on the left, audit/history on the right (single shared component)', () => {
    expect(PAGE).toContain('sections={{ summary: true, chain: true, audit: false }}')
    expect(PAGE).toContain('sections={{ summary: false, chain: false, audit: true }}')
  })
  it('RVI-004: ARIA recommendation lives in the right sidebar', () => {
    // ARIA card + the audit-only timeline are in the same (sticky) right column
    expect(PAGE).toMatch(/position: 'sticky'[\s\S]*AriaRecommendationCard[\s\S]*audit: true/)
  })
  it('RVI-005: WorkflowTimeline supports section toggles (no duplicate timeline component)', () => {
    const TL = read('components/workflow/WorkflowTimeline.tsx')
    expect(TL).toContain('sections?: { summary?: boolean; chain?: boolean; audit?: boolean }')
    expect(TL).toContain('{show.chain && (')
    expect(TL).toContain('{show.audit && (')
  })
  it('RVI-006: balance falls back to a live computation from absence_balances when the snapshot is null', () => {
    // Updated for Option A: the legacy fallback now recomputes from the component
    // ledger (same formula as the submission gate), NOT the closing-balance cache.
    // See LBS-007 for the formula assertion.
    const Q = read('modules/aria/approval-queries.ts')
    expect(Q).toContain('absenceBalances')
    expect(Q).toContain("if (balanceSource !== 'snapshot'")
    expect(Q).toContain('balanceAfter  = Math.round((available - duration) * 100) / 100')
  })
})

describe('Unified approvals — single review screen for all roles (WFD-001…004)', () => {
  const WF  = read('app/(hr-admin)/workflows/[instanceId]/page.tsx')
  const MNAV = read('config/manager-nav.ts')
  const ANAV = read('config/admin-nav.ts')
  const ESB  = read('components/employee/EmployeeSidebar.tsx')
  it('WFD-001: legacy /workflows/[instanceId] redirects to the unified /approvals/[instanceId]', () => {
    expect(WF).toContain('redirect(`/approvals/${instanceId}`)')
  })
  it('WFD-002: Manager "Approvals" nav points to /approvals (not /workflows)', () => {
    expect(MNAV).toContain("route:   '/approvals'")
    expect(MNAV).not.toMatch(/labelEn: 'Approvals',[\s\S]{0,120}route:\s*'\/workflows'/)
  })
  it('WFD-003: every role has an "Approvals" menu → /approvals', () => {
    expect(MNAV).toContain("labelEn: 'Approvals'")
    expect(ANAV).toContain("labelEn: 'Approvals'")
    expect(ESB).toContain("href: '/approvals'")
  })
  it('WFD-004: the unified review page shows full leave details (lives on /approvals/[instanceId])', () => {
    expect(PAGE).toContain('Leave Request Details')
    expect(PAGE).toContain("['Reason / comments',")
  })
})

describe('Leave Request Details on approval review — P1 defect guard (LRD-001…006)', () => {
  it('LRD-001: a clearly-labeled "Leave Request Details" section exists', () => {
    expect(PAGE).toContain('Leave Request Details')
  })
  it('LRD-002: all required approval fields are present', () => {
    for (const f of ["['Employee',", "['Leave type',", "['Start date',", "['End date',",
      "['Duration',", "['Reason / comments',", "['Submitted',", "['Current status',",
      "['Current approver',", "['Attachment',"]) {
      expect(PAGE).toContain(f)
    }
  })
  it('LRD-003: details are loaded via the resource-specific data loader for absence_entries', () => {
    expect(PAGE).toContain('getLeaveRequestSummaryForInstance(instanceId)')
  })
  it('LRD-004: WorkflowTimeline is NOT removed (rendered alongside the details)', () => {
    expect(PAGE).toContain('<WorkflowTimeline data={timeline}')
  })
  it('LRD-005: never silently blank — fallback when a leave instance has no details', () => {
    expect(PAGE).toContain("!leave && detail.resourceType === 'absence_entries'")
    expect(PAGE).toContain('could not be loaded')
  })
  it('LRD-006: still fast — no synchronous ARIA generation on the page', () => {
    expect(PAGE).not.toContain('generateLeaveRecommendation')
  })
})

describe('IN_APP bell notification for downstream approvers (ADX-021…025)', () => {
  // Isolate the activateNextStep function body for assertions.
  const fnStart = ENGINE.indexOf('async function activateNextStep')
  const fnEnd   = ENGINE.indexOf('\n// ', fnStart) // next top-level section comment
  const ACTIVATE = ENGINE.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 4000)

  it('ADX-021: activateNextStep inserts into notificationLog', () => {
    expect(ACTIVATE).toContain('tx.insert(notificationLog)')
  })
  it('ADX-022: the notification is IN_APP (bell), to the next approver', () => {
    expect(ACTIVATE).toContain("channel:           'IN_APP'")
    expect(ACTIVATE).toContain('recipientPersonId: next.assignedToPersonId')
  })
  it('ADX-023: notification is created only when there is an assigned approver', () => {
    // The insert must live inside the `if (next.assignedToPersonId)` guard.
    const guardIdx  = ACTIVATE.indexOf('if (next.assignedToPersonId)')
    const insertIdx = ACTIVATE.indexOf('tx.insert(notificationLog)')
    expect(guardIdx).toBeGreaterThanOrEqual(0)
    expect(insertIdx).toBeGreaterThan(guardIdx)
  })
  it('ADX-024: notification references the workflow instance', () => {
    expect(ACTIVATE).toContain("referenceType:     'WORKFLOW_INSTANCE'")
    expect(ACTIVATE).toContain('referenceId:       instanceId')
  })
  it('ADX-025: insert uses the post-claim transaction (tx), not bare db', () => {
    expect(ACTIVATE).toContain('await tx.insert(notificationLog)')
    expect(ACTIVATE).not.toContain('await db.insert(notificationLog)')
  })
})

describe('/approvals tabs — Pending + History (ADX-026…031)', () => {
  it('ADX-026: inbox renders a Pending tab and a My-decisions (history) tab', () => {
    expect(INBOX).toContain("labelEn: 'Pending'")
    expect(INBOX).toContain("labelEn: 'My decisions'")
    expect(INBOX).toContain("href: '/approvals?tab=history'")
  })
  it('ADX-027: inbox loads pending + history data', () => {
    expect(INBOX).toContain('getPendingApprovalsV2()')
    expect(INBOX).toContain('getApprovalHistoryForUser()')
  })
  it('ADX-028: active tab is driven by ?tab=history', () => {
    expect(INBOX).toContain("tab === 'history' ? 'history' : 'pending'")
  })
  it('ADX-029: history tab shows decision, decided-at, current status, next approver', () => {
    expect(INBOX).toContain('DecisionPill')
    expect(INBOX).toContain("'My decision'")
    expect(INBOX).toContain("'Current status'")
    expect(INBOX).toContain("'Now with'")
  })
  it('ADX-030: approved items move to history (not lost) — history empty-state copy', () => {
    expect(INBOX).toContain('Requests you approve, reject, or delegate will appear here.')
  })
  it('ADX-031: history rows link to the full detail page', () => {
    expect(INBOX).toContain('href={`/approvals/${r.instanceId}`}')
  })
})

describe('getApprovalHistoryForUser query (ADX-032…035)', () => {
  it('ADX-032: filters by the current user as decider', () => {
    expect(WFQ).toContain('eq(workflowStepInstances.decidedByPersonId, user.personId)')
  })
  it('ADX-033: returns the user decision + decided timestamp', () => {
    expect(WFQ).toContain('myDecision:     workflowStepInstances.decision')
    expect(WFQ).toContain('decidedAt:      workflowStepInstances.decidedAt')
  })
  it('ADX-034: surfaces the current/next pending approver', () => {
    expect(WFQ).toContain("eq(workflowStepInstances.status, 'PENDING')")
    expect(WFQ).toContain('currentApproverName')
  })
  it('ADX-035: enriches leave requests with type + dates', () => {
    expect(WFQ).toContain('leaveStartDate')
    expect(WFQ).toContain('leaveTypeName')
  })
})

describe('Detail page read-only / active-approver states (ADX-036…038)', () => {
  it('ADX-036: action form only for the active assigned approver', () => {
    expect(PAGE).toContain('!isComplete && myPendingStep')
    expect(PAGE).toContain('<WorkflowActionForm')
  })
  it('ADX-037: View-only notice when in-progress but not the active approver', () => {
    expect(PAGE).toContain('!isComplete && !myPendingStep')
    expect(PAGE).toContain('View only.')
  })
  it('ADX-038: already-actioned approver sees their decision read-only', () => {
    expect(PAGE).toContain('myDecidedStep')
    expect(PAGE).toContain('You already actioned the')
  })
})

describe('Approvals sidebar item (ADX-039…040)', () => {
  it('ADX-039: employee sidebar has an Approvals item → /approvals', () => {
    expect(SIDEBAR).toContain("href: '/approvals'")
    expect(SIDEBAR).toContain("labelEn: 'Approvals'")
  })
  it('ADX-040: Approvals item is bilingual (Arabic label present)', () => {
    expect(SIDEBAR).toContain('الموافقات')
  })
})

/**
 * Option A — immutable leave-balance snapshot (LBS-001 … LBS-010)
 *
 * Approved scope:
 *   1. Persist balance_before_days / balance_after_days at SUBMISSION time.
 *   2. Use the authoritative submission-gate formula
 *      (opening + accrued + carriedForward + adjusted − taken − pending − forfeited).
 *   3. Treat the stored values as immutable audit snapshots.
 *   4. Review page reads the persisted snapshot FIRST.
 *   5. Legacy null-snapshot rows fall back to the LIVE balance, clearly LABELLED
 *      as current (not as-of-submission).
 */
const ACTIONS = read('modules/absence/actions.ts')

describe('Leave balance immutable snapshot — Option A (LBS-001…010)', () => {
  // 1) Write side — captured at submission, inside the balance block.
  //    Snapshot is computed from the multi-year aggregate: balance BEFORE this
  //    request's reservation (`aggBefore`) and AFTER (`aggBefore - aggReserved`).
  //    Matchers assert field + source variable, not the exact rounding form, so
  //    a safe refactor of the arithmetic does not break the contract.
  it('LBS-001: submit path writes balance_before/after onto absence_entries', () => {
    expect(ACTIONS).toMatch(/balanceBeforeDays:\s*String\([^)]*aggBefore/)
    expect(ACTIONS).toMatch(/balanceAfterDays:\s*String\(.*aggBefore - aggReserved/)
  })
  it('LBS-002: snapshot is written for the submitted request (requestId)', () => {
    const i = ACTIONS.search(/balanceBeforeDays:\s*String\([^)]*aggBefore/)
    expect(i).toBeGreaterThan(-1)
    // the .where targeting this request id appears just after the set()
    expect(ACTIONS.slice(i, i + 400)).toContain('eq(absenceEntries.id, requestId)')
  })
  it('LBS-003: snapshot uses the authoritative computeClosingBalance value', () => {
    // `available` is the computeClosingBalance(...) result used by the gate
    expect(ACTIONS).toContain('const available = computeClosingBalance({')
  })
  it('LBS-004: snapshot is documented as an immutable / submission-time audit value', () => {
    expect(ACTIONS).toContain('Option A — IMMUTABLE audit snapshot')
    expect(ACTIONS).toContain('SUBMISSION time')
  })

  // 2) Read side — prefer snapshot, fall back to live via the same formula.
  it('LBS-005: read query selects the persisted snapshot columns first', () => {
    expect(QUERIES).toContain('balanceBefore:   absenceEntries.balanceBeforeDays')
    expect(QUERIES).toContain('balanceAfter:    absenceEntries.balanceAfterDays')
  })
  it('LBS-006: balanceSource resolves to snapshot when both values are present', () => {
    expect(QUERIES).toContain("(balanceBefore !== null && balanceAfter !== null) ? 'snapshot' : 'none'")
  })
  it('LBS-007: legacy fallback recomputes via the component formula, not the closing cache', () => {
    expect(QUERIES).toContain('num(bal.opening) + num(bal.accrued) + num(bal.carriedForward) + num(bal.adjusted)')
    expect(QUERIES).toContain('- num(bal.taken) - num(bal.pending) - num(bal.forfeited)')
    expect(QUERIES).toContain("balanceSource = 'live'")
  })
  it('LBS-008: fallback only runs when the snapshot is absent', () => {
    expect(QUERIES).toContain("if (balanceSource !== 'snapshot'")
  })
  it('LBS-009: LeaveRequestSummary type exposes balanceSource provenance', () => {
    expect(QUERIES).toContain("balanceSource:  'snapshot' | 'live' | 'none'")
  })

  // 3) UI — live fallback is clearly labelled on the review page.
  it('LBS-010: review page labels live balance as legacy fallback / not-as-of-submission', () => {
    expect(PAGE).toContain("leave.balanceSource === 'live'")
    expect(PAGE).toContain('legacy fallback — not as-of-submission')
  })
})

/**
 * Balance-control fail-closed gate — Option A follow-up (LBC-001 … LBC-008)
 *
 * BR-LV-BAL-001: a balance-CONTROLLED leave type (absence_types.requires_balance)
 * MUST have an initialized absence_balances row for the request year, or
 * submission is BLOCKED. Non-controlled types submit freely and display the
 * balance as "not applicable". Never silently allow controlled leave with
 * missing balance data.
 */
const SCHEMA    = read('drizzle/schema/foundation.ts')
const APP_ERROR = read('lib/app-error.ts')
const MIGRATION = read('drizzle/migrations/0061_absence_type_requires_balance.sql')

describe('Balance-control fail-closed gate — BR-LV-BAL-001 (LBC-001…008)', () => {
  it('LBC-001: absence_types has a requires_balance column (default true = fail-closed)', () => {
    expect(SCHEMA).toContain("requiresBalance:        boolean('requires_balance').notNull().default(true)")
  })
  it('LBC-002: migration 0061 adds requires_balance idempotently', () => {
    expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS requires_balance boolean NOT NULL DEFAULT true')
  })
  it('LBC-003: migration backfills balance-control from the accrual-plan link', () => {
    expect(MIGRATION).toContain('SET requires_balance = (absence_plan_id IS NOT NULL)')
  })
  it('LBC-004: submit blocks balance-controlled leave when no balance row exists', () => {
    expect(ACTIONS).toContain('if (absType.requiresBalance && !bal) {')
    expect(ACTIONS).toContain('BALANCE_NOT_INITIALIZED:')
  })
  it('LBC-005: the block error is bilingual (EN · AR)', () => {
    const i = ACTIONS.indexOf('BALANCE_NOT_INITIALIZED:')
    expect(ACTIONS.slice(i, i + 600)).toContain('Please contact HR to initialize')
    expect(ACTIONS.slice(i, i + 600)).toContain('الموارد البشرية')
  })
  it('LBC-006: submit reads requiresBalance from the absence type', () => {
    expect(ACTIONS).toContain('requiresBalance: absenceTypes.requiresBalance')
  })
  it('LBC-007: app-error surfaces BALANCE_NOT_INITIALIZED (prefix stripped, body kept)', () => {
    expect(APP_ERROR).toContain("msg.startsWith('BALANCE_NOT_INITIALIZED:')")
  })
  it('LBC-008: review page shows "not applicable" for non-balance-controlled types', () => {
    expect(QUERIES).toContain('requiresBalance: absenceTypes.requiresBalance')
    expect(PAGE).toContain('Not applicable (no balance control)')
  })
})
