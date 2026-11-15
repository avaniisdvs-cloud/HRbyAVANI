/**
 * Org Chart Snapshot Cron Endpoint — Session 6
 *
 * Called by Azure Scheduler (or manually) to trigger snapshot recompute.
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * POST — triggers full recompute of stale/missing global engine snapshots
 * GET  — health-check, returns current snapshot counts
 */

import { NextRequest, NextResponse } from 'next/server'
import { eq }                         from 'drizzle-orm'
import { db }                         from '@/lib/db'
import { orgHierarchySnapshots }      from '@/drizzle/schema/org-cache'
import { TENANT_ID }                  from '@/lib/constants'
import { runOrgChartSnapshotJob }     from '@/lib/jobs/org-chart-snapshot'
import { reportCronFailure }          from '@/lib/monitoring'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  const secret     = process.env.CRON_SECRET
  return !!secret && authHeader === `Bearer ${secret}`
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runOrgChartSnapshotJob()
    return NextResponse.json({
      ok:        true,
      refreshed: result.refreshed,
      errors:    result.errors,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    reportCronFailure('org-chart-snapshot', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await db
      .select({
        engine:     orgHierarchySnapshots.engine,
        scopeKey:   orgHierarchySnapshots.scopeKey,
        nodeCount:  orgHierarchySnapshots.nodeCount,
        isStale:    orgHierarchySnapshots.isStale,
        computedAt: orgHierarchySnapshots.computedAt,
      })
      .from(orgHierarchySnapshots)
      .where(eq(orgHierarchySnapshots.tenantId, TENANT_ID))

    return NextResponse.json({
      ok:        true,
      service:   'org-chart-snapshot-cron',
      snapshots: rows,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
