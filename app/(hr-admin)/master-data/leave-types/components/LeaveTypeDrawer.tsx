'use client'

import { useState, useEffect, useTransition } from 'react'
import { Lock } from 'lucide-react'
import { useAutoTranslate } from '@/hooks/useAutoTranslate'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { ChangeReasonModal } from '@/components/mdm/ChangeReasonModal'
import { createLeaveType, updateLeaveType } from './LeaveTypeActions'

// ── Types ────────────────────────────────────────────────────────────────────

export interface LeaveTypeRow {
  id:                     string
  legalEntityId:          string | null
  typeCode:               string
  typeNameEn:             string
  typeNameAr:             string | null
  isStatutory:            boolean
  isPaid:                 string
  maxDaysPerYear:         string | null
  maxConsecutiveDays:     string | null
  minServiceMonths:       number
  minNoticeDays:          number
  requiresMedicalCert:    boolean
  certRequiredAfterDays:  number | null
  genderRestriction:      string | null
  religionRestriction:    string | null
  approvalRequired:       boolean
  isOneTimePerEmployment: boolean
  payrollElementCode:     string | null
  isActive:               boolean
  // virtual — system record not in DB yet
  isSystemRecord?:        boolean
}

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface LeaveTypeDrawerProps {
  open:          boolean
  onClose:       () => void
  editRecord:    LeaveTypeRow | null
  legalEntities: LegalEntityOption[]
  onSaved:       () => void
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width:        '100%',
  border:       '1.5px solid var(--border)',
  borderRadius: 8,
  padding:      '10px 12px',
  fontSize:     14,
  fontFamily:   'var(--font-sans)',
  color:        'var(--ink-1)',
  background:   'var(--card)',
  outline:      'none',
  boxSizing:    'border-box',
}

const inputDisabledStyle: React.CSSProperties = {
  ...inputStyle,
  background: 'var(--surface)',
  color:      'var(--ink-3)',
  cursor:     'not-allowed',
}

const selectStyle: React.CSSProperties = {
  width:        '100%',
  height:       42,
  border:       '1.5px solid var(--border)',
  borderRadius: 8,
  padding:      '0 12px',
  fontSize:     14,
  fontFamily:   'var(--font-sans)',
  color:        'var(--ink-1)',
  background:   'var(--card)',
  cursor:       'pointer',
  outline:      'none',
}

const selectDisabledStyle: React.CSSProperties = {
  ...selectStyle,
  background: 'var(--surface)',
  color:      'var(--ink-3)',
  cursor:     'not-allowed',
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

const PAY_TYPES = [
  { value: 'FULL_PAY', label: 'Full Pay',           labelAr: 'أجر كامل' },
  { value: 'HALF_PAY', label: 'Half Pay',           labelAr: 'نصف أجر' },
  { value: 'NO_PAY',   label: 'No Pay (Unpaid)',    labelAr: 'بدون أجر (غير مدفوعة)' },
  { value: 'TIERED',   label: 'Tiered (by duration)', labelAr: 'متدرج (حسب المدة)' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function LeaveTypeDrawer({
  open,
  onClose,
  editRecord,
  legalEntities,
  onSaved,
}: LeaveTypeDrawerProps) {
  const isEdit = editRecord !== null
  const isStatutoryEdit = isEdit && (editRecord.isStatutory || editRecord.isSystemRecord)
  const locale = useLocale()
  const { translate: autoTranslate, translating: arTranslating } = useAutoTranslate()

  // ── Form state
  const [legalEntityId,          setLegalEntityId]          = useState('')
  const [typeCode,               setTypeCode]               = useState('')
  const [typeNameEn,             setTypeNameEn]             = useState('')
  const [typeNameAr,             setTypeNameAr]             = useState('')
  const [isStatutory,            setIsStatutory]            = useState(false)
  const [isPaid,                 setIsPaid]                 = useState<string>('FULL_PAY')
  const [maxDaysPerYear,         setMaxDaysPerYear]         = useState('')
  const [maxConsecutiveDays,     setMaxConsecutiveDays]     = useState('')
  const [minServiceMonths,       setMinServiceMonths]       = useState('0')
  const [minNoticeDays,          setMinNoticeDays]          = useState('0')
  const [requiresMedicalCert,    setRequiresMedicalCert]    = useState(false)
  const [certRequiredAfterDays,  setCertRequiredAfterDays]  = useState('')
  const [genderRestriction,      setGenderRestriction]      = useState('')
  const [religionRestriction,    setReligionRestriction]    = useState('')
  const [approvalRequired,       setApprovalRequired]       = useState(true)
  const [isOneTimePerEmployment, setIsOneTimePerEmployment] = useState(false)
  const [payrollElementCode,     setPayrollElementCode]     = useState('')

  // ── UI state
  const [error,            setError]            = useState<string | null>(null)
  const [changeReasonOpen, setChangeReasonOpen] = useState(false)
  const [pendingFormData,  setPendingFormData]  = useState<FormData | null>(null)
  const [isPending,        startTransition]     = useTransition()

  // Populate form on open
  useEffect(() => {
    if (open) {
      setError(null)
      if (editRecord) {
        setLegalEntityId(editRecord.legalEntityId ?? '')
        setTypeCode(editRecord.typeCode)
        setTypeNameEn(editRecord.typeNameEn)
        setTypeNameAr(editRecord.typeNameAr ?? '')
        setIsStatutory(editRecord.isStatutory)
        setIsPaid(editRecord.isPaid)
        setMaxDaysPerYear(editRecord.maxDaysPerYear ?? '')
        setMaxConsecutiveDays(editRecord.maxConsecutiveDays ?? '')
        setMinServiceMonths(String(editRecord.minServiceMonths))
        setMinNoticeDays(String(editRecord.minNoticeDays))
        setRequiresMedicalCert(editRecord.requiresMedicalCert)
        setCertRequiredAfterDays(editRecord.certRequiredAfterDays != null ? String(editRecord.certRequiredAfterDays) : '')
        setGenderRestriction(editRecord.genderRestriction ?? '')
        setReligionRestriction(editRecord.religionRestriction ?? '')
        setApprovalRequired(editRecord.approvalRequired)
        setIsOneTimePerEmployment(editRecord.isOneTimePerEmployment)
        setPayrollElementCode(editRecord.payrollElementCode ?? '')
      } else {
        setLegalEntityId('')
        setTypeCode('')
        setTypeNameEn('')
        setTypeNameAr('')
        setIsStatutory(false)
        setIsPaid('FULL_PAY')
        setMaxDaysPerYear('')
        setMaxConsecutiveDays('')
        setMinServiceMonths('0')
        setMinNoticeDays('0')
        setRequiresMedicalCert(false)
        setCertRequiredAfterDays('')
        setGenderRestriction('')
        setReligionRestriction('')
        setApprovalRequired(true)
        setIsOneTimePerEmployment(false)
        setPayrollElementCode('')
      }
    }
  }, [open, editRecord])

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set('legalEntityId',          legalEntityId)
    fd.set('typeCode',               typeCode)
    fd.set('typeNameEn',             typeNameEn)
    fd.set('typeNameAr',             typeNameAr)
    fd.set('isStatutory',            String(isStatutory))
    fd.set('isPaid',                 isPaid)
    fd.set('maxDaysPerYear',         maxDaysPerYear)
    fd.set('maxConsecutiveDays',     maxConsecutiveDays)
    fd.set('minServiceMonths',       minServiceMonths)
    fd.set('minNoticeDays',          minNoticeDays)
    fd.set('requiresMedicalCert',    String(requiresMedicalCert))
    fd.set('certRequiredAfterDays',  certRequiredAfterDays)
    fd.set('genderRestriction',      genderRestriction)
    fd.set('religionRestriction',    religionRestriction)
    fd.set('approvalRequired',       String(approvalRequired))
    fd.set('isOneTimePerEmployment', String(isOneTimePerEmployment))
    fd.set('payrollElementCode',     payrollElementCode)
    return fd
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const fd = buildFormData()

    if (isEdit && !editRecord?.isSystemRecord) {
      setPendingFormData(fd)
      setChangeReasonOpen(true)
    } else {
      startTransition(async () => {
        const result = await createLeaveType(fd)
        if (result.error) {
          setError(result.error)
        } else {
          onSaved()
          onClose()
        }
      })
    }
  }

  function handleChangeReasonConfirm(reason: string) {
    if (!pendingFormData || !editRecord) return
    setChangeReasonOpen(false)
    startTransition(async () => {
      const result = await updateLeaveType(editRecord.id, pendingFormData, reason)
      if (result.error) {
        setError(result.error)
      } else {
        onSaved()
        onClose()
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
          border: '1.5px solid var(--border)', borderRadius: 10,
          background: 'transparent', color: 'var(--ink-2)',
          fontSize: 'var(--text-body)', fontWeight: 500, cursor: 'pointer',
        }}
      >
        {tk(locale, 'common.cancel')}
      </button>
      {!editRecord?.isSystemRecord && (
        <button
          type="submit"
          form="leave-type-form"
          disabled={isPending}
          style={{
            height: 36, padding: '0 20px',
            border: 'none', borderRadius: 10,
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
              : (locale === 'ar' ? 'إنشاء نوع إجازة' : 'Create Leave Type')}
        </button>
      )}
    </>
  )

  return (
    <>
      <MdmDrawer
        open={open}
        onClose={onClose}
        titleEn={isEdit ? `Edit Leave Type — ${editRecord?.typeCode}` : 'New Leave Type'}
        titleAr={isEdit ? 'تعديل نوع الإجازة' : 'نوع إجازة جديد'}
        footer={footer}
        width={640}
      >
        <form id="leave-type-form" onSubmit={handleSubmit}>

          {/* System record banner */}
          {editRecord?.isSystemRecord && (
            <div style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'var(--accent-100)',
              border: '1px solid var(--accent)',
              borderRadius: 8,
              fontSize: 'var(--text-body)',
              color: 'var(--brand-active)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <Lock size={14} style={{ flexShrink: 0 }} />
              {locale === 'ar'
                ? 'هذا نوع إجازة قانوني محدد بموجب قانون العمل الإماراتي. للقراءة فقط ولا يمكن تعديله.'
                : 'This is a statutory leave type defined by UAE Labour Law. It is read-only and cannot be modified.'}
            </div>
          )}

          {error && (
            <div style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: '#FBE9E9',
              border: '1px solid #FFCDD2',
              borderRadius: 8,
              fontSize: 'var(--text-body)',
              color: '#C62828',
            }}>
              {error}
            </div>
          )}

          {/* ── Section: Scope ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'النطاق' : 'Scope'}</div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'الكيان القانوني' : 'Legal Entity'}</label>
            <select
              style={editRecord?.isSystemRecord ? selectDisabledStyle : selectStyle}
              value={legalEntityId}
              onChange={e => setLegalEntityId(e.target.value)}
              disabled={!!editRecord?.isSystemRecord}
            >
              <option value="">{locale === 'ar' ? 'جميع الكيانات (عام)' : 'All Entities (global)'}</option>
              {legalEntities.map(le => (
                <option key={le.id} value={le.id}>{le.nameEn}</option>
              ))}
            </select>
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4, display: 'block' }}>
              {locale === 'ar'
                ? 'اتركه فارغاً لتطبيق نوع الإجازة هذا على جميع الكيانات القانونية.'
                : 'Leave blank to apply this leave type across all legal entities.'}
            </span>
          </div>

          {/* ── Section: Identification ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'التعريف' : 'Identification'}</div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'رمز النوع' : 'Type Code'} <span style={{ color: '#C62828' }}>*</span>
              </label>
              <input
                style={isEdit ? inputDisabledStyle : inputStyle}
                value={typeCode}
                onChange={e => setTypeCode(e.target.value.toUpperCase())}
                placeholder="e.g. ANNUAL"
                maxLength={30}
                required
                disabled={isEdit}
                readOnly={isEdit}
              />
              {isEdit && (
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4, display: 'block' }}>
                  {locale === 'ar' ? 'لا يمكن تغيير الرمز بعد الإنشاء.' : 'Code cannot be changed after creation.'}
                </span>
              )}
            </div>

            <div style={fieldWrapStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  {locale === 'ar' ? 'نوع الأجر' : 'Pay Type'} <span style={{ color: '#C62828' }}>*</span>
                </label>
                {isStatutoryEdit && (
                  <span title={locale === 'ar' ? 'الحد الأدنى القانوني — لا يمكن تخفيضه (قانون العمل الإماراتي)' : 'Statutory minimum — cannot be reduced (UAE Labour Law)'} style={{ marginBottom: 6, display: 'inline-flex' }}>
                    <Lock size={12} style={{ color: 'var(--brand-active)' }} />
                  </span>
                )}
              </div>
              <select
                style={isStatutoryEdit ? selectDisabledStyle : selectStyle}
                value={isPaid}
                onChange={e => setIsPaid(e.target.value)}
                required
                disabled={isStatutoryEdit}
              >
                {PAY_TYPES.map(p => (
                  <option key={p.value} value={p.value}>{locale === 'ar' ? p.labelAr : p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'} <span style={{ color: '#C62828' }}>*</span>
                <span style={{ marginLeft: 6, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>EN</span>
              </label>
              <input
                style={editRecord?.isSystemRecord ? inputDisabledStyle : inputStyle}
                value={typeNameEn}
                onChange={e => setTypeNameEn(e.target.value)}
                onBlur={async () => {
                  if (typeNameEn.trim() && !editRecord?.isSystemRecord &&
                      (!typeNameAr.trim() || typeNameEn !== editRecord?.typeNameEn)) {
                    const ar = await autoTranslate(typeNameEn)
                    if (ar) setTypeNameAr(ar)
                  }
                }}
                placeholder="Annual Leave"
                maxLength={200}
                required
                disabled={!!editRecord?.isSystemRecord}
                readOnly={!!editRecord?.isSystemRecord}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={{ ...labelStyle, textAlign: 'right' }}>
                <span style={{ marginRight: 6, fontSize: 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>AR</span>
                الاسم (عربي)
                {arTranslating && <span style={{ marginRight: 6, fontSize: 'var(--text-caption)', color: 'var(--ink-4)', fontStyle: 'italic' }}>جاري الترجمة…</span>}
              </label>
              <input
                style={editRecord?.isSystemRecord
                  ? { ...inputDisabledStyle, direction: 'rtl', textAlign: 'right' }
                  : { ...inputStyle, direction: 'rtl', textAlign: 'right', opacity: arTranslating ? 0.6 : 1 }}
                value={typeNameAr}
                onChange={e => setTypeNameAr(e.target.value)}
                placeholder="إجازة سنوية"
                maxLength={200}
                dir="rtl"
                lang="ar"
                disabled={arTranslating || !!editRecord?.isSystemRecord}
                readOnly={!!editRecord?.isSystemRecord}
              />
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>يتم الترجمة تلقائياً من الاسم الإنجليزي</div>
            </div>
          </div>

          {/* ── Section: Entitlement ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'الاستحقاق' : 'Entitlement'}</div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>{locale === 'ar' ? 'الحد الأقصى للأيام / السنة' : 'Max Days / Year'}</label>
                {isStatutoryEdit && (
                  <span title={locale === 'ar' ? 'الحد الأدنى القانوني — لا يمكن تخفيضه (قانون العمل الإماراتي)' : 'Statutory minimum — cannot be reduced (UAE Labour Law)'} style={{ marginBottom: 6, display: 'inline-flex' }}>
                    <Lock size={12} style={{ color: 'var(--brand-active)' }} />
                  </span>
                )}
              </div>
              <input
                style={isStatutoryEdit ? inputDisabledStyle : inputStyle}
                type="number"
                min={0}
                step={0.5}
                value={maxDaysPerYear}
                onChange={e => setMaxDaysPerYear(e.target.value)}
                placeholder={locale === 'ar' ? '30 (فارغ = غير محدود)' : '30 (blank = unlimited)'}
                disabled={isStatutoryEdit}
                readOnly={isStatutoryEdit}
              />
              {typeCode === 'ANNUAL' && (
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--brand-active)', marginTop: 4, display: 'block' }}>
                  {locale === 'ar'
                    ? 'الحد الأدنى في الإمارات = 30 يوماً تقويمياً ≈ 22 يوم عمل'
                    : 'UAE minimum = 30 calendar days ≈ 22 working days'}
                </span>
              )}
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>{locale === 'ar' ? 'الحد الأقصى للأيام المتتالية' : 'Max Consecutive Days'}</label>
              <input
                style={editRecord?.isSystemRecord ? inputDisabledStyle : inputStyle}
                type="number"
                min={0}
                step={0.5}
                value={maxConsecutiveDays}
                onChange={e => setMaxConsecutiveDays(e.target.value)}
                placeholder={locale === 'ar' ? 'فارغ = بلا حد' : 'Blank = no limit'}
                disabled={!!editRecord?.isSystemRecord}
                readOnly={!!editRecord?.isSystemRecord}
              />
            </div>
          </div>

          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'الحد الأدنى للخدمة (أشهر)' : 'Min Service (Months)'} <span style={{ color: '#C62828' }}>*</span>
              </label>
              <input
                style={editRecord?.isSystemRecord ? inputDisabledStyle : inputStyle}
                type="number"
                min={0}
                step={1}
                value={minServiceMonths}
                onChange={e => setMinServiceMonths(e.target.value)}
                required
                disabled={!!editRecord?.isSystemRecord}
                readOnly={!!editRecord?.isSystemRecord}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>
                {locale === 'ar' ? 'الحد الأدنى للإشعار (أيام)' : 'Min Notice (Days)'} <span style={{ color: '#C62828' }}>*</span>
              </label>
              <input
                style={editRecord?.isSystemRecord ? inputDisabledStyle : inputStyle}
                type="number"
                min={0}
                step={1}
                value={minNoticeDays}
                onChange={e => setMinNoticeDays(e.target.value)}
                required
                disabled={!!editRecord?.isSystemRecord}
                readOnly={!!editRecord?.isSystemRecord}
              />
            </div>
          </div>

          {/* ── Section: Rules ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'القواعد والقيود' : 'Rules & Restrictions'}</div>

          {/* Toggle: Is Statutory */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <input
              type="checkbox"
              id="lt-isStatutory"
              checked={isStatutory}
              onChange={e => setIsStatutory(e.target.checked)}
              disabled={!!editRecord?.isSystemRecord}
              style={{ width: 18, height: 18, cursor: editRecord?.isSystemRecord ? 'not-allowed' : 'pointer', accentColor: 'var(--accent)' }}
            />
            <label htmlFor="lt-isStatutory" style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', cursor: editRecord?.isSystemRecord ? 'not-allowed' : 'pointer' }}>
              {locale === 'ar' ? 'قانوني (إلزامي بموجب قانون العمل الإماراتي)' : 'Is Statutory (UAE Labour Law requirement)'}
            </label>
          </div>

          {/* Toggle: Approval Required */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <input
              type="checkbox"
              id="lt-approvalRequired"
              checked={approvalRequired}
              onChange={e => setApprovalRequired(e.target.checked)}
              disabled={!!editRecord?.isSystemRecord}
              style={{ width: 18, height: 18, cursor: editRecord?.isSystemRecord ? 'not-allowed' : 'pointer', accentColor: 'var(--accent)' }}
            />
            <label htmlFor="lt-approvalRequired" style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', cursor: editRecord?.isSystemRecord ? 'not-allowed' : 'pointer' }}>
              {locale === 'ar' ? 'يتطلب موافقة' : 'Approval Required'} <span style={{ color: '#C62828' }}>*</span>
            </label>
          </div>

          {/* Toggle: Once Per Employment */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <input
              type="checkbox"
              id="lt-oneTime"
              checked={isOneTimePerEmployment}
              onChange={e => setIsOneTimePerEmployment(e.target.checked)}
              disabled={!!editRecord?.isSystemRecord}
              style={{ width: 18, height: 18, cursor: editRecord?.isSystemRecord ? 'not-allowed' : 'pointer', accentColor: 'var(--accent)' }}
            />
            <label htmlFor="lt-oneTime" style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', cursor: editRecord?.isSystemRecord ? 'not-allowed' : 'pointer' }}>
              {locale === 'ar' ? 'مرة واحدة لكل توظيف (مثل إجازة الحج)' : 'Once Per Employment (e.g. Hajj Leave)'}
            </label>
          </div>

          {/* Toggle: Requires Medical Certificate */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <input
              type="checkbox"
              id="lt-medCert"
              checked={requiresMedicalCert}
              onChange={e => setRequiresMedicalCert(e.target.checked)}
              disabled={!!editRecord?.isSystemRecord}
              style={{ width: 18, height: 18, cursor: editRecord?.isSystemRecord ? 'not-allowed' : 'pointer', accentColor: 'var(--accent)' }}
            />
            <label htmlFor="lt-medCert" style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', cursor: editRecord?.isSystemRecord ? 'not-allowed' : 'pointer' }}>
              {locale === 'ar' ? 'يتطلب شهادة طبية' : 'Requires Medical Certificate'}
            </label>
          </div>

          {requiresMedicalCert && (
            <div style={{ ...fieldWrapStyle, marginLeft: 28 }}>
              <label style={labelStyle}>{locale === 'ar' ? 'الشهادة مطلوبة بعد (أيام)' : 'Certificate Required After (Days)'}</label>
              <input
                style={editRecord?.isSystemRecord ? inputDisabledStyle : inputStyle}
                type="number"
                min={1}
                step={1}
                value={certRequiredAfterDays}
                onChange={e => setCertRequiredAfterDays(e.target.value)}
                placeholder="e.g. 3 (blank = always required)"
                disabled={!!editRecord?.isSystemRecord}
                readOnly={!!editRecord?.isSystemRecord}
              />
            </div>
          )}

          {/* Gender restriction */}
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'قيد الجنس' : 'Gender Restriction'}</label>
            <select
              style={editRecord?.isSystemRecord ? selectDisabledStyle : selectStyle}
              value={genderRestriction}
              onChange={e => setGenderRestriction(e.target.value)}
              disabled={!!editRecord?.isSystemRecord}
            >
              <option value="">{locale === 'ar' ? 'بلا (جميع الأجناس)' : 'None (all genders)'}</option>
              <option value="MALE">{locale === 'ar' ? 'الذكور فقط' : 'Male Only'}</option>
              <option value="FEMALE">{locale === 'ar' ? 'الإناث فقط' : 'Female Only'}</option>
            </select>
          </div>

          {/* Religion restriction */}
          <div style={fieldWrapStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'قيد الديانة' : 'Religion Restriction'}</label>
            <input
              style={editRecord?.isSystemRecord ? inputDisabledStyle : inputStyle}
              value={religionRestriction}
              onChange={e => setReligionRestriction(e.target.value)}
              placeholder="e.g. ISLAM (blank = all religions)"
              maxLength={30}
              disabled={!!editRecord?.isSystemRecord}
              readOnly={!!editRecord?.isSystemRecord}
            />
          </div>

          {/* ── Section: Payroll ── */}
          <div style={sectionDividerStyle}>{locale === 'ar' ? 'تكامل الرواتب' : 'Payroll Integration'}</div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'رمز عنصر الرواتب' : 'Payroll Element Code'}</label>
            <input
              style={editRecord?.isSystemRecord ? inputDisabledStyle : inputStyle}
              value={payrollElementCode}
              onChange={e => setPayrollElementCode(e.target.value)}
              placeholder="e.g. ABS-ANNUAL"
              maxLength={50}
              disabled={!!editRecord?.isSystemRecord}
              readOnly={!!editRecord?.isSystemRecord}
            />
            <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4, display: 'block' }}>
              {locale === 'ar'
                ? 'يرتبط بعنصر نظام الرواتب لحسابات أجر الإجازة.'
                : 'Maps to the payroll system element for leave pay calculations.'}
            </span>
          </div>

        </form>
      </MdmDrawer>

      <ChangeReasonModal
        open={changeReasonOpen}
        onClose={() => setChangeReasonOpen(false)}
        onConfirm={handleChangeReasonConfirm}
        isPending={isPending}
      />
    </>
  )
}
