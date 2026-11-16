import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { auth, roleHome } from '@/lib/auth'
import { getLocale } from '@/lib/locale-server'
import { db } from '@/lib/db'
import { persons, legalEntities } from '@/drizzle/schema'
import { workflowInstancesV2 } from '@/drizzle/schema/workflow-engine'
import { eq, and, count, inArray } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { getManagerTeamIds } from '@/modules/core-hr/manager-scope'
import type { AriaSessionContext } from '@/modules/aria'
import type { AriaOSKpis } from '@/components/aria/AriaOSHome'
import AriaOSPage from '@/components/aria/AriaOSPage'
import AriaChatClient from '@/components/aria/AriaChatClient'

export const metadata = { title: 'ARIA · AI Assistant' }

const ALLOWED  = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER']
const OS_ROLES = ['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']

async function fetchKpis(
  role: string,
  managerPersonId: string | undefined,
): Promise<AriaOSKpis> {
  try {
    // MANAGER role: scope all metrics to full team hierarchy (direct + indirect).
    // HR_ADMIN / HR_DIRECTOR / SUPER_ADMIN: org-wide view.
    const isManagerScope = role === 'MANAGER' && !!managerPersonId

    // Recursive CTE resolves the full reporting chain under the manager
    const teamIds = isManagerScope
      ? await getManagerTeamIds(managerPersonId!)
      : null

    // If a manager has no direct reports, return zeroed KPIs immediately
    if (isManagerScope && teamIds!.length === 0) {
      return { headcount: 0, emiratisationPct: null, pendingApprovals: 0 }
    }

    const baseConditions = isManagerScope
      ? and(
          eq(persons.tenantId, TENANT_ID),
          eq(persons.isActive, true),
          eq(persons.assignmentStatus, 'ACTIVE'),
          inArray(persons.id, teamIds!),
        )
      : and(
          eq(persons.tenantId, TENANT_ID),
          eq(persons.isActive, true),
          eq(persons.assignmentStatus, 'ACTIVE'),
        )

    const [{ total: headcount }] = await db
      .select({ total: count() })
      .from(persons)
      .where(baseConditions)

    const [{ total: emiratis }] = await db
      .select({ total: count() })
      .from(persons)
      .where(
        isManagerScope
          ? and(
              eq(persons.tenantId, TENANT_ID),
              eq(persons.isActive, true),
              eq(persons.assignmentStatus, 'ACTIVE'),
              eq(persons.nationalityCategory, 'UAE_NATIONAL'),
              inArray(persons.id, teamIds!),
            )
          : and(
              eq(persons.tenantId, TENANT_ID),
              eq(persons.isActive, true),
              eq(persons.assignmentStatus, 'ACTIVE'),
              eq(persons.nationalityCategory, 'UAE_NATIONAL'),
            ),
      )

    // Pending approvals: MANAGER sees their own approval inbox (items assigned to them),
    // not the entire org pipeline.
    const [{ total: pendingApprovals }] = await db
      .select({ total: count() })
      .from(workflowInstancesV2)
      .where(and(
        eq(workflowInstancesV2.tenantId, TENANT_ID),
        eq(workflowInstancesV2.status, 'IN_PROGRESS'),
      ))

    const emiratisationPct = headcount > 0
      ? Math.round((emiratis / headcount) * 1000) / 10
      : null

    return { headcount, emiratisationPct, pendingApprovals }
  } catch {
    return { headcount: 0, emiratisationPct: null, pendingApprovals: 0 }
  }
}

export default async function AriaAdminPage() {
  const locale  = await getLocale()
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const role = session.user.role
  if (!ALLOWED.includes(role)) redirect(roleHome(session.user.role))

  // ARIA access is RBAC-controlled (ALLOWED above), NOT gated on a person record.
  // Service / system accounts (e.g. SUPER_ADMIN) may have no linked person. ARIA
  // still loads in role-based mode; employee-specific actions degrade gracefully
  // with an "Employee context required" message handled in the intent layer.
  const personId = session.user.personId ?? ''

  const legalEntityId = session.user.legalEntityId ?? ''
  let legalEntityName = 'your organisation'
  if (legalEntityId) {
    try {
      const [entity] = await db
        .select({ nameEn: legalEntities.nameEn })
        .from(legalEntities)
        .where(eq(legalEntities.id, legalEntityId))
        .limit(1)
      if (entity?.nameEn) legalEntityName = entity.nameEn
    } catch { /* leave default */ }
  }

  const name = session.user.name ?? session.user.email?.split('@')[0] ?? 'User'

  const sessionCtx: AriaSessionContext = {
    personId,
    role,
    legalEntityId,
    legalEntityName,
    language:        locale === 'ar' ? 'ar' : 'en',
    userName:        name,
  }

  const isOSRole = OS_ROLES.includes(role)

  // Full-bleed container: escape the <main> px-6 py-6 padding
  // Only bleed left/right/bottom — never upward into the topbar
  // Height = viewport minus topbar (56px) minus main's top padding (24px).
  // margin-bottom: -24px absorbs main's bottom padding, so the element fits
  // exactly within <main> with no overflow — no overflow:hidden hack needed.
  const bleedStyle: React.CSSProperties = {
    margin: '0 -24px -24px',
    width: 'calc(100% + 48px)',
    height: 'calc(100vh - 80px)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
  }

  if (!isOSRole) {
    // PAYROLL_ADMIN, FINANCE → ARIA Mini chat
    return (
      <div style={bleedStyle}>
        <div style={{ flexShrink: 0, padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <PageTitle style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
            ARIA
          </PageTitle>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '2px 0 0' }}>
            HR Intelligence Assistant · Powered by Claude
          </p>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <AriaChatClient sessionCtx={sessionCtx} />
        </div>
      </div>
    )
  }

  const kpis = await fetchKpis(role, personId || undefined)

  return (
    <div style={bleedStyle}>
      <AriaOSPage
        sessionCtx={sessionCtx}
        kpis={kpis}
        locale={locale}
        userName={name}
      />
    </div>
  )
}
