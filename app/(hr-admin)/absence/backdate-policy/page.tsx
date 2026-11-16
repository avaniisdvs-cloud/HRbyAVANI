import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { and, asc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { legalEntities, absenceTypes } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { listBackdatePolicies } from '@/modules/absence'
import { resolveLocale } from '@/lib/language-preference'
import { BackdatePolicyClient } from './BackdatePolicyClient'

export const metadata = { title: 'Leave Backdate Policy · AVANIIS' }

/**
 * BR-LV-BDP-001 — only HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN may access this page.
 * Configure per-entity, per-leave-type backdating rules.
 */
export default async function LeaveBackdatePolicyPage({
  searchParams,
}: {
  searchParams?: Promise<{ entity?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const ALLOWED = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!ALLOWED.includes(session.user.role)) redirect('/dashboard')

  const sp = await searchParams
  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'
  const locale = await resolveLocale(session.user.personId)

  // Entity list — SUPER_ADMIN sees all, others see their own entity only
  const entityRows = isSuperAdmin
    ? await db
        .select({ id: legalEntities.id, nameEn: legalEntities.nameEn, nameAr: legalEntities.nameAr })
        .from(legalEntities)
        .where(eq(legalEntities.tenantId, TENANT_ID))
        .orderBy(asc(legalEntities.nameEn))
    : await db
        .select({ id: legalEntities.id, nameEn: legalEntities.nameEn, nameAr: legalEntities.nameAr })
        .from(legalEntities)
        .where(and(
          eq(legalEntities.tenantId, TENANT_ID),
          eq(legalEntities.id, session.user.legalEntityId),
        ))

  const selectedEntityId =
    sp?.entity ?? session.user.legalEntityId ?? entityRows[0]?.id ?? ''

  // All active absence types (global + entity-specific)
  const typeRows = await db
    .select({
      id:         absenceTypes.id,
      typeCode:   absenceTypes.typeCode,
      typeNameEn: absenceTypes.typeNameEn,
      typeNameAr: absenceTypes.typeNameAr,
    })
    .from(absenceTypes)
    .where(and(eq(absenceTypes.tenantId, TENANT_ID), eq(absenceTypes.isActive, true)))
    .orderBy(asc(absenceTypes.typeCode))

  // Existing policies for selected entity
  const existingPolicies = selectedEntityId
    ? await listBackdatePolicies(selectedEntityId)
    : []

  return (
    <div className="page-in">
      <div style={{ marginBottom: 24 }}>
        <PageTitle style={{
          fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 700,
          color: 'var(--ink-1)', margin: 0, letterSpacing: '-0.4px',
        }}>
          {locale === 'ar' ? 'سياسة الإدخال بأثر رجعي للإجازات' : 'Leave Backdate Policy'}
        </PageTitle>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '6px 0 0' }}>
          Configure how far back employees can submit leave requests, per leave type and legal entity.
        </p>
      </div>

      <BackdatePolicyClient
        entities={entityRows}
        absenceTypes={typeRows}
        existingPolicies={existingPolicies}
        selectedEntityId={selectedEntityId}
        isSuperAdmin={isSuperAdmin}
        currentLegalEntityId={session.user.legalEntityId}
        locale={locale}
      />
    </div>
  )
}
