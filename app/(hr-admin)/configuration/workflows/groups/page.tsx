import { redirect } from 'next/navigation'
import { eq, and, asc } from 'drizzle-orm'
import { auth, roleHome } from '@/lib/auth'
import { db } from '@/lib/db'
import { persons, jobs, workerAssignments } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { listApprovalGroups } from '@/modules/workflow/actions'
import { resolveLocale } from '@/lib/language-preference'
import { GroupListClient } from './GroupListClient'
import type { PersonOption } from '@/components/forms/PersonSelect'

export const metadata = { title: 'Approval Groups · AVANIIS HR' }

/**
 * Approval Groups list page — /configuration/workflows/groups.
 * Auth: HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN only.
 * Fetches all approval groups with member counts, passes to client.
 */
export default async function ApprovalGroupsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const locale = await resolveLocale(session.user.personId)

  // Active-employee LOV for the member picker.
  // persons.isActive is NOT cleared on termination → also gate assignmentStatus='ACTIVE'
  // and require a current worker_assignment (isCurrent) to exclude terminated staff.
  const [groups, rawPersons] = await Promise.all([
    listApprovalGroups(),
    db
      .select({
        id:           persons.id,
        fullNameEn:   persons.fullNameEn,
        personNumber: persons.personNumber,
        legalEntityId: persons.legalEntityId,
        jobTitleEn:   jobs.jobTitleEn,
      })
      .from(persons)
      .innerJoin(workerAssignments, and(
        eq(workerAssignments.personId,  persons.id),
        eq(workerAssignments.tenantId,  TENANT_ID),
        eq(workerAssignments.isCurrent, true),
      ))
      .leftJoin(jobs, eq(jobs.id, workerAssignments.jobId))
      .where(and(
        eq(persons.tenantId, TENANT_ID),
        eq(persons.isActive, true),
        eq(persons.assignmentStatus, 'ACTIVE'),
      ))
      .orderBy(asc(persons.fullNameEn)),
  ])

  const personOptions: PersonOption[] = rawPersons.map(p => ({
    id:            p.id,
    label:         `${p.fullNameEn ?? '—'} — ${p.personNumber}`,
    sublabel:      p.jobTitleEn ?? undefined,
    legalEntityId: p.legalEntityId,
  }))

  return (
    <div className="page-in">
      <GroupListClient initialData={groups} personOptions={personOptions} locale={locale} />
    </div>
  )
}
