import { redirect } from 'next/navigation'
import { eq }       from 'drizzle-orm'
import { auth, roleHome }     from '@/lib/auth'
import { db }       from '@/lib/db'
import { departments } from '@/drizzle/schema/foundation'
import { fetchHierarchy, fetchSystemUsers } from '@/modules/core-hr/org-chart-actions'
import { OrgChartShell }  from '@/components/org-chart/OrgChartShell'
import { TENANT_ID }      from '@/lib/constants'
import type { OrgViewerRole } from '@/lib/org-chart/types'
import type { OrgFlowNode, OrgFlowEdge } from '@/lib/org-chart/types'

function toViewerRole(role: string): OrgViewerRole {
  if (['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN', 'FINANCE'].includes(role)) return 'HR_ADMIN'
  if (role === 'MANAGER') return 'MANAGER'
  return 'EMPLOYEE'
}

export default async function OrgChartPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'MANAGER', 'EMPLOYEE', 'FINANCE', 'PAYROLL_ADMIN']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const viewerRole = toViewerRole(session.user.role)

  // Default view = Reporting Manager. SSR fetches the SAME engine the default
  // pill selects, so the first paint matches the selected view (no position/
  // vacant flash, no "My Team cards while Reporting Manager is active" mismatch).
  // EMPLOYEE role is forced to the my-team engine inside fetchHierarchy.
  // MANAGER: root the reporting tree at themselves (their reporting subtree) so
  // they don't see the whole tenant. Global roles (HR Admin+) see the full tree.
  const managerRootPersonId =
    session.user.role === 'MANAGER' ? (session.user.personId ?? undefined) : undefined

  const [treeResult, depts, sysUsersResult] = await Promise.all([
    fetchHierarchy({ engine: 'reporting', includeVacant: true, maxDepth: 8, rootPersonId: managerRootPersonId }),
    db
      .select({ id: departments.id, nameEn: departments.nameEn, nameAr: departments.nameAr })
      .from(departments)
      .where(eq(departments.isActive, true))
      .orderBy(departments.nameEn),
    fetchSystemUsers(),
  ])

  if (!treeResult.success || !treeResult.data) {
    return (
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        height:         '100%',
        color:          'var(--ink-3)',
        fontFamily:     'var(--font-sans)',
        fontSize:       14,
        flexDirection:  'column',
        gap:            8,
      }}>
        <span>Organisation chart data unavailable.</span>
        {treeResult.error && (
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--org-error)' }}>{treeResult.error}</span>
        )}
      </div>
    )
  }

  const { nodes, edges, meta } = treeResult.data
  const systemUsers = sysUsersResult.success ? sysUsersResult.data : []

  // Break out of the layout padding so the canvas fills edge-to-edge.
  // Admin/Manager: main has padding:24px on all sides + paddingBottom:80 — escape all four sides.
  // Employee: main has no horizontal/top padding, only paddingBottom:80 — escape only the bottom
  //   so the shell fills the full flex column without clipping left/right controls.
  return (
    <div style={
      viewerRole === 'EMPLOYEE'
        ? { height: 'calc(100% + 80px)',
        marginBottom: '-80px', overflow: 'hidden' }
        : { marginTop: "-1.5rem",
        marginRight: "-1.5rem",
        marginBottom: "-1.5rem",
        marginLeft: "-1.5rem", width: 'calc(100% + 3rem)', height: 'calc(100% + 3rem)', overflow: 'hidden' }
    }>
      <OrgChartShell
        initialNodes={nodes as OrgFlowNode[]}
        initialEdges={edges as OrgFlowEdge[]}
        meta={meta}
        departments={depts}
        viewerRole={viewerRole}
        currentPersonId={session.user.personId ?? undefined}
        tenantId={TENANT_ID}
        systemUsers={systemUsers}
      />
    </div>
  )
}
