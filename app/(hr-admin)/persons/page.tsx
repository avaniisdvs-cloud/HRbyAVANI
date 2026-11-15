import { redirect } from 'next/navigation'
import Link from 'next/link'
import { eq, and, asc } from 'drizzle-orm'
import { Plus } from 'lucide-react'
import { auth, roleHome } from '@/lib/auth'
import { db } from '@/lib/db'
import { legalEntities, departments } from '@/drizzle/schema'
import { listPersons } from '@/modules/core-hr'
import { TENANT_ID } from '@/lib/constants'
import { getLocale } from '@/lib/locale-server'
import { EmployeesMasterDetail } from './EmployeesMasterDetail'

export const metadata = { title: 'Employees · AVANIIS People' }

/**
 * Employees — Option D "Modern" master–detail page (design handoff 2026-06).
 *
 * Server side: auth + role gate, entity/MANAGER scoping via listPersons,
 * loads up to 200 rows + filter options. Cohort segments, search, entity and
 * department refinement happen client-side in EmployeesMasterDetail; legacy
 * drill-down URL params (status / departmentId / legalEntityId / search /
 * emiratisationEligibleOnly) seed the client state so dashboard links keep
 * working. Rare params (departmentHeadId, projectId) stay server-applied.
 */

type SearchParams = {
  search?: string
  legalEntityId?: string
  departmentId?: string
  departmentHeadId?: string
  projectId?: string
  status?: string
  isActive?: string
  emiratisationEligibleOnly?: string
}

const ROLES_VIEW_COMP = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE']

export default async function PersonsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'MANAGER', 'SUPER_ADMIN', 'FINANCE']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const locale = await getLocale()
  const sp = searchParams ? await searchParams : {} as SearchParams

  // Tri-state isActive: '1' → true, '0' → false, anything else → undefined (no filter).
  const isActive = sp.isActive === '1' ? true : sp.isActive === '0' ? false : undefined

  // Server-side filters: only role scoping (inside listPersons) plus the rare
  // drill-down params that have no client-side control in the new design.
  const [pageResult, entityRows, deptRows] = await Promise.all([
    listPersons({
      page: 1,
      pageSize: 200,
      departmentHeadId: sp.departmentHeadId || undefined,
      projectId: sp.projectId || undefined,
      isActive,
    }),
    db.select({ id: legalEntities.id, code: legalEntities.entityCode, nameEn: legalEntities.nameEn, nameAr: legalEntities.nameAr })
      .from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
      .orderBy(asc(legalEntities.entityCode)),
    db.select({ id: departments.id, nameEn: departments.nameEn, nameAr: departments.nameAr, legalEntityId: departments.legalEntityId })
      .from(departments)
      .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true)))
      .orderBy(asc(departments.nameEn)),
  ])

  // Map legacy drill-down URL params onto the client's initial state.
  const initialSegment =
    sp.emiratisationEligibleOnly === '1' ? 'uae' as const
    : sp.status === 'ACTIVE'   ? 'active' as const
    : sp.status === 'ON_LEAVE' ? 'leave' as const
    : 'all' as const

  // Drill-down context chips — make it obvious which dashboard metric the
  // user navigated from (DASH-DRILL-013).
  const filter = { departmentId: sp.departmentId || undefined, status: sp.status || undefined, isActive }
  const isActiveHeadcountView = filter.status === 'ACTIVE' && filter.isActive === true
  const deptName = filter.departmentId
    ? deptRows.find(d => d.id === filter.departmentId)?.nameEn ?? null
    : null
  const contextChips: string[] = []
  if (isActiveHeadcountView) {
    contextChips.push(locale === 'ar' ? 'إجمالي الموظفين النشطين' : 'Active Headcount')
  }
  if (deptName) {
    contextChips.push(`${locale === 'ar' ? 'القسم' : 'Department'}: ${deptName}`)
  }
  if (sp.departmentHeadId) {
    contextChips.push(locale === 'ar' ? 'مرشّح حسب رئيس القسم' : 'Filtered by department head')
  }
  if (sp.projectId) {
    contextChips.push(locale === 'ar' ? 'مرشّح حسب المشروع' : 'Filtered by project')
  }

  const entityOptions = entityRows.map(e => ({
    id: e.id,
    label: locale === 'ar' && e.nameAr ? e.nameAr : `${e.code} — ${e.nameEn}`,
  }))
  const deptOptions = deptRows.map(d => ({
    id: d.id,
    label: locale === 'ar' && d.nameAr ? d.nameAr : d.nameEn,
    legalEntityId: d.legalEntityId,
  }))

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box', paddingBottom: 80 }}>
      {/* Page head */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 18,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600,
            letterSpacing: 0, color: 'var(--ink-1)', margin: 0,
          }}>
            {locale === 'ar' ? 'الموظفون' : 'Employees'}
          </h1>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
            {locale === 'ar'
              ? `${pageResult.total} موظف · ${entityRows.length} كيانات قانونية`
              : `${pageResult.total} people · ${entityRows.length} legal entities`}
          </p>
        </div>
        <Link
          href="/persons/new"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', color: 'var(--card)',
            borderRadius: 7, padding: '9px 16px', fontSize: 'var(--text-body)',
            fontWeight: 600, textDecoration: 'none',
          }}
        >
          <Plus size={16} strokeWidth={2} aria-hidden />
          {locale === 'ar' ? 'إضافة موظف' : 'Add employee'}
        </Link>
      </div>

      <EmployeesMasterDetail
        rows={pageResult.rows}
        total={pageResult.total}
        entities={entityOptions}
        departments={deptOptions}
        locale={locale}
        canViewComp={ROLES_VIEW_COMP.includes(session.user.role)}
        initialSegment={initialSegment}
        initialEntityId={sp.legalEntityId || null}
        initialDepartmentId={sp.departmentId || null}
        initialSearch={sp.search || ''}
        contextChips={contextChips}
      />
    </div>
  )
}
