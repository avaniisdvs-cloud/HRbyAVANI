'use client'

import { useState, useEffect, useTransition } from 'react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import {
  createWorkflowDefinition,
  updateWorkflowDefinition,
} from '@/modules/workflow/actions'
import type {
  WorkflowDefinitionRow,
  TriggerEvent,
  HierarchyType,
  OnApproverNotFound,
} from '@/modules/workflow/actions'

// ── Types ──────────────────────────────────────────────────────────────────

interface WorkflowDrawerProps {
  open:      boolean
  onClose:   () => void
  onSuccess: (row: WorkflowDefinitionRow) => void
  editRow?:  WorkflowDefinitionRow | null
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
  fontSize: 14,
  fontFamily: 'var(--font-sans)',
  color: 'var(--ink-1)',
  background: 'var(--card)',
  outline: 'none',
  boxSizing: 'border-box',
}

const errorText: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  color: '#C62828',
  marginTop: 4,
}

const TRIGGER_OPTIONS: { value: TriggerEvent; label: string; labelAr: string }[] = [
  { value: 'LEAVE_REQUEST',    label: 'Leave Request',    labelAr: 'طلب إجازة' },
  { value: 'HIRE',             label: 'Hire',             labelAr: 'تعيين' },
  { value: 'TRANSFER',         label: 'Transfer',         labelAr: 'نقل' },
  { value: 'SALARY_REVISION',  label: 'Salary Revision',  labelAr: 'مراجعة الراتب' },
  { value: 'TERMINATION',      label: 'Termination',      labelAr: 'إنهاء الخدمة' },
  { value: 'OVERTIME_REQUEST', label: 'Overtime Request', labelAr: 'طلب عمل إضافي' },
  { value: 'EXIT_CLEARANCE',   label: 'Exit Clearance',   labelAr: 'إخلاء الطرف' },
  { value: 'PROBATION_CONFIRM', label: 'Probation Confirm', labelAr: 'تثبيت بعد التجربة' },
  { value: 'VISA_RENEWAL',     label: 'Visa Renewal',     labelAr: 'تجديد التأشيرة' },
]

const HIERARCHY_OPTIONS: { value: HierarchyType; label: string; labelAr: string }[] = [
  { value: 'LINE_MANAGER',  label: 'Line Manager', labelAr: 'المدير المباشر' },
  { value: 'POSITION',      label: 'Position',     labelAr: 'المنصب' },
  { value: 'CUSTOM_GROUP',  label: 'Custom Group', labelAr: 'مجموعة مخصصة' },
]

const NOT_FOUND_OPTIONS: { value: OnApproverNotFound; label: string; labelAr: string }[] = [
  { value: 'ESCALATE_UP',      label: 'Escalate Up',            labelAr: 'التصعيد للأعلى' },
  { value: 'USE_FALLBACK',     label: 'Use Fallback Approver',  labelAr: 'استخدام معتمد بديل' },
  { value: 'ASSIGN_HR_ADMIN',  label: 'Assign HR Admin',        labelAr: 'إسناد لمسؤول الموارد البشرية' },
  { value: 'BLOCK_WITH_ERROR', label: 'Block with Error',       labelAr: 'الحظر مع خطأ' },
]

// ── Component ──────────────────────────────────────────────────────────────

export function WorkflowDrawer({ open, onClose, onSuccess, editRow }: WorkflowDrawerProps) {
  const locale = useLocale()
  const isEdit = !!editRow

  // Basics
  const [workflowCode,    setWorkflowCode]    = useState('')
  const [workflowNameEn,  setWorkflowNameEn]  = useState('')
  const [workflowNameAr,  setWorkflowNameAr]  = useState('')
  const [description,     setDescription]     = useState('')

  // Routing
  const [triggerEvent,      setTriggerEvent]      = useState<TriggerEvent>('HIRE')
  const [hierarchyType,     setHierarchyType]     = useState<HierarchyType | ''>('')
  const [onApproverNotFound, setOnApproverNotFound] = useState<OnApproverNotFound | ''>('')

  // SLA
  const [slaHours,        setSlaHours]        = useState('48')
  const [escalationHours, setEscalationHours] = useState('72')

  // Compliance
  const [requiresMedicalCert,   setRequiresMedicalCert]   = useState(false)
  const [requiresManagerComment, setRequiresManagerComment] = useState(false)

  // UI
  const [serverError,  setServerError]  = useState<string | null>(null)
  const [fieldErrors,  setFieldErrors]  = useState<Record<string, string>>({})
  const [isPending,    startTransition] = useTransition()

  // Populate form when editing
  useEffect(() => {
    if (open && editRow) {
      setWorkflowCode(editRow.workflowCode)
      setWorkflowNameEn(editRow.workflowNameEn)
      setWorkflowNameAr(editRow.workflowNameAr ?? '')
      setTriggerEvent(editRow.triggerEvent as TriggerEvent)
      setHierarchyType((editRow.defaultHierarchyType as HierarchyType | null) ?? '')
      setSlaHours(String(editRow.defaultSlaHours))
      setEscalationHours('72')
      setDescription('')
      setOnApproverNotFound('')
      setRequiresMedicalCert(false)
      setRequiresManagerComment(false)
    } else if (open && !editRow) {
      setWorkflowCode('')
      setWorkflowNameEn('')
      setWorkflowNameAr('')
      setDescription('')
      setTriggerEvent('HIRE')
      setHierarchyType('')
      setOnApproverNotFound('')
      setSlaHours('48')
      setEscalationHours('72')
      setRequiresMedicalCert(false)
      setRequiresManagerComment(false)
    }
    setFieldErrors({})
    setServerError(null)
  }, [open, editRow])

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!workflowCode) {
      errs.workflowCode = 'Workflow code is required.'
    } else if (!/^[A-Z0-9_]+$/.test(workflowCode)) {
      errs.workflowCode = 'Code must be uppercase letters, digits, and underscores only.'
    }
    if (!workflowNameEn) errs.workflowNameEn = 'Workflow name (EN) is required.'
    const sla = parseInt(slaHours, 10)
    if (isNaN(sla) || sla < 1 || sla > 720) {
      errs.slaHours = 'SLA hours must be between 1 and 720.'
    }
    return errs
  }

  function handleSubmit() {
    setFieldErrors({})
    setServerError(null)
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      return
    }

    const sla        = parseInt(slaHours, 10)
    const escalation = parseInt(escalationHours, 10)
    const hierarchy  = (hierarchyType as HierarchyType) || undefined
    const notFound   = (onApproverNotFound as OnApproverNotFound) || undefined

    startTransition(async () => {
      if (isEdit) {
        const result = await updateWorkflowDefinition(editRow!.id, {
          workflowNameEn,
          workflowNameAr:          workflowNameAr || undefined,
          description:             description || undefined,
          triggerEvent,
          defaultHierarchyType:    hierarchy,
          onApproverNotFound:      notFound,
          defaultSlaHours:         sla,
          defaultEscalationHours:  escalation,
          requiresMedicalCert,
          requiresManagerComment,
        })
        if (result.success) {
          onSuccess({
            id:                   editRow!.id,
            workflowCode:         editRow!.workflowCode,
            workflowNameEn,
            workflowNameAr:       workflowNameAr || null,
            triggerEvent,
            defaultHierarchyType: hierarchy ?? null,
            defaultSlaHours:      sla,
            isActive:             editRow!.isActive,
            version:              editRow!.version + 1,
            stepCount:            editRow!.stepCount,
            createdDate:          editRow!.createdDate,
          })
        } else {
          setServerError(result.error ?? 'Update failed.')
        }
      } else {
        const result = await createWorkflowDefinition({
          workflowCode,
          workflowNameEn,
          workflowNameAr:          workflowNameAr || undefined,
          description:             description || undefined,
          triggerEvent,
          defaultHierarchyType:    hierarchy,
          onApproverNotFound:      notFound,
          defaultSlaHours:         sla,
          defaultEscalationHours:  escalation,
          requiresMedicalCert,
          requiresManagerComment,
        })
        if (result.success && result.id) {
          onSuccess({
            id:                   result.id,
            workflowCode,
            workflowNameEn,
            workflowNameAr:       workflowNameAr || null,
            triggerEvent,
            defaultHierarchyType: hierarchy ?? null,
            defaultSlaHours:      sla,
            isActive:             true,
            version:              1,
            stepCount:            0,
            createdDate:          new Date(),
          })
        } else {
          setServerError(result.error ?? 'Create failed.')
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
        {locale === 'ar' ? 'إلغاء' : 'Cancel'}
      </button>
      <button
        type="button"
        onClick={handleSubmit}
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
          ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…')
          : isEdit
            ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes')
            : (locale === 'ar' ? 'إنشاء سير العمل' : 'Create Workflow')}
      </button>
    </>
  )

  return (
    <MdmDrawer
      open={open}
      onClose={onClose}
      titleEn={isEdit
        ? (locale === 'ar' ? `تعديل سير العمل — ${editRow?.workflowCode}` : `Edit Workflow — ${editRow?.workflowCode}`)
        : (locale === 'ar' ? 'تعريف سير عمل جديد' : 'New Workflow Definition')}
      titleAr={locale === 'ar' ? '' : (isEdit ? 'تعديل سير العمل' : 'تعريف سير عمل جديد')}
      footer={footer}
      width={640}
    >
      {serverError && (
        <div style={{
          background: '#FBE9E9',
          border: '1px solid #FFCDD2',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          fontSize: 'var(--text-body)',
          color: '#C62828',
        }}>
          {serverError}
        </div>
      )}

      {/* ── Basics ───────────────────────────────────────────────────── */}
      <div style={sectionLabel}>{locale === 'ar' ? 'الأساسيات' : 'Basics'}</div>

      <div style={fieldWrap}>
        <label style={fieldLabel}>
          {locale === 'ar' ? 'رمز سير العمل' : 'Workflow Code'} <span style={requiredStar}>*</span>
        </label>
        <input
          type="text"
          value={workflowCode}
          onChange={e => setWorkflowCode(e.target.value.toUpperCase().replace(/\s/g, '_'))}
          placeholder="e.g. LEAVE_APPROVAL"
          maxLength={50}
          disabled={isEdit}
          style={{ ...inputBase, ...(isEdit ? { background: 'var(--surface)', color: 'var(--ink-3)', cursor: 'not-allowed' } : {}) }}
        />
        {fieldErrors.workflowCode && <div style={errorText}>{fieldErrors.workflowCode}</div>}
        {isEdit && (
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>{locale === 'ar' ? 'رمز سير العمل غير قابل للتعديل بعد الإنشاء.' : 'Workflow code is immutable after creation.'}</div>
        )}
        {!isEdit && (
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>{locale === 'ar' ? 'أحرف كبيرة وأرقام وشرطات سفلية فقط. بدون مسافات.' : 'Uppercase letters, digits, and underscores only. No spaces.'}</div>
        )}
      </div>

      <div style={fieldWrap}>
        <label style={fieldLabel}>
          {locale === 'ar' ? 'اسم سير العمل (إنجليزي)' : 'Workflow Name (English)'} <span style={requiredStar}>*</span>
        </label>
        <input
          type="text"
          value={workflowNameEn}
          onChange={e => setWorkflowNameEn(e.target.value)}
          placeholder="e.g. Annual Leave Approval"
          maxLength={200}
          style={inputBase}
        />
        {fieldErrors.workflowNameEn && <div style={errorText}>{fieldErrors.workflowNameEn}</div>}
      </div>

      <div style={fieldWrap}>
        <label style={fieldLabel}>{locale === 'ar' ? 'اسم سير العمل (عربي)' : 'Workflow Name (Arabic)'}</label>
        <input
          type="text"
          value={workflowNameAr}
          onChange={e => setWorkflowNameAr(e.target.value)}
          placeholder="مثال: موافقة إجازة سنوية"
          dir="rtl"
          lang="ar"
          maxLength={200}
          style={{ ...inputBase, textAlign: 'right' }}
        />
      </div>

      <div style={fieldWrap}>
        <label style={fieldLabel}>{locale === 'ar' ? 'الوصف' : 'Description'}</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe when and how this workflow applies…"
          rows={3}
          style={{ ...inputBase, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>

      {/* ── Routing ──────────────────────────────────────────────────── */}
      <div style={sectionLabel}>{locale === 'ar' ? 'التوجيه' : 'Routing'}</div>

      <div style={fieldWrap}>
        <label style={fieldLabel}>
          {locale === 'ar' ? 'حدث التشغيل' : 'Trigger Event'} <span style={requiredStar}>*</span>
        </label>
        <select value={triggerEvent} onChange={e => setTriggerEvent(e.target.value as TriggerEvent)} style={inputBase}>
          {TRIGGER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{locale === 'ar' ? o.labelAr : o.label}</option>
          ))}
        </select>
      </div>

      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={fieldWrap}>
          <label style={fieldLabel}>{locale === 'ar' ? 'نوع التسلسل الافتراضي' : 'Default Hierarchy Type'}</label>
          <select value={hierarchyType} onChange={e => setHierarchyType(e.target.value as HierarchyType | '')} style={inputBase}>
            <option value="">{locale === 'ar' ? '— غير محدد —' : '— Not set —'}</option>
            {HIERARCHY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{locale === 'ar' ? o.labelAr : o.label}</option>
            ))}
          </select>
        </div>

        <div style={fieldWrap}>
          <label style={fieldLabel}>{locale === 'ar' ? 'عند عدم العثور على معتمد' : 'On Approver Not Found'}</label>
          <select value={onApproverNotFound} onChange={e => setOnApproverNotFound(e.target.value as OnApproverNotFound | '')} style={inputBase}>
            <option value="">{locale === 'ar' ? '— غير محدد —' : '— Not set —'}</option>
            {NOT_FOUND_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{locale === 'ar' ? o.labelAr : o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── SLA ──────────────────────────────────────────────────────── */}
      <div style={sectionLabel}>{locale === 'ar' ? 'اتفاقية مستوى الخدمة' : 'SLA'}</div>

      <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={fieldWrap}>
          <label style={fieldLabel}>
            {locale === 'ar' ? 'ساعات مستوى الخدمة' : 'SLA Hours'} <span style={requiredStar}>*</span>
          </label>
          <input
            type="number"
            value={slaHours}
            onChange={e => setSlaHours(e.target.value)}
            min={1}
            max={720}
            style={inputBase}
          />
          {fieldErrors.slaHours && <div style={errorText}>{fieldErrors.slaHours}</div>}
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>{locale === 'ar' ? '1–720 ساعة (بحد أقصى 30 يومًا)' : '1–720 hours (max 30 days)'}</div>
        </div>

        <div style={fieldWrap}>
          <label style={fieldLabel}>{locale === 'ar' ? 'ساعات التصعيد' : 'Escalation Hours'}</label>
          <input
            type="number"
            value={escalationHours}
            onChange={e => setEscalationHours(e.target.value)}
            min={1}
            max={720}
            style={inputBase}
          />
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', marginTop: 4 }}>{locale === 'ar' ? 'عدد الساعات قبل التصعيد للمعتمد التالي' : 'Hours before escalating to next approver'}</div>
        </div>
      </div>

      {/* ── Compliance ───────────────────────────────────────────────── */}
      <div style={sectionLabel}>{locale === 'ar' ? 'الامتثال' : 'Compliance'}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={requiresMedicalCert}
            onChange={e => setRequiresMedicalCert(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <span style={{ color: 'var(--ink-1)', fontWeight: 500 }}>{locale === 'ar' ? 'يتطلب شهادة طبية' : 'Requires Medical Certificate'}</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={requiresManagerComment}
            onChange={e => setRequiresManagerComment(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <span style={{ color: 'var(--ink-1)', fontWeight: 500 }}>{locale === 'ar' ? 'يتطلب تعليق المدير' : 'Requires Manager Comment'}</span>
        </label>
      </div>
    </MdmDrawer>
  )
}
