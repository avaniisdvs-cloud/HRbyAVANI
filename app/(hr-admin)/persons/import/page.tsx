import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Upload } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getLocale } from '@/lib/locale-server'
import { ImportWizard } from './_components/ImportWizard'

export const metadata = { title: 'Import Employees · AVANIIS People' }

const ALLOWED_ROLES = new Set(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

export default async function ImportEmployeesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/sign-in')
  if (!ALLOWED_ROLES.has(session.user.role)) redirect('/persons')

  const locale = await getLocale()
  const isAr = locale === 'ar'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        padding: '20px 24px 16px',
      }}>
        {/* Breadcrumb */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Link
            href="/persons"
            style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', textDecoration: 'none' }}
          >
            {isAr ? 'الموظفون' : 'Employees'}
          </Link>
          <ChevronRight size={12} style={{ color: 'var(--ink-4)' }} />
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>{isAr ? 'استيراد الموظفين' : 'Import Employees'}</span>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'var(--accent-100)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Upload size={18} style={{ color: 'var(--brand-active)' }} />
          </div>
          <div>
            <h1 style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--ink-1)',
            }}>
              {isAr ? 'استيراد الموظفين' : 'Import Employees'}
            </h1>
            <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
              {isAr ? 'إنشاء الموظفين بالجملة من ملف Excel · تُدقَّق جميع عمليات الاستيراد' : 'Bulk create employees from an Excel file · All imports are audited'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Wizard ───────────────────────────────────────────────────── */}
      <div style={{ padding: '32px 0' }}>
        <ImportWizard />
      </div>
    </div>
  )
}
