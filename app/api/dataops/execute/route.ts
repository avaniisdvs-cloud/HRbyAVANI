import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { bootstrapDataops } from '@/lib/dataops/bootstrap'
import { rawSql } from '@/lib/dataops/db'
import { validateSql } from '@/lib/dataops/sql-validator'
import { evaluateRawSqlWrite, mirrorDataopsAudit } from '@/lib/dataops/write-guard'
import { rateLimit, rateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

const Body = z.object({ sql: z.string().min(1).max(8000) })

export async function POST(req: NextRequest) {
  try {
    const user    = await getCurrentUser()
    // P3-D1 — defense-in-depth: gate the DataOps console to SUPER_ADMIN in the
    // handler, not only at middleware (a route handler is directly invocable).
    if (user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // EPRC-01 B2 (RATE-01): throttle SQL execution per operator.
    const rl = rateLimit(rateLimitKey('dataops', user.id), RATE_LIMITS.DATAOPS)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded — slow down.' }, {
        status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) },
      })
    }

    const canWrite = user.role === 'SUPER_ADMIN'
    await bootstrapDataops()

    const { sql } = Body.parse(await req.json())

    const validation = validateSql(sql, canWrite)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const actorName = user.name ?? user.email ?? user.id

    // EPRC-01 B1 (P3-D3): block raw writes that touch protected/effective-dated
    // tables or encrypted/keyed-hash PII columns. Record the blocked attempt in
    // the MAIN audit trail before refusing.
    if (validation.isWrite) {
      const verdict = evaluateRawSqlWrite(sql)
      if (!verdict.allowed) {
        await mirrorDataopsAudit({
          actorId: user.id, actorName, actorRole: user.role,
          op: 'WRITE_SQL', schema: 'custom', table: 'custom',
          blockedCode: verdict.code, sqlText: sql,
        })
        return NextResponse.json({ error: verdict.reason }, { status: 403 })
      }
    }

    const start   = Date.now()
    const result  = await rawSql.unsafe(sql)
    const elapsed = Date.now() - start

    // DML statements (DELETE/UPDATE/INSERT) return affected row count via .count
    // SELECT statements return an array of rows
    const affectedCount = (result as unknown as { count?: number }).count
    const isDml         = validation.isWrite && affectedCount !== undefined
    const rows          = isDml ? [] : (result as Record<string, unknown>[])
    const rowCount      = isDml ? Number(affectedCount) : rows.length

    await rawSql`
      INSERT INTO dataops.audit_log
        (actor_id, actor_role, operation, schema_name, table_name, sql_text, row_count)
      VALUES
        (${user.id}, ${user.role},
         ${validation.isWrite ? 'WRITE_SQL' : 'SELECT'},
         'custom', 'custom',
         ${sql.slice(0, 2000)},
         ${rowCount})
    `

    // EPRC-01 B1: mirror accepted writes into the MAIN audit trail.
    if (validation.isWrite) {
      await mirrorDataopsAudit({
        actorId: user.id, actorName, actorRole: user.role,
        op: 'WRITE_SQL', schema: 'custom', table: 'custom',
        sqlText: sql, newValues: { rowCount },
      })
    }

    return NextResponse.json({ rows, rowCount, elapsed, isDml })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
