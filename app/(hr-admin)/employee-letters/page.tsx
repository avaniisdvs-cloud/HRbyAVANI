import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getAllLetterTypes } from '@/modules/employee-letters/queries'
import { LetterTypesGrid } from '@/components/employee-letters/LetterTypesGrid'
import { FileText } from 'lucide-react'

export const metadata = { title: 'Employee Letters' }

// RBAC-BL-04: HR-owned official letter generation (salary certs, NOC, etc.) —
// not employee self-service (employees use /me/letters). Restricted to HR roles.
// The generation server actions already requireRole HR_ADMIN/HR_DIRECTOR/
// SUPER_ADMIN; this aligns the page entry + the read API routes to match.
const HR_LETTER_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']

export default async function EmployeeLettersPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!HR_LETTER_ROLES.includes(session.user.role)) redirect('/dashboard')

  const types = await getAllLetterTypes()

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <FileText size={20} style={{ color: 'var(--brand-active)' }} />
        <div>
          <PageTitle style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
            Employee Letters
          </PageTitle>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
            Generate, track and manage official HR letters for employees
          </p>
        </div>
      </div>

      {types.length === 0 ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-body)', padding: '32px 0' }}>
          No letter types configured. Ask your system administrator to set up letter templates.
        </div>
      ) : (
        <LetterTypesGrid types={types} />
      )}
    </div>
  )
}
