/**
 * Org Chart data layer — Task A.2
 *
 * Single entry point: getOrgTree() runs a PostgreSQL recursive CTE to
 * fetch the full position hierarchy in one round-trip, then builds the
 * React Flow node/edge arrays and computes a top-down layout.
 */
import { sql, eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import { persons, departments } from '@/drizzle/schema'
import type { SystemUserRow } from './types'

// ── Public types ─────────────────────────────────────────────────────────────

export type OrgViewerRole = 'EMPLOYEE' | 'MANAGER' | 'HR_ADMIN' | 'EXECUTIVE'

export interface OrgTreeParams {
  tenantId:        string
  legalEntityId?:  string
  rootPersonId?:   string
  rootDeptId?:     string
  viewerRole:      OrgViewerRole
  includeVacant:   boolean
  maxDepth?:       number
}

export interface OrgNodeData {
  positionId:        string
  positionTitleEn:   string
  positionTitleAr:   string
  personId?:         string
  personNumber?:     string
  fullNameEn?:       string
  fullNameAr?:       string
  photoUrl?:         string
  deptNameEn:        string
  deptNameAr:        string
  deptId?:           string
  jobTitleEn?:       string
  directReportsCount: number
  isActing:          boolean
  actingEndDate?:    string
  isDotted:          boolean
  employmentType?:   string
  isConfidential:    boolean
  isFrozen:          boolean
  assignmentStatus?:      string
  hireDateDaysAgo?:       number
  isEmiratisationTarget?: boolean
  isManagementRole?:      boolean
  nationalityCategory?:   string
  vacancyStartDate?:      string
}

export interface OrgNode {
  id:       string
  type:     'employee' | 'vacant' | 'acting' | 'frozen'
  position: { x: number; y: number }
  data:     OrgNodeData
}

export interface OrgEdge {
  id:     string
  source: string
  target: string
  type:   'solid' | 'dotted'
}

export interface OrgTreeMeta {
  totalPositions: number
  occupiedCount:  number
  vacantCount:    number
  frozenCount:    number
  actingCount:    number
  maxDepth:       number
}

export interface OrgTreeData {
  nodes: OrgNode[]
  edges: OrgEdge[]
  meta:  OrgTreeMeta
}

// ── Raw row shape returned by the CTE ────────────────────────────────────────

interface OrgRow extends Record<string, unknown> {
  position_id:              string
  position_title_en:        string
  position_title_ar:        string | null
  parent_position_id:       string | null
  is_occupied:              boolean
  is_confidential:          boolean
  is_frozen:                boolean
  department_id:            string
  dept_name_en:             string
  dept_name_ar:             string | null
  grade_id:                 string | null
  job_id:                   string
  job_title_en:             string | null
  person_id:                string | null
  person_number:            string | null
  full_name_en:             string | null
  full_name_ar:             string | null
  profile_photo_url:        string | null
  employment_type:          string | null
  line_manager_id:          string | null
  dotted_line_manager_id:   string | null
  is_acting:                boolean | null
  acting_end_date:          string | null
  assignment_status:        string | null
  hire_date_days_ago:       number | null
  is_emiratisation_target:  boolean | null
  is_management_role:       boolean | null
  nationality_category:     string | null
  vacancy_start_date:       string | null
  depth:                    number
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function getOrgTree(params: OrgTreeParams): Promise<OrgTreeData> {
  const {
    tenantId,
    legalEntityId,
    rootPersonId,
    rootDeptId,
    viewerRole,
    includeVacant,
    maxDepth = 6,
  } = params

  // Clamp maxDepth to max 10 per spec
  const depth = Math.min(maxDepth, 10)

  // Nullable SQL params
  const entityFilter   = legalEntityId ?? null
  const personFilter   = rootPersonId  ?? null
  const deptFilter     = rootDeptId    ?? null

  const rows = await db.execute<OrgRow>(sql`
    WITH RECURSIVE org_tree AS (
      SELECT
        p.id                        AS position_id,
        p.position_title_en,
        p.position_title_ar,
        p.reports_to_position_id    AS parent_position_id,
        p.is_occupied,
        p.is_confidential,
        p.is_frozen,
        p.vacancy_start_date,
        p.department_id,
        p.grade_id,
        p.job_id,
        per.id                      AS person_id,
        per.person_number,
        per.full_name_en,
        per.full_name_ar,
        per.profile_photo_url,
        per.nationality_category,
        wa.employment_type,
        wa.line_manager_id,
        wa.dotted_line_manager_id,
        wa.is_acting,
        wa.acting_end_date,
        wa.assignment_status,
        EXTRACT(DAY FROM NOW() - wa.effective_start_date)::int AS hire_date_days_ago,
        d.name_en                   AS dept_name_en,
        d.name_ar                   AS dept_name_ar,
        j.job_title_en,
        j.is_emiratisation_target,
        j.is_management_role,
        1                           AS depth
      FROM   positions p
      LEFT JOIN persons per
             ON per.id = p.occupied_by_person_id
      LEFT JOIN worker_assignments wa
             ON wa.person_id = per.id
            AND wa.is_current = true
      LEFT JOIN departments d  ON d.id = p.department_id
      LEFT JOIN jobs        j  ON j.id = p.job_id
      WHERE  p.is_active = true
        AND  p.tenant_id = ${tenantId}::uuid
        AND  (${entityFilter}::uuid IS NULL OR p.legal_entity_id = ${entityFilter}::uuid)
        -- Anchor root selection:
        --   personFilter → start from that person's position
        --   deptFilter   → "local root" of the department: a position in the
        --                  target dept whose parent is NULL (global root) OR
        --                  belongs to a DIFFERENT department.  Without this,
        --                  a dept whose head reports to a position in another
        --                  dept (e.g. CTO → CEO/Corporate Services) always
        --                  returns zero rows because the old logic required
        --                  reports_to_position_id IS NULL globally.
        --   default      → true global roots (reports_to IS NULL)
        AND  CASE
               WHEN ${personFilter}::uuid IS NOT NULL
               THEN p.occupied_by_person_id = ${personFilter}::uuid
               WHEN ${deptFilter}::uuid IS NOT NULL
               THEN p.department_id = ${deptFilter}::uuid
                    AND (
                      p.reports_to_position_id IS NULL
                      OR NOT EXISTS (
                        SELECT 1 FROM positions parent_p
                        WHERE  parent_p.id            = p.reports_to_position_id
                          AND  parent_p.department_id = ${deptFilter}::uuid
                          AND  parent_p.is_active     = true
                          AND  parent_p.tenant_id     = ${tenantId}::uuid
                      )
                    )
               ELSE p.reports_to_position_id IS NULL
             END

      UNION ALL

      SELECT
        p.id, p.position_title_en, p.position_title_ar,
        p.reports_to_position_id, p.is_occupied,
        p.is_confidential, p.is_frozen, p.vacancy_start_date, p.department_id,
        p.grade_id, p.job_id,
        per.id, per.person_number, per.full_name_en,
        per.full_name_ar, per.profile_photo_url, per.nationality_category,
        wa.employment_type, wa.line_manager_id,
        wa.dotted_line_manager_id, wa.is_acting, wa.acting_end_date,
        wa.assignment_status,
        EXTRACT(DAY FROM NOW() - wa.effective_start_date)::int,
        d.name_en, d.name_ar, j.job_title_en,
        j.is_emiratisation_target, j.is_management_role,
        ot.depth + 1
      FROM   positions p
      JOIN   org_tree ot ON p.reports_to_position_id = ot.position_id
      LEFT JOIN persons per
             ON per.id = p.occupied_by_person_id
      LEFT JOIN worker_assignments wa
             ON wa.person_id = per.id
            AND wa.is_current = true
      LEFT JOIN departments d  ON d.id = p.department_id
      LEFT JOIN jobs        j  ON j.id = p.job_id
      WHERE  ot.depth < ${depth}
        AND  p.is_active = true
    )
    SELECT * FROM org_tree
    ORDER BY depth, parent_position_id NULLS FIRST
  `)

  // Filter vacant if not requested
  let filtered = includeVacant
    ? rows
    : rows.filter(r => r.is_occupied)

  // EMPLOYEE role: hide confidential positions
  if (viewerRole === 'EMPLOYEE') {
    filtered = filtered.filter(r => !r.is_confidential)
  }

  // Build direct-reports count map
  const directReportCounts = new Map<string, number>()
  for (const row of filtered) {
    if (row.parent_position_id) {
      directReportCounts.set(
        row.parent_position_id,
        (directReportCounts.get(row.parent_position_id) ?? 0) + 1,
      )
    }
  }

  // Build position → node map for dotted-line edge resolution
  // (maps person_id → position_id for held positions)
  const personToPosition = new Map<string, string>()
  for (const row of filtered) {
    if (row.person_id) {
      personToPosition.set(row.person_id, row.position_id)
    }
  }

  // Layout: top-down tree
  const NODE_W = 240
  const NODE_H = 120
  const H_GAP  = 40
  const V_GAP  = 80

  const positions = computeLayout(filtered, NODE_W, NODE_H, H_GAP, V_GAP)

  // Build nodes
  const nodes: OrgNode[] = filtered.map(row => {
    const isActing  = row.is_acting === true
    const isFrozen  = row.is_frozen
    const isVacant  = !row.is_occupied

    let type: OrgNode['type']
    if (isActing)       type = 'acting'
    else if (isFrozen)  type = 'frozen'
    else if (isVacant)  type = 'vacant'
    else                type = 'employee'

    const pos = positions.get(row.position_id) ?? { x: 0, y: 0 }

    const data: OrgNodeData = {
      positionId:         row.position_id,
      positionTitleEn:    row.position_title_en,
      positionTitleAr:    row.position_title_ar ?? row.position_title_en,
      deptNameEn:         row.dept_name_en,
      deptNameAr:         row.dept_name_ar ?? row.dept_name_en,
      deptId:             row.department_id,
      directReportsCount: directReportCounts.get(row.position_id) ?? 0,
      isActing,
      isConfidential:     row.is_confidential,
      isFrozen,
      isDotted:           false,
      assignmentStatus:       row.assignment_status     ?? undefined,
      hireDateDaysAgo:        row.hire_date_days_ago    != null ? Number(row.hire_date_days_ago) : undefined,
      isEmiratisationTarget:  row.is_emiratisation_target ?? undefined,
      isManagementRole:       row.is_management_role      ?? undefined,
      nationalityCategory:    row.nationality_category    ?? undefined,
      vacancyStartDate:       row.vacancy_start_date      ?? undefined,
      ...(row.person_id ? {
        personId:     row.person_id,
        personNumber: row.person_number ?? undefined,
        fullNameEn:   row.full_name_en ?? undefined,
        fullNameAr:   row.full_name_ar ?? undefined,
        photoUrl:     row.profile_photo_url ?? undefined,
        employmentType: row.employment_type ?? undefined,
        jobTitleEn:   row.job_title_en ?? undefined,
      } : {}),
      ...(row.acting_end_date ? { actingEndDate: row.acting_end_date } : {}),
    }

    // EMPLOYEE: mask personal data for non-self nodes — no email/mobile exposed anyway
    // (contact fields live in person_contacts, not in this query)

    return { id: row.position_id, type, position: pos, data }
  })

  // Build solid edges (hierarchy)
  const edges: OrgEdge[] = []
  for (const row of filtered) {
    if (row.parent_position_id) {
      const parentInTree = filtered.some(r => r.position_id === row.parent_position_id)
      if (parentInTree) {
        edges.push({
          id:     `solid-${row.parent_position_id}-${row.position_id}`,
          source: row.parent_position_id,
          target: row.position_id,
          type:   'solid',
        })
      }
    }
  }

  // Build dotted-line edges (matrix reporting)
  for (const row of filtered) {
    if (row.dotted_line_manager_id) {
      const managerPositionId = personToPosition.get(row.dotted_line_manager_id)
      if (managerPositionId && managerPositionId !== row.parent_position_id) {
        edges.push({
          id:     `dotted-${managerPositionId}-${row.position_id}`,
          source: managerPositionId,
          target: row.position_id,
          type:   'dotted',
        })
      }
    }
  }

  // Meta
  const meta: OrgTreeMeta = {
    totalPositions: filtered.length,
    occupiedCount:  filtered.filter(r => r.is_occupied).length,
    vacantCount:    filtered.filter(r => !r.is_occupied).length,
    frozenCount:    filtered.filter(r => r.is_frozen).length,
    actingCount:    filtered.filter(r => r.is_acting === true).length,
    maxDepth:       filtered.reduce((m, r) => Math.max(m, r.depth), 0),
  }

  return { nodes, edges, meta }
}

// ── Layout algorithm ─────────────────────────────────────────────────────────

/**
 * Simple top-down tree layout.
 * Returns a map of nodeId → {x, y} coordinates.
 *
 * Strategy: post-order width calculation, then centre each parent
 * over its children.
 *
 * Engine-agnostic: the rows only need position_id / parent_position_id / depth
 * fields. Exported so reporting and future engines can reuse it.
 */
export function computeLayout(
  rows: OrgRow[],
  nodeW: number,
  nodeH: number,
  hGap: number,
  vGap: number,
): Map<string, { x: number; y: number }> {
  const childMap = new Map<string | null, string[]>()
  for (const row of rows) {
    const parent = row.parent_position_id ?? null
    if (!childMap.has(parent)) childMap.set(parent, [])
    childMap.get(parent)!.push(row.position_id)
  }

  const subtreeWidth = new Map<string, number>()
  const depthMap = new Map<string, number>()
  for (const row of rows) depthMap.set(row.position_id, row.depth)

  // Post-order traversal to compute subtree widths
  function calcWidth(id: string): number {
    const children = childMap.get(id) ?? []
    if (children.length === 0) {
      subtreeWidth.set(id, nodeW)
      return nodeW
    }
    const total = children.reduce((sum, c) => {
      return sum + calcWidth(c) + hGap
    }, -hGap)
    subtreeWidth.set(id, total)
    return total
  }

  const roots = childMap.get(null) ?? []
  roots.forEach(r => calcWidth(r))

  // Pre-order traversal to assign positions
  const result = new Map<string, { x: number; y: number }>()
  let currentX = 0

  function place(id: string, x: number, depth: number) {
    const y = (depth - 1) * (nodeH + vGap)
    result.set(id, { x, y })
    const children = childMap.get(id) ?? []
    if (children.length === 0) return
    const totalW = children.reduce((s, c) => s + (subtreeWidth.get(c) ?? nodeW) + hGap, -hGap)
    let cx = x - totalW / 2
    for (const child of children) {
      const cw = subtreeWidth.get(child) ?? nodeW
      place(child, cx + cw / 2, depth + 1)
      cx += cw + hGap
    }
  }

  for (const root of roots) {
    const rw = subtreeWidth.get(root) ?? nodeW
    place(root, currentX + rw / 2, 1)
    currentX += rw + hGap * 2
  }

  return result
}

// ── Ancestor chain (for breadcrumb + "Navigate to CEO") ──────────────────────

export async function getPersonAncestorChain(
  personId: string,
  tenantId: string = TENANT_ID,
): Promise<Array<{ positionId: string; personId: string; fullNameEn: string; positionTitleEn: string }>> {
  const MAX_LEVELS = 15
  const chain: Array<{ positionId: string; personId: string; fullNameEn: string; positionTitleEn: string }> = []
  let currentPersonId: string | null = personId

  type AncestorRow = Record<string, unknown> & {
    position_id: string
    person_id: string
    full_name_en: string | null
    position_title_en: string
    line_manager_id: string | null
  }

  for (let i = 0; i < MAX_LEVELS && currentPersonId; i++) {
    const rows: AncestorRow[] = await db.execute<AncestorRow>(sql`
      SELECT
        pos.id              AS position_id,
        per.id              AS person_id,
        per.full_name_en,
        pos.position_title_en,
        wa.line_manager_id
      FROM persons per
      LEFT JOIN positions pos ON pos.occupied_by_person_id = per.id AND pos.is_active = true
      LEFT JOIN worker_assignments wa
             ON wa.person_id = per.id AND wa.is_current = true
      WHERE per.id = ${currentPersonId}::uuid
        AND per.tenant_id = ${tenantId}::uuid
      LIMIT 1
    `)

    if (rows.length === 0) break
    const row: AncestorRow = rows[0]
    if (!row.position_id) break

    chain.push({
      positionId:      row.position_id,
      personId:        row.person_id,
      fullNameEn:      row.full_name_en ?? 'Unknown',
      positionTitleEn: row.position_title_en,
    })

    currentPersonId = row.line_manager_id ?? null
  }

  return chain
}

// ── System users ─────────────────────────────────────────────────────────────

export async function getSystemUsers(tenantId: string = TENANT_ID): Promise<SystemUserRow[]> {
  const rows = await db
    .select({
      id:             persons.id,
      personNumber:   persons.personNumber,
      fullNameEn:     persons.fullNameEn,
      fullNameAr:     persons.fullNameAr,
      photoUrl:       persons.profilePhotoUrl,
      employmentType: persons.employmentType,
      deptNameEn:     departments.nameEn,
    })
    .from(persons)
    .leftJoin(departments, eq(departments.id, persons.currentDepartmentId))
    .where(
      and(
        eq(persons.tenantId, tenantId),
        eq(persons.isSystemUser, true),
        eq(persons.isActive, true),
      ),
    )
    .orderBy(persons.fullNameEn)

  return rows.map(r => ({
    id:             r.id,
    personNumber:   r.personNumber,
    fullNameEn:     r.fullNameEn,
    fullNameAr:     r.fullNameAr,
    photoUrl:       r.photoUrl,
    employmentType: r.employmentType,
    deptNameEn:     r.deptNameEn ?? null,
  }))
}

// ── Direct reports (one level down) ──────────────────────────────────────────

export async function getDirectReportNodes(
  managerId: string,
  tenantId: string = TENANT_ID,
): Promise<OrgNode[]> {
  const rows = await db.execute<OrgRow>(sql`
    SELECT
      p.id                      AS position_id,
      p.position_title_en,
      p.position_title_ar,
      p.reports_to_position_id  AS parent_position_id,
      p.is_occupied,
      p.is_confidential,
      p.is_frozen,
      p.department_id,
      p.grade_id,
      p.job_id,
      per.id                    AS person_id,
      per.person_number,
      per.full_name_en,
      per.full_name_ar,
      per.profile_photo_url,
      wa.employment_type,
      wa.line_manager_id,
      wa.dotted_line_manager_id,
      wa.is_acting,
      wa.acting_end_date,
      wa.assignment_status,
      EXTRACT(DAY FROM NOW() - wa.effective_start_date)::int AS hire_date_days_ago,
      d.name_en                 AS dept_name_en,
      d.name_ar                 AS dept_name_ar,
      j.job_title_en,
      j.is_emiratisation_target,
      j.is_management_role,
      1                         AS depth
    FROM   positions p
    LEFT JOIN persons per ON per.id = p.occupied_by_person_id
    LEFT JOIN worker_assignments wa
           ON wa.person_id = per.id AND wa.is_current = true
    LEFT JOIN departments d ON d.id = p.department_id
    LEFT JOIN jobs        j ON j.id = p.job_id
    WHERE  p.reports_to_position_id IN (
      SELECT pos.id FROM positions pos
      WHERE pos.occupied_by_person_id = ${managerId}::uuid
        AND pos.is_active = true
        AND pos.tenant_id = ${tenantId}::uuid
    )
    AND p.is_active = true
    AND p.tenant_id = ${tenantId}::uuid
    ORDER BY p.position_title_en
  `)

  return rows.map(row => ({
    id:       row.position_id,
    type:     row.is_acting ? 'acting' : row.is_frozen ? 'frozen' : !row.is_occupied ? 'vacant' : 'employee' as OrgNode['type'],
    position: { x: 0, y: 0 },
    data: {
      positionId:             row.position_id,
      positionTitleEn:        row.position_title_en,
      positionTitleAr:        row.position_title_ar ?? row.position_title_en,
      deptNameEn:             row.dept_name_en,
      deptNameAr:             row.dept_name_ar ?? row.dept_name_en,
      deptId:                 row.department_id,
      directReportsCount:     0,
      isActing:               row.is_acting === true,
      isConfidential:         row.is_confidential,
      isFrozen:               row.is_frozen,
      isDotted:               false,
      assignmentStatus:       row.assignment_status     ?? undefined,
      hireDateDaysAgo:        row.hire_date_days_ago    != null ? Number(row.hire_date_days_ago) : undefined,
      isEmiratisationTarget:  row.is_emiratisation_target ?? undefined,
      isManagementRole:       row.is_management_role      ?? undefined,
      nationalityCategory:    row.nationality_category    ?? undefined,
      vacancyStartDate:       row.vacancy_start_date      ?? undefined,
      ...(row.person_id ? {
        personId:       row.person_id,
        personNumber:   row.person_number ?? undefined,
        fullNameEn:     row.full_name_en ?? undefined,
        fullNameAr:     row.full_name_ar ?? undefined,
        photoUrl:       row.profile_photo_url ?? undefined,
        employmentType: row.employment_type ?? undefined,
        jobTitleEn:     row.job_title_en ?? undefined,
      } : {}),
    },
  }))
}
