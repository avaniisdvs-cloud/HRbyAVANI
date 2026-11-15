import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getEmployeeDashboardData } from '@/modules/reports'
import Link from 'next/link'

export const metadata = { title: 'My Dashboard · AVANIIS' }

export default async function EmployeeDashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const personId = session.user.personId
  if (!personId) redirect('/sign-in')

  const data = await getEmployeeDashboardData(personId)

  // Time-based greeting (server-side)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  return (
    <div className="page-in" style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--ink-1)',
            margin: 0,
          }}
        >
          Good {greeting}, {data.personName ?? 'there'} 👋
        </h1>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '6px 0 0' }}>
          {new Date().toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 28,
        }}
      >
        {[
          { label: 'Apply for Leave', href: '/absence/new' },
          { label: 'My Documents',   href: '/me/documents' },
          { label: 'My Profile',     href: '/me' },
        ].map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            style={{
              fontSize: 'var(--text-body)',
              fontWeight: 500,
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--accent)',
              color: 'var(--brand-active)',
              background: 'transparent',
              textDecoration: 'none',
              display: 'inline-block',
              transition: 'background 0.15s',
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* ── Alerts (expiring docs) ─────────────────────────────────────────── */}
      {data.expiringDocs.length > 0 && (
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              borderBottom: '1px solid var(--border)',
              paddingBottom: 8,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-caption)',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--ink-3)',
              }}
            >
              Alerts
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.expiringDocs.map((doc, idx) => {
              const daysUntil = doc.expiryDate
                ? Math.ceil(
                    (new Date(doc.expiryDate).getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24),
                  )
                : 999
              const severity: 'red' | 'amber' | 'neutral' =
                daysUntil < 14 ? 'red' : daysUntil < 30 ? 'amber' : 'neutral'

              const bgMap = {
                red:     'var(--status-rejected-bg, rgba(239,68,68,0.08))',
                amber:   'var(--status-pending-bg, rgba(217,119,6,0.08))',
                neutral: 'var(--card)',
              }
              const dotMap = {
                red:     'var(--status-rejected-text, #dc2626)',
                amber:   'var(--status-pending-text, #d97706)',
                neutral: 'var(--ink-3)',
              }

              return (
                <div
                  key={idx}
                  style={{
                    background: bgMap[severity],
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: dotMap[severity],
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', flex: 1 }}>
                    {doc.documentTitle} expires on {doc.expiryDate ?? 'unknown date'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Leave Balances ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            borderBottom: '1px solid var(--border)',
            paddingBottom: 8,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-caption)',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--ink-3)',
            }}
          >
            My Leave Balances
          </span>
        </div>

        {data.leaveBalances.length === 0 ? (
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-4)', margin: 0 }}>
            No leave balances found. Contact HR.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.leaveBalances.map((balance) => {
              const available = parseFloat(balance.closingBalanceDays ?? '0')
              const total =
                parseFloat(balance.accruedDays) + parseFloat(balance.openingBalanceDays)
              const ratio = total === 0 ? 0 : Math.min(available / total, 1)
              const pct = Math.round(ratio * 100)
              const barColor =
                ratio > 0.5
                  ? 'var(--status-approved-text, #16a34a)'
                  : ratio >= 0.2
                  ? 'var(--status-pending-text, #d97706)'
                  : 'var(--status-rejected-text, #dc2626)'

              return (
                <div key={balance.typeName} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
                      {balance.typeName}
                    </span>
                    <span style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--ink-1)' }}>
                      {available}/{total} days
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: 6,
                      borderRadius: 3,
                      background: 'var(--border)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: 3,
                        background: barColor,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Pending Leave Requests ────────────────────────────────────────── */}
      {data.pendingLeave.length > 0 && (
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div
            style={{
              borderBottom: '1px solid var(--border)',
              paddingBottom: 8,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-caption)',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--ink-3)',
              }}
            >
              Pending Leave Requests
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.pendingLeave.map((leave) => (
              <div
                key={leave.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
                    {leave.typeName}
                  </span>
                  <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                    {leave.startDate} → {leave.endDate} · {leave.durationDays} days
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 'var(--text-caption)',
                    fontWeight: 600,
                    padding: '2px 10px',
                    borderRadius: 20,
                    background: 'var(--status-pending-bg, rgba(217,119,6,0.08))',
                    color: 'var(--status-pending-text, #d97706)',
                  }}
                >
                  PENDING
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
