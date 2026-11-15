import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { bootstrapDataops } from '@/lib/dataops/bootstrap'
import { rawSql } from '@/lib/dataops/db'
import { getTableMeta } from '@/lib/dataops/schema-discovery'

function safeIdent(val: string): string {
  return '"' + val.replace(/"/g, '""') + '"'
}

const SnapshotBody = z.object({ pkValue: z.string() })

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
    const { pkValue } = SnapshotBody.parse(await req.json())

    const meta = await getTableMeta(schema, table)
    if (!meta) return NextResponse.json({ error: 'Table not found' }, { status: 404 })

    const pkCol = meta.columns.find(c => c.is_pk)
    if (!pkCol) return NextResponse.json({ error: 'No primary key column found' }, { status: 400 })

    const qualifiedTable = `${safeIdent(schema)}.${safeIdent(table)}`
    const rows = await rawSql.unsafe(
      `SELECT * FROM ${qualifiedTable} WHERE ${safeIdent(pkCol.column_name)} = $1 LIMIT 1`,
      [pkValue],
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 })
    }

    const [inserted] = await rawSql<[{ id: string }]>`
      INSERT INTO dataops.snapshots (schema_name, table_name, pk_value, snapshot)
      VALUES (${schema}, ${table}, ${pkValue}, ${JSON.stringify(rows[0])}::jsonb)
      RETURNING id
    `

    return NextResponse.json({ snapshot_id: inserted.id, snapshot: rows[0] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
