import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { bootstrapDataops } from '@/lib/dataops/bootstrap'
import { discoverSchemas } from '@/lib/dataops/schema-discovery'
import { resolveDataAccessRole, isTableVisible, isHrSchema } from '@/lib/dataops/access-policy'

export async function GET() {
  try {
    const user      = await getCurrentUser()
    // P3-D1 — SUPER_ADMIN-only DataOps console.
    if (user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const accessRole = resolveDataAccessRole(user.role)
    await bootstrapDataops()

    const allSchemas = await discoverSchemas()

    // Filter tables based on role — only applies to the public HR schema
    const filtered = allSchemas.map(s => ({
      ...s,
      tables: s.tables.filter(t =>
        !isHrSchema(s.schema) || isTableVisible(t.name, accessRole)
      ),
    })).filter(s => s.tables.length > 0)

    return NextResponse.json({ schemas: filtered, accessRole })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
