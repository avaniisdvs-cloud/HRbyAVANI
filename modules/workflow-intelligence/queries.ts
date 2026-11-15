'use server'

/**
 * Workflow Intelligence — the ONLY module that queries workflow_intelligence_view.
 *
 * Security: getWorkflowTimeline / getApprovalNotificationPreview fail CLOSED.
 * A caller who is not a stakeholder (initiator, in-chain approver/decider/
 * delegate) and not an entity-scoped privileged admin receives null — never
 * partial data. Closes CWE-639 on the approval-detail path.
 */
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import { writeAuditLog } from '@/lib/audit'
import { getWorkflowInstanceDetailV2 } from '@/modules/workflow'
import type { WorkflowInstanceDetailV2 } from '@/modules/workflow'
import type {
  WorkflowIntelligenceRow, WorkflowTimeline, NotificationPreview,
  WorkflowOpsFilters, WorkflowOpsResult, PreviousDecision,
} from './types'
import { evaluateViewerAccess, HIGH_PRIVILEGE_ROLES } from './access'

const HIGH_PRIVILEGE = HIGH_PRIVILEGE_ROLES as readonly string[]

// Minimal session shape this module needs (server-side, trusted).
interface ViewerSession {
  user?: {
    id?:            string
    name?:          string | null
    role:           string
    legalEntityId:  string
    personId?:      string
  }
}

// ─── view row mapping ───────────────────────────────────────────────────────

function mapRow(r: Record<string, unknown>): WorkflowIntelligenceRow {
  const num = (v: unknown): number => (v == null ? 0 : Number(v))
  const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v))
  return {
    instanceId:              String(r.instance_id),
    tenantId:                String(r.tenant_id),
    legalEntityId:           String(r.legal_entity_id),
    workflowCode:            String(r.workflow_code),
    workflowNameEn:          String(r.workflow_name_en),
    workflowNameAr:          (r.workflow_name_ar as string) ?? null,
    status:                  String(r.status),
    resourceStatus:          String(r.resource_status),
    resourceType:            String(r.resource_type),
    resourceId:              String(r.resource_id),
    initiatedByPersonId:     String(r.initiated_by_person_id),
    initiatorName:           (r.initiator_name as string) ?? null,
    currentStepOrder:        num(r.current_step_order),
    totalSteps:              num(r.total_steps),
    currentStepName:         (r.current_step_name as string) ?? null,
    currentApproverPersonId: (r.current_approver_person_id as string) ?? null,
    currentApproverName:     (r.current_approver_name as string) ?? null,
    nextStepName:            (r.next_step_name as string) ?? null,
    nextApproverName:        (r.next_approver_name as string) ?? null,
    startedAt:               r.started_at ? new Date(r.started_at as string).toISOString() : '',
    ageHours:                num(r.age_hours),
    slaDeadline:             r.sla_deadline ? new Date(r.sla_deadline as string).toISOString() : null,
    slaHoursRemaining:       numOrNull(r.sla_hours_remaining),
    isSlaBreached:           r.is_sla_breached === true || r.is_sla_breached === 't',
    escalatedAt:             r.escalated_at ? new Date(r.escalated_at as string).toISOString() : null,
    escalationCount:         num(r.escalation_count),
    previousDecisions:       (r.previous_decisions as PreviousDecision[]) ?? [],
  }
}

async function readViewRow(instanceId: string): Promise<WorkflowIntelligenceRow | null> {
  const res = await db.execute(
    sql`SELECT * FROM workflow_intelligence_view WHERE tenant_id = ${TENANT_ID} AND instance_id = ${instanceId} LIMIT 1`,
  )
  const row = (res as unknown as Record<string, unknown>[])[0]
  return row ? mapRow(row) : null
}

// ─── authorization (fail-closed) ───────────────────────────────────────────

/** True only for stakeholders or entity-scoped privileged admins. Fails closed. */
async function isAuthorizedViewer(session: ViewerSession, detail: WorkflowInstanceDetailV2): Promise<boolean> {
  const u = session.user
  if (!u) return false
  const pid = u.personId ?? null

  // Cheap synchronous facts first; only probe the DB if those don't already grant.
  const stepAssigneePersonIds = detail.steps.map(s => s.assigneePersonId)
  const grantedSync = evaluateViewerAccess({
    role: u.role, personId: pid, viewerLegalEntityId: u.legalEntityId,
    initiatedByPersonId: detail.initiatedByPersonId, instanceLegalEntityId: detail.legalEntityId,
    stepAssigneePersonIds, isDeciderOrDelegate: false,
  })
  if (grantedSync) return true
  if (!pid) return false

  // decider / delegated-to (historical) — direct probe, then re-evaluate.
  const probe = await db.execute(
    sql`SELECT 1 FROM workflow_step_instances
        WHERE instance_id = ${detail.instanceId}
          AND ${pid} IN (decided_by_person_id, delegated_to_person_id) LIMIT 1`,
  )
  return evaluateViewerAccess({
    role: u.role, personId: pid, viewerLegalEntityId: u.legalEntityId,
    initiatedByPersonId: detail.initiatedByPersonId, instanceLegalEntityId: detail.legalEntityId,
    stepAssigneePersonIds, isDeciderOrDelegate: (probe as unknown as unknown[]).length > 0,
  })
}

/** Authorized load WITHOUT side-effects (used by timeline + preview). null = forbidden. */
async function authorizeAndLoad(session: ViewerSession, instanceId: string): Promise<WorkflowTimeline | null> {
  const detail = await getWorkflowInstanceDetailV2(instanceId) // existing; requireRole inside
  if (!detail) return null
  if (!(await isAuthorizedViewer(session, detail))) return null // FAIL CLOSED
  const intelligence = await readViewRow(instanceId)
  return { instance: detail, intelligence }
}

// ─── 1. getWorkflowTimeline (row-level authorized + DETAIL_VIEWED audit) ─────

export async function getWorkflowTimeline(
  session: ViewerSession,
  instanceId: string,
): Promise<WorkflowTimeline | null> {
  const t = await authorizeAndLoad(session, instanceId)
  if (!t) return null
  // best-effort access audit — never blocks the read
  try {
    await writeAuditLog({
      actorId:      session.user?.personId ?? session.user?.id ?? '00000000-0000-0000-0000-000000000000',
      actorName:    session.user?.name ?? 'User',
      actorRole:    session.user?.role ?? 'UNKNOWN',
      channel:      'WEB',
      eventType:    'WORKFLOW.DETAIL_VIEWED',
      resourceType: 'workflow_instances_v2',
      resourceId:   instanceId,
      entityId:     t.instance.legalEntityId,
    })
  } catch { /* non-fatal */ }
  return t
}

// ─── 4. getApprovalNotificationPreview (same auth gate, no audit) ───────────

export async function getApprovalNotificationPreview(
  session: ViewerSession,
  instanceId: string,
): Promise<NotificationPreview | null> {
  const t = await authorizeAndLoad(session, instanceId)
  if (!t) return null
  const { instance, intelligence } = t
  const activeStep = instance.steps.find(s => s.status === 'PENDING')
  return {
    instanceId,
    workflowNameEn:        instance.workflowNameEn,
    status:                instance.status,
    resourceType:          instance.resourceType,
    resourceId:            instance.resourceId,
    currentStepName:       intelligence?.currentStepName ?? activeStep?.stepName ?? null,
    currentApproverName:   intelligence?.currentApproverName ?? activeStep?.assigneeName ?? null,
    nextApproverName:      intelligence?.nextApproverName ?? null,
    previousDecisions:     intelligence?.previousDecisions ?? [],
    ageHours:              intelligence?.ageHours ?? 0,
    isSlaBreached:         intelligence?.isSlaBreached ?? false,
    viewerIsActiveApprover: !!activeStep && activeStep.assigneePersonId === session.user?.personId,
    activeStepInstanceId:  activeStep?.stepInstanceId ?? null,
  }
}

// ─── 5. getWorkflowOperations (HR+ org-wide, entity-scoped) ─────────────────

export async function getWorkflowOperations(
  session: ViewerSession,
  filters: WorkflowOpsFilters = {},
): Promise<WorkflowOpsResult> {
  const empty: WorkflowOpsResult = { rows: [], total: 0, aggregates: { pending: 0, breached: 0, byApprover: [] } }
  const u = session.user
  if (!u || !HIGH_PRIVILEGE.includes(u.role)) return empty // role gate

  const limit  = Math.min(Math.max(filters.limit ?? 50, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)

  const entity = u.role === 'SUPER_ADMIN' ? sql`TRUE` : sql`legal_entity_id = ${u.legalEntityId}`
  const wfCode = filters.workflowCode ? sql`AND workflow_code = ${filters.workflowCode}` : sql``
  const status = filters.status ? sql`AND status = ${filters.status}` : sql``
  const breach = filters.slaBreachedOnly ? sql`AND is_sla_breached = true` : sql``
  const whereSql = sql`WHERE tenant_id = ${TENANT_ID} AND ${entity} ${wfCode} ${status} ${breach}`

  const rowsRes = await db.execute(
    sql`SELECT * FROM workflow_intelligence_view ${whereSql} ORDER BY started_at DESC LIMIT ${limit} OFFSET ${offset}`,
  )
  const rows = (rowsRes as unknown as Record<string, unknown>[]).map(mapRow)

  const aggRes = await db.execute(
    sql`SELECT count(*)::int AS total,
               count(*) FILTER (WHERE status NOT IN ('APPROVED','REJECTED','CANCELLED','RECALLED'))::int AS pending,
               count(*) FILTER (WHERE is_sla_breached)::int AS breached
        FROM workflow_intelligence_view ${whereSql}`,
  )
  const agg = (aggRes as unknown as Record<string, unknown>[])[0] ?? {}

  const byApproverRes = await db.execute(
    sql`SELECT current_approver_name AS approver, count(*)::int AS count
        FROM workflow_intelligence_view ${whereSql}
          AND status NOT IN ('APPROVED','REJECTED','CANCELLED','RECALLED')
        GROUP BY current_approver_name ORDER BY count DESC LIMIT 10`,
  )
  const byApprover = (byApproverRes as unknown as Record<string, unknown>[]).map(r => ({
    approver: (r.approver as string) ?? null, count: Number(r.count),
  }))

  return {
    rows,
    total: Number(agg.total ?? rows.length),
    aggregates: { pending: Number(agg.pending ?? 0), breached: Number(agg.breached ?? 0), byApprover },
  }
}

// ─── getMyRequests (requester self-service status tracker) ──────────────────

/**
 * All workflows the current user INITIATED, across every resource type
 * (leave, promotion, transfer, letters, probation, hiring, future). Reads the
 * canonical view; hard-scoped to `initiated_by_person_id = session.personId` so
 * a requester sees only their own. Powers the ESS "My Requests" status tracker.
 * No per-type logic — generic over resource_type by construction.
 */
export async function getMyRequests(session: ViewerSession): Promise<WorkflowIntelligenceRow[]> {
  const pid = session.user?.personId
  if (!pid) return []
  const res = await db.execute(
    sql`SELECT * FROM workflow_intelligence_view
        WHERE tenant_id = ${TENANT_ID} AND initiated_by_person_id = ${pid}
        ORDER BY started_at DESC LIMIT 100`,
  )
  return (res as unknown as Record<string, unknown>[]).map(mapRow)
}

// ─── 6. getWorkflowIntelligence (ARIA-facing, scoped) ───────────────────────

export async function getWorkflowIntelligence(
  session: ViewerSession,
  opts: { personId?: string; instanceId?: string },
): Promise<WorkflowIntelligenceRow[]> {
  const u = session.user
  if (!u) return []

  if (opts.instanceId) {
    const t = await authorizeAndLoad(session, opts.instanceId)
    return t?.intelligence ? [t.intelligence] : []
  }

  const targetPerson = opts.personId ?? u.personId
  if (!targetPerson) return []
  // Own data, or any if privileged (entity-scoped for HR roles).
  const isSelf = targetPerson === u.personId
  if (!isSelf && !HIGH_PRIVILEGE.includes(u.role)) return []

  const entity = (u.role === 'SUPER_ADMIN' || isSelf) ? sql`TRUE` : sql`legal_entity_id = ${u.legalEntityId}`
  const res = await db.execute(
    sql`SELECT * FROM workflow_intelligence_view
        WHERE tenant_id = ${TENANT_ID} AND initiated_by_person_id = ${targetPerson} AND ${entity}
        ORDER BY started_at DESC LIMIT 50`,
  )
  return (res as unknown as Record<string, unknown>[]).map(mapRow)
}
