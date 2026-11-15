'use client'

import type { OrgFlowNode, OrgFlowEdge } from '@/lib/org-chart/types'

interface OrgChartBreadcrumbProps {
  selectedNodeId: string | null
  allNodes:       OrgFlowNode[]
  allEdges:       OrgFlowEdge[]
  onNodeClick:    (nodeId: string) => void
}

export function OrgChartBreadcrumb({
  selectedNodeId,
  allNodes,
  allEdges,
  onNodeClick,
}: OrgChartBreadcrumbProps) {
  if (!selectedNodeId) {
    return (
      <span style={{
        fontSize:   'var(--text-caption)',
        fontFamily: 'var(--font-sans)',
        color:      'var(--ink-2)',
      }}>
        Org Chart
      </span>
    )
  }

  // Walk edges upward to build ancestry chain (root → … → selected)
  const chain: OrgFlowNode[] = []
  let currentId: string | null = selectedNodeId
  let depth = 0

  while (currentId && depth < 9) {
    const node = allNodes.find(n => n.id === currentId)
    if (!node) break
    chain.unshift(node)
    const parentEdge = allEdges.find(e => e.target === currentId)
    currentId = parentEdge?.source ?? null
    depth++
  }

  // If chain > 4: show "… › grandparent › parent › selected"
  const visible   = chain.length > 4 ? chain.slice(-3) : chain
  const truncated = chain.length > 4

  const sep = (
    <span style={{ color: 'var(--ink-4)', margin: '0 4px', userSelect: 'none' }}>›</span>
  )

  return (
    <div style={{
      display:    'flex',
      alignItems: 'center',
      fontSize:   'var(--text-caption)',
      fontFamily: 'var(--font-sans)',
      maxWidth:   320,
      overflow:   'hidden',
    }}>
      {truncated && (
        <>
          <span style={{ color: 'var(--ink-2)' }}>…</span>
          {sep}
        </>
      )}
      {visible.map((node, i) => {
        const isLast = i === visible.length - 1
        const label  = node.data.fullNameEn ?? node.data.positionTitleEn
        return (
          <span key={node.id} style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            {i > 0 && sep}
            {isLast ? (
              <span style={{
                color:        'var(--ink-1)',
                fontWeight:   600,
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
              }}>
                {label}
              </span>
            ) : (
              <button
                onClick={() => onNodeClick(node.id)}
                style={{
                  background:   'none',
                  border:       'none',
                  padding:      0,
                  cursor:       'pointer',
                  color:        'var(--ink-2)',
                  fontSize:     'var(--text-caption)',
                  fontFamily:   'var(--font-sans)',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                  maxWidth:     120,
                }}
              >
                {label}
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}
