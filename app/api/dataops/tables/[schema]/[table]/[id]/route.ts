import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { bootstrapDataops } from '@/lib/dataops/bootstrap'
import { rawSql } from '@/lib/dataops/db'
import { getTableMeta } from '@/lib/dataops/schema-discovery'
import { evaluateStructuredWrite, mirrorDataopsAudit } from '@/lib/dataops/write-guard'

function safeIdent(val: string): string {
  return '"' + val.replace(/"/g, '""') + '"'
}

// ── PATCH — update row ────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ schema: string; table: string; id: string }> },
) {
  try {
    const user = await getCurrentUser()
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'SUPER_ADMIN role required' }, { status: 403 })
    }
    await bootstrapDataops()

    const { schema, table, id } = await params

    const meta = await getTableMeta(schema, table)
    if (!meta) return NextResponse.json({ error: 'Table not found' }, { status: 404 })

    const pkCol = meta.columns.find(c => c.is_pk)
    if (!pkCol) return NextResponse.json({ error: 'No primary key' }, { status: 400 })

    const body = z.record(z.unknown()).parse(await req.json())

    // Remove PK from update values
    const updateData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (k !== pkCol.column_name) updateData[k] = v
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No updatable columns provided' }, { status: 400 })
    }

    // EPRC-01 B1 (P3-D3): block plaintext PII-column writes and effective-dated
    // timeline-column edits via DataOps; record the blocked attempt in main audit.
    const actorName = user.name ?? user.email ?? user.id
    const verdict = evaluateStructuredWrite(table, Object.keys(updateData), 'UPDATE')
    if (!verdict.allowed) {
      await mirrorDataopsAudit({
        actorId: user.id, actorName, actorRole: user.role,
        op: 'UPDATE', schema, table, pk: id, blockedCode: verdict.code,
        newValues: updateData,
      })
      return NextResponse.json({ error: verdict.reason }, { status: 403 })
    }

    const setClauses = Object.keys(updateData)
      .map((k, i) => `${safeIdent(k)} = $${i + 1}`)
      .join(', ')
    const vals = [...Object.values(updateData), id]
    const pkPlaceholder = `$${vals.length}`

    const qualifiedTable = `${safeIdent(schema)}.${safeIdent(table)}`
    const updateSql = `UPDATE ${qualifiedTable} SET ${setClauses} WHERE ${safeIdent(pkCol.column_name)} = ${pkPlaceholder} RETURNING *`

    const updated = await rawSql.unsafe(updateSql, vals as any[]) // nosemgrep: no-explicit-any

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 })
    }

    await rawSql`
      INSERT INTO dataops.audit_log
        (actor_id, actor_role, operation, schema_name, table_name, pk_value, row_snapshot)
      VALUES
        (${user.id}, ${user.role}, 'UPDATE', ${schema}, ${table}, ${id}, ${JSON.stringify(updated[0])}::jsonb)
    `

    // EPRC-01 B1: mirror accepted update into the MAIN audit trail.
    await mirrorDataopsAudit({
      actorId: user.id, actorName, actorRole: user.role,
      op: 'UPDATE', schema, table, pk: id, newValues: updated[0] as Record<string, unknown>,
    })

    return NextResponse.json({ row: updated[0] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

// ── DELETE — delete row with snapshot gate ────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ schema: string; table: string; id: string }> },
) {
  try {
    const user = await getCurrentUser()
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'SUPER_ADMIN role required' }, { status: 403 })
    }
    await bootstrapDataops()

    const { schema, table, id } = await params
    const actorName = user.name ?? user.email ?? user.id

    // EPRC-01 B1 (P3-D3): hard delete of protected/effective-dated HR rows is not
    // permitted through DataOps — record the blocked attempt and refuse.
    const delVerdict = evaluateStructuredWrite(table, [], 'DELETE')
    if (!delVerdict.allowed) {
      await mirrorDataopsAudit({
        actorId: user.id, actorName, actorRole: user.role,
        op: 'DELETE', schema, table, pk: id, blockedCode: delVerdict.code,
      })
      return NextResponse.json({ error: delVerdict.reason }, { status: 403 })
    }

    const url        = new URL(req.url)
    const snapshotId = url.searchParams.get('snapshot_id')

    if (!snapshotId) {
      return NextResponse.json({ error: 'snapshot_id required — take a snapshot first' }, { status: 400 })
    }

    // Validate snapshot matches this schema/table/pk
    const snaps = await rawSql<{ id: string; schema_name: string; table_name: string; pk_value: string }[]>`
      SELECT id, schema_name, table_name, pk_value FROM dataops.snapshots WHERE id = ${snapshotId} LIMIT 1
    `
    if (snaps.length === 0) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
    }
    const snap = snaps[0]
    if (snap.schema_name !== schema || snap.table_name !== table || snap.pk_value !== id) {
      return NextResponse.json({ error: 'Snapshot does not match this row' }, { status: 400 })
    }

    const meta = await getTableMeta(schema, table)
    if (!meta) return NextResponse.json({ error: 'Table not found' }, { status: 404 })

    const pkCol = meta.columns.find(c => c.is_pk)
    if (!pkCol) return NextResponse.json({ error: 'No primary key' }, { status: 400 })

    const qualifiedTable  = `${safeIdent(schema)}.${safeIdent(table)}`
    const archiveTable    = `${safeIdent(schema)}.${safeIdent(table + '_archive')}`

    // Check if archive table exists
    const archiveExists = await rawSql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = ${schema} AND table_name = ${table + '_archive'}
      ) AS exists
    `

    // Soft-delete: insert into archive table if it exists, then delete original
    if (archiveExists[0]?.exists) {
      await rawSql.unsafe(
        `INSERT INTO ${archiveTable} SELECT * FROM ${qualifiedTable} WHERE ${safeIdent(pkCol.column_name)} = $1`,
        [id],
      )
    }

    await rawSql.unsafe(
      `DELETE FROM ${qualifiedTable} WHERE ${safeIdent(pkCol.column_name)} = $1`,
      [id],
    )

    await rawSql`
      INSERT INTO dataops.audit_log
        (actor_id, actor_role, operation, schema_name, table_name, pk_value)
      VALUES
        (${user.id}, ${user.role}, 'DELETE', ${schema}, ${table}, ${id})
    `

    // EPRC-01 B1: mirror accepted delete into the MAIN audit trail.
    await mirrorDataopsAudit({
      actorId: user.id, actorName, actorRole: user.role,
      op: 'DELETE', schema, table, pk: id,
    })

    return NextResponse.json({ deleted: true, archived: archiveExists[0]?.exists ?? false })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
