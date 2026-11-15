import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { processBiometricSync } from '@/modules/timesheets/actions'

const punchSchema = z.object({
  deviceId:       z.string().min(1),
  employeeIdRaw:  z.string().min(1),
  employeeEmail:  z.string().email().optional(),
  punchTimestamp: z.string().datetime(),
  punchType:      z.enum(['IN', 'OUT', 'UNKNOWN']),
})

const syncSchema = z.object({
  deviceId:   z.string().min(1),
  deviceName: z.string().min(1),
  punches:    z.array(punchSchema).min(1).max(5000),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validate API key
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.BIOMETRIC_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = syncSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
  }

  try {
    const result = await processBiometricSync(parsed.data)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[attendance/sync] processBiometricSync failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
