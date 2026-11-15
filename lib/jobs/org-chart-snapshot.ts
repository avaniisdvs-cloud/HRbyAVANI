/**
 * Org Chart Snapshot Cron Job — Session 6
 *
 * Runs hourly. For each global engine that has a stale (or missing) snapshot,
 * it calls the engine resolver, then persists the result via snapshot-store.
 *
 * Personalized engines (my-team) are intentionally excluded from precompute —
 * they are cheap and scoped to one person's subtree; the SSR page falls back
 * to the live CTE for those.
 *
 * Engines covered: position · reporting · department
 * Not covered:     my-team (personalised) · matrix (Phase 2)
 */

import cron from 'node-cron'
import { eq }                     from 'drizzle-orm'
import { db }                     from '@/lib/db'
import { orgHierarchySnapshots }  from '@/drizzle/schema/org-cache'
import { TENANT_ID }              from '@/lib/constants'
import { resolveEngine }          from '@/lib/org-chart/engines/engine-registry'
import { getStaleEngines, saveSnapshot, markAllSnapshotsStale } from '@/lib/org-chart/snapshot-store'
import type { HierarchyEngine }   from '@/lib/org-chart/engines/engine-registry'

// Global engines the cron is responsible for precomputing
const GLOBAL_ENGINES: HierarchyEngine[] = ['position', 'reporting', 'department']

// Shared params for global precompute (no personal scoping)
function globalParams(engine: HierarchyEngine) {
  return {
    tenantId:      TENANT_ID,
    viewerRole:    'HR_ADMIN' as const,
    includeVacant: true,
    maxDepth:      8,
    // No legalEntityId — cross-entity view
    // No currentPersonId — not applicable for global engines
  }
}

/**
 * Recomputes a single engine snapshot and saves it.
 * Returns true on success, false on error.
 */
async function recomputeSnapshot(
  engine:   HierarchyEngine,
  scopeKey: string,
): Promise<boolean> {
  try {
    const result = await resolveEngine(engine, globalParams(engine))
    await saveSnapshot(engine, scopeKey, {
      nodes: result.nodes,
      edges: result.edges,
      meta:  result.meta,
    })
    return true
  } catch (err) {
    console.error(`[org-chart-snapshot] Failed to recompute ${engine}/${scopeKey}:`, err)
    return false
  }
}

/**
 * Main job: find stale snapshots + any global engines missing a snapshot,
 * then recompute them.
 */
export async function runOrgChartSnapshotJob(): Promise<{ refreshed: number; errors: number }> {
  let refreshed = 0
  let errors    = 0

  try {
    // 1. Determine which (engine, scope_key) pairs need recomputing:
    //    - existing stale rows
    //    - global engines that have never been computed (no row at all)
    const staleRows  = await getStaleEngines()
    const staleSet   = new Set(staleRows.map(r => `${r.engine}:${r.scopeKey}`))

    // Build the full work list
    const workItems: Array<{ engine: HierarchyEngine; scopeKey: string }> = []

    // Add stale rows
    for (const row of staleRows) {
      if (GLOBAL_ENGINES.includes(row.engine)) {
        workItems.push(row)
      }
    }

    // Bootstrap: add global engines that have NO row yet at all (first boot only).
    // A fresh snapshot (is_stale=false) won't appear in staleSet — query the table
    // to distinguish "fresh" (exists, not stale) from "missing" (no row at all).
    const existingEngines = new Set(
      (await db
        .select({ engine: orgHierarchySnapshots.engine })
        .from(orgHierarchySnapshots)
        .where(eq(orgHierarchySnapshots.tenantId, TENANT_ID))
      ).map(r => `${r.engine}:full`),
    )

    for (const engine of GLOBAL_ENGINES) {
      const key = `${engine}:full`
      // Only queue if stale (already in staleSet above) OR completely missing
      if (!staleSet.has(key) && !existingEngines.has(key)) {
        workItems.push({ engine, scopeKey: 'full' })
      }
    }

    // Deduplicate
    const seen  = new Set<string>()
    const deduped = workItems.filter(w => {
      const k = `${w.engine}:${w.scopeKey}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    // 2. Recompute sequentially to avoid overloading the DB
    for (const item of deduped) {
      const ok = await recomputeSnapshot(item.engine, item.scopeKey)
      if (ok) refreshed++
      else     errors++
    }
  } catch (err) {
    console.error('[org-chart-snapshot] Job error:', err)
    errors++
  }

  console.info(
    `[org-chart-snapshot] Done — refreshed: ${refreshed}, errors: ${errors}`,
  )

  return { refreshed, errors }
}

/**
 * Warm up: on process start, ensure all global engines have at least one
 * snapshot (even if stale) so the first SSR request isn't cold.
 * Called once from startProcessDriver().
 */
async function warmUpSnapshots(): Promise<void> {
  // Mark all as stale first so the initial run recomputes everything
  await markAllSnapshotsStale()
  await runOrgChartSnapshotJob()
}

// ── Cron schedule ─────────────────────────────────────────────────────────────

let snapshotCronStarted = false

export function startOrgChartSnapshotCron(): void {
  if (snapshotCronStarted) return
  snapshotCronStarted = true

  // Warm up on startup (runs once, async — non-blocking)
  void warmUpSnapshots()

  // Hourly recompute: 5 minutes past every hour (avoids top-of-hour load spike)
  const job = cron.schedule('5 * * * *', () => {
    void runOrgChartSnapshotJob()
  })
  job.start()

  console.info('[org-chart-snapshot] Hourly snapshot cron started (runs at :05 past every hour).')
}
