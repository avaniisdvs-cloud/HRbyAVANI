import { PageTitle, SectionTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { eq, asc } from 'drizzle-orm'
import { complianceRules } from '@/drizzle/schema'
import { Badge } from '@/components/ui/badge'
import { TENANT_ID } from '@/lib/constants'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'Compliance rules · AVANIIS HR' }

/**
 * S10-02 — Compliance rules viewer (Server Component, read-only for HR_DIRECTOR;
 * overridable rules editable by SUPER_ADMIN via updateComplianceRule action).
 *
 * UAE Labour Law rules are displayed grouped by module. Non-overridable rows
 * are system constants; overridable rows show a GOVERNANCE_LOCK warning
 * reminding that edits go through the compliance governance Server Action.
 */
export default async function ComplianceRulesPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  const locale = await resolveLocale(session.user.personId)

  const rules = await db
    .select({
      id:            complianceRules.id,
      ruleId:        complianceRules.ruleId,
      module:        complianceRules.module,
      entityTypes:   complianceRules.entityTypes,
      articleRef:    complianceRules.articleRef,
      ruleType:      complianceRules.ruleType,
      descriptionEn: complianceRules.descriptionEn,
      descriptionAr: complianceRules.descriptionAr,
      effectiveDate: complianceRules.effectiveDate,
      sunsetDate:    complianceRules.sunsetDate,
      isActive:      complianceRules.isActive,
      isOverridable: complianceRules.isOverridable,
      priority:      complianceRules.priority,
    })
    .from(complianceRules)
    .where(eq(complianceRules.tenantId, TENANT_ID))
    .orderBy(asc(complianceRules.module), asc(complianceRules.ruleId))

  const grouped = rules.reduce<Record<string, typeof rules>>((acc, r) => {
    acc[r.module] ??= []
    acc[r.module].push(r)
    return acc
  }, {})

  const ruleTypeTone: Record<string, string> = {
    CALCULATION:  'text-accent',
    VALIDATION:   'text-ink-2',
    ALERT:        'text-accent-700',
    ROUTING:      'text-ink-3',
  }

  return (
    <div className="page-in">
      <div>
        <PageTitle className="font-serif text-2xl text-ink-1">{locale === 'ar' ? 'قواعد الامتثال' : 'Compliance rules'}</PageTitle>
        <p className="mt-1 text-sm text-ink-3">
          UAE Labour Law compliance rules (FDL 33/2021 + 2024 amendments).
          Non-overridable rules are immutable system constants.
        </p>
      </div>

      {Object.entries(grouped).map(([module, rows]) => (
        <div key={module} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <SectionTitle className="font-sans text-sm font-semibold text-ink-1">{module}</SectionTitle>
              <Badge variant="outline" className="text-xs">{rows.length} rules</Badge>
            </header>
            <div className="divide-y divide-border">
              {rows.map(r => (
                <div key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{r.ruleId}</Badge>
                    <Badge variant="outline" className={`text-xs ${ruleTypeTone[r.ruleType] ?? 'text-ink-3'}`}>
                      {r.ruleType}
                    </Badge>
                    {(r.entityTypes ?? []).map(et => (
                      <Badge key={et} variant="secondary" className="text-xs">{et}</Badge>
                    ))}
                    {!r.isActive && (
                      <Badge variant="destructive" className="text-xs">INACTIVE</Badge>
                    )}
                    {r.isOverridable
                      ? <Badge variant="outline" className="text-xs text-accent">OVERRIDABLE</Badge>
                      : <Badge variant="secondary" className="text-xs">SYSTEM_LOCK</Badge>}
                  </div>
                  <p className="mt-2 text-sm text-ink-2">{r.descriptionEn}</p>
                  {r.descriptionAr && (
                    <p className="mt-0.5 text-xs text-ink-3" dir="rtl" lang="ar">{r.descriptionAr}</p>
                  )}
                  <p className="mt-1.5 font-mono text-xs text-ink-3">{r.articleRef}</p>
                  <div className="mt-1 flex gap-4 text-xs text-ink-3">
                    <span>Effective: <span className="font-mono">{r.effectiveDate}</span></span>
                    {r.sunsetDate && <span>Sunset: <span className="font-mono">{r.sunsetDate}</span></span>}
                  </div>
                </div>
              ))}
            </div>
        </div>
      ))}

      {Object.keys(grouped).length === 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div className="px-5 py-8 text-center text-sm text-ink-3">
            No compliance rules seeded yet — run <code className="font-mono">pnpm tsx drizzle/seed.ts</code>.
          </div>
        </div>
      )}
    </div>
  )
}
