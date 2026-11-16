import { PageTitle, SectionTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { and, count, eq } from 'drizzle-orm'
import { ChevronRight } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { TENANT_ID } from '@/lib/constants'
import {
  leaveRuleSets, absenceTypes, complianceRules,
} from '@/drizzle/schema'
import { visibleAdminGroups } from '@/config/admin-landing'

export const metadata = { title: 'Administration' }

/**
 * Administration landing (Option C1) — simplified, grouped, role-aware.
 *
 * Replaces the flat configuration-center grid with the approved 7-group layout.
 * Role visibility is driven by config/admin-landing.ts (cards mirror each
 * target page's existing guard). Existing routes, guards (Option B), and the
 * settings sidebar / workspace nav are unchanged.
 */
export default async function SettingsHubPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  const role = session.user.role
  // RBAC-BL-02: explicit page-level role guard (defense-in-depth) mirroring the
  // middleware /settings gate and settings/layout.tsx. Previously this page had
  // only a session check and relied entirely on upstream layers. Same canonical
  // triad — no access change. Redirects to /dashboard (not /settings — self-loop).
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(role)) redirect('/dashboard')
  const isSuperAdmin = role === 'SUPER_ADMIN'

  // Real counts only — no hallucinated numbers. Cards without a key omit the chip.
  // Org master-data counts (departments/positions/jobs/grades/holidays) were
  // removed when those cards moved to the Organization workspace (single owner).
  const [
    [{ n: leaveRules }], [{ n: absTypes }], [{ n: compRules }],
  ] = await Promise.all([
    db.select({ n: count() }).from(leaveRuleSets).where(and(eq(leaveRuleSets.tenantId, TENANT_ID), eq(leaveRuleSets.isActive, true))),
    db.select({ n: count() }).from(absenceTypes).where(and(eq(absenceTypes.tenantId, TENANT_ID), eq(absenceTypes.isActive, true))),
    db.select({ n: count() }).from(complianceRules).where(eq(complianceRules.tenantId, TENANT_ID)),
  ])

  const counts: Record<string, number> = {
    leaveRules: Number(leaveRules), absenceTypes: Number(absTypes),
    compliance: Number(compRules),
  }

  const groups = visibleAdminGroups(role)

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)',
        marginBottom: 4 }}>
          Administration
        </div>
        <PageTitle style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.015em', color: 'var(--ink-1)',
        marginTop: 0,
        marginRight: 0,
        marginLeft: 0,
        marginBottom: 6, lineHeight: 1.2 }}>
          {isSuperAdmin ? 'System & HR Configuration' : 'HR Configuration'}
        </PageTitle>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
          {isSuperAdmin
            ? 'Everything HR-operational, plus platform-level controls available only to Super Admins.'
            : 'HR-operational configuration grouped by intent. Platform, AI, and system-wide controls are managed by Super Admins.'}
        </p>
      </div>

      {/* Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {groups.map(group => {
          const Icon = group.icon
          return (
            <section key={group.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: group.tint, color: "var(--on-accent)", display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon size={16} strokeWidth={1.8} aria-hidden />
                </div>
                <div>
                  <SectionTitle style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{group.titleEn}</SectionTitle>
                  <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '1px 0 0' }}>{group.descEn}</p>
                </div>
              </div>

              <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {group.cards.map(card => {
                  const soon = card.badge === 'SOON'
                  const cnt = card.countKey ? counts[card.countKey] : undefined
                  const inner = (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: soon ? 'var(--ink-3)' : 'var(--ink-1)' }}>{card.titleEn}</span>
                        {typeof cnt === 'number' && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--brand-active)', background: 'var(--accent-050)', border: '1px solid var(--accent-200)', borderRadius: 999, padding: '1px 8px', flexShrink: 0 }}>
                            {cnt}
                          </span>
                        )}
                        {soon && (
                          <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-4)', border: '1px solid var(--border)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>
                            SOON
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', margin: '4px 0 0', lineHeight: 1.4 }}>{card.descEn}</p>
                      {!soon && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3,
                        marginTop: 10, fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--brand-active)' }}>
                          Open <ChevronRight size={13} strokeWidth={2} aria-hidden />
                        </div>
                      )}
                    </>
                  )
                  const base: React.CSSProperties = {
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
                    padding: '14px 16px', display: 'flex', flexDirection: 'column', minHeight: 96, textDecoration: 'none',
                  }
                  return soon ? (
                    <div key={card.id} style={{ ...base, opacity: 0.55 }}>{inner}</div>
                  ) : (
                    <Link key={card.id} href={card.route} style={base}>{inner}</Link>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
