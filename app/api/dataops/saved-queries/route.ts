import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { bootstrapDataops } from '@/lib/dataops/bootstrap'
import { rawSql } from '@/lib/dataops/db'

const SaveBody = z.object({
  name:        z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  sql_text:    z.string().min(1).max(8000),
  tags:        z.array(z.string()).max(10).optional(),
})

export async function GET() {
  try {
    const user = await getCurrentUser()
    // P3-D1 — SUPER_ADMIN-only DataOps console.
    if (user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await bootstrapDataops()

    const rows = await rawSql`
      SELECT id, created_at, updated_at, name, description, sql_text, tags
      FROM dataops.saved_queries
      ORDER BY updated_at DESC
      LIMIT 100
    `

    return NextResponse.json({ queries: rows })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    // P3-D1 — SUPER_ADMIN-only DataOps console.
    if (user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await bootstrapDataops()

    const body = SaveBody.parse(await req.json())

    const [row] = await rawSql`
      INSERT INTO dataops.saved_queries (name, description, sql_text, tags)
      VALUES (
        ${body.name},
        ${body.description ?? null},
        ${body.sql_text},
        ${body.tags ?? []}
      )
      RETURNING *
    `

    return NextResponse.json({ query: row }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
