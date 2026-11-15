import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { and, eq, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { contracts, persons } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { resolveLocale } from '@/lib/language-preference'
import { Badge } from '@/components/ui/badge'
import { ContractAmendForm } from './ContractAmendForm'

export const metadata = { title: 'Amend contract' }

/**
 * S4-02 — Contract amend (Server Component shell).
 *
 * Loads the active contract for the person (or the explicit ?contractId
 * if provided) and hands off to the Client Component. amendContract uses
 * the close-current + open-new pattern (Hard Rule 3); the page itself
 * only loads the row and renders the form — no mutations here.
 *
 * BR-CT-002 max-3-year guardrail is shown on the form so HR Admin sees
 * the cap before they pick a new end date.
 */
export default async function AmendContractPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ contractId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const locale = await resolveLocale(session.user.personId)
  const title = locale === 'ar' ? 'تعديل العقد' : 'Amend contract'

  const { id } = await params
  const sp = searchParams ? await searchParams : {} as { contractId?: string }

  const allowedRoles = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowedRoles.includes(session.user.role)) redirect(`/persons/${id}`)

  // Confirm person exists + caller is in scope.
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

  // Resolve target contract: explicit ?contractId, else newest ACTIVE row.
  const contractRows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.tenantId, TENANT_ID), eq(contracts.personId, person.id)))
    .orderBy(desc(contracts.startDate))

  const activeContracts = contractRows.filter(c => c.status === 'ACTIVE')
  const target = sp.contractId
    ? contractRows.find(c => c.id === sp.contractId)
    : activeContracts[0]

  if (!target) {
    return (
      <div className="page-in">
        <Header personId={person.id} title={title} subtitle={`${person.personNumber} · ${person.fullNameEn ?? '—'}`} locale={locale} />
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'لا يوجد عقد نشط' : 'No active contract'}</h3></div>
          <div style={{ padding: '16px 20px' }}>
            <p className="text-sm text-ink-3">
              {locale === 'ar'
                ? 'لا يوجد لهذا الشخص عقد نشط لتعديله. استخدم مسار إنشاء العقد أولاً، أو اختر عقداً آخر من صفحة الملف الشخصي.'
                : 'This person has no ACTIVE contract to amend. Use the contract creation flow first, or pick a different contract from the profile page.'}
            </p>
            <Link href={`/persons/${person.id}`} className="mt-3 inline-block text-sm text-accent hover:underline">
              {locale === 'ar' ? '→ العودة إلى الملف الشخصي' : '← Back to profile'}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (target.status !== 'ACTIVE') {
    return (
      <div className="page-in">
        <Header personId={person.id} title={title} subtitle={`${person.personNumber} · ${person.fullNameEn ?? '—'}`} locale={locale} />
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
              {locale === 'ar' ? 'العقد غير قابل للتعديل' : 'Contract not amendable'}
              <Badge className="ms-2 align-middle" variant="outline">{target.status}</Badge>
            </h3>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <p className="text-sm text-ink-3">
              {locale === 'ar'
                ? <>يمكن تعديل العقود النشطة فقط. هذا العقد <code className="font-mono">{target.status}</code>.</>
                : <>Only ACTIVE contracts can be amended. This contract is{' '}<code className="font-mono">{target.status}</code>.</>}
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
      <ContractAmendForm
        personId={person.id}
        contract={{
          id:                  target.id,
          contractNumber:      target.contractNumber,
          startDate:           target.startDate,
          endDate:             target.endDate,
          employmentType:      target.employmentType,
          workingHoursPerWeek: Number(target.workingHoursPerWeek),
          workLocation:        target.workLocation,
          noticePeriodDays:    target.noticePeriodDays,
          notes:               target.notes,
          renewalCount:        target.renewalCount,
        }}
      />
    </div>
  )
}

function Header({ personId, title, subtitle, locale }: { personId: string; title: string; subtitle: string; locale: string }) {
  return (
    <div className="mb-6">
      <Link href={`/persons/${personId}`} className="text-sm text-ink-3 hover:text-accent">{locale === 'ar' ? '→ العودة إلى الملف الشخصي' : '← Back to profile'}</Link>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.5px', margin: 0 }}>{title}</h1>
      <p className="mt-1 text-sm text-ink-3">{subtitle}</p>
    </div>
  )
}
