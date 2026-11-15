/**
 * AVANIIS HR — Workflow Rule Evaluator
 * Evaluates AND/OR condition trees against a WorkflowContext.
 * Supports 40+ field paths across employee, leave, assignment, position domains.
 */
import type { ConditionNode, ConditionOperator, SimpleCondition, GroupCondition } from '@/drizzle/schema/workflow-engine'

// ─── Workflow context ────────────────────────────────────────────────────────
// Flat context object populated at submission time and stored in context_snapshot.

export interface WorkflowContext {
  // Employee
  'employee.person_id': string
  'employee.full_name': string
  'employee.grade_level': number
  'employee.nationality_category': string    // UAE_NATIONAL | GCC_NATIONAL | EXPAT
  'employee.employment_type': string
  'employee.service_months': number
  'employee.department_type': string
  'employee.legal_entity_type': string       // MAINLAND | DIFC | ADGM | FREEZONE
  'employee.is_on_probation': boolean
  'employee.is_manager': boolean
  'employee.gender': string
  'employee.religion': string
  'employee.marital_status': string
  'employee.basic_salary': number
  'employee.payroll_id': string | null
  'employee.contract_hours_per_week': number

  // Leave request
  'leave.type_code': string
  'leave.days': number
  'leave.calendar_days': number
  'leave.hours': number
  'leave.start_date': string                 // YYYY-MM-DD
  'leave.end_date': string
  'leave.is_backdated': boolean
  'leave.balance_pct_used': number           // 0–100
  'leave.balance_days_remaining': number
  'leave.has_medical_cert': boolean
  'leave.overlaps_peak_period': boolean
  'leave.is_emergency': boolean

  // Assignment / position
  'assignment.department_id': string
  'assignment.position_id': string
  'assignment.location_id': string
  'assignment.grade_id': string
  'assignment.action_type': string           // HIRE | TRANSFER | PROMOTION | etc.
  'assignment.salary_change_pct': number     // percentage increase/decrease

  // Overtime
  'overtime.hours': number
  'overtime.is_weekend': boolean
  'overtime.is_public_holiday': boolean

  // Document
  'document.type': string
  'document.days_until_expiry': number

  // Generic resource
  'resource.type': string
  'resource.id': string
  'resource.amount': number                  // for loan / salary revision amounts

  [key: string]: unknown
}

// ─── Field path resolver ──────────────────────────────────────────────────────

function resolveField(ctx: WorkflowContext, field: string): unknown {
  if (field in ctx) return ctx[field]
  // Dot-path fallback for nested objects
  const parts = field.split('.')
  let val: unknown = ctx
  for (const part of parts) {
    if (val === null || val === undefined) return undefined
    val = (val as Record<string, unknown>)[part]
  }
  return val
}

// ─── Comparison helpers ───────────────────────────────────────────────────────

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseFloat(v)
  return NaN
}

function toString(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

function toArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try { return JSON.parse(v) } catch { return [v] }
  }
  return [v]
}

function toBoolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1'
  return Boolean(v)
}

// ─── Operator evaluator ───────────────────────────────────────────────────────

function evaluateOperator(
  op: ConditionOperator,
  fieldValue: unknown,
  condValue: unknown,
): boolean {
  switch (op) {
    case 'EQUALS':
      return toString(fieldValue) === toString(condValue)

    case 'NOT_EQUALS':
      return toString(fieldValue) !== toString(condValue)

    case 'GREATER_THAN':
      return toNumber(fieldValue) > toNumber(condValue)

    case 'GREATER_THAN_OR_EQUAL':
      return toNumber(fieldValue) >= toNumber(condValue)

    case 'LESS_THAN':
      return toNumber(fieldValue) < toNumber(condValue)

    case 'LESS_THAN_OR_EQUAL':
      return toNumber(fieldValue) <= toNumber(condValue)

    case 'IN': {
      const arr = toArray(condValue)
      return arr.map(toString).includes(toString(fieldValue))
    }

    case 'NOT_IN': {
      const arr = toArray(condValue)
      return !arr.map(toString).includes(toString(fieldValue))
    }

    case 'IS_TRUE':
      return toBoolean(fieldValue) === true

    case 'IS_FALSE':
      return toBoolean(fieldValue) === false

    case 'IS_NULL':
      return fieldValue === null || fieldValue === undefined

    case 'IS_NOT_NULL':
      return fieldValue !== null && fieldValue !== undefined

    case 'CONTAINS':
      return toString(fieldValue).includes(toString(condValue))

    case 'STARTS_WITH':
      return toString(fieldValue).startsWith(toString(condValue))

    default:
      return false
  }
}

// ─── Node type guard ──────────────────────────────────────────────────────────

function isGroupCondition(node: ConditionNode): node is GroupCondition {
  return 'conditions' in node && Array.isArray((node as GroupCondition).conditions)
}

// ─── Core evaluator ───────────────────────────────────────────────────────────

/**
 * Recursively evaluate a condition tree against the given workflow context.
 * Returns true if the tree matches.
 */
export function evaluateConditionTree(
  node: ConditionNode,
  ctx: WorkflowContext,
): boolean {
  if (isGroupCondition(node)) {
    const group = node as GroupCondition
    if (group.operator === 'AND') {
      return group.conditions.every(child => evaluateConditionTree(child, ctx))
    } else {
      return group.conditions.some(child => evaluateConditionTree(child, ctx))
    }
  }

  // SimpleCondition
  const simple = node as SimpleCondition
  const fieldValue = resolveField(ctx, simple.field)
  return evaluateOperator(simple.operator, fieldValue, simple.value)
}

/**
 * Evaluate a named rule (condition tree already parsed from JSONB).
 * Returns true if the rule fires for the given context.
 */
export function evaluateRule(
  conditionTree: ConditionNode,
  ctx: WorkflowContext,
): boolean {
  try {
    return evaluateConditionTree(conditionTree, ctx)
  } catch {
    // Malformed condition trees must never crash the workflow engine
    return false
  }
}

/**
 * Evaluate multiple rules and return which ones fire.
 * Used for step effect resolution (ADD_IF_MATCHES, SKIP_PREVIOUS, etc.)
 */
export function evaluateRules(
  rules: Array<{ id: string; conditionTree: ConditionNode }>,
  ctx: WorkflowContext,
): Set<string> {
  const fired = new Set<string>()
  for (const rule of rules) {
    if (evaluateRule(rule.conditionTree, ctx)) {
      fired.add(rule.id)
    }
  }
  return fired
}

/**
 * Build a WorkflowContext from the raw data fetched at submission time.
 * This is the snapshot that gets stored in context_snapshot (encrypted).
 */
export function buildWorkflowContext(raw: {
  personId: string
  fullName?: string
  gradeLevel: number
  nationalityCategory: string
  employmentType: string
  serviceMonths: number
  departmentType: string
  legalEntityType: string
  isOnProbation: boolean
  isManager: boolean
  gender: string
  religion: string | null
  maritalStatus: string | null
  basicSalary: number
  payrollId: string | null
  contractHoursPerWeek: number
  resourceType: string
  resourceId: string
  extra?: Partial<WorkflowContext>
}): WorkflowContext {
  return {
    'employee.person_id':           raw.personId,
    'employee.full_name':           raw.fullName ?? '',
    'employee.grade_level':         raw.gradeLevel,
    'employee.nationality_category': raw.nationalityCategory,
    'employee.employment_type':     raw.employmentType,
    'employee.service_months':      raw.serviceMonths,
    'employee.department_type':     raw.departmentType,
    'employee.legal_entity_type':   raw.legalEntityType,
    'employee.is_on_probation':     raw.isOnProbation,
    'employee.is_manager':          raw.isManager,
    'employee.gender':              raw.gender,
    'employee.religion':            raw.religion ?? '',
    'employee.marital_status':      raw.maritalStatus ?? '',
    'employee.basic_salary':        raw.basicSalary,
    'employee.payroll_id':          raw.payrollId,
    'employee.contract_hours_per_week': raw.contractHoursPerWeek,

    'leave.type_code':              '',
    'leave.days':                   0,
    'leave.calendar_days':          0,
    'leave.hours':                  0,
    'leave.start_date':             '',
    'leave.end_date':               '',
    'leave.is_backdated':           false,
    'leave.balance_pct_used':       0,
    'leave.balance_days_remaining': 0,
    'leave.has_medical_cert':       false,
    'leave.overlaps_peak_period':   false,
    'leave.is_emergency':           false,

    'assignment.department_id':     '',
    'assignment.position_id':       '',
    'assignment.location_id':       '',
    'assignment.grade_id':          '',
    'assignment.action_type':       '',
    'assignment.salary_change_pct': 0,

    'overtime.hours':               0,
    'overtime.is_weekend':          false,
    'overtime.is_public_holiday':   false,

    'document.type':                '',
    'document.days_until_expiry':   0,

    'resource.type':                raw.resourceType,
    'resource.id':                  raw.resourceId,
    'resource.amount':              0,

    ...raw.extra,
  }
}
