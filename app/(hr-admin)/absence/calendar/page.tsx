import { redirect } from 'next/navigation'
import { and, eq, gte, lte, or, isNull, asc } from 'drizzle-orm'
import { z } from 'zod'
import { CalendarCheck, Flag, CheckCircle, Lock } from 'lucide-react'
import { auth, roleHome } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  blackoutPeriods, publicHolidays, absenceEntries, persons, absenceTypes,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { addDays, todayUae } from '@/lib/effective-date'

export const metadata = { title: 'Leave calendar' }

// S5-Q11 — strict Zod for the optional date searchParams. `.catch(undefined)`
// silently drops malformed values so the page falls back to the default
// 90-day window instead of throwing a Postgres `invalid_text_representation`.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined)
const CalendarSearchSchema = z.object({ from: isoDate, to: isoDate })

/**
 * S5-03 — Leave calendar (Server Component, read-only).
 *
 * Renders three overlays for a 90-day window:
 *   • Public holidays (publicHolidays — UAE 2026 + entity overrides)
 *   • Blackout periods (blackoutPeriods — minCoveragePct gates)
 *   • Approved leave  (absenceEntries.status = APPROVED ∪ TAKEN)
 *
 * Scoped to the caller's legal entity (Security spec §2.4).
 * No client interactivity — pure display.
 */
export default async function LeaveCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'MANAGER', 'EMPLOYEE', 'SUPER_ADMIN', 'FINANCE']
  if (!allowed.includes(session.user.role)) redirect(roleHome(session.user.role))

  const rawSearch = searchParams ? await searchParams : {} as { from?: string; to?: string }
  const parsedSearch = CalendarSearchSchema.safeParse(rawSearch)
  const sp = parsedSearch.success ? parsedSearch.data : { from: undefined, to: undefined }
  const from = sp.from ?? todayUae()
  const to   = sp.to   ?? addDays(from, 90)
  const scopedEntityId = session.user.role === 'SUPER_ADMIN' ? null : session.user.legalEntityId

  // ── Public holidays (overlap with [from, to]) ─────────────────────────
  const holidayConds = [
    eq(publicHolidays.tenantId, TENANT_ID),
    or(isNull(publicHolidays.endDate), gte(publicHolidays.endDate, from)),
    lte(publicHolidays.holidayDate, to),
  ]
  if (scopedEntityId) {
    holidayConds.push(or(
      isNull(publicHolidays.legalEntityId),
      eq(publicHolidays.legalEntityId, scopedEntityId),
    )!)
  }
  const holidays = await db
    .select()
    .from(publicHolidays)
    .where(and(...holidayConds))
    .orderBy(asc(publicHolidays.holidayDate))

  // ── Blackout periods ───────────────────────────────────────────────────
  const blackoutConds = [
    eq(blackoutPeriods.tenantId, TENANT_ID),
    eq(blackoutPeriods.isActive, true),
    lte(blackoutPeriods.startDate, to),
    gte(blackoutPeriods.endDate, from),
  ]
  if (scopedEntityId) blackoutConds.push(eq(blackoutPeriods.legalEntityId, scopedEntityId))
  const blackouts = await db
    .select()
    .from(blackoutPeriods)
    .where(and(...blackoutConds))
    .orderBy(asc(blackoutPeriods.startDate))

  // ── Approved or taken leave ────────────────────────────────────────────
  const leaveConds = [
    eq(absenceEntries.tenantId, TENANT_ID),
    or(eq(absenceEntries.status, 'APPROVED'), eq(absenceEntries.status, 'TAKEN'))!,
    lte(absenceEntries.startDate, to),
    gte(absenceEntries.endDate, from),
  ]
  if (scopedEntityId) leaveConds.push(eq(absenceEntries.legalEntityId, scopedEntityId))
  const approved = await db
    .select({
      id: absenceEntries.id, startDate: absenceEntries.startDate,
      endDate: absenceEntries.endDate, durationDays: absenceEntries.durationDays,
      personId: absenceEntries.personId,
      personFullNameEn: persons.fullNameEn, personFullNameAr: persons.fullNameAr,
      absenceTypeCode: absenceTypes.typeCode, absenceTypeNameEn: absenceTypes.typeNameEn,
    })
    .from(absenceEntries)
    .leftJoin(persons, eq(absenceEntries.personId, persons.id))
    .leftJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
    .where(and(...leaveConds))
    .orderBy(asc(absenceEntries.startDate))

  const cardStyle: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 12, overflow: 'hidden',
  }
  const cardHeaderStyle: React.CSSProperties = {
    padding: '14px 20px', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 14, fontWeight: 600, color: 'var(--ink-1)',
  }
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 8, padding: '12px 20px', borderBottom: '1px solid var(--border)',
    fontSize: 'var(--text-body)',
  }

  return (
    <div className="page-in" style={{ width: '100%', boxSizing: 'border-box' }}>

      {/* Page Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500,
          letterSpacing: '-0.5px', color: 'var(--ink-1)', margin: 0,
        }}>
          Leave Calendar
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: '4px 0 0' }}>
          Window: <span style={{ fontFamily: 'var(--font-mono)' }}>{from}</span> → <span style={{ fontFamily: 'var(--font-mono)' }}>{to}</span>
          {' · '}
          {holidays.length} {holidays.length === 1 ? 'holiday' : 'holidays'},{' '}
          {blackouts.length} {blackouts.length === 1 ? 'blackout' : 'blackouts'},{' '}
          {approved.length} approved leave {approved.length === 1 ? 'entry' : 'entries'}.
        </p>
      </div>

      {/* Three-column grid */}
      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>

        {/* Public Holidays */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <Flag size={16} style={{ color: 'var(--status-pending-fg)' }} aria-hidden strokeWidth={1.75} />
            Public Holidays
          </div>
          <div style={{ padding: holidays.length === 0 ? '20px' : 0 }}>
            {holidays.length === 0 ? (
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>No holidays in this window.</p>
            ) : holidays.map((h, i) => (
              <div key={h.id} style={{ ...rowStyle, borderBottom: i === holidays.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{h.holidayNameEn}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
                    {h.holidayDate}{h.endDate && h.endDate !== h.holidayDate ? ` → ${h.endDate}` : ''}
                    {' · '}{h.durationDays} day{h.durationDays === 1 ? '' : 's'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  {h.isFloating && (
                    <span style={{
                      display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 999, padding: '2px 8px', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)',
                    }}>Hijri</span>
                  )}
                  {!h.isConfirmed && (
                    <span style={{
                      display: 'inline-flex', background: 'var(--status-pending-bg)', color: 'var(--status-pending-fg)',
                      borderRadius: 999, padding: '2px 8px', fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase',
                    }}>Tentative</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Blackout Periods */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <Lock size={16} style={{ color: 'var(--status-rejected-fg)' }} aria-hidden strokeWidth={1.75} />
            Blackout Periods
          </div>
          <div style={{ padding: blackouts.length === 0 ? '20px' : 0 }}>
            {blackouts.length === 0 ? (
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>No blackout periods in this window.</p>
            ) : blackouts.map((b, i) => (
              <div key={b.id} style={{ ...rowStyle, borderBottom: i === blackouts.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{b.nameEn}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>{b.startDate} → {b.endDate}</div>
                  {b.reason && <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>{b.reason}</div>}
                </div>
                <span style={{
                  display: 'inline-flex', background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)',
                  borderRadius: 999, padding: '2px 8px', fontSize: 'var(--text-caption)', fontWeight: 700,
                  textTransform: 'uppercase', flexShrink: 0,
                }}>
                  ≥ {b.minCoveragePct}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Approved Leave */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <CheckCircle size={16} style={{ color: 'var(--brand-active)' }} aria-hidden strokeWidth={1.75} />
            Approved Leave
          </div>
          <div style={{ padding: approved.length === 0 ? '20px' : 0 }}>
            {approved.length === 0 ? (
              <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>No approved leave in this window.</p>
            ) : approved.map((l, i) => (
              <div key={l.id} style={{ ...rowStyle, borderBottom: i === approved.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{l.personFullNameEn ?? l.personId}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
                    {l.startDate} → {l.endDate} · {l.durationDays} d
                  </div>
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: 'var(--status-approved-bg)', color: 'var(--status-approved-fg)',
                  borderRadius: 999, padding: '2px 8px', fontSize: 'var(--text-caption)', fontWeight: 700,
                  textTransform: 'uppercase', flexShrink: 0,
                }}>{l.absenceTypeCode}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
