import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getLettersByType } from '@/modules/employee-letters/queries'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { persons } from '@/drizzle/schema'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // RBAC-BL-04: HR-only — returns letters joined with employee names/numbers
  // across all employees (matches download/jobs guards).
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const typeCode = searchParams.get('typeCode') ?? ''
  const entityId = searchParams.get('entityId') ?? undefined

  const letters = await getLettersByType(typeCode, entityId)

  // Join employee names
  const enriched = await Promise.all(letters.map(async l => {
    const [p] = await db.select({ fullNameEn: persons.fullNameEn, personNumber: persons.personNumber })
      .from(persons).where(eq(persons.id, l.personId)).limit(1)
    return {
      ...l,
      employeeName:   p?.fullNameEn ?? null,
      employeeNumber: p?.personNumber ?? null,
    }
  }))

  return NextResponse.json({ letters: enriched })
}
