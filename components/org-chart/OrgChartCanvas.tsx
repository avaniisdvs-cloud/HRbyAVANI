'use client'

import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  type NodeTypes,
} from '@xyflow/react'
import { Bot }                from 'lucide-react'
import { useLocale }          from '@/components/providers/LocaleProvider'
import { EmployeeNode }       from './EmployeeNode'
import { VacantNode }         from './VacantNode'
import { DepartmentNode }     from './DepartmentNode'
import { OrgChartController } from './OrgChartController'
import { OrgChartLegend }     from './OrgChartLegend'
import { solidEdgeStyle, dottedEdgeStyle } from './edges'
import type { OrgFlowNode, OrgFlowEdge } from '@/lib/org-chart/types'
import type { HierarchyMeta } from '@/lib/org-chart/engines/engine-types'
import type { OrgChartControls } from './OrgChartController'
import type { OrgViewerRole } from '@/lib/org-chart/types'

// Declared outside component — React Flow requires stable nodeTypes reference
const nodeTypes: NodeTypes = {
  employee:   EmployeeNode   as never,
  vacant:     VacantNode     as never,
  acting:     EmployeeNode   as never,
  frozen:     VacantNode     as never,
  department: DepartmentNode as never,   // Session 4
}

export interface OrgChartCanvasProps {
  nodes:          OrgFlowNode[]
  edges:          OrgFlowEdge[]
  meta:           HierarchyMeta
  onNodeClick:    (nodeId: string) => void
  controlsRef:    React.MutableRefObject<OrgChartControls | null>
  viewerRole?:    OrgViewerRole
  onAriaToggle?:  () => void
  ariaOpen?:      boolean
}

export function OrgChartCanvas({
  nodes,
  edges,
  meta: _meta,
  onNodeClick,
  controlsRef,
  viewerRole,
  onAriaToggle,
  ariaOpen,
}: OrgChartCanvasProps) {
  const isAr = useLocale() === 'ar'
  // Map OrgFlowEdges → styled React Flow edges (presentation concern stays in canvas)
  const styledEdges = useMemo(
    () => edges.map(edge => ({
      ...edge,
      type:      'smoothstep',
      style:     edge.type === 'dotted' ? dottedEdgeStyle : solidEdgeStyle,
      animated:  false,
      markerEnd: undefined,
    })),
    [edges],
  )

  return (
    <div id="org-chart-canvas" style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
        minZoom={0.15}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => onNodeClick(node.id)}
      >
        <OrgChartController controlsRef={controlsRef} />
        <OrgChartLegend />
        <Background
          color="var(--border)"
          gap={28}
          size={1}
          style={{ background: 'var(--bg)' }}
        />
        <Controls
          showInteractive={false}
          style={{
            background:   'var(--card)',
            border:       '1px solid var(--border)',
            borderRadius: 8,
            boxShadow:    '0 2px 8px rgba(0,0,0,0.07)',
          }}
        />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          style={{
            background:   'var(--card)',
            border:       '1px solid var(--border)',
            borderRadius: 8,
          }}
        />

        {/* ARIA trigger button — HR_ADMIN, MANAGER, EXECUTIVE only */}
        {viewerRole && viewerRole !== 'EMPLOYEE' && onAriaToggle && (
          <Panel position="bottom-right">
            <button
              onClick={onAriaToggle}
              aria-label={isAr ? 'فتح مساعد آريا' : 'Open ARIA assistant'}
              title={isAr ? 'آريا — مساعد الهيكل التنظيمي' : 'ARIA — Org Chart Assistant'}
              style={{
                width:         44,
                height:        44,
                borderRadius:  '50%',
                background:    ariaOpen ? 'var(--accent-700, #1d4ed8)' : 'var(--accent)',
                border:        'none',
                boxShadow:     '0 4px 14px rgba(0,0,0,0.22)',
                cursor:        'pointer',
                display:       'flex',
                alignItems:    'center',
                justifyContent:'center',
                color:         'white',
                transition:    'background 0.15s, transform 0.1s',
                marginBottom:  8,
                marginRight:   8,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
            >
              <Bot size={20} strokeWidth={2} />
            </button>
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}
