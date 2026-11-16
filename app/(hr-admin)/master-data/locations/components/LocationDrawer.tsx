'use client'

import { useState, useEffect, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { ChangeReasonModal } from '@/components/mdm/ChangeReasonModal'
import { createLocation, updateLocation, correctLocation } from './LocationActions'
import type { LocationFieldErrors } from './LocationActions'
import { ActionModeSelector } from '@/components/ui/ActionModeSelector'
import type { ActionMode } from '@/lib/action-mode'
import type { Location } from '@/drizzle/schema'

// ── Static option lists ────────────────────────────────────────────────────

const EMIRATE_OPTIONS = [
  'Dubai',
  'Abu Dhabi',
  'Sharjah',
  'Ajman',
  'Ras Al Khaimah',
  'Fujairah',
  'Umm Al Quwain',
] as const

const COUNTRY_OPTIONS: { code: string; label: string }[] = [
  { code: 'ARE', label: 'United Arab Emirates' },
  { code: 'SAU', label: 'Saudi Arabia' },
  { code: 'KWT', label: 'Kuwait' },
  { code: 'QAT', label: 'Qatar' },
  { code: 'BHR', label: 'Bahrain' },
  { code: 'OMN', label: 'Oman' },
  { code: 'GBR', label: 'United Kingdom' },
  { code: 'USA', label: 'United States' },
  { code: 'IND', label: 'India' },
]

const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Asia/Dubai',      label: 'Asia/Dubai (GST +04:00)' },
  { value: 'Asia/Riyadh',     label: 'Asia/Riyadh (AST +03:00)' },
  { value: 'Asia/Kuwait',     label: 'Asia/Kuwait (AST +03:00)' },
  { value: 'Europe/London',   label: 'Europe/London (GMT/BST)' },
  { value: 'America/New_York',label: 'America/New_York (EST/EDT)' },
  { value: 'Asia/Kolkata',    label: 'Asia/Kolkata (IST +05:30)' },
]

// ── Types ──────────────────────────────────────────────────────────────────

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface LocationDrawerProps {
  open:          boolean
  onClose:       () => void
  onSuccess:     () => void
  editRow?:      Location | null
  legalEntities: LegalEntityOption[]
  canCorrect?:   boolean
}

// ── Style helpers ──────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--ink-3)',
  margin: '24px 0 12px',
  paddingBottom: 6,
  borderBottom: '1px solid var(--border)',
}

const fieldWrap: React.CSSProperties = { marginBottom: 16 }

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-body)',
  fontWeight: 500,
  color: 'var(--ink-2)',
  marginBottom: 6,
}

const requiredStar: React.CSSProperties = { color: '#C62828' }

const inputBase: React.CSSProperties = {
  width: '100%',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 'var(--text-body)',
  fontFamily: 'var(--font-sans)',
  color: 'var(--ink-1)',
  background: 'var(--card)',
  outline: 'none',
  boxSizing: 'border-box',
}

const readonlyInput: React.CSSProperties = {
  ...inputBase,
  background: 'var(--surface)',
  color: 'var(--ink-3)',
  cursor: 'not-allowed',
}

const errorText: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  color: '#C62828',
  marginTop: 4,
}

// ── Component ──────────────────────────────────────────────────────────────

export function LocationDrawer({
  open,
  onClose,
  onSuccess,
  editRow,
  legalEntities,
  canCorrect = false,
}: LocationDrawerProps) {
  const isEdit = !!editRow
  const locale = useLocale()
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()

  // Form state
  const [legalEntityId, setLegalEntityId] = useState('')
  const [code,          setCode]          = useState('')
  const [nameEn,        setNameEn]        = useState('')
  const [nameAr,        setNameAr]        = useState('')
  const [addressLine1,  setAddressLine1]  = useState('')
  const [addressLine2,  setAddressLine2]  = useState('')
  const [city,          setCity]          = useState('')
  const [emirate,       setEmirate]       = useState('')
  const [country,       setCountry]       = useState('ARE')
  const [poBox,         setPoBox]         = useState('')
  const [phone,         setPhone]         = useState('')
  const [timezone,      setTimezone]      = useState('Asia/Dubai')

  // UI state
  const [fieldErrors,     setFieldErrors]     = useState<LocationFieldErrors>({})
  const [serverError,     setServerError]     = useState<string | null>(null)
  const [showReason,      setShowReason]      = useState(false)
  const [pendingFd,       setPendingFd]       = useState<FormData | null>(null)
  const [isPending,       startTransition]    = useTransition()
  const [mode,            setMode]            = useState<ActionMode>('UPDATE')
  const [correctionNote,  setCorrectionNote]  = useState('')

  // BR-LOC-002: overseas banner
  const isOverseas = country !== 'ARE'

  // Populate on open
  useEffect(() => {
    if (open && editRow) {
      setLegalEntityId(editRow.legalEntityId ?? '')
      setCode(editRow.code)
      setNameEn(editRow.nameEn)
      setNameAr(editRow.nameAr ?? '')
      setAddressLine1(editRow.addressLine1 ?? '')
      setAddressLine2(editRow.addressLine2 ?? '')
      setCity(editRow.city ?? '')
      setEmirate(editRow.emirate ?? '')
      setCountry(editRow.country ?? 'ARE')
      setPoBox(editRow.poBox ?? '')
      setPhone(editRow.phone ?? '')
      setTimezone(editRow.timezone ?? 'Asia/Dubai')
    } else if (open && !editRow) {
      setLegalEntityId('')
      setCode('')
      setNameEn('')
      setNameAr('')
      setAddressLine1('')
      setAddressLine2('')
      setCity('')
      setEmirate('')
      setCountry('ARE')
      setPoBox('')
      setPhone('')
      setTimezone('Asia/Dubai')
    }
    setFieldErrors({})
    setServerError(null)
    setMode('UPDATE')
    setCorrectionNote('')
  }, [open, editRow])

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set('legalEntityId', legalEntityId)
    fd.set('code',          code)
    fd.set('nameEn',        nameEn)
    fd.set('nameAr',        nameAr)
    fd.set('addressLine1',  addressLine1)
    fd.set('addressLine2',  addressLine2)
    fd.set('city',          city)
    fd.set('emirate',       emirate)
    fd.set('country',       country)
    fd.set('poBox',         poBox)
    fd.set('phone',         phone)
    fd.set('timezone',      timezone)
    return fd
  }

  function handleSubmit() {
    setFieldErrors({})
    setServerError(null)
    const fd = buildFormData()

    if (isEdit && mode === 'CORRECTION') {
      if (!correctionNote.trim()) { setServerError('Correction note is required.'); return }
      startTransition(async () => {
        const result = await correctLocation(editRow!.id, fd, correctionNote)
        if (result.success) {
          onSuccess()
          onClose()
        } else {
          setServerError(result.error)
          if ('fieldErrors' in result && result.fieldErrors) {
            setFieldErrors(result.fieldErrors)
          }
        }
      })
    } else if (isEdit) {
      setPendingFd(fd)
      setShowReason(true)
    } else {
      startTransition(async () => {
        const result = await createLocation(fd)
        if (result.success) {
          onSuccess()
          onClose()
        } else {
          setServerError(result.error)
          if ('fieldErrors' in result && result.fieldErrors) {
            setFieldErrors(result.fieldErrors)
          }
        }
      })
    }
  }

  function handleConfirmReason(reason: string) {
    if (!pendingFd) return
    setShowReason(false)
    startTransition(async () => {
      const result = await updateLocation(editRow!.id, pendingFd, reason)
      if (result.success) {
        onSuccess()
        onClose()
      } else {
        setServerError(result.error)
        if ('fieldErrors' in result && result.fieldErrors) {
          setFieldErrors(result.fieldErrors)
        }
      }
    })
  }

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={isPending}
        style={{
          height: 36, padding: '0 16px',
          border: '1.5px solid var(--border)',
          borderRadius: 10,
          background: 'transparent',
          color: 'var(--ink-2)',
          fontSize: 'var(--text-body)', fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {tk(locale, 'common.cancel')}
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        style={{
          height: 36, padding: '0 20px',
          border: 'none',
          borderRadius: 10,
          background: isPending ? 'var(--border)' : 'var(--accent)',
          color: isPending ? 'var(--ink-4)' : '#fff',
          fontSize: 'var(--text-body)', fontWeight: 600,
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending
          ? tk(locale, 'common.saving')
          : isEdit
            ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes')
            : (locale === 'ar' ? 'إنشاء موقع' : 'Create Location')}
      </button>
    </>
  )

  return (
    <>
      <MdmDrawer
        open={open}
        onClose={onClose}
        titleEn={isEdit ? `Edit Location — ${editRow?.code}` : 'New Location'}
        titleAr={isEdit ? 'تعديل الموقع' : 'موقع جديد'}
        footer={footer}
        width={640}
      >
        {serverError && (
          <div style={{
            background: '#FBE9E9', border: '1px solid #FFCDD2',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            fontSize: 'var(--text-body)', color: '#C62828',
          }}>
            {serverError}
          </div>
        )}

        {/* BR-LOC-002: Overseas banner */}
        {isOverseas && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            background: '#FFF8E1', border: '1px solid #FFE082',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          }}>
            <AlertTriangle size={16} color="#F57F17" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 'var(--text-body)', color: '#795548' }}>
              {locale === 'ar' ? (
                <><strong>موقع خارجي</strong> — قد يُطبَّق قانون عمل مختلف.
                تأكد من تكوين لوائح التوظيف المعمول بها بشكل صحيح للموظفين
                المعينين في هذا الموقع (BR-LOC-002).</>
              ) : (
                <><strong>Overseas location</strong> — different labour law may apply.
                Ensure applicable employment regulations are configured correctly for employees
                assigned to this location (BR-LOC-002).</>
              )}
            </div>
          </div>
        )}

        {isEdit && (
          <div style={{ marginBottom: 20 }}>
            <ActionModeSelector
              mode={mode}
              correctionNote={correctionNote}
              onModeChange={setMode}
              onNoteChange={setCorrectionNote}
              canCorrect={canCorrect}
              disabled={isPending}
            />
          </div>
        )}

        {/* ── Organisation ──────────────────────────────────────────── */}
        <div style={sectionLabel}>{locale === 'ar' ? 'المؤسسة' : 'Organisation'}</div>

        <div style={fieldWrap}>
          <label style={fieldLabel}>
            {locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity'} <span style={requiredStar}>*</span>
          </label>
          <select
            value={legalEntityId}
            onChange={e => setLegalEntityId(e.target.value)}
            disabled={isEdit}
            style={isEdit ? readonlyInput : inputBase}
          >
            <option value="">{locale === 'ar' ? 'اختر الكيان القانوني…' : 'Select legal entity…'}</option>
            {legalEntities.map(le => (
              <option key={le.id} value={le.id}>{le.nameEn}</option>
            ))}
          </select>
          {fieldErrors.legalEntityId && <div style={errorText}>{fieldErrors.legalEntityId}</div>}
          {isEdit && (
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>
              {locale === 'ar' ? 'لا يمكن تغيير الكيان القانوني بعد الإنشاء.' : 'Legal entity cannot be changed after creation.'}
            </div>
          )}
        </div>

        {/* ── Location Identity ──────────────────────────────────────── */}
        <div style={sectionLabel}>{locale === 'ar' ? 'هوية الموقع' : 'Location Identity'}</div>

        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
          <div style={fieldWrap}>
            <label style={fieldLabel}>
              {locale === 'ar' ? 'الرمز' : 'Code'} <span style={requiredStar}>*</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. DXB-HQ"
              maxLength={30}
              disabled={isEdit}
              style={isEdit ? readonlyInput : inputBase}
            />
            {fieldErrors.code && <div style={errorText}>{fieldErrors.code}</div>}
            {isEdit && (
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>{locale === 'ar' ? 'ثابت.' : 'Immutable.'}</div>
            )}
          </div>

          <div style={fieldWrap}>
            <label style={fieldLabel}>
              {locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'} <span style={requiredStar}>*</span>
            </label>
            <input
              type="text"
              value={nameEn}
              onChange={e => setNameEn(e.target.value)}
              onBlur={async () => {
                if (nameEn.trim() && (!nameAr.trim() || nameEn !== editRow?.nameEn)) {
                  const ar = await autoTranslate(nameEn)
                  if (ar) setNameAr(ar)
                }
              }}
              placeholder="e.g. Dubai Headquarters"
              maxLength={200}
              style={inputBase}
            />
            {fieldErrors.nameEn && <div style={errorText}>{fieldErrors.nameEn}</div>}
          </div>
        </div>

        <div style={fieldWrap}>
          <label style={fieldLabel}>
            {locale === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}
            {arTranslating && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginLeft: 6, fontStyle: 'italic' }}>جاري الترجمة…</span>}
          </label>
          <input
            type="text"
            value={nameAr}
            onChange={e => setNameAr(e.target.value)}
            dir="rtl"
            lang="ar"
            placeholder="مثال: المقر الرئيسي دبي"
            maxLength={200}
            disabled={arTranslating}
            style={{ ...inputBase, textAlign: 'right', opacity: arTranslating ? 0.6 : 1 }}
          />
          {fieldErrors.nameAr && <div style={errorText}>{fieldErrors.nameAr}</div>}
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>يتم الترجمة تلقائياً من الاسم الإنجليزي</div>
        </div>

        {/* ── Address ────────────────────────────────────────────────── */}
        <div style={sectionLabel}>{locale === 'ar' ? 'العنوان' : 'Address'}</div>

        <div style={fieldWrap}>
          <label style={fieldLabel}>{locale === 'ar' ? 'سطر العنوان 1' : 'Address Line 1'}</label>
          <input
            type="text"
            value={addressLine1}
            onChange={e => setAddressLine1(e.target.value)}
            placeholder={locale === 'ar' ? 'عنوان الشارع' : 'Street address'}
            maxLength={300}
            style={inputBase}
          />
        </div>

        <div style={fieldWrap}>
          <label style={fieldLabel}>{locale === 'ar' ? 'سطر العنوان 2' : 'Address Line 2'}</label>
          <input
            type="text"
            value={addressLine2}
            onChange={e => setAddressLine2(e.target.value)}
            placeholder={locale === 'ar' ? 'الجناح، الطابق، اسم المبنى' : 'Suite, floor, building name'}
            maxLength={300}
            style={inputBase}
          />
        </div>

        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={fieldWrap}>
            <label style={fieldLabel}>{locale === 'ar' ? 'الإمارة' : 'Emirate'}</label>
            <select
              value={emirate}
              onChange={e => setEmirate(e.target.value)}
              style={inputBase}
              disabled={country !== 'ARE'}
            >
              <option value="">{locale === 'ar' ? 'اختر الإمارة…' : 'Select emirate…'}</option>
              {EMIRATE_OPTIONS.map(em => (
                <option key={em} value={em}>{em}</option>
              ))}
            </select>
          </div>

          <div style={fieldWrap}>
            <label style={fieldLabel}>{locale === 'ar' ? 'المدينة' : 'City'}</label>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="e.g. Dubai"
              maxLength={100}
              style={inputBase}
            />
          </div>
        </div>

        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={fieldWrap}>
            <label style={fieldLabel}>
              {locale === 'ar' ? 'الدولة' : 'Country'} <span style={requiredStar}>*</span>
            </label>
            <select
              value={country}
              onChange={e => {
                setCountry(e.target.value)
                // Clear emirate if not UAE
                if (e.target.value !== 'ARE') setEmirate('')
                // Auto-set timezone to Asia/Dubai for UAE
                if (e.target.value === 'ARE') setTimezone('Asia/Dubai')
              }}
              style={inputBase}
            >
              {COUNTRY_OPTIONS.map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
              ))}
            </select>
            {fieldErrors.country && <div style={errorText}>{fieldErrors.country}</div>}
          </div>

          <div style={fieldWrap}>
            <label style={fieldLabel}>{locale === 'ar' ? 'صندوق البريد' : 'PO Box'}</label>
            <input
              type="text"
              value={poBox}
              onChange={e => setPoBox(e.target.value)}
              placeholder="e.g. 12345"
              maxLength={20}
              style={inputBase}
            />
          </div>
        </div>

        {/* ── Contact & Timezone ─────────────────────────────────────── */}
        <div style={sectionLabel}>{locale === 'ar' ? 'جهة الاتصال والمنطقة الزمنية' : 'Contact & Timezone'}</div>

        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={fieldWrap}>
            <label style={fieldLabel}>{locale === 'ar' ? 'الهاتف' : 'Phone'}</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+97142345678"
              maxLength={30}
              style={inputBase}
            />
            {fieldErrors.phone ? (
              <div style={errorText}>{fieldErrors.phone}</div>
            ) : (
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>
                {locale === 'ar' ? 'الصيغة' : 'Format'}: +971XXXXXXXX (BR-LOC-003)
              </div>
            )}
          </div>

          <div style={fieldWrap}>
            <label style={fieldLabel}>
              {locale === 'ar' ? 'المنطقة الزمنية' : 'Timezone'} <span style={requiredStar}>*</span>
            </label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              style={inputBase}
            >
              {TIMEZONE_OPTIONS.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            {fieldErrors.timezone && <div style={errorText}>{fieldErrors.timezone}</div>}
          </div>
        </div>
      </MdmDrawer>

      {/* Change reason modal (edit only) */}
      <ChangeReasonModal
        open={showReason}
        onClose={() => setShowReason(false)}
        onConfirm={handleConfirmReason}
        isPending={isPending}
        changeSummary={isEdit ? `Editing location ${editRow?.code} — ${editRow?.nameEn}` : undefined}
      />
    </>
  )
}
