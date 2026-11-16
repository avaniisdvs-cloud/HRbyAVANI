import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { personDependents } from '@/drizzle/schema'
import { getPerson } from '@/modules/core-hr'
import { getPersonEnrolments } from '@/modules/insurance'
import { TENANT_ID } from '@/lib/constants'
import { MyInsuranceClient } from './MyInsuranceClient'

export const metadata = { title: 'My Insurance · AVANIIS' }

export default async function MyInsurancePage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const personId = session.user.personId
  if (!personId) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
          Your sign-in is not linked to a person record yet. Please contact HR Admin.
        </p>
      </div>
    )
  }

  const person = await getPerson(personId)
  if (!person) redirect('/me')

  const [enrolments, dependents] = await Promise.all([
    getPersonEnrolments(personId),
    db
      .select()
      .from(personDependents)
      .where(and(
        eq(personDependents.tenantId, TENANT_ID),
        eq(personDependents.personId, personId),
      )),
  ])

  return (
    <MyInsuranceClient
      person={{
        fullNameEn:            person.fullNameEn ?? person.personNumber,
        insuranceStatus:       person.insuranceStatus ?? 'NOT_ENROLLED',
        insuranceCardNumber:   person.insuranceCardNumber,
        insuranceMemberId:     person.insuranceMemberId,
        insuranceProviderName: person.insuranceProviderName,
        insuranceNetwork:      person.insuranceNetwork,
        insuranceCategory:     person.insuranceCategory,
        insuranceEffectiveDate: person.insuranceEffectiveDate,
        insuranceExpiryDate:   person.insuranceExpiryDate,
        annualPremiumAed:      person.annualPremiumAed?.toString(),
        employeePremiumAed:    person.employeePremiumAed?.toString(),
        dependentCountInsured: person.dependentCountInsured,
      }}
      enrolments={enrolments ?? []}
      dependents={dependents}
    />
  )
}
