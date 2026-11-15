'use client'

import { Handle, Position } from '@xyflow/react'
import { HelpCircle, Calendar, MoreHorizontal } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { OrgNodeData } from '@/lib/org-chart/types'

interface VacantNodeProps {
  data:     OrgNodeData
  selected: boolean
}

function vacancyDays(vacancyStartDate?: string): number {
  if (!vacancyStartDate) return 0
  const start = new Date(vacancyStartDate)
  if (isNaN(start.getTime())) return 0
  return Math.floor((Date.now() - start.getTime()) / 86_400_000)
}

export function VacantNode({ data, selected }: VacantNodeProps) {
  const locale   = useLocale()
  const isAr     = locale === 'ar'
  const isFrozen = data.isFrozen

  const stripColor  = isFrozen ? 'var(--org-frozen)'           : 'var(--org-vacant)'
  const badgeText   = isFrozen
    ? (isAr ? 'مجمَّدة' : 'FROZEN')
    : (isAr ? 'شاغرة'  : 'VACANT')
  const badgeBg     = isFrozen ? 'var(--org-frozen-badge-bg)'  : 'var(--org-vacant-badge-bg)'
  const badgeColor  = isFrozen ? 'var(--org-frozen-badge-fg)'  : 'var(--org-vacant-badge-fg)'

  const days = vacancyDays(data.vacancyStartDate)

  return (
    <div
      style={{
        width:        220,
        height:       112,
        background:   'var(--surface)',
        border:       selected
          ? '1.5px dashed var(--accent)'
          : '1.5px dashed var(--border)',
        borderRadius: 10,
        boxShadow:    'none',
        opacity:      0.85,
        position:     'relative',
        overflow:     'visible',
        display:      'flex',
        flexDirection: 'row',
        cursor:       'pointer',
      }}
    >
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

      {/* Left strip */}
      <div style={{
        width:        4,
        height:       '100%',
        background:   stripColor,
        flexShrink:   0,
        borderRadius: '10px 0 0 10px',
        overflow:     'hidden',
      }} />

      {/* Content */}
      <div style={{ flex: 1, padding: '10px 10px 8px 10px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top row: icon + text */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
          {/* Dashed circle icon */}
          <div style={{
            width:          48,
            height:         48,
            borderRadius:   '50%',
            border:         '1.5px dashed var(--border)',
            background:     'var(--surface)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
          }}>
            <HelpCircle size={24} strokeWidth={1.5} style={{ color: 'var(--ink-4)' }} />
          </div>

          {/* Text */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              title={data.positionTitleEn}
              style={{
                fontSize:        'var(--text-body)',
                fontFamily:      'var(--font-sans)',
                fontWeight:      500,
                color:           'var(--ink-2)',
                maxWidth:        130,
                overflow:        'hidden',
                display:         '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                lineHeight:      1.3,
              }}
            >
              {data.positionTitleEn}
            </div>
            <div style={{ marginTop: 4 }}>
              <span style={{
                fontSize:      'var(--text-caption)',
                fontWeight:    600,
                letterSpacing: '0.06em',
                color:         badgeColor,
                background:    badgeBg,
                padding:       '2px 6px',
                borderRadius:  4,
              }}>
                {badgeText}
              </span>
            </div>
            <div style={{
              fontSize:     'var(--text-caption)',
              color:        'var(--ink-3)',
              maxWidth:     130,
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
              lineHeight:   1.3,
              marginTop:    3,
            }}>
              {data.deptNameEn}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />

        {/* Bottom row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={10} strokeWidth={2} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
              {days > 0
                ? (isAr ? `شاغرة منذ ${days} يومًا` : `Vacant ${days} days`)
                : (isAr ? 'شاغرة' : 'Vacant')}
            </span>
          </div>

          {/* +Hire button — only for MANAGER / HR_ADMIN; handler wired in Task E */}
          {(data.viewerRole === 'MANAGER' || data.viewerRole === 'HR_ADMIN') && (
            <button
              onClick={(e) => { e.stopPropagation(); data.onHireClick?.(data.positionId) }}
              style={{
                height:       24,
                padding:      '0 8px',
                borderRadius: 4,
                fontSize:     'var(--text-caption)',
                fontWeight:   500,
                border:       '1.5px solid var(--accent)',
                color:        'var(--brand-active)',
                background:   'transparent',
                cursor:       'pointer',
              }}
            >
              {isAr ? '+ توظيف' : '+ Hire'}
            </button>
          )}
        </div>

        {/* 3-dot action button (Task E) */}
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
