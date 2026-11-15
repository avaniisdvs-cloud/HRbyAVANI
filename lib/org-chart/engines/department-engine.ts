/**
 * lib/org-chart/engines/department-engine.ts
 *
 * Department Hierarchy Engine — recursive CTE over departments.parent_department_id
 *
 * Hierarchy source:  departments.parent_department_id (self-referencing)
 * Node identity:     department.id
 * Node type:         'department'
 * Aggregates:        headcount (active worker_assignments), vacancy_count (positions)
 *
 * Best for:  structural / budget view — how departments roll up to each other,
 *            approved vs actual headcount, vacancy ratios per department.
 *
 * Note: action panel / hire drawer are NOT available on department nodes —
 * those are position-scoped actions. The Shell gates this in the UI.
 */

import { db }                 from '@/lib/db'
import { sql }                from 'drizzle-orm'
import { computeLayout }      from '@/lib/org-chart/build-tree'
import type { OrgFlowNode, OrgFlowEdge } from '@/lib/org-chart/types'
import type { EngineResolver } from './engine-types'

// ── Raw row shape returned by the CTE ────────────────────────────────────────

interface DeptRow extends Record<string, unknown> {
  dept_id:              string
  name_en:              string
  name_ar:              string | null
  parent_department_id: string | null
  approved_headcount:   number
  depth:                number
  head_person_id:       string | null
  head_name_en:         string | null
  head_name_ar:         string | null
  head_photo_url:       string | null
  headcount:            number   // active persons in this dept
  vacancy_count:        number   // vacant positions in this dept
  child_dept_count:     number   // direct sub-departments
  direct_reports_count: number   // same as child_dept_count (for layout pill)
}

// ── Layout adapter (maps dept rows to OrgRow shape expected by computeLayout) ─

interface OrgRow extends Record<string, unknown> {
  position_id:        string
  parent_position_id: string | null
  depth:              number
}

// ─────────────────────────────────────────────────────────────────────────────

export const departmentEngineResolver: EngineResolver = async (params) => {
  const tenantId = params.tenantId
  const maxDepth = Math.min(params.maxDepth ?? 8, 10)

  // ── Recursive CTE ─────────────────────────────────────────────────────────
  const rows = await db.execute<DeptRow>(sql`
    WITH RECURSIVE dept_tree AS (
      -- Anchor: root departments (no parent OR parent is outside active set)
      SELECT
        d.id              AS dept_id,
        d.name_en,
        d.name_ar,
        d.parent_department_id,
        d.head_person_id,
        d.approved_headcount,
        1                 AS depth
      FROM departments d
      WHERE d.tenant_id  = ${tenantId}::uuid
        AND d.is_active  = true
        AND (
          d.parent_department_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM departments p
            WHERE p.id          = d.parent_department_id
              AND p.tenant_id   = d.tenant_id
              AND p.is_active   = true
          )
        )

      UNION ALL

      -- Recursive: children of each dept
      SELECT
        d.id              AS dept_id,
        d.name_en,
        d.name_ar,
        d.parent_department_id,
        d.head_person_id,
        d.approved_headcount,
        dt.depth + 1      AS depth
      FROM departments d
      JOIN dept_tree dt   ON d.parent_department_id = dt.dept_id
      WHERE d.tenant_id   = ${tenantId}::uuid
        AND d.is_active   = true
        AND dt.depth      < ${maxDepth}
    ),

    -- Headcount: active persons currently assigned to each dept
    dept_headcount AS (
      SELECT
        wa.department_id,
        COUNT(*)::int AS active_persons
      FROM worker_assignments wa
      WHERE wa.tenant_id         = ${tenantId}::uuid
        AND wa.is_current        = true
        AND wa.assignment_status = 'ACTIVE'
        AND wa.department_id     IN (SELECT dept_id FROM dept_tree)
      GROUP BY wa.department_id
    ),

    -- Vacancy count: unfilled active positions in each dept
    dept_vacancy AS (
      SELECT
        p.department_id,
        COUNT(*)::int AS vacant_positions
      FROM positions p
      WHERE p.tenant_id   = ${tenantId}::uuid
        AND p.is_active   = true
        AND p.is_occupied = false
        AND p.department_id IN (SELECT dept_id FROM dept_tree)
      GROUP BY p.department_id
    ),

    -- Child count: how many direct sub-departments each dept has
    child_counts AS (
      SELECT
        dt_parent.dept_id,
        COUNT(dt_child.dept_id)::int AS child_dept_count
      FROM dept_tree dt_parent
      LEFT JOIN dept_tree dt_child
        ON dt_child.parent_department_id = dt_parent.dept_id
      GROUP BY dt_parent.dept_id
    )

    SELECT
      dt.dept_id,
      dt.name_en,
      COALESCE(dt.name_ar, dt.name_en)             AS name_ar,
      dt.parent_department_id,
      dt.approved_headcount,
      dt.depth,
      p.id                                          AS head_person_id,
      p.full_name_en                                AS head_name_en,
      p.full_name_ar                                AS head_name_ar,
      p.profile_photo_url                           AS head_photo_url,
      COALESCE(hc.active_persons,    0)             AS headcount,
      COALESCE(dv.vacant_positions,  0)             AS vacancy_count,
      COALESCE(cc.child_dept_count,  0)             AS child_dept_count,
      COALESCE(cc.child_dept_count,  0)             AS direct_reports_count
    FROM dept_tree dt
    LEFT JOIN persons p
      ON dt.head_person_id = p.id
     AND p.is_active       = true
    LEFT JOIN dept_headcount hc ON hc.department_id = dt.dept_id
    LEFT JOIN dept_vacancy   dv ON dv.department_id = dt.dept_id
    LEFT JOIN child_counts   cc ON cc.dept_id       = dt.dept_id
    ORDER BY dt.depth, dt.name_en
  `)

  // ── Compute layout positions ──────────────────────────────────────────────

  const NODE_W = 220
  const NODE_H = 120   // slightly taller than EmployeeNode (112) for dept metrics
  const H_GAP  = 40
  const V_GAP  = 80

  // Adapt dept rows to the minimal shape that computeLayout actually reads.
  // computeLayout only accesses position_id / parent_position_id / depth —
  // the full OrgRow type is build-tree-internal so we cast to satisfy TS.
  const layoutRows: OrgRow[] = rows.map(r => ({
    position_id:        r.dept_id,
    parent_position_id: r.parent_department_id,
    depth:              r.depth,
  }))

  // computeLayout is typed against the full internal OrgRow from build-tree.ts
  // but only reads position_id / parent_position_id / depth at runtime.
  // The cast is safe — OrgRow extends Record<string, unknown> on both sides.
  const positions = computeLayout(layoutRows as unknown as Parameters<typeof computeLayout>[0], NODE_W, NODE_H, H_GAP, V_GAP)

  // ── Build OrgFlowNode array ───────────────────────────────────────────────

  const nodes: OrgFlowNode[] = rows.map(r => {
    const pos = positions.get(r.dept_id) ?? { x: 0, y: 0 }

    return {
      id:       r.dept_id,
      type:     'department',
      position: pos,
      data: {
        // OrgNodeData required fields — re-used semantically for dept identity
        positionId:         r.dept_id,          // dept id in positionId slot
        positionTitleEn:    r.name_en,
        positionTitleAr:    r.name_ar ?? r.name_en,
        deptNameEn:         r.name_en,
        deptNameAr:         r.name_ar ?? r.name_en,
        deptId:             r.dept_id,
        directReportsCount: r.direct_reports_count,
        isActing:           false,
        isDotted:           false,
        isConfidential:     false,
        isFrozen:           false,

        // Department-specific fields (Session 4)
        deptHeadNameEn:   r.head_name_en  ?? undefined,
        deptHeadNameAr:   r.head_name_ar  ?? undefined,
        deptHeadPhotoUrl: r.head_photo_url ?? undefined,
        headcount:        r.headcount,
        vacancyCount:     r.vacancy_count,
        approvedHeadcount: r.approved_headcount,
        childDeptCount:   r.child_dept_count,
      },
    }
  })

  // ── Build OrgFlowEdge array ───────────────────────────────────────────────

  const edges: OrgFlowEdge[] = rows
    .filter(r => r.parent_department_id !== null)
    .map(r => ({
      id:     `${r.parent_department_id}->${r.dept_id}`,
      source: r.parent_department_id!,
      target: r.dept_id,
      type:   'solid',
    }))

  // ── Build HierarchyMeta ───────────────────────────────────────────────────

  const totalDepts       = rows.length
  const deptsWithVacancies = rows.filter(r => r.vacancy_count > 0).length
  const maxDepthActual   = rows.reduce((m, r) => Math.max(m, r.depth), 0)

  return {
    nodes,
    edges,
    meta: {
      totalNodes:        totalDepts,
      maxDepth:          maxDepthActual,
      engine:            'department',
      computedAt:        new Date().toISOString(),
      totalDepts,
      deptsWithVacancies,
    },
  }
}
