/**
 * lib/org-chart/engines/engine-types.ts
 *
 * Shared types for all hierarchy engines.
 * Every engine produces a HierarchyResult — the canvas and analytics
 * pipeline only interact with this shape, never with engine internals.
 *
 * Sessions 3+: position + reporting implemented.
 * Sessions 4/5: department + my-team added here.
 */

import type { OrgFlowNode, OrgFlowEdge, OrgViewerRole } from '@/lib/org-chart/types'

// ── Engine discriminator ──────────────────────────────────────────────────────

export type HierarchyEngine =
  | 'position'    // Session 3 ✅ — position hierarchy (Tasks A–G)
  | 'reporting'   // Session 3 ✅ — reporting manager / supervisor hierarchy
  | 'department'  // Session 4 ✅ — department aggregate hierarchy
  | 'my-team'     // Session 5 ✅ — employee-centric self-service view
  | 'matrix'      // Phase 2     — cross-functional / dotted-line

// ── Engine parameters ─────────────────────────────────────────────────────────

export interface EngineParams {
  tenantId:         string
  viewerRole:       OrgViewerRole
  // Optional scoping — not all engines honour all fields
  legalEntityId?:   string
  rootPersonId?:    string
  rootDeptId?:      string
  // Engine behaviour
  includeVacant:    boolean   // position engine only; ignored by reporting
  maxDepth:         number    // capped server-side at 10
  // My Team engine
  currentPersonId?: string
  showPeers?:       boolean
}

// ── Unified metadata returned by every engine ────────────────────────────────

export interface HierarchyMeta {
  // Universal
  totalNodes:    number
  maxDepth:      number
  engine:        HierarchyEngine
  computedAt:    string  // ISO timestamp

  // Position engine fields (undefined for other engines)
  totalPositions?: number   // alias for totalNodes — kept for backward compat
  occupiedCount?:  number
  vacantCount?:    number
  frozenCount?:    number
  actingCount?:    number

  // Reporting engine fields
  managersCount?:    number   // persons with ≥1 direct report
  leafEmployees?:    number   // persons with 0 direct reports
  orphanPersons?:    number   // persons whose manager is terminated / absent
  avgSpanOfControl?: number   // average direct reports per manager (rounded 1dp)

  // Department engine fields (Session 4)
  totalDepts?:           number
  deptsWithVacancies?:   number

  // My Team engine fields (Session 5)
  directReports?:        number   // direct reports of the root person
}

// ── Engine output contract ────────────────────────────────────────────────────

export interface HierarchyResult {
  nodes: OrgFlowNode[]
  edges: OrgFlowEdge[]
  meta:  HierarchyMeta
}

// ── Engine resolver function signature ───────────────────────────────────────

export type EngineResolver = (params: EngineParams) => Promise<HierarchyResult>
