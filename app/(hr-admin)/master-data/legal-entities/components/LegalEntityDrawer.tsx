'use client'

import { BrandText } from '@/components/providers/BrandingProvider'
import { useState, useEffect, useCallback } from 'react'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { ChangeReasonModal } from '@/components/mdm/ChangeReasonModal'
import { BilingualField } from '@/components/forms/BilingualField'
import { DateInput } from '@/components/forms/DateInput'
import { createLegalEntity, updateLegalEntity } from './LegalEntityActions'

// ── Types ──────────────────────────────────────────────────────────────────

type LegalEntity = {
  id: string
  entityCode: string
  nameEn: string
  nameAr: string
  tradeLicenceNumber: string | null
  tradeLicenceExpiry: string | null
  registrationNumber: string | null
  entityType: string
  jurisdiction: string
  eosbScheme: string
  wpsEmployerCode: string | null
  mohreEstablishmentId: string | null
  defaultCurrency: string
  defaultLanguage: string
  isActive: boolean
  createdByName: string
  createdDate: Date
  updatedByName: string | null
  lastUpdatedDate: Date | null
}

interface LegalEntityDrawerProps {
  open:    boolean
  onClose: () => void
  entity?: LegalEntity | null
  onSaved: () => void
}

// ── Style helpers ──────────────────────────────────────────────────────────

const sectionDivider = (label: string) => (
  <div style={{
    fontSize: 'var(--text-caption)',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--ink-3)',
    marginBottom: 12,
    marginTop: 24,
    paddingBottom: 6,
    borderBottom: '1px solid var(--border)',
  }}>
    {label}
  </div>
)

const fieldWrapper = (
  label: React.ReactNode,
  input: React.ReactNode,
  error?: string | null,
  hint?: React.ReactNode,
) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-2)',
    marginBottom: 6 }}>
      {label}
    </label>
    {input}
    {hint}
    {error && <p style={{ fontSize: 'var(--text-caption)', color: '#C62828',
    marginTop: 4 }}>{error}</p>}
  </div>
)

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  paddingTop: "10px",
  paddingRight: "12px",
  paddingBottom: "10px",
  paddingLeft: "12px",
  fontSize: 'var(--text-body)',
  fontFamily: 'var(--font-sans)',
  color: 'var(--ink-1)',
  backgroundColor: 'var(--card)',
  outline: 'none',
  boxSizing: 'border-box',
}

const disabledInputStyle: React.CSSProperties = {
  ...inputStyle,
  backgroundColor: 'var(--surface)',
  color: 'var(--ink-3)',
  cursor: 'not-allowed',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: 30,
}

// ── Days until expiry helper ───────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const expiry = new Date(dateStr)
  const today  = new Date()
  today.setHours(0, 0, 0, 0)
  expiry.setHours(0, 0, 0, 0)
  return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Build change summary for ChangeReasonModal ─────────────────────────────

function buildChangeSummary(
  entity: LegalEntity,
  form: FormState,
): string {
  const changes: string[] = []
  if (form.nameEn !== entity.nameEn)                         changes.push(`Name EN: "${entity.nameEn}" → "${form.nameEn}"`)
  if (form.nameAr !== entity.nameAr)                         changes.push(`Name AR changed`)
  if (form.entityType !== entity.entityType)                 changes.push(`Type: ${entity.entityType} → ${form.entityType}`)
  if (form.jurisdiction !== entity.jurisdiction)             changes.push(`Jurisdiction: ${entity.jurisdiction} → ${form.jurisdiction}`)
  if (form.eosbScheme !== entity.eosbScheme)                 changes.push(`EOSB Scheme: ${entity.eosbScheme} → ${form.eosbScheme}`)
  if (form.defaultCurrency !== entity.defaultCurrency)       changes.push(`Currency: ${entity.defaultCurrency} → ${form.defaultCurrency}`)
  if (form.defaultLanguage !== entity.defaultLanguage)       changes.push(`Language: ${entity.defaultLanguage} → ${form.defaultLanguage}`)
  if ((form.tradeLicenceNumber ?? '') !== (entity.tradeLicenceNumber ?? ''))
    changes.push(`Trade Licence No. changed`)
  if ((form.tradeLicenceExpiry ?? '') !== (entity.tradeLicenceExpiry ?? ''))
    changes.push(`Trade Licence Expiry changed`)
  if ((form.registrationNumber ?? '') !== (entity.registrationNumber ?? ''))
    changes.push(`Registration No. changed`)
  if ((form.wpsEmployerCode ?? '') !== (entity.wpsEmployerCode ?? ''))
    changes.push(`WPS Employer Code changed`)
  if ((form.mohreEstablishmentId ?? '') !== (entity.mohreEstablishmentId ?? ''))
    changes.push(`MoHRE Establishment ID changed`)
  return changes.length > 0 ? changes.join('; ') : 'No detected changes'
}

// ── Form state ─────────────────────────────────────────────────────────────

interface FormState {
  entityCode:           string
  nameEn:               string
  nameAr:               string
  entityType:           string
  jurisdiction:         string
  eosbScheme:           string
  tradeLicenceNumber:   string
  tradeLicenceExpiry:   string
  registrationNumber:   string
  wpsEmployerCode:      string
  mohreEstablishmentId: string
  defaultCurrency:      string
  defaultLanguage:      string
}

type FormErrors = Partial<Record<keyof FormState, string>>

function emptyForm(): FormState {
  return {
    entityCode:           '',
    nameEn:               '',
    nameAr:               '',
    entityType:           'MAINLAND',
    jurisdiction:         'Dubai',
    eosbScheme:           'TRADITIONAL',
    tradeLicenceNumber:   '',
    tradeLicenceExpiry:   '',
    registrationNumber:   '',
    wpsEmployerCode:      '',
    mohreEstablishmentId: '',
    defaultCurrency:      'AED',
    defaultLanguage:      'en',
  }
}

function entityToForm(e: LegalEntity): FormState {
  return {
    entityCode:           e.entityCode,
    nameEn:               e.nameEn,
    nameAr:               e.nameAr,
    entityType:           e.entityType,
    jurisdiction:         e.jurisdiction,
    eosbScheme:           e.eosbScheme,
    tradeLicenceNumber:   e.tradeLicenceNumber ?? '',
    tradeLicenceExpiry:   e.tradeLicenceExpiry ?? '',
    registrationNumber:   e.registrationNumber ?? '',
    wpsEmployerCode:      e.wpsEmployerCode ?? '',
    mohreEstablishmentId: e.mohreEstablishmentId ?? '',
    defaultCurrency:      e.defaultCurrency,
    defaultLanguage:      e.defaultLanguage,
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function LegalEntityDrawer({ open, onClose, entity, onSaved }: LegalEntityDrawerProps) {
  const isEdit = Boolean(entity)
  const locale = useLocale()
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()

  const [form, setForm]               = useState<FormState>(emptyForm)
  const [errors, setErrors]           = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, setIsPending]     = useState(false)
  const [showReason, setShowReason]   = useState(false)

  // Sync form when drawer opens / entity changes
  useEffect(() => {
    if (open) {
      setForm(entity ? entityToForm(entity) : emptyForm())
      setErrors({})
      setServerError(null)
      setIsPending(false)
    }
  }, [open, entity])

  // BR-LE-001: auto-set DEWS when entityType → DIFC
  const handleEntityTypeChange = useCallback((value: string) => {
    setForm(prev => ({
      ...prev,
      entityType: value,
      eosbScheme: value === 'DIFC' ? 'DEWS' : prev.eosbScheme,
    }))
  }, [])

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }, [])

  // ── Validation ─────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: FormErrors = {}
    if (!isEdit && !form.entityCode.trim()) errs.entityCode = 'Entity code is required.'
    if (!form.nameEn.trim())               errs.nameEn     = 'English name is required.'
    if (!form.entityType)                  errs.entityType  = 'Entity type is required.'
    if (!form.jurisdiction.trim())         errs.jurisdiction = 'Jurisdiction is required.'
    if (!form.eosbScheme)                  errs.eosbScheme  = 'EOSB scheme is required.'
    if (!form.defaultCurrency)             errs.defaultCurrency = 'Default currency is required.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Build FormData ──────────────────────────────────────────────────────

  function buildFormData(): FormData {
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => {
      if (v !== null && v !== undefined) fd.set(k, String(v))
    })
    return fd
  }

  // ── Save handlers ───────────────────────────────────────────────────────

  async function handleCreate() {
    if (!validate()) return
    setIsPending(true)
    setServerError(null)
    try {
      const result = await createLegalEntity(buildFormData())
      if (result.success) {
        onSaved()
        onClose()
      } else {
        setServerError(result.error)
        if ('fieldErrors' in result && result.fieldErrors) {
          setErrors(result.fieldErrors as FormErrors)
        }
      }
    } finally {
      setIsPending(false)
    }
  }

  function handleEditSave() {
    if (!validate()) return
    setShowReason(true)
  }

  async function handleConfirmReason(reason: string) {
    if (!entity) return
    setIsPending(true)
    setServerError(null)
    try {
      const result = await updateLegalEntity(entity.id, buildFormData(), reason)
      if (result.success) {
        setShowReason(false)
        onSaved()
        onClose()
      } else {
        setServerError(result.error)
        setShowReason(false)
      }
    } finally {
      setIsPending(false)
    }
  }

  // ── Expiry warning ──────────────────────────────────────────────────────

  const expiryDays = daysUntil(form.tradeLicenceExpiry || null)
  const showExpiryWarning = expiryDays !== null && expiryDays < 60

  // ── Render ──────────────────────────────────────────────────────────────

  const footer = (
    <>
      <button
        onClick={onClose}
        disabled={isPending}
        style={{
          height: 38,
          padding: '0 18px',
          border: '1.5px solid var(--border)',
          borderRadius: 10,
          background: 'transparent',
          color: 'var(--ink-2)',
          fontSize: 'var(--text-body)',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {tk(locale, 'common.cancel')}
      </button>
      <button
        onClick={isEdit ? handleEditSave : handleCreate}
        disabled={isPending}
        style={{
          height: 38,
          padding: '0 18px',
          border: 'none',
          borderRadius: 10,
          background: isPending ? 'var(--border)' : 'var(--accent)',
          color: isPending ? 'var(--ink-4)' : '#fff',
          fontSize: 'var(--text-body)',
          fontWeight: 600,
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending
          ? tk(locale, 'common.saving')
          : isEdit
            ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes')
            : (locale === 'ar' ? 'إنشاء كيان' : 'Create Entity')}
      </button>
    </>
  )

  return (
    <>
      <MdmDrawer
        open={open}
        onClose={onClose}
        titleEn={isEdit ? `Edit — ${entity?.entityCode}` : 'New Legal Entity'}
        titleAr={isEdit ? 'تعديل كيان قانوني' : 'كيان قانوني جديد'}
        footer={footer}
        width={600}
      >
        {/* Server-level error */}
        {serverError && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: '#FBE9E9',
            borderRadius: 8,
            border: '1px solid #E57373',
            fontSize: 'var(--text-body)',
            color: '#C62828',
          }}>
            {serverError}
          </div>
        )}

        {/* ── Section 1: Identity ─────────────────────────────────────── */}
        {sectionDivider(locale === 'ar' ? 'الهوية' : 'Identity')}

        {fieldWrapper(
          <>{locale === 'ar' ? 'رمز الكيان' : 'Entity Code'} <span style={{ color: '#C62828' }}>*</span></>,
          <input
            value={form.entityCode}
            onChange={e => set('entityCode', e.target.value.toUpperCase())}
            disabled={isEdit}
            placeholder="e.g. COMPANY-PROP"
            maxLength={20}
            style={isEdit ? disabledInputStyle : inputStyle}
          />,
          errors.entityCode,
          isEdit ? (
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
            marginTop: 4 }}>
              {locale === 'ar' ? 'الرمز ثابت بعد الحفظ' : 'Code is immutable once saved'}
            </p>
          ) : null,
        )}

        {/* Bilingual Name */}
        <div style={{ marginBottom: 16 }}>
          <BilingualField
            name="name"
            labelEn="Name (English)"
            labelAr="Name (Arabic)"
            valueEn={form.nameEn}
            valueAr={form.nameAr}
            onChangeEn={v => set('nameEn', v)}
            onChangeAr={v => set('nameAr', v)}
            onBlurEn={async () => {
              if (form.nameEn.trim() && (!form.nameAr.trim() || form.nameEn !== entity?.nameEn)) {
                const ar = await autoTranslate(form.nameEn)
                if (ar) set('nameAr', ar)
              }
            }}
            requiredEn
            placeholderEn="e.g. Company Properties LLC"
            placeholderAr="مثال: الشركة العقارية ذ.م.م"
            translatingAr={arTranslating}
            disabledAr={arTranslating}
            errorEn={errors.nameEn}
          />
        </div>

        {/* ── Section 2: Classification ────────────────────────────────── */}
        {sectionDivider(locale === 'ar' ? 'التصنيف' : 'Classification')}

        {/* Entity Type */}
        {fieldWrapper(
          <>{locale === 'ar' ? 'نوع الكيان' : 'Entity Type'} <span style={{ color: '#C62828' }}>*</span></>,
          <select
            value={form.entityType}
            onChange={e => handleEntityTypeChange(e.target.value)}
            style={selectStyle}
          >
            <option value="MAINLAND">{locale === 'ar' ? 'البر الرئيسي' : 'Mainland'}</option>
            <option value="DIFC">DIFC</option>
            <option value="ADGM">ADGM</option>
            <option value="FREEZONE">{locale === 'ar' ? 'منطقة حرة' : 'Free Zone'}</option>
          </select>,
          errors.entityType,
        )}

        {/* Jurisdiction */}
        {fieldWrapper(
          <>{locale === 'ar' ? 'الاختصاص القضائي' : 'Jurisdiction'} <span style={{ color: '#C62828' }}>*</span></>,
          <input
            value={form.jurisdiction}
            onChange={e => set('jurisdiction', e.target.value)}
            placeholder="e.g. Dubai"
            style={inputStyle}
          />,
          errors.jurisdiction,
        )}

        {/* EOSB Scheme */}
        {fieldWrapper(
          <>{locale === 'ar' ? 'نظام مكافأة نهاية الخدمة' : 'EOSB Scheme'} <span style={{ color: '#C62828' }}>*</span></>,
          <select
            value={form.eosbScheme}
            onChange={e => set('eosbScheme', e.target.value)}
            disabled={form.entityType === 'DIFC'}
            style={form.entityType === 'DIFC' ? { ...selectStyle, ...disabledInputStyle } : selectStyle}
          >
            <option value="TRADITIONAL">{locale === 'ar' ? 'تقليدي' : 'Traditional'}</option>
            <option value="VSS">VSS</option>
            <option value="DEWS">DEWS</option>
          </select>,
          errors.eosbScheme,
          form.entityType === 'DIFC' ? (
            <div style={{
              marginTop: 6,
              padding: '6px 10px',
              background: 'var(--accent-100)',
              borderRadius: 6,
              fontSize: 'var(--text-caption)',
              color: 'var(--brand-active)',
              border: '1px solid var(--accent-100)',
            }}>
              <strong>BR-LE-001:</strong> {locale === 'ar' ? 'يجب على كيانات DIFC استخدام نظام DEWS' : 'DIFC entities are required to use the DEWS scheme'}
            </div>
          ) : null,
        )}

        {/* Default Currency */}
        {fieldWrapper(
          <>{locale === 'ar' ? 'العملة الافتراضية' : 'Default Currency'} <span style={{ color: '#C62828' }}>*</span></>,
          <select
            value={form.defaultCurrency}
            onChange={e => set('defaultCurrency', e.target.value)}
            style={selectStyle}
          >
            <option value="AED">{locale === 'ar' ? 'AED — درهم إماراتي' : 'AED — UAE Dirham'}</option>
            <option value="USD">{locale === 'ar' ? 'USD — دولار أمريكي' : 'USD — US Dollar'}</option>
            <option value="EUR">{locale === 'ar' ? 'EUR — يورو' : 'EUR — Euro'}</option>
          </select>,
          errors.defaultCurrency,
        )}

        {/* Default Language */}
        {fieldWrapper(
          <>{locale === 'ar' ? 'اللغة الافتراضية' : 'Default Language'} <span style={{ color: '#C62828' }}>*</span></>,
          <select
            value={form.defaultLanguage}
            onChange={e => set('defaultLanguage', e.target.value)}
            style={selectStyle}
          >
            <option value="en">{locale === 'ar' ? 'الإنجليزية' : 'English'}</option>
            <option value="ar">{locale === 'ar' ? 'العربية' : 'Arabic'}</option>
          </select>,
          errors.defaultLanguage,
        )}

        {/* ── Section 3: Regulatory ─────────────────────────────────────── */}
        {sectionDivider(locale === 'ar' ? 'تنظيمي' : 'Regulatory')}

        {/* Trade Licence Number */}
        {fieldWrapper(
          locale === 'ar' ? 'رقم الرخصة التجارية' : 'Trade Licence Number',
          <input
            value={form.tradeLicenceNumber}
            onChange={e => set('tradeLicenceNumber', e.target.value)}
            placeholder="e.g. 1234567"
            style={inputStyle}
          />,
        )}

        {/* Trade Licence Expiry */}
        {fieldWrapper(
          locale === 'ar' ? 'انتهاء الرخصة التجارية' : 'Trade Licence Expiry',
          <DateInput
            value={form.tradeLicenceExpiry}
            onChange={e => set('tradeLicenceExpiry', e.target.value)}
            style={inputStyle}
          />,
          null,
          showExpiryWarning ? (
            <div style={{
              marginTop: 6,
              padding: '6px 10px',
              background: '#FFF3E0',
              borderRadius: 6,
              fontSize: 'var(--text-caption)',
              color: '#E65100',
              border: '1px solid #FFCC80',
            }}>
              {expiryDays !== null && expiryDays < 0
                ? (locale === 'ar'
                    ? `انتهت الرخصة التجارية منذ ${Math.abs(expiryDays)} يوم`
                    : `Trade licence expired ${Math.abs(expiryDays)} day${Math.abs(expiryDays) !== 1 ? 's' : ''} ago`)
                : (locale === 'ar'
                    ? `تنتهي الرخصة التجارية خلال ${expiryDays} يوم`
                    : `Trade licence expires in ${expiryDays} day${expiryDays !== 1 ? 's' : ''}`)}
            </div>
          ) : null,
        )}

        {/* MoHRE Registration No. → registrationNumber */}
        {fieldWrapper(
          locale === 'ar' ? 'رقم تسجيل وزارة الموارد البشرية (MoHRE)' : 'MoHRE Registration No.',
          <input
            value={form.registrationNumber}
            onChange={e => set('registrationNumber', e.target.value)}
            placeholder="e.g. MOH-2024-000001"
            style={inputStyle}
          />,
        )}

        {/* WPS Employer Code */}
        {fieldWrapper(
          locale === 'ar' ? 'رمز صاحب العمل في نظام حماية الأجور (WPS)' : 'WPS Employer Code',
          <input
            value={form.wpsEmployerCode}
            onChange={e => set('wpsEmployerCode', e.target.value)}
            placeholder="e.g. WPS-1234"
            style={inputStyle}
          />,
        )}

        {/* MoHRE Establishment ID */}
        {fieldWrapper(
          locale === 'ar' ? 'معرّف المنشأة لدى وزارة الموارد البشرية (MoHRE)' : 'MoHRE Establishment ID',
          <input
            value={form.mohreEstablishmentId}
            onChange={e => set('mohreEstablishmentId', e.target.value)}
            placeholder="e.g. EST-00001"
            style={inputStyle}
          />,
        )}
      </MdmDrawer>

      {/* Change reason modal — edit mode only */}
      {isEdit && entity && (
        <ChangeReasonModal
          open={showReason}
          onClose={() => { if (!isPending) setShowReason(false) }}
          onConfirm={handleConfirmReason}
          changeSummary={buildChangeSummary(entity, form)}
          isPending={isPending}
        />
      )}
    </>
  )
}
