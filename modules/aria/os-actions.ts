'use server'

/**
 * ARIA OS server actions — powers the ARIA OS view panels.
 * All queries run server-side; no raw DB access in client components.
 */

import { and, count, desc, eq, gte, inArray, lt, lte, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { getCurrentUser, requireRole, type KRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'

// P3-A3 — roles permitted to view ARIA OS panels (mirrors the OS_ROLES gate on
// the /aria page). These server actions must enforce it themselves: a 'use server'
// export is directly invocable by ANY authenticated client (incl. EMPLOYEE),
// so page-level gating is not sufficient.
const OS_ROLES: KRole[] = ['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
import { translateError } from '@/lib/app-error'
import { getManagerTeamIds } from '@/modules/core-hr/manager-scope'
import {
  persons,
  departments,
  contracts,
  auditLog,
} from '@/drizzle/schema'
import {
  workflowInstancesV2,
  workflowDefinitionsV2,
  workflowStepsV2,
} from '@/drizzle/schema/workflow-engine'

// ── Alerts ────────────────────────────────────────────────────────────────────

export interface AlertItem {
  id:          string
  type:        'passport' | 'visa' | 'emirates_id' | 'contract'
  title:       string
  employeeName: string
  expiryDate:  string
  daysLeft:    number
  severity:    'critical' | 'warning' | 'info'
}

export async function getExpiryAlerts(): Promise<AlertItem[]> {
  try {
  // P3-A3 — gate: this returns employee NAMES + passport/visa/EID expiry (PII).
  // Require an OS role and scope to the caller's entity (SUPER_ADMIN sees all).
  const user = await requireRole(OS_ROLES)
  const today     = new Date()
  const in90days  = new Date(today); in90days.setDate(today.getDate() + 90)
  const todayStr  = today.toISOString().slice(0, 10)
  const in90Str   = in90days.toISOString().slice(0, 10)

  const rows = await db
    .select({
      id:                persons.id,
      fullNameEn:        persons.fullNameEn,
      passportExpiry:    persons.passportExpiry,
      visaExpiry:        persons.visaExpiry,
      emiratesIdExpiry:  persons.emiratesIdExpiry,
    })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.isActive, true),
      eq(persons.assignmentStatus, 'ACTIVE'),
      ...(user.role !== 'SUPER_ADMIN' ? [eq(persons.legalEntityId, user.legalEntityId)] : []),
      or(
        and(
          gte(persons.passportExpiry, todayStr),
          lte(persons.passportExpiry, in90Str),
        ),
        and(
          gte(persons.visaExpiry, todayStr),
          lte(persons.visaExpiry, in90Str),
        ),
        and(
          gte(persons.emiratesIdExpiry, todayStr),
          lte(persons.emiratesIdExpiry, in90Str),
        ),
      ),
    ))
    .limit(200)

  const now = today.getTime()
  const alerts: AlertItem[] = []

  for (const row of rows) {
    const name = row.fullNameEn ?? 'Unknown'

    const addAlert = (type: AlertItem['type'], expiry: string | null) => {
      if (!expiry) return
      const exp = new Date(expiry)
      const daysLeft = Math.ceil((exp.getTime() - now) / 86400000)
      if (daysLeft < 0 || daysLeft > 90) return
      alerts.push({
        id:           `${row.id}-${type}`,
        type,
        title:        type === 'passport'    ? 'Passport expires'
                    : type === 'visa'        ? 'Visa expires'
                    : 'Emirates ID expires',
        employeeName: name,
        expiryDate:   expiry,
        daysLeft,
        severity:     daysLeft < 14 ? 'critical' : daysLeft < 30 ? 'warning' : 'info',
      })
    }

    addAlert('passport',    row.passportExpiry)
    addAlert('visa',        row.visaExpiry)
    addAlert('emirates_id', row.emiratesIdExpiry)
  }

  // Contracts expiring in 30 days
  const in30days = new Date(today); in30days.setDate(today.getDate() + 30)
  const in30Str  = in30days.toISOString().slice(0, 10)

  const contractRows = await db
    .select({
      id:         contracts.id,
      personId:   contracts.personId,
      endDate:    contracts.endDate,
    })
    .from(contracts)
    .where(and(
      eq(contracts.tenantId, TENANT_ID),
      eq(contracts.status, 'ACTIVE'),
      gte(contracts.endDate, todayStr),
      lte(contracts.endDate, in30Str),
    ))
    .limit(100)

  const personIds = contractRows.map(r => r.personId)
  if (personIds.length > 0) {
    const personMap = new Map<string, string>()
    const pRows = await db
      .select({ id: persons.id, fullNameEn: persons.fullNameEn })
      .from(persons)
      .where(and(
        eq(persons.tenantId, TENANT_ID),
        eq(persons.isActive, true),
      ))
      .limit(1000)
    for (const p of pRows) personMap.set(p.id, p.fullNameEn ?? 'Unknown')

    for (const c of contractRows) {
      const exp      = new Date(c.endDate)
      const daysLeft = Math.ceil((exp.getTime() - now) / 86400000)
      alerts.push({
        id:           `contract-${c.id}`,
        type:         'contract',
        title:        'Contract expires',
        employeeName: personMap.get(c.personId) ?? 'Unknown',
        expiryDate:   c.endDate,
        daysLeft,
        severity:     daysLeft < 14 ? 'critical' : 'warning',
      })
    }
  }

  return alerts.sort((a, b) => a.daysLeft - b.daysLeft)
  } catch (e) { translateError(e, 'getExpiryAlerts') }
}

// ── People ────────────────────────────────────────────────────────────────────

export interface DeptCount {
  deptName: string
  count:    number
}

export interface PeopleStats {
  totalActive:   number
  onLeaveToday:  number
  newThisMonth:  number
  byDepartment:  DeptCount[]
}

/**
 * Returns people statistics.
 * @param managerId  When provided (MANAGER role), scopes to the full reporting
 *                   hierarchy (direct + indirect) via recursive CTE.
 *                   Omit for HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN (org-wide).
 */
export async function getPeopleStats(managerId?: string): Promise<PeopleStats> {
  try {
  // P3-A3 — require an OS role (aggregate counts; not directly callable by EMPLOYEE).
  await requireRole(OS_ROLES)
  // MANAGER scope: recursive CTE resolves full team hierarchy; bail early if no reports
  const teamIds = managerId ? await getManagerTeamIds(managerId) : null
  if (managerId && teamIds!.length === 0) {
    return { totalActive: 0, onLeaveToday: 0, newThisMonth: 0, byDepartment: [] }
  }

  const activeWhere = teamIds
    ? and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), eq(persons.assignmentStatus, 'ACTIVE'), inArray(persons.id, teamIds))
    : and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), eq(persons.assignmentStatus, 'ACTIVE'))

  const [{ total: totalActive }] = await db
    .select({ total: count() })
    .from(persons)
    .where(activeWhere)

  // On leave today — simplified; no absence join in this module
  const onLeaveToday = 0

  // New this month
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const newThisMonthWhere = teamIds
    ? and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), gte(persons.hireDate, monthStart.toISOString().slice(0, 10)), inArray(persons.id, teamIds))
    : and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), gte(persons.hireDate, monthStart.toISOString().slice(0, 10)))

  const [{ total: newThisMonth }] = await db
    .select({ total: count() })
    .from(persons)
    .where(newThisMonthWhere)

  // By department
  const deptRows = await db
    .select({
      deptName: departments.nameEn,
      total:    count(),
    })
    .from(persons)
    .leftJoin(departments, eq(persons.currentDepartmentId, departments.id))
    .where(activeWhere)
    .groupBy(departments.nameEn)
    .orderBy(desc(count()))
    .limit(20)

  const byDepartment: DeptCount[] = deptRows.map(r => ({
    deptName: r.deptName ?? 'Unassigned',
    count:    r.total,
  }))

  return { totalActive, onLeaveToday, newThisMonth, byDepartment }
  } catch (e) { translateError(e, 'getPeopleStats') }
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export interface WorkflowRow {
  instanceId:       string
  workflowNameEn:   string
  triggerEvent:     string
  initiatorName:    string
  currentStageName: string
  approverRoleCode: string | null
  slaDeadline:      string | null
  startedAt:        string
  status:           string
  isBreached:       boolean
  daysOpen:         number
}

export async function getWorkflowPipeline(): Promise<WorkflowRow[]> {
  try {
  const user = await getCurrentUser()
  const rows = await db
    .select({
      instanceId:      workflowInstancesV2.id,
      startedAt:       workflowInstancesV2.startedAt,
      slaDeadline:     workflowInstancesV2.slaDeadline,
      status:          workflowInstancesV2.status,
      initiatedBy:     workflowInstancesV2.initiatedByPersonId,
      legalEntityId:   workflowInstancesV2.legalEntityId,
      workflowNameEn:  workflowDefinitionsV2.workflowNameEn,
      workflowCode:    workflowDefinitionsV2.workflowCode,
      stepNameEn:      workflowStepsV2.stepNameEn,
      hierarchyRole:   workflowStepsV2.hierarchyRole,
    })
    .from(workflowInstancesV2)
    .leftJoin(workflowDefinitionsV2, eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
    .leftJoin(workflowStepsV2, eq(workflowInstancesV2.currentStepId, workflowStepsV2.id))
    .where(eq(workflowInstancesV2.tenantId, TENANT_ID))
    .orderBy(desc(workflowInstancesV2.startedAt))
    .limit(200)

  const personIds = [...new Set(rows.map(r => r.initiatedBy).filter(Boolean))] as string[]
  const personMap = new Map<string, string>()
  if (personIds.length > 0) {
    const pRows = await db
      .select({ id: persons.id, fullNameEn: persons.fullNameEn })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true)))
      .limit(1000)
    for (const p of pRows) personMap.set(p.id, p.fullNameEn ?? 'Unknown')
  }

  const now = Date.now()
  return rows
    .filter(r => {
      if (user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN' || user.role === 'HR_DIRECTOR') return true
      return r.legalEntityId === user.legalEntityId
    })
    .map(r => {
      const sla       = r.slaDeadline ? new Date(r.slaDeadline).getTime() : null
      const isBreached = sla ? sla < now && r.status === 'IN_PROGRESS' : false
      const daysOpen  = Math.floor((now - new Date(r.startedAt).getTime()) / 86400000)
      return {
        instanceId:       r.instanceId,
        workflowNameEn:   r.workflowNameEn ?? 'Unknown Workflow',
        triggerEvent:     r.workflowCode ?? '',
        initiatorName:    personMap.get(r.initiatedBy ?? '') ?? 'Unknown',
        currentStageName: r.stepNameEn ?? '—',
        approverRoleCode: r.hierarchyRole ?? null,
        slaDeadline:      r.slaDeadline ? new Date(r.slaDeadline).toISOString() : null,
        startedAt:        new Date(r.startedAt).toISOString(),
        status:           r.status ?? 'UNKNOWN',
        isBreached,
        daysOpen,
      }
    })
  } catch (e) { translateError(e, 'getWorkflowPipeline') }
}

// ── Compliance ────────────────────────────────────────────────────────────────

export interface ComplianceData {
  score:                number
  expiredDocs:          number
  expiringDocs30:       number
  allDocsCurrent:       number
  expiredContracts:     number
  expiringContracts30:  number
  emiratisationPct:     number | null
  pendingApprovals:     number
  slaBreachedCount:     number
}

export async function getComplianceData(): Promise<ComplianceData> {
  try {
  // P3-A3 — require an OS role (org compliance/emiratisation aggregates).
  await requireRole(OS_ROLES)
  const today    = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const in30days = new Date(today); in30days.setDate(today.getDate() + 30)
  const in30Str  = in30days.toISOString().slice(0, 10)

  // Doc counts
  const [{ total: headcount }] = await db
    .select({ total: count() })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.isActive, true),
      eq(persons.assignmentStatus, 'ACTIVE'),
    ))

  const [{ total: emiratis }] = await db
    .select({ total: count() })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.isActive, true),
      eq(persons.assignmentStatus, 'ACTIVE'),
      eq(persons.nationalityCategory, 'UAE_NATIONAL'),
    ))

  // Expired docs (passport OR visa OR EID already expired)
  const [{ total: expiredDocs }] = await db
    .select({ total: count() })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.isActive, true),
      eq(persons.assignmentStatus, 'ACTIVE'),
      or(
        lt(persons.passportExpiry, todayStr),
        lt(persons.visaExpiry, todayStr),
        lt(persons.emiratesIdExpiry, todayStr),
      ),
    ))

  // Expiring in 30 days
  const [{ total: expiringDocs30 }] = await db
    .select({ total: count() })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.isActive, true),
      eq(persons.assignmentStatus, 'ACTIVE'),
      or(
        and(gte(persons.passportExpiry, todayStr), lte(persons.passportExpiry, in30Str)),
        and(gte(persons.visaExpiry, todayStr), lte(persons.visaExpiry, in30Str)),
        and(gte(persons.emiratesIdExpiry, todayStr), lte(persons.emiratesIdExpiry, in30Str)),
      ),
    ))

  // Expired contracts
  const [{ total: expiredContracts }] = await db
    .select({ total: count() })
    .from(contracts)
    .where(and(
      eq(contracts.tenantId, TENANT_ID),
      eq(contracts.status, 'ACTIVE'),
      lt(contracts.endDate, todayStr),
    ))

  // Expiring contracts
  const [{ total: expiringContracts30 }] = await db
    .select({ total: count() })
    .from(contracts)
    .where(and(
      eq(contracts.tenantId, TENANT_ID),
      eq(contracts.status, 'ACTIVE'),
      gte(contracts.endDate, todayStr),
      lte(contracts.endDate, in30Str),
    ))

  // Pending approvals
  const [{ total: pendingApprovals }] = await db
    .select({ total: count() })
    .from(workflowInstancesV2)
    .where(and(
      eq(workflowInstancesV2.tenantId, TENANT_ID),
      eq(workflowInstancesV2.status, 'IN_PROGRESS'),
    ))

  // SLA breached
  const slaBreachedRows = await db
    .select({ total: count() })
    .from(workflowInstancesV2)
    .where(and(
      eq(workflowInstancesV2.tenantId, TENANT_ID),
      eq(workflowInstancesV2.status, 'IN_PROGRESS'),
      lt(workflowInstancesV2.slaDeadline, today),
    ))
  const slaBreachedCount = slaBreachedRows[0]?.total ?? 0

  const emiratisationPct = headcount > 0
    ? Math.round((emiratis / headcount) * 1000) / 10
    : null

  const allDocsCurrent = Math.max(0, headcount - expiredDocs - expiringDocs30)

  // Score: 5 areas × 20pts
  let score = 0
  if (expiredDocs === 0)              score += 20
  if (expiredContracts === 0)         score += 20
  if (pendingApprovals < 5)           score += 20
  if (slaBreachedCount === 0)         score += 20
  if (emiratisationPct != null && emiratisationPct >= 4) score += 20

  return {
    score,
    expiredDocs,
    expiringDocs30,
    allDocsCurrent,
    expiredContracts,
    expiringContracts30,
    emiratisationPct,
    pendingApprovals,
    slaBreachedCount,
  }
  } catch (e) { translateError(e, 'getComplianceData') }
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id:          string
  eventTime:   string
  actorName:   string
  actorRole:   string
  eventType:   string
  resourceType: string
  resourceId:   string | null
  description: string | null
  channel:     string
}

export async function getAuditLogEntries(
  fromDate?: string,
  toDate?:   string,
  eventType?: string,
  actorName?: string,
  page = 0,
): Promise<{ rows: AuditEntry[]; hasMore: boolean }> {
  try {
  const user = await getCurrentUser()
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'HR_DIRECTOR') {
    return { rows: [], hasMore: false }
  }

  const limit = 100
  const conditions = [eq(auditLog.tenantId, TENANT_ID)]

  if (fromDate) {
    conditions.push(gte(auditLog.eventTime, new Date(fromDate)))
  }
  if (toDate) {
    const end = new Date(toDate)
    end.setHours(23, 59, 59, 999)
    conditions.push(lte(auditLog.eventTime, end))
  }

  const rows = await db
    .select({
      id:           auditLog.id,
      eventTime:    auditLog.eventTime,
      actorName:    auditLog.actorName,
      actorRole:    auditLog.actorRole,
      eventType:    auditLog.eventType,
      resourceType: auditLog.resourceType,
      resourceId:   auditLog.resourceId,
      description:  auditLog.description,
      channel:      auditLog.channel,
    })
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.eventTime))
    .limit(limit + 1)
    .offset(page * limit)

  const hasMore = rows.length > limit

  return {
    rows: rows.slice(0, limit).map(r => ({
      id:           r.id,
      eventTime:    r.eventTime instanceof Date ? r.eventTime.toISOString() : String(r.eventTime),
      actorName:    r.actorName,
      actorRole:    r.actorRole,
      eventType:    r.eventType,
      resourceType: r.resourceType,
      resourceId:   r.resourceId ?? null,
      description:  r.description ?? null,
      channel:      r.channel,
    })),
    hasMore,
  }
  } catch (e) { translateError(e, 'getAuditLogEntries') }
}

// ── Knowledge Sources ─────────────────────────────────────────────────────────

export interface KnowledgeSource {
  id:            string
  name:          string
  sourceType:    string
  fileSizeBytes: number | null
  vectorStatus:  string
  tags:          string[]
  indexedAt:     string | null
}

export async function getKnowledgeSources(): Promise<KnowledgeSource[]> {
  try {
  // P3-A3 — require an OS role (internal policy-document inventory).
  await requireRole(OS_ROLES)
  const { ariaKnowledgeSources } = await import('@/drizzle/schema')
  const rows = await db
    .select({
      id:            ariaKnowledgeSources.id,
      sourceName:    ariaKnowledgeSources.sourceName,
      sourceType:    ariaKnowledgeSources.sourceType,
      fileSizeBytes: ariaKnowledgeSources.fileSizeBytes,
      vectorStatus:  ariaKnowledgeSources.vectorStatus,
      tags:          ariaKnowledgeSources.tags,
      lastIndexedAt: ariaKnowledgeSources.lastIndexedAt,
    })
    .from(ariaKnowledgeSources)
    .where(and(
      eq(ariaKnowledgeSources.tenantId, TENANT_ID),
      eq(ariaKnowledgeSources.isActive, true),
    ))
    .orderBy(desc(ariaKnowledgeSources.lastIndexedAt))
    .limit(50)

  return rows.map(r => ({
    id:            r.id,
    name:          r.sourceName,
    sourceType:    r.sourceType,
    fileSizeBytes: r.fileSizeBytes ?? null,
    vectorStatus:  r.vectorStatus,
    tags:          Array.isArray(r.tags) ? (r.tags as string[]) : [],
    indexedAt:     r.lastIndexedAt instanceof Date ? r.lastIndexedAt.toISOString() : null,
  }))
  } catch (e) { translateError(e, 'getKnowledgeSources') }
}
