'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateMyProfile, getDocumentDownloadUrl } from '@/modules/profile/actions'
import { ALLOWED_RELATIONSHIPS } from '@/modules/profile/constants'
import type { MyProfile } from '@/modules/profile/actions'
import type { AssignmentHistoryRow } from '@/modules/core-hr/assignment-history'
import { PhotoUploadWidget } from '@/app/(hr-admin)/persons/[id]/PhotoUploadWidget'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'

type Tab = 'personal' | 'employment' | 'history' | 'leave' | 'documents' | 'activity'

function fmtDMY(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtRelative(date: Date | string | null | undefined, locale = 'en'): string {
  if (!date) return ''
  const ar = locale === 'ar'
  const d = typeof date === 'string' ? new Date(date) : date
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1)  return ar ? 'الآن' : 'just now'
  if (diffMin < 60) return ar ? `قبل ${diffMin} دقيقة` : `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24)  return ar ? `قبل ${diffHr} ساعة` : `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return ar ? `قبل ${diffDay} يوم` : `${diffDay}d ago`
  return fmtDMY(d.toISOString().slice(0, 10))
}

function calcServiceLength(hireDate: string | null | undefined, locale = 'en'): string {
  if (!hireDate) return '—'
  const start = new Date(hireDate + 'T00:00:00')
  const now   = new Date()
  let years  = now.getFullYear() - start.getFullYear()
  let months = now.getMonth()    - start.getMonth()
  let days   = now.getDate()     - start.getDate()
  if (days < 0) {
    months--
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate()
  }
  if (months < 0) { years--; months += 12 }
  const ar = locale === 'ar'
  const parts: string[] = []
  if (years  > 0) parts.push(ar ? `${years} سنة`  : `${years} yr${years  !== 1 ? 's' : ''}`)
  if (months > 0) parts.push(ar ? `${months} شهر` : `${months} mo${months !== 1 ? 's' : ''}`)
  if (days   > 0 || parts.length === 0) parts.push(ar ? `${days} يوم` : `${days} day${days !== 1 ? 's' : ''}`)
  return parts.join(ar ? '، ' : ', ')
}

function getProbationStatus(probationEndDate: string | null | undefined, locale = 'en'): string {
  const ar = locale === 'ar'
  if (!probationEndDate) return ar ? 'غير منطبق' : 'Not Applicable'
  const end   = new Date(probationEndDate + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return end < today ? (ar ? 'مكتملة' : 'Completed') : (ar ? 'سارية' : 'Active')
}

function fmtHoursPerDay(h: number | null | undefined, locale = 'en'): string {
  if (h == null) return '—'
  const unit = locale === 'ar' ? 'ساعة' : 'hrs'
  return Number.isInteger(h) ? `${h} ${unit}` : `${h.toFixed(1)} ${unit}`
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function StatusPill({ status }: { status: string }) {
  const s = status?.toUpperCase()
  const style: React.CSSProperties =
    s === 'APPROVED' || s === 'ACTIVE'
      ? { background: 'var(--status-approved-bg)', color: 'var(--status-approved-fg)' }
      : s === 'PENDING'
      ? { background: 'var(--status-pending-bg)', color: 'var(--status-pending-fg)' }
      : { background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)' }
  return (
    <span style={{
      ...style,
      fontSize: 'var(--text-caption)', fontWeight: 600, padding: '2px 8px',
      borderRadius: 20, letterSpacing: 0.3, textTransform: 'capitalize',
      display: 'inline-block',
    }}>
      {status?.toLowerCase().replace(/_/g, ' ')}
    </span>
  )
}

function InfoIcon({ tip }: { tip: string }) {
  return (
    <span
      title={tip}
      aria-label={tip}
      style={{ display: 'inline-flex', cursor: 'help', color: 'var(--ink-4)', opacity: 0.55, lineHeight: 0, flexShrink: 0 }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </span>
  )
}

function Field({ label, value, tooltip }: { label: string; value: string | null | undefined; tooltip?: string }) {
  const empty = !value
  return (
    <div>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5,
      marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {tooltip && <InfoIcon tip={tooltip} />}
      </div>
      <div style={{ fontSize: 14, color: empty ? 'var(--ink-4)' : 'var(--ink-1)', lineHeight: '1.4' }}>
        {value || '—'}
      </div>
    </div>
  )
}

// ── Assignment history (shared, NON-SENSITIVE — no salary/compensation) ───────

function fmtPeriodEnd(end: string, locale: string): string {
  if (!end || end.startsWith('9999')) return locale === 'ar' ? 'الحالي' : 'Present'
  return fmtDMY(end)
}

function TemporalBadge({ state, locale }: { state: AssignmentHistoryRow['temporalState']; locale: string }) {
  const ar = locale === 'ar'
  const map = {
    CURRENT: { label: ar ? 'الحالي' : 'Current', bg: 'var(--status-approved-bg)', fg: 'var(--status-approved-fg)' },
    FUTURE:  { label: ar ? 'مستقبلي' : 'Future',  bg: 'var(--status-pending-bg)',  fg: 'var(--status-pending-fg)' },
    PAST:    { label: ar ? 'سابق' : 'Past',        bg: 'var(--surface)',            fg: 'var(--ink-3)' },
  } as const
  const s = map[state]
  return (
    <span style={{ background: s.bg, color: s.fg, fontSize: 'var(--text-caption)', fontWeight: 600, padding: '2px 8px', borderRadius: 20, letterSpacing: 0.3, display: 'inline-block' }}>
      {s.label}
    </span>
  )
}

/**
 * Renders an effective-dated assignment timeline. Reused by ESS (Phase 2) — and
 * intended for Manager / HR surfaces. Shows non-sensitive fields ONLY. The
 * `pick` helper resolves bilingual labels by locale (falls back EN↔AR).
 */
export function AssignmentHistoryPanel({ rows, locale }: { rows: AssignmentHistoryRow[]; locale: string }) {
  const ar = locale === 'ar'
  const L = (en: string, arr: string) => (ar ? arr : en)
  const pick = (en: string | null, arX: string | null) =>
    (ar ? (arX || en) : (en || arX)) || '—'

  if (!rows || rows.length === 0) {
    return (
      <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>
        {L('No historical assignment changes found.', 'لا توجد تغييرات في سجل التعيينات.')}
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map(r => (
        <div key={r.assignmentId} style={{ padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
          marginBottom: 10 }}>
            <TemporalBadge state={r.temporalState} locale={locale} />
            <span style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
              {fmtDMY(r.effectiveStartDate)} → {fmtPeriodEnd(r.effectiveEndDate, locale)}
            </span>
            <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
              {r.actionType.replace(/_/g, ' ')}{r.actionMode && r.actionMode !== 'UPDATE' ? ` (${r.actionMode})` : ''}
            </span>
          </div>
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
            <Field label={L('Position', 'المنصب')}       value={pick(r.positionEn, r.positionAr)} />
            <Field label={L('Job', 'المسمى الوظيفي')}     value={pick(r.jobEn, r.jobAr)} />
            <Field label={L('Grade', 'الدرجة')}           value={pick(r.gradeEn, r.gradeAr)} />
            <Field label={L('Department', 'القسم')}        value={pick(r.departmentEn, r.departmentAr)} />
            <Field label={L('Business Unit', 'وحدة الأعمال')} value={pick(r.businessUnitEn, r.businessUnitAr)} />
            <Field label={L('Legal Entity', 'الكيان القانوني')} value={pick(r.legalEntityEn, r.legalEntityAr)} />
            <Field label={L('Location', 'الموقع')}         value={pick(r.locationEn, r.locationAr)} />
            <Field label={L('Line Manager', 'المدير المباشر')} value={pick(r.lineManagerEn, r.lineManagerAr)} />
            <Field label={L('Status', 'الحالة')}           value={r.assignmentStatus?.replace(/_/g, ' ')} />
            <Field label={L('Reason', 'السبب')}            value={r.actionReason} />
          </div>
        </div>
      ))}
    </div>
  )
}

interface EditableFieldProps {
  label: string
  value: string | null | undefined
  fieldKey: string
  inputType?: string
  /** When provided, renders a <select> instead of <input> */
  options?: readonly string[]
  editingField: string | null
  editValue: string
  saving: boolean
  saveResult: { field: string; success: boolean; error?: string } | null
  onStartEdit: (key: string, current: string) => void
  onChange: (v: string) => void
  onSave: (key: string) => void
  onCancel: () => void
}

function EditableField({
  label, value, fieldKey, inputType = 'text', options,
  editingField, editValue, saving, saveResult,
  onStartEdit, onChange, onSave, onCancel,
}: EditableFieldProps) {
  const locale    = useLocale()
  const isEditing = editingField === fieldKey
  const result    = saveResult?.field === fieldKey ? saveResult : null

  const inputStyle: React.CSSProperties = {
    fontSize: 14, padding: '6px 10px', borderRadius: 6,
    border: '1px solid var(--accent)', outline: 'none',
    background: 'var(--card)', color: 'var(--ink-1)',
    width: '100%', boxSizing: 'border-box',
  }

  return (
    <div>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5,
      marginBottom: 4 }}>
        {label}
      </div>
      {isEditing ? (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {options ? (
              <select
                value={editValue}
                onChange={e => onChange(e.target.value)}
                disabled={saving}
                autoFocus
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">{locale === 'ar' ? '— اختر —' : '— Select —'}</option>
                {options.map(opt => (
                  <option key={opt} value={opt}>
                    {opt.charAt(0) + opt.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={inputType}
                value={editValue}
                onChange={e => onChange(e.target.value)}
                disabled={saving}
                autoFocus
                style={inputStyle}
              />
            )}
            <button
              onClick={() => onSave(fieldKey)}
              disabled={saving}
              style={{
                fontSize: 'var(--text-caption)', fontWeight: 600, padding: '6px 14px',
                borderRadius: 6, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: 'var(--card)',
                whiteSpace: 'nowrap', flexShrink: 0,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? tk(locale, 'common.saving') : tk(locale, 'common.save')}
            </button>
            <button
              onClick={onCancel}
              disabled={saving}
              aria-label={tk(locale, 'common.cancel')}
              style={{
                fontSize: 'var(--text-body)', padding: '5px 8px', borderRadius: 6,
                border: '1px solid var(--border)', cursor: 'pointer',
                background: 'var(--surface)', color: 'var(--ink-2)',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
          {result?.success === false && (
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg)',
            marginTop: 4 }}>
              {result.error ?? (locale === 'ar' ? 'فشل الحفظ' : 'Save failed')}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: value ? 'var(--ink-1)' : 'var(--ink-4)' }}>
            {value || '—'}
          </span>
          {result?.success && (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--status-approved-fg)', fontWeight: 600 }}>
              {locale === 'ar' ? 'تم الحفظ ✓' : 'Saved ✓'}
            </span>
          )}
          <button
            onClick={() => onStartEdit(fieldKey, value ?? '')}
            aria-label={`${tk(locale, 'common.edit')} ${label}`}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              color: 'var(--ink-4)', lineHeight: 0,
              marginLeft: 'auto',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

function ActivityIcon({ eventType }: { eventType: string }) {
  const t = eventType?.toUpperCase() ?? ''
  let d = 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'
  if (t.includes('LEAVE') || t.includes('ABSENCE')) d = 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'
  if (t.includes('DOCUMENT'))   d = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'
  if (t.includes('LOGIN'))      d = 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3'
  if (t.includes('VIEW') || t.includes('READ')) d = 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  )
}

type DocRow = MyProfile['documents'][number]

function DocumentCard({ doc }: { doc: DocRow }) {
  const locale = useLocale()
  const [downloading, setDownloading] = useState(false)
  const [dlError, setDlError]         = useState<string | null>(null)

  async function handleDownload() {
    setDownloading(true)
    setDlError(null)
    try {
      const res = await getDocumentDownloadUrl(doc.id)
      if (res.success) {
        window.open(res.url, '_blank', 'noopener,noreferrer')
      } else {
        setDlError(res.error)
      }
    } finally {
      setDownloading(false)
    }
  }

  const typeLabel = doc.documentType?.replace(/_/g, ' ') ?? (locale === 'ar' ? 'مستند' : 'Document')

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 16px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
    }}>
      {/* Left: document details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: 0.4,
        marginBottom: 4 }}>
          {typeLabel}
        </div>
        <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)',
        marginBottom: 6, wordBreak: 'break-word' }}>
          {doc.documentTitle || typeLabel}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
          {doc.documentNumber && (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              {doc.documentNumber}
            </span>
          )}
          {doc.issueDate && (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
              <span style={{ color: 'var(--ink-4)' }}>{locale === 'ar' ? 'تاريخ الإصدار: ' : 'Issued: '}</span>{fmtDMY(doc.issueDate)}
            </span>
          )}
          {doc.expiryDate && (
            <span style={{ fontSize: 'var(--text-caption)', color: doc.severity === 'expired' || doc.severity === 'critical' ? 'var(--status-rejected-fg)' : 'var(--ink-3)' }}>
              <span style={{ color: 'var(--ink-4)' }}>{locale === 'ar' ? 'تاريخ الانتهاء: ' : 'Expires: '}</span>{fmtDMY(doc.expiryDate)}
            </span>
          )}
          {doc.createdDate && (
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
              {locale === 'ar' ? 'أُضيف ' : 'Added '}{fmtRelative(doc.createdDate, locale)}
              {doc.createdByName ? `${locale === 'ar' ? ' بواسطة ' : ' by '}${doc.createdByName}` : ''}
            </span>
          )}
        </div>

        {doc.severity && (
          <div style={{
            marginTop: 8, padding: '5px 10px', borderRadius: 6, fontSize: 'var(--text-caption)', display: 'inline-block',
            background: doc.severity === 'expired' || doc.severity === 'critical'
              ? 'var(--status-rejected-bg)'
              : doc.severity === 'warning'
              ? 'var(--status-pending-bg)'
              : 'var(--surface)',
            color: doc.severity === 'expired' || doc.severity === 'critical'
              ? 'var(--status-rejected-fg)'
              : doc.severity === 'warning'
              ? 'var(--status-pending-fg)'
              : 'var(--ink-3)',
          }}>
            {doc.severity === 'expired'
              ? (locale === 'ar' ? 'منتهي الصلاحية — تواصل مع الموارد البشرية' : 'Expired — contact HR')
              : (locale === 'ar'
                  ? `ينتهي خلال ${doc.daysUntil} يوم — تواصل مع الموارد البشرية`
                  : `Expires in ${doc.daysUntil} day${doc.daysUntil !== 1 ? 's' : ''} — contact HR`)}
          </div>
        )}

        {dlError && (
          <div style={{ marginTop: 6, fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg)' }}>{dlError}</div>
        )}
      </div>

      {/* Right: status + download */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
        {doc.documentStatus && <StatusPill status={doc.documentStatus} />}
        {doc.storageKey && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 'var(--text-caption)', cursor: downloading ? 'not-allowed' : 'pointer',
              border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-2)',
              opacity: downloading ? 0.6 : 1, whiteSpace: 'nowrap',
            }}
          >
            {downloading ? (locale === 'ar' ? 'جارٍ الفتح…' : 'Opening…') : (locale === 'ar' ? 'عرض / تنزيل' : 'View / Download')}
          </button>
        )}
      </div>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '16px 20px', background: 'var(--card)',
      border: '1px solid var(--border)', borderRadius: 10,
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
      marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </div>
      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {children}
      </div>
    </div>
  )
}

function ManagerRow({ label, name, tooltip }: { label: string; name: string | null | undefined; tooltip?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, gridColumn: '1 / -1' }}>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 130, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {tooltip && <InfoIcon tip={tooltip} />}
      </div>
      {name ? (
        <>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'var(--accent-200, var(--border))', color: 'var(--accent-700, var(--accent))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'var(--text-caption)', fontWeight: 700, flexShrink: 0,
          }}>
            {getInitials(name)}
          </div>
          <span style={{ fontSize: 14, color: 'var(--ink-1)', fontWeight: 500 }}>{name}</span>
        </>
      ) : (
        <span style={{ fontSize: 14, color: 'var(--ink-4)' }}>—</span>
      )}
    </div>
  )
}

interface Props {
  data: MyProfile
  personId: string
  /** Effective-dated assignment timeline (non-sensitive) for the History tab. */
  history?: AssignmentHistoryRow[]
}

export function ProfilePageClient({ data, personId, history = [] }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const [activeTab, setActiveTab]   = useState<Tab>('personal')
  const [editingField, setEditField] = useState<string | null>(null)
  const [editValue, setEditValue]    = useState('')
  const [saving, setSaving]          = useState(false)
  const [saveResult, setSaveResult]  = useState<{ field: string; success: boolean; error?: string } | null>(null)

  const { personal, homeAddress, education, employment, balances, leaveHistory, documents, bank, activity } = data

  const initials = `${personal.firstNameEn?.[0] ?? ''}${personal.lastNameEn?.[0] ?? ''}`.toUpperCase()
  const displayName = personal.fullNameEn ?? `${personal.firstNameEn} ${personal.lastNameEn}`

  function startEdit(field: string, current: string) {
    setEditField(field)
    setEditValue(current)
    setSaveResult(null)
  }

  function cancelEdit() {
    setEditField(null)
    setEditValue('')
    setSaveResult(null)
  }

  async function handleSave(field: string) {
    setSaving(true)
    const payload: Parameters<typeof updateMyProfile>[1] = {}
    if (field === 'mobileNumber')                 payload.mobileNumber                 = editValue
    if (field === 'personalEmail')               payload.personalEmail                = editValue
    if (field === 'emergencyContactName')         payload.emergencyContactName         = editValue
    if (field === 'emergencyContactRelationship') payload.emergencyContactRelationship = editValue
    if (field === 'emergencyContactPhone')        payload.emergencyContactPhone        = editValue
    // Home address (employee self-service)
    if (field === 'homeAddressLine1')             payload.homeAddressLine1             = editValue
    if (field === 'homeAddressLine2')             payload.homeAddressLine2             = editValue
    if (field === 'homeCity')                     payload.homeCity                     = editValue
    if (field === 'homeStateEmirate')             payload.homeStateEmirate             = editValue
    if (field === 'homeCountry')                  payload.homeCountry                  = editValue
    if (field === 'homePostalCode')               payload.homePostalCode               = editValue
    if (field === 'homePoBox')                    payload.homePoBox                    = editValue
    // Highest qualification (employee self-service)
    if (field === 'eduInstitutionName')           payload.eduInstitutionName           = editValue
    if (field === 'eduDegreeType')                payload.eduDegreeType                = editValue
    if (field === 'eduFieldOfStudy')              payload.eduFieldOfStudy              = editValue
    if (field === 'eduCountry')                   payload.eduCountry                   = editValue
    if (field === 'eduStartYear')                 payload.eduStartYear                 = editValue
    if (field === 'eduGraduationYear')            payload.eduGraduationYear            = editValue

    const result = await updateMyProfile(personId, payload)
    setSaving(false)
    setSaveResult({ field, ...result })
    if (result.success) {
      setEditField(null)
      setEditValue('')
      router.refresh()
    }
  }

  const editableProps = { editingField, editValue, saving, saveResult, onStartEdit: startEdit, onChange: setEditValue, onSave: handleSave, onCancel: cancelEdit }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'personal',    label: locale === 'ar' ? 'البيانات الشخصية' : 'Personal'   },
    { key: 'employment',  label: locale === 'ar' ? 'التوظيف'          : 'Employment' },
    { key: 'history',     label: locale === 'ar' ? 'سجل التوظيف'       : 'Employment History' },
    { key: 'leave',       label: locale === 'ar' ? 'الإجازات'         : 'Leave'      },
    { key: 'documents',   label: locale === 'ar' ? 'المستندات'        : 'Documents'  },
    { key: 'activity',    label: locale === 'ar' ? 'النشاط'           : 'Activity'   },
  ]

  return (
    <div className="page-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* Profile header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--card)', borderBottom: '1px solid var(--border)',
        padding: '16px 24px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14,
        paddingBottom: 16 }}>
          {/* Photo: cloud URL → base64 data URL → initials. Hover to change. */}
          <div className="group relative" style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
            {(personal.profilePhotoUrl || personal.profilePhotoData) ? (
              <img
                src={personal.profilePhotoUrl || personal.profilePhotoData!}
                alt=""
                aria-hidden
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: 'var(--accent)', color: 'var(--card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 700,
              }}>
                {initials}
              </div>
            )}
            <PhotoUploadWidget personId={personId} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink-1)', lineHeight: '1.2', fontFamily: 'var(--font-serif, serif)' }}>
              {displayName}
            </div>
            <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)',
            marginTop: 2 }}>
              {[employment?.positionTitleEn, employment?.departmentNameEn].filter(Boolean).join(' · ') || personal.employmentType?.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontFamily: 'var(--font-mono)',
            marginTop: 1 }}>
              {personal.personNumber}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                fontSize: 'var(--text-body)', fontWeight: activeTab === t.key ? 600 : 400,
                color: activeTab === t.key ? 'var(--brand-active)' : 'var(--ink-3)',
                borderBottomWidth: "2px",
                borderBottomStyle: "solid",
                borderBottomColor: (activeTab === t.key) ? "var(--accent)" : "transparent",
                padding: '8px 16px', background: 'none',
                borderTopWidth: "0px",
                borderTopStyle: "none",
                borderTopColor: "currentColor",
                borderRightWidth: "0px",
                borderRightStyle: "none",
                borderRightColor: "currentColor",
                borderLeftWidth: "0px",
                borderLeftStyle: "none",
                borderLeftColor: "currentColor",
                borderRadius: 0, cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, padding: '20px 24px', minHeight: 0 }}>

        {/* ─── TAB 1: PERSONAL ─── */}
        {activeTab === 'personal' && (
          <div style={{ maxWidth: 720 }}>

            {/* A. Personal Information */}
            <div style={{
              padding: '16px 20px', background: 'var(--surface)',
              borderRadius: 10,
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
              marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {locale === 'ar' ? 'المعلومات الشخصية' : 'Personal Information'}
              </div>
              <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <Field label={locale === 'ar' ? 'رقم الموظف' : 'Employee Code'}   value={personal.employeeCode}
                  tooltip="Assigned by HR Admin in the employee record. Contact HR to update." />
                <Field label={locale === 'ar' ? 'الاسم الكامل (إنجليزي)' : 'Full Name (EN)'}  value={personal.fullNameEn} />
                <Field label={locale === 'ar' ? 'الاسم الكامل (عربي)' : 'Full Name (AR)'}  value={personal.fullNameAr} />
                <Field label={locale === 'ar' ? 'تاريخ الميلاد' : 'Date of Birth'}   value={fmtDMY(personal.dateOfBirth)} />
                <Field label={locale === 'ar' ? 'الجنس' : 'Gender'}          value={personal.gender?.replace(/_/g, ' ')} />
                <Field label={locale === 'ar' ? 'الجنسية' : 'Nationality'}     value={personal.nationalityCode} />
                <Field label={locale === 'ar' ? 'الحالة الاجتماعية' : 'Marital Status'}  value={personal.maritalStatus?.replace(/_/g, ' ')} />
                <Field label={locale === 'ar' ? 'فئة العامل' : 'Worker Type'}     value={personal.workerCategory?.replace(/_/g, ' ')}
                  tooltip="Employment relationship class: FTE (direct employee), Contractor, or Contingent Worker. Set during hiring by HR Admin." />
                {personal.religion && (
                  <Field label={locale === 'ar' ? 'الديانة' : 'Religion'} value={personal.religion} />
                )}
                {personal.bloodType && (
                  <Field label={locale === 'ar' ? 'فصيلة الدم' : 'Blood Type'} value={personal.bloodType.replace('_POS', '+').replace('_NEG', '−').replace('_', '')} />
                )}
              </div>
            </div>

            {/* B. Contact Information */}
            <div style={{
              padding: '16px 20px', background: 'var(--card)',
              border: '1px solid var(--border)', borderRadius: 10,
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
              marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {locale === 'ar' ? 'معلومات الاتصال' : 'Contact Information'}
              </div>
              <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <Field label={locale === 'ar' ? 'البريد الإلكتروني للعمل' : 'Work Email'} value={personal.workEmail}
                  tooltip="Provisioned from Microsoft Entra ID during account creation. Contact IT or HR Admin to update." />
                <EditableField label={locale === 'ar' ? 'البريد الإلكتروني الشخصي' : 'Personal Email'}  value={personal.personalEmail} fieldKey="personalEmail" inputType="email" {...editableProps} />
                <EditableField label={locale === 'ar' ? 'رقم الهاتف المحمول' : 'Mobile Number'}   value={personal.mobileNumber}  fieldKey="mobileNumber"  {...editableProps} />
              </div>
            </div>

            {/* Emergency contact section */}
            <div style={{
              padding: '16px 20px', background: 'var(--card)',
              border: '1px solid var(--border)', borderRadius: 10,
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
              marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {locale === 'ar' ? 'جهة الاتصال للطوارئ' : 'Emergency Contact'}
              </div>
              <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <EditableField label={locale === 'ar' ? 'الاسم' : 'Name'}         value={personal.emergencyContactName}  fieldKey="emergencyContactName"  {...editableProps} />
                <EditableField
                  label={locale === 'ar' ? 'صلة القرابة' : 'Relationship'}
                  value={
                    personal.emergencyContactRelationship
                      ? personal.emergencyContactRelationship.charAt(0) +
                        personal.emergencyContactRelationship.slice(1).toLowerCase()
                      : null
                  }
                  fieldKey="emergencyContactRelationship"
                  options={ALLOWED_RELATIONSHIPS}
                  {...editableProps}
                />
                <EditableField label={locale === 'ar' ? 'الهاتف' : 'Phone'}        value={personal.emergencyContactPhone} fieldKey="emergencyContactPhone" {...editableProps} />
              </div>
            </div>

            {/* Home address section — employee self-service editable */}
            <div style={{
              padding: '16px 20px', background: 'var(--card)',
              border: '1px solid var(--border)', borderRadius: 10,
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
              marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {locale === 'ar' ? 'عنوان السكن' : 'Home Address'}
              </div>
              <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <EditableField label={locale === 'ar' ? 'العنوان (السطر 1)' : 'Address Line 1'}   value={homeAddress?.addressLine1} fieldKey="homeAddressLine1" {...editableProps} />
                <EditableField label={locale === 'ar' ? 'العنوان (السطر 2)' : 'Address Line 2'}   value={homeAddress?.addressLine2} fieldKey="homeAddressLine2" {...editableProps} />
                <EditableField label={locale === 'ar' ? 'المدينة' : 'City'}             value={homeAddress?.city}         fieldKey="homeCity"         {...editableProps} />
                <EditableField label={locale === 'ar' ? 'الإمارة / المنطقة' : 'State / Emirate'}  value={homeAddress?.stateEmirate} fieldKey="homeStateEmirate" {...editableProps} />
                <EditableField label={locale === 'ar' ? 'الدولة' : 'Country'}          value={homeAddress?.country}      fieldKey="homeCountry"      {...editableProps} />
                <EditableField label={locale === 'ar' ? 'الرمز البريدي' : 'Postal / ZIP Code'} value={homeAddress?.postalCode}  fieldKey="homePostalCode"   {...editableProps} />
                <EditableField label={locale === 'ar' ? 'صندوق البريد' : 'P.O. Box'}         value={homeAddress?.poBox}        fieldKey="homePoBox"        {...editableProps} />
              </div>
            </div>

            {/* Education / qualification section — employee self-service editable */}
            <div style={{
              padding: '16px 20px', background: 'var(--card)',
              border: '1px solid var(--border)', borderRadius: 10,
            }}>
              <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
              marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {locale === 'ar' ? 'أعلى مؤهل علمي' : 'Highest Qualification'}
              </div>
              <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <EditableField label={locale === 'ar' ? 'المؤسسة التعليمية' : 'Institution'}     value={education?.institutionName}            fieldKey="eduInstitutionName" {...editableProps} />
                <EditableField label={locale === 'ar' ? 'الدرجة العلمية' : 'Degree'}          value={education?.degreeType}                 fieldKey="eduDegreeType"      {...editableProps} />
                <EditableField label={locale === 'ar' ? 'مجال الدراسة' : 'Field of Study'}  value={education?.fieldOfStudy}               fieldKey="eduFieldOfStudy"    {...editableProps} />
                <EditableField label={locale === 'ar' ? 'الدولة' : 'Country'}         value={education?.country}                    fieldKey="eduCountry"         {...editableProps} />
                <EditableField label={locale === 'ar' ? 'سنة البدء' : 'Start Year'}      value={education?.startYear?.toString()}      fieldKey="eduStartYear"       inputType="number" {...editableProps} />
                <EditableField label={locale === 'ar' ? 'سنة التخرج' : 'Graduation Year'} value={education?.graduationYear?.toString()} fieldKey="eduGraduationYear"  inputType="number" {...editableProps} />
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 2: EMPLOYMENT ─── */}
        {activeTab === 'employment' && (
          <div style={{ maxWidth: 720 }}>
            {employment ? (
              <>
                {/* Employee number hero */}
                <div style={{
                  padding: '12px 20px', background: 'var(--accent-050, var(--surface))',
                  border: '1px solid var(--accent-100, var(--border))',
                  borderRadius: 10,
                  marginBottom: 20,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {locale === 'ar' ? 'الرقم الوظيفي' : 'Employee Number'}
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand-active)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
                    {personal.personNumber}
                  </span>
                </div>

                {/* A. Employment Details */}
                <SectionCard title={locale === 'ar' ? 'تفاصيل التوظيف' : 'Employment Details'}>
                  <Field label={locale === 'ar' ? 'تاريخ التعيين' : 'Hire Date'}           value={fmtDMY(employment.hireDate)} />
                  <Field label={locale === 'ar' ? 'حالة التوظيف' : 'Employment Status'}   value={employment.assignmentStatus?.replace(/_/g, ' ')} />
                  <Field label={locale === 'ar' ? 'فئة التوظيف' : 'Employment Category'} value={employment.employmentType?.replace(/_/g, ' ')} />
                  <Field label={locale === 'ar' ? 'حالة فترة التجربة' : 'Probation Status'}    value={getProbationStatus(employment.probationEndDate, locale)} />
                  <Field label={locale === 'ar' ? 'تاريخ انتهاء فترة التجربة' : 'Probation End Date'}  value={fmtDMY(employment.probationEndDate)}
                    tooltip="Set by HR Admin when a probation period is defined for this employee." />
                  <Field label={locale === 'ar' ? 'فترة الإشعار' : 'Notice Period'}       value={employment.noticePeriodDays != null ? (locale === 'ar' ? `${employment.noticePeriodDays} يوم` : `${employment.noticePeriodDays} days`) : null}
                    tooltip="Contractual notice period. Set by HR Admin on the employee record." />
                  <Field label={locale === 'ar' ? 'مدة الخدمة' : 'Service Length'}      value={calcServiceLength(employment.hireDate, locale)} />
                </SectionCard>

                {/* B. Job Information */}
                <SectionCard title={locale === 'ar' ? 'معلومات الوظيفة' : 'Job Information'}>
                  <Field label={locale === 'ar' ? 'المسمى الوظيفي' : 'Job'}
                    value={[employment.jobTitleEn, employment.jobTitleAr].filter(Boolean).join(' · ') || null}
                    tooltip="Linked from the job definition assigned to this employee's position." />
                  <Field label={locale === 'ar' ? 'المنصب' : 'Position'}
                    value={[employment.positionTitleEn, employment.positionTitleAr].filter(Boolean).join(' · ') || null}
                    tooltip="The budgeted position slot this employee occupies in the org chart." />
                  <Field label={locale === 'ar' ? 'الدرجة الوظيفية' : 'Grade'}
                    value={employment.gradeCode
                      ? [employment.gradeCode, [employment.gradeNameEn, employment.gradeNameAr].filter(Boolean).join(' · ') || null].filter(Boolean).join(' — ')
                      : null}
                    tooltip="Salary grade assigned via the worker assignment. Set by HR Admin." />
                  <Field label={locale === 'ar' ? 'المستوى الوظيفي' : 'Job Level'}
                    value={employment.gradeLevel != null ? String(employment.gradeLevel) : null}
                    tooltip="Numeric level derived from the assigned grade (e.g. Grade L3 = level 3)." />
                </SectionCard>

                {/* C. Organization Information */}
                <SectionCard title={locale === 'ar' ? 'المعلومات التنظيمية' : 'Organization Information'}>
                  <Field label={locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity'}
                    value={[employment.entityNameEn, employment.entityNameAr].filter(Boolean).join(' · ') || null} />
                  <Field label={locale === 'ar' ? 'وحدة الأعمال' : 'Business Unit'}
                    value={[employment.businessUnitNameEn, employment.businessUnitNameAr].filter(Boolean).join(' · ') || null}
                    tooltip="Business unit linked to this worker assignment. Set by HR Admin." />
                  <Field label={locale === 'ar' ? 'القسم' : 'Department'}
                    value={[employment.departmentNameEn, employment.departmentNameAr].filter(Boolean).join(' · ') || null} />
                  <Field label={locale === 'ar' ? 'مركز التكلفة' : 'Cost Center'}
                    value={employment.primaryCostCentreCode ?? null}
                    tooltip="Primary cost centre code from the worker assignment record. Set by HR Admin." />
                  <Field label={locale === 'ar' ? 'إسناد المشروع' : 'Project Assignment'}
                    value={[employment.projectNameEn, employment.projectNameAr].filter(Boolean).join(' · ') || null}
                    tooltip="Set when this employee is allocated to a specific project via their worker assignment." />
                  <Field label={locale === 'ar' ? 'موقع العمل' : 'Office Location'}
                    value={employment.locationNameEn ?? null}
                    tooltip="Physical work location assigned on the worker assignment record." />
                </SectionCard>

                {/* D. Reporting Structure */}
                <SectionCard title={locale === 'ar' ? 'هيكل التبعية الإدارية' : 'Reporting Structure'}>
                  <ManagerRow label={locale === 'ar' ? 'المدير المباشر' : 'Line Manager'} name={employment.managerName}
                    tooltip="Primary reporting manager. Approves leave requests and workflow actions." />
                  <ManagerRow label={locale === 'ar' ? 'المدير الوظيفي' : 'Functional Manager'} name={employment.functionalManagerName}
                    tooltip="Dotted-line manager for cross-functional work. Does not affect leave approval routing." />
                </SectionCard>

                {/* E. Work Schedule */}
                <SectionCard title={locale === 'ar' ? 'جدول العمل' : 'Work Schedule'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1 / -1' }}>
                    <Field label={locale === 'ar' ? 'جدول العمل' : 'Work Schedule'} value={employment.scheduleNameEn ?? null}
                      tooltip="Assigned by HR Admin or automatically inherited from the Legal Entity's default schedule." />
                    {employment.scheduleSource && employment.scheduleNameEn && (
                      <span style={{
                        fontSize: 'var(--text-caption)',
                        marginTop: 16,
                        color: employment.scheduleSource === 'EMPLOYEE_OVERRIDE' ? 'var(--brand-active)' : 'var(--ink-3)',
                        background: employment.scheduleSource === 'EMPLOYEE_OVERRIDE' ? 'var(--accent-050)' : 'var(--surface)',
                        border: `1px solid ${employment.scheduleSource === 'EMPLOYEE_OVERRIDE' ? 'var(--accent-200)' : 'var(--border)'}`,
                        borderRadius: 6, padding: '2px 8px', fontWeight: 500, whiteSpace: 'nowrap', alignSelf: 'flex-start',
                      }}>
                        {employment.scheduleSource === 'EMPLOYEE_OVERRIDE'
                          ? (locale === 'ar' ? 'تجاوز خاص بالموظف' : 'Employee Override')
                          : (locale === 'ar' ? 'موروث من الكيان القانوني' : 'Inherited from Legal Entity')}
                      </span>
                    )}
                  </div>
                  <Field label={locale === 'ar' ? 'ساعات العمل / اليوم' : 'Working Hours / Day'} value={fmtHoursPerDay(employment.scheduleHoursPerDay, locale)}
                    tooltip="Calculated as: total weekly hours ÷ number of working days per week." />
                  <Field label={locale === 'ar' ? 'وقت البدء' : 'Start Time'} value={employment.scheduleStartTime ?? null}
                    tooltip="Monday start time from the work schedule definition. Contact HR Admin to update." />
                  <Field label={locale === 'ar' ? 'وقت الانتهاء' : 'End Time'}   value={employment.scheduleEndTime ?? null}
                    tooltip="Monday end time from the work schedule definition. Contact HR Admin to update." />
                </SectionCard>
              </>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>{locale === 'ar' ? 'لا يوجد سجل توظيف.' : 'No employment record found.'}</p>
            )}
          </div>
        )}

        {/* ─── TAB: EMPLOYMENT HISTORY (effective-dated assignment timeline) ─── */}
        {activeTab === 'history' && (
          <div style={{ maxWidth: 720 }}>
            <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
            marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {locale === 'ar' ? 'سجل التعيينات الفعّال' : 'Assignment History'}
            </div>
            <AssignmentHistoryPanel rows={history} locale={locale} />
          </div>
        )}

        {/* ─── TAB 3: LEAVE ─── */}
        {activeTab === 'leave' && (
          <div style={{ maxWidth: 720 }}>
            {/* Balance bars */}
            {balances.length > 0 ? (
              <div style={{
                padding: '16px 20px', background: 'var(--card)',
                border: '1px solid var(--border)', borderRadius: 10,
                marginBottom: 20,
              }}>
                <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
                marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {locale === 'ar' ? 'أرصدة الإجازات' : 'Leave Balances'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {balances.map(b => {
                    const barColor =
                      b.colorCode === 'green' ? 'var(--status-approved-fg)'
                      : b.colorCode === 'amber' ? 'var(--status-pending-fg)'
                      : 'var(--status-rejected-fg)'
                    const barBg =
                      b.colorCode === 'green' ? 'var(--status-approved-bg)'
                      : b.colorCode === 'amber' ? 'var(--status-pending-bg)'
                      : 'var(--status-rejected-bg)'
                    const pct = b.total > 0 ? Math.min(1, b.available / b.total) : 0
                    return (
                      <div key={b.typeCode}>
                        <div style={{ display: 'flex', justifyContent: 'space-between',
                        marginBottom: 5 }}>
                          <span style={{ fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-1)' }}>{b.typeNameEn}</span>
                          <span style={{ fontSize: 'var(--text-body)', color: barColor, fontWeight: 600 }}>
                            {locale === 'ar'
                              ? `${b.available} من ${b.total} يوم متاح`
                              : `${b.available} of ${b.total} days available`}
                          </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 4,
                            width: `${Math.round(pct * 100)}%`,
                            background: barColor,
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
                        marginTop: 3 }}>
                          {locale === 'ar' ? `${b.taken} يوم مستخدم` : `${b.taken} days taken`}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--ink-3)',
              marginBottom: 20 }}>{locale === 'ar' ? 'لا توجد أرصدة إجازات لهذا العام.' : 'No leave balances found for this year.'}</p>
            )}

            {/* Recent leave history */}
            {leaveHistory.length > 0 && (
              <div style={{
                padding: '16px 20px', background: 'var(--card)',
                border: '1px solid var(--border)', borderRadius: 10,
                marginBottom: 20,
              }}>
                <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
                marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {locale === 'ar' ? 'طلبات الإجازات الأخيرة' : 'Recent Leave Requests'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {leaveHistory.map((r, i) => (
                    <div data-responsive-grid="true" key={r.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr 1.4fr 80px 90px',
                      gap: 12, padding: '10px 0',
                      borderBottom: i < leaveHistory.length - 1 ? '1px solid var(--border)' : 'none',
                      alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500 }}>{r.typeNameEn}</span>
                      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                        {fmtDMY(r.startDate)} – {fmtDMY(r.endDate)}
                      </span>
                      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>{Number(r.durationDays) || '—'} {locale === 'ar' ? 'يوم' : 'days'}</span>
                      <StatusPill status={r.status ?? ''} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              // Route to the shell-neutral leave request form. /me/leave lives in the
              // (employee) route group, whose layout redirects every admin-shell role
              // (incl. MANAGER, who reaches this shared component via /my-profile) to
              // /dashboard — bouncing them off the leave flow. /absence/new is the
              // actual request form and is permitted for EMPLOYEE + MANAGER + HR roles
              // alike (same target the employee Home "Apply for Leave" quick-action uses).
              // scope=self marks this as a self-service entry from the personal profile:
              // the form locks the applicant to the logged-in user and hides the
              // manager team-member toggle (team-leave entry from /absence is unchanged).
              onClick={() => router.push('/absence/new?scope=self')}
              style={{
                fontSize: 14, fontWeight: 500, padding: '10px 20px',
                borderRadius: 8, border: '1px solid var(--accent)',
                background: 'none', color: 'var(--brand-active)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {locale === 'ar' ? 'تقديم طلب إجازة' : 'Apply for Leave'}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        )}

        {/* ─── TAB 4: DOCUMENTS ─── */}
        {activeTab === 'documents' && (
          <div style={{ maxWidth: 720 }}>
            {documents.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10,
              marginBottom: 16 }}>
                {documents.map(d => (
                  <DocumentCard key={d.id} doc={d} />
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--ink-3)',
              marginBottom: 16 }}>{locale === 'ar' ? 'لا توجد مستندات مسجلة.' : 'No documents on record.'}</p>
            )}

            {bank?.ibanMasked && (
              <div style={{
                padding: '12px 16px', background: 'var(--card)',
                border: '1px solid var(--border)', borderRadius: 10,
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)',
                marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {locale === 'ar' ? 'التفاصيل البنكية' : 'Bank Details'}
                </div>
                <div style={{ display: 'flex', gap: 24 }}>
                  {bank.bankName && <Field label={locale === 'ar' ? 'البنك' : 'Bank'} value={bank.bankName} />}
                  <Field label={locale === 'ar' ? 'رقم الآيبان' : 'IBAN'} value={bank.ibanMasked} />
                </div>
              </div>
            )}

            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontStyle: 'italic' }}>
              {locale === 'ar' ? 'لتحديث المستندات، يُرجى التواصل مع مسؤول الموارد البشرية.' : 'To update documents contact HR Admin.'}
            </p>
          </div>
        )}

        {/* ─── TAB 5: ACTIVITY ─── */}
        {activeTab === 'activity' && (
          <div style={{ maxWidth: 720 }}>
            {activity.length > 0 ? (
              <div style={{
                padding: '4px 0', background: 'var(--card)',
                border: '1px solid var(--border)', borderRadius: 10,
              }}>
                {activity.map((a, i) => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 16px',
                    borderBottom: i < activity.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'var(--surface)', color: 'var(--ink-3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                    }}>
                      <ActivityIcon eventType={a.eventType ?? ''} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', lineHeight: '1.4' }}>
                        {a.description || a.eventType?.replace(/\./g, ' › ')}
                      </div>
                      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
                      marginTop: 2 }}>
                        {a.actorName && <span>{a.actorName} · </span>}
                        {fmtRelative(a.eventTime, locale)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>{locale === 'ar' ? 'لا يوجد نشاط حديث.' : 'No recent activity.'}</p>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
