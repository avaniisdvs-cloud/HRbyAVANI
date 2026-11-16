import { PageTitle } from '@/components/ui/typography'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { auth, roleHome } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  absenceBalances, absencePlans, absenceTypes, auditLog, departments, legalEntities, persons, projects,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { getLocale } from '@/lib/locale-server'
import type { Locale } from '@/lib/i18n'
import {
  BalancesSearchSchema, balanceWhere, deriveBalanceStatus, deriveCarryForwardStatus,
  computePlanExpiryISO, isExpiringSoon,
  BALANCE_STATUS_LABEL_EN, CARRY_FORWARD_STATUS_LABEL_EN,
  type BalanceStatus, type CarryForwardStatus,
} from './filters'

// Display-only status labels (stored enum values are unchanged).
const BALANCE_STATUS_LABEL_AR: Record<BalanceStatus, string> = {
  positive: 'موجب', negative: 'سالب', zero: 'صفر', expiring: 'قارب الانتهاء',
}
const CARRY_FORWARD_STATUS_LABEL_AR: Record<CarryForwardStatus, string> = {
  eligible: 'مؤهّل', not_eligible: 'غير مؤهّل', expired: 'منتهٍ',
}
import { BalancesFilterBar } from './BalancesFilterBar'
import { BalanceSummaryCards } from './BalanceSummaryCards'

export const metadata = { title: 'Absence balances' }

/**
 * S5-09 + S6/A-03 — Absence balance report (Server Component).
 *
 * Phase 1 enterprise redesign (docs/LEAVE-BALANCES-REDESIGN-SPEC.md):
 *   • Auto-apply filters (no "Apply" button) — all state lives in the URL.
 *   • Filters: Legal Entity, Leave Type, Balance Year, Employee search,
 *     System date range (created/updated/last-accrual), Balance Status,
 *     Carry-Forward Status. (Department/Project deferred to Phase 2.)
 *   • Summary cards + active-filter chips + smart empty states.
 *   • Carry-forward expiry = PLAN-LEVEL approximation (Phase 1, Decision #1).
 *
 * Scoped to the caller's legal entity unless SUPER_ADMIN. Drill-down via
 * `?expanded=<balance.id>` renders inline accrual history (server-only).
 */
export default async function AbsenceBalancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'MANAGER', 'SUPER_ADMIN', 'FINANCE']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const locale = await getLocale()
  const isAr = locale === 'ar'

  const sp = searchParams ? await searchParams : {}
  const parsed = BalancesSearchSchema.safeParse(sp)
  const f = parsed.success ? parsed.data : {}
  const year = f.year ?? new Date().getUTCFullYear()
  const todayISO = new Date().toISOString().slice(0, 10)
  const expandedId = f.expanded
  const isSuper = session.user.role === 'SUPER_ADMIN'
  const scopedEntityId = isSuper ? null : session.user.legalEntityId

  // ── Filter option lists (RBAC-scoped) ──────────────────────────────────────
  const entityOptions = isSuper
    ? await db
        .select({ id: legalEntities.id, nameEn: legalEntities.nameEn, nameAr: legalEntities.nameAr })
        .from(legalEntities)
        .where(eq(legalEntities.tenantId, TENANT_ID))
        .orderBy(asc(legalEntities.nameEn))
    : scopedEntityId
      ? await db
          .select({ id: legalEntities.id, nameEn: legalEntities.nameEn, nameAr: legalEntities.nameAr })
          .from(legalEntities)
          .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.id, scopedEntityId)))
      : []

  const typeOptions = await db
    .select({ id: absenceTypes.id, typeCode: absenceTypes.typeCode, typeNameEn: absenceTypes.typeNameEn })
    .from(absenceTypes)
    .where(eq(absenceTypes.tenantId, TENANT_ID))
    .orderBy(asc(absenceTypes.typeCode))

  // Department / Project options — entity-scoped for non-SUPER_ADMIN.
  const deptConds = [eq(departments.tenantId, TENANT_ID)]
  if (scopedEntityId) deptConds.push(eq(departments.legalEntityId, scopedEntityId))
  const departmentOptions = await db
    .select({ id: departments.id, nameEn: departments.nameEn, code: departments.code })
    .from(departments)
    .where(and(...deptConds))
    .orderBy(asc(departments.nameEn))

  const projConds = [eq(projects.tenantId, TENANT_ID)]
  if (scopedEntityId) projConds.push(eq(projects.legalEntityId, scopedEntityId))
  const projectOptions = await db
    .select({ id: projects.id, nameEn: projects.nameEn, code: projects.code })
    .from(projects)
    .where(and(...projConds))
    .orderBy(asc(projects.nameEn))

  // ── Main query (joins absence_plans for plan-level expiry) ──────────────────
  const where = balanceWhere(
    { year, entityId: f.entityId, typeId: f.typeId, departmentId: f.departmentId, projectId: f.projectId, q: f.q, startDate: f.startDate, endDate: f.endDate, status: f.status, cf: f.cf },
    scopedEntityId,
  )

  const rows = await db
    .select({
      id:                   absenceBalances.id,
      personId:             absenceBalances.personId,
      personNumber:         persons.personNumber,
      personFullNameEn:     persons.fullNameEn,
      personFullNameAr:     persons.fullNameAr,
      absenceTypeCode:      absenceTypes.typeCode,
      absenceTypeNameEn:    absenceTypes.typeNameEn,
      balanceYear:          absenceBalances.balanceYear,
      openingBalanceDays:   absenceBalances.openingBalanceDays,
      accruedDays:          absenceBalances.accruedDays,
      takenDays:            absenceBalances.takenDays,
      pendingDays:          absenceBalances.pendingDays,
      adjustedDays:         absenceBalances.adjustedDays,
      carriedForwardDays:   absenceBalances.carriedForwardDays,
      forfeitedDays:        absenceBalances.forfeitedDays,
      closingBalanceDays:   absenceBalances.closingBalanceDays,
      lastAccrualDate:      absenceBalances.lastAccrualDate,
      nextAccrualDate:      absenceBalances.nextAccrualDate,
      carryForwardExpiryMonths: absencePlans.carryForwardExpiryMonths,
    })
    .from(absenceBalances)
    .leftJoin(persons,      eq(absenceBalances.personId, persons.id))
    .leftJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
    .leftJoin(absencePlans, eq(absenceTypes.absencePlanId, absencePlans.id))
    .where(where)
    .orderBy(asc(persons.personNumber), asc(absenceTypes.typeCode))

  // ── Derive per-row status + summary cards (JS over the filtered set) ────────
  const num = (v: unknown) => (v == null ? 0 : Number(v))
  const enriched = rows.map(r => {
    const cfMonths = num(r.carryForwardExpiryMonths)
    const expiryISO = computePlanExpiryISO(r.balanceYear, cfMonths)
    const carried = num(r.carriedForwardDays)
    const forfeited = num(r.forfeitedDays)
    const closing = r.closingBalanceDays == null ? null : Number(r.closingBalanceDays)
    return {
      ...r,
      _expiring: isExpiringSoon(carried, forfeited, expiryISO, todayISO),
      _balanceStatus: deriveBalanceStatus({ closingBalanceDays: closing, carriedForwardDays: carried, forfeitedDays: forfeited, expiryISO, todayISO }),
      _cfStatus: deriveCarryForwardStatus({ carriedForwardDays: carried, forfeitedDays: forfeited, expiryISO, todayISO }),
    }
  })

  const cards = {
    totalEmployees:  new Set(enriched.map(r => r.personId)).size,
    availableDays:   enriched.reduce((s, r) => s + Math.max(0, num(r.closingBalanceDays)), 0),
    expiringDays:    enriched.reduce((s, r) => s + (r._expiring ? num(r.carriedForwardDays) : 0), 0),
    negativeCount:   enriched.filter(r => num(r.closingBalanceDays) < 0).length,
    pendingImpact:   enriched.reduce((s, r) => s + num(r.pendingDays), 0),
  }

  // ── Drill-down (in-scope only) ──────────────────────────────────────────────
  const expandedInScope = expandedId && rows.some(r => r.id === expandedId) ? expandedId : null
  const history = expandedInScope
    ? await db
        .select({
          eventTime:   auditLog.eventTime,
          eventType:   auditLog.eventType,
          metadata:    auditLog.metadata,
          description: auditLog.description,
        })
        .from(auditLog)
        .where(and(
          eq(auditLog.tenantId,   TENANT_ID),
          eq(auditLog.resourceId, expandedInScope),
          inArray(auditLog.eventType, [
            'ABSENCE_BALANCE.ACCRUED',
            'ABSENCE_BALANCE.CARRY_FORWARD_EXPIRED',
          ]),
        ))
        .orderBy(asc(auditLog.eventTime))
    : []

  // Build export URL preserving the active filter set.
  const exportParams = new URLSearchParams()
  exportParams.set('year', String(year))
  if (f.entityId)     exportParams.set('entityId', f.entityId)
  if (f.typeId)       exportParams.set('typeId', f.typeId)
  if (f.departmentId) exportParams.set('departmentId', f.departmentId)
  if (f.projectId)    exportParams.set('projectId', f.projectId)
  if (f.q)         exportParams.set('q', f.q)
  if (f.startDate) exportParams.set('startDate', f.startDate)
  if (f.endDate)   exportParams.set('endDate', f.endDate)
  if (f.status)    exportParams.set('status', f.status)
  if (f.cf)        exportParams.set('cf', f.cf)

  function rowHref(rowId: string): string {
    const params = new URLSearchParams(exportParams.toString())
    if (expandedId !== rowId) params.set('expanded', rowId)
    return `/absence/balances?${params.toString()}`
  }

  const hasActiveFilters = Boolean(
    f.entityId || f.typeId || f.departmentId || f.projectId || f.q || f.startDate || f.endDate || f.status || f.cf,
  )

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box' }}>

      {/* Page Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 20, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <PageTitle style={{
            fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500,
            letterSpacing: '-0.5px', color: 'var(--ink-1)', margin: 0,
          }}>
            {isAr ? 'أرصدة الإجازات' : 'Absence Balances'}
          </PageTitle>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
            {isAr ? 'سنة الرصيد' : 'Balance year'} <span style={{ fontFamily: 'var(--font-mono)' }}>{year}</span> · {rows.length} {isAr ? (rows.length === 1 ? 'صف' : 'صفوف') : `row${rows.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <a
          href={`/absence/balances/export?${exportParams.toString()}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--card)', border: '1px solid var(--border)',
            color: 'var(--ink-1)', borderRadius: 6,
            padding: '7px 14px', fontSize: 'var(--text-caption)', fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          {isAr ? 'تنزيل CSV' : 'Download CSV'}
        </a>
      </div>

      {/* Summary cards */}
      <BalanceSummaryCards cards={cards} baseParams={exportParams.toString()} />

      {/* Filter bar + active chips (auto-apply, no Apply button) */}
      <BalancesFilterBar
        filters={{ year, entityId: f.entityId, typeId: f.typeId, departmentId: f.departmentId, projectId: f.projectId, q: f.q, startDate: f.startDate, endDate: f.endDate, status: f.status, cf: f.cf }}
        entityOptions={entityOptions}
        typeOptions={typeOptions}
        departmentOptions={departmentOptions}
        projectOptions={projectOptions}
        entityLocked={!isSuper}
      />

      {/* Table Card */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {(isAr
                  ? ['الموظف', 'نوع الإجازة', 'الحالة', 'افتتاحي', 'مستحق', 'مُرحّل', 'مُعدّل', 'مأخوذ', 'معلّق', 'مُصادَر', 'ختامي', 'الاستحقاق التالي']
                  : ['Person', 'Leave type', 'Status', 'Opening', 'Accrued', 'Carried', 'Adjusted', 'Taken', 'Pending', 'Forfeited', 'Closing', 'Next accrual']
                ).map(h => (
                  <th key={h} style={{
                    padding: '12px 20px', fontSize: 'var(--text-caption)', fontWeight: 700,
                    color: 'var(--ink-3)', textTransform: 'uppercase',
                    letterSpacing: '0.8px', background: 'var(--surface)',
                    borderBottom: '1px solid var(--border)',
                    textAlign: 'left', whiteSpace: 'nowrap', position: 'sticky', top: 0,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enriched.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 'var(--text-body)' }}>
                    {hasActiveFilters ? (
                      <>
                        {isAr ? 'لا توجد أرصدة مطابقة للتصفية.' : 'No balances match your filters.'}{' '}
                        <Link href="/absence/balances" style={{ color: 'var(--brand-active)', fontWeight: 600, textDecoration: 'none' }}>
                          {isAr ? 'مسح التصفية' : 'Clear filters'}
                        </Link>
                      </>
                    ) : (
                      <>{isAr ? `لا توجد صفوف أرصدة بعد لسنة ${year}. تُنشأ عند أول استحقاق.` : `No balance rows yet for ${year}. They are created on first accrual.`}</>
                    )}
                  </td>
                </tr>
              ) : (
                enriched.flatMap(r => {
                  const isOpen = r.id === expandedInScope
                  const tdStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
                    padding: '14px 20px', fontSize: 'var(--text-caption)', color: 'var(--ink-2)',
                    fontFamily: 'var(--font-mono)', verticalAlign: 'middle',
                    borderBottom: '1px solid var(--border)',
                    ...extra,
                  })
                  const negative = num(r.closingBalanceDays) < 0
                  const main = (
                    <tr key={r.id} style={{ background: isOpen ? 'var(--surface)' : 'transparent' }}
                      className={isOpen ? '' : 'hover:bg-surface'}>
                      <td style={{ ...tdStyle(), fontFamily: 'var(--font-sans)' }}>
                        <Link href={rowHref(r.id)} scroll={false} aria-expanded={isOpen} style={{ textDecoration: 'none', display: 'block' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-1)', fontSize: 'var(--text-body)', fontWeight: 600 }}>
                            <span aria-hidden style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontSize: 'var(--text-caption)' }}>
                              {isOpen ? '▾' : '▸'}
                            </span>
                            {r.personFullNameEn ?? r.personId}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>{r.personNumber ?? '—'}</div>
                        </Link>
                      </td>
                      <td style={tdStyle()}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center',
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 999, padding: '2px 8px', fontSize: 'var(--text-caption)', fontWeight: 600,
                          color: 'var(--ink-2)',
                        }}>{r.absenceTypeCode}</span>
                        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 3, fontFamily: 'var(--font-sans)' }}>{r.absenceTypeNameEn ?? '—'}</div>
                      </td>
                      <td style={tdStyle()}>
                        <StatusBadge balanceStatus={r._balanceStatus} cfStatus={r._cfStatus} locale={locale} />
                      </td>
                      <td style={tdStyle({ textAlign: 'right' })}>{r.openingBalanceDays}</td>
                      <td style={tdStyle({ textAlign: 'right' })}>{r.accruedDays}</td>
                      <td style={tdStyle({ textAlign: 'right' })}>{r.carriedForwardDays}</td>
                      <td style={tdStyle({ textAlign: 'right' })}>{r.adjustedDays}</td>
                      <td style={tdStyle({ textAlign: 'right' })}>{r.takenDays}</td>
                      <td style={tdStyle({ textAlign: 'right' })}>{r.pendingDays}</td>
                      <td style={tdStyle({ textAlign: 'right' })}>{r.forfeitedDays}</td>
                      <td style={tdStyle({ textAlign: 'right' })}>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-body)', fontWeight: 600,
                          color: negative ? 'var(--status-rejected-fg)' : 'var(--ink-1)',
                        }}>
                          {r.closingBalanceDays ?? '—'}
                        </span>
                        {r.accruedDays != null && Number(r.accruedDays) > 0 && r.takenDays != null && (
                          <div style={{ marginTop: 4, height: 6, width: 64, overflow: 'hidden', borderRadius: 999, background: 'var(--surface)', marginLeft: 'auto' }}>
                            <div style={{ height: 6, borderRadius: 999, background: 'var(--accent)', width: `${Math.min(100, Math.round((Number(r.takenDays) / Number(r.accruedDays)) * 100))}%` }} />
                          </div>
                        )}
                      </td>
                      <td style={tdStyle({ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' })}>
                        {r.nextAccrualDate ?? '—'}
                      </td>
                    </tr>
                  )
                  if (!isOpen) return [main]
                  const expansion = (
                    <tr key={`${r.id}-history`} style={{ background: 'var(--surface)' }}>
                      <td colSpan={12} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                        <AccrualHistory
                          rows={history}
                          absenceTypeCode={r.absenceTypeCode ?? '—'}
                          personLabel={r.personFullNameEn ?? r.personFullNameAr ?? r.personNumber ?? r.personId}
                          locale={locale}
                        />
                      </td>
                    </tr>
                  )
                  return [main, expansion]
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({
  balanceStatus, cfStatus, locale,
}: {
  balanceStatus: ReturnType<typeof deriveBalanceStatus>
  cfStatus: ReturnType<typeof deriveCarryForwardStatus>
  locale: Locale
}) {
  const isAr = locale === 'ar'
  const map: Record<string, { bg: string; fg: string }> = {
    expiring: { bg: 'var(--status-pending-bg)', fg: 'var(--status-pending-fg)' },
    negative: { bg: 'var(--status-rejected-bg)', fg: 'var(--status-rejected-fg)' },
    positive: { bg: 'var(--status-approved-bg)', fg: 'var(--status-approved-fg)' },
    zero:     { bg: 'var(--surface)', fg: 'var(--ink-3)' },
  }
  const c = balanceStatus ? map[balanceStatus] : { bg: 'var(--surface)', fg: 'var(--ink-3)' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', background: c.bg, color: c.fg,
        borderRadius: 999, padding: '2px 8px', fontSize: 'var(--text-caption)', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: 'var(--font-sans)',
      }}>
        {balanceStatus ? (isAr ? BALANCE_STATUS_LABEL_AR : BALANCE_STATUS_LABEL_EN)[balanceStatus] : '—'}
      </span>
      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
        {isAr ? 'الترحيل' : 'CF'}: {(isAr ? CARRY_FORWARD_STATUS_LABEL_AR : CARRY_FORWARD_STATUS_LABEL_EN)[cfStatus]}
      </span>
    </div>
  )
}

interface AccrualHistoryRow {
  eventTime:   Date
  eventType:   string
  metadata:    unknown
  description: string | null
}

function AccrualHistory({
  rows, absenceTypeCode, personLabel, locale,
}: {
  rows: AccrualHistoryRow[]
  absenceTypeCode: string
  personLabel: string
  locale: Locale
}) {
  const isAr = locale === 'ar'
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: 0 }}>
        {isAr ? 'لا يوجد سجل استحقاق بعد لـ' : 'No accrual history yet for'} <span style={{ fontFamily: 'var(--font-mono)' }}>{personLabel}</span> · {absenceTypeCode}.
        {isAr ? ' ستظهر سجلات التدقيق هنا بمجرد تشغيل ' : ' Audit rows will appear here once '}<code style={{ fontFamily: 'var(--font-mono)' }}>accrueMonthlyBalance</code>{isAr ? ' (مهمة TD-09).' : ' runs (TD-09 cron).'}
      </p>
    )
  }

  return (
    <div>
      <p style={{ marginBottom: 8, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink-3)' }}>
        {isAr ? 'سجل الاستحقاق الشهري' : 'Monthly accrual history'} · {personLabel} · {absenceTypeCode}
      </p>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((row, i) => {
          const meta = (row.metadata ?? {}) as {
            monthAccruedFor?: string
            daysAccrued?:     number | string
            ruleSetCode?:     string
            ruleSource?:      string
            forfeitedDays?:   number | string
          }
          const isExpiry = row.eventType === 'ABSENCE_BALANCE.CARRY_FORWARD_EXPIRED'
          return (
            <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderLeft: '2px solid var(--border)', paddingLeft: 12, fontSize: 'var(--text-caption)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', width: 80, flexShrink: 0 }}>
                {row.eventTime.toISOString().slice(0, 10)}
              </span>
              {isExpiry ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)', borderRadius: 999, padding: '2px 8px', fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{isAr ? 'مُصادَر' : 'FORFEITED'}</span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--status-approved-bg)', color: 'var(--status-approved-fg)', borderRadius: 999, padding: '2px 8px', fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{isAr ? 'مُستحق' : 'ACCRUED'}</span>
              )}
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)', fontSize: 'var(--text-caption)' }}>
                {isExpiry
                  ? <>−{String(meta.forfeitedDays ?? '?')} {isAr ? 'يوم' : 'd'}</>
                  : <>+{String(meta.daysAccrued ?? '?')} {isAr ? 'يوم' : 'd'}</>}
              </span>
              {meta.monthAccruedFor && (
                <span style={{ color: 'var(--ink-3)' }}>
                  {isAr ? 'عن شهر' : 'for month'} <span style={{ fontFamily: 'var(--font-mono)' }}>{meta.monthAccruedFor}</span>
                </span>
              )}
              {meta.ruleSetCode && (
                <span style={{ color: 'var(--ink-3)' }}>
                  · {isAr ? 'القاعدة' : 'rule'} <span style={{ fontFamily: 'var(--font-mono)' }}>{meta.ruleSetCode}</span>
                  {meta.ruleSource && <> ({meta.ruleSource})</>}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
