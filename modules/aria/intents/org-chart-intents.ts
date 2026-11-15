/**
 * ARIA Org Chart Intents — Task G
 *
 * Four org-chart-specific intents resolved client-side using the
 * already-loaded tree nodes, dispatching canvas events via chart-events.ts.
 *
 * Each intent has:
 *   matcher  — regex patterns that trigger it
 *   resolver — async function returning { text, dispatch? }
 *
 * These are consumed by OrgChartAriaPanel, NOT by the global sendAriaMessage
 * server action (which remains focused on personal HR data).
 */

import {
  dispatchChartEvent,
  type ChartEventType,
  type ChartEventPayload,
} from '@/lib/org-chart/chart-events'
import { getOrgChartPendingCounts } from '@/modules/core-hr/org-chart-actions'
import type { OrgFlowNode }         from '@/lib/org-chart/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrgChartIntentContext {
  query:       string
  nodes:       OrgFlowNode[]
  departments: Array<{ id: string; nameEn: string }>
}

export interface OrgChartIntentResult {
  text:     string
  matched:  boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dispatch<T extends ChartEventType>(type: T, payload: ChartEventPayload[T]) {
  dispatchChartEvent(type, payload)
}

/** Fuzzy name match — lower-case contains check. */
function findNodeByName(name: string, nodes: OrgFlowNode[]): OrgFlowNode | undefined {
  const q = name.toLowerCase().trim()
  return nodes.find(n =>
    n.data.fullNameEn?.toLowerCase().includes(q) ||
    n.data.positionTitleEn?.toLowerCase().includes(q)
  )
}

/** Find all nodes whose parent is the given node ID. */
function getDirectReportIds(nodeId: string, nodes: OrgFlowNode[]): string[] {
  // We need the edges — but we only have nodes here. Use directReportsCount as a
  // sanity check and find by matching the node's positionId against other nodes'
  // parent… we don't have edges in this context. Instead we'll highlight by
  // searching for persons that appear below in the same dept.
  // Pragmatic approach: filter nodes that appear to report to the given node
  // by looking up their line manager from node data isn't available here.
  // Fallback: highlight the found manager node only, and note count.
  // Task H can improve with edge data if needed.
  void nodeId; void nodes
  return []
}

// ── Intent 1 — WHO_REPORTS_TO ─────────────────────────────────────────────────

const WHO_REPORTS_RE = /who\s+reports?\s+to\s+(.+)|show\s+(.+?)['s]*\s+team|(.+?)\s+direct\s+reports?|(.+?)\s+reports?/i

export async function resolveWhoReportsTo(ctx: OrgChartIntentContext): Promise<OrgChartIntentResult | null> {
  const m = ctx.query.match(WHO_REPORTS_RE)
  if (!m) return null

  const name = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').replace(/['s]+$/, '').trim()
  if (!name || name.length < 2) return null

  const found = findNodeByName(name, ctx.nodes)
  if (!found) {
    return {
      matched: true,
      text:    `I couldn't find "${name}" in the current view. Try searching by name or check the active filters.`,
    }
  }

  const count = found.data.directReportsCount ?? 0
  const plural = count === 1 ? '' : 's'
  const displayName = found.data.fullNameEn ?? found.data.positionTitleEn

  dispatch('PAN_TO_NODE', { nodeId: found.id })

  // Get direct report node IDs — they'll share the found node's positionId as their parent
  const reportIds = ctx.nodes
    .filter(n => {
      // We can't access edges here; look for nodes with the same dept that might be reports
      // A better approximation: nodes whose data.lineManagerId === found.data.personId
      // But lineManagerId isn't in OrgNodeData. Use the count we have.
      return false // will highlight just the manager node for now
    })
    .map(n => n.id)

  if (count > 0) {
    dispatch('HIGHLIGHT_NODES', {
      nodeIds: [found.id, ...reportIds],
      reason:  `Direct reports of ${displayName}`,
    })
  }

  return {
    matched: true,
    text:    `${displayName} has ${count} direct report${plural}. I've centred the chart on their position.`,
  }
}

// ── Intent 2 — SHOW_VACANT ────────────────────────────────────────────────────

const SHOW_VACANT_RE = /vacant|vacanc(y|ies)|unfilled|open\s+position|open\s+roles?/i
const IN_DEPT_RE     = /\bin\s+(.+)/i

export async function resolveShowVacant(ctx: OrgChartIntentContext): Promise<OrgChartIntentResult | null> {
  if (!SHOW_VACANT_RE.test(ctx.query)) return null

  const deptMatch = ctx.query.match(IN_DEPT_RE)
  let deptClause  = ''
  let foundDept: { id: string; nameEn: string } | undefined

  if (deptMatch) {
    const deptName = deptMatch[1].trim()
    foundDept = ctx.departments.find(d =>
      d.nameEn.toLowerCase().includes(deptName.toLowerCase())
    )
    if (foundDept) {
      deptClause = ` in ${foundDept.nameEn}`
      dispatch('FILTER_DEPT', { deptId: foundDept.id, deptName: foundDept.nameEn })
    }
  }

  dispatch('FILTER_VACANT', {})

  const vacantCount = ctx.nodes.filter(n => n.type === 'vacant' || n.type === 'frozen').length
  const plural = vacantCount === 1 ? '' : 's'

  if (vacantCount === 0) {
    return { matched: true, text: `No vacant positions found${deptClause} with the current filters.` }
  }

  return {
    matched: true,
    text:    `There are ${vacantCount} vacant position${plural}${deptClause}. I've applied the filter to the chart.`,
  }
}

// ── Intent 3 — SHOW_FULL_ORG ─────────────────────────────────────────────────

const SHOW_FULL_RE = /show\s+full|whole\s+company|entire\s+org|all\s+employees|show\s+everyone|full\s+organisation|company\s+org\s+chart/i

export async function resolveShowFullOrg(ctx: OrgChartIntentContext): Promise<OrgChartIntentResult | null> {
  if (!SHOW_FULL_RE.test(ctx.query)) return null

  dispatch('RELOAD_FULL', {} as Record<string, never>)

  return {
    matched: true,
    text:    'Showing the full organisation. Use the ⚙️ filters to narrow the view.',
  }
}

// ── Intent 4 — PENDING_REQUESTS ──────────────────────────────────────────────

const PENDING_RE = /hiring\s+requests?|pending\s+requests?|open\s+requests?|how\s+many\s+requests?|transfer\s+requests?\s+pending/i

export async function resolvePendingRequests(ctx: OrgChartIntentContext): Promise<OrgChartIntentResult | null> {
  if (!PENDING_RE.test(ctx.query)) return null

  const counts = await getOrgChartPendingCounts()
  const hr = counts.hiringRequests
  const tr = counts.transferRequests
  const hrPlural = hr === 1 ? '' : 's'
  const trPlural = tr === 1 ? '' : 's'

  return {
    matched: true,
    text:    `There are ${hr} pending hiring request${hrPlural} and ${tr} pending transfer request${trPlural} awaiting approval.`,
  }
}

// ── Main resolver — try all intents in order ──────────────────────────────────

export async function resolveOrgChartIntent(ctx: OrgChartIntentContext): Promise<OrgChartIntentResult | null> {
  return (
    (await resolveWhoReportsTo(ctx))  ??
    (await resolveShowVacant(ctx))    ??
    (await resolveShowFullOrg(ctx))   ??
    (await resolvePendingRequests(ctx))
  )
}
