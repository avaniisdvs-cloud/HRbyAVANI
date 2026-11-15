import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { bustCache, discoverSchemas } from '@/lib/dataops/schema-discovery'
import { resolveDataAccessRole, isTableVisible, isHrSchema } from '@/lib/dataops/access-policy'

export async function POST() {
  try {
    const user      = await getCurrentUser()
    const accessRole = resolveDataAccessRole(user.role)
    bustCache()
    const allSchemas = await discoverSchemas()

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
