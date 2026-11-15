import { redirect } from 'next/navigation'
import { auth, roleHome } from '@/lib/auth'
import {
  listApprovalDelegations,
  getDelegateCandidates,
} from '@/modules/config'
import { resolveLocale } from '@/lib/language-preference'
import { Badge } from '@/components/ui/badge'
import { DelegationCreateForm } from './DelegationCreateForm'
import { DelegationDeactivateButton } from './DelegationDeactivateButton'

export const metadata = { title: 'Approval delegations · AVANIIS HR' }

const APPROVER_ROLES = ['LINE_MANAGER', 'HOD', 'HR_DIRECTOR', 'HR_ADMIN', 'CEO', 'SUPER_ADMIN']

/**
 * S9-04 — Approval delegations management.
 *
 * Lists active + historical delegations involving the current user
 * (outgoing OR incoming), with a form to create a new delegation and
 * a soft-deactivate button per row (Hard Rule 2: never delete).
 *
 * HR_ADMIN / SUPER_ADMIN see all delegations in their entity.
 */
export default async function DelegationsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!APPROVER_ROLES.includes(session.user.role)) redirect(roleHome(session.user.role))

  const locale = await resolveLocale(session.user.personId)

  const [rows, candidates] = await Promise.all([
    listApprovalDelegations(),
    getDelegateCandidates(session.user.legalEntityId),
  ])

  // Caller can't delegate to themselves; filter out their own row.
  const filteredCandidates = candidates.filter(p => p.id !== session.user.personId)

  const today = new Date().toISOString().slice(0, 10)
  const isCurrentlyEffective = (r: { isActive: boolean; delegationFrom: string; delegationTo: string }) =>
    r.isActive && r.delegationFrom <= today && r.delegationTo >= today

  return (
    <div className="page-in">
      <div>
        <h1 className="font-serif text-2xl text-ink-1">
          {locale === 'ar' ? 'تفويض الموافقات' : 'Approval delegations'}
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          {locale === 'ar' ? (
            <>سلّم موافقاتك إلى زميل خلال نافذة زمنية — عادةً أثناء غيابك. للتفويض لمرة واحدة على معاملة بعينها، استخدم زر <span className="font-medium">التفويض</span> على سير العمل نفسه.</>
          ) : (
            <>Hand off your approvals to a colleague for a date window — typically while you&apos;re away.
          For per-instance one-shot delegation, use the <span className="font-medium">Delegate</span> button on a workflow itself.</>
          )}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }} className="text-base">
              {locale === 'ar' ? 'تفويض جديد' : 'New delegation'}
            </h3>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {session.user.personId ? (
              <DelegationCreateForm delegateCandidates={filteredCandidates} locale={locale} />
            ) : (
              <p className="text-sm text-ink-3">
                {locale === 'ar'
                  ? 'حسابك غير مرتبط بسجل شخص. تواصل مع الموارد البشرية لتفعيل التفويض.'
                  : 'Your account isn’t linked to a person record. Contact HR to enable delegation.'}
              </p>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }} className="text-base">
              {locale === 'ar' ? 'التفويضات الحالية' : 'Existing delegations'} ({rows.length})
            </h3>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {rows.length === 0 ? (
              <p className="text-sm text-ink-3">
                {locale === 'ar' ? 'لا توجد تفويضات بعد.' : 'No delegations yet.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {rows.map(r => {
                  const effective = isCurrentlyEffective(r)
                  return (
                    <li
                      key={r.id}
                      className={`rounded-md border p-3 ${
                        effective
                          ? 'border-accent bg-accent-050'
                          : !r.isActive
                            ? 'border-border bg-surface opacity-70'
                            : 'border-border bg-card'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              {r.direction === 'OUTGOING'
                                ? (locale === 'ar' ? 'أنت تفوّض' : 'You delegate')
                                : (locale === 'ar' ? 'مُفوَّض إليك' : 'Delegated to you')}
                            </Badge>
                            {effective && <Badge>{locale === 'ar' ? 'ساري الآن' : 'Active now'}</Badge>}
                            {!r.isActive && <Badge variant="outline">{locale === 'ar' ? 'مُلغى' : 'Deactivated'}</Badge>}
                          </div>
                          <div className="text-sm text-ink-1">
                            {r.direction === 'OUTGOING' ? (
                              <>
                                <span className="text-ink-3">→</span>{' '}
                                <span className="font-medium" dir={locale === 'ar' ? 'rtl' : undefined}>
                                  {(locale === 'ar' ? r.delegateNameAr : r.delegateNameEn) ?? r.delegateNameEn ?? r.delegateNameAr ?? '—'}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-ink-3">←</span>{' '}
                                <span className="font-medium" dir={locale === 'ar' ? 'rtl' : undefined}>
                                  {(locale === 'ar' ? r.delegatorNameAr : r.delegatorNameEn) ?? r.delegatorNameEn ?? r.delegatorNameAr ?? '—'}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="font-mono text-xs text-ink-3">
                            {r.delegationFrom} → {r.delegationTo}
                          </div>
                          <div className="text-xs text-ink-3">
                            {locale === 'ar' ? 'النطاق' : 'Scope'}:{' '}
                            {r.scopeTypes && r.scopeTypes.length > 0
                              ? r.scopeTypes.join(', ')
                              : (locale === 'ar' ? 'جميع المعاملات' : 'All transactions')}
                          </div>
                          {r.reason && (
                            <p className="text-xs italic text-ink-2">&ldquo;{r.reason}&rdquo;</p>
                          )}
                        </div>
                        {r.isActive && r.direction === 'OUTGOING' && (
                          <DelegationDeactivateButton id={r.id} locale={locale} />
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
