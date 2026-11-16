import { PageTitle, SectionTitle } from '@/components/ui/typography'
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getLeaveRuleSets } from '@/modules/config'
import { db } from '@/lib/db'
import { eq, asc } from 'drizzle-orm'
import { leaveRuleLines } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { resolveLocale } from '@/lib/language-preference'

export const metadata = { title: 'Leave rules' }

/**
 * S10-06 — Leave rule sets viewer (Server Component).
 *
 * Lists all leave_rule_sets with their line counts, scope, and effective
 * dates. Selecting a rule set shows its leave rule lines with entitlement
 * tiers. The saveLeaveRuleSet action (already implemented) is linked from
 * here via the absence settings route.
 */
export default async function LeaveRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ ruleSetId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings')

  // Only editors (HR_DIRECTOR / SUPER_ADMIN) may open the editor at /absence/rules.
  // HR_ADMIN gets the read-only viewer with no "Edit rules" button, so they are
  // never bounced by the stricter editor guard.
  const canEdit = ['HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)

  const locale = await resolveLocale(session.user.personId)

  const sp = searchParams ? await searchParams : {} as { ruleSetId?: string }
  const ruleSets = await getLeaveRuleSets()

  const activeId = sp.ruleSetId ?? ruleSets.find(r => r.isDefault)?.id ?? ruleSets[0]?.id

  // Load lines for the active rule set
  let lines: {
    id: string; absenceTypeCode: string; maxCarryForwardDays: string;
    accrualFrequency: string; isProRated: boolean; maxDaysPerYear: string | null;
    encashmentAllowed: boolean; isActive: boolean;
    entitlementTiersJson: unknown;
  }[] = []

  if (activeId) {
    lines = await db
      .select({
        id:                   leaveRuleLines.id,
        absenceTypeCode:      leaveRuleLines.absenceTypeCode,
        maxCarryForwardDays:  leaveRuleLines.maxCarryForwardDays,
        accrualFrequency:     leaveRuleLines.accrualFrequency,
        isProRated:           leaveRuleLines.isProRated,
        maxDaysPerYear:       leaveRuleLines.maxDaysPerYear,
        encashmentAllowed:    leaveRuleLines.encashmentAllowed,
        isActive:             leaveRuleLines.isActive,
        entitlementTiersJson: leaveRuleLines.entitlementTiersJson,
      })
      .from(leaveRuleLines)
      .where(eq(leaveRuleLines.leaveRuleSetId, activeId))
      .orderBy(asc(leaveRuleLines.absenceTypeCode))
  }

  const activeSet = ruleSets.find(r => r.id === activeId)

  return (
    <div className="page-in">
      <div className="flex items-start justify-between">
        <div>
          <PageTitle className="font-serif text-2xl text-ink-1">{locale === 'ar' ? 'قواعد الإجازات' : 'Leave rules'}</PageTitle>
          <p className="mt-1 text-sm text-ink-3">
            {locale === 'ar'
              ? 'تحدّد مجموعات قواعد الإجازات شرائح الاستحقاق، وحدود الترحيل، وتكرار الاستحقاق.'
              : 'Leave rule sets define entitlement tiers, carry-forward caps, and accrual frequencies.'}
          </p>
        </div>
        {canEdit && (
          <Link href="/absence/rules">
            <Button size="sm" variant="outline">{locale === 'ar' ? 'تعديل القواعد' : 'Edit rules'}</Button>
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Rule set list */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <header className="border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3">
              {locale === 'ar' ? 'مجموعات القواعد' : 'Rule sets'}
            </header>
            <ul className="divide-y divide-border">
              {ruleSets.map(rs => (
                <li key={rs.id}>
                  <Link
                    href={`/settings/leave-rules?ruleSetId=${rs.id}`}
                    className={`flex items-start justify-between px-4 py-3 text-sm transition-colors hover:bg-surface ${
                      rs.id === activeId ? 'bg-accent-100/60 text-accent' : 'text-ink-2'
                    }`}
                  >
                    <div>
                      <p className="font-medium">{rs.ruleSetCode}</p>
                      <p className="text-xs text-ink-3">{rs.ruleSetNameEn}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="text-xs">{locale === 'ar' ? `${rs.lineCount} أنواع` : `${rs.lineCount} types`}</Badge>
                      {rs.isDefault && <Badge variant="secondary" className="text-xs">DEFAULT</Badge>}
                    </div>
                  </Link>
                </li>
              ))}
              {ruleSets.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-ink-3">{locale === 'ar' ? 'لا توجد مجموعات قواعد بعد.' : 'No rule sets yet.'}</li>
              )}
            </ul>
        </div>

        {/* Rule lines detail */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <SectionTitle className="font-sans text-sm font-semibold text-ink-1">
                  {activeSet?.ruleSetNameEn ?? (locale === 'ar' ? 'اختر مجموعة قواعد' : 'Select a rule set')}
                </SectionTitle>
                {activeSet && (
                  <p className="text-xs text-ink-3">
                    {activeSet.nationalityScope} · {activeSet.employmentTypeScope} ·
                    {locale === 'ar' ? ' ساري اعتباراً من ' : ' Effective '}<span className="font-mono">{activeSet.effectiveFrom}</span>
                  </p>
                )}
              </div>
            </header>
            {lines.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-3">
                {locale === 'ar' ? 'لا توجد بنود قواعد لمجموعة القواعد هذه.' : 'No rule lines for this rule set.'}
              </p>
            ) : (
              <TableScrollRegion><table className="w-full text-sm">
                <thead className="border-b border-border bg-surface text-xs uppercase text-ink-3">
                  <tr>
                    <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'نوع الإجازة' : 'Leave type'}</th>
                    <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'الاستحقاق' : 'Accrual'}</th>
                    <th className="px-5 py-2.5 text-end font-medium">{locale === 'ar' ? 'الترحيل' : 'Carry fwd'}</th>
                    <th className="px-5 py-2.5 text-end font-medium">{locale === 'ar' ? 'الحد الأقصى/سنة' : 'Max/yr'}</th>
                    <th className="px-5 py-2.5 text-start font-medium">{locale === 'ar' ? 'العلامات' : 'Flags'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map(l => (
                    <tr key={l.id} className={l.isActive ? '' : 'opacity-40'}>
                      <td className="px-5 py-3 font-mono text-xs font-medium">{l.absenceTypeCode}</td>
                      <td className="px-5 py-3">
                        <Badge variant="outline" className="text-xs">{l.accrualFrequency}</Badge>
                        {l.isProRated && <span className="ms-1 text-xs text-ink-3">{locale === 'ar' ? 'تناسبي' : 'pro-rata'}</span>}
                      </td>
                      <td className="px-5 py-3 text-end font-mono text-xs">{l.maxCarryForwardDays}</td>
                      <td className="px-5 py-3 text-end font-mono text-xs">{l.maxDaysPerYear ?? '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          {l.encashmentAllowed && <Badge variant="outline" className="text-xs">ENCASHABLE</Badge>}
                          {!l.isActive         && <Badge variant="secondary" className="text-xs">INACTIVE</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></TableScrollRegion>
            )}
        </div>
      </div>
    </div>
  )
}
