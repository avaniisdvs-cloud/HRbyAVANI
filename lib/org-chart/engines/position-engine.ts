/**
 * lib/org-chart/engines/position-engine.ts
 *
 * Position Hierarchy Engine — thin resolver wrapper over the existing
 * getOrgTree() recursive CTE in build-tree.ts.
 *
 * Hierarchy source:  positions.reports_to_position_id (self-referencing)
 * Node identity:     position.id
 * Vacancy handling:  fully supported — vacant/frozen/acting node types
 * Best for:          workforce planning, budgeting, succession management
 */

import { getOrgTree }          from '@/lib/org-chart/build-tree'
import type { OrgFlowNode, OrgFlowEdge } from '@/lib/org-chart/types'
import type { EngineResolver } from './engine-types'

export const positionEngineResolver: EngineResolver = async (params) => {
  const raw = await getOrgTree({
    tenantId:      params.tenantId,
    viewerRole:    params.viewerRole,
    legalEntityId: params.legalEntityId,
    rootPersonId:  params.rootPersonId,
    rootDeptId:    params.rootDeptId,
    includeVacant: params.includeVacant,
    maxDepth:      params.maxDepth,
  })

  // build-tree.ts defines its own local OrgNodeData without Record<string, unknown>.
  // The shape is a strict subset of types.ts OrgNodeData — the cast is safe.
  return {
    nodes: raw.nodes as unknown as OrgFlowNode[],
    edges: raw.edges as unknown as OrgFlowEdge[],
    meta: {
      // Universal
      totalNodes:    raw.meta.totalPositions,
      maxDepth:      raw.meta.maxDepth,
      engine:        'position',
      computedAt:    new Date().toISOString(),
      // Position-specific (also aliased for backward compat)
      totalPositions: raw.meta.totalPositions,
      occupiedCount:  raw.meta.occupiedCount,
      vacantCount:    raw.meta.vacantCount,
      frozenCount:    raw.meta.frozenCount,
      actingCount:    raw.meta.actingCount,
    },
  }
}
