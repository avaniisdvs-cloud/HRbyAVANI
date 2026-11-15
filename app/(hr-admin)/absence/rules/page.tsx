import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { redirect } from 'next/navigation'
import { and, eq, asc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { leaveRuleSets, leaveRuleLines, legalEntities } from '@/drizzle/schema'
import { Badge } from '@/components/ui/badge'
import { TENANT_ID } from '@/lib/constants'
import { resolveLocale } from '@/lib/language-preference'
import { LeaveRulesEditor } from './LeaveRulesEditor'

export const metadata = { title: 'Leave rule sets' }

/**
 * S5-06 — HR leave-rule admin (HR_DIRECTOR / SUPER_ADMIN).
 *
 * Lists every rule set + its lines, then renders the form for creating
 * a new rule set (or editing an existing one). The form Component calls
 * `saveLeaveRuleSet`, which itself calls `assertLeaveRuleNotBelowMinimum`
 * (Hard Rule 11) before any DB write.
 */
export default async function LeaveRulesPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  // Only HR_DIRECTOR / SUPER_ADMIN may edit leave rules. Others (e.g. HR_ADMIN)
  // are sent to the read-only viewer in the SAME route group — never to /me,
  // which is in the (employee) group and triggers a second cross-group redirect
  // (the "full app refresh / Overview jump").
  const allowed = ['HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect('/settings/leave-rules')

  const sets = await db
    .select()
    .from(leaveRuleSets)
    .where(and(eq(leaveRuleSets.tenantId, TENANT_ID), eq(leaveRuleSets.isActive, true)))
    .orderBy(asc(leaveRuleSets.ruleSetCode))

  const lines = await db
    .select()
    .from(leaveRuleLines)
    .where(and(eq(leaveRuleLines.tenantId, TENANT_ID), eq(leaveRuleLines.isActive, true)))
    .orderBy(asc(leaveRuleLines.absenceTypeCode))

  const entities = await db
    .select({ id: legalEntities.id, code: legalEntities.entityCode, nameEn: legalEntities.nameEn, nameAr: legalEntities.nameAr })
    .from(legalEntities)
    .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
    .orderBy(asc(legalEntities.entityCode))

  const linesBySet = new Map<string, typeof lines>()
  for (const l of lines) {
    if (!linesBySet.has(l.leaveRuleSetId)) linesBySet.set(l.leaveRuleSetId, [])
    linesBySet.get(l.leaveRuleSetId)!.push(l)
  }

  const locale = await resolveLocale(session.user.personId)

  return (
    <div className="page-in">
      <div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.5px', margin: 0 }}>{locale === 'ar' ? 'مجموعات قواعد الإجازات' : 'Leave Rule Sets'}</h1>
        <p className="mt-1 text-sm text-ink-3">
          {locale === 'ar'
            ? 'القاعدة الصارمة 11 — يُتحقَّق من كل بند وفق المرسوم بقانون اتحادي إماراتي رقم 33/2021 المادة 29 (BR-AL-001: الإجازة السنوية ≥ 22 يوماً حداً أدنى) قبل الحفظ.'
            : 'Hard Rule 11 — every line is validated against UAE Federal Decree-Law 33/2021 Article 29 (BR-AL-001: annual leave ≥ 22 days minimum) before save.'}
        </p>
      </div>

      <div style={{ marginTop: 24, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>{locale === 'ar' ? 'مجموعات القواعد النشطة' : 'Active rule sets'} ({sets.length})</h3>
        </div>
        <div style={{ padding: '16px 20px' }} className="space-y-4">
          {sets.length === 0 ? (
            <p className="text-sm text-ink-3">{locale === 'ar' ? 'لا توجد مجموعات قواعد. أنشئ واحدة أدناه.' : 'No rule sets. Create one below.'}</p>
          ) : (
            sets.map(s => {
              const own = linesBySet.get(s.id) ?? []
              return (
                <div key={s.id} className="rounded-md border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-ink-1">
                        {s.ruleSetCode}
                        {s.isDefault && <Badge variant="secondary" className="ms-2 text-xs">{locale === 'ar' ? 'افتراضي' : 'Default'}</Badge>}
                      </div>
                      <div className="text-sm text-ink-2">{s.ruleSetNameEn}</div>
                      {s.ruleSetNameAr && <div className="text-xs text-ink-3" dir="rtl">{s.ruleSetNameAr}</div>}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs text-ink-3">
                      <Badge variant="outline" className="text-xs">
                        {s.nationalityScope} · {s.employmentTypeScope}
                      </Badge>
                      {s.entityTypeScope && (
                        <Badge variant="outline" className="text-xs">{s.entityTypeScope}</Badge>
                      )}
                      <span className="font-mono">
                        {s.effectiveFrom}{s.effectiveTo ? ` → ${s.effectiveTo}` : ' →'}
                      </span>
                    </div>
                  </div>
                  <TableScrollRegion><table className="mt-3 w-full text-xs">
                    <thead className="text-start text-ink-3">
                      <tr>
                        <th className="py-1.5 font-medium">{locale === 'ar' ? 'النوع' : 'Type'}</th>
                        <th className="py-1.5 font-medium">{locale === 'ar' ? 'الشرائح (أشهر ← أيام)' : 'Tiers (months → days)'}</th>
                        <th className="py-1.5 text-end font-medium">{locale === 'ar' ? 'الترحيل' : 'Carry-fwd'}</th>
                        <th className="py-1.5 text-end font-medium">{locale === 'ar' ? 'الحد / سنة' : 'Cap / yr'}</th>
                        <th className="py-1.5 text-end font-medium">{locale === 'ar' ? 'الصرف النقدي' : 'Encash'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {own.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-2 text-ink-3">{locale === 'ar' ? 'لا توجد بنود.' : 'No lines.'}</td>
                        </tr>
                      ) : own.map(l => {
                        const tiers = (l.entitlementTiersJson ?? []) as Array<{ minServiceMonths: number; maxServiceMonths: number | null; daysEntitled: number }>
                        return (
                          <tr key={l.id}>
                            <td className="py-1.5 font-mono">{l.absenceTypeCode}</td>
                            <td className="py-1.5 text-ink-2">
                              {tiers.map((t, i) => (
                                <span key={i} className="me-3">
                                  {t.minServiceMonths}{t.maxServiceMonths === null ? '+' : `–${t.maxServiceMonths}`}
                                  {' '}→{' '}{t.daysEntitled}d
                                </span>
                              ))}
                            </td>
                            <td className="py-1.5 text-end font-mono">{l.maxCarryForwardDays}</td>
                            <td className="py-1.5 text-end font-mono">{l.maxDaysPerYear ?? '—'}</td>
                            <td className="py-1.5 text-end">{l.encashmentAllowed ? (locale === 'ar' ? 'نعم' : 'Yes') : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table></TableScrollRegion>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <LeaveRulesEditor entities={entities} />
      </div>
    </div>
  )
}
