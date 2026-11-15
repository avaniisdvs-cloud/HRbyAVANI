import { redirect }     from 'next/navigation'
import { auth }         from '@/lib/auth'
import { db }           from '@/lib/db'
import { and, eq, asc } from 'drizzle-orm'
import { payrollDefinitions, legalEntities } from '@/drizzle/schema'
import { TENANT_ID }    from '@/lib/constants'
import { NewPayrollRunForm } from './_NewPayrollRunForm'

export const metadata = { title: 'New Payroll Run · AVANIIS' }

export default async function NewPayrollRunPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const defs = await db
    .select({
      id:           payrollDefinitions.id,
      payrollCode:  payrollDefinitions.payrollCode,
      payrollNameEn: payrollDefinitions.payrollNameEn,
      currency:     payrollDefinitions.currency,
    })
    .from(payrollDefinitions)
    .where(and(
      eq(payrollDefinitions.tenantId, TENANT_ID),
      eq(payrollDefinitions.legalEntityId, session.user.legalEntityId),
      eq(payrollDefinitions.isActive, true),
    ))
    .orderBy(asc(payrollDefinitions.payrollCode))

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <nav className="text-xs text-[var(--ink-3)]">
          <a href="/payroll" className="hover:text-[var(--accent)]">Payroll</a>
          {' / '}
          <a href="/payroll/runs" className="hover:text-[var(--accent)]">Runs</a>
          {' / '}New
        </nav>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-serif)' }}>
          New Payroll Run
        </h1>
      </div>

      <NewPayrollRunForm
        definitions={defs}
        legalEntityId={session.user.legalEntityId}
      />
    </div>
  )
}
