import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { bootstrapDataops } from '@/lib/dataops/bootstrap'
import { rawSql } from '@/lib/dataops/db'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    // P3-D1 — SUPER_ADMIN-only DataOps console.
    if (user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await bootstrapDataops()

    const url   = new URL(req.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

    const rows = await rawSql`
      SELECT id, ts, actor_id, actor_role, operation,
             schema_name, table_name, pk_value, sql_text, row_count
      FROM dataops.audit_log
      ORDER BY ts DESC
      LIMIT ${limit}
    `

    return NextResponse.json({ entries: rows })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
