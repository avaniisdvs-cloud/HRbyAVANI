import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/lib/auth'
import { getLocale } from '@/lib/locale-server'
import { getColleagueProfile } from '@/modules/directory/actions'

export const metadata = { title: 'Colleague · AVANIIS People' }

/**
 * Read-only colleague card for employees opening a co-worker from the org chart.
 *
 * Employees may NOT open the full /persons HR profile (PII, salary, documents).
 * This page shows ONLY directory-level, non-sensitive fields: name, job title,
 * department, legal entity and work contact — the same data the directory list
 * already exposes to all staff.
 */
export default async function ColleagueCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ from?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await getLocale()
  const { id } = await params
  const sp = searchParams ? await searchParams : {}
  const backHref  = sp.from === 'org-chart' ? '/org-chart' : '/me/directory'
  const backLabel = sp.from === 'org-chart'
    ? (locale === 'ar' ? '→ الهيكل التنظيمي' : '← Organisation Chart')
    : (locale === 'ar' ? '→ الدليل' : '← Directory')

  // An employee viewing their OWN record should see the full ESS profile.
  if (session.user.personId && session.user.personId === id) redirect('/me/profile')

  const person = await getColleagueProfile(id)
  if (!person) notFound()

  const initials = (person.fullNameEn ?? '?')
    .split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  const Field = ({ label, value }: { label: string; value: string | null }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-3)' }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--ink-1)' }}>{value && value.trim() ? value : '—'}</span>
    </div>
  )

  return (
    <div className="page-in" style={{ maxWidth: 640 }}>
      <Link
        href={backHref}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-caption)', fontWeight: 500,
          color: 'var(--ink-2)', textDecoration: 'none', padding: '3px 8px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--surface)', marginBottom: 16,
        }}
      >
        {backLabel}
      </Link>

      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg, 12px)', padding: 24,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
            background: 'var(--accent-100, var(--surface))', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, color: 'var(--brand-active)',
          }}>
            {person.photoSrc
              ? <Image src={person.photoSrc} alt={person.fullNameEn ?? ''} width={64} height={64} style={{ objectFit: 'cover', width: 64, height: 64 }} unoptimized />
              : initials}
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500, color: 'var(--ink-1)', margin: 0 }}>
              {person.fullNameEn ?? '—'}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: '2px 0 0' }}>
              {person.positionTitleEn ?? (locale === 'ar' ? 'لا يوجد منصب معيّن' : 'No position assigned')}
            </p>
          </div>
        </div>

        {/* Read-only directory fields */}
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label={locale === 'ar' ? 'رقم الموظف' : 'Employee No.'} value={person.personNumber} />
          <Field label={locale === 'ar' ? 'القسم' : 'Department'}   value={person.departmentNameEn} />
          <Field label={locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity'} value={person.legalEntityNameEn} />
          <Field label={locale === 'ar' ? 'الحالة' : 'Status'}       value={person.assignmentStatus?.replace(/_/g, ' ')} />
          <Field label={locale === 'ar' ? 'البريد الإلكتروني للعمل' : 'Work Email'}   value={person.workEmail} />
          <Field label={locale === 'ar' ? 'هاتف العمل' : 'Work Phone'}   value={person.mobileNumber} />
        </div>

        <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: '20px 0 0' }}>
          {locale === 'ar'
            ? 'معلومات الدليل فقط. سجلات التوظيف الكاملة متاحة للموارد البشرية.'
            : 'Directory information only. Full employment records are visible to HR.'}
        </p>
      </div>
    </div>
  )
}
