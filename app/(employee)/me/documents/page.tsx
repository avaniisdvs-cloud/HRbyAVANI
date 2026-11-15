/**
 * /me/documents — My Documents (Employee Self-Service)
 *
 * Enterprise document management hub:
 *  • Grouped by category (IDENTITY, EMPLOYMENT, PAYROLL, etc.)
 *  • Employee self-upload for permitted document types
 *  • Analytics sidebar with compliance status, expiry tracking
 *  • Audit-grade download tracking
 *
 * Authorization: EMPLOYEE (self only). Resolved via the same three-layer
 * personId chain used across all ESS pages.
 */
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { persons, personContacts, userAccounts } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import {
  getEmployeeDocuments,
  computeDocumentAnalytics,
} from '@/lib/documents/get-employee-documents'
import { CATEGORY_META } from '@/lib/documents/document-types'
import { getStorageUIState } from '@/lib/storage'
import { DocumentsPageClient } from './DocumentsClient'

export const metadata = { title: 'My Documents · Self Service' }

export default async function MyDocumentsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  // ── Three-layer personId resolution ──────────────────────────────────────
  let resolvedPersonId: string | null =
    (session.user as { personId?: string }).personId ?? null

  if (!resolvedPersonId && session.user.email) {
    const [c] = await db
      .select({ personId: personContacts.personId })
      .from(personContacts)
      .where(and(
        eq(personContacts.contactType, 'WORK_EMAIL'),
        eq(personContacts.contactValue, session.user.email),
      ))
      .limit(1)
      .catch(() => [] as Array<{ personId: string }>)
    resolvedPersonId = c?.personId ?? null
  }

  if (!resolvedPersonId && session.user.email) {
    const [u] = await db
      .select({ personId: userAccounts.personId })
      .from(userAccounts)
      .where(eq(userAccounts.primaryEmail, session.user.email.toLowerCase()))
      .limit(1)
      .catch(() => [] as Array<{ personId: string | null }>)
    resolvedPersonId = u?.personId ?? null
  }

  const [person] = resolvedPersonId
    ? await db
        .select({
          id:           persons.id,
          fullNameEn:   persons.fullNameEn,
          personNumber: persons.personNumber,
        })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, resolvedPersonId)))
        .limit(1)
        .catch(() => [])
    : []

  const documents = person
    ? await getEmployeeDocuments(person.id, /* employeeView */ true)
    : []

  const analytics = computeDocumentAnalytics(documents)

  return (
    <DocumentsPageClient
      personId={person?.id ?? null}
      personNumber={person?.personNumber ?? null}
      personNameEn={person?.fullNameEn ?? null}
      documents={documents}
      analytics={analytics}
      categoryMeta={CATEGORY_META}
      storageStatus={getStorageUIState()}
    />
  )
}
