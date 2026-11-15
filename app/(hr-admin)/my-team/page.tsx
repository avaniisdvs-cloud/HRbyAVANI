import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { eq, and, asc } from 'drizzle-orm'
import { Users } from 'lucide-react'
import { auth, roleHome } from '@/lib/auth'
import { getLocale, t } from '@/lib/locale-server'
import { db } from '@/lib/db'
import {
  persons as personsTable, departments, jobs, positions, grades,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'

export const metadata = { title: 'My Team · AVANIIS HR' }

const STATUS_PILL: Record<string, string> = {
  ACTIVE:       'bg-accent-050 text-accent-700',
  ON_LEAVE:     'bg-yellow-50 text-yellow-800',
  SUSPENDED:    'bg-red-50 text-red-800',
  PENDING_HIRE: 'bg-blue-50 text-blue-900',
  TERMINATED:   'bg-surface text-ink-3',
}

export default async function MyTeamPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await getLocale()

  const allowedRoles = ['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowedRoles.includes(session.user.role)) redirect(roleHome(session.user.role))

  const managerPersonId = session.user.personId

  // Managers with no linked person record see a helpful prompt.
  if (!managerPersonId) {
    return (
      <div className="page-in flex flex-col items-center justify-center py-24 text-center">
        <Users className="mb-4 h-10 w-10 text-ink-3" strokeWidth={1.5} />
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 600, color: 'var(--ink-1)' }}>
          {t(locale, 'No employee profile linked', 'لا يوجد ملف موظف مرتبط')}
        </h1>
        <p className="mt-2 max-w-sm text-sm text-ink-3">
          {t(locale,
            'Ask your HR Admin to link your user account to an employee record so your direct reports appear here.',
            'اطلب من مسؤول الموارد البشرية ربط حسابك بسجل موظف حتى يظهر مرؤوسوك المباشرون هنا.')}
        </p>
      </div>
    )
  }

  // Load all active direct reports for this manager.
  const teamRows = await db
    .select({
      id:              personsTable.id,
      personNumber:    personsTable.personNumber,
      fullNameEn:      personsTable.fullNameEn,
      fullNameAr:      personsTable.fullNameAr,
      profilePhotoUrl: personsTable.profilePhotoUrl,
      assignmentStatus: personsTable.assignmentStatus,
      employmentType:  personsTable.employmentType,
      hireDate:        personsTable.hireDate,
      currentDepartmentId: personsTable.currentDepartmentId,
      currentPositionId:   personsTable.currentPositionId,
      currentGradeId:      personsTable.currentGradeId,
      currentJobId:        personsTable.currentJobId,
    })
    .from(personsTable)
    .where(and(
      eq(personsTable.tenantId, TENANT_ID),
      eq(personsTable.lineManagerId, managerPersonId),
      eq(personsTable.isActive, true),
    ))
    .orderBy(asc(personsTable.fullNameEn))

  // Batch-load department + position labels.
  const deptIds      = [...new Set(teamRows.map(r => r.currentDepartmentId).filter(Boolean))] as string[]
  const positionIds  = [...new Set(teamRows.map(r => r.currentPositionId).filter(Boolean))]   as string[]
  const gradeIds     = [...new Set(teamRows.map(r => r.currentGradeId).filter(Boolean))]      as string[]

  const [deptMap, posMap, gradeMap] = await Promise.all([
    deptIds.length
      ? db.select({ id: departments.id, nameEn: departments.nameEn })
          .from(departments)
          .where(and(eq(departments.tenantId, TENANT_ID)))
          .then(rows => Object.fromEntries(rows.filter(r => deptIds.includes(r.id)).map(r => [r.id, r.nameEn])))
      : Promise.resolve({} as Record<string, string | null>),
    positionIds.length
      ? db.select({ id: positions.id, titleEn: positions.positionTitleEn })
          .from(positions)
          .where(and(eq(positions.tenantId, TENANT_ID)))
          .then(rows => Object.fromEntries(rows.filter(r => positionIds.includes(r.id)).map(r => [r.id, r.titleEn])))
      : Promise.resolve({} as Record<string, string | null>),
    gradeIds.length
      ? db.select({ id: grades.id, code: grades.gradeCode, nameEn: grades.gradeNameEn })
          .from(grades)
          .where(and(eq(grades.tenantId, TENANT_ID)))
          .then(rows => Object.fromEntries(rows.filter(r => gradeIds.includes(r.id)).map(r => [r.id, `${r.code} · ${r.nameEn}`])))
      : Promise.resolve({} as Record<string, string | null>),
  ])

  function initials(name: string | null) {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    return parts.length === 1
      ? (parts[0][0] ?? '?').toUpperCase()
      : ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
  }

  return (
    <div className="page-in">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
            {t(locale, 'My Team', 'فريقي')}
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            {teamRows.length === 0
              ? t(locale, 'No direct reports', 'لا يوجد مرؤوسون مباشرون')
              : t(locale, `${teamRows.length} direct report${teamRows.length !== 1 ? 's' : ''}`, `${teamRows.length} مرؤوس مباشر`)}
          </p>
        </div>
      </div>

      {teamRows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-xl py-20 text-center"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <Users className="mb-3 h-8 w-8 text-ink-3" strokeWidth={1.5} />
          <p className="text-sm text-ink-3">{t(locale, 'You have no active direct reports assigned to you yet.', 'لا يوجد لديك مرؤوسون مباشرون نشطون معيّنون بعد.')}</p>
          <p className="mt-1 text-xs text-ink-3">
            {t(locale,
              'Ask HR Admin to set your name as Line Manager on employee assignments.',
              'اطلب من مسؤول الموارد البشرية تعيين اسمك كمدير مباشر في تكليفات الموظفين.')}
          </p>
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <TableScrollRegion><table className="w-full text-sm">
            <thead style={{ borderBottom: '1px solid var(--border)' }}>
              <tr className="text-start text-xs uppercase text-ink-3">
                <th className="px-4 py-3 font-medium">{t(locale, 'Employee', 'الموظف')}</th>
                <th className="px-4 py-3 font-medium">{t(locale, 'Department', 'القسم')}</th>
                <th className="px-4 py-3 font-medium">{t(locale, 'Position', 'المنصب')}</th>
                <th className="px-4 py-3 font-medium">{t(locale, 'Grade', 'الدرجة')}</th>
                <th className="px-4 py-3 font-medium">{t(locale, 'Status', 'الحالة')}</th>
                <th className="px-4 py-3 font-medium">{t(locale, 'Hire date', 'تاريخ التعيين')}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {teamRows.map(member => (
                <tr key={member.id} className="hover:bg-surface transition-colors">
                  {/* Avatar + name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {member.profilePhotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={member.profilePhotoUrl}
                          alt={member.fullNameEn ?? ''}
                          className="h-8 w-8 rounded-full object-cover ring-1 ring-accent-100"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-accent-700">
                          {initials(member.fullNameEn)}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-ink-1">{member.fullNameEn ?? '—'}</div>
                        <div className="font-mono text-xs text-ink-3">{member.personNumber}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {member.currentDepartmentId ? (deptMap[member.currentDepartmentId] ?? '—') : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {member.currentPositionId ? (posMap[member.currentPositionId] ?? '—') : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {member.currentGradeId ? (gradeMap[member.currentGradeId] ?? '—') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[member.assignmentStatus] ?? 'bg-surface text-ink-3 ring-1 ring-border'}`}>
                      {member.assignmentStatus.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-3">{member.hireDate ?? '—'}</td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/persons/${member.id}?from=my-team`}
                      className="text-xs font-medium text-accent hover:text-accent-700"
                    >
                      {t(locale, 'View profile →', 'عرض الملف ←')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></TableScrollRegion>
        </div>
      )}
    </div>
  )
}
