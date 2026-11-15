import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getEligibleEmployees } from '@/modules/employee-letters/queries'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // RBAC-BL-04: HR-only — returns cross-employee data (matches download/jobs guards).
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const typeCode     = searchParams.get('typeCode') ?? ''
  const entityId     = searchParams.get('entityId') ?? undefined
  const search       = searchParams.get('search') ?? undefined
  const departmentId = searchParams.get('departmentId') ?? undefined

  const employees = await getEligibleEmployees({ typeCode, entityId, search, departmentId })
  return NextResponse.json({ employees })
}
