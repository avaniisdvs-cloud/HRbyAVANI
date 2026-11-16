import { PageTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getBankDetails } from '@/modules/core-hr'
import { BankDetailsForm } from './BankDetailsForm'

export const metadata = { title: 'My Bank Details' }

export default async function MyBankDetailsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!session.user.personId) redirect('/me')

  const existing = await getBankDetails(session.user.personId)

  return (
    <div className="page-in" style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <PageTitle
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--ink-1)',
            margin: 0,
          }}
        >
          My Bank Details
        </PageTitle>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '6px 0 0' }}>
          Salary is paid to the bank account below. Changes require HR approval
          if a Salary Transfer Letter was issued in the past 30 days.
        </p>
      </div>

      <BankDetailsForm existing={existing} />
    </div>
  )
}
