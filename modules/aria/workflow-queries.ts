'use server'

import { and, desc, eq, inArray } from 'drizzle-orm'
import { db }              from '@/lib/db'
import { getCurrentUser }  from '@/lib/auth'
import { TENANT_ID }       from '@/lib/constants'
import {
  persons,
  departments,
} from '@/drizzle/schema'
import {
  workflowInstancesV2,
  workflowDefinitionsV2,
  workflowStepsV2,
} from '@/drizzle/schema/workflow-engine'

export interface WorkflowItem {
  instanceId:     string
  workflowNameEn: string
  triggerEvent:   string
  status:         string
  initiatorName:  string
  department:     string
  currentStage:   string
  approverRole:   string
  startedAt:      string
  daysOpen:       number
  isBreached:     boolean
  slaDeadline?:   string
}

export interface WorkflowSummary {
  pending:       number
  approvedToday: number
  rejectedToday: number
  slaBreached:   number
  rows:          WorkflowItem[]
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  return new Date(d)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-')
}

function fmtRole(code: string | null | undefined): string {
  if (!code) return '—'
  return code.split('_').map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

export async function getWorkflowSummary(): Promise<WorkflowSummary> {
  const empty: WorkflowSummary = { pending: 0, approvedToday: 0, rejectedToday: 0, slaBreached: 0, rows: [] }

  try {
    const user = await getCurrentUser()
    if (!user) return empty

    const today      = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const now        = today.getTime()
    const isAdmin    = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_DIRECTOR'].includes(user.role)
    const isManager  = user.role === 'MANAGER'

    // Build scope filter — admins see all, managers see team+self, employees see own
    let scopePersonIds: string[] = []
    if (!isAdmin && user.personId) {
      if (isManager) {
        const reports = await db
          .select({ id: persons.id })
          .from(persons)
          .where(and(
            eq(persons.tenantId, TENANT_ID),
            eq(persons.lineManagerId, user.personId),
          ))
        scopePersonIds = [user.personId, ...reports.map(r => r.id)]
      } else {
        scopePersonIds = [user.personId]
      }
    }

    const baseWhere = isAdmin
      ? eq(workflowInstancesV2.tenantId, TENANT_ID)
      : scopePersonIds.length > 0
        ? and(
            eq(workflowInstancesV2.tenantId, TENANT_ID),
            inArray(workflowInstancesV2.initiatedByPersonId, scopePersonIds),
          )
        : eq(workflowInstancesV2.tenantId, TENANT_ID)

    const rows = await db
      .select({
        instanceId:       workflowInstancesV2.id,
        status:           workflowInstancesV2.status,
        startedAt:        workflowInstancesV2.startedAt,
        completedAt:      workflowInstancesV2.completedAt,
        slaDeadline:      workflowInstancesV2.slaDeadline,
        workflowNameEn:   workflowDefinitionsV2.workflowNameEn,
        workflowCode:     workflowDefinitionsV2.workflowCode,
        initiatorName:    persons.fullNameEn,
        deptName:         departments.nameEn,
        stepNameEn:       workflowStepsV2.stepNameEn,
        hierarchyRole:    workflowStepsV2.hierarchyRole,
      })
      .from(workflowInstancesV2)
      .leftJoin(workflowDefinitionsV2,
        eq(workflowInstancesV2.workflowDefinitionId, workflowDefinitionsV2.id))
      .leftJoin(workflowStepsV2,
        eq(workflowInstancesV2.currentStepId, workflowStepsV2.id))
      .leftJoin(persons,
        eq(workflowInstancesV2.initiatedByPersonId, persons.id))
      .leftJoin(departments,
        eq(persons.currentDepartmentId, departments.id))
      .where(baseWhere)
      .orderBy(desc(workflowInstancesV2.startedAt))
      .limit(100)

    const mapped: WorkflowItem[] = rows.map(r => {
      const daysOpen    = Math.floor((now - new Date(r.startedAt).getTime()) / 86400000)
      const slaMs       = r.slaDeadline ? new Date(r.slaDeadline).getTime() : null
      const isActive    = r.status === 'IN_PROGRESS'
      const isBreached  = slaMs
        ? slaMs < now && isActive
        : isActive && daysOpen > 3

      return {
        instanceId:     r.instanceId,
        workflowNameEn: r.workflowNameEn ?? 'Unknown',
        triggerEvent:   r.workflowCode ?? '',
        status:         r.status ?? 'IN_PROGRESS',
        initiatorName:  r.initiatorName ?? 'Unknown',
        department:     r.deptName ?? '—',
        currentStage:   r.stepNameEn ?? '—',
        approverRole:   fmtRole(r.hierarchyRole),
        startedAt:      fmtDate(r.startedAt),
        daysOpen,
        isBreached,
        slaDeadline:    r.slaDeadline ? fmtDate(r.slaDeadline) : undefined,
      }
    })

    const approvedToday = rows.filter(r =>
      r.status === 'APPROVED' &&
      r.completedAt != null &&
      new Date(r.completedAt).getTime() >= todayStart.getTime()
    ).length

    const rejectedToday = rows.filter(r =>
      r.status === 'REJECTED' &&
      r.completedAt != null &&
      new Date(r.completedAt).getTime() >= todayStart.getTime()
    ).length

    return {
      pending:       mapped.filter(r => r.status === 'IN_PROGRESS').length,
      approvedToday,
      rejectedToday,
      slaBreached:   mapped.filter(r => r.isBreached).length,
      rows:          mapped,
    }

  } catch (err) {
    console.error('[getWorkflowSummary]', err)
    return empty
  }
}
