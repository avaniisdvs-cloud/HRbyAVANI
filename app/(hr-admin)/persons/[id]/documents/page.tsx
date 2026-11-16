import { PageTitle } from '@/components/ui/typography'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { persons, personDocuments, employeeLetters, letterTemplateTypes } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { LETTER_TYPE_LABELS } from '@/lib/documents/get-employee-documents'
import { computeDocumentStatus, getDocTypeCategory } from '@/lib/documents/document-types'
import { DocumentsManager } from './DocumentsManager'

export const metadata = { title: 'Documents' }

/**
 * S4-04 + unified documents — Documents page (Server Component shell).
 *
 * Loads both:
 *  1. personDocuments — uploaded identity / HR documents (v2 taxonomy columns)
 *  2. employeeLetters with a PDF — generated & signed letters for this employee
 *
 * Both are passed to DocumentsManager so admin has a single unified view.
 * No files are duplicated: letters stay in employee_letters, docs in person_documents.
 *
 * v2 additions: documentCategory, sourceType, hrOnlyVisibility, employeeCanReplace,
 * createdByName, downloadCount are all selected and passed through. Live expiry status
 * is computed server-side via computeDocumentStatus() — same logic as ESS page.
 */
export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const { id } = await params

  const allowedRoles = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']
  if (!allowedRoles.includes(session.user.role)) redirect(`/persons/${id}`)

  const [person] = await db
    .select({
      id:           persons.id,
      personNumber: persons.personNumber,
      fullNameEn:   persons.fullNameEn,
      fullNameAr:   persons.fullNameAr,
      legalEntityId:persons.legalEntityId,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, id)))
    .limit(1)
  if (!person) notFound()
  if (
    session.user.role !== 'SUPER_ADMIN'
    && session.user.legalEntityId !== person.legalEntityId
  ) redirect(`/persons/${id}`)

  // ── 1. Uploaded person documents (v2 taxonomy columns) ───────────────────
  const rawDocuments = await db
    .select({
      id:                 personDocuments.id,
      documentType:       personDocuments.documentType,
      documentCategory:   personDocuments.documentCategory,
      documentTitle:      personDocuments.documentTitle,
      documentNumber:     personDocuments.documentNumber,
      fileName:           personDocuments.fileName,
      fileSizeBytes:      personDocuments.fileSizeBytes,
      mimeType:           personDocuments.mimeType,
      checksumSha256:     personDocuments.checksumSha256,
      issueDate:          personDocuments.issueDate,
      expiryDate:         personDocuments.expiryDate,
      isMandatory:        personDocuments.isMandatory,
      documentStatus:     personDocuments.documentStatus,
      sourceType:         personDocuments.sourceType,
      hrOnlyVisibility:   personDocuments.hrOnlyVisibility,
      employeeCanReplace: personDocuments.employeeCanReplace,
      createdByName:      personDocuments.createdByName,
      createdDate:        personDocuments.createdDate,
      downloadCount:      personDocuments.downloadCount,
    })
    .from(personDocuments)
    .where(and(
      eq(personDocuments.tenantId, TENANT_ID),
      eq(personDocuments.personId, person.id),
    ))
    .orderBy(asc(personDocuments.documentType))

  // Compute live expiry status + resolve category (same logic as ESS page)
  const documents = rawDocuments.map(d => ({
    ...d,
    // Live status — overrides stale DB value if document has expired since last cron
    documentStatus:    computeDocumentStatus(d.documentStatus ?? 'VALID', d.expiryDate ?? null),
    // Category — use DB value if present (backfilled by migration 0050), else derive from type
    documentCategory:  d.documentCategory ?? getDocTypeCategory(d.documentType),
    createdDate:       d.createdDate?.toISOString() ?? null,
    fileSizeBytes:     Number(d.fileSizeBytes ?? 0),
    downloadCount:     Number(d.downloadCount ?? 0),
    // Nullable boolean columns default to safe values for pre-migration rows
    hrOnlyVisibility:   d.hrOnlyVisibility ?? false,
    employeeCanReplace: d.employeeCanReplace ?? false,
    sourceType:         d.sourceType ?? 'HR',
  }))

  // ── 2. Generated / signed letters ────────────────────────────────────────
  const letterRows = await db
    .select({
      id:           employeeLetters.id,
      typeCode:     employeeLetters.typeCode,
      letterNumber: employeeLetters.letterNumber,
      status:       employeeLetters.status,
      pdfUrl:       employeeLetters.pdfUrl,
      signedPdfUrl: employeeLetters.signedPdfUrl,
      generatedAt:  employeeLetters.generatedAt,
      signedAt:     employeeLetters.signedAt,
      typeNameEn:   letterTemplateTypes.nameEn,
    })
    .from(employeeLetters)
    .leftJoin(
      letterTemplateTypes,
      eq(letterTemplateTypes.typeCode, employeeLetters.typeCode),
    )
    .where(and(
      eq(employeeLetters.tenantId,  TENANT_ID),
      eq(employeeLetters.personId,  person.id),
      isNotNull(employeeLetters.pdfUrl),
    ))
    .orderBy(desc(employeeLetters.generatedAt))

  return (
    <div className="page-in">
      <div className="mb-6">
        <Link href={`/persons/${person.id}`} className="text-sm text-ink-3 hover:text-accent">
          ← Back to profile
        </Link>
        <PageTitle style={{
          fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600,
          color: 'var(--ink-1)', letterSpacing: '-0.5px', margin: 0,
        }}>
          Documents
        </PageTitle>
        <p className="mt-1 text-sm text-ink-3">
          {person.personNumber} · {person.fullNameEn ?? '—'}
          <span className="mx-2 text-ink-3">·</span>
          <span dir="rtl" lang="ar">{person.fullNameAr}</span>
        </p>
      </div>

      <DocumentsManager
        personId={person.id}
        documents={documents}
        letters={letterRows.map(l => ({
          id:           l.id,
          typeCode:     l.typeCode,
          letterNumber: l.letterNumber,
          status:       l.status,
          pdfUrl:       l.signedPdfUrl ?? l.pdfUrl ?? null,
          generatedAt:  l.generatedAt?.toISOString() ?? null,
          signedAt:     l.signedAt?.toISOString() ?? null,
          typeLabelEn:  l.typeNameEn ?? LETTER_TYPE_LABELS[l.typeCode] ?? l.typeCode,
        }))}
      />
    </div>
  )
}
