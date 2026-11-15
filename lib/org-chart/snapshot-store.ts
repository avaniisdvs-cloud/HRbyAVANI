/**
 * Org Chart Snapshot Store — Session 6
 *
 * Read-through helpers that isolate all DB access for the snapshot cache.
 * The page.tsx SSR path calls getSnapshot(); the cron job calls saveSnapshot().
 * Every structural org write (hire, transfer, acting, freeze) calls markStale().
 */

import { and, eq } from 'drizzle-orm'
import { db }                     from '@/lib/db'
import { orgHierarchySnapshots }  from '@/drizzle/schema/org-cache'
import { TENANT_ID }              from '@/lib/constants'
import type { OrgFlowNode, OrgFlowEdge, OrgTreeMeta } from './types'
import type { HierarchyEngine } from './engines/engine-types'

export type { HierarchyEngine }

// `meta` is stored as opaque JSON; exact shape depends on engine.
// Callers cast to OrgTreeMeta / HierarchyMeta as appropriate.
export interface SnapshotPayload {
  nodes:     OrgFlowNode[]
  edges:     OrgFlowEdge[]
  meta:      unknown
}

// ── getSnapshot ───────────────────────────────────────────────────────────────

/**
 * Returns the cached snapshot for the given engine+scope, or null if:
 * - No snapshot exists yet
 * - The snapshot is marked stale (background job hasn't refreshed it yet)
 */
export async function getSnapshot(
  engine:   HierarchyEngine,
  scopeKey: string = 'full',
): Promise<SnapshotPayload | null> {
  try {
    const rows = await db
      .select()
      .from(orgHierarchySnapshots)
      .where(
        and(
          eq(orgHierarchySnapshots.tenantId,  TENANT_ID),
          eq(orgHierarchySnapshots.engine,    engine),
          eq(orgHierarchySnapshots.scopeKey,  scopeKey),
          eq(orgHierarchySnapshots.isStale,   false),
        ),
      )
      .limit(1)

    if (rows.length === 0) return null

    const row = rows[0]
    return {
      nodes: (row.nodes as OrgFlowNode[]) ?? [],
      edges: (row.edges as OrgFlowEdge[]) ?? [],
      meta:  row.meta ?? {},
    }
  } catch (err) {
    console.error('[snapshot-store] getSnapshot error:', err)
    return null
  }
}

// ── saveSnapshot ──────────────────────────────────────────────────────────────

/**
 * Upserts a freshly-computed snapshot, clearing the stale flag.
 * Called by the cron job after each recompute.
 */
export async function saveSnapshot(
  engine:   HierarchyEngine,
  scopeKey: string = 'full',
  payload:  SnapshotPayload,
): Promise<void> {
  const now = new Date()
  await db
    .insert(orgHierarchySnapshots)
    .values({
      tenantId:   TENANT_ID,
      engine,
      scopeKey,
      nodes:      payload.nodes as unknown as Record<string, unknown>[],
      edges:      payload.edges as unknown as Record<string, unknown>[],
      meta:       payload.meta  as unknown as Record<string, unknown>,
      nodeCount:  payload.nodes.length,
      isStale:    false,
      computedAt: now,
    })
    .onConflictDoUpdate({
      target:  [
        orgHierarchySnapshots.tenantId,
        orgHierarchySnapshots.engine,
        orgHierarchySnapshots.scopeKey,
      ],
      set: {
        nodes:               payload.nodes as unknown as Record<string, unknown>[],
        edges:               payload.edges as unknown as Record<string, unknown>[],
        meta:                payload.meta  as unknown as Record<string, unknown>,
        nodeCount:           payload.nodes.length,
        isStale:             false,
        computedAt:          now,
        recomputeStartedAt:  null,
      },
    })
}

// ── markStale ─────────────────────────────────────────────────────────────────

/**
 * Marks ALL snapshots for this tenant as stale.
 * Call this inside a transaction after any structural org write.
 *
 * Intentionally coarse: a single hire/transfer invalidates all engines
 * because headcounts, reporting lines, and dept hierarchy all change.
 */
export async function markAllSnapshotsStale(): Promise<void> {
  try {
    await db
      .update(orgHierarchySnapshots)
      .set({ isStale: true })
      .where(eq(orgHierarchySnapshots.tenantId, TENANT_ID))
  } catch (err) {
    // Non-fatal — the next cron cycle will recompute anyway
    console.error('[snapshot-store] markAllSnapshotsStale error:', err)
  }
}

// ── getStaleSnapshots ─────────────────────────────────────────────────────────

/**
 * Returns the list of stale (engine, scopeKey) pairs that need recomputing.
 * Called by the cron job to decide what to refresh.
 */
export async function getStaleEngines(): Promise<Array<{ engine: HierarchyEngine; scopeKey: string }>> {
  try {
    const rows = await db
      .select({
        engine:   orgHierarchySnapshots.engine,
        scopeKey: orgHierarchySnapshots.scopeKey,
      })
      .from(orgHierarchySnapshots)
      .where(
        and(
          eq(orgHierarchySnapshots.tenantId, TENANT_ID),
          eq(orgHierarchySnapshots.isStale,  true),
        ),
      )
    return rows.map(r => ({
      engine:   r.engine   as HierarchyEngine,
      scopeKey: r.scopeKey,
    }))
  } catch (err) {
    console.error('[snapshot-store] getStaleEngines error:', err)
    return []
  }
}
