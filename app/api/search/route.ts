/**
 * app/api/search/route.ts
 *
 * GET /api/search?q=<term>
 *
 * Global people search used by AdminTopbar and EmployeeTopbar.
 * Returns top 10 active persons whose name, Arabic name, or person
 * number matches the query (case-insensitive ILIKE).
 *
 * Auth: session required — 401 if unauthenticated.
 * Min query: 2 characters — returns [] below threshold.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth }    from '@/lib/auth'
import { db }      from '@/lib/db'
import { persons, workerAssignments, jobs } from '@/drizzle/schema'
import { and, eq, or, ilike }              from 'drizzle-orm'
import { TENANT_ID }                       from '@/lib/constants'

export interface SearchResult {
  id:          string
  nameEn:      string
  nameAr:      string | null
  personNumber: string | null
  jobTitleEn:  string | null
  photoUrl:    string | null
}

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Query ─────────────────────────────────────────────────────────────────────
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return NextResponse.json([])
  }

  const pattern = `%${q}%`

  try {
    const rows = await db
      .select({
        id:           persons.id,
        nameEn:       persons.fullNameEn,
        nameAr:       persons.fullNameAr,
        personNumber: persons.personNumber,
        photoUrl:     persons.profilePhotoUrl,
        jobTitleEn:   jobs.jobTitleEn,
      })
      .from(persons)
      .leftJoin(
        workerAssignments,
        and(
          eq(workerAssignments.personId,  persons.id),
          eq(workerAssignments.tenantId,  TENANT_ID),
          eq(workerAssignments.isCurrent, true),
        ),
      )
      .leftJoin(jobs, eq(jobs.id, workerAssignments.jobId))
      .where(
        and(
          eq(persons.tenantId, TENANT_ID),
          eq(persons.isActive, true),
          or(
            ilike(persons.fullNameEn,   pattern),
            ilike(persons.fullNameAr,   pattern),
            ilike(persons.personNumber, pattern),
          ),
        ),
      )
      .limit(10)

    const results: SearchResult[] = rows.map(r => ({
      id:           r.id,
      nameEn:       r.nameEn ?? '',
      nameAr:       r.nameAr,
      personNumber: r.personNumber,
      jobTitleEn:   r.jobTitleEn ?? null,
      photoUrl:     r.photoUrl ?? null,
    }))

    return NextResponse.json(results)
  } catch (err) {
    console.error('[GET /api/search]', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
