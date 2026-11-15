import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { bootstrapDataops } from '@/lib/dataops/bootstrap'
import { rawSql } from '@/lib/dataops/db'
import { getTableMeta } from '@/lib/dataops/schema-discovery'
import {
  resolveDataAccessRole,
  isTableVisible,
  isHrSchema,
  buildRowFilter,
} from '@/lib/dataops/access-policy'
import { getTeamPersonIds } from '@/lib/dataops/team-lookup'
import { evaluateStructuredWrite, mirrorDataopsAudit } from '@/lib/dataops/write-guard'

const BLOCKED_SCHEMAS = ['pg_catalog', 'pg_toast', 'pg_temp', 'information_schema']

function safeIdent(val: string): string {
  return '"' + val.replace(/"/g, '""') + '"'
}

// ── GET — list rows ───────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ schema: string; table: string }> },
) {
  try {
    const user = await getCurrentUser()
    // P3-D1 — SUPER_ADMIN-only DataOps console (defense-in-depth beyond middleware).
    if (user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await bootstrapDataops()

    const { schema, table } = await params
    if (BLOCKED_SCHEMAS.includes(schema)) {
      return NextResponse.json({ error: 'Schema not accessible' }, { status: 403 })
    }

    // Role-based table visibility check
    const accessRole = resolveDataAccessRole(user.role)
    if (isHrSchema(schema) && !isTableVisible(table, accessRole)) {
      return NextResponse.json({ error: 'Access denied for this table' }, { status: 403 })
    }

    const url     = new URL(req.url)
    const limit   = Math.min(Number(url.searchParams.get('limit')  ?? 200), 1000)
    const offset  = Number(url.searchParams.get('offset') ?? 0)
    const search  = url.searchParams.get('search') ?? ''
    const sortBy  = url.searchParams.get('sortBy') ?? ''
    const sortDir = (url.searchParams.get('sortDir') ?? 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC'

    const tableMeta = await getTableMeta(schema, table)
    if (!tableMeta) return NextResponse.json({ error: 'Table not found' }, { status: 404 })

    // Resolve team IDs for manager row filter
    const personId = user.personId ?? ''
    let teamIds: string[] = []
    if (accessRole === 'MANAGER' && personId) {
      teamIds = await getTeamPersonIds(personId)
    }

    // Build role-based row filter
    const rowFilter = isHrSchema(schema)
      ? buildRowFilter(table, accessRole, personId, teamIds)
      : null

    const qualifiedTable = `${safeIdent(schema)}.${safeIdent(table)}`

    // Build text-search conditions across text columns
    const textCols = tableMeta.columns
      .filter(c => ['text', 'varchar', 'char', 'bpchar', 'name'].includes(c.udt_name))
      .slice(0, 6)

    // Compose WHERE clause — combine row filter + optional text search
    // We must be careful with parameter numbering when combining both.
    const filterParams: string[] = rowFilter?.values ?? []
    const filterOffset = filterParams.length  // text search param starts after row filter params

    let whereClause = ''
    const allParams: unknown[] = [...filterParams]

    const hasRowFilter = rowFilter && rowFilter.clause
    const hasSearch    = search && textCols.length > 0

    if (hasRowFilter && hasSearch) {
      const searchIdx = filterOffset + 1
      const searchConditions = textCols.map(c => `${safeIdent(c.column_name)}::text ILIKE '%' || $${searchIdx} || '%'`).join(' OR ')
      whereClause = `WHERE (${rowFilter.clause}) AND (${searchConditions})`
      allParams.push(search)
    } else if (hasRowFilter) {
      whereClause = `WHERE ${rowFilter.clause}`
    } else if (hasSearch) {
      const searchConditions = textCols.map(c => `${safeIdent(c.column_name)}::text ILIKE '%' || $1 || '%'`).join(' OR ')
      whereClause = `WHERE (${searchConditions})`
      allParams.push(search)
    }

    const orderClause = sortBy && tableMeta.columns.some(c => c.column_name === sortBy)
      ? `ORDER BY ${safeIdent(sortBy)} ${sortDir}`
      : 'ORDER BY 1'

    const countSql = `SELECT COUNT(*) AS total FROM ${qualifiedTable} ${whereClause}`
    const rowsSql  = `SELECT * FROM ${qualifiedTable} ${whereClause} ${orderClause} LIMIT ${limit} OFFSET ${offset}`

    const [countResult, rowsResult] = await Promise.all([
      rawSql.unsafe(countSql, allParams as any[]), // nosemgrep: no-explicit-any
      rawSql.unsafe(rowsSql, allParams as any[]),  // nosemgrep: no-explicit-any
    ])

    // Audit the read
    await rawSql`
      INSERT INTO dataops.audit_log
        (actor_id, actor_role, operation, schema_name, table_name, row_count)
      VALUES
        (${user.id}, ${user.role}, 'SELECT', ${schema}, ${table}, ${rowsResult.length})
    `

    return NextResponse.json({
      rows:       rowsResult,
      total:      Number((countResult[0] as { total?: unknown })?.total ?? 0),
      columns:    tableMeta.columns,
      limit,
      offset,
      accessRole,
      // Tell the client how many team members were in scope (for UI display)
      teamSize:   teamIds.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── POST — insert row ─────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ schema: string; table: string }> },
) {
  try {
    const user = await getCurrentUser()
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'SUPER_ADMIN role required' }, { status: 403 })
    }
    await bootstrapDataops()

    const { schema, table } = await params
    if (BLOCKED_SCHEMAS.includes(schema)) {
      return NextResponse.json({ error: 'Schema not accessible' }, { status: 403 })
    }

    const body = z.record(z.unknown()).parse(await req.json())

    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== '' && v !== '__auto__') cleaned[k] = v
    }

    if (Object.keys(cleaned).length === 0) {
      return NextResponse.json({ error: 'No column values provided' }, { status: 400 })
    }

    // EPRC-01 B1 (P3-D3): block plaintext PII-column inserts via DataOps.
    const actorName = user.name ?? user.email ?? user.id
    const verdict = evaluateStructuredWrite(table, Object.keys(cleaned), 'INSERT')
    if (!verdict.allowed) {
      await mirrorDataopsAudit({
        actorId: user.id, actorName, actorRole: user.role,
        op: 'INSERT', schema, table, blockedCode: verdict.code,
        newValues: cleaned,
      })
      return NextResponse.json({ error: verdict.reason }, { status: 403 })
    }

    const cols         = Object.keys(cleaned).map(safeIdent).join(', ')
    const vals         = Object.values(cleaned)
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ')

    const qualifiedTable = `${safeIdent(schema)}.${safeIdent(table)}`
    const insertSql      = `INSERT INTO ${qualifiedTable} (${cols}) VALUES (${placeholders}) RETURNING *`

    const inserted = await rawSql.unsafe(insertSql, vals as any[]) // nosemgrep: no-explicit-any

    await rawSql`
      INSERT INTO dataops.audit_log
        (actor_id, actor_role, operation, schema_name, table_name, row_snapshot)
      VALUES
        (${user.id}, ${user.role}, 'INSERT', ${schema}, ${table}, ${JSON.stringify(inserted[0])}::jsonb)
    `

    // EPRC-01 B1: mirror accepted insert into the MAIN audit trail.
    await mirrorDataopsAudit({
      actorId: user.id, actorName, actorRole: user.role,
      op: 'INSERT', schema, table, newValues: inserted[0] as Record<string, unknown>,
    })

    return NextResponse.json({ row: inserted[0] }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
