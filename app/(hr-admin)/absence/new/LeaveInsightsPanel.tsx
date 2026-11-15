import { CalendarCheck2, Clock3, AlertCircle, TrendingUp } from 'lucide-react'

const TYPE_COLOR: Record<string, string> = {
  ANNUAL:    'var(--accent)',
  SICK:      'var(--status-warning)',
  EMERGENCY: 'var(--status-rejected-dot)',
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING:   { bg: 'var(--status-pending-bg)',  fg: 'var(--status-pending-fg)',  label: 'Pending'   },
  APPROVED:  { bg: 'var(--status-approved-bg)', fg: 'var(--status-approved-fg)', label: 'Approved'  },
  REJECTED:  { bg: 'var(--status-rejected-bg)', fg: 'var(--status-rejected-fg)', label: 'Rejected'  },
  CANCELLED: { bg: 'var(--surface)',             fg: 'var(--ink-3)',              label: 'Cancelled' },
  TAKEN:     { bg: 'var(--status-taken-bg)',     fg: 'var(--status-taken-fg)',    label: 'Taken'     },
  DRAFT:     { bg: 'var(--surface)',             fg: 'var(--ink-3)',              label: 'Draft'     },
}

export interface InsightBalance {
  typeCode: string
  typeNameEn: string
  closingBalanceDays: string | null
  takenDays: string | null
  pendingDays: string | null
  accruedDays: string | null
  carriedForwardDays: string | null
}

export interface InsightRequest {
  id: string
  typeCode: string | null
  typeNameEn: string | null
  durationDays: string
  startDate: string
  endDate: string
  status: string
}

interface Props {
  balances: InsightBalance[]
  recentRequests: InsightRequest[]
  personName: string | null
  personNumber: string | null
  selectedTypeCode: string
  balanceYear: number
}

function fmt(days: string | null | undefined): number {
  return days ? Math.floor(Number(days)) : 0
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AE', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function dateRange(start: string, end: string, days: string): string {
  const d = Math.floor(Number(days))
  if (start === end) return `${fmtDate(start)} · ${d}d`
  return `${fmtDate(start)} – ${fmtDate(end)} · ${d}d`
}

export function LeaveInsightsPanel({
  balances,
  recentRequests,
  personName,
  personNumber,
  selectedTypeCode,
  balanceYear,
}: Props) {
  const spotlight = balances.find(b => b.typeCode === selectedTypeCode) ?? balances[0] ?? null
  const spotRemaining = spotlight ? fmt(spotlight.closingBalanceDays) : 0
  const spotTotal     = spotlight ? fmt(spotlight.accruedDays) : 0
  const spotUsed      = spotlight ? fmt(spotlight.takenDays)   : 0
  const spotPending   = spotlight ? fmt(spotlight.pendingDays) : 0
  const spotPct       = spotTotal > 0 ? Math.round((spotUsed / spotTotal) * 100) : 0
  const spotColor     = TYPE_COLOR[spotlight?.typeCode ?? ''] ?? 'var(--accent)'

  const pendingCount  = recentRequests.filter(r => r.status === 'PENDING').length
  const ytdTaken      = recentRequests
    .filter(r => r.status === 'APPROVED' || r.status === 'TAKEN')
    .reduce((s, r) => s + Number(r.durationDays), 0)

  const carryForward  = balances.reduce((s, b) => s + fmt(b.carriedForwardDays), 0)

  const upcoming      = recentRequests.find(
    r => r.status === 'APPROVED' && r.startDate >= new Date().toISOString().slice(0, 10),
  )
  const lastApproved  = recentRequests.find(
    r => (r.status === 'APPROVED' || r.status === 'TAKEN') &&
         r.startDate < new Date().toISOString().slice(0, 10),
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 0',
      }}>
        <div>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--ink-3)', margin: 0,
          }}>
            Leave Overview
          </p>
          {personName && (
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', margin: '2px 0 0' }}>
              {personName}
              {personNumber && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginLeft: 6 }}>
                  #{personNumber}
                </span>
              )}
            </p>
          )}
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', fontWeight: 600,
          color: 'var(--brand-active)', background: 'var(--accent-050)',
          padding: '2px 8px', borderRadius: 9999,
        }}>
          {balanceYear}
        </span>
      </div>

      {balances.length === 0 ? (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '24px 20px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
            No leave balance data found for {balanceYear}.
          </p>
          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: '4px 0 0' }}>
            Balances are created once your profile is fully set up.
          </p>
        </div>
      ) : (
        <>
          {/* ── Spotlight: selected leave type ── */}
          {spotlight && (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '16px 18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--ink-3)', margin: 0,
                }}>
                  Selected type
                </p>
                <span style={{
                  background: spotColor + '18', color: spotColor,
                  fontSize: 'var(--text-caption)', fontWeight: 700, padding: '2px 8px',
                  borderRadius: 9999, border: `1px solid ${spotColor}30`,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                }}>
                  {spotlight.typeCode}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                <span style={{
                  fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 600,
                  color: 'var(--ink-1)', letterSpacing: -1, lineHeight: 1,
                }}>
                  {spotRemaining}
                </span>
                <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
                  days remaining
                </span>
              </div>

              <div style={{ display: 'flex', gap: 14, fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginBottom: 10 }}>
                <span>of <b style={{ color: 'var(--ink-2)' }}>{spotTotal}</b> accrued</span>
                <span>·</span>
                <span><b style={{ color: 'var(--ink-2)' }}>{spotUsed}</b> used</span>
                {spotPending > 0 && (
                  <>
                    <span>·</span>
                    <span style={{ color: 'var(--status-pending-fg)' }}>
                      <b>{spotPending}</b> pending
                    </span>
                  </>
                )}
              </div>

              {/* progress bar */}
              <div style={{ height: 6, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${spotPct}%`,
                  background: spotColor, borderRadius: 4,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: '4px 0 0' }}>
                {spotPct}% used of this year&apos;s accrual
              </p>
            </div>
          )}

          {/* ── All balances strip ── */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <TrendingUp size={12} color="var(--ink-3)" />
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--ink-3)', margin: 0,
              }}>
                All Balances
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(balances.length, 3)}, 1fr)` }}>
              {balances.slice(0, 3).map((b, i) => {
                const rem  = fmt(b.closingBalanceDays)
                const tot  = fmt(b.accruedDays)
                const used = fmt(b.takenDays)
                const pct  = tot > 0 ? Math.round((used / tot) * 100) : 0
                const col  = TYPE_COLOR[b.typeCode] ?? 'var(--accent)'
                const isSelected = b.typeCode === selectedTypeCode
                return (
                  <div key={b.typeCode} style={{
                    padding: '12px 14px',
                    borderRight: i < Math.min(balances.length, 3) - 1 ? '1px solid var(--border)' : 'none',
                    background: isSelected ? `${col}08` : 'transparent',
                    transition: 'background 0.2s',
                  }}>
                    <p style={{
                      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: isSelected ? col : 'var(--ink-3)', margin: '0 0 6px',
                    }}>
                      {b.typeCode}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{
                        fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 600,
                        color: 'var(--ink-1)', letterSpacing: -0.5, lineHeight: 1,
                      }}>
                        {rem}
                      </span>
                      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>/{tot}d</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'var(--surface)', overflow: 'hidden', margin: '6px 0 4px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 2 }} />
                    </div>
                    <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: 0 }}>{used}d used</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Quick stats row ── */}
          <div data-responsive-grid="true" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
          }}>
            {[
              { icon: <AlertCircle size={12} />, label: 'Pending', value: pendingCount, unit: pendingCount === 1 ? 'request' : 'requests', highlight: pendingCount > 0 },
              { icon: <CalendarCheck2 size={12} />, label: 'YTD Taken', value: Math.round(ytdTaken), unit: 'days', highlight: false },
              { icon: <Clock3 size={12} />, label: 'Carry-fwd', value: carryForward, unit: 'days', highlight: false },
            ].map(stat => (
              <div key={stat.label} style={{
                background: 'var(--card)', border: `1px solid ${stat.highlight ? 'var(--status-warning-border)' : 'var(--border)'}`,
                borderRadius: 8, padding: '10px 12px',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6,
                  color: stat.highlight ? 'var(--status-warning-fg)' : 'var(--ink-3)',
                }}>
                  {stat.icon}
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', fontWeight: 700,
                    letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0,
                  }}>
                    {stat.label}
                  </p>
                </div>
                <p style={{
                  fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600,
                  color: stat.highlight ? 'var(--status-warning-fg)' : 'var(--ink-1)',
                  margin: 0, lineHeight: 1,
                }}>
                  {stat.value}
                </p>
                <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: '2px 0 0' }}>{stat.unit}</p>
              </div>
            ))}
          </div>

          {/* ── Upcoming + Last taken ── */}
          {(upcoming || lastApproved) && (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 10, overflow: 'hidden',
            }}>
              {upcoming && (
                <div style={{
                  padding: '10px 16px',
                  borderBottom: lastApproved ? '1px solid var(--border)' : 'none',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: 'var(--status-approved-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <CalendarCheck2 size={13} color="var(--status-approved-fg)" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '0 0 2px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                      Upcoming approved
                    </p>
                    <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', margin: 0, fontWeight: 500 }}>
                      {upcoming.typeNameEn ?? upcoming.typeCode}
                    </p>
                    <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '1px 0 0' }}>
                      {dateRange(upcoming.startDate, upcoming.endDate, upcoming.durationDays)}
                    </p>
                  </div>
                </div>
              )}
              {lastApproved && (
                <div style={{
                  padding: '10px 16px',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Clock3 size={13} color="var(--ink-3)" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '0 0 2px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                      Last leave taken
                    </p>
                    <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', margin: 0, fontWeight: 500 }}>
                      {lastApproved.typeNameEn ?? lastApproved.typeCode}
                    </p>
                    <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '1px 0 0' }}>
                      {dateRange(lastApproved.startDate, lastApproved.endDate, lastApproved.durationDays)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Recent requests mini-list ── */}
          {recentRequests.length > 0 && (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 10, overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <p style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--ink-3)', margin: 0,
                }}>
                  Recent requests
                </p>
              </div>
              <div>
                {recentRequests.slice(0, 4).map((r, i) => {
                  const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.DRAFT
                  return (
                    <div key={r.id} style={{
                      padding: '9px 16px',
                      borderBottom: i < Math.min(recentRequests.length, 4) - 1 ? '1px solid var(--border)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-1)', margin: 0, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.typeNameEn ?? r.typeCode ?? '—'}
                        </p>
                        <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '1px 0 0' }}>
                          {dateRange(r.startDate, r.endDate, r.durationDays)}
                        </p>
                      </div>
                      <span style={{
                        background: st.bg, color: st.fg,
                        fontSize: 'var(--text-caption)', fontWeight: 700, padding: '2px 7px',
                        borderRadius: 9999, whiteSpace: 'nowrap',
                        fontFamily: 'var(--font-mono)', letterSpacing: '0.03em',
                        flexShrink: 0,
                      }}>
                        {st.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
