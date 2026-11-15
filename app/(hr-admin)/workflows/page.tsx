import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { auth, roleHome } from '@/lib/auth'
import { getPendingApprovalsV2 } from '@/modules/workflow'
import { getLocale } from '@/lib/locale-server'
import { WorkflowsTableClient } from './WorkflowsTableClient'

export const metadata = { title: 'Approvals · AVANIIS People' }

const APPROVER_ROLES = ['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']

export default async function PendingApprovalsPage() {
  const locale = await getLocale()
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!APPROVER_ROLES.includes(session.user.role)) redirect(roleHome(session.user.role))

  const rows = await getPendingApprovalsV2()
  const breachedCount = rows.filter(r => r.isBreached).length

  return (
    <div
      className="page-in"
      style={{
        display: 'flex', flexDirection: 'column',
        height: 'calc(100vh - 104px)',
        overflow: 'hidden', width: '100%', boxSizing: 'border-box',
        paddingBottom: 80,
      }}
    >

      {/* Page Header — never scrolls */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500,
            letterSpacing: '-0.5px', color: 'var(--ink-1)', margin: 0,
          }}>
            {locale === 'ar' ? 'الموافقات المعلقة' : 'Pending Approvals'}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: 0 }}>
            {locale === 'ar'
              ? `خطوات سير العمل الجارية المعيّنة لدورك · ${rows.length} معلّق`
              : `In-flight workflow steps assigned to your role · ${rows.length} pending`}
            {breachedCount > 0 && (
              <span style={{
                marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg)',
              }}>
                <AlertTriangle size={12} strokeWidth={2} aria-hidden />
                {locale === 'ar' ? `${breachedCount} تجاوز SLA` : `${breachedCount} SLA breached`}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Table — fills remaining height */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <WorkflowsTableClient
          rows={rows}
          locale={locale}
          userRole={session.user.role}
        />
      </div>
    </div>
  )
}
