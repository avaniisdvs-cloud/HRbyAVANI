import { redirect } from 'next/navigation'
import Link from 'next/link'
import { eq, and, desc } from 'drizzle-orm'
import { CalendarDays, Plus, CheckCircle2, XCircle, Clock, RotateCcw } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { absenceEntries, absenceTypes, absenceBalances } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'

export const metadata = { title: 'My Leave · AVANIIS' }

const STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string; icon: React.ReactNode }> = {
  APPROVED: { label: 'Approved',  bg: 'rgba(22,163,74,0.08)',  fg: '#16a34a', icon: <CheckCircle2 size={11} /> },
  PENDING:  { label: 'Pending',   bg: 'rgba(217,119,6,0.08)',  fg: '#d97706', icon: <Clock size={11} /> },
  REJECTED: { label: 'Rejected',  bg: 'rgba(220,38,38,0.08)',  fg: '#dc2626', icon: <XCircle size={11} /> },
  CANCELLED:{ label: 'Cancelled', bg: 'rgba(107,114,128,0.08)',fg: '#6b7280', icon: <RotateCcw size={11} /> },
  DRAFT:    { label: 'Draft',     bg: 'rgba(107,114,128,0.08)',fg: '#6b7280', icon: <Clock size={11} /> },
  TAKEN:    { label: 'Taken',     bg: 'rgba(22,163,74,0.08)',  fg: '#16a34a', icon: <CheckCircle2 size={11} /> },
  RECALLED: { label: 'Recalled',  bg: 'rgba(107,114,128,0.08)',fg: '#6b7280', icon: <RotateCcw size={11} /> },
}

export default async function MyLeaveSelfServicePage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!session.user.personId) redirect('/me')

  const personId    = session.user.personId
  const currentYear = new Date().getFullYear()

  const [balanceRows, requestRows] = await Promise.all([
    // Leave balances for current year
    db
      .select({
        typeName:          absenceTypes.typeNameEn,
        typeCode:          absenceTypes.typeCode,
        accruedDays:       absenceBalances.accruedDays,
        takenDays:         absenceBalances.takenDays,
        pendingDays:       absenceBalances.pendingDays,
        openingBalanceDays:absenceBalances.openingBalanceDays,
        closingBalanceDays:absenceBalances.closingBalanceDays,
        // P2-L4 — carried-forward + adjusted are part of entitlement and are
        // included in closingBalanceDays; the "total" must include them too,
        // otherwise available (= closing) can exceed total.
        carriedForwardDays:absenceBalances.carriedForwardDays,
        adjustedDays:      absenceBalances.adjustedDays,
      })
      .from(absenceBalances)
      .innerJoin(absenceTypes, eq(absenceBalances.absenceTypeId, absenceTypes.id))
      .where(and(
        eq(absenceBalances.tenantId, TENANT_ID),
        eq(absenceBalances.personId, personId),
        eq(absenceBalances.balanceYear, currentYear),
      )),

    // Recent leave requests (last 20)
    db
      .select({
        id:            absenceEntries.id,
        requestNumber: absenceEntries.requestNumber,
        typeName:      absenceTypes.typeNameEn,
        startDate:     absenceEntries.startDate,
        endDate:       absenceEntries.endDate,
        durationDays:  absenceEntries.durationDays,
        status:        absenceEntries.status,
        notes:         absenceEntries.notes,
      })
      .from(absenceEntries)
      .innerJoin(absenceTypes, eq(absenceEntries.absenceTypeId, absenceTypes.id))
      .where(and(
        eq(absenceEntries.tenantId, TENANT_ID),
        eq(absenceEntries.personId, personId),
      ))
      .orderBy(desc(absenceEntries.createdDate))
      .limit(20),
  ])

  return (
    <div className="page-in" style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--ink-1)',
              margin: 0,
            }}
          >
            My Leave
          </h1>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '6px 0 0' }}>
            Leave balances and request history
          </p>
        </div>
        <Link
          href="/absence/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 'var(--text-body)',
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: 8,
            background: 'var(--accent)',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          <Plus size={14} strokeWidth={2} />
          Apply for Leave
        </Link>
      </div>

      {/* Leave Balances */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 'var(--text-caption)', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-3)' }}>
            Leave Balances — {currentYear}
          </span>
        </div>

        {balanceRows.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0' }}>
            <CalendarDays size={16} color="var(--ink-4)" strokeWidth={1.5} />
            <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)' }}>
              No leave balances for {currentYear}. Contact HR to set up your entitlements.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {balanceRows.map(b => {
              const available = parseFloat(String(b.closingBalanceDays ?? 0))
              // P2-L4 — total entitlement = opening + accrued + carried-forward + adjusted
              // (everything that ADDS to the balance). available = closing = total
              // − taken − pending − forfeited, so available ≤ total always holds.
              const total     = parseFloat(String(b.openingBalanceDays ?? 0))
                              + parseFloat(String(b.accruedDays ?? 0))
                              + parseFloat(String(b.carriedForwardDays ?? 0))
                              + parseFloat(String(b.adjustedDays ?? 0))
              const taken     = parseFloat(String(b.takenDays ?? 0))
              const pending   = parseFloat(String(b.pendingDays ?? 0))
              const ratio     = total === 0 ? 0 : Math.min(available / total, 1)
              const barColor  = ratio > 0.5 ? '#16a34a' : ratio >= 0.2 ? '#d97706' : '#dc2626'

              return (
                <div key={b.typeCode}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{b.typeName}</span>
                    <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
                      <strong style={{ color: 'var(--ink-1)' }}>{available}</strong> / {total} days available
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ width: `${Math.round(ratio * 100)}%`, height: '100%', borderRadius: 3, background: barColor }} />
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                    <span>Taken: {taken} days</span>
                    {pending > 0 && <span style={{ color: '#d97706' }}>Pending: {pending} days</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Request History */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--text-caption)', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-3)' }}>
            Recent Requests
          </span>
          <Link href="/absence/my" style={{ fontSize: 'var(--text-caption)', color: 'var(--brand-active)', textDecoration: 'none' }}>
            View all →
          </Link>
        </div>

        {requestRows.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <CalendarDays size={24} color="var(--ink-4)" strokeWidth={1.5} style={{ marginBottom: 8 }} />
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', margin: 0 }}>No leave requests yet.</p>
          </div>
        ) : (
          <div>
            {requestRows.map((req, idx) => {
              const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.DRAFT
              return (
                <div
                  key={req.id}
                  style={{
                    padding: '12px 20px',
                    borderBottom: idx < requestRows.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{req.typeName}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{req.requestNumber}</span>
                    </div>
                    <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                      {req.startDate} → {req.endDate} · {String(req.durationDays)} day{Number(req.durationDays) !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 'var(--text-caption)', fontWeight: 600,
                      padding: '3px 10px', borderRadius: 20,
                      background: cfg.bg, color: cfg.fg,
                    }}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
