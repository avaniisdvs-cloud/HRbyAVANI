/**
 * lib/org-chart/engines/reporting-engine.ts
 *
 * Reporting Manager / Supervisor Hierarchy Engine
 *
 * Hierarchy source:  persons.line_manager_id  (canonical, denormalised FK)
 * Node identity:     person.id  (not position_id)
 * Vacancy handling:  not applicable — all nodes are active persons
 * Best for:          leave approvals, performance mgmt, span-of-control analysis
 *
 * The CTE anchors on persons whose line_manager_id is NULL or whose manager
 * is outside the active workforce — those are the root nodes. It then recurses
 * downward following line_manager_id references.
 *
 * Acting assignments: if a person is acting in a role, their is_acting flag
 * is set and the node renders with the 'acting' visual type.
 *
 * The output shape is identical to the position engine (OrgFlowNode[]) so the
 * OrgChartCanvas requires zero changes. The node id = person.id instead of
 * position.id — React Flow treats them identically as string keys.
 */

import { sql }                  from 'drizzle-orm'
import { db }                   from '@/lib/db'
import { computeLayout }        from '@/lib/org-chart/build-tree'
import type { OrgFlowNode, OrgFlowEdge, OrgNodeData } from '@/lib/org-chart/types'
import type { EngineResolver }   from './engine-types'

// ── Raw row returned by the CTE ───────────────────────────────────────────────

interface ReportingRow extends Record<string, unknown> {
  person_id:           string
  parent_person_id:    string | null
  full_name_en:        string | null
  full_name_ar:        string | null
  profile_photo_url:   string | null
  person_number:       string | null
  position_id:         string | null
  position_title_en:   string | null
  position_title_ar:   string | null
  dept_id:             string | null
  dept_name_en:        string | null
  dept_name_ar:        string | null
  job_title_en:        string | null
  is_acting:           boolean | null
  acting_end_date:     string | null
  assignment_status:   string | null
  employment_type:     string | null
  nationality_category: string | null
  is_emiratisation_target: boolean | null
  is_management_role:  boolean | null
  depth:               number
  direct_report_count: string | number   // PostgreSQL COUNT returns string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function average(values: number[]): number {
  if (values.length === 0) return 0
  const sum = values.reduce((a, b) => a + b, 0)
  return Math.round((sum / values.length) * 10) / 10
}

function buildNode(row: ReportingRow, position: { x: number; y: number }): OrgFlowNode {
  const isActing = row.is_acting === true
  const type: OrgFlowNode['type'] = isActing ? 'acting' : 'employee'

  const data: OrgNodeData = {
    // Position identity — person's current position (may be absent if unassigned)
    positionId:      row.position_id  ?? row.person_id,  // fallback to person_id as key
    positionTitleEn: row.position_title_en ?? 'No position assigned',
    positionTitleAr: row.position_title_ar ?? row.position_title_en ?? 'لا يوجد منصب',
    // Person fields
    personId:        row.person_id,
    personNumber:    row.person_number        ?? undefined,
    fullNameEn:      row.full_name_en         ?? undefined,
    fullNameAr:      row.full_name_ar         ?? undefined,
    photoUrl:        row.profile_photo_url    ?? undefined,
    // Department
    deptNameEn:      row.dept_name_en         ?? 'Unknown',
    deptNameAr:      row.dept_name_ar         ?? row.dept_name_en ?? 'غير معروف',
    deptId:          row.dept_id              ?? undefined,
    // Job
    jobTitleEn:      row.job_title_en         ?? undefined,
    // Reporting count — set after node is built
    directReportsCount: Number(row.direct_report_count ?? 0),
    // Status flags
    isActing,
    actingEndDate:   row.acting_end_date      ?? undefined,
    isDotted:        false,
    isConfidential:  false,   // reporting engine does not surface confidential positions
    isFrozen:        false,   // not applicable for person-based nodes
    employmentType:  row.employment_type      ?? undefined,
    assignmentStatus: row.assignment_status   ?? undefined,
    nationalityCategory: row.nationality_category ?? undefined,
    isEmiratisationTarget: row.is_emiratisation_target ?? undefined,
    isManagementRole:      row.is_management_role      ?? undefined,
  }

  return { id: row.person_id, type, position, data }
}

// ── Engine resolver ────────────────────────────────────────────────────────────

export const reportingEngineResolver: EngineResolver = async (params) => {
  const depth = Math.min(params.maxDepth, 10)

  // Build set of all active person IDs for orphan detection
  // (persons whose manager exists in DB but is terminated / not active)
  const rootPersonFilter = params.rootPersonId ?? null

  const rows = await db.execute<ReportingRow>(sql`
    WITH RECURSIVE active_persons AS (
      -- All active, non-terminated persons in this tenant
      SELECT p.id
      FROM   persons p
      WHERE  p.tenant_id = ${params.tenantId}::uuid
        AND  p.assignment_status NOT IN ('TERMINATED', 'INACTIVE', 'DECEASED')
        AND  p.is_active = true
    ),
    reporting_tree AS (
      -- ── Anchor: persons who are roots ───────────────────────────────────
      -- A person is a root when:
      --   (a) their line_manager_id is NULL, OR
      --   (b) their manager is not in the active workforce (orphan → promoted to root)
      -- If rootPersonId is supplied, anchor ONLY on that person.
      SELECT
        p.id                          AS person_id,
        NULL::uuid                    AS parent_person_id,
        p.full_name_en,
        p.full_name_ar,
        p.profile_photo_url,
        p.person_number,
        p.nationality_category,
        p.current_position_id         AS position_id,
        pos.position_title_en,
        pos.position_title_ar,
        p.current_department_id       AS dept_id,
        d.name_en                     AS dept_name_en,
        d.name_ar                     AS dept_name_ar,
        j.job_title_en,
        j.is_emiratisation_target,
        j.is_management_role,
        wa.is_acting,
        wa.acting_end_date,
        p.assignment_status,
        wa.employment_type,
        1                             AS depth
      FROM   persons p
      LEFT JOIN positions pos
             ON pos.id = p.current_position_id AND pos.is_active = true
      LEFT JOIN departments d
             ON d.id = p.current_department_id
      LEFT JOIN jobs j
             ON j.id = p.current_job_id
      LEFT JOIN worker_assignments wa
             ON wa.person_id = p.id AND wa.is_current = true
      WHERE  p.tenant_id = ${params.tenantId}::uuid
        AND  p.assignment_status NOT IN ('TERMINATED', 'INACTIVE', 'DECEASED')
        AND  p.is_active = true
        AND  CASE
               -- rootPersonId mode: anchor on just that one person
               WHEN ${rootPersonFilter}::uuid IS NOT NULL
               THEN p.id = ${rootPersonFilter}::uuid
               -- Full org mode: anchor on roots (no active manager)
               ELSE p.line_manager_id IS NULL
                 OR p.line_manager_id NOT IN (SELECT id FROM active_persons)
             END

      UNION ALL

      -- ── Recursive: everyone reporting to someone already in the tree ─────
      SELECT
        p.id,
        p.line_manager_id,
        p.full_name_en, p.full_name_ar, p.profile_photo_url, p.person_number,
        p.nationality_category,
        p.current_position_id,
        pos.position_title_en, pos.position_title_ar,
        p.current_department_id,
        d.name_en, d.name_ar,
        j.job_title_en, j.is_emiratisation_target, j.is_management_role,
        wa.is_acting, wa.acting_end_date,
        p.assignment_status, wa.employment_type,
        rt.depth + 1
      FROM   persons p
      JOIN   reporting_tree rt ON p.line_manager_id = rt.person_id
      LEFT JOIN positions pos
             ON pos.id = p.current_position_id AND pos.is_active = true
      LEFT JOIN departments d
             ON d.id = p.current_department_id
      LEFT JOIN jobs j
             ON j.id = p.current_job_id
      LEFT JOIN worker_assignments wa
             ON wa.person_id = p.id AND wa.is_current = true
      WHERE  p.tenant_id = ${params.tenantId}::uuid
        AND  p.assignment_status NOT IN ('TERMINATED', 'INACTIVE', 'DECEASED')
        AND  p.is_active = true
        AND  rt.depth < ${depth}
    )
    -- Annotate each row with its direct report count (aggregated in SQL
    -- to avoid a client-side scan of potentially thousands of rows)
    SELECT
      rt.*,
      COUNT(child.person_id) AS direct_report_count
    FROM   reporting_tree rt
    LEFT JOIN reporting_tree child ON child.parent_person_id = rt.person_id
    GROUP BY
      rt.person_id, rt.parent_person_id,
      rt.full_name_en, rt.full_name_ar, rt.profile_photo_url, rt.person_number,
      rt.nationality_category,
      rt.position_id, rt.position_title_en, rt.position_title_ar,
      rt.dept_id, rt.dept_name_en, rt.dept_name_ar,
      rt.job_title_en, rt.is_emiratisation_target, rt.is_management_role,
      rt.is_acting, rt.acting_end_date,
      rt.assignment_status, rt.employment_type,
      rt.depth
    ORDER BY rt.depth, rt.parent_person_id NULLS FIRST, rt.full_name_en
  `)

  if (rows.length === 0) {
    return {
      nodes: [],
      edges: [],
      meta: {
        totalNodes:    0,
        maxDepth:      0,
        engine:        'reporting',
        computedAt:    new Date().toISOString(),
        managersCount: 0,
        leafEmployees: 0,
        orphanPersons: 0,
        avgSpanOfControl: 0,
      },
    }
  }

  // ── Compute layout ──────────────────────────────────────────────────────────
  // computeLayout is engine-agnostic — it reads position_id and parent_position_id
  // from whatever row shape is passed. Map our person rows to that interface.
  const layoutRows = rows.map(r => ({
    position_id:        r.person_id,
    parent_position_id: r.parent_person_id ?? null,
    depth:              r.depth,
  }))

  const NODE_W = 240
  const NODE_H = 120
  const H_GAP  = 40
  const V_GAP  = 80

  const layoutPositions = computeLayout(layoutRows as Parameters<typeof computeLayout>[0], NODE_W, NODE_H, H_GAP, V_GAP)

  // ── Build nodes ─────────────────────────────────────────────────────────────
  const nodes: OrgFlowNode[] = rows.map(row => {
    const pos = layoutPositions.get(row.person_id) ?? { x: 0, y: 0 }
    return buildNode(row, pos)
  })

  // ── Build solid edges ───────────────────────────────────────────────────────
  const personIdSet = new Set(rows.map(r => r.person_id))
  const edges: OrgFlowEdge[] = []
  for (const row of rows) {
    if (row.parent_person_id && personIdSet.has(row.parent_person_id)) {
      edges.push({
        id:     `rep-${row.parent_person_id}-${row.person_id}`,
        source: row.parent_person_id,
        target: row.person_id,
        type:   'solid',
      })
    }
  }

  // ── Compute analytics metadata ──────────────────────────────────────────────
  const reportCounts    = rows.map(r => Number(r.direct_report_count ?? 0))
  const managersCount   = reportCounts.filter(c => c > 0).length
  const leafEmployees   = reportCounts.filter(c => c === 0).length
  const managerCounts   = reportCounts.filter(c => c > 0)
  const avgSpanOfControl = average(managerCounts)
  const maxDepth        = rows.reduce((m, r) => Math.max(m, r.depth), 0)

  return {
    nodes,
    edges,
    meta: {
      totalNodes:      rows.length,
      maxDepth,
      engine:          'reporting',
      computedAt:      new Date().toISOString(),
      managersCount,
      leafEmployees,
      orphanPersons:   0,   // anchor rows whose manager is inactive are roots, not orphans
      avgSpanOfControl,
    },
  }
}
