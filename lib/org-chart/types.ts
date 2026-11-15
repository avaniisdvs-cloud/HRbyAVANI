/**
 * Shared org chart types — Task B.2
 * Single import point for all components.
 */
import type { Node, Edge } from '@xyflow/react'

export type OrgNodeType = 'employee' | 'vacant' | 'acting' | 'frozen' | 'department'

// OrgNodeData MUST extend Record<string, unknown> — required by @xyflow/react 12.x
export interface OrgNodeData extends Record<string, unknown> {
  positionId:         string
  positionTitleEn:    string
  positionTitleAr:    string
  personId?:          string
  personNumber?:      string
  fullNameEn?:        string
  fullNameAr?:        string
  photoUrl?:          string
  deptNameEn:         string
  deptNameAr:         string
  jobTitleEn?:        string
  directReportsCount: number
  isActing:           boolean
  actingEndDate?:     string
  isDotted:           boolean
  employmentType?:    string
  isConfidential:     boolean
  isFrozen:           boolean
  // injected by OrgChartCanvas so nodes can gate on RBAC
  viewerRole?:        OrgViewerRole
  // department id — needed for dept filter (Task D)
  deptId?:                string
  // assignment fields — sourced from worker_assignments (Task D)
  assignmentStatus?:      string   // 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' etc.
  hireDateDaysAgo?:       number
  isEmiratisationTarget?: boolean
  isManagementRole?:      boolean
  // injected by shell for span-of-control highlighting (Task D)
  flagOverloaded?:        boolean
  flagUnderSupervised?:   boolean
  // added Task F for Emiratisation analytics
  nationalityCategory?:   string
  // added Task G — set when position becomes vacant
  vacancyStartDate?:      string
  // added Task G — ARIA highlighted node ring
  isHighlighted?:         boolean
  // collapse / expand (Task C)
  onToggleCollapse?:  (nodeId: string) => void
  isCollapsed?:       boolean
  // optional callbacks wired in Task E
  onHireClick?:       (positionId: string) => void
  onActionClick?:     (positionId: string, event: React.MouseEvent) => void
  // department hierarchy engine fields (Session 3 / 4)
  headcount?:         number
  approvedHeadcount?: number
  vacancyCount?:      number
  childDeptCount?:    number
  deptHeadNameEn?:    string
}

export type OrgFlowNode = Node<OrgNodeData, OrgNodeType>
export type OrgFlowEdge = Edge

export type OrgViewerRole = 'EMPLOYEE' | 'MANAGER' | 'HR_ADMIN' | 'EXECUTIVE'

export interface OrgTreeMeta {
  totalPositions: number
  occupiedCount:  number
  vacantCount:    number
  frozenCount:    number
  actingCount:    number
  maxDepth:       number
}

export interface SystemUserRow {
  id:             string
  personNumber:   string
  fullNameEn:     string | null
  fullNameAr:     string | null
  photoUrl:       string | null
  employmentType: string | null
  deptNameEn:     string | null
}
