import { SectionTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getAriaConfig } from '@/modules/aria'
import { Bot, ExternalLink, Mic, MessageSquare, Shield, ChevronLeft, Settings2 } from 'lucide-react'
import AriaSettingsClient from './AriaSettingsClient'

export const metadata = { title: 'AI Agent (ARIA) · AVANIIS HR' }

// ── Status badge helper ────────────────────────────────────────────────────

function StatusBadge({ label, color }: { label: string; color: 'green' | 'blue' | 'amber' | 'slate' }) {
  const styles: Record<string, React.CSSProperties> = {
    green: { background: 'var(--status-approved-bg)',  color: 'var(--status-approved-fg)' },
    blue:  { background: 'color-mix(in srgb, #3B82F6 12%, transparent)', color: '#1D4ED8' },
    amber: { background: 'var(--status-pending-bg)',   color: 'var(--status-pending-fg)' },
    slate: { background: 'var(--surface)', color: 'var(--ink-3)', border: '1px solid var(--border)' },
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 4,
      fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', ...styles[color],
    }}>
      {label}
    </span>
  )
}

export default async function AIAgentSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  // SUPER_ADMIN only — ARIA model/behaviour/branding/API configuration.
  if (session.user.role !== 'SUPER_ADMIN') redirect('/settings')

  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'

  // Only SUPER_ADMIN can read full ARIA config
  let ariaConfig = null
  let ariaConfigError: string | null = null
  if (isSuperAdmin) {
    try {
      ariaConfig = await getAriaConfig()
    } catch (err) {
      ariaConfigError = err instanceof Error ? err.message : 'Failed to load ARIA configuration.'
    }
  }

  return (
    <div className="page-in">

      {/* ── Back / breadcrumb ─────────────────────────────────────────────── */}
      <Link
        href="/settings"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 'var(--text-caption)', color: 'var(--ink-3)', textDecoration: 'none',
          marginBottom: 20,
        }}
      >
        <ChevronLeft size={13} strokeWidth={2} aria-hidden />
        Back to Settings
      </Link>

      {/* ── Quick-access card ─────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: '0 0 6px' }}>
              Open ARIA Admin Console
            </p>
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: 0, lineHeight: 1.6 }}>
              Test ARIA, review session logs, and run queries from the dedicated admin interface.
            </p>
          </div>
          <Link
            href="/aria"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, flexShrink: 0,
              background: 'var(--accent)', color: "var(--on-accent)",
              fontSize: 'var(--text-body)', fontWeight: 500, textDecoration: 'none',
              transition: 'opacity 0.15s',
            }}
          >
            Open ARIA
            <ExternalLink size={13} strokeWidth={2} aria-hidden />
          </Link>
        </div>
      </div>

      {/* ── Feature cards ─────────────────────────────────────────────────── */}
      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 32 }}>
        {[
          {
            icon: MessageSquare,
            title:   'Conversational HR',
            titleAr: 'الموارد البشرية التحادثية',
            desc:    'Employees can ask about leave balances, org charts, and request leave through natural language.',
            status:  { label: 'Active', color: 'green' as const },
            action:  isSuperAdmin ? { label: 'Configure', href: '#behaviour-tab' } : null,
          },
          {
            icon: Mic,
            title:   'Voice Input',
            titleAr: 'الإدخال الصوتي',
            desc:    'ARIA supports voice queries in English and Arabic via the Web Speech API.',
            status:  { label: 'Chrome & Edge', color: 'blue' as const },
            action:  null,
          },
          {
            icon: Shield,
            title:   'Hard Rules',
            titleAr: 'القواعد الصارمة',
            desc:    'ARIA never writes HR data without explicit confirmation. Every query is audit-logged per Hard Rule 1.',
            status:  { label: 'System Enforced', color: 'amber' as const },
            action:  null,
          },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.title} style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '16px 18px',
              display: 'flex', flexDirection: 'column', gap: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  display: 'grid', placeItems: 'center',
                }}>
                  <Icon size={16} strokeWidth={1.75} style={{ color: 'var(--brand-active)' }} aria-hidden />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{card.title}</p>
                  <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: 0 }} dir="rtl" lang="ar">{card.titleAr}</p>
                </div>
              </div>
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '0 0 10px', lineHeight: 1.6, flex: 1 }}>{card.desc}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <StatusBadge label={card.status.label} color={card.status.color} />
                {card.action && (
                  <a
                    href="#aria-config-section"
                    style={{
                      fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--brand-active)',
                      textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    Configure →
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── ARIA Configuration (SUPER_ADMIN only) ─────────────────────────── */}
      {isSuperAdmin && ariaConfigError && (
        <div style={{
          background: 'var(--status-rejected-bg)', border: '1px solid var(--status-rejected-fg)',
          borderRadius: 10, padding: '14px 18px', marginBottom: 16,
          fontSize: 'var(--text-body)', color: 'var(--status-rejected-fg)', fontFamily: 'var(--font-mono)',
        }}>
          <strong>ARIA config error:</strong> {ariaConfigError}
        </div>
      )}

      {isSuperAdmin && ariaConfig ? (
        <div id="aria-config-section">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 16, paddingBottom: 14,
            borderBottom: '1px solid var(--border)',
          }}>
            <Settings2 size={15} strokeWidth={1.75} style={{ color: 'var(--ink-3)' }} aria-hidden />
            <SectionTitle style={{
              fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 400,
              letterSpacing: '-0.01em', color: 'var(--ink-1)', margin: 0,
            }}>
              ARIA Configuration
            </SectionTitle>
            <span style={{
              fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: "var(--on-accent)", background: 'var(--accent)', padding: '2px 6px', borderRadius: 4,
            }}>
              SUPER ADMIN
            </span>
          </div>
          <AriaSettingsClient config={ariaConfig} />
        </div>
      ) : !isSuperAdmin ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '20px 24px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <Bot size={20} strokeWidth={1.75} style={{ color: 'var(--ink-3)', flexShrink: 0 }} aria-hidden />
          <div>
            <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-2)', margin: '0 0 4px' }}>
              ARIA configuration requires SUPER_ADMIN role
            </p>
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: 0 }}>
              Contact your system administrator to modify AI model, behaviour, branding, or knowledge base settings.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
