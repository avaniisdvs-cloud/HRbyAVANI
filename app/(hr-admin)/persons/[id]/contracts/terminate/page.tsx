import { PageTitle } from '@/components/ui/typography'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { and, eq, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { contracts, persons } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { resolveLocale } from '@/lib/language-preference'
import { Badge } from '@/components/ui/badge'
import { ContractTerminateForm } from './ContractTerminateForm'

export const metadata = { title: 'Terminate contract' }

/**
 * S4-02 — Contract terminate (Server Component shell).
 *
 * Loads the active (or specified) contract for the person and hands off
 * to the Client Component. terminateContract flips the row's status and
 * stamps termination metadata; per Hard Rule 3, the row itself is never
 * deleted. BR-EOSB-PAY-001 (14-day final payment window) is recorded
 * by the back-end; payroll module enforces the dispatch.
 */
export default async function TerminateContractPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ contractId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale(session.user.personId)
  const title = locale === 'ar' ? 'إنهاء العقد' : 'Terminate contract'

  const { id } = await params
  const sp = searchParams ? await searchParams : {} as { contractId?: string }

  const allowedRoles = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowedRoles.includes(session.user.role)) redirect(`/persons/${id}`)

  const [person] = await db
    .select({
      id: persons.id, personNumber: persons.personNumber,
      fullNameEn: persons.fullNameEn, fullNameAr: persons.fullNameAr,
      legalEntityId: persons.legalEntityId,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, id)))
    .limit(1)
  if (!person) notFound()
  if (
    session.user.role !== 'SUPER_ADMIN'
    && session.user.legalEntityId !== person.legalEntityId
  ) redirect(`/persons/${id}`)

  const contractRows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.tenantId, TENANT_ID), eq(contracts.personId, person.id)))
    .orderBy(desc(contracts.startDate))

  const target = sp.contractId
    ? contractRows.find(c => c.id === sp.contractId)
    : contractRows.find(c => c.status === 'ACTIVE')

  if (!target) {
    return (
      <div className="page-in">
        <Header personId={person.id} title={title} subtitle={`${person.personNumber} · ${person.fullNameEn ?? '—'}`} locale={locale} />
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'لا يوجد عقد لإنهائه' : 'No contract to terminate'}</h3></div>
          <div style={{ padding: '16px 20px' }}>
            <p className="text-sm text-ink-3">
              {locale === 'ar' ? 'لا يوجد لهذا الشخص عقد مسجّل. استخدم مسار إنشاء العقد أولاً.' : 'This person has no contract on file. Use the contract creation flow first.'}
            </p>
            <Link href={`/persons/${person.id}`} className="mt-3 inline-block text-sm text-accent hover:underline">
              {locale === 'ar' ? '→ العودة إلى الملف الشخصي' : '← Back to profile'}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (target.status === 'TERMINATED') {
    return (
      <div className="page-in">
        <Header personId={person.id} title={title} subtitle={`${person.personNumber} · ${person.fullNameEn ?? '—'}`} locale={locale} />
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
              {locale === 'ar' ? 'منتهٍ بالفعل' : 'Already terminated'}
              <Badge className="ms-2 align-middle" variant="outline">{target.status}</Badge>
            </h3>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <p className="text-sm text-ink-3">
              {locale === 'ar'
                ? <>تم إنهاء العقد <code className="font-mono">{target.contractNumber}</code> بتاريخ <code className="font-mono">{target.terminationDate ?? '—'}</code>. لا تُحذف سجلات الموارد البشرية أبداً؛ يبقى الصف للتدقيق.</>
                : <>Contract <code className="font-mono">{target.contractNumber}</code> was terminated on{' '}<code className="font-mono">{target.terminationDate ?? '—'}</code>. HR records are never deleted; the row stays for audit.</>}
            </p>
            <Link href={`/persons/${person.id}`} className="mt-3 inline-block text-sm text-accent hover:underline">
              {locale === 'ar' ? '→ العودة إلى الملف الشخصي' : '← Back to profile'}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-in">
      <Header personId={person.id} title={title} subtitle={`${person.personNumber} · ${person.fullNameEn ?? '—'}`} locale={locale} />
      <ContractTerminateForm
        personId={person.id}
        contract={{
          id:              target.id,
          contractNumber:  target.contractNumber,
          startDate:       target.startDate,
          endDate:         target.endDate,
          employmentType:  target.employmentType,
          status:          target.status,
        }}
      />
    </div>
  )
}

function Header({ personId, title, subtitle, locale }: { personId: string; title: string; subtitle: string; locale: string }) {
  return (
    <div className="mb-6">
      <Link href={`/persons/${personId}`} className="text-sm text-ink-3 hover:text-accent">{locale === 'ar' ? '→ العودة إلى الملف الشخصي' : '← Back to profile'}</Link>
      <PageTitle style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.5px', margin: 0 }}>{title}</PageTitle>
      <p className="mt-1 text-sm text-ink-3">{subtitle}</p>
    </div>
  )
}
