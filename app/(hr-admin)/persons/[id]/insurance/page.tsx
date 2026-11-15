import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getPerson } from '@/modules/core-hr'
import {
  getPersonEnrolments,
  getInsurancePlans,
  getInsurancePolicySettings,
} from '@/modules/insurance'
import { db } from '@/lib/db'
import { and, eq } from 'drizzle-orm'
import { personDependents } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { resolveLocale } from '@/lib/language-preference'
import { InsuranceTabClient } from './InsuranceTabClient'

export const metadata = { title: 'Insurance · AVANIIS HR' }

export default async function PersonInsurancePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const { id } = await params

  const allowed = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowed.includes(session.user.role)) redirect(`/persons/${id}`)

  const person = await getPerson(id)
  if (!person) notFound()

  const locale = await resolveLocale(session.user.personId)

  const [enrolments, plans, policy, dependents] = await Promise.all([
    getPersonEnrolments(id),
    getInsurancePlans(person.legalEntityId),
    getInsurancePolicySettings(person.legalEntityId),
    db
      .select()
      .from(personDependents)
      .where(and(
        eq(personDependents.tenantId, TENANT_ID),
        eq(personDependents.personId, id),
      )),
  ])

  return (
    <InsuranceTabClient
      person={{
        id:              person.id,
        fullNameEn:      person.fullNameEn ?? person.personNumber,
        legalEntityId:   person.legalEntityId,
        employmentType:  person.employmentType,
        insuranceStatus: person.insuranceStatus ?? 'NOT_ENROLLED',
        insuranceCardNumber:   person.insuranceCardNumber,
        insuranceMemberId:     person.insuranceMemberId,
        insuranceProviderName: person.insuranceProviderName,
        insuranceNetwork:      person.insuranceNetwork,
        insuranceCategory:     person.insuranceCategory,
        insuranceEffectiveDate: person.insuranceEffectiveDate,
        insuranceExpiryDate:    person.insuranceExpiryDate,
        annualPremiumAed:      person.annualPremiumAed?.toString(),
        employerPremiumAed:    person.employerPremiumAed?.toString(),
        employeePremiumAed:    person.employeePremiumAed?.toString(),
        dependentCountInsured: person.dependentCountInsured,
      }}
      enrolments={enrolments ?? []}
      plans={plans ?? []}
      policy={policy}
      dependents={dependents}
      locale={locale}
    />
  )
}
