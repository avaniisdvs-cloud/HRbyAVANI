import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { jobs } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select({
      id:         jobs.id,
      jobCode:    jobs.jobCode,
      jobTitleEn: jobs.jobTitleEn,
      jobTitleAr: jobs.jobTitleAr,
    })
    .from(jobs)
    .where(eq(jobs.isActive, true))
    .orderBy(jobs.jobTitleEn)

  return NextResponse.json({ jobs: rows })
}
