/**
 * Unified employee document read model.
 *
 * Merges two sources into a single normalised list per employee:
 *  1. person_documents  — identity docs, contracts, certs, etc.
 *     SIGNED_LETTER rows are EXCLUDED to prevent duplication with source 2.
 *  2. employee_letters  — any letter that has a PDF (pdfUrl IS NOT NULL),
 *     joined with letter_template_types for a friendly display name.
 *
 * Authorization is enforced at the CALLER level (server actions / pages).
 * This helper is a pure query — it does not check roles.
 *
 * Download routing for callers:
 *  SIGNED_LETTER → /api/employee-letters/download-my?id={id}          (ESS)
 *               → /api/employee-letters/download?id={id}               (admin)
 *  PERSON_DOCUMENT → getDocumentUrl(id) server action → 15-min SAS URL
 */
import { and, desc, eq, isNotNull, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { personDocuments, employeeLetters, letterTemplateTypes } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import {
  getDocTypeLabel,
  getDocTypeCategory,
  computeDocumentStatus,
  type DocumentCategory,
} from './document-types'

// ── Friendly display labels for letter type codes (fallback when DB name absent) ─
export const LETTER_TYPE_LABELS: Record<string, string> = {
  DCL:  'Designation Letter',
  PCL:  'Probation Confirmation Letter',
  SC:   'Salary Certificate',
  NOC:  'No Objection Certificate',
  EXP:  'Experience Letter',
  WL:   'Warning Letter',
  STL:  'Salary Transfer Letter',
  OL:   'Offer Letter',
  EML:  'Employment Letter',
  PML:  'Promotion Letter',
  SAL:  'Salary Amendment Letter',
  TER:  'Termination Letter',
  LRL:  'Loan Request Letter',
  NDL:  'NOC for Driving License',
  NTV:  'NOC for Travel / Visa',
  CONTRACT:           'Employment Contract',
  EXPERIENCE_LETTER:  'Experience Letter',
  SALARY_CERTIFICATE: 'Salary Certificate',
}

// ── Output shape ──────────────────────────────────────────────────────────────

export interface EmployeeDocumentRow {
  /** UUID — document id (person_documents) or letter id (employee_letters) */
  id:               string
  source:           'PERSON_DOCUMENT' | 'SIGNED_LETTER'
  typeCode:         string
  typeLabelEn:      string
  /** Computed category from document-types registry */
  category:         DocumentCategory
  /** Employee-friendly full title, e.g. "Designation Letter - DCL-2026-0001" */
  title:            string
  documentNumber:   string | null
  issuedDate:       string | null   // ISO date string or null
  expiryDate:       string | null   // ISO date string or null
  /** Live-computed status (overrides DB value for freshness) */
  status:           string
  /** EMPLOYEE | HR | PAYROLL | SYSTEM */
  sourceType:       string
  /** True if employee can replace this doc via ESS upload */
  employeeCanReplace: boolean
  /** True if restricted to HR-only view */
  hrOnlyVisibility: boolean
  /** Name of the person who uploaded this document */
  uploadedByName:   string | null
  /** When it was uploaded */
  uploadedAt:       string | null
  /** File size in bytes (0 = no file) */
  fileSizeBytes:    number
  /** MIME type of attached file */
  mimeType:         string | null
  canView:          boolean
  canDownload:      boolean
  /** True if the employee may edit metadata (own self-uploaded, replaceable docs) */
  canEdit:          boolean
  /** True if the employee may delete this document (own self-uploaded, replaceable docs) */
  canDelete:        boolean
}

// ── Query ─────────────────────────────────────────────────────────────────────

export async function getEmployeeDocuments(
  personId: string,
  /** Set true when caller is an EMPLOYEE role — filters out hrOnlyVisibility=true rows */
  employeeView = false,
): Promise<EmployeeDocumentRow[]> {

  // ── 1. person_documents — exclude SIGNED_LETTER type ─────────────────────
  const docRows = await db
    .select({
      id:               personDocuments.id,
      documentType:     personDocuments.documentType,
      documentCategory: personDocuments.documentCategory,
      documentTitle:    personDocuments.documentTitle,
      documentNumber:   personDocuments.documentNumber,
      issueDate:        personDocuments.issueDate,
      expiryDate:       personDocuments.expiryDate,
      documentStatus:   personDocuments.documentStatus,
      sourceType:       personDocuments.sourceType,
      employeeCanReplace: personDocuments.employeeCanReplace,
      hrOnlyVisibility: personDocuments.hrOnlyVisibility,
      createdByName:    personDocuments.createdByName,
      createdDate:      personDocuments.createdDate,
      fileSizeBytes:    personDocuments.fileSizeBytes,
      mimeType:         personDocuments.mimeType,
      storageKey:       personDocuments.storageKey,
    })
    .from(personDocuments)
    .where(and(
      eq(personDocuments.tenantId,  TENANT_ID),
      eq(personDocuments.personId,  personId),
      ne(personDocuments.documentType, 'SIGNED_LETTER'),
      // EMPLOYEE role cannot see HR-only documents
      ...(employeeView ? [eq(personDocuments.hrOnlyVisibility, false)] : []),
    ))
    .orderBy(desc(personDocuments.createdDate))

  // ── 2. employee_letters (with PDF) — joined for friendly name ─────────────
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
      generatedBy:  employeeLetters.generatedBy,
    })
    .from(employeeLetters)
    .leftJoin(
      letterTemplateTypes,
      eq(letterTemplateTypes.typeCode, employeeLetters.typeCode),
    )
    .where(and(
      eq(employeeLetters.tenantId, TENANT_ID),
      eq(employeeLetters.personId, personId),
      isNotNull(employeeLetters.pdfUrl),
    ))
    .orderBy(desc(employeeLetters.generatedAt))

  // ── Normalise person documents ────────────────────────────────────────────
  const docs: EmployeeDocumentRow[] = docRows.map(d => {
    const liveStatus = computeDocumentStatus(d.documentStatus ?? 'VALID', d.expiryDate ?? null)
    const resolvedCategory = (d.documentCategory as DocumentCategory | null)
      ?? getDocTypeCategory(d.documentType)
    return {
      id:               d.id,
      source:           'PERSON_DOCUMENT' as const,
      typeCode:         d.documentType,
      typeLabelEn:      getDocTypeLabel(d.documentType),
      category:         resolvedCategory,
      title:            d.documentTitle,
      documentNumber:   d.documentNumber ?? null,
      issuedDate:       d.issueDate ?? null,
      expiryDate:       d.expiryDate ?? null,
      status:           liveStatus,
      sourceType:       d.sourceType ?? 'HR',
      employeeCanReplace: d.employeeCanReplace ?? false,
      hrOnlyVisibility: d.hrOnlyVisibility ?? false,
      uploadedByName:   d.createdByName ?? null,
      uploadedAt:       d.createdDate?.toISOString() ?? null,
      fileSizeBytes:    Number(d.fileSizeBytes ?? 0),
      mimeType:         d.mimeType ?? null,
      canView:          !!d.storageKey,
      canDownload:      !!d.storageKey,
      // Employees may edit/delete only their own self-uploaded, replaceable docs.
      canEdit:          (d.employeeCanReplace ?? false) && (d.sourceType === 'EMPLOYEE'),
      canDelete:        (d.employeeCanReplace ?? false) && (d.sourceType === 'EMPLOYEE'),
    }
  })

  // ── Normalise letters ─────────────────────────────────────────────────────
  const letters: EmployeeDocumentRow[] = letterRows.map(l => {
    const friendlyType = l.typeNameEn ?? LETTER_TYPE_LABELS[l.typeCode] ?? l.typeCode
    const title        = `${friendlyType} - ${l.letterNumber}`
    const hasPdf       = !!(l.signedPdfUrl ?? l.pdfUrl)
    const issuedDate   =
      l.signedAt?.toISOString().slice(0, 10) ??
      l.generatedAt?.toISOString().slice(0, 10) ??
      null
    return {
      id:               l.id,
      source:           'SIGNED_LETTER' as const,
      typeCode:         l.typeCode,
      typeLabelEn:      friendlyType,
      category:         'EMPLOYMENT' as DocumentCategory,
      title,
      documentNumber:   l.letterNumber,
      issuedDate,
      expiryDate:       null,
      status:           l.status,
      sourceType:       'HR',
      employeeCanReplace: false,
      hrOnlyVisibility: false,
      uploadedByName:   l.generatedBy ? 'HR System' : null,
      uploadedAt:       l.generatedAt?.toISOString() ?? null,
      fileSizeBytes:    0,
      mimeType:         'application/pdf',
      canView:          hasPdf,
      canDownload:      hasPdf,
      // Letters are HR-generated — employees cannot edit or delete them.
      canEdit:          false,
      canDelete:        false,
    }
  })

  // Merge — person docs first, letters after
  return [...docs, ...letters]
}

// ── Analytics helpers ─────────────────────────────────────────────────────────

export interface DocumentAnalytics {
  total:          number
  valid:          number
  expiringSoon:   number
  expired:        number
  missingMandatory: string[]  // type codes of required but absent docs
  complianceDocs: Array<{
    typeCode:   string
    labelEn:    string
    expiryDate: string | null
    status:     string
    daysLeft:   number | null
  }>
}

/** Priority expiry-tracked document types for the compliance sidebar widget. */
const COMPLIANCE_TRACKED = ['PASSPORT', 'VISA', 'EMIRATES_ID', 'DRIVING_LICENSE', 'HEALTH_INSURANCE_CARD']

export function computeDocumentAnalytics(
  docs: EmployeeDocumentRow[],
): DocumentAnalytics {
  const personDocs = docs.filter(d => d.source === 'PERSON_DOCUMENT')
  const valid      = personDocs.filter(d => d.status === 'VALID').length
  const expiring   = personDocs.filter(d => d.status === 'EXPIRING_SOON').length
  const expired    = personDocs.filter(d => d.status === 'EXPIRED').length

  const presentCodes = new Set(personDocs.map(d => d.typeCode))
  const mandatory    = ['PASSPORT', 'EMIRATES_ID', 'VISA', 'CONTRACT']
  const missingMandatory = mandatory.filter(c => !presentCodes.has(c))

  const complianceDocs = COMPLIANCE_TRACKED.map(code => {
    const doc = personDocs.find(d => d.typeCode === code)
    if (!doc) {
      return { typeCode: code, labelEn: getDocTypeLabel(code), expiryDate: null, status: 'MISSING', daysLeft: null }
    }
    const daysLeft = doc.expiryDate
      ? Math.floor((new Date(doc.expiryDate).getTime() - Date.now()) / 86_400_000)
      : null
    return { typeCode: code, labelEn: getDocTypeLabel(code), expiryDate: doc.expiryDate, status: doc.status, daysLeft }
  })

  return { total: docs.length, valid, expiringSoon: expiring, expired, missingMandatory, complianceDocs }
}
