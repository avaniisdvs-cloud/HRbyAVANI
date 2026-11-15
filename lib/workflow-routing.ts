import { db, type DbOrTx } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import type { WorkerAssignment } from '@/drizzle/schema'

export interface WorkflowRoutingContext {
  subjectAsOfDate: string
  routingDate: string
  resourceType: string
  resourceId: string
  workflowCode: string
  tenantId: string
  personId: string
}

function normalizeDate(value: string | Date, field: string): string {
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`INVALID_ROUTING_CONTEXT: ${field} must be YYYY-MM-DD`)
  }
  return date
}

export function buildWorkflowRoutingContext(input: {
  subjectAsOfDate: string | Date
  routingDate?: string | Date
  resourceType: string
  resourceId: string
  workflowCode: string
  tenantId?: string
  personId: string
}): WorkflowRoutingContext {
  const subjectAsOfDate = normalizeDate(input.subjectAsOfDate, 'subjectAsOfDate')
  return {
    subjectAsOfDate,
    routingDate:  input.routingDate ? normalizeDate(input.routingDate, 'routingDate') : subjectAsOfDate,
    resourceType: input.resourceType,
    resourceId:   input.resourceId,
    workflowCode: input.workflowCode,
    tenantId:     input.tenantId ?? TENANT_ID,
    personId:     input.personId,
  }
}

export async function resolveWorkerAssignmentForRouting(
  context: WorkflowRoutingContext,
  personId: string = context.personId,
  executor: DbOrTx = db,
): Promise<WorkerAssignment | null> {
  const { getAsOfRow, workerAssignmentAsOfAdapter } = await import('@/lib/as-of-query')
  return getAsOfRow<WorkerAssignment>(
    executor,
    workerAssignmentAsOfAdapter,
    { tenantId: context.tenantId, personId },
    context.subjectAsOfDate,
  )
}

export async function resolveManagerForRouting(
  context: WorkflowRoutingContext,
  personId: string = context.personId,
  executor: DbOrTx = db,
): Promise<string | null> {
  const assignment = await resolveWorkerAssignmentForRouting(context, personId, executor)
  return assignment?.lineManagerId ?? null
}

export async function resolvePositionIncumbentForRouting(
  context: WorkflowRoutingContext,
  positionId: string,
  executor: DbOrTx = db,
): Promise<WorkerAssignment | null> {
  const { workerAssignments } = await import('@/drizzle/schema')
  const { and, desc, eq, gte, isNull, lte, ne, or } = await import('drizzle-orm')

  const rows = await executor
    .select()
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.tenantId, context.tenantId),
      eq(workerAssignments.positionId, positionId),
      ne(workerAssignments.assignmentStatus, 'INACTIVE'),
      lte(workerAssignments.effectiveStartDate, context.subjectAsOfDate),
      or(
        isNull(workerAssignments.effectiveEndDate),
        gte(workerAssignments.effectiveEndDate, context.subjectAsOfDate),
      ),
    ))
    .orderBy(
      desc(workerAssignments.effectiveStartDate),
      desc(workerAssignments.effectiveSequence),
      desc(workerAssignments.createdDate),
    )
    .limit(1)

  return rows[0] ?? null
}
