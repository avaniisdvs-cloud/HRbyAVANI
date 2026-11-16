'use client'

import { useState, useEffect, useTransition } from 'react'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { ChangeReasonModal } from '@/components/mdm/ChangeReasonModal'
import { createBusinessUnit, updateBusinessUnit } from './BusinessUnitActions'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { useLocale } from '@/components/providers/LocaleProvider'

// ── Types ────────────────────────────────────────────────────────────────────

export interface BusinessUnitRow {
  id:            string
  legalEntityId: string
  code:          string
  nameEn:        string
  nameAr:        string
  glSegmentCode: string | null
  isActive:      boolean
  entityName?:   string
}

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface BusinessUnitDrawerProps {
  open:          boolean
  onClose:       () => void
  editRecord:    BusinessUnitRow | null
  legalEntities: LegalEntityOption[]
  onSaved:       () => void
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width:        '100%',
  border:       '1.5px solid var(--border)',
  borderRadius: 8,
  padding:      '10px 12px',
  fontSize:     'var(--text-body)',
  fontFamily:   'var(--font-sans)',
  color:        'var(--ink-1)',
  background:   'var(--card)',
  outline:      'none',
  boxSizing:    'border-box',
}

const selectStyle: React.CSSProperties = {
  width:        '100%',
  height:       42,
  border:       '1.5px solid var(--border)',
  borderRadius: 8,
  padding:      '0 12px',
  fontSize:     'var(--text-body)',
  fontFamily:   'var(--font-sans)',
  color:        'var(--ink-1)',
  background:   'var(--card)',
  cursor:       'pointer',
  outline:      'none',
}

const labelStyle: React.CSSProperties = {
  display:      'block',
  fontSize:     'var(--text-body)',
  fontWeight:   500,
  color:        'var(--ink-2)',
  marginBottom: 6,
}

const fieldWrapStyle: React.CSSProperties = { marginBottom: 16 }

const sectionDividerStyle: React.CSSProperties = {
  fontSize:      'var(--text-caption)',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color:         'var(--ink-3)',
  margin:        '24px 0 12px',
  paddingBottom: 6,
  borderBottom:  '1px solid var(--border)',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BusinessUnitDrawer({
  open,
  onClose,
  editRecord,
  legalEntities,
  onSaved,
}: BusinessUnitDrawerProps) {
  const isEdit = editRecord !== null
  const locale = useLocale()
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showReason, setShowReason] = useState(false)
  const [pendingFd, setPendingFd] = useState<FormData | null>(null)

  // ── Form state
  const [legalEntityId, setLegalEntityId] = useState('')
  const [code,          setCode]          = useState('')
  const [nameEn,        setNameEn]        = useState('')
  const [nameAr,        setNameAr]        = useState('')
  const [glSegmentCode, setGlSegmentCode] = useState('')

  useEffect(() => {
    if (open) {
      setLegalEntityId(editRecord?.legalEntityId ?? (legalEntities[0]?.id ?? ''))
      setCode(editRecord?.code ?? '')
      setNameEn(editRecord?.nameEn ?? '')
      setNameAr(editRecord?.nameAr ?? '')
      setGlSegmentCode(editRecord?.glSegmentCode ?? '')
      setError(null)
    }
  }, [open, editRecord, legalEntities])

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set('legalEntityId', legalEntityId)
    fd.set('code',          code.trim().toUpperCase())
    fd.set('nameEn',        nameEn.trim())
    fd.set('nameAr',        nameAr.trim())
    fd.set('glSegmentCode', glSegmentCode.trim())
    return fd
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!legalEntityId) { setError(locale === 'ar' ? 'الكيان القانوني مطلوب.' : 'Legal Entity is required.'); return }
    if (!code.trim())   { setError(locale === 'ar' ? 'الرمز مطلوب.' : 'Code is required.'); return }
    if (!nameEn.trim()) { setError(locale === 'ar' ? 'الاسم الإنجليزي مطلوب.' : 'English name is required.'); return }

    const fd = buildFormData()
    if (isEdit) {
      setPendingFd(fd)
      setShowReason(true)
    } else {
      startTransition(async () => {
        const result = await createBusinessUnit(fd)
        if (result.error) { setError(result.error) } else { onSaved(); onClose() }
      })
    }
  }

  function handleReasonConfirm(reason: string) {
    if (!pendingFd || !editRecord) return
    setShowReason(false)
    startTransition(async () => {
      const result = await updateBusinessUnit(editRecord.id, pendingFd, reason)
      if (result.error) { setError(result.error) } else { onSaved(); onClose() }
    })
  }

  return (
    <>
      <MdmDrawer
        open={open}
        onClose={onClose}
        titleEn={isEdit ? 'Edit Business Unit' : 'New Business Unit'}
        titleAr={isEdit ? 'تعديل وحدة العمل' : 'وحدة عمل جديدة'}
        footer={
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: 38, padding: '0 18px', borderRadius: 8,
                border: '1.5px solid var(--border)', background: 'transparent',
                fontSize: 'var(--text-body)', color: 'var(--ink-2)', cursor: 'pointer',
              }}
            >
              {locale === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              form="bu-form"
              disabled={isPending}
              style={{
                height: 38, padding: '0 20px', borderRadius: 8,
                border: 'none', background: 'var(--accent)', color: "var(--on-accent)",
                fontSize: 'var(--text-body)', fontWeight: 600,
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : isEdit ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes') : (locale === 'ar' ? 'إنشاء وحدة العمل' : 'Create Business Unit')}
            </button>
          </div>
        }
      >
        <form id="bu-form" onSubmit={handleSubmit}>

          {/* ── Legal Structure ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'الهيكل القانوني' : 'Legal Structure'}</div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span></label>
            <select
              value={legalEntityId}
              onChange={e => setLegalEntityId(e.target.value)}
              style={selectStyle}
            >
              <option value="">{locale === 'ar' ? 'اختر الكيان القانوني…' : 'Select legal entity…'}</option>
              {legalEntities.map(le => (
                <option key={le.id} value={le.id}>{le.nameEn}</option>
              ))}
            </select>
          </div>

          {/* ── Identification ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'التعريف' : 'Identification'}</div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'الرمز' : 'Code'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span></label>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. BU-001"
                maxLength={30}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
              />
            </div>
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'رمز قطاع الأستاذ العام' : 'GL Segment Code'}</label>
              <input
                value={glSegmentCode}
                onChange={e => setGlSegmentCode(e.target.value)}
                placeholder="e.g. 1100"
                maxLength={50}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>

          {/* ── Names ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'الأسماء' : 'Names'}</div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'} <span style={{ color: 'var(--status-rejected-fg)' }}>*</span></label>
            <input
              value={nameEn}
              onChange={e => setNameEn(e.target.value)}
              onBlur={async () => {
                if (nameEn.trim() && (!nameAr.trim() || nameEn !== editRecord?.nameEn)) {
                  const ar = await autoTranslate(nameEn)
                  if (ar) setNameAr(ar)
                }
              }}
              placeholder="e.g. Finance Business Unit"
              maxLength={200}
              style={inputStyle}
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}
              {arTranslating && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginLeft: 6, fontStyle: 'italic' }}>جاري الترجمة…</span>}
            </label>
            <input
              value={nameAr}
              onChange={e => setNameAr(e.target.value)}
              placeholder="مثال: وحدة عمل المالية"
              maxLength={200}
              dir="rtl"
              disabled={arTranslating}
              style={{ ...inputStyle, textAlign: 'right', fontFamily: 'var(--font-sans)', opacity: arTranslating ? 0.6 : 1 }}
            />
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>يتم الترجمة تلقائياً من الاسم الإنجليزي</div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div style={{
              marginTop: 8,
              padding: '10px 14px',
              background: 'var(--status-rejected-bg)',
              border: '1px solid var(--status-rejected-dot)',
              borderRadius: 8,
              fontSize: 'var(--text-body)',
              color: 'var(--status-rejected-fg)',
            }}>
              {error}
            </div>
          )}
        </form>
      </MdmDrawer>

      <ChangeReasonModal
        open={showReason}
        onClose={() => setShowReason(false)}
        onConfirm={handleReasonConfirm}
        changeSummary={editRecord ? `${editRecord.code} — ${editRecord.nameEn}` : ''}
        isPending={isPending}
      />
    </>
  )
}
