import { and, desc, eq, gte, lte, ne, SQL } from 'drizzle-orm'
import { AnyColumn } from 'drizzle-orm'
import {
  departmentHistory,
  gradeHistory,
  jobHistory,
  leavePlanEnrolments,
  locationHistory,
  payrollAssignments,
  positionHistory,
  salaryElements,
  workerAssignments,
  workScheduleAssignments,
} from '@/drizzle/schema'
import { DateParam, EFFECTIVE_END_OF_TIME } from '@/lib/effective-date'

type DbLike = {
  select: (...args: never[]) => any
}

export type AsOfReason = 'NO_MATCH' | 'MATCH' | 'CONFLICT'

export type AsOfConflictReason = 'OVERLAP' | 'DUPLICATE_SEQUENCE'

export interface AsOfResolveResult<T> {
  row: T | null
  matched: boolean
  conflict: boolean
  reason: AsOfReason
  conflictReason?: AsOfConflictReason
  matches: T[]
}

export interface AsOfAdapter {
  name: string
  table: unknown
  businessKey: Record<string, AnyColumn>
  startColumn: AnyColumn
  endColumn: AnyColumn
  sequenceColumn?: AnyColumn
  currentColumn?: AnyColumn
  tieBreakerColumns?: AnyColumn[]
  extraConditions?: SQL[]
}

export type AsOfKey<TAdapter extends AsOfAdapter = AsOfAdapter> = {
  [K in keyof TAdapter['businessKey']]: string
}

export class AsOfConflictError extends Error {
  constructor(
    public readonly adapterName: string,
    public readonly conflictReason: AsOfConflictReason,
  ) {
    super(`As-of query conflict in ${adapterName}: ${conflictReason}`)
    this.name = 'AsOfConflictError'
  }
}

function toIsoDate(value: DateParam): string {
  return value instanceof Date ? value.toISOString().split('T')[0] : value
}

function buildKeyConditions(adapter: AsOfAdapter, key: Record<string, string>): SQL[] {
  return Object.entries(adapter.businessKey).map(([keyName, column]) => {
    const keyValue = key[keyName]
    if (keyValue == null) {
      throw new Error(`Missing as-of key ${keyName} for ${adapter.name}`)
    }
    return eq(column, keyValue)
  })
}

function buildOrder(adapter: AsOfAdapter): unknown[] {
  return [
    desc(adapter.startColumn),
    ...(adapter.sequenceColumn ? [desc(adapter.sequenceColumn)] : []),
    ...(adapter.currentColumn ? [desc(adapter.currentColumn)] : []),
    ...(adapter.tieBreakerColumns ?? []).map(column => desc(column)),
  ]
}

export function resolveAsOfRows<T>(
  adapter: AsOfAdapter,
  rows: T[],
): AsOfResolveResult<T> {
  if (rows.length === 0) {
    return { row: null, matched: false, conflict: false, reason: 'NO_MATCH', matches: [] }
  }

  if (rows.length === 1) {
    return { row: rows[0], matched: true, conflict: false, reason: 'MATCH', matches: rows }
  }

  return {
    row: null,
    matched: true,
    conflict: true,
    reason: 'CONFLICT',
    conflictReason: adapter.sequenceColumn ? 'DUPLICATE_SEQUENCE' : 'OVERLAP',
    matches: rows,
  }
}

export async function resolveAsOfRow<T>(
  db: DbLike,
  adapter: AsOfAdapter,
  key: Record<string, string>,
  asOfDate: DateParam,
): Promise<AsOfResolveResult<T>> {
  const asOf = toIsoDate(asOfDate)
  const rows = await db
    .select()
    .from(adapter.table)
    .where(and(
      ...buildKeyConditions(adapter, key),
      ...(adapter.extraConditions ?? []),
      lte(adapter.startColumn, asOf),
      gte(adapter.endColumn, asOf),
    )!)
    .orderBy(...buildOrder(adapter))
    .limit(2)

  return resolveAsOfRows<T>(adapter, rows as T[])
}

export async function getAsOfRow<T>(
  db: DbLike,
  adapter: AsOfAdapter,
  key: Record<string, string>,
  asOfDate: DateParam,
): Promise<T | null> {
  const result = await resolveAsOfRow<T>(db, adapter, key, asOfDate)
  if (result.conflict) {
    throw new AsOfConflictError(adapter.name, result.conflictReason ?? 'OVERLAP')
  }
  return result.row
}

export function isAsOfDateInRange(
  startDate: DateParam,
  endDate: DateParam | null | undefined,
  asOfDate: DateParam,
): boolean {
  const start = toIsoDate(startDate)
  const end = endDate == null ? EFFECTIVE_END_OF_TIME : toIsoDate(endDate)
  const asOf = toIsoDate(asOfDate)
  return start <= asOf && end >= asOf
}

export const workerAssignmentAsOfAdapter = {
  name: 'worker_assignments',
  table: workerAssignments,
  businessKey: {
    tenantId: workerAssignments.tenantId,
    personId: workerAssignments.personId,
  },
  startColumn: workerAssignments.effectiveStartDate,
  endColumn: workerAssignments.effectiveEndDate,
  sequenceColumn: workerAssignments.effectiveSequence,
  currentColumn: workerAssignments.isCurrent,
  tieBreakerColumns: [workerAssignments.createdDate],
  extraConditions: [ne(workerAssignments.assignmentStatus, 'INACTIVE')],
} satisfies AsOfAdapter

export const salaryElementAsOfAdapter = {
  name: 'salary_elements',
  table: salaryElements,
  businessKey: {
    tenantId: salaryElements.tenantId,
    personId: salaryElements.personId,
    assignmentId: salaryElements.assignmentId,
    payrollId: salaryElements.payrollId,
    elementCode: salaryElements.elementCode,
  },
  startColumn: salaryElements.effectiveStartDate,
  endColumn: salaryElements.effectiveEndDate,
  sequenceColumn: salaryElements.effectiveSequence,
  currentColumn: undefined,
  tieBreakerColumns: [salaryElements.createdDate],
} satisfies AsOfAdapter

export const payrollAssignmentAsOfAdapter = {
  name: 'payroll_assignments',
  table: payrollAssignments,
  businessKey: {
    tenantId: payrollAssignments.tenantId,
    personId: payrollAssignments.personId,
  },
  startColumn: payrollAssignments.effectiveStartDate,
  endColumn: payrollAssignments.effectiveEndDate,
  sequenceColumn: payrollAssignments.effectiveSequence,
  currentColumn: payrollAssignments.isCurrent,
  tieBreakerColumns: [payrollAssignments.createdDate],
} satisfies AsOfAdapter

export const workScheduleAssignmentAsOfAdapter = {
  name: 'work_schedule_assignments',
  table: workScheduleAssignments,
  businessKey: {
    tenantId: workScheduleAssignments.tenantId,
    personId: workScheduleAssignments.personId,
  },
  startColumn: workScheduleAssignments.effectiveStartDate,
  endColumn: workScheduleAssignments.effectiveEndDate,
  sequenceColumn: workScheduleAssignments.effectiveSequence,
  currentColumn: workScheduleAssignments.isCurrent,
  tieBreakerColumns: [workScheduleAssignments.createdDate],
} satisfies AsOfAdapter

export const leavePlanEnrolmentAsOfAdapter = {
  name: 'leave_plan_enrolments',
  table: leavePlanEnrolments,
  businessKey: {
    tenantId: leavePlanEnrolments.tenantId,
    personId: leavePlanEnrolments.personId,
    absencePlanId: leavePlanEnrolments.absencePlanId,
  },
  startColumn: leavePlanEnrolments.effectiveStartDate,
  endColumn: leavePlanEnrolments.effectiveEndDate,
  sequenceColumn: leavePlanEnrolments.effectiveSequence,
  currentColumn: leavePlanEnrolments.isCurrent,
  tieBreakerColumns: [leavePlanEnrolments.createdDate],
} satisfies AsOfAdapter

export const gradeHistoryAsOfAdapter = {
  name: 'grade_history',
  table: gradeHistory,
  businessKey: {
    tenantId: gradeHistory.tenantId,
    gradeId: gradeHistory.gradeId,
  },
  startColumn: gradeHistory.validFrom,
  endColumn: gradeHistory.validTo,
  currentColumn: gradeHistory.isCurrent,
  tieBreakerColumns: [gradeHistory.changedAt],
} satisfies AsOfAdapter

export const departmentHistoryAsOfAdapter = {
  name: 'department_history',
  table: departmentHistory,
  businessKey: {
    tenantId: departmentHistory.tenantId,
    departmentId: departmentHistory.departmentId,
  },
  startColumn: departmentHistory.validFrom,
  endColumn: departmentHistory.validTo,
  currentColumn: departmentHistory.isCurrent,
  tieBreakerColumns: [departmentHistory.changedAt],
} satisfies AsOfAdapter

export const locationHistoryAsOfAdapter = {
  name: 'location_history',
  table: locationHistory,
  businessKey: {
    tenantId: locationHistory.tenantId,
    locationId: locationHistory.locationId,
  },
  startColumn: locationHistory.validFrom,
  endColumn: locationHistory.validTo,
  currentColumn: locationHistory.isCurrent,
  tieBreakerColumns: [locationHistory.changedAt],
} satisfies AsOfAdapter

export const jobHistoryAsOfAdapter = {
  name: 'job_history',
  table: jobHistory,
  businessKey: {
    tenantId: jobHistory.tenantId,
    jobId: jobHistory.jobId,
  },
  startColumn: jobHistory.validFrom,
  endColumn: jobHistory.validTo,
  currentColumn: jobHistory.isCurrent,
  tieBreakerColumns: [jobHistory.changedAt],
} satisfies AsOfAdapter

export const positionHistoryAsOfAdapter = {
  name: 'position_history',
  table: positionHistory,
  businessKey: {
    tenantId: positionHistory.tenantId,
    positionId: positionHistory.positionId,
  },
  startColumn: positionHistory.validFrom,
  endColumn: positionHistory.validTo,
  currentColumn: positionHistory.isCurrent,
  tieBreakerColumns: [positionHistory.changedAt],
} satisfies AsOfAdapter

export const asOfAdapters = {
  workerAssignments: workerAssignmentAsOfAdapter,
  salaryElements: salaryElementAsOfAdapter,
  payrollAssignments: payrollAssignmentAsOfAdapter,
  workScheduleAssignments: workScheduleAssignmentAsOfAdapter,
  leavePlanEnrolments: leavePlanEnrolmentAsOfAdapter,
  gradeHistory: gradeHistoryAsOfAdapter,
  departmentHistory: departmentHistoryAsOfAdapter,
  locationHistory: locationHistoryAsOfAdapter,
  jobHistory: jobHistoryAsOfAdapter,
  positionHistory: positionHistoryAsOfAdapter,
} as const
