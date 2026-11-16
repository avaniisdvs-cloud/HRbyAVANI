import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import type { AriaSessionContext } from '@/modules/aria'
import { getEmployeeAriaContext } from '@/modules/aria'
import { getLocale } from '@/lib/locale-server'
import { db } from '@/lib/db'
import { legalEntities } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import EmployeeAriaPageClient from './EmployeeAriaPageClient'

export const metadata = { title: 'ARIA Assistant · مساعد ARIA' }

/**
 * S11-03 — ARIA chat page for Employee Self-Service shell.
 * Available to EMPLOYEE, MANAGER, and any role in the employee layout.
 * Session context resolved server-side; passed to client component.
 */
export default async function AriaEmployeePage() {
  const locale = await getLocale()
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  if (!session.user.personId) {
    return (
      <div className="page-in" style={{
        width: '100%', padding: 'calc(24px * var(--density))', boxSizing: 'border-box',
      }}>
        <PageTitle style={{
          fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500,
          letterSpacing: '-0.5px', color: 'var(--ink-1)', margin: '0 0 8px',
        }}>
          {locale === 'ar' ? 'مساعد ARIA' : 'ARIA Assistant'}
        </PageTitle>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', margin: 0 }}>
          {locale === 'ar'
            ? 'حسابك غير مرتبط بسجل شخص. تواصل مع الموارد البشرية لتفعيل ARIA.'
            : 'Your account is not linked to a person record. Contact HR to activate ARIA.'}
        </p>
      </div>
    )
  }

  const legalEntityId = session.user.legalEntityId ?? ''
  let legalEntityName = 'your organisation'
  if (legalEntityId) {
    try {
      const [entity] = await db
        .select({ nameEn: legalEntities.nameEn })
        .from(legalEntities)
        .where(eq(legalEntities.id, legalEntityId))
        .limit(1)
      if (entity?.nameEn) legalEntityName = entity.nameEn
    } catch { /* leave default */ }
  }

  const userName = session.user.name ?? session.user.email?.split('@')[0] ?? ''

  const sessionCtx: AriaSessionContext = {
    personId:        session.user.personId,
    role:            session.user.role,
    legalEntityId,
    legalEntityName,
    language:        locale === 'ar' ? 'ar' : 'en',
    userName,
  }

  const ariaContext = await getEmployeeAriaContext(session.user.personId)

  return (
    <div className="page-in" style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      width: '100%', boxSizing: 'border-box',
    }}>
      <div style={{ marginBottom: 20, padding: 'calc(24px * var(--density)) calc(24px * var(--density)) 0', flexShrink: 0 }}>
        <PageTitle style={{
          fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 500,
          letterSpacing: '-0.5px', color: 'var(--ink-1)', margin: 0,
        }}>
          {locale === 'ar' ? 'مساعد ARIA' : 'ARIA Assistant'}
        </PageTitle>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '4px 0 0' }}>
          {locale === 'ar'
            ? 'اسأل عن رصيد إجازتك، مديرك، أو حالة طلبات الإجازة.'
            : 'Ask about your leave balance, manager, or leave request status.'}
        </p>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <EmployeeAriaPageClient
          sessionCtx={sessionCtx}
          ariaContext={ariaContext}
          userName={userName}
          locale={locale === 'ar' ? 'ar' : 'en'}
        />
      </div>
    </div>
  )
}
