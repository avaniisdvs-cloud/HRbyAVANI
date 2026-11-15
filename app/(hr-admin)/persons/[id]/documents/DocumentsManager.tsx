'use client'

import { useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useLocale } from '@/components/providers/LocaleProvider'
import { HijriDatePicker } from '@/components/forms/HijriDatePicker'
import { uploadPersonDocument, getDocumentUrl } from '@/modules/core-hr'
import {
  MAX_DOCUMENT_BYTES, ALLOWED_DOCUMENT_MIME_TYPES,
} from '@/lib/constants'
import { HR_UPLOADABLE_TYPES, DOCUMENT_TYPES as DOC_TYPE_REGISTRY, getDocTypeLabel, getDocTypeCategory, CATEGORY_META } from '@/lib/documents/document-types'

// All HR-uploadable types from the master taxonomy
const DOCUMENT_TYPES = HR_UPLOADABLE_TYPES as string[]
type DocumentType = string

type DocStatus = 'VALID' | 'EXPIRED' | 'EXPIRING_SOON' | 'PENDING_VERIFICATION' | string

interface DocumentRow {
  id:                 string
  documentType:       string
  /** Resolved category — IDENTITY | EMPLOYMENT | PAYROLL | etc. */
  documentCategory:   string | null
  documentTitle:      string
  documentNumber:     string | null
  fileName:           string | null
  fileSizeBytes:      number
  mimeType:           string | null
  checksumSha256:     string | null
  issueDate:          string | null
  expiryDate:         string | null
  isMandatory:        boolean
  /** Live-computed status (VALID | EXPIRING_SOON | EXPIRED | …) */
  documentStatus:     DocStatus
  /** EMPLOYEE | HR | PAYROLL | SYSTEM */
  sourceType:         string
  /** True if restricted to HR-only view */
  hrOnlyVisibility:   boolean
  /** True if employee can replace via ESS */
  employeeCanReplace: boolean
  createdByName:      string | null
  createdDate:        string | null
  downloadCount:      number
}

export interface AdminLetterRow {
  id:           string
  typeCode:     string
  typeLabelEn:  string
  letterNumber: string
  status:       string
  pdfUrl:       string | null
  generatedAt:  string | null
  signedAt:     string | null
}

interface Props {
  personId:  string
  documents: DocumentRow[]
  letters?:  AdminLetterRow[]
}

const ACCEPT_ATTR = ALLOWED_DOCUMENT_MIME_TYPES.join(',')
const MAX_BYTES = MAX_DOCUMENT_BYTES

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export function DocumentsManager({ personId, documents, letters = [] }: Props) {
  return (
    <div className="space-y-6">
      <UploadCard personId={personId} />
      <DocumentsTable documents={documents} />
      {letters.length > 0 && <LettersTable letters={letters} />}
    </div>
  )
}

// ── Upload form ───────────────────────────────────────────────────────────

function UploadCard({ personId }: { personId: string }) {
  const [pending, start] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const [documentType,    setDocumentType]    = useState<DocumentType | ''>('')
  const [documentTitle,   setDocumentTitle]   = useState('')
  const [documentNumber,  setDocumentNumber]  = useState('')
  const [issuingAuthority, setIssuingAuthority] = useState('')
  const [issuingCountry,  setIssuingCountry]  = useState('')
  const [issueDate,       setIssueDate]       = useState('')
  const [expiryDate,      setExpiryDate]      = useState('')
  const [isMandatory,     setIsMandatory]     = useState(false)
  const [notes,           setNotes]           = useState('')
  const [file,            setFile]            = useState<File | null>(null)
  const [clientError,     setClientError]     = useState<string | null>(null)

  const { toast } = useToast()
  const locale = useLocale()
  const router    = useRouter()

  function reset() {
    setDocumentType('')
    setDocumentTitle('')
    setDocumentNumber('')
    setIssuingAuthority('')
    setIssuingCountry('')
    setIssueDate('')
    setExpiryDate('')
    setIsMandatory(false)
    setNotes('')
    setFile(null)
    setClientError(null)
    formRef.current?.reset()
  }

  function pickedFile(f: File | null) {
    setClientError(null)
    if (!f) { setFile(null); return }
    if (f.size > MAX_BYTES) {
      setClientError(locale === 'ar'
        ? `يتجاوز الملف الحد المسموح ${formatBytes(MAX_BYTES)} (الحجم ${formatBytes(f.size)}).`
        : `File exceeds ${formatBytes(MAX_BYTES)} limit (got ${formatBytes(f.size)}).`)
      setFile(null)
      return
    }
    if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(f.type)) {
      setClientError(locale === 'ar'
        ? `نوع الملف غير مدعوم ${f.type || '(غير معروف)'}.`
        : `Unsupported MIME type ${f.type || '(unknown)'}.`)
      setFile(null)
      return
    }
    setFile(f)
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setClientError(null)

    if (!file) { setClientError(locale === 'ar' ? 'اختر ملفًا للرفع.' : 'Pick a file to upload.'); return }
    if (!documentType) { setClientError(locale === 'ar' ? 'اختر نوع المستند.' : 'Choose a document type.'); return }
    if (!documentTitle.trim()) { setClientError(locale === 'ar' ? 'عنوان المستند مطلوب.' : 'Document title is required.'); return }
    if (issuingCountry && !/^[A-Z]{3}$/.test(issuingCountry)) {
      setClientError(locale === 'ar' ? 'يجب أن تكون دولة الإصدار بصيغة ISO-3 (مثال: ARE).' : 'Issuing country must be ISO-3 (e.g. ARE).')
      return
    }

    const fd = new FormData()
    fd.append('file', file)
    fd.append('metadata', JSON.stringify({
      personId,
      documentType,
      documentTitle:    documentTitle.trim(),
      documentNumber:   documentNumber.trim() || undefined,
      issuingAuthority: issuingAuthority.trim() || undefined,
      issuingCountry:   issuingCountry.trim().toUpperCase() || undefined,
      issueDate:        issueDate || undefined,
      expiryDate:       expiryDate || undefined,
      isMandatory,
      notes:            notes.trim() || undefined,
    }))

    start(async () => {
      try {
        const result = await uploadPersonDocument(fd)
        toast({
          title: locale === 'ar' ? 'تم رفع المستند' : 'Document uploaded',
          description: locale === 'ar'
            ? `تم الحفظ · أُصدر رابط SAS صالح لمدة 15 دقيقة. معرّف المستند: ${result.id.slice(0, 8)}…`
            : `Saved · 15-min SAS link issued. Document ID: ${result.id.slice(0, 8)}…`,
        })
        reset()
        router.refresh()
      } catch (err: unknown) {
        toast({
          title: locale === 'ar' ? 'فشل الرفع' : 'Upload failed',
          description: err instanceof Error ? err.message : (locale === 'ar' ? 'خطأ غير معروف' : 'Unknown error'),
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
          {locale === 'ar' ? 'رفع مستند' : 'Upload document'}
          <Badge className="ms-2 align-middle" variant="secondary">Azure Blob · UAE North</Badge>
        </h3>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-5" encType="multipart/form-data">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-2">
                {locale === 'ar' ? 'نوع المستند' : 'Document type'}<span className="ms-0.5 text-destructive">*</span>
              </Label>
              <Select value={documentType || undefined}
                onValueChange={v => setDocumentType(v as DocumentType)}
                disabled={pending}>
                <SelectTrigger><SelectValue placeholder={locale === 'ar' ? 'اختر النوع' : 'Select type'} /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_META.map(cat => {
                    const typesInCat = DOC_TYPE_REGISTRY.filter(
                      t => t.category === cat.code && DOCUMENT_TYPES.includes(t.code)
                    )
                    if (typesInCat.length === 0) return null
                    return (
                      <div key={cat.code}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-ink-3 uppercase tracking-wide">{cat.labelEn}</div>
                        {typesInCat.map(t => (
                          <SelectItem key={t.code} value={t.code}>{t.labelEn}</SelectItem>
                        ))}
                      </div>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="documentTitle" className="text-xs font-medium text-ink-2">
                {locale === 'ar' ? 'العنوان' : 'Title'}<span className="ms-0.5 text-destructive">*</span>
              </Label>
              <Input id="documentTitle" required maxLength={200}
                value={documentTitle} onChange={e => setDocumentTitle(e.target.value)}
                placeholder={locale === 'ar' ? 'مثال: جواز السفر — الأساسي' : 'e.g. Passport — primary'}
                disabled={pending} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="documentNumber" className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'رقم المستند' : 'Document number'}</Label>
              <Input id="documentNumber" maxLength={100}
                value={documentNumber} onChange={e => setDocumentNumber(e.target.value)}
                disabled={pending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issuingAuthority" className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'جهة الإصدار' : 'Issuing authority'}</Label>
              <Input id="issuingAuthority" maxLength={200}
                value={issuingAuthority} onChange={e => setIssuingAuthority(e.target.value)}
                disabled={pending} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issuingCountry" className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'دولة الإصدار (ISO-3)' : 'Issuing country (ISO-3)'}</Label>
              <Input id="issuingCountry" maxLength={3} className="uppercase"
                value={issuingCountry}
                onChange={e => setIssuingCountry(e.target.value.toUpperCase())}
                placeholder="ARE" disabled={pending} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <HijriDatePicker
              label={locale === 'ar' ? 'تاريخ الإصدار' : 'Issue date'}
              value={issueDate}
              onChange={setIssueDate}
              disabled={pending}
            />
            <HijriDatePicker
              label={locale === 'ar' ? 'تاريخ الانتهاء' : 'Expiry date'}
              value={expiryDate}
              onChange={setExpiryDate}
              disabled={pending}
            />
            <label className="flex items-end gap-2 pb-2 text-xs text-ink-2">
              <input type="checkbox" checked={isMandatory}
                onChange={e => setIsMandatory(e.target.checked)} disabled={pending}
                className="h-4 w-4 rounded border-border accent-accent" />
              {locale === 'ar' ? 'مستند إلزامي (تنبيهات عند الانتهاء وفق BR-DOC-001)' : 'Mandatory document (alerts on expiry per BR-DOC-001)'}
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs font-medium text-ink-2">{locale === 'ar' ? 'ملاحظات' : 'Notes'}</Label>
            <Textarea id="notes" rows={2} maxLength={2000}
              value={notes} onChange={e => setNotes(e.target.value)} disabled={pending} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="file" className="text-xs font-medium text-ink-2">
              {locale === 'ar' ? 'الملف' : 'File'}<span className="ms-0.5 text-destructive">*</span>
            </Label>
            <Input id="file" type="file" required
              accept={ACCEPT_ATTR}
              onChange={e => pickedFile(e.target.files?.[0] ?? null)}
              disabled={pending} />
            <p className="text-xs text-ink-3">
              {locale === 'ar' ? `الحد الأقصى ${formatBytes(MAX_BYTES)}. المسموح: PDF، JPEG، PNG، WebP، DOCX.` : `Max ${formatBytes(MAX_BYTES)}. Allowed: PDF, JPEG, PNG, WebP, DOCX.`}
              {file && <> · {locale === 'ar' ? 'المحدد' : 'Selected'}: <code className="font-mono">{file.name}</code> ({formatBytes(file.size)})</>}
            </p>
            {clientError && <p className="text-xs text-destructive">{clientError}</p>}
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={reset} disabled={pending}>{locale === 'ar' ? 'إعادة تعيين' : 'Reset'}</Button>
            <Button type="submit" disabled={pending || !file}>
              {pending ? (locale === 'ar' ? 'جارٍ الرفع…' : 'Uploading…') : (locale === 'ar' ? 'رفع المستند' : 'Upload document')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Status badge helper ───────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  VALID:          { bg: '#DCFCE7', fg: '#15803D', label: 'Valid'           },
  EXPIRING_SOON:  { bg: '#FEF3C7', fg: '#D97706', label: 'Expiring Soon'   },
  EXPIRED:        { bg: '#FEE2E2', fg: '#DC2626', label: 'Expired'         },
  UNDER_RENEWAL:  { bg: '#DBEAFE', fg: '#2563EB', label: 'Under Renewal'   },
  CANCELLED:      { bg: '#F3F4F6', fg: '#6B7280', label: 'Cancelled'       },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: '#F3F4F6', fg: '#6B7280', label: status.replace(/_/g, ' ') }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      fontSize: 'var(--text-caption)', fontWeight: 600, background: s.bg, color: s.fg,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

// ── Source-type badge helper ──────────────────────────────────────────────

const SOURCE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  EMPLOYEE: { bg: '#EFF6FF', fg: '#1D4ED8', label: 'Employee'  },
  HR:       { bg: '#F0FDF4', fg: '#15803D', label: 'HR'        },
  PAYROLL:  { bg: '#FAF5FF', fg: '#7C3AED', label: 'Payroll'   },
  SYSTEM:   { bg: '#F3F4F6', fg: '#6B7280', label: 'System'    },
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  const s = SOURCE_STYLE[sourceType] ?? SOURCE_STYLE['HR']
  return (
    <span style={{
      display: 'inline-block', padding: '2px 6px', borderRadius: 4,
      fontSize: 'var(--text-caption)', fontWeight: 600, background: s.bg, color: s.fg,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

// ── Category label helper ─────────────────────────────────────────────────

const CAT_LABEL: Record<string, string> = {
  IDENTITY:      'Identity',
  EMPLOYMENT:    'Employment',
  PAYROLL:       'Payroll',
  MEDICAL:       'Medical',
  EDUCATION:     'Education',
  PERSONAL:      'Personal',
  BANKING:       'Banking',
  HR_COMPLIANCE: 'HR Compliance',
  SUPPORTING:    'Supporting',
}

// ── Existing documents list ───────────────────────────────────────────────

function DocumentsTable({ documents }: { documents: DocumentRow[] }) {
  const locale = useLocale()
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
          {locale === 'ar' ? 'المستندات' : 'Documents'}
        </h3>
        <Badge variant="outline">{documents.length}</Badge>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {documents.length === 0 ? (
          <p className="text-sm text-ink-3">{locale === 'ar' ? 'لم يتم رفع أي مستندات بعد.' : 'No documents uploaded yet.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-start text-xs uppercase text-ink-3">
                <tr>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الفئة' : 'Category'}</th>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'النوع' : 'Type'}</th>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'العنوان' : 'Title'}</th>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'المصدر' : 'Source'}</th>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الانتهاء' : 'Expiry'}</th>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'رفع بواسطة' : 'Uploaded by'}</th>
                  <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'إجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents.map(d => (
                  <tr key={d.id} style={d.hrOnlyVisibility ? { background: 'rgba(239,68,68,0.03)' } : undefined}>
                    <td className="py-2 pe-3 text-xs text-ink-3">
                      {/* Fall back to getDocTypeCategory so legacy 'OTHER' documentCategory values
                          resolve to their human-readable category label instead of showing raw code */}
                      {CAT_LABEL[d.documentCategory ?? ''] ?? CAT_LABEL[getDocTypeCategory(d.documentType)] ?? (d.documentCategory ?? '—')}
                    </td>
                    <td className="py-2 pe-3 text-ink-2 text-xs whitespace-nowrap">
                      {getDocTypeLabel(d.documentType)}
                      {d.hrOnlyVisibility && (
                        <span title={locale === 'ar' ? 'للموارد البشرية فقط — غير مرئي للموظف' : 'HR-only — not visible to employee'} style={{ marginInlineStart: 4, color: '#DC2626', fontSize: 'var(--text-caption)' }}>
                          🔒
                        </span>
                      )}
                    </td>
                    <td className="py-2 pe-3 text-ink-1" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.documentTitle}
                    </td>
                    <td className="py-2 pe-3">
                      <SourceBadge sourceType={d.sourceType} />
                    </td>
                    <td className="py-2 pe-3 font-mono text-xs" style={{ color: d.documentStatus === 'EXPIRED' ? '#DC2626' : d.documentStatus === 'EXPIRING_SOON' ? '#D97706' : 'var(--ink-3)' }}>
                      {d.expiryDate ?? '—'}
                    </td>
                    <td className="py-2 pe-3">
                      <StatusBadge status={d.documentStatus} />
                    </td>
                    <td className="py-2 pe-3 text-xs text-ink-3">
                      {d.createdByName ?? '—'}
                    </td>
                    <td className="py-2 pe-3">
                      <DownloadButton documentId={d.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-3">
          {locale === 'ar'
            ? '🔒 = مستند للموارد البشرية فقط (مخفي عن عرض الخدمة الذاتية للموظف). تُقدَّم التنزيلات عبر /api/documents/[id] (محمية بالمصادقة)؛ كل وصول يكتب سجل تدقيق DOCUMENT.URL_ISSUED + DOCUMENT.ACCESSED.'
            : '🔒 = HR-only document (hidden from employee ESS view). Downloads are served via /api/documents/[id] (auth-gated); each access writes a DOCUMENT.URL_ISSUED + DOCUMENT.ACCESSED audit row.'}
        </p>
      </div>
    </div>
  )
}

function DownloadButton({ documentId }: { documentId: string }) {
  const [pending, start] = useTransition()
  const { toast } = useToast()
  const locale = useLocale()

  function fetchUrl() {
    start(async () => {
      const result = await getDocumentUrl(documentId)
      if ('error' in result) {
        toast({ title: locale === 'ar' ? 'تعذّر فتح المستند' : 'Cannot open document', description: result.error, variant: 'destructive' })
        return
      }
      // Open via authenticated API route — handles streaming (/tmp UAT) + cloud redirect
      window.open(`${result.url}?mode=view&src=HR_ADMIN_DOCUMENTS`, '_blank', 'noopener,noreferrer')
    })
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={fetchUrl} disabled={pending}>
        {pending ? '…' : (locale === 'ar' ? 'عرض' : 'View')}
      </Button>
      <Button
        size="sm" variant="ghost"
        onClick={fetchUrl}
        disabled={pending}
        title={locale === 'ar' ? 'نفس رابط SAS — سيتولى المتصفح التنزيل' : 'Same SAS URL — browser will handle download'}
      >
        ↓
      </Button>
    </div>
  )
}

// ── Generated letters section ─────────────────────────────────────────────

const LETTER_STATUS_META: Record<string, { variant: 'secondary' | 'outline' | 'destructive'; label: string }> = {
  DRAFT:             { variant: 'outline',     label: 'Draft'             },
  PENDING_APPROVAL:  { variant: 'outline',     label: 'Pending Approval'  },
  APPROVED:          { variant: 'secondary',   label: 'Approved'          },
  SIGNED:            { variant: 'secondary',   label: 'Signed'            },
  SENT:              { variant: 'secondary',   label: 'Sent'              },
  REJECTED:          { variant: 'destructive', label: 'Rejected'          },
  CANCELLED:         { variant: 'outline',     label: 'Cancelled'         },
  PENDING_SIGNATURE: { variant: 'outline',     label: 'Pending Signature' },
}

function LettersTable({ letters }: { letters: AdminLetterRow[] }) {
  const locale = useLocale()
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
          {locale === 'ar' ? 'الخطابات المُنشأة' : 'Generated Letters'}
          <Badge className="ms-2 align-middle" variant="outline">{letters.length}</Badge>
        </h3>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '38%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead className="border-b border-border text-start text-xs uppercase text-ink-3">
              <tr>
                <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'النوع' : 'Type'}</th>
                <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الخطاب' : 'Letter'}</th>
                <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'تاريخ الإنشاء' : 'Generated'}</th>
                <th className="pb-2 pe-3 font-medium">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="pb-2 pe-3 font-medium text-end">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {letters.map(l => {
                const meta  = LETTER_STATUS_META[l.status] ?? { variant: 'outline' as const, label: l.status }
                const title = `${l.typeLabelEn} — ${l.letterNumber}`
                return (
                  <tr key={l.id}>
                    <td className="py-2 pe-3 text-xs text-ink-3">{l.typeCode}</td>
                    <td className="py-2 pe-3 text-ink-1 font-medium" style={{ wordBreak: 'break-word' }}>{title}</td>
                    <td className="py-2 pe-3 font-mono text-xs text-ink-3">
                      {l.signedAt
                        ? new Date(l.signedAt).toLocaleDateString('en-GB')
                        : l.generatedAt
                          ? new Date(l.generatedAt).toLocaleDateString('en-GB')
                          : '—'}
                    </td>
                    <td className="py-2 pe-3">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </td>
                    <td className="py-2 pe-3 text-end">
                      {l.pdfUrl ? <AdminLetterDownloadButton letterId={l.id} letterNumber={l.letterNumber} /> : <span className="text-xs text-ink-4">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          {locale === 'ar'
            ? 'تُجلب ملفات PDF للخطابات من Azure Blob عند كل وصول. كل طلب يكتب سجل تدقيق LETTER.URL_ISSUED.'
            : 'Letter PDFs are fetched from Azure Blob on each access. Each request writes a LETTER.URL_ISSUED audit row.'}
        </p>
      </div>
    </div>
  )
}

function AdminLetterDownloadButton({ letterId, letterNumber }: { letterId: string; letterNumber: string }) {
  const [pending, start] = useTransition()
  const { toast }        = useToast()
  const locale = useLocale()

  function openUrl(mode: 'view' | 'download') {
    start(async () => {
      try {
        // Use the API route for reliable byte streaming (handles SAS refresh)
        const url = `/api/employee-letters/download?id=${letterId}${mode === 'view' ? '&mode=view' : ''}`
        if (mode === 'view') {
          window.open(url, '_blank', 'noopener,noreferrer')
        } else {
          const a = document.createElement('a')
          a.href     = url
          a.download = `letter_${letterNumber}.pdf`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        }
      } catch (err: unknown) {
        toast({
          title:       locale === 'ar' ? 'تعذّر فتح الخطاب' : 'Could not open letter',
          description: err instanceof Error ? err.message : (locale === 'ar' ? 'خطأ غير معروف' : 'Unknown error'),
          variant:     'destructive',
        })
      }
    })
  }

  return (
    <div className="flex gap-2 justify-end">
      <Button size="sm" variant="outline" onClick={() => openUrl('view')} disabled={pending}>
        {pending ? '…' : (locale === 'ar' ? 'عرض' : 'View')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => openUrl('download')} disabled={pending} title={locale === 'ar' ? 'تنزيل PDF' : 'Download PDF'}>
        ↓
      </Button>
    </div>
  )
}
