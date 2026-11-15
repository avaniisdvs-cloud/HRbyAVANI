'use client'

/**
 * ConditionBuilder — reusable AND/OR condition tree builder.
 *
 * Props:
 *   value    — current ConditionNode tree (or null = no conditions)
 *   onChange — callback when tree changes
 *   readOnly — if true, renders in display mode only
 *
 * The root is always a GroupCondition (AND or OR).
 * Nested groups are indented 16 px per level.
 */

import { useCallback } from 'react'
import { Plus, PlusSquare, X } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import type {
  ConditionNode,
  ConditionOperator,
  SimpleCondition,
  GroupCondition,
} from '@/drizzle/schema/workflow-engine'

// ── Field catalog ────────────────────────────────────────────────────────

interface FieldDef {
  field:    string
  label:    string
  dataType: 'STRING' | 'NUMBER' | 'BOOLEAN'
  group:    string
}

const FIELDS: FieldDef[] = [
  // Leave
  { field: 'leave.type_code',        label: 'Leave Type',         dataType: 'STRING',  group: 'Leave' },
  { field: 'leave.days',             label: 'Leave Days',         dataType: 'NUMBER',  group: 'Leave' },
  { field: 'leave.is_backdated',     label: 'Is Backdated',       dataType: 'BOOLEAN', group: 'Leave' },
  { field: 'leave.balance_pct_used', label: 'Balance % Used',     dataType: 'NUMBER',  group: 'Leave' },
  { field: 'leave.has_medical_cert', label: 'Has Medical Cert',   dataType: 'BOOLEAN', group: 'Leave' },
  { field: 'leave.is_emergency',     label: 'Is Emergency',       dataType: 'BOOLEAN', group: 'Leave' },
  // Employee
  { field: 'employee.grade_level',         label: 'Grade Level',           dataType: 'NUMBER',  group: 'Employee' },
  { field: 'employee.nationality_category', label: 'Nationality Category', dataType: 'STRING',  group: 'Employee' },
  { field: 'employee.employment_type',     label: 'Employment Type',       dataType: 'STRING',  group: 'Employee' },
  { field: 'employee.service_months',      label: 'Service (months)',      dataType: 'NUMBER',  group: 'Employee' },
  { field: 'employee.is_on_probation',     label: 'Is On Probation',       dataType: 'BOOLEAN', group: 'Employee' },
  { field: 'employee.is_manager',          label: 'Is Manager',            dataType: 'BOOLEAN', group: 'Employee' },
  { field: 'employee.gender',              label: 'Gender',                dataType: 'STRING',  group: 'Employee' },
  { field: 'employee.religion',            label: 'Religion',              dataType: 'STRING',  group: 'Employee' },
  { field: 'employee.basic_salary',        label: 'Basic Salary (AED)',    dataType: 'NUMBER',  group: 'Employee' },
  // Assignment
  { field: 'assignment.action_type',       label: 'Assignment Action',     dataType: 'STRING',  group: 'Assignment' },
  { field: 'assignment.salary_change_pct', label: 'Salary Change %',       dataType: 'NUMBER',  group: 'Assignment' },
  // Overtime
  { field: 'overtime.hours',              label: 'Overtime Hours',   dataType: 'NUMBER',  group: 'Overtime' },
  { field: 'overtime.is_weekend',         label: 'Is Weekend OT',    dataType: 'BOOLEAN', group: 'Overtime' },
  { field: 'overtime.is_public_holiday',  label: 'Is Holiday OT',    dataType: 'BOOLEAN', group: 'Overtime' },
]

const OPERATORS_BY_TYPE: Record<string, ConditionOperator[]> = {
  NUMBER:  ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL'],
  STRING:  ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'CONTAINS', 'STARTS_WITH', 'IS_NULL', 'IS_NOT_NULL'],
  BOOLEAN: ['IS_TRUE', 'IS_FALSE'],
}

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  EQUALS:                '=',
  NOT_EQUALS:            '≠',
  GREATER_THAN:          '>',
  GREATER_THAN_OR_EQUAL: '≥',
  LESS_THAN:             '<',
  LESS_THAN_OR_EQUAL:    '≤',
  IN:                    'in',
  NOT_IN:                'not in',
  IS_TRUE:               'is true',
  IS_FALSE:              'is false',
  IS_NULL:               'is null',
  IS_NOT_NULL:           'is not null',
  CONTAINS:              'contains',
  STARTS_WITH:           'starts with',
}

// ── Helpers ──────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function isGroup(node: ConditionNode): node is GroupCondition {
  return 'conditions' in node
}

function needsValue(op: ConditionOperator): boolean {
  return !['IS_TRUE', 'IS_FALSE', 'IS_NULL', 'IS_NOT_NULL'].includes(op)
}

function defaultCondition(): SimpleCondition {
  return {
    id:       uid(),
    field:    FIELDS[0].field,
    operator: 'EQUALS',
    value:    '',
    dataType: FIELDS[0].dataType,
    labelEn:  FIELDS[0].label,
  }
}

function defaultGroup(): GroupCondition {
  return {
    id:         uid(),
    operator:   'AND',
    conditions: [defaultCondition()],
  }
}

// ── Sub-components ────────────────────────────────────────────────────────

interface RowProps {
  node:     SimpleCondition
  onChange: (updated: SimpleCondition) => void
  onRemove: () => void
  readOnly: boolean
}

function ConditionRow({ node, onChange, onRemove, readOnly }: RowProps) {
  const locale = useLocale()
  const fieldDef = FIELDS.find(f => f.field === node.field) ?? FIELDS[0]
  const operators = OPERATORS_BY_TYPE[fieldDef.dataType] ?? OPERATORS_BY_TYPE.STRING

  function handleFieldChange(field: string) {
    const def = FIELDS.find(f => f.field === field) ?? FIELDS[0]
    const ops = OPERATORS_BY_TYPE[def.dataType]
    onChange({
      ...node,
      field,
      dataType: def.dataType,
      labelEn:  def.label,
      operator: ops[0],
      value:    '',
    })
  }

  function handleOperatorChange(operator: ConditionOperator) {
    onChange({ ...node, operator, value: needsValue(operator) ? (node.value ?? '') : undefined })
  }

  function handleValueChange(value: string) {
    onChange({ ...node, value })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {/* Field */}
      <select
        disabled={readOnly}
        value={node.field}
        onChange={e => handleFieldChange(e.target.value)}
        style={{
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--card)',
          color: 'var(--ink-1)',
          fontSize: 'var(--text-body)',
          minWidth: 160,
        }}
      >
        {(['Leave', 'Employee', 'Assignment', 'Overtime'] as const).map(group => (
          <optgroup key={group} label={group}>
            {FIELDS.filter(f => f.group === group).map(f => (
              <option key={f.field} value={f.field}>{f.label}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Operator */}
      <select
        disabled={readOnly}
        value={node.operator}
        onChange={e => handleOperatorChange(e.target.value as ConditionOperator)}
        style={{
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--card)',
          color: 'var(--ink-1)',
          fontSize: 'var(--text-body)',
          minWidth: 100,
        }}
      >
        {operators.map(op => (
          <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
        ))}
      </select>

      {/* Value */}
      {needsValue(node.operator) && (
        <input
          disabled={readOnly}
          type={fieldDef.dataType === 'NUMBER' ? 'number' : 'text'}
          value={String(node.value ?? '')}
          onChange={e => handleValueChange(e.target.value)}
          placeholder={locale === 'ar' ? 'القيمة' : 'value'}
          style={{
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--ink-1)',
            fontSize: 'var(--text-body)',
            minWidth: 120,
          }}
        />
      )}

      {/* Remove */}
      {!readOnly && (
        <button
          type="button"
          onClick={onRemove}
          title={locale === 'ar' ? 'إزالة الشرط' : 'Remove condition'}
          style={{
            width: 28, height: 28,
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-3)',
            flexShrink: 0,
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

interface GroupProps {
  node:     GroupCondition
  onChange: (updated: GroupCondition) => void
  onRemove?: () => void
  readOnly: boolean
  depth:    number
}

function GroupBlock({ node, onChange, onRemove, readOnly, depth }: GroupProps) {
  const locale = useLocale()
  function updateCondition(index: number, updated: ConditionNode) {
    const conditions = [...node.conditions]
    conditions[index] = updated
    onChange({ ...node, conditions })
  }

  function removeCondition(index: number) {
    const conditions = node.conditions.filter((_, i) => i !== index)
    onChange({ ...node, conditions })
  }

  function addCondition() {
    onChange({ ...node, conditions: [...node.conditions, defaultCondition()] })
  }

  function addGroup() {
    onChange({ ...node, conditions: [...node.conditions, defaultGroup()] })
  }

  function toggleOperator() {
    onChange({ ...node, operator: node.operator === 'AND' ? 'OR' : 'AND' })
  }

  return (
    <div style={{
      marginLeft: depth > 0 ? 16 : 0,
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 14px',
      background: depth % 2 === 0 ? 'var(--card)' : 'var(--surface-2, var(--card))',
    }}>
      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {/* AND / OR toggle */}
        <div style={{
          display: 'flex',
          borderRadius: 20,
          border: '1px solid var(--border)',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {(['AND', 'OR'] as const).map(op => (
            <button
              key={op}
              type="button"
              disabled={readOnly}
              onClick={() => !readOnly && op !== node.operator && toggleOperator()}
              style={{
                padding: '3px 14px',
                fontSize: 'var(--text-caption)',
                fontWeight: 600,
                border: 'none',
                cursor: readOnly ? 'default' : 'pointer',
                background: node.operator === op ? 'var(--accent)' : 'transparent',
                color: node.operator === op ? '#fff' : 'var(--ink-3)',
                transition: 'background 150ms',
              }}
            >
              {op}
            </button>
          ))}
        </div>

        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', flex: 1 }}>
          {node.conditions.length === 0
            ? (locale === 'ar' ? 'مجموعة فارغة' : 'empty group')
            : (locale === 'ar'
                ? `${node.conditions.length} شرط`
                : `${node.conditions.length} condition${node.conditions.length !== 1 ? 's' : ''}`)}
        </span>

        {/* Remove group button (only for nested groups) */}
        {onRemove && !readOnly && (
          <button
            type="button"
            onClick={onRemove}
            title={locale === 'ar' ? 'إزالة المجموعة' : 'Remove group'}
            style={{
              width: 28, height: 28,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-3)',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Conditions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {node.conditions.map((child, i) =>
          isGroup(child) ? (
            <GroupBlock
              key={child.id}
              node={child}
              onChange={updated => updateCondition(i, updated)}
              onRemove={() => removeCondition(i)}
              readOnly={readOnly}
              depth={depth + 1}
            />
          ) : (
            <ConditionRow
              key={child.id}
              node={child}
              onChange={updated => updateCondition(i, updated)}
              onRemove={() => removeCondition(i)}
              readOnly={readOnly}
            />
          )
        )}
      </div>

      {/* Add buttons */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={addCondition}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 12px',
              border: '1px dashed var(--border)',
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 'var(--text-caption)',
              color: 'var(--ink-2)',
            }}
          >
            <Plus size={13} />
            {locale === 'ar' ? 'إضافة شرط' : 'Add condition'}
          </button>
          <button
            type="button"
            onClick={addGroup}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 12px',
              border: '1px dashed var(--border)',
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 'var(--text-caption)',
              color: 'var(--ink-2)',
            }}
          >
            <PlusSquare size={13} />
            {locale === 'ar' ? 'إضافة مجموعة' : 'Add group'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────

export interface ConditionBuilderProps {
  value:     ConditionNode | null
  onChange:  (tree: ConditionNode | null) => void
  readOnly?: boolean
}

export function ConditionBuilder({ value, onChange, readOnly = false }: ConditionBuilderProps) {
  const locale = useLocale()
  const initRoot = useCallback(() => {
    onChange(defaultGroup())
  }, [onChange])

  if (value === null || value === undefined) {
    return (
      <div style={{
        padding: '16px 20px',
        border: '1px dashed var(--border)',
        borderRadius: 8,
        color: 'var(--ink-3)',
        fontSize: 'var(--text-body)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <span>{locale === 'ar' ? 'لا توجد شروط — يتم تفعيل الخطوة دائماً' : 'No conditions — step always activates'}</span>
        {!readOnly && (
          <button
            type="button"
            onClick={initRoot}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 14px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 'var(--text-caption)',
              color: 'var(--ink-2)',
            }}
          >
            <Plus size={13} />
            {locale === 'ar' ? 'إضافة شرط' : 'Add condition'}
          </button>
        )}
      </div>
    )
  }

  if (!isGroup(value)) {
    // Wrap a lone simple condition in a group automatically
    const wrapped: GroupCondition = { id: uid(), operator: 'AND', conditions: [value] }
    return (
      <GroupBlock
        node={wrapped}
        onChange={updated => onChange(updated.conditions.length === 0 ? null : updated)}
        readOnly={readOnly}
        depth={0}
      />
    )
  }

  return (
    <GroupBlock
      node={value}
      onChange={updated => onChange(updated.conditions.length === 0 ? null : updated)}
      readOnly={readOnly}
      depth={0}
    />
  )
}
