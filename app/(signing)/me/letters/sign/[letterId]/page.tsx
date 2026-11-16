import { SectionTitle } from '@/components/ui/typography'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { employeeLetters, persons, personContacts, userAccounts, legalEntities, letterTemplateTypes } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { SigningFormClient } from './SigningFormClient'

export const metadata = { title: 'Document Acknowledgement · Self Service' }

interface Props {
  params: Promise<{ letterId: string }>
}

export default async function EssSigningPage({ params }: Props) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const { letterId } = await params

  // personId is embedded in the JWT by auth.ts (from userAccounts.personId).
  // Fall back to work-email lookup for SSO accounts that joined before the JWT was updated.
  let personId: string | null = (session.user as { personId?: string }).personId ?? null

  // Fallback 2: look up via person_contacts.WORK_EMAIL
  if (!personId && session.user.email) {
    const [contactRow] = await db
      .select({ personId: personContacts.personId })
      .from(personContacts)
      .where(
        and(
          eq(personContacts.contactType, 'WORK_EMAIL'),
          eq(personContacts.contactValue, session.user.email),
        ),
      )
      .limit(1)
      .catch(() => [])
    personId = contactRow?.personId ?? null
  }

  // Fallback 3: look up via user_accounts.primary_email (handles SSO/Entra ID where
  // person_contacts may not yet have a WORK_EMAIL row, and an old JWT has no personId)
  if (!personId && session.user.email) {
    const [uaRow] = await db
      .select({ personId: userAccounts.personId })
      .from(userAccounts)
      .where(eq(userAccounts.primaryEmail, session.user.email.toLowerCase()))
      .limit(1)
      .catch(() => [])
    personId = uaRow?.personId ?? null
  }

  if (!personId) {
    return <ErrorPage message="Your employee profile could not be found. Please contact HR." />
  }

  const [letter] = await db
    .select()
    .from(employeeLetters)
    .where(
      and(
        eq(employeeLetters.tenantId, TENANT_ID),
        eq(employeeLetters.id, letterId),
        eq(employeeLetters.personId, personId),
      ),
    )
    .limit(1)
    .catch(() => [])

  if (!letter) {
    return <ErrorPage message="This document could not be found or does not belong to your account." />
  }

  if (letter.status === 'SIGNED') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
        <div style={{
          maxWidth: 480, width: '100%', textAlign: 'center', padding: '40px 32px',
          background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <SectionTitle style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
            Document Already Signed
          </SectionTitle>
          <p style={{ margin: '0 0 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
            {letter.letterNumber} was signed by {letter.signedByName} on{' '}
            {letter.signedAt ? new Date(letter.signedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}.
          </p>
          <a href="/me/letters" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 20px', borderRadius: 7,
            background: 'var(--accent)', color: "var(--on-accent)",
            fontSize: 'var(--text-body)', fontWeight: 600, textDecoration: 'none',
          }}>
            View My Documents
          </a>
        </div>
      </div>
    )
  }

  if (letter.signingTokenExpiresAt && new Date() > new Date(letter.signingTokenExpiresAt)) {
    return <ErrorPage message="This signing link has expired. Please contact HR to resend it." />
  }

  if (!letter.signingToken) {
    return <ErrorPage message="No active signing request found. Please ask HR to send a new signature request." />
  }

  // Fetch person name + entity branding for the preview
  const [person] = await db
    .select({ fullNameEn: persons.fullNameEn })
    .from(persons)
    .where(eq(persons.id, personId))
    .limit(1)

  const [entity] = await db
    .select()
    .from(legalEntities)
    .where(eq(legalEntities.id, letter.legalEntityId))
    .limit(1)

  const [typeRow] = await db
    .select({ nameEn: letterTemplateTypes.nameEn })
    .from(letterTemplateTypes)
    .where(eq(letterTemplateTypes.typeCode, letter.typeCode))
    .limit(1)

  // Determine where "Back" should go based on role
  const role     = (session.user as { role?: string }).role ?? 'EMPLOYEE'
  const backHref = role === 'EMPLOYEE' ? '/me/letters' : '/dashboard'

  return (
    <SigningFormClient
      token={letter.signingToken}
      letterNumber={letter.letterNumber}
      letterTypeName={typeRow?.nameEn ?? letter.typeCode}
      resolvedBodyEn={letter.resolvedBodyEn ?? ''}
      letterDate={letter.effectiveDate
        ? new Date(letter.effectiveDate).toLocaleDateString('en-GB')
        : new Date().toLocaleDateString('en-GB')}
      companyNameEn={entity?.nameEn ?? ''}
      primaryLogoUrl={(entity?.letterLogoChoice === 'secondary' ? entity?.secondaryLogoUrl : entity?.primaryLogoUrl) ?? null}
      signatoryName={entity?.signatoryName ?? null}
      signatoryTitle={entity?.signatoryTitle ?? null}
      employeeFullName={person?.fullNameEn ?? session.user.name ?? ''}
      backHref={backHref}
    />
  )
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div style={{
        maxWidth: 480, width: '100%', textAlign: 'center', padding: '40px 32px',
        background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <SectionTitle style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
          Unable to Open Document
        </SectionTitle>
        <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>{message}</p>
      </div>
    </div>
  )
}
