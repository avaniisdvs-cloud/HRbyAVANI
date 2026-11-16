'use client'

/**
 * My Documents — Enterprise document management UI.
 *
 * Layout: 65% document workspace (left) + 35% analytics sidebar (right).
 * Features:
 *  - Collapsible sections by document category
 *  - Document cards with full metadata, status, actions
 *  - Employee self-upload modal (drag & drop)
 *  - Compliance status widgets
 *  - Expiry monitoring
 *  - Bilingual labels (EN + AR)
 */
import { SectionTitle, PageTitle } from '@/components/ui/typography'
import { useState, useTransition, useRef, type FormEvent, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  FolderOpen, ChevronDown, ChevronRight, Upload, Download, Eye,
  AlertTriangle, CheckCircle, Clock, X, FileText, Shield,
  RefreshCw, Calendar, User, BadgeCheck, Info, ZoomIn,
  Fingerprint, Briefcase, Banknote, Stethoscope, GraduationCap,
  CreditCard, ShieldCheck, Paperclip, Pencil, Trash2,
} from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { Locale } from '@/lib/i18n'
import { getDocumentUrl, uploadMyDocument, updateMyDocumentMeta, deleteMyDocument } from '@/modules/core-hr'
import type { EmployeeDocumentRow, DocumentAnalytics } from '@/lib/documents/get-employee-documents'
import type { StorageUIState } from '@/lib/storage'
import {
  DOCUMENT_TYPES,
  EMPLOYEE_UPLOADABLE_TYPES,
  CATEGORY_META,
  getDocTypeLabel,
  getDocTypeLabelAr,
  type DocumentCategory,
  type CategoryMeta,
  EXPIRY_WARN_DAYS,
} from '@/lib/documents/document-types'
import { MAX_DOCUMENT_BYTES, ALLOWED_DOCUMENT_MIME_TYPES } from '@/lib/constants'

// Pre-computed set of categories that have at least one employee-uploadable type
const UPLOADABLE_CATEGORIES: Set<string> = new Set(
  DOCUMENT_TYPES.filter(t => t.employeeUploadable).map(t => t.category)
)

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { bg: string; fg: string; border: string; labelEn: string; labelAr: string }> = {
  VALID:             { bg: '#DCFCE7', fg: '#15803D', border: '#86EFAC', labelEn: 'Valid',           labelAr: 'صالح'           },
  EXPIRING_SOON:     { bg: '#FEF3C7', fg: '#D97706', border: '#FCD34D', labelEn: 'Expiring Soon',   labelAr: 'ينتهي قريباً'    },
  EXPIRING:          { bg: '#FEF3C7', fg: '#D97706', border: '#FCD34D', labelEn: 'Expiring Soon',   labelAr: 'ينتهي قريباً'    },
  EXPIRED:           { bg: '#FEE2E2', fg: '#DC2626', border: '#FCA5A5', labelEn: 'Expired',         labelAr: 'منتهي الصلاحية' },
  UNDER_RENEWAL:     { bg: '#DBEAFE', fg: '#2563EB', border: '#93C5FD', labelEn: 'Under Renewal',   labelAr: 'قيد التجديد'    },
  CANCELLED:         { bg: '#F3F4F6', fg: '#6B7280', border: '#D1D5DB', labelEn: 'Cancelled',       labelAr: 'ملغى'           },
  DRAFT:             { bg: '#F3F4F6', fg: '#6B7280', border: '#D1D5DB', labelEn: 'Draft',           labelAr: 'مسودة'          },
  PENDING_APPROVAL:  { bg: '#FEF3C7', fg: '#D97706', border: '#FCD34D', labelEn: 'Pending Approval',labelAr: 'في انتظار الموافقة' },
  APPROVED:          { bg: '#DCFCE7', fg: '#15803D', border: '#86EFAC', labelEn: 'Approved',        labelAr: 'معتمد'          },
  SIGNED:            { bg: '#DBEAFE', fg: '#2563EB', border: '#93C5FD', labelEn: 'Signed',          labelAr: 'موقّع'          },
  SENT:              { bg: '#DCFCE7', fg: '#15803D', border: '#86EFAC', labelEn: 'Sent',            labelAr: 'مُرسل'          },
  REJECTED:          { bg: '#FEE2E2', fg: '#DC2626', border: '#FCA5A5', labelEn: 'Rejected',        labelAr: 'مرفوض'          },
  PENDING_SIGNATURE: { bg: '#FEF3C7', fg: '#D97706', border: '#FCD34D', labelEn: 'Pending Signature',labelAr: 'في انتظار التوقيع' },
  MISSING:           { bg: '#FEE2E2', fg: '#DC2626', border: '#FCA5A5', labelEn: 'Missing',         labelAr: 'مفقود'          },
}

function getStatus(s: string) {
  return STATUS_CFG[s] ?? { bg: '#F3F4F6', fg: '#6B7280', border: '#D1D5DB', labelEn: s.replace(/_/g, ' '), labelAr: s }
}

// ── Category icon map ─────────────────────────────────────────────────────────

const CAT_ICONS: Record<string, React.ReactNode> = {
  IDENTITY:      <Fingerprint size={15} />,
  EMPLOYMENT:    <Briefcase size={15} />,
  PAYROLL:       <Banknote size={15} />,
  MEDICAL:       <Stethoscope size={15} />,
  EDUCATION:     <GraduationCap size={15} />,
  PERSONAL:      <User size={15} />,
  BANKING:       <CreditCard size={15} />,
  HR_COMPLIANCE: <ShieldCheck size={15} />,
  SUPPORTING:    <Paperclip size={15} />,
}

// ── Date formatting ───────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtBytes(n: number): string {
  if (!n || n === 0) return ''
  if (n < 1024)         return `${n} B`
  if (n < 1024 * 1024)  return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp   = new Date(iso); exp.setHours(0, 0, 0, 0)
  return Math.floor((exp.getTime() - today.getTime()) / 86_400_000)
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, locale }: { status: string; locale: Locale }) {
  const cfg = getStatus(status)
  return (
    <span style={{
      display:         'inline-flex', alignItems: 'center', gap: 4,
      padding:         '2px 8px', borderRadius: 12,
      fontSize:        'var(--text-caption)', fontWeight: 600,
      background:      cfg.bg, color: cfg.fg,
      border:          `1px solid ${cfg.border}`,
      whiteSpace:      'nowrap',
    }}>
      {status === 'VALID' && <CheckCircle size={10} />}
      {(status === 'EXPIRING_SOON' || status === 'EXPIRING') && <Clock size={10} />}
      {(status === 'EXPIRED' || status === 'MISSING') && <AlertTriangle size={10} />}
      {locale === 'ar' ? cfg.labelAr : cfg.labelEn}
    </span>
  )
}

// ── Document card ─────────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  fileOpsEnabled = true,
}: {
  doc: EmployeeDocumentRow
  fileOpsEnabled?: boolean
}) {
  const router                 = useRouter()
  const locale                 = useLocale()
  const [pending, start]       = useTransition()
  const [accessError, setAccessError] = useState<string | null>(null)
  const [editOpen, setEditOpen]       = useState(false)
  const [deletePending, startDelete]  = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const cfg = getStatus(doc.status)

  function onDelete() {
    setAccessError(null)
    startDelete(async () => {
      const result = await deleteMyDocument(doc.id)
      if ('error' in result) {
        setAccessError(result.error)
        setConfirmDelete(false)
        return
      }
      router.refresh()
    })
  }

  function openDoc(mode: 'view' | 'download') {
    if (!fileOpsEnabled) {
      setAccessError(locale === 'ar' ? 'عمليات الملفات غير متاحة في هذه البيئة.' : 'File operations are not available in this environment.')
      return
    }
    if (doc.source === 'SIGNED_LETTER') {
      const url = `/api/employee-letters/download-my?id=${doc.id}${mode === 'view' ? '&mode=view' : ''}`
      if (mode === 'view') {
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        const a = document.createElement('a')
        a.href = url; a.download = ''; document.body.appendChild(a); a.click(); document.body.removeChild(a)
      }
      return
    }
    setAccessError(null)
    start(async () => {
      const result = await getDocumentUrl(doc.id)
      if ('error' in result) {
        setAccessError(result.error)
        return
      }
      const url = `${result.url}?mode=${mode}&src=ESS_MY_DOCUMENTS`
      if (mode === 'view') {
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        // Use fetch → blob-URL so error responses (e.g. FILE_MISSING when the
        // /tmp file was evicted after a Vercel container restart) are caught and
        // shown inline in the card instead of navigating the browser to the
        // API URL and rendering the HTML error page there.
        // Falls back to <a download> on any network / CORS error (e.g. a
        // cloud-provider signed-URL redirect to Azure / S3 that does not yet
        // have CORS headers configured).
        try {
          const resp = await fetch(url, { credentials: 'same-origin' })
          if (!resp.ok) {
            const ct = resp.headers.get('content-type') ?? ''
            if (ct.includes('application/json')) {
              const json = await resp.json() as { error?: string }
              setAccessError(json.error ?? (locale === 'ar' ? 'تعذّر تنزيل هذه الوثيقة.' : 'Failed to download this document.'))
            } else {
              setAccessError(
                resp.status === 404
                  ? (locale === 'ar'
                      ? 'الملف المؤقت (UAT) غير متاح — ربما فُقد بسبب عزل حاوية الخوادم بدون خادم أو بعد إعادة النشر. يرجى إعادة الرفع لمتابعة الاختبار.'
                      : 'Temporary UAT file is unavailable — it may have been lost due to serverless container isolation or after redeployment. Please re-upload to continue testing.')
                  : (locale === 'ar' ? 'تعذّر تنزيل هذه الوثيقة. يرجى المحاولة مرة أخرى.' : 'Unable to download this document. Please try again.'),
              )
            }
            return
          }
          const ct = resp.headers.get('content-type') ?? ''
          if (ct.includes('text/html')) {
            // Guard: unexpected HTML at 200 OK
            setAccessError(locale === 'ar' ? 'تعذّر تنزيل هذه الوثيقة. يرجى المحاولة مرة أخرى.' : 'Unable to download this document. Please try again.')
            return
          }
          const blob = await resp.blob()
          const blobUrl = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = blobUrl
          a.download = doc.title ?? 'document'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
        } catch {
          // Network error or CORS block on a signed-URL cross-origin redirect —
          // fall back to direct link navigation which handles redirects without
          // CORS restrictions.
          const a = document.createElement('a')
          a.href = url; a.download = doc.title ?? ''; document.body.appendChild(a); a.click(); document.body.removeChild(a)
        }
      }
    })
  }

  const days = daysLeft(doc.expiryDate)
  const showExpiryWarning = doc.expiryDate && days !== null && days >= 0 && days <= EXPIRY_WARN_DAYS

  return (
    <div style={{
      background:    'var(--card)',
      border:        `1px solid ${doc.status === 'EXPIRED' ? '#FCA5A5' : doc.status === 'EXPIRING_SOON' || doc.status === 'EXPIRING' ? '#FCD34D' : 'var(--border)'}`,
      borderRadius:  10,
      padding:       '14px 16px',
      display:       'flex',
      flexDirection: 'column',
      gap:           8,
      transition:    'box-shadow 0.15s, border-color 0.15s',
      minWidth:      0,
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
    >
      {/* Card header: type + status */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={14} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.3 }}>
              {doc.typeLabelEn}
            </span>
          </div>
          {doc.documentNumber && (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', paddingInlineStart: 20 }}>
              {doc.documentNumber}
            </span>
          )}
        </div>
        <StatusBadge status={doc.status} locale={locale} />
      </div>

      {/* Expiry warning strip */}
      {showExpiryWarning && (
        <div style={{
          display:       'flex', alignItems: 'center', gap: 6,
          padding:       '6px 10px', borderRadius: 6,
          background:    '#FEF3C7', color: '#D97706',
          fontSize:      'var(--text-caption)', fontWeight: 500,
        }}>
          <Clock size={11} />
          {days === 0
            ? (locale === 'ar' ? 'ينتهي اليوم' : 'Expires today')
            : days === 1
              ? (locale === 'ar' ? 'ينتهي غداً' : 'Expires tomorrow')
              : (locale === 'ar' ? `ينتهي خلال ${days} يوماً` : `Expires in ${days} days`)}
        </div>
      )}
      {doc.status === 'EXPIRED' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 6,
          background: '#FEE2E2', color: '#DC2626',
          fontSize: 'var(--text-caption)', fontWeight: 500,
        }}>
          <AlertTriangle size={11} />
          {locale === 'ar' ? `انتهى في ${fmtDate(doc.expiryDate)}` : `Expired on ${fmtDate(doc.expiryDate)}`}
        </div>
      )}

      {/* Metadata grid */}
      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
        {doc.issuedDate && (
          <MetaItem icon={<Calendar size={11} />} label={locale === 'ar' ? 'تاريخ الإصدار' : 'Issued'} value={fmtDate(doc.issuedDate)} />
        )}
        {doc.expiryDate && (
          <MetaItem icon={<Calendar size={11} />} label={locale === 'ar' ? 'تاريخ الانتهاء' : 'Expires'} value={fmtDate(doc.expiryDate)} />
        )}
        {doc.uploadedByName && (
          <MetaItem icon={<User size={11} />} label={locale === 'ar' ? 'رفع بواسطة' : 'Uploaded by'} value={doc.uploadedByName} />
        )}
        {doc.uploadedAt && (
          <MetaItem icon={<Clock size={11} />} label={locale === 'ar' ? 'التاريخ' : 'Date'} value={fmtDate(doc.uploadedAt)} />
        )}
        {doc.fileSizeBytes > 0 && (
          <MetaItem icon={<FileText size={11} />} label={locale === 'ar' ? 'الحجم' : 'Size'} value={fmtBytes(doc.fileSizeBytes)} />
        )}
      </div>

      {/* Inline access error (file missing / unauthorised / storage issue) */}
      {accessError && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 6,
          marginTop: 4,
          padding: '7px 10px', borderRadius: 6,
          background: '#FEF3C7', color: '#92400E',
          fontSize: 'var(--text-caption)', lineHeight: 1.5,
        }}>
          <AlertTriangle size={12} style={{ flexShrink: 0,
          marginTop: 1 }} />
          <span>{accessError}</span>
        </div>
      )}

      {/* Delete confirmation strip */}
      {confirmDelete && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          marginTop: 4,
          padding: '10px 12px', borderRadius: 7,
          background: '#FEF2F2', border: '1px solid #FCA5A5',
        }}>
          <span style={{ fontSize: 'var(--text-caption)', color: '#7F1D1D', fontWeight: 500 }}>
            {locale === 'ar'
              ? `حذف "${doc.title}"؟ سيؤدي هذا إلى إزالة الملف نهائياً. يمكنك رفع بديل لاحقاً.`
              : `Delete "${doc.title}"? This permanently removes the file. You can upload a replacement afterwards.`}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={onDelete}
              disabled={deletePending}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 'var(--text-caption)', fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                background: '#DC2626', color: "var(--on-accent)", border: 'none',
                cursor: deletePending ? 'not-allowed' : 'pointer', opacity: deletePending ? 0.6 : 1,
              }}
            >
              {deletePending ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {deletePending ? (locale === 'ar' ? 'جارٍ الحذف…' : 'Deleting…') : (locale === 'ar' ? 'نعم، احذف' : 'Yes, delete')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deletePending}
              style={{
                fontSize: 'var(--text-caption)', fontWeight: 500, padding: '5px 12px', borderRadius: 6,
                background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              {locale === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Actions row — View/Download (when file present) + Edit/Delete (own uploads) */}
      {((doc.canView || doc.canDownload) && fileOpsEnabled) || doc.canEdit || doc.canDelete ? (
        <div style={{ display: 'flex', gap: 6,
        paddingTop: 4, borderTop: '1px solid var(--border)',
        marginTop: 2, flexWrap: 'wrap' }}>
          {(doc.canView || doc.canDownload) && fileOpsEnabled && (
            <>
              <button
                type="button"
                onClick={() => openDoc('view')}
                disabled={pending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 'var(--text-caption)', fontWeight: 500,
                  padding: '4px 10px', borderRadius: 6,
                  background: 'var(--accent-050)', color: 'var(--brand-active)',
                  border: '1px solid var(--accent-200)',
                  cursor: pending ? 'not-allowed' : 'pointer',
                  opacity: pending ? 0.6 : 1,
                }}
              >
                <Eye size={12} />
                {locale === 'ar' ? 'عرض' : 'View'}
              </button>
              <button
                type="button"
                onClick={() => openDoc('download')}
                disabled={pending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 'var(--text-caption)', fontWeight: 500,
                  padding: '4px 10px', borderRadius: 6,
                  background: 'var(--surface)', color: 'var(--ink-2)',
                  border: '1px solid var(--border)',
                  cursor: pending ? 'not-allowed' : 'pointer',
                  opacity: pending ? 0.6 : 1,
                }}
              >
                <Download size={12} />
                {locale === 'ar' ? 'تنزيل' : 'Download'}
              </button>
            </>
          )}

          {/* Edit metadata (own self-uploaded docs) */}
          {doc.canEdit && (
            <button
              type="button"
              onClick={() => { setAccessError(null); setEditOpen(true) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 'var(--text-caption)', fontWeight: 500, padding: '4px 10px', borderRadius: 6,
                background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <Pencil size={12} />
              {locale === 'ar' ? 'تعديل' : 'Edit'}
            </button>
          )}

          {/* Delete (own self-uploaded docs) */}
          {doc.canDelete && (
            <button
              type="button"
              onClick={() => { setAccessError(null); setConfirmDelete(true) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 'var(--text-caption)', fontWeight: 500, padding: '4px 10px', borderRadius: 6,
                background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5',
                cursor: 'pointer',
              }}
            >
              <Trash2 size={12} />
              {locale === 'ar' ? 'حذف' : 'Delete'}
            </button>
          )}

          {doc.source === 'SIGNED_LETTER' && (
            <span style={{ marginInlineStart: 'auto', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <BadgeCheck size={11} style={{ color: '#2563EB' }} />
              {locale === 'ar' ? 'موقّع' : 'Signed'}
            </span>
          )}
        </div>
      ) : null}

      {/* Edit metadata modal */}
      {editOpen && (
        <EditDocumentModal
          doc={doc}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); router.refresh() }}
        />
      )}
    </div>
  )
}

function MetaItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: 'var(--ink-3)', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{label}:&nbsp;</span>
      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}

// ── Document section (collapsible) ────────────────────────────────────────────

function DocumentSection({
  meta,
  docs,
  onUploadClick,
  fileOpsEnabled = true,
}: {
  meta:            CategoryMeta
  docs:            EmployeeDocumentRow[]
  onUploadClick:   (category: DocumentCategory) => void
  fileOpsEnabled?: boolean
}) {
  const locale = useLocale()
  const [expanded, setExpanded] = useState(docs.length > 0)

  const expiringCount = docs.filter(d => d.status === 'EXPIRING_SOON' || d.status === 'EXPIRING').length
  const expiredCount  = docs.filter(d => d.status === 'EXPIRED').length
  const canUpload = UPLOADABLE_CATEGORIES.has(meta.code)

  return (
    <section style={{ marginBottom: 12 }}>
      {/* Section header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          width:           '100%',
          display:         'flex',
          alignItems:      'center',
          gap:             10,
          padding:         '10px 14px',
          background:      expanded ? 'var(--surface)' : 'var(--card)',
          border:          '1px solid var(--border)',
          borderRadius:    expanded ? '8px 8px 0 0' : 8,
          cursor:          'pointer',
          textAlign:       'left',
        }}
        aria-expanded={expanded}
      >
        {/* Icon */}
        <span style={{ color: 'var(--brand-active)', flexShrink: 0 }}>
          {CAT_ICONS[meta.code] ?? <Paperclip size={15} />}
        </span>

        {/* Label */}
        <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{locale === 'ar' ? meta.labelAr : meta.labelEn}</span>
        {locale !== 'ar' && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl' }} dir="rtl" lang="ar">{meta.labelAr}</span>}

        {/* Count badge */}
        <span style={{
          fontSize: 'var(--text-caption)', fontWeight: 600,
          padding: '1px 7px', borderRadius: 10,
          background: docs.length > 0 ? 'var(--accent-100)' : 'var(--surface)',
          color: docs.length > 0 ? 'var(--brand-active)' : 'var(--ink-3)',
          border: '1px solid var(--border)',
          marginInlineStart: 4,
        }}>
          {docs.length}
        </span>

        {/* Warning indicators */}
        {expiredCount > 0 && (
          <span style={{ fontSize: 'var(--text-caption)', color: '#DC2626', display: 'flex', alignItems: 'center', gap: 3 }}>
            <AlertTriangle size={11} />
            {locale === 'ar' ? `${expiredCount} منتهية` : `${expiredCount} expired`}
          </span>
        )}
        {expiringCount > 0 && expiredCount === 0 && (
          <span style={{ fontSize: 'var(--text-caption)', color: '#D97706', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={11} />
            {locale === 'ar' ? `${expiringCount} تنتهي قريباً` : `${expiringCount} expiring`}
          </span>
        )}

        {/* Upload button (right-aligned) — hidden when file ops not enabled */}
        {canUpload && fileOpsEnabled && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onUploadClick(meta.code) }}
            style={{
              marginInlineStart: 'auto',
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 'var(--text-caption)', fontWeight: 500,
              padding: '3px 10px', borderRadius: 6,
              background: 'var(--accent)', color: "var(--on-accent)",
              border: 'none', cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Upload size={11} />
            {locale === 'ar' ? 'رفع' : 'Upload'}
          </button>
        )}

        {/* Chevron — always present; auto-margin when upload button absent */}
        {(!canUpload || !fileOpsEnabled) && (
          <span style={{ marginInlineStart: 'auto', color: 'var(--ink-3)' }}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        )}
        {canUpload && fileOpsEnabled && (
          <span style={{ color: 'var(--ink-3)', marginInlineStart: 4 }}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        )}
      </button>

      {/* Section body */}
      {expanded && (
        <div style={{
          borderRightWidth: "1px",
          borderRightStyle: "solid",
          borderRightColor: "var(--border)",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: "var(--border)",
          borderLeftWidth: "1px",
          borderLeftStyle: "solid",
          borderLeftColor: "var(--border)",
          borderTopWidth: "0px",
          borderTopStyle: "none",
          borderTopColor: "currentColor",
          borderRadius: '0 0 8px 8px',
          padding:      14,
          background:   'var(--card)',
        }}>
          {docs.length === 0 ? (
            <div style={{
              padding:      '20px 16px',
              textAlign:    'center',
              color:        'var(--ink-3)',
              fontSize:     'var(--text-body)',
              background:   'var(--surface)',
              border:       '1px dashed var(--border)',
              borderRadius: 8,
            }}>
              {locale === 'ar' ? `لا توجد ${meta.labelAr} في الملف.` : `No ${meta.labelEn.toLowerCase()} on file.`}
              {canUpload && fileOpsEnabled && (
                <button
                  type="button"
                  onClick={() => onUploadClick(meta.code)}
                  style={{
                    display: 'block', margin: '8px auto 0',
                    fontSize: 'var(--text-caption)', fontWeight: 500,
                    padding: '5px 14px', borderRadius: 6,
                    background: 'var(--accent-050)', color: 'var(--brand-active)',
                    border: '1px solid var(--accent-200)', cursor: 'pointer',
                  }}
                >
                  <Upload size={11} style={{ display: 'inline', marginInlineEnd: 4, verticalAlign: 'middle' }} />
                  {locale === 'ar' ? `رفع ${meta.labelAr}` : `Upload ${meta.labelEn}`}
                </button>
              )}
            </div>
          ) : (
            <div data-responsive-grid="true" style={{
              display:               'grid',
              gridTemplateColumns:   'repeat(auto-fill, minmax(260px, 1fr))',
              gap:                   12,
            }}>
              {docs.map(d => <DocumentCard key={d.id} doc={d} fileOpsEnabled={fileOpsEnabled} />)}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── Upload modal ──────────────────────────────────────────────────────────────

const ACCEPT_ATTR = ALLOWED_DOCUMENT_MIME_TYPES.join(',')

function UploadModal({
  personId,
  defaultCategory,
  onClose,
  onSuccess,
}: {
  personId:        string
  defaultCategory: DocumentCategory | null
  onClose:         () => void
  onSuccess:       () => void
}) {
  const locale = useLocale()
  const [pending, start] = useTransition()
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile]         = useState<File | null>(null)
  const [docType, setDocType]   = useState('')
  const [docTitle, setDocTitle] = useState('')
  const [docNumber, setDocNumber] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes]         = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState<'persisted' | 'temporary' | false>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filter uploadable types — optionally by category
  const uploadableTypes = EMPLOYEE_UPLOADABLE_TYPES.map(code => ({
    code,
    labelEn: getDocTypeLabel(code),
    labelAr: getDocTypeLabelAr(code),
  })).sort((a, b) => a.labelEn.localeCompare(b.labelEn))

  function pickFile(f: File | null) {
    setError(null)
    if (!f) { setFile(null); return }
    if (f.size > MAX_DOCUMENT_BYTES) {
      setError(locale === 'ar' ? `يتجاوز الملف الحد الأقصى ${MAX_DOCUMENT_BYTES / 1024 / 1024} ميجابايت.` : `File exceeds ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB limit.`); return
    }
    if (f.size === 0) { setError(locale === 'ar' ? 'الملف فارغ.' : 'File is empty.'); return }
    if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(f.type)) {
      setError(locale === 'ar' ? `نوع غير مدعوم (${f.type || 'غير معروف'}). استخدم PDF أو JPEG أو PNG أو DOCX.` : `Unsupported type (${f.type || 'unknown'}). Use PDF, JPEG, PNG, or DOCX.`); return
    }
    setFile(f)
    // Auto-fill title from filename (strip extension)
    if (!docTitle) {
      setDocTitle(f.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '))
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragOver(false)
    pickFile(e.dataTransfer.files[0] ?? null)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!file)    { setError(locale === 'ar' ? 'يرجى اختيار ملف.' : 'Please select a file.'); return }
    if (!docType) { setError(locale === 'ar' ? 'يرجى اختيار نوع الوثيقة.' : 'Please select a document type.'); return }
    if (!docTitle.trim()) { setError(locale === 'ar' ? 'يرجى إدخال عنوان الوثيقة.' : 'Please enter a document title.'); return }

    const fd = new FormData()
    fd.append('file', file)
    fd.append('metadata', JSON.stringify({
      personId,
      documentType:  docType,
      documentTitle: docTitle.trim(),
      documentNumber: docNumber.trim() || undefined,
      issueDate:     issueDate || undefined,
      expiryDate:    expiryDate || undefined,
      notes:         notes.trim() || undefined,
    }))

    start(async () => {
      // uploadMyDocument returns { error } on failure rather than throwing,
      // so the real error message is not sanitized by Next.js 15 in production.
      const result = await uploadMyDocument(fd)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setSuccess(result.isTemporaryStorage ? 'temporary' : 'persisted')
      setTimeout(() => { onSuccess(); onClose() }, result.isTemporaryStorage ? 2500 : 1200)
    })
  }

  return (
    <div
      style={{
        position:       'fixed', inset: 0, zIndex: 9999,
        background:     'rgba(0,0,0,0.45)',
        display:        'flex', alignItems: 'center', justifyContent: 'center',
        padding:        16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={locale === 'ar' ? 'رفع وثيقة' : 'Upload Document'}
    >
      <div style={{
        background:   'var(--card)',
        border:       '1px solid var(--border)',
        borderRadius: 14,
        width:        '100%',
        maxWidth:     540,
        maxHeight:    '90vh',
        overflowY:    'auto',
        boxShadow:    '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Modal header */}
        <div style={{
          display:      'flex', alignItems: 'center', justifyContent: 'space-between',
          padding:      '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload size={18} style={{ color: 'var(--brand-active)' }} />
            <SectionTitle style={{ margin: 0, fontSize: 'var(--text-lead)', fontWeight: 700, color: 'var(--ink-1)' }}>
              {locale === 'ar' ? 'رفع وثيقة' : 'Upload Document'}
            </SectionTitle>
            {locale !== 'ar' && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">رفع وثيقة</span>}
          </div>
          <button
            type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}
            aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} style={{ padding: '20px' }}>
          {success === 'persisted' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 16px', borderRadius: 8,
              marginBottom: 16,
              background: '#DCFCE7', color: '#15803D', fontSize: 'var(--text-body)', fontWeight: 500,
            }}>
              <CheckCircle size={16} />
              {locale === 'ar' ? 'تم رفع الوثيقة بنجاح!' : 'Document uploaded successfully!'}
            </div>
          )}
          {success === 'temporary' && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '12px 16px', borderRadius: 8,
              marginBottom: 16,
              background: '#FEF3C7', color: '#92400E', fontSize: 'var(--text-body)', fontWeight: 500,
              border: '1px solid #FCD34D',
            }}>
              <AlertTriangle size={16} style={{ color: '#D97706', flexShrink: 0,
              marginTop: 1 }} />
              <span>
                {locale === 'ar' ? (
                  <>
                    <strong>تم الحفظ (تخزين UAT مؤقت)</strong>
                    {' — '}
                    تم إنشاء سجل الوثيقة، لكن الملف مخزّن في ذاكرة الخادم المؤقتة
                    و<strong>لن يبقى</strong> بعد إعادة النشر التالية أو إعادة تشغيل الخادم.
                  </>
                ) : (
                  <>
                    <strong>Saved (UAT temporary storage)</strong>
                    {' — '}
                    The document record was created, but the file is stored in temporary server memory
                    and <strong>will not persist</strong> after the next redeployment or server restart.
                  </>
                )}
              </span>
            </div>
          )}

          {/* Drag & drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border:       `2px dashed ${dragOver ? 'var(--accent)' : file ? '#22C55E' : 'var(--border)'}`,
              borderRadius: 10,
              padding:      '20px 16px',
              textAlign:    'center',
              cursor:       'pointer',
              background:   dragOver ? 'var(--accent-050)' : file ? '#F0FDF4' : 'var(--surface)',
              transition:   'all 0.15s',
              marginBottom: 16,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              style={{ display: 'none' }}
              onChange={e => pickFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <CheckCircle size={24} style={{ color: '#22C55E' }} />
                <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>{file.name}</span>
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{fmtBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  style={{ fontSize: 'var(--text-caption)', color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer',
                  marginTop: 4 }}
                >
                  {locale === 'ar' ? 'إزالة الملف' : 'Remove file'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Upload size={28} style={{ color: 'var(--ink-3)' }} />
                <span style={{ fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-2)' }}>
                  {locale === 'ar'
                    ? <>اسحب وأفلت أو <span style={{ color: 'var(--brand-active)', fontWeight: 600 }}>تصفّح الملفات</span></>
                    : <>Drag &amp; drop or <span style={{ color: 'var(--brand-active)', fontWeight: 600 }}>browse file</span></>}
                </span>
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                  {locale === 'ar' ? 'PDF، JPEG، PNG، DOCX · بحد أقصى 10 ميجابايت' : 'PDF, JPEG, PNG, DOCX · max 10 MB'}
                </span>
              </div>
            )}
          </div>

          {/* Document type */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
            marginBottom: 5 }}>
              {locale === 'ar' ? 'نوع الوثيقة' : 'Document Type'} <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <select
              value={docType}
              onChange={e => {
                setDocType(e.target.value)
                if (!docTitle) setDocTitle(getDocTypeLabel(e.target.value))
              }}
              required
              style={{
                width:        '100%',
                padding:      '8px 12px',
                borderRadius: 7,
                border:       '1px solid var(--border)',
                background:   'var(--surface)',
                color:        'var(--ink-1)',
                fontSize:     'var(--text-body)',
                outline:      'none',
              }}
            >
              <option value="">{locale === 'ar' ? 'اختر نوع الوثيقة…' : 'Select document type…'}</option>
              {uploadableTypes.map(t => (
                <option key={t.code} value={t.code}>{t.labelEn} — {t.labelAr}</option>
              ))}
            </select>
          </div>

          {/* Document title */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
            marginBottom: 5 }}>
              {locale === 'ar' ? 'عنوان الوثيقة' : 'Document Title'} <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              type="text"
              value={docTitle}
              onChange={e => setDocTitle(e.target.value)}
              maxLength={200}
              placeholder={locale === 'ar' ? 'مثال: جواز السفر – الأساسي' : 'e.g. Passport – primary'}
              required
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--ink-1)', fontSize: 'var(--text-body)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Document number + dates */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
          marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
              marginBottom: 5 }}>
                {locale === 'ar' ? 'رقم الوثيقة' : 'Document Number'}
              </label>
              <input
                type="text"
                value={docNumber}
                onChange={e => setDocNumber(e.target.value)}
                maxLength={100}
                placeholder="e.g. A12345678"
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--ink-1)', fontSize: 'var(--text-body)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
              marginBottom: 5 }}>
                {locale === 'ar' ? 'تاريخ الإصدار' : 'Issue Date'}
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--ink-1)', fontSize: 'var(--text-body)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
            marginBottom: 5 }}>
              {locale === 'ar' ? 'تاريخ الانتهاء' : 'Expiry Date'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontWeight: 400 }}>{locale === 'ar' ? '(مطلوب لجوازات السفر والتأشيرات وغيرها)' : '(required for passports, visas, etc.)'}</span>
            </label>
            <input
              type="date"
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--ink-1)', fontSize: 'var(--text-body)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
            marginBottom: 5 }}>
              {locale === 'ar' ? 'ملاحظات' : 'Notes'}
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder={locale === 'ar' ? 'ملاحظات اختيارية…' : 'Optional notes…'}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--ink-1)', fontSize: 'var(--text-body)', outline: 'none',
                resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              marginBottom: 14,
              background: '#FEE2E2', color: '#DC2626',
              fontSize: 'var(--text-caption)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button" onClick={onClose}
              disabled={pending}
              style={{
                padding: '8px 18px', borderRadius: 7, fontSize: 'var(--text-body)', fontWeight: 500,
                background: 'var(--surface)', color: 'var(--ink-2)',
                border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              {locale === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={pending || !file || !!success}
              style={{
                padding: '8px 20px', borderRadius: 7, fontSize: 'var(--text-body)', fontWeight: 600,
                background: pending || success ? 'var(--ink-3)' : 'var(--accent)',
                color: "var(--on-accent)", border: 'none',
                cursor: pending || success ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {pending ? <><RefreshCw size={13} className="animate-spin" />{locale === 'ar' ? 'جارٍ الرفع…' : 'Uploading…'}</> : (locale === 'ar' ? 'رفع الوثيقة' : 'Upload Document')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit metadata modal ───────────────────────────────────────────────────────

function EditDocumentModal({
  doc,
  onClose,
  onSaved,
}: {
  doc:     EmployeeDocumentRow
  onClose: () => void
  onSaved: () => void
}) {
  const locale = useLocale()
  const [pending, start]  = useTransition()
  const [title, setTitle] = useState(doc.title ?? '')
  const [number, setNumber]     = useState(doc.documentNumber ?? '')
  const [issueDate, setIssueDate]   = useState((doc.issuedDate ?? '').slice(0, 10))
  const [expiryDate, setExpiryDate] = useState((doc.expiryDate ?? '').slice(0, 10))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError(locale === 'ar' ? 'يرجى إدخال عنوان الوثيقة.' : 'Please enter a document title.'); return }
    if (issueDate && expiryDate && expiryDate < issueDate) {
      setError(locale === 'ar' ? 'لا يمكن أن يكون تاريخ الانتهاء قبل تاريخ الإصدار.' : 'Expiry date cannot be before the issue date.'); return
    }
    start(async () => {
      const result = await updateMyDocumentMeta(doc.id, {
        documentTitle:  title.trim(),
        documentNumber: number.trim() || null,
        issueDate:      issueDate || null,
        expiryDate:     expiryDate || null,
        notes:          notes.trim() || null,
      })
      if ('error' in result) { setError(result.error); return }
      onSaved()
    })
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog" aria-modal="true" aria-label={locale === 'ar' ? 'تعديل الوثيقة' : 'Edit Document'}
    >
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
        width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pencil size={18} style={{ color: 'var(--brand-active)' }} />
            <SectionTitle style={{ margin: 0, fontSize: 'var(--text-lead)', fontWeight: 700, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'تعديل المستند' : 'Edit Document'}</SectionTitle>
            {locale !== 'ar' && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">تعديل الوثيقة</span>}
          </div>
          <button type="button" onClick={onClose} aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ padding: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
            marginBottom: 5 }}>
              {locale === 'ar' ? 'عنوان الوثيقة' : 'Document Title'} <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--ink-1)', fontSize: 'var(--text-body)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
            marginBottom: 5 }}>
              {locale === 'ar' ? 'رقم الوثيقة' : 'Document Number'}
            </label>
            <input
              type="text" value={number} onChange={e => setNumber(e.target.value)} maxLength={100}
              placeholder="e.g. A12345678"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--ink-1)', fontSize: 'var(--text-body)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Start (issue) + End (expiry) dates together */}
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
          marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
              marginBottom: 5 }}>
                {locale === 'ar' ? 'تاريخ البدء' : 'Start Date'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontWeight: 400 }}>{locale === 'ar' ? '(الإصدار)' : '(issue)'}</span>
              </label>
              <input
                type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--ink-1)', fontSize: 'var(--text-body)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
              marginBottom: 5 }}>
                {locale === 'ar' ? 'تاريخ الانتهاء' : 'End Date'} <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontWeight: 400 }}>{locale === 'ar' ? '(الانتهاء)' : '(expiry)'}</span>
              </label>
              <input
                type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--ink-1)', fontSize: 'var(--text-body)', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
            marginBottom: 5 }}>
              {locale === 'ar' ? 'ملاحظات' : 'Notes'}
            </label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} rows={2}
              placeholder={locale === 'ar' ? 'ملاحظات اختيارية…' : 'Optional notes…'}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--ink-1)', fontSize: 'var(--text-body)', outline: 'none',
                resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              marginBottom: 14,
              background: '#FEE2E2', color: '#DC2626', fontSize: 'var(--text-caption)', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button" onClick={onClose} disabled={pending}
              style={{
                padding: '8px 18px', borderRadius: 7, fontSize: 'var(--text-body)', fontWeight: 500,
                background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border)', cursor: 'pointer',
              }}
            >
              {locale === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit" disabled={pending}
              style={{
                padding: '8px 20px', borderRadius: 7, fontSize: 'var(--text-body)', fontWeight: 600,
                background: pending ? 'var(--ink-3)' : 'var(--accent)', color: "var(--on-accent)", border: 'none',
                cursor: pending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {pending ? <><RefreshCw size={13} className="animate-spin" />{locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…'}</> : (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Analytics sidebar ─────────────────────────────────────────────────────────

function AnalyticsSidebar({
  analytics,
  onUploadClick,
  onFilterExpiring,
  fileOpsEnabled = true,
}: {
  analytics:         DocumentAnalytics
  onUploadClick:     () => void
  onFilterExpiring:  () => void
  fileOpsEnabled?:   boolean
}) {
  const locale = useLocale()
  // Compliance status dot color
  function complianceDot(status: string): string {
    if (status === 'EXPIRED' || status === 'MISSING') return '#DC2626'
    if (status === 'EXPIRING_SOON' || status === 'EXPIRING') return '#D97706'
    if (status === 'VALID') return '#22C55E'
    return '#9CA3AF'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Document summary */}
      <div style={{
        background:   'var(--card)',
        border:       '1px solid var(--border)',
        borderRadius: 12,
        padding:      '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 12 }}>
          <FileText size={14} style={{ color: 'var(--brand-active)' }} />
          <span style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'ملخص الوثائق' : 'Document Summary'}</span>
          {locale !== 'ar' && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">ملخص الوثائق</span>}
        </div>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <SummaryTile label="Total" labelAr="الإجمالي"   value={analytics.total}        color="var(--ink-1)" />
          <SummaryTile label="Valid" labelAr="صالحة"       value={analytics.valid}        color="#22C55E" />
          <SummaryTile label="Expiring" labelAr="تنتهي قريباً" value={analytics.expiringSoon} color="#D97706" />
          <SummaryTile label="Expired" labelAr="منتهية"   value={analytics.expired}      color="#DC2626" />
        </div>
        {analytics.missingMandatory.length > 0 && (
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 7,
            background: '#FEE2E2', border: '1px solid #FCA5A5', fontSize: 'var(--text-caption)', color: '#DC2626',
          }}>
            <AlertTriangle size={11} style={{ display: 'inline', marginInlineEnd: 4 }} />
            <strong>{locale === 'ar' ? `${analytics.missingMandatory.length} وثيقة مطلوبة مفقودة:` : `${analytics.missingMandatory.length} required document${analytics.missingMandatory.length > 1 ? 's' : ''} missing:`}</strong>
            <span style={{ marginInlineStart: 4 }}>
              {analytics.missingMandatory.map(c => locale === 'ar' ? getDocTypeLabelAr(c) : getDocTypeLabel(c)).join('، ')}
            </span>
          </div>
        )}
      </div>

      {/* Compliance status */}
      <div style={{
        background:   'var(--card)',
        border:       '1px solid var(--border)',
        borderRadius: 12,
        padding:      '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 12 }}>
          <Shield size={14} style={{ color: 'var(--brand-active)' }} />
          <span style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'حالة الامتثال' : 'Compliance Status'}</span>
          {locale !== 'ar' && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">حالة الامتثال</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {analytics.complianceDocs.map(cd => (
            <div key={cd.typeCode} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: complianceDot(cd.status),
                }} />
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {locale === 'ar' ? getDocTypeLabelAr(cd.typeCode) : cd.labelEn}
                </span>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {cd.status === 'MISSING' ? (
                  <span style={{ fontSize: 'var(--text-caption)', color: '#DC2626', fontWeight: 600 }}>{locale === 'ar' ? 'مفقود' : 'Missing'}</span>
                ) : cd.daysLeft !== null ? (
                  <span style={{
                    fontSize: 'var(--text-caption)', fontWeight: 600,
                    color: cd.daysLeft < 0 ? '#DC2626' : cd.daysLeft <= 30 ? '#D97706' : cd.daysLeft <= EXPIRY_WARN_DAYS ? '#D97706' : '#15803D',
                  }}>
                    {cd.daysLeft < 0
                      ? (locale === 'ar' ? `متأخر ${Math.abs(cd.daysLeft)} يوماً` : `${Math.abs(cd.daysLeft)}d overdue`)
                      : cd.daysLeft === 0
                        ? (locale === 'ar' ? 'ينتهي اليوم' : 'Expires today')
                        : (locale === 'ar' ? `${cd.daysLeft} يوماً متبقياً` : `${cd.daysLeft}d left`)}
                  </span>
                ) : (
                  <span style={{ fontSize: 'var(--text-caption)', color: '#15803D', fontWeight: 600 }}>{locale === 'ar' ? 'سليم' : 'OK'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{
        background:   'var(--card)',
        border:       '1px solid var(--border)',
        borderRadius: 12,
        padding:      '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 12 }}>
          <ZoomIn size={14} style={{ color: 'var(--brand-active)' }} />
          <span style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'إجراءات سريعة' : 'Quick Actions'}</span>
          {locale !== 'ar' && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">إجراءات سريعة</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {fileOpsEnabled && (
            <QuickAction icon={<Upload size={13} />}   label="Upload Document"    labelAr="رفع وثيقة"       onClick={onUploadClick} />
          )}
          {analytics.expiringSoon > 0 && (
            <QuickAction icon={<Clock size={13} />}  label={`View ${analytics.expiringSoon} Expiring`} labelAr={`عرض ${analytics.expiringSoon} وثيقة تنتهي قريباً`} onClick={onFilterExpiring} />
          )}
          <a
            href="/me/letters"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 7,
              background: 'var(--surface)', border: '1px solid var(--border)',
              fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--ink-2)',
              textDecoration: 'none', cursor: 'pointer',
            }}
          >
            <FileText size={13} style={{ color: 'var(--brand-active)' }} />
            <span style={{ flex: 1 }}>{locale === 'ar' ? 'طلب خطاب' : 'Request a Letter'}</span>
            {locale !== 'ar' && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">طلب خطاب</span>}
          </a>
        </div>
      </div>

      {/* Info footer */}
      <div style={{
        padding:      '10px 14px',
        borderRadius: 10,
        background:   'var(--surface)',
        border:       '1px solid var(--border)',
        fontSize:     'var(--text-caption)',
        color:        'var(--ink-3)',
        lineHeight:   1.5,
        display:      'flex',
        alignItems:   'flex-start',
        gap:          6,
      }}>
        <Info size={12} style={{ flexShrink: 0,
        marginTop: 1 }} />
        <span>
          {locale === 'ar'
            ? 'روابط التنزيل موقّعة، وتنتهي صلاحيتها خلال 15 دقيقة، وتُسجَّل في سجل التدقيق عند كل وصول. تواصل مع الموارد البشرية بشأن الوثائق التي لا يمكنك رفعها بنفسك.'
            : 'Download links are signed, expire in 15 minutes, and are audit-logged on each access. Contact HR for documents you cannot upload yourself.'}
        </span>
      </div>
    </div>
  )
}

function SummaryTile({ label, labelAr, value, color }: { label: string; labelAr: string; value: number; color: string }) {
  const locale = useLocale()
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: 'var(--surface)', border: '1px solid var(--border)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'var(--font-serif)' }}>{value}</div>
      <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
      marginTop: 1 }}>{locale === 'ar' ? labelAr : label}</div>
      {locale !== 'ar' && <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">{labelAr}</div>}
    </div>
  )
}

function QuickAction({ icon, label, labelAr, onClick }: { icon: React.ReactNode; label: string; labelAr: string; onClick: () => void }) {
  const locale = useLocale()
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 7,
        background: 'var(--surface)', border: '1px solid var(--border)',
        fontSize: 'var(--text-caption)', fontWeight: 500, color: 'var(--ink-2)',
        cursor: 'pointer', width: '100%', textAlign: 'left',
      }}
    >
      <span style={{ color: 'var(--brand-active)' }}>{icon}</span>
      <span style={{ flex: 1 }}>{locale === 'ar' ? labelAr : label}</span>
      {locale !== 'ar' && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }} dir="rtl" lang="ar">{labelAr}</span>}
    </button>
  )
}

// ── Main page client ──────────────────────────────────────────────────────────

interface Props {
  personId:      string | null
  personNumber:  string | null
  personNameEn:  string | null
  documents:     EmployeeDocumentRow[]
  analytics:     DocumentAnalytics
  categoryMeta:  CategoryMeta[]
  /**
   * Storage UI state — controls banners and whether file operation buttons
   * (Upload / View / Download) are shown.
   *
   *  operational:    Durable provider (azure/aws) configured. Full ops, no banner.
   *  uat-temporary:  Local/tmp storage. Amber UAT warning banner. Ops allowed.
   *  not-configured: Durable mode required but no provider set. Red banner. Ops blocked.
   *  disabled:       File ops explicitly disabled. Gray banner. Ops blocked.
   */
  storageStatus: StorageUIState
}

export function DocumentsPageClient({
  personId,
  personNumber,
  personNameEn,
  documents,
  analytics,
  categoryMeta,
  storageStatus,
}: Props) {
  // Derived: whether upload/view/download buttons should be shown
  const fileOpsEnabled = storageStatus !== 'not-configured' && storageStatus !== 'disabled'
  const locale = useLocale()
  const router = useRouter()
  const [uploadModal, setUploadModal]         = useState(false)
  const [uploadCategory, setUploadCategory]   = useState<DocumentCategory | null>(null)
  const [filterExpiring, setFilterExpiring]   = useState(false)

  function openUpload(cat?: DocumentCategory) {
    setUploadCategory(cat ?? null)
    setUploadModal(true)
  }

  // Group documents by category (ordered by CATEGORY_META order)
  const grouped = categoryMeta.map(meta => ({
    meta,
    docs: documents.filter(d => {
      const matches = d.category === meta.code
      if (!matches) return false
      if (filterExpiring) return d.status === 'EXPIRING_SOON' || d.status === 'EXPIRING' || d.status === 'EXPIRED'
      return true
    }),
  }))

  // Only show categories that have docs OR are uploadable by employee
  const visibleCategories = grouped.filter(g =>
    g.docs.length > 0 || UPLOADABLE_CATEGORIES.has(g.meta.code)
  )

  return (
    <div style={{ padding: '24px 28px' }} className="page-in">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FolderOpen size={22} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />
          <PageTitle style={{
            margin: 0, fontSize: 22, fontWeight: 700,
            color: 'var(--ink-1)', fontFamily: 'var(--font-serif)',
          }}>
            {locale === 'ar' ? 'وثائقي' : 'My Documents'}
          </PageTitle>
          {locale !== 'ar' && <span style={{
            fontSize: 'var(--text-body)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)',
          }} dir="rtl" lang="ar">
            وثائقي
          </span>}
        </div>
        {personId && fileOpsEnabled && (
          <button
            type="button"
            onClick={() => openUpload()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 8,
              background: 'var(--accent)', color: "var(--on-accent)",
              border: 'none', cursor: 'pointer',
              fontSize: 'var(--text-body)', fontWeight: 600,
              boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
            }}
          >
            <Upload size={14} />
            {locale === 'ar' ? 'رفع وثيقة' : 'Upload Document'}
          </button>
        )}
      </div>

      {personNumber && (
        <p style={{ margin: '0 0 20px', fontSize: 'var(--text-body)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
          {personNumber} · {personNameEn ?? '—'}
        </p>
      )}

      {/* ── Storage not configured — hard block (red) ───────────────────── */}
      {storageStatus === 'not-configured' && (
        <div style={{
          display:      'flex',
          alignItems:   'flex-start',
          gap:          10,
          padding:      '14px 18px',
          marginBottom: 16,
          background:   '#FEF2F2',
          borderTopWidth: "1px",
          borderTopStyle: "solid",
          borderTopColor: "#FCA5A5",
          borderRightWidth: "1px",
          borderRightStyle: "solid",
          borderRightColor: "#FCA5A5",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: "#FCA5A5",
          borderLeftWidth: "4px",
          borderLeftStyle: "solid",
          borderLeftColor: "#DC2626",
          borderRadius: 8,
          fontSize:     'var(--text-body)',
          color:        '#7F1D1D',
        }} role="alert">
          <AlertTriangle size={16} style={{ color: '#DC2626', flexShrink: 0,
          marginTop: 1 }} />
          <div>
            <strong style={{ fontWeight: 700 }}>{locale === 'ar' ? 'تخزين الوثائق غير مُهيّأ' : 'Document Storage Not Configured'}</strong>
            <br />
            {locale === 'ar'
              ? 'الرفع والعرض والتنزيل معطّلة. يجب تهيئة مزوّد تخزين كائنات دائم (Azure Blob Storage أو AWS S3) قبل أن تصبح عمليات الملفات متاحة. تظل سجلات الوثائق وبياناتها الوصفية مرئية أدناه.'
              : 'Upload, view and download are disabled. A durable object storage provider (Azure Blob Storage or AWS S3) must be configured before file operations are available. Document records and metadata are still visible below.'}
            {' '}{locale === 'ar' ? 'اضبط' : 'Set'}{' '}
            <code style={{ fontSize: 'var(--text-caption)', background: '#FEE2E2', padding: '1px 4px', borderRadius: 3 }}>
              DOCUMENT_STORAGE_MODE=uat-temporary
            </code>
            {' '}{locale === 'ar' ? 'للسماح بعمليات الملفات مع تحذير UAT، أو هيّئ' : 'to allow file ops with a UAT warning, or configure'}{' '}
            <code style={{ fontSize: 'var(--text-caption)', background: '#FEE2E2', padding: '1px 4px', borderRadius: 3 }}>
              DOCUMENT_STORAGE_PROVIDER=azure
            </code>
            {' '}{locale === 'ar' ? 'أو' : 'or'}{' '}
            <code style={{ fontSize: 'var(--text-caption)', background: '#FEE2E2', padding: '1px 4px', borderRadius: 3 }}>
              aws
            </code>
            {' '}{locale === 'ar' ? 'للتخزين الدائم.' : 'for durable storage.'}
          </div>
        </div>
      )}

      {/* ── File operations disabled (gray) ─────────────────────────────── */}
      {storageStatus === 'disabled' && (
        <div style={{
          display:      'flex',
          alignItems:   'flex-start',
          gap:          10,
          padding:      '12px 16px',
          marginBottom: 16,
          background:   'var(--surface)',
          borderTopWidth: "1px",
          borderTopStyle: "solid",
          borderTopColor: "var(--border)",
          borderRightWidth: "1px",
          borderRightStyle: "solid",
          borderRightColor: "var(--border)",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: "var(--border)",
          borderLeftWidth: "4px",
          borderLeftStyle: "solid",
          borderLeftColor: "var(--ink-3)",
          borderRadius: 8,
          fontSize:     'var(--text-body)',
          color:        'var(--ink-2)',
        }} role="alert">
          <Info size={16} style={{ color: 'var(--ink-3)', flexShrink: 0,
          marginTop: 1 }} />
          <div>
            <strong style={{ fontWeight: 600 }}>{locale === 'ar' ? 'عمليات ملفات الوثائق معطّلة' : 'Document File Operations Disabled'}</strong>
            {' — '}
            {locale === 'ar' ? 'تم تعطيل الرفع والعرض والتنزيل لهذه البيئة' : 'Upload, view and download have been disabled for this environment'}
            {' '}(<code style={{ fontSize: 'var(--text-caption)', background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>
              DOCUMENT_STORAGE_MODE=disabled
            </code>).{' '}{locale === 'ar' ? 'تظل سجلات الوثائق وبياناتها الوصفية مرئية أدناه. تواصل مع مسؤول النظام لتغيير هذا الإعداد.' : 'Document records and metadata are still visible below. Contact your system administrator to change this setting.'}
          </div>
        </div>
      )}

      {/* ── UAT temporary storage — amber warning (upload/view/download allowed) */}
      {storageStatus === 'uat-temporary' && (
        <div style={{
          display:      'flex',
          alignItems:   'flex-start',
          gap:          10,
          padding:      '12px 16px',
          marginBottom: 16,
          background:   '#FFFBEB',
          borderTopWidth: "1px",
          borderTopStyle: "solid",
          borderTopColor: "#FCD34D",
          borderRightWidth: "1px",
          borderRightStyle: "solid",
          borderRightColor: "#FCD34D",
          borderBottomWidth: "1px",
          borderBottomStyle: "solid",
          borderBottomColor: "#FCD34D",
          borderLeftWidth: "4px",
          borderLeftStyle: "solid",
          borderLeftColor: "#D97706",
          borderRadius: 8,
          fontSize:     'var(--text-body)',
          color:        '#92400E',
        }} role="alert">
          <AlertTriangle size={16} style={{ color: '#D97706', flexShrink: 0,
          marginTop: 1 }} />
          <div>
            <strong style={{ fontWeight: 600 }}>{locale === 'ar' ? 'تخزين UAT مؤقت' : 'UAT Temporary Storage'}</strong>
            {' — '}
            {locale === 'ar'
              ? <>الرفع والعرض والتنزيل <strong>مفعّلة</strong> للاختبار، لكن الملفات مخزّنة في ذاكرة الخادم المؤقتة (</>
              : <>Upload, view and download are <strong>enabled</strong> for testing, but files are stored in temporary server memory (</>}
            <code style={{ fontSize: 'var(--text-caption)', background: '#FEF3C7', padding: '1px 4px', borderRadius: 3 }}>
              DOCUMENT_STORAGE_PROVIDER=local
            </code>
            ).{' '}
            {locale === 'ar'
              ? <><strong>قد تصبح الملفات غير متاحة فوراً</strong> بسبب عزل حاوية الخوادم بدون خادم أو بعد إعادة النشر. ستبقى البيانات الوصفية للوثيقة في قاعدة البيانات — وقد يلزم إعادة رفع الملف نفسه. اضبط </>
              : <><strong>Files may become unavailable immediately</strong> due to serverless container isolation or after redeployment. Document metadata will remain in the database — the file itself may need to be re-uploaded. Set </>}
            <code style={{ fontSize: 'var(--text-caption)', background: '#FEF3C7', padding: '1px 4px', borderRadius: 3 }}>
              DOCUMENT_STORAGE_PROVIDER=azure
            </code>
            {' '}{locale === 'ar' ? 'أو' : 'or'}{' '}
            <code style={{ fontSize: 'var(--text-caption)', background: '#FEF3C7', padding: '1px 4px', borderRadius: 3 }}>
              aws
            </code>
            {' '}{locale === 'ar' ? 'قبل الانتقال إلى الإنتاج.' : 'before going to production.'}
          </div>
        </div>
      )}

      {!personId && (
        <div style={{
          padding: '16px 20px',
          marginBottom: 24,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, fontSize: 'var(--text-body)', color: 'var(--ink-2)',
        }}>
          {locale === 'ar' ? 'لم يتم إعداد ملفك الوظيفي بالكامل بعد. يرجى التواصل مع الموارد البشرية.' : 'Your employee profile is not fully set up yet. Please contact HR.'}
        </div>
      )}

      {/* Expiry filter banner */}
      {filterExpiring && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderRadius: 8,
          marginBottom: 16,
          background: '#FEF3C7', border: '1px solid #FCD34D', color: '#D97706', fontSize: 'var(--text-body)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} />
            {locale === 'ar' ? 'عرض الوثائق المنتهية والتي تنتهي قريباً فقط' : 'Showing only expiring & expired documents'}
          </span>
          <button
            type="button"
            onClick={() => setFilterExpiring(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D97706', display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-caption)' }}
          >
            <X size={13} /> {locale === 'ar' ? 'مسح التصفية' : 'Clear filter'}
          </button>
        </div>
      )}

      {/* ── Two-panel layout ───────────────────────────────────────── */}
      <div data-responsive-grid="true" style={{
        display:             'grid',
        gridTemplateColumns: '1fr 320px',
        gap:                 20,
        alignItems:          'start',
      }}>
        {/* LEFT: document workspace */}
        <div>
          {!personId ? null : visibleCategories.length === 0 ? (
            <div style={{
              padding:      '48px 32px', textAlign: 'center',
              background:   'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, color: 'var(--ink-3)', fontSize: 'var(--text-body)',
            }}>
              <FolderOpen size={40} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.4 }} />
              {locale === 'ar' ? 'لا توجد وثائق في الملف بعد.' : 'No documents on file yet.'}
              <br />
              {fileOpsEnabled && (
                <button
                  type="button"
                  onClick={() => openUpload()}
                  style={{
                    marginTop: 14, padding: '8px 20px', borderRadius: 8,
                    background: 'var(--accent)', color: "var(--on-accent)", border: 'none',
                    cursor: 'pointer', fontSize: 'var(--text-body)', fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Upload size={13} />
                  {locale === 'ar' ? 'ارفع أول وثيقة لك' : 'Upload your first document'}
                </button>
              )}
            </div>
          ) : (
            visibleCategories.map(({ meta, docs }) => (
              <DocumentSection
                key={meta.code}
                meta={meta}
                docs={docs}
                onUploadClick={cat => openUpload(cat)}
                fileOpsEnabled={fileOpsEnabled}
              />
            ))
          )}
        </div>

        {/* RIGHT: analytics sidebar */}
        {personId && (
          <AnalyticsSidebar
            analytics={analytics}
            onUploadClick={() => openUpload()}
            onFilterExpiring={() => setFilterExpiring(true)}
            fileOpsEnabled={fileOpsEnabled}
          />
        )}
      </div>

      {/* Upload modal — never shown when file ops are disabled */}
      {uploadModal && personId && fileOpsEnabled && (
        <UploadModal
          personId={personId}
          defaultCategory={uploadCategory}
          onClose={() => { setUploadModal(false); setUploadCategory(null) }}
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  )
}

// Keep backward-compat export for any code that imports DocumentsClient
export { DocumentsPageClient as DocumentsClient }
