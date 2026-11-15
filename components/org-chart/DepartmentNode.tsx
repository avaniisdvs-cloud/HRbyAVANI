'use client'

/**
 * components/org-chart/DepartmentNode.tsx
 *
 * Department aggregate node card for the Department Hierarchy engine (Session 4).
 *
 * Renders:
 *   - Department name (En + Ar)
 *   - Department head name (if set)
 *   - Headcount bar: actual / approved
 *   - Vacancy pill (red when > 0)
 *   - Collapse/expand toggle (same pattern as EmployeeNode)
 *
 * Dimensions: 220px × 120px (matches NODE_W/NODE_H in department-engine.ts)
 * Action panel: intentionally absent — department nodes have no hire/transfer actions.
 */

import { Handle, Position } from '@xyflow/react'
import { Users2, Building2 } from 'lucide-react'
import type { OrgNodeData } from '@/lib/org-chart/types'

interface DepartmentNodeProps {
  data:     OrgNodeData
  selected: boolean
}

// Left indicator strip — green when no vacancies, amber when vacancies exist
function stripColor(data: OrgNodeData): string {
  if ((data.vacancyCount ?? 0) > 0) return 'var(--org-vacant)'
  return '#10B981'  // Tailwind emerald-500
}

export function DepartmentNode({ data, selected }: DepartmentNodeProps) {
  const hasChildren  = (data.childDeptCount ?? data.directReportsCount) > 0
  const childLabel   = (data.childDeptCount ?? data.directReportsCount) === 1
    ? '1 sub-dept'
    : `${data.childDeptCount ?? data.directReportsCount} sub-depts`

  const headcount         = data.headcount        ?? 0
  const approvedHeadcount = data.approvedHeadcount ?? 0
  const vacancyCount      = data.vacancyCount      ?? 0

  // Headcount fill ratio (capped at 100%)
  const fillRatio = approvedHeadcount > 0
    ? Math.min(headcount / approvedHeadcount, 1)
    : 0

  const outline = data.isHighlighted
    ? '2.5px solid var(--accent)'
    : undefined

  return (
    <div
      style={{
        width:         220,
        height:        120,
        background:    'var(--card)',
        border:        selected
          ? '1.5px solid var(--accent)'
          : '1.5px solid var(--border)',
        borderRadius:  10,
        boxShadow:     selected
          ? '0 0 0 3px var(--accent-100), 0 4px 16px rgba(0,0,0,0.12)'
          : '0 2px 8px rgba(0,0,0,0.07)',
        transition:    'box-shadow 0.15s, border-color 0.15s',
        cursor:        'pointer',
        position:      'relative',
        overflow:      'visible',
        display:       'flex',
        flexDirection: 'row',
        ...(outline ? { outline, outlineOffset: 4 } : {}),
      }}
    >
      {/* React Flow connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: 'var(--border)', width: 8, height: 8, border: 'none' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: 'var(--border)', width: 8, height: 8, border: 'none' }}
      />

      {/* Left indicator strip */}
      <div style={{
        width:        4,
        height:       '100%',
        background:   stripColor(data),
        flexShrink:   0,
        borderRadius: '10px 0 0 10px',
        overflow:     'hidden',
      }} />

      {/* Content */}
      <div style={{
        flex:          1,
        padding:       '9px 10px 8px 10px',
        display:       'flex',
        flexDirection: 'column',
        minWidth:      0,
        gap:           2,
      }}>

        {/* Department icon + name */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
          <div style={{
            width:          32,
            height:         32,
            borderRadius:   8,
            background:     'var(--accent-100)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
          }}>
            <Building2
              size={16}
              strokeWidth={1.75}
              style={{ color: 'var(--brand-active)' }}
            />
          </div>

          <div style={{ minWidth: 0, flex: 1, paddingTop: 1 }}>
            <div
              title={data.positionTitleEn}
              style={{
                fontSize:            'var(--text-body)',
                fontFamily:          'var(--font-sans)',
                fontWeight:          700,
                color:               'var(--ink-1)',
                overflow:            'hidden',
                display:             '-webkit-box',
                WebkitLineClamp:     2,
                WebkitBoxOrient:     'vertical',
                lineHeight:          1.25,
              }}
            >
              {data.positionTitleEn}
            </div>
            {data.deptHeadNameEn && (
              <div style={{
                fontSize:     'var(--text-caption)',
                color:        'var(--ink-3)',
                fontFamily:   'var(--font-sans)',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
                marginTop:    1,
              }}>
                Head: {data.deptHeadNameEn}
              </div>
            )}
          </div>
        </div>

        {/* Headcount fill bar */}
        {approvedHeadcount > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'center',
              marginBottom:   3,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Users2 size={9} strokeWidth={2} style={{ color: 'var(--ink-4)' }} />
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
                  {headcount} / {approvedHeadcount}
                </span>
              </div>
              {vacancyCount > 0 && (
                <span style={{
                  fontSize:     'var(--text-caption)',
                  fontWeight:   600,
                  fontFamily:   'var(--font-sans)',
                  color:        'var(--org-vacant)',
                  background:   '#FEF2F2',
                  padding:      '1px 5px',
                  borderRadius: 10,
                }}>
                  {vacancyCount} vacant
                </span>
              )}
            </div>
            {/* Fill bar */}
            <div style={{
              width:        '100%',
              height:       4,
              borderRadius: 2,
              background:   'var(--border)',
              overflow:     'hidden',
            }}>
              <div style={{
                width:        `${Math.round(fillRatio * 100)}%`,
                height:       '100%',
                background:   vacancyCount > 0 ? 'var(--org-vacant)' : '#10B981',
                borderRadius: 2,
                transition:   'width 0.3s',
              }} />
            </div>
          </div>
        )}

        {/* No approved headcount — show raw counts inline */}
        {approvedHeadcount === 0 && (
          <div style={{
            display:    'flex',
            alignItems: 'center',
            gap:        8,
            marginTop:  4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Users2 size={9} strokeWidth={2} style={{ color: 'var(--ink-4)' }} />
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
                {headcount} people
              </span>
            </div>
            {vacancyCount > 0 && (
              <span style={{
                fontSize:     'var(--text-caption)',
                fontWeight:   600,
                fontFamily:   'var(--font-sans)',
                color:        'var(--org-vacant)',
              }}>
                {vacancyCount} vacant
              </span>
            )}
          </div>
        )}
      </div>

      {/* Collapse / expand toggle pill — only when dept has sub-departments */}
      {hasChildren && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            data.onToggleCollapse?.(data.positionId)
          }}
          style={{
            position:      'absolute',
            bottom:        -10,
            left:          '50%',
            transform:     'translateX(-50%)',
            height:        18,
            padding:       '0 8px',
            borderRadius:  6,
            fontSize:      'var(--text-caption)',
            fontWeight:    600,
            lineHeight:    '18px',
            whiteSpace:    'nowrap',
            background:    data.isCollapsed ? 'var(--surface)' : 'var(--accent)',
            color:         data.isCollapsed ? 'var(--ink-2)'   : 'white',
            border:        data.isCollapsed ? '1px solid var(--border)' : 'none',
            cursor:        'pointer',
            zIndex:        10,
          }}
          aria-label={data.isCollapsed ? 'Expand sub-departments' : 'Collapse sub-departments'}
        >
          {data.isCollapsed ? `▼ ${childLabel}` : `▲ ${childLabel}`}
        </button>
      )}
    </div>
  )
}
