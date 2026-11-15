/**
 * lib/org-chart/engines/my-team-engine.ts
 *
 * My Team Hierarchy Engine — employee-centric self-service view
 *
 * Hierarchy source:  persons.line_manager_id
 * Node identity:     person.id
 * Root:              currentPersonId (the viewer's own person record)
 * Default depth:     3 (personal view — not a company-wide tree)
 *
 * Two modes:
 *   showPeers = false (default):
 *     Root = current person → direct reports → their reports
 *     Best for: managers reviewing their own team
 *
 *   showPeers = true:
 *     Root = current person's line manager (if exists, else same as above)
 *     Shows all siblings (peers) of the current person + their subtrees
 *     Best for: employees wanting to see who's on the same team
 *
 * EMPLOYEE role lock:
 *   fetchHierarchy() in org-chart-actions.ts enforces 'my-team' for EMPLOYEE role
 *   server-side regardless of what params.engine the client sends.
 *   No client-side UI for the ViewBySelector is shown to EMPLOYEE.
 *
 * Empty result handling:
 *   If currentPersonId is absent (session has no linked person record),
 *   returns empty nodes/edges with a helpful meta message.
 */

import { sql }              from 'drizzle-orm'
import { db }              from '@/lib/db'
import { computeLayout }   from '@/lib/org-chart/build-tree'
import type { OrgFlowNode, OrgFlowEdge, OrgNodeData } from '@/lib/org-chart/types'
import type { EngineResolver, HierarchyResult } from './engine-types'

// ── Raw row shape ─────────────────────────────────────────────────────────────

interface MyTeamRow extends Record<string, unknown> {
  person_id:            string
  parent_person_id:     string | null
  full_name_en:         string | null
  full_name_ar:         string | null
  profile_photo_url:    string | null
  person_number:        string | null
  position_id:          string | null
  position_title_en:    string | null
  position_title_ar:    string | null
  dept_id:              string | null
  dept_name_en:         string | null
  dept_name_ar:         string | null
  job_title_en:         string | null
  is_acting:            boolean | null
  acting_end_date:      string | null
  assignment_status:    string | null
  employment_type:      string | null
  nationality_category: string | null
  is_emiratisation_target: boolean | null
  is_management_role:   boolean | null
  line_manager_id:      string | null
  depth:                number
  direct_report_count:  string | number
}

// ── Node builder (identical pattern to reporting-engine.ts) ───────────────────

function buildNode(row: MyTeamRow, position: { x: number; y: number }): OrgFlowNode {
  const isActing = row.is_acting === true
  const type: OrgFlowNode['type'] = isActing ? 'acting' : 'employee'

  const data: OrgNodeData = {
    positionId:      row.position_id ?? row.person_id,
    positionTitleEn: row.position_title_en ?? 'No position assigned',
    positionTitleAr: row.position_title_ar ?? row.position_title_en ?? 'لا يوجد منصب',
    personId:        row.person_id,
    personNumber:    row.person_number       ?? undefined,
    fullNameEn:      row.full_name_en        ?? undefined,
    fullNameAr:      row.full_name_ar        ?? undefined,
    photoUrl:        row.profile_photo_url   ?? undefined,
    deptNameEn:      row.dept_name_en        ?? 'Unknown',
    deptNameAr:      row.dept_name_ar        ?? row.dept_name_en ?? 'غير معروف',
    deptId:          row.dept_id             ?? undefined,
    jobTitleEn:      row.job_title_en        ?? undefined,
    directReportsCount: Number(row.direct_report_count ?? 0),
    isActing,
    actingEndDate:   row.acting_end_date     ?? undefined,
    isDotted:        false,
    isConfidential:  false,
    isFrozen:        false,
    employmentType:  row.employment_type     ?? undefined,
    assignmentStatus: row.assignment_status  ?? undefined,
    nationalityCategory: row.nationality_category ?? undefined,
    isEmiratisationTarget: row.is_emiratisation_target ?? undefined,
    isManagementRole:      row.is_management_role      ?? undefined,
  }

  return { id: row.person_id, type, position, data }
}

// ── Engine resolver ───────────────────────────────────────────────────────────

export const myTeamEngineResolver: EngineResolver = async (params) => {
  const tenantId        = params.tenantId
  const currentPersonId = params.currentPersonId ?? null
  const showPeers       = params.showPeers ?? false
  const maxDepth        = Math.min(params.maxDepth ?? 3, 10)

  // ── Guard: no linked person record ────────────────────────────────────────
  if (!currentPersonId) {
    return {
      nodes: [],
      edges: [],
      meta: {
        totalNodes:      0,
        maxDepth:        0,
        engine:          'my-team',
        computedAt:      new Date().toISOString(),
        managersCount:   0,
        leafEmployees:   0,
        directReports:   0,
      },
    }
  }

  // ── EMPLOYEE branch: UPWARD management line ───────────────────────────────
  // An employee's self-service org chart shows their reporting line UPWARD:
  // self → direct manager → manager's manager → … up to the top of the chain.
  // It walks persons.line_manager_id and includes ONLY the people on that line
  // (no peers, no other reports), so an ESS user can never see unrelated staff
  // or the full company tree — RBAC scope is preserved by construction.
  // If the employee has no (active) manager, the chain is just themselves →
  // a clean top-level / no-manager state.
  if (params.viewerRole === 'EMPLOYEE') {
    // SQL returns the display columns + lvl; depth & parent_person_id are
    // derived in JS below. (MyTeamRow has a string index signature, so Omit
    // would erase its named props — keep the full row type and overwrite.)
    type UpRow = MyTeamRow & { lvl: number }
    const MAX_LEVELS = Math.min(params.maxDepth ?? 10, 15)

    const upRows = await db.execute<UpRow>(sql`
      WITH RECURSIVE up_chain AS (
        -- Anchor: the employee themselves
        SELECT
          p.id                        AS person_id,
          p.full_name_en,
          p.full_name_ar,
          p.profile_photo_url,
          p.person_number,
          p.nationality_category,
          p.current_position_id       AS position_id,
          pos.position_title_en,
          pos.position_title_ar,
          p.current_department_id     AS dept_id,
          d.name_en                   AS dept_name_en,
          d.name_ar                   AS dept_name_ar,
          j.job_title_en,
          j.is_emiratisation_target,
          j.is_management_role,
          wa.is_acting,
          wa.acting_end_date,
          p.assignment_status,
          wa.employment_type,
          p.line_manager_id,
          0                           AS lvl
        FROM   persons p
        LEFT JOIN positions pos
               ON pos.id = p.current_position_id AND pos.is_active = true
        LEFT JOIN departments d
               ON d.id = p.current_department_id
        LEFT JOIN jobs j
               ON j.id = p.current_job_id
        LEFT JOIN worker_assignments wa
               ON wa.person_id = p.id AND wa.is_current = true
        WHERE  p.id          = ${currentPersonId}::uuid
          AND  p.tenant_id   = ${tenantId}::uuid
          AND  p.is_active   = true
          AND  p.assignment_status NOT IN ('TERMINATED', 'INACTIVE', 'DECEASED')

        UNION ALL

        -- Recursive: the line manager of the person already in the chain
        SELECT
          m.id,
          m.full_name_en,
          m.full_name_ar,
          m.profile_photo_url,
          m.person_number,
          m.nationality_category,
          m.current_position_id,
          pos.position_title_en,
          pos.position_title_ar,
          m.current_department_id,
          d.name_en,
          d.name_ar,
          j.job_title_en,
          j.is_emiratisation_target,
          j.is_management_role,
          wa.is_acting,
          wa.acting_end_date,
          m.assignment_status,
          wa.employment_type,
          m.line_manager_id,
          uc.lvl + 1                  AS lvl
        FROM   persons m
        JOIN   up_chain uc ON m.id = uc.line_manager_id
        LEFT JOIN positions pos
               ON pos.id = m.current_position_id AND pos.is_active = true
        LEFT JOIN departments d
               ON d.id = m.current_department_id
        LEFT JOIN jobs j
               ON j.id = m.current_job_id
        LEFT JOIN worker_assignments wa
               ON wa.person_id = m.id AND wa.is_current = true
        WHERE  m.tenant_id   = ${tenantId}::uuid
          AND  m.is_active   = true
          AND  m.assignment_status NOT IN ('TERMINATED', 'INACTIVE', 'DECEASED')
          AND  uc.lvl        < ${MAX_LEVELS}
      )
      SELECT
        uc.*,
        (
          SELECT COUNT(*) FROM persons cc
          WHERE  cc.line_manager_id = uc.person_id
            AND  cc.tenant_id       = ${tenantId}::uuid
            AND  cc.is_active       = true
            AND  cc.assignment_status NOT IN ('TERMINATED', 'INACTIVE', 'DECEASED')
        )                           AS direct_report_count
      FROM up_chain uc
      ORDER BY uc.lvl DESC
    `)

    if (upRows.length === 0) {
      return {
        nodes: [], edges: [],
        meta: {
          totalNodes: 0, maxDepth: 0, engine: 'my-team',
          computedAt: new Date().toISOString(),
          managersCount: 0, leafEmployees: 0, directReports: 0,
        },
      }
    }

    // Invert level → tree depth (top of chain = depth 1, employee = deepest)
    // and link each node to the manager directly above it on the chain.
    const chainIds = new Set(upRows.map(r => r.person_id))
    const maxLvl   = upRows.reduce((m, r) => Math.max(m, Number(r.lvl)), 0)
    const chainRows: MyTeamRow[] = upRows.map(r => ({
      ...r,
      depth:            maxLvl - Number(r.lvl) + 1,
      parent_person_id: (r.line_manager_id && chainIds.has(r.line_manager_id)) ? r.line_manager_id : null,
    }))

    return buildResultFromRows(chainRows, currentPersonId)
  }

  // ── Step 1: look up current person's line_manager_id ─────────────────────
  // Needed when showPeers = true so we can anchor on the manager.
  let effectiveRootId = currentPersonId

  if (showPeers) {
    const managerRows = await db.execute<{ line_manager_id: string | null }>(sql`
      SELECT line_manager_id
      FROM   persons
      WHERE  id         = ${currentPersonId}::uuid
        AND  tenant_id  = ${tenantId}::uuid
        AND  is_active  = true
      LIMIT  1
    `)
    const managerId = managerRows[0]?.line_manager_id ?? null
    if (managerId) effectiveRootId = managerId
    // If no manager → stays as currentPersonId (same as default mode)
  }

  // ── Step 2: Recursive CTE ─────────────────────────────────────────────────
  const rows = await db.execute<MyTeamRow>(sql`
    WITH RECURSIVE my_team AS (
      -- Anchor: the root person (self or line manager when showPeers = true)
      SELECT
        p.id                        AS person_id,
        NULL::uuid                  AS parent_person_id,
        p.full_name_en,
        p.full_name_ar,
        p.profile_photo_url,
        p.person_number,
        p.nationality_category,
        p.current_position_id       AS position_id,
        pos.position_title_en,
        pos.position_title_ar,
        p.current_department_id     AS dept_id,
        d.name_en                   AS dept_name_en,
        d.name_ar                   AS dept_name_ar,
        j.job_title_en,
        j.is_emiratisation_target,
        j.is_management_role,
        wa.is_acting,
        wa.acting_end_date,
        p.assignment_status,
        wa.employment_type,
        p.line_manager_id,
        1                           AS depth
      FROM   persons p
      LEFT JOIN positions pos
             ON pos.id = p.current_position_id AND pos.is_active = true
      LEFT JOIN departments d
             ON d.id = p.current_department_id
      LEFT JOIN jobs j
             ON j.id = p.current_job_id
      LEFT JOIN worker_assignments wa
             ON wa.person_id = p.id AND wa.is_current = true
      WHERE  p.id          = ${effectiveRootId}::uuid
        AND  p.tenant_id   = ${tenantId}::uuid
        AND  p.is_active   = true
        AND  p.assignment_status NOT IN ('TERMINATED', 'INACTIVE', 'DECEASED')

      UNION ALL

      -- Recursive: direct reports of every person already in the tree
      SELECT
        p.id,
        p.line_manager_id           AS parent_person_id,
        p.full_name_en,
        p.full_name_ar,
        p.profile_photo_url,
        p.person_number,
        p.nationality_category,
        p.current_position_id,
        pos.position_title_en,
        pos.position_title_ar,
        p.current_department_id,
        d.name_en,
        d.name_ar,
        j.job_title_en,
        j.is_emiratisation_target,
        j.is_management_role,
        wa.is_acting,
        wa.acting_end_date,
        p.assignment_status,
        wa.employment_type,
        p.line_manager_id,
        mt.depth + 1                AS depth
      FROM   persons p
      JOIN   my_team mt  ON p.line_manager_id = mt.person_id
      LEFT JOIN positions pos
             ON pos.id = p.current_position_id AND pos.is_active = true
      LEFT JOIN departments d
             ON d.id = p.current_department_id
      LEFT JOIN jobs j
             ON j.id = p.current_job_id
      LEFT JOIN worker_assignments wa
             ON wa.person_id = p.id AND wa.is_current = true
      WHERE  p.tenant_id   = ${tenantId}::uuid
        AND  p.is_active   = true
        AND  p.assignment_status NOT IN ('TERMINATED', 'INACTIVE', 'DECEASED')
        AND  mt.depth      < ${maxDepth}
    )
    -- Annotate each row with its direct report count
    SELECT
      mt.*,
      COUNT(child.person_id) AS direct_report_count
    FROM   my_team mt
    LEFT JOIN my_team child ON child.parent_person_id = mt.person_id
    GROUP BY
      mt.person_id,       mt.parent_person_id,
      mt.full_name_en,    mt.full_name_ar,    mt.profile_photo_url,
      mt.person_number,   mt.nationality_category,
      mt.position_id,     mt.position_title_en, mt.position_title_ar,
      mt.dept_id,         mt.dept_name_en,    mt.dept_name_ar,
      mt.job_title_en,    mt.is_emiratisation_target, mt.is_management_role,
      mt.is_acting,       mt.acting_end_date,
      mt.assignment_status, mt.employment_type,
      mt.line_manager_id, mt.depth
    ORDER BY mt.depth, mt.parent_person_id NULLS FIRST, mt.full_name_en
  `)

  return buildResultFromRows(rows, effectiveRootId)
}

// ── Shared result builder ─────────────────────────────────────────────────────
// Turns a set of MyTeamRow records (each carrying person_id, parent_person_id,
// depth and direct_report_count) into the canvas-ready HierarchyResult. Used by
// both the downward team view and the employee upward-chain view so layout,
// node, edge and meta logic stay identical.
function buildResultFromRows(
  rows: MyTeamRow[],
  rootPersonId: string,
): HierarchyResult {
  if (rows.length === 0) {
    return {
      nodes: [],
      edges: [],
      meta: {
        totalNodes:    0,
        maxDepth:      0,
        engine:        'my-team',
        computedAt:    new Date().toISOString(),
        managersCount: 0,
        leafEmployees: 0,
        directReports: 0,
      },
    }
  }

  // ── Compute layout ────────────────────────────────────────────────────────
  const NODE_W = 240
  const NODE_H = 120
  const H_GAP  = 40
  const V_GAP  = 80

  const layoutRows = rows.map(r => ({
    position_id:        r.person_id,
    parent_position_id: r.parent_person_id ?? null,
    depth:              r.depth,
  }))

  const layoutPositions = computeLayout(
    layoutRows as Parameters<typeof computeLayout>[0],
    NODE_W, NODE_H, H_GAP, V_GAP,
  )

  // ── Build nodes ───────────────────────────────────────────────────────────
  const nodes: OrgFlowNode[] = rows.map(row => {
    const pos = layoutPositions.get(row.person_id) ?? { x: 0, y: 0 }
    return buildNode(row, pos)
  })

  // ── Build edges ───────────────────────────────────────────────────────────
  const personIdSet = new Set(rows.map(r => r.person_id))
  const edges: OrgFlowEdge[] = []
  for (const row of rows) {
    if (row.parent_person_id && personIdSet.has(row.parent_person_id)) {
      edges.push({
        id:     `mt-${row.parent_person_id}-${row.person_id}`,
        source: row.parent_person_id,
        target: row.person_id,
        type:   'solid',
      })
    }
  }

  // ── Compute meta ──────────────────────────────────────────────────────────
  const reportCounts  = rows.map(r => Number(r.direct_report_count ?? 0))
  const managersCount = reportCounts.filter(c => c > 0).length
  const leafEmployees = reportCounts.filter(c => c === 0).length
  const maxDepthActual = rows.reduce((m, r) => Math.max(m, r.depth), 0)

  // Direct reports of the root person (depth 2 nodes whose parent is root)
  const directReports = rows.filter(
    r => r.parent_person_id === rootPersonId && r.person_id !== rootPersonId,
  ).length

  return {
    nodes,
    edges,
    meta: {
      totalNodes:    rows.length,
      maxDepth:      maxDepthActual,
      engine:        'my-team',
      computedAt:    new Date().toISOString(),
      managersCount,
      leafEmployees,
      directReports,
    },
  }
}
