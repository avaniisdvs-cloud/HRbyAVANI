'use client'

/**
 * StepEditorDrawer — slide-in panel for creating / editing a workflow step.
 *
 * Sections:
 *   1. Step Info     — stepCode, stepNameEn/Ar, stepEffect
 *   2. Routing       — hierarchyType, hierarchyLevel (LINE_MANAGER), customGroupId (CUSTOM_GROUP)
 *   3. SLA & Escalation — slaHours, onSlaBreach
 *   4. Activation    — ConditionBuilder for activationCondition + activationRuleName
 *   5. Options       — isFyiOnly, canDelegate, isOptional, skipIfAlreadyApproved
 */

import { useTransition, useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { MdmDrawer } from '@/components/mdm/MdmDrawer'
import { ConditionBuilder } from '@/components/workflow/ConditionBuilder'
import { PersonSelect, type PersonOption } from '@/components/forms/PersonSelect'
import type { ConditionNode, WorkflowStepV2, NewWorkflowStepV2 } from '@/drizzle/schema/workflow-engine'
import { createWorkflowStep, updateWorkflowStep } from '@/modules/workflow/actions'

// ── Types ─────────────────────────────────────────────────────────────────

interface StepEditorDrawerProps {
  workflowId:    string
  step:          WorkflowStepV2 | null  // null = create mode
  open:          boolean
  onClose:       () => void
  onSaved:       () => void
  groupOptions:  PersonOption[]          // active approval groups for the CUSTOM_GROUP picker
}

// ── Constants ─────────────────────────────────────────────────────────────

// Values must match the `hierarchy_type_enum` Postgres enum exactly.
// LINE_MANAGER → resolves via worker_assignments.line_manager_id chain
// POSITION     → resolves via positions.reports_to_position_id chain
// CUSTOM_GROUP → resolves via approval_groups (set hierarchyGroupId) OR
//                a specific person (set hierarchyGroupId to null and use
//                a group containing only that person, or set hierarchyPersonId)
const HIERARCHY_TYPES = [
  { value: 'LINE_MANAGER', label: 'Line Manager (by reporting level)', labelAr: 'المدير المباشر (حسب مستوى التقارير)' },
  { value: 'POSITION',     label: 'Position (org-chart chain)',        labelAr: 'المنصب (سلسلة الهيكل التنظيمي)' },
  { value: 'CUSTOM_GROUP', label: 'Approval Group',                   labelAr: 'مجموعة الاعتماد' },
]

// Values must match the `step_effect_enum` Postgres enum exactly.
const STEP_EFFECTS = [
  { value: 'NORMAL',          label: 'Normal (sequential)',     labelAr: 'عادي (متسلسل)' },
  { value: 'ADD_IF_MATCHES',  label: 'Conditional add',         labelAr: 'إضافة شرطية' },
  { value: 'REPLACE',         label: 'Replace previous step',   labelAr: 'استبدال الخطوة السابقة' },
  { value: 'SKIP_PREVIOUS',   label: 'Skip previous step',      labelAr: 'تخطّي الخطوة السابقة' },
  { value: 'INJECT_BEFORE',   label: 'Inject before target',    labelAr: 'إدراج قبل الهدف' },
  { value: 'INJECT_AFTER',    label: 'Inject after target',     labelAr: 'إدراج بعد الهدف' },
  { value: 'PARALLEL_ADD',    label: 'Add in parallel',         labelAr: 'إضافة بالتوازي' },
]

// Values must match the `sla_breach_action_enum` Postgres enum exactly.
const SLA_BREACH_OPTIONS = [
  { value: 'ESCALATE',      label: 'Escalate',       labelAr: 'تصعيد' },
  { value: 'AUTO_APPROVE',  label: 'Auto-approve',   labelAr: 'موافقة تلقائية' },
  { value: 'AUTO_REJECT',   label: 'Auto-reject',    labelAr: 'رفض تلقائي' },
  { value: 'SEND_REMINDER', label: 'Send reminder',  labelAr: 'إرسال تذكير' },
  { value: 'BLOCK_FREEZE',  label: 'Block & freeze', labelAr: 'حظر وتجميد' },
]

// ── Form field helpers ────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      margin: '20px 0 12px',
      paddingBottom: 6, borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </h3>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--ink-1)',
  fontSize: 'var(--text-body)',
  width: '100%',
  boxSizing: 'border-box',
}

function CheckRow({ label, checked, onChange }: {
  label:    string
  checked:  boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-body)', color: 'var(--ink-1)' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 15, height: 15 }}
      />
      {label}
    </label>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export function StepEditorDrawer({ workflowId, step, open, onClose, onSaved, groupOptions }: StepEditorDrawerProps) {
  const isNew = step === null
  const locale = useLocale()

  // Form state
  const [stepCode,             setStepCode]             = useState(step?.stepCode ?? '')
  const [stepNameEn,           setStepNameEn]           = useState(step?.stepNameEn ?? '')
  const [stepNameAr,           setStepNameAr]           = useState(step?.stepNameAr ?? '')
  const [stepEffect,           setStepEffect]           = useState<NewWorkflowStepV2['stepEffect']>(step?.stepEffect ?? 'NORMAL')
  const [hierarchyType,        setHierarchyType]        = useState<NewWorkflowStepV2['hierarchyType']>(step?.hierarchyType ?? 'LINE_MANAGER')
  const [hierarchyLevel,       setHierarchyLevel]       = useState(step?.hierarchyLevel ?? 1)
  const [customGroupId,        setCustomGroupId]        = useState(step?.hierarchyGroupId ?? '')
  const [slaHours,             setSlaHours]             = useState(step?.slaHours ?? 24)
  const [onSlaBreach,          setOnSlaBreach]          = useState<NewWorkflowStepV2['onSlaBreach']>(step?.onSlaBreach ?? 'ESCALATE')
  const [activationCondition,  setActivationCondition]  = useState<ConditionNode | null>(null)
  const [activationRuleName,   setActivationRuleName]   = useState('')
  const [isFyiOnly,            setIsFyiOnly]            = useState(step?.isFyiOnly ?? false)
  const [canDelegate,          setCanDelegate]          = useState(step?.canDelegate ?? true)
  const [isOptional,           setIsOptional]           = useState(step?.isOptional ?? false)
  const [skipIfAlreadyApproved, setSkipIfAlreadyApproved] = useState(step?.skipIfAlreadyApproved ?? false)

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Reset all form state when the drawer opens or the target step changes
  useEffect(() => {
    if (!open) return
    setStepCode(step?.stepCode ?? '')
    setStepNameEn(step?.stepNameEn ?? '')
    setStepNameAr(step?.stepNameAr ?? '')
    setStepEffect(step?.stepEffect ?? 'NORMAL')
    setHierarchyType(step?.hierarchyType ?? 'LINE_MANAGER')
    setHierarchyLevel(step?.hierarchyLevel ?? 1)
    setCustomGroupId(step?.hierarchyGroupId ?? '')
    setSlaHours(step?.slaHours ?? 24)
    setOnSlaBreach(step?.onSlaBreach ?? 'ESCALATE')
    setActivationCondition(null)
    setActivationRuleName('')
    setIsFyiOnly(step?.isFyiOnly ?? false)
    setCanDelegate(step?.canDelegate ?? true)
    setIsOptional(step?.isOptional ?? false)
    setSkipIfAlreadyApproved(step?.skipIfAlreadyApproved ?? false)
    setError(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step?.id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!stepNameEn.trim()) {
      setError(locale === 'ar' ? 'اسم الخطوة (إنجليزي) مطلوب.' : 'Step name (EN) is required.')
      return
    }

    const input: NewWorkflowStepV2 = {
      stepCode:              stepCode.trim() || null,
      stepNameEn:            stepNameEn.trim(),
      stepNameAr:            stepNameAr.trim() || null,
      stepEffect:            stepEffect as NewWorkflowStepV2['stepEffect'],
      hierarchyType:         hierarchyType as NewWorkflowStepV2['hierarchyType'],
      hierarchyLevel:        hierarchyType === 'LINE_MANAGER' ? hierarchyLevel : null,
      hierarchyGroupId:      hierarchyType === 'CUSTOM_GROUP' ? (customGroupId || null) : null,
      slaHours,
      onSlaBreach:           onSlaBreach as NewWorkflowStepV2['onSlaBreach'],
      activationConditionId: null,
      isFyiOnly,
      canDelegate,
      isOptional,
      skipIfAlreadyApproved,
      workflowDefinitionId:  workflowId,
      stepOrder:             0, // will be set server-side
      createdBy:             '',
      createdByName:         '',
    }

    startTransition(async () => {
      const result = isNew
        ? await createWorkflowStep(workflowId, input)
        : await updateWorkflowStep(step!.id, input)

      if (!result.success) {
        setError(result.error ?? (locale === 'ar' ? 'حدث خطأ.' : 'An error occurred.'))
      } else {
        onSaved()
        onClose()
      }
    })
  }

  const titleEn = isNew ? 'Add Step' : 'Edit Step'
  const titleAr = isNew ? 'إضافة خطوة' : 'تعديل الخطوة'

  const footer = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={isPending}
        style={{
          padding: '8px 18px', borderRadius: 6, border: '1px solid var(--border)',
          background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-body)', color: 'var(--ink-2)',
        }}
      >
        {locale === 'ar' ? 'إلغاء' : 'Cancel'}
      </button>
      <button
        type="submit"
        form="step-editor-form"
        disabled={isPending}
        style={{
          padding: '8px 18px', borderRadius: 6, border: 'none',
          background: 'var(--accent)', cursor: isPending ? 'not-allowed' : 'pointer',
          fontSize: 'var(--text-body)', color: "var(--on-accent)", display: 'flex', alignItems: 'center', gap: 6,
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
        {isNew ? (locale === 'ar' ? 'إنشاء خطوة' : 'Create step') : (locale === 'ar' ? 'حفظ التغييرات' : 'Save changes')}
      </button>
    </>
  )

  return (
    <MdmDrawer
      open={open}
      onClose={onClose}
      titleEn={titleEn}
      titleAr={titleAr}
      footer={footer}
      width={620}
    >
      <form id="step-editor-form" onSubmit={handleSubmit}>
        {/* ── 1. Step Info ── */}
        <SectionTitle>{locale === 'ar' ? 'معلومات الخطوة' : 'Step Info'}</SectionTitle>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={locale === 'ar' ? 'رمز الخطوة (اختياري)' : 'Step Code (optional)'}>
            <input style={inputStyle} value={stepCode} onChange={e => setStepCode(e.target.value)} placeholder="e.g. LM_APPROVAL" />
          </Field>
          <Field label={locale === 'ar' ? 'تأثير الخطوة' : 'Step Effect'}>
            <select style={inputStyle} value={stepEffect} onChange={e => setStepEffect(e.target.value as NewWorkflowStepV2['stepEffect'])}>
              {STEP_EFFECTS.map(o => <option key={o.value} value={o.value}>{locale === 'ar' ? o.labelAr : o.label}</option>)}
            </select>
          </Field>
          <Field label={locale === 'ar' ? 'الاسم (إنجليزي) *' : 'Name (EN) *'}>
            <input style={inputStyle} value={stepNameEn} onChange={e => setStepNameEn(e.target.value)} placeholder={locale === 'ar' ? 'اسم الخطوة بالإنجليزية' : 'Step name in English'} required />
          </Field>
          <Field label={locale === 'ar' ? 'الاسم (عربي)' : 'Name (AR)'}>
            <input style={{ ...inputStyle, direction: 'rtl' }} value={stepNameAr} onChange={e => setStepNameAr(e.target.value)} placeholder="اسم الخطوة بالعربية" />
          </Field>
        </div>

        {/* ── 2. Routing ── */}
        <SectionTitle>{locale === 'ar' ? 'التوجيه' : 'Routing'}</SectionTitle>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={locale === 'ar' ? 'نوع التسلسل الهرمي' : 'Hierarchy Type'}>
            <select style={inputStyle} value={hierarchyType} onChange={e => setHierarchyType(e.target.value as NewWorkflowStepV2['hierarchyType'])}>
              {HIERARCHY_TYPES.map(o => <option key={o.value} value={o.value}>{locale === 'ar' ? o.labelAr : o.label}</option>)}
            </select>
          </Field>

          {/* LINE_MANAGER and POSITION both use a hierarchy level */}
          {(hierarchyType === 'LINE_MANAGER' || hierarchyType === 'POSITION') && (
            <Field label={hierarchyType === 'LINE_MANAGER'
              ? (locale === 'ar' ? 'مستوى التقارير (1 = المدير المباشر)' : 'Reporting Level (1 = direct manager)')
              : (locale === 'ar' ? 'مستوى المنصب (1 = المشرف المباشر)' : 'Position Level (1 = direct supervisor)')}>
              <input
                type="number"
                style={inputStyle}
                min={1} max={10}
                value={hierarchyLevel}
                onChange={e => setHierarchyLevel(Number(e.target.value))}
              />
            </Field>
          )}

          {hierarchyType === 'CUSTOM_GROUP' && (
            <Field label={locale === 'ar' ? 'مجموعة الاعتماد' : 'Approval Group'}>
              <PersonSelect
                value={customGroupId || null}
                options={groupOptions}
                onChange={id => setCustomGroupId(id)}
                placeholder={locale === 'ar' ? 'اختر مجموعة اعتماد…' : 'Select an approval group…'}
                searchPlaceholder={locale === 'ar' ? 'اكتب اسم المجموعة أو رمزها…' : 'Type a group name or code…'}
                emptyText={locale === 'ar' ? 'لا توجد مجموعات اعتماد نشطة. أنشئ واحدة في الإعدادات ← مجموعات الاعتماد.' : 'No active approval groups. Create one in Configuration → Approval Groups.'}
                noMatchText={q => locale === 'ar' ? `لا توجد مجموعات مطابقة لـ “${q}”` : `No groups match “${q}”`}
                required
              />
            </Field>
          )}
        </div>

        {/* ── 3. SLA & Escalation ── */}
        <SectionTitle>{locale === 'ar' ? 'اتفاقية مستوى الخدمة والتصعيد' : 'SLA & Escalation'}</SectionTitle>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={locale === 'ar' ? 'ساعات اتفاقية مستوى الخدمة' : 'SLA Hours'}>
            <input type="number" style={inputStyle} min={1} value={slaHours} onChange={e => setSlaHours(Number(e.target.value))} />
          </Field>
          <Field label={locale === 'ar' ? 'عند تجاوز اتفاقية مستوى الخدمة' : 'On SLA Breach'}>
            <select style={inputStyle} value={onSlaBreach} onChange={e => setOnSlaBreach(e.target.value as NewWorkflowStepV2['onSlaBreach'])}>
              {SLA_BREACH_OPTIONS.map(o => <option key={o.value} value={o.value}>{locale === 'ar' ? o.labelAr : o.label}</option>)}
            </select>
          </Field>
        </div>

        {/* ── 4. Activation Condition ── */}
        <SectionTitle>{locale === 'ar' ? 'شرط التفعيل' : 'Activation Condition'}</SectionTitle>
        <Field label={locale === 'ar' ? 'اسم القاعدة (اختياري)' : 'Rule Name (optional)'}>
          <input
            style={{ ...inputStyle, marginBottom: 10 }}
            value={activationRuleName}
            onChange={e => setActivationRuleName(e.target.value)}
            placeholder="e.g. Leave > 5 days"
          />
        </Field>
        <ConditionBuilder value={activationCondition} onChange={setActivationCondition} />

        {/* ── 5. Options ── */}
        <SectionTitle>{locale === 'ar' ? 'الخيارات' : 'Options'}</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CheckRow label={locale === 'ar' ? 'للعلم فقط (إشعار، لا يتطلب موافقة)' : 'FYI only (notification, no approval required)'} checked={isFyiOnly} onChange={setIsFyiOnly} />
          <CheckRow label={locale === 'ar' ? 'يمكن التفويض' : 'Can delegate'} checked={canDelegate} onChange={setCanDelegate} />
          <CheckRow label={locale === 'ar' ? 'خطوة اختيارية' : 'Optional step'} checked={isOptional} onChange={setIsOptional} />
          <CheckRow label={locale === 'ar' ? 'تخطّي إن سبق أن اعتمدها هذا الشخص' : 'Skip if already approved by this person'} checked={skipIfAlreadyApproved} onChange={setSkipIfAlreadyApproved} />
        </div>

        {error && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 6,
            background: 'var(--error-bg, #fef2f2)', color: 'var(--error, #dc2626)',
            border: '1px solid var(--error-border, #fca5a5)', fontSize: 'var(--text-body)',
          }}>
            {error}
          </div>
        )}
      </form>
    </MdmDrawer>
  )
}
