'use client'

import { Handle, Position } from '@xyflow/react'
import { Users, MoreHorizontal } from 'lucide-react'
import { InitialsAvatar } from './InitialsAvatar'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { OrgNodeData } from '@/lib/org-chart/types'

interface EmployeeNodeProps {
  data:     OrgNodeData
  selected: boolean
}

// Left indicator strip colour
function stripColor(data: OrgNodeData): string {
  if (data.isActing)                        return 'var(--org-acting)'
  if (data.employmentType === 'CONTRACTOR') return 'var(--org-contractor)'
  return 'var(--accent)'
}

export function EmployeeNode({ data, selected }: EmployeeNodeProps) {
  const locale = useLocale()
  const isAr   = locale === 'ar'
  const reportLabel = isAr
    ? (data.directReportsCount === 1 ? 'مرؤوس واحد' : `${data.directReportsCount} مرؤوسين`)
    : (data.directReportsCount === 1 ? '1 report'   : `${data.directReportsCount} reports`)

  const overloaded       = data.flagOverloaded      && data.directReportsCount > 8
  const underSupervised  = data.flagUnderSupervised  && data.isManagementRole && data.directReportsCount === 0

  const outline = data.isHighlighted
    ? '2.5px solid var(--accent)'
    : overloaded
      ? '2.5px solid var(--org-overloaded)'
      : underSupervised
        ? '2px dashed var(--org-under-supervised)'
        : undefined

  const outlineOffset = data.isHighlighted ? 4 : 2

  return (
    <div
      style={{
        width:       220,
        height:      112,
        background:  'var(--card)',
        border:      selected
          ? '1.5px solid var(--accent)'
          : '1.5px solid var(--border)',
        borderRadius: 10,
        boxShadow:   selected
          ? '0 0 0 3px var(--accent-100), 0 4px 16px rgba(0,0,0,0.12)'
          : '0 2px 8px rgba(0,0,0,0.07)',
        transition:  'box-shadow 0.15s, border-color 0.15s',
        cursor:      'pointer',
        position:    'relative',
        overflow:    'visible',
        display:     'flex',
        flexDirection: 'row',
        ...(outline ? { outline, outlineOffset } : {}),
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

      {/* Left indicator strip — needs its own clip since card is overflow:visible */}
      <div style={{
        width:           4,
        height:          '100%',
        background:      stripColor(data),
        flexShrink:      0,
        borderRadius:    '10px 0 0 10px',
        overflow:        'hidden',
      }} />

      {/* Content */}
      <div style={{ flex: 1, padding: '10px 10px 8px 10px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top row: avatar + text */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
          {/* Avatar */}
          {data.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            // Azure Blob SAS URLs are external — next/image domain config is Phase 2
            <img
              src={data.photoUrl}
              alt={data.fullNameEn ?? data.positionTitleEn}
              width={48}
              height={48}
              style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <InitialsAvatar name={data.fullNameEn ?? data.positionTitleEn} size={48} />
          )}

          {/* Text block */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              title={data.fullNameEn ?? data.positionTitleEn}
              style={{
                fontSize:            'var(--text-body)',
                fontFamily:          'var(--font-sans)',
                fontWeight:          600,
                color:               'var(--ink-1)',
                maxWidth:            130,
                overflow:            'hidden',
                display:             '-webkit-box',
                WebkitLineClamp:     2,
                WebkitBoxOrient:     'vertical',
                lineHeight:          1.3,
              }}
            >
              {data.fullNameEn ?? data.positionTitleEn}
            </div>
            <div
              title={data.jobTitleEn ?? data.positionTitleEn}
              style={{
                fontSize:            'var(--text-caption)',
                color:               'var(--ink-2)',
                maxWidth:            130,
                overflow:            'hidden',
                display:             '-webkit-box',
                WebkitLineClamp:     2,
                WebkitBoxOrient:     'vertical',
                lineHeight:          1.3,
                marginTop:           2,
              }}
            >
              {data.jobTitleEn ?? data.positionTitleEn}
            </div>
            <div style={{
              fontSize:     'var(--text-caption)',
              color:        'var(--ink-3)',
              maxWidth:     130,
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
              lineHeight:   1.3,
              marginTop:    2,
            }}>
              {data.deptNameEn}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />

        {/* Bottom row: reports count + action button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Users size={10} strokeWidth={2} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{reportLabel}</span>
        </div>

        {/* 3-dot action button — Task E wires the handler */}
        <button
          onClick={(e) => { e.stopPropagation(); data.onActionClick?.(data.positionId, e) }}
          style={{
            position:     'absolute',
            right:        8,
            bottom:       8,
            width:        20,
            height:       20,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            background:   'transparent',
            border:       'none',
            borderRadius: 4,
            cursor:       'pointer',
            color:        'var(--ink-3)',
            padding:      0,
          }}
          aria-label={isAr ? 'إجراءات' : 'Actions'}
        >
          <MoreHorizontal size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Collapse / expand toggle pill — only when node has children */}
      {data.directReportsCount > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); data.onToggleCollapse?.(data.positionId) }}
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
          aria-label={data.isCollapsed ? (isAr ? 'توسيع' : 'Expand') : (isAr ? 'طي' : 'Collapse')}
        >
          {data.isCollapsed
            ? `▼ ${data.directReportsCount}`
            : `▲ ${data.directReportsCount}`}
        </button>
      )}
    </div>
  )
}
