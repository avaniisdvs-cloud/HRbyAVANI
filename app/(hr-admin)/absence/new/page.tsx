import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { and, asc, desc, eq } from 'drizzle-orm'
import { CalendarPlus } from 'lucide-react'
import { auth, roleHome } from '@/lib/auth'
import { db } from '@/lib/db'
import { persons, absenceTypes, absenceBalances, absenceEntries } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { getSickLeaveCertThreshold } from '@/lib/absence-cert-policy'
import { getLeavePersonOptions } from '@/lib/leave-person-scope'
import { resolveLocale } from '@/lib/language-preference'
import { LeaveRequestShell } from './LeaveRequestShell'

export const metadata = { title: 'New leave request' }

/**
 * S5-08 — Self-service / HR-admin-on-behalf-of leave request entry.
 *
 * 50/50 layout: left = form, right = read-only leave insights for the
 * logged-in user (balances, recent requests, pending count, carry-forward).
 */
export default async function NewLeaveRequestPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; scope?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  // Every employee-type user may file their own leave (self-service); PAYROLL_ADMIN
  // and FINANCE are employees too. The person picklist (getLeavePersonOptions) and
  // assertCanRequestLeaveFor enforce relationship-based scope on WHO they file for.
  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'EMPLOYEE', 'PAYROLL_ADMIN', 'FINANCE', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const adminRoles = ['HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'SUPER_ADMIN', 'FINANCE']
  const backHref = adminRoles.includes(session.user.role) ? '/absence' : '/absence/my'

  // ?scope=self — self-service entry (from the personal profile "Apply for Leave").
  // Locks the applicant to the logged-in user and hides the manager team-member
  // toggle. Without it, behaviour is unchanged (role-scoped picklist / team leave).
  const sp = await searchParams
  const lockToSelf = sp?.scope === 'self'

  const insightsPersonId = session.user.personId ?? null
  const balanceYear = new Date().getUTCFullYear()
  const today = new Date().toISOString().slice(0, 10)

  // ── Self-only loader (self-service entry) ────────────────────────────────
  async function loadSelf() {
    if (!session!.user.personId) return [] as Awaited<ReturnType<typeof getLeavePersonOptions>>
    return db
      .select({
        id:            persons.id,
        personNumber:  persons.personNumber,
        fullNameEn:    persons.fullNameEn,
        fullNameAr:    persons.fullNameAr,
        legalEntityId: persons.legalEntityId,
      })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, session!.user.personId)))
      .limit(1)
  }

  // ── Person picklist ──
  // self-scope → self only (never runs the team CTE).
  // otherwise  → role-scoped picklist (EMPLOYEE=self, MANAGER=team, HR=all).
  let personRows = lockToSelf
    ? await loadSelf()
    : await getLeavePersonOptions(session.user).catch(() => [] as Awaited<ReturnType<typeof getLeavePersonOptions>>)
  if (personRows.length === 0 && session.user.personId) {
    personRows = await loadSelf()
  }

  // ── Absence type picklist ────────────────────────────────────────────────
  const typeRowsRaw = await db
    .select({
      id: absenceTypes.id, typeCode: absenceTypes.typeCode,
      typeNameEn: absenceTypes.typeNameEn, typeNameAr: absenceTypes.typeNameAr,
      legalEntityId: absenceTypes.legalEntityId,
      requiresMedicalCert: absenceTypes.requiresMedicalCert,
    })
    .from(absenceTypes)
    .where(and(eq(absenceTypes.tenantId, TENANT_ID), eq(absenceTypes.isActive, true)))
    .orderBy(asc(absenceTypes.typeCode))
  const scopedEntityId = session.user.role === 'SUPER_ADMIN' ? null : session.user.legalEntityId
  const typeRows = scopedEntityId
    ? typeRowsRaw.filter(t => t.legalEntityId === null || t.legalEntityId === scopedEntityId)
    : typeRowsRaw

  const certThresholdDays = await getSickLeaveCertThreshold(session.user.legalEntityId)
  const locale = await resolveLocale(session.user.personId)

  // ── Insights data (for the logged-in user) ───────────────────────────────
  let balances: Awaited<ReturnType<typeof fetchBalances>> = []
  let recentRequests: Awaited<ReturnType<typeof fetchRecentRequests>> = []
  let personInfo: { fullNameEn: string | null; personNumber: string | null } | null = null

  if (insightsPersonId) {
    ;[balances, recentRequests, personInfo] = await Promise.all([
      fetchBalances(insightsPersonId, balanceYear),
      fetchRecentRequests(insightsPersonId, today),
      fetchPersonInfo(insightsPersonId),
    ])
  }

  return (
    <div className="page-in">
      {/* ── Page header ── */}
      <div>
        <Link href={backHref} className="text-xs text-accent hover:underline">
          ← All leave requests
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <CalendarPlus className="h-6 w-6 text-accent" aria-hidden strokeWidth={1.75} />
          <div>
            <PageTitle style={{
              fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 600,
              color: 'var(--ink-1)', letterSpacing: '-0.5px', margin: 0,
            }}>
              {locale === 'ar' ? 'طلب إجازة جديد' : 'New Leave Request'}
            </PageTitle>
            <p className="mt-0.5 text-sm text-ink-3">
              Save creates a DRAFT · Submit routes through the LEAVE_REQUEST workflow.
            </p>
          </div>
        </div>
      </div>

      {/* ── 50 / 50 split ── */}
      <div style={{ marginTop: 20 }}>
        <LeaveRequestShell
          persons={personRows}
          absenceTypes={typeRows}
          currentRole={session.user.role}
          currentLegalEntityId={session.user.legalEntityId}
          currentPersonId={session.user.personId ?? null}
          currentUserId={session.user.id}
          lockToSelf={lockToSelf}
          certThresholdDays={certThresholdDays}
          balances={balances}
          recentRequests={recentRequests}
          personName={personInfo?.fullNameEn ?? null}
          personNumber={personInfo?.personNumber ?? null}
          balanceYear={balanceYear}
          locale={locale}
        />
      </div>
    </div>
  )
}

// ── Data-fetch helpers (co-located, not exported) ────────────────────────────

async function fetchBalances(personId: string, year: number) {
  const rows = await db
    .select({
      typeCode:           absenceTypes.typeCode,
      typeNameEn:         absenceTypes.typeNameEn,
      closingBalanceDays: absenceBalances.closingBalanceDays,
      takenDays:          absenceBalances.takenDays,
      pendingDays:        absenceBalances.pendingDays,
      accruedDays:        absenceBalances.accruedDays,
      carriedForwardDays: absenceBalances.carriedForwardDays,
    })
    .from(absenceBalances)
    .leftJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
    .where(and(
      eq(absenceBalances.tenantId, TENANT_ID),
      eq(absenceBalances.personId, personId),
      eq(absenceBalances.balanceYear, year),
    ))
    .orderBy(asc(absenceTypes.typeCode))
  // Filter out rows where the left-join produced no type (orphaned balances)
  return rows.filter((r): r is typeof r & { typeCode: string; typeNameEn: string } =>
    r.typeCode !== null && r.typeNameEn !== null,
  )
}

async function fetchRecentRequests(personId: string, today: string) {
  return db
    .select({
      id:           absenceEntries.id,
      typeCode:     absenceTypes.typeCode,
      typeNameEn:   absenceTypes.typeNameEn,
      durationDays: absenceEntries.durationDays,
      startDate:    absenceEntries.startDate,
      endDate:      absenceEntries.endDate,
      status:       absenceEntries.status,
    })
    .from(absenceEntries)
    .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
    .where(and(
      eq(absenceEntries.tenantId, TENANT_ID),
      eq(absenceEntries.personId, personId),
    ))
    .orderBy(desc(absenceEntries.startDate))
    .limit(8)
}

async function fetchPersonInfo(personId: string) {
  const [row] = await db
    .select({ fullNameEn: persons.fullNameEn, personNumber: persons.personNumber })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
    .limit(1)
  return row ?? null
}
