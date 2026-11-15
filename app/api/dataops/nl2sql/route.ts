import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { bootstrapDataops } from '@/lib/dataops/bootstrap'
import { discoverSchemas } from '@/lib/dataops/schema-discovery'
import { generateSql } from '@/lib/dataops/claude'

const Body = z.object({ prompt: z.string().min(1).max(500) })

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    // P3-D1 — SUPER_ADMIN-only: nl2sql ships the full DB schema into the prompt
    // and returns generated SQL; never expose it to a lower role.
    if (user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await bootstrapDataops()

    const { prompt } = Body.parse(await req.json())
    const schemas    = await discoverSchemas()
    const result     = await generateSql(prompt, schemas)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
