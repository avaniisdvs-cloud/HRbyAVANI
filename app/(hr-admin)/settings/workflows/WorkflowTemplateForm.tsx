'use client'

import { useState, useTransition }    from 'react'
import { useRouter }                  from 'next/navigation'
import { ChevronUp, ChevronDown, X, Plus, Save, ArrowLeft } from 'lucide-react'
import {
  createWorkflowTemplate,
  updateWorkflowTemplate,
} from '@/modules/config'
import { type Locale } from '@/lib/i18n'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SaveWorkflowTemplateInput {
  legalEntityId?:  string | null
  workflowCode:    string
  workflowNameEn:  string
  workflowNameAr:  string
  triggerEvent:
    | 'HIRE' | 'BACKDATED_HIRE' | 'TRANSFER' | 'LEAVE_REQUEST' | 'LEAVE'
    | 'SALARY_REVISION' | 'TERMINATION' | 'DEPENDENT_ADD'
    | 'DOCUMENT_VERIFY' | 'OVERTIME' | 'EXIT_CLEARANCE'
  approvalMode:    'SEQUENTIAL' | 'PARALLEL'
  slaHours:        number
  escalationHours: number
  isActive:        boolean
  stages: Array<{
    stageOrder:         number
    stageNameEn:        string
    stageNameAr:        string
    approverRoleCode:   string
    stageSlaHours:      number
    escalationRoleCode: string | null
    canDelegate:        boolean
    isOptional:         boolean
    actionType:         'APPROVE_REJECT' | 'ACKNOWLEDGE' | 'INFO_ONLY'
  }>
}

interface StageDraft {
  stageOrder:         number
  stageNameEn:        string
  stageNameAr:        string
  approverRoleCode:   string
  stageSlaHours:      number
  escalationRoleCode: string | null
  canDelegate:        boolean
  isOptional:         boolean
  actionType:         'APPROVE_REJECT' | 'ACKNOWLEDGE' | 'INFO_ONLY'
}

interface Props {
  legalEntityId: string
  locale?: Locale
  initial?: {
    id:              string
    workflowCode:    string
    workflowNameEn:  string
    workflowNameAr:  string
    triggerEvent:    string
    approvalMode:    'SEQUENTIAL' | 'PARALLEL'
    slaHours:        number
    escalationHours: number
    isActive:        boolean
    stages:          StageDraft[]
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TRIGGER_EVENTS: { value: string; labelEn: string; labelAr: string }[] = [
  { value: 'LEAVE_REQUEST',   labelEn: 'Leave Request',        labelAr: 'طلب إجازة' },
  { value: 'LEAVE',           labelEn: 'Leave',                labelAr: 'إجازة' },
  { value: 'HIRE',            labelEn: 'New Hire',             labelAr: 'تعيين جديد' },
  { value: 'BACKDATED_HIRE',  labelEn: 'Backdated Hire',       labelAr: 'تعيين بأثر رجعي' },
  { value: 'TRANSFER',        labelEn: 'Transfer',             labelAr: 'نقل' },
  { value: 'TERMINATION',     labelEn: 'Termination',          labelAr: 'إنهاء خدمة' },
  { value: 'SALARY_REVISION', labelEn: 'Salary Revision',      labelAr: 'مراجعة الراتب' },
  { value: 'OVERTIME',        labelEn: 'Overtime',             labelAr: 'عمل إضافي' },
  { value: 'DEPENDENT_ADD',   labelEn: 'Add Dependent',        labelAr: 'إضافة تابع' },
  { value: 'DOCUMENT_VERIFY', labelEn: 'Document Verification',labelAr: 'التحقق من وثيقة' },
  { value: 'EXIT_CLEARANCE',  labelEn: 'Exit Clearance',       labelAr: 'مخالصة' },
]

const APPROVER_ROLES = [
  { code: 'LINE_MANAGER', en: 'Line Manager',  ar: 'المدير المباشر',        rank: 1 },
  { code: 'HOD',          en: 'Head of Dept.', ar: 'رئيس القسم',            rank: 2 },
  { code: 'HR_ADMIN',     en: 'HR Admin',      ar: 'مسؤول الموارد البشرية', rank: 3 },
  { code: 'HR_DIRECTOR',  en: 'HR Director',   ar: 'مدير الموارد البشرية',  rank: 4 },
  { code: 'CEO',          en: 'CEO',           ar: 'الرئيس التنفيذي',       rank: 5 },
] as const

const ACTION_TYPES: { value: string; labelEn: string; labelAr: string }[] = [
  { value: 'APPROVE_REJECT', labelEn: 'Approve / Reject',      labelAr: 'موافقة / رفض' },
  { value: 'ACKNOWLEDGE',    labelEn: 'Acknowledge only',      labelAr: 'إقرار فقط' },
  { value: 'INFO_ONLY',      labelEn: 'Info only (no action)', labelAr: 'للعلم فقط (بدون إجراء)' },
]

// ── Shared styles ──────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize:      'var(--text-caption)',
  fontWeight:    700,
  textTransform: 'uppercase',
  color:         'var(--ink-3)',
  letterSpacing: '0.6px',
  display:       'block',
  marginBottom:  5,
}

const inputStyle: React.CSSProperties = {
  border:      '1.5px solid var(--border)',
  borderRadius: 8,
  padding:     '9px 12px',
  fontSize:    'var(--text-body)',
  background:  'var(--card)',
  color:       'var(--ink-1)',
  outline:     'none',
  width:       '100%',
  boxSizing:   'border-box',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const blankStage = (order: number): StageDraft => ({
  stageOrder:         order,
  stageNameEn:        '',
  stageNameAr:        '',
  approverRoleCode:   'LINE_MANAGER',
  stageSlaHours:      24,
  escalationRoleCode: null,
  canDelegate:        true,
  isOptional:         false,
  actionType:         'APPROVE_REJECT',
})

// ── Component ──────────────────────────────────────────────────────────────────

export function WorkflowTemplateForm({ legalEntityId, locale = 'en', initial }: Props) {
  const router                       = useRouter()
  const [pending, startTransition]   = useTransition()
  const [error,   setError]          = useState<string | null>(null)

  // Header fields
  const [code,         setCode]         = useState(initial?.workflowCode    ?? '')
  const [nameEn,       setNameEn]       = useState(initial?.workflowNameEn  ?? '')
  const [nameAr,       setNameAr]       = useState(initial?.workflowNameAr  ?? '')
  const [triggerEvent, setTriggerEvent] = useState(initial?.triggerEvent    ?? 'LEAVE_REQUEST')
  const [approvalMode, setApprovalMode] = useState<'SEQUENTIAL' | 'PARALLEL'>(initial?.approvalMode ?? 'SEQUENTIAL')
  const [slaHours,     setSlaHours]     = useState(initial?.slaHours        ?? 48)
  const [escHours,     setEscHours]     = useState(initial?.escalationHours ?? 72)
  const [isActive,     setIsActive]     = useState(initial?.isActive        ?? true)

  // Stages
  const [stages, setStages] = useState<StageDraft[]>(
    initial?.stages?.length
      ? initial.stages.map(s => ({
          ...s,
          canDelegate: (s as any).canDelegate ?? true,
          isOptional:  (s as any).isOptional  ?? false,
          actionType:  (s as any).actionType  ?? 'APPROVE_REJECT',
        }))
      : [blankStage(1)],
  )

  // ── Stage helpers ────────────────────────────────────────────────────────────

  const addStage = () => {
    if (stages.length >= 10) return
    setStages(prev => [...prev, blankStage(prev.length + 1)])
  }

  const removeStage = (idx: number) => {
    setStages(prev =>
      prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stageOrder: i + 1 })),
    )
  }

  const setStageField = (idx: number, patch: Partial<StageDraft>) => {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }

  /** Move a stage up or down in the list, re-numbering stageOrder throughout */
  const moveStage = (idx: number, dir: 'up' | 'down') => {
    setStages(prev => {
      const next      = [...prev]
      const swapIdx   = dir === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      return next.map((s, i) => ({ ...s, stageOrder: i + 1 }))
    })
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  const onSave = () => {
    setError(null)
    if (!code.trim())   return setError(locale === 'ar' ? 'رمز سير العمل مطلوب' : 'Workflow code is required')
    if (!nameEn.trim()) return setError(locale === 'ar' ? 'الاسم (إنجليزي) مطلوب' : 'Name (EN) is required')
    if (!nameAr.trim()) return setError(locale === 'ar' ? 'الاسم (عربي) مطلوب' : 'Name (AR) is required')
    for (const s of stages) {
      if (!s.stageNameEn.trim() || !s.stageNameAr.trim()) {
        return setError(locale === 'ar' ? `المرحلة ${s.stageOrder}: الاسم ثنائي اللغة مطلوب` : `Stage ${s.stageOrder}: bilingual name required`)
      }
    }

    const input: SaveWorkflowTemplateInput = {
      legalEntityId,
      workflowCode:    code.trim(),
      workflowNameEn:  nameEn.trim(),
      workflowNameAr:  nameAr.trim(),
      triggerEvent:    triggerEvent as SaveWorkflowTemplateInput['triggerEvent'],
      approvalMode,
      slaHours,
      escalationHours: escHours,
      isActive,
      stages: stages.map(s => ({
        stageOrder:         s.stageOrder,
        stageNameEn:        s.stageNameEn.trim(),
        stageNameAr:        s.stageNameAr.trim(),
        approverRoleCode:   s.approverRoleCode,
        stageSlaHours:      s.stageSlaHours,
        escalationRoleCode: s.escalationRoleCode,
        canDelegate:        s.canDelegate,
        isOptional:         s.isOptional,
        actionType:         s.actionType,
      })),
    }

    startTransition(async () => {
      try {
        if (initial) {
          await updateWorkflowTemplate(initial.id, input)
        } else {
          await createWorkflowTemplate(input)
        }
        router.push('/settings/workflows')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : (locale === 'ar' ? 'تعذّر الحفظ. يرجى المحاولة مرة أخرى أو الاتصال بدعم تقنية المعلومات.' : 'Unable to save. Please try again or contact IT support.'))
      }
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Section 1: Header fields ────────────────────────────────────── */}
      <div style={{
        border:       '1px solid var(--border)',
        borderRadius: 12,
        background:   'var(--card)',
        overflow:     'hidden',
      }}>
        <div style={{
          padding:      '12px 20px',
          borderBottom: '1px solid var(--border)',
          background:   'var(--surface)',
        }}>
          <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-2)' }}>
            {locale === 'ar' ? 'تفاصيل القالب' : 'Template details'}
          </span>
        </div>
        <div style={{ padding: 20 }}>
          <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Code */}
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'رمز سير العمل' : 'Workflow code'}</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="WF-LEAVE-STD"
                disabled={!!initial}
                style={{
                  ...inputStyle,
                  fontFamily:  'var(--font-mono)',
                  fontWeight:  700,
                  letterSpacing: '0.05em',
                  background:  initial ? 'var(--surface)' : 'var(--card)',
                  color:       initial ? 'var(--ink-3)'   : 'var(--ink-1)',
                  cursor:      initial ? 'not-allowed'    : 'text',
                }}
              />
              {initial && (
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
                marginTop: 4, display: 'block' }}>
                  {locale === 'ar' ? 'الرمز غير قابل للتغيير بعد الإنشاء' : 'Code is immutable after creation'}
                </span>
              )}
            </div>

            {/* Trigger event */}
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'المحفّز' : 'Trigger event'}</label>
              <select
                value={triggerEvent}
                onChange={e => setTriggerEvent(e.target.value)}
                style={selectStyle}
              >
                {TRIGGER_EVENTS.map(t => (
                  <option key={t.value} value={t.value}>
                    {locale === 'ar' ? t.labelAr : t.labelEn}
                  </option>
                ))}
              </select>
            </div>

            {/* Name EN */}
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (EN)'}</label>
              <input
                type="text"
                value={nameEn}
                onChange={e => setNameEn(e.target.value)}
                placeholder="Leave Request — Standard Approval"
                style={inputStyle}
              />
            </div>

            {/* Name AR */}
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'الاسم (عربي)' : 'Name (AR)'}</label>
              <input
                type="text"
                dir="rtl"
                value={nameAr}
                onChange={e => setNameAr(e.target.value)}
                placeholder="طلب الإجازة — موافقة قياسية"
                style={inputStyle}
              />
            </div>

            {/* Approval mode */}
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'نمط الموافقة' : 'Approval mode'}</label>
              <select
                value={approvalMode}
                onChange={e => setApprovalMode(e.target.value as 'SEQUENTIAL' | 'PARALLEL')}
                style={selectStyle}
              >
                <option value="SEQUENTIAL">{locale === 'ar' ? 'متسلسل' : 'Sequential'}</option>
                <option value="PARALLEL">{locale === 'ar' ? 'متوازٍ' : 'Parallel'}</option>
              </select>
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
              marginTop: 4, display: 'block' }}>
                {locale === 'ar' ? 'متسلسل: تنتظر كل مرحلة المرحلة السابقة' : 'Sequential: each stage waits for the previous'}
              </span>
            </div>

            {/* SLA + Escalation side by side */}
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'مدة SLA (ساعات)' : 'Overall SLA (hrs)'}</label>
                <input
                  type="number" min={1} max={2160}
                  value={slaHours}
                  onChange={e => setSlaHours(Number(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{locale === 'ar' ? 'التصعيد بعد (ساعات)' : 'Escalate after (hrs)'}</label>
                <input
                  type="number" min={1} max={2160}
                  value={escHours}
                  onChange={e => setEscHours(Number(e.target.value) || 0)}
                  style={inputStyle}
                />
              </div>
            </div>

          </div>

          {/* Active toggle */}
          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--text-body)' }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 600, color: 'var(--ink-1)' }}>{locale === 'ar' ? 'نشط' : 'Active'}</span>
              <span style={{ color: 'var(--ink-4)' }}>{locale === 'ar' ? '— لا تُفعَّل القوالب غير النشطة بواسطة المعاملات الجديدة' : '— inactive templates are not triggered by new transactions'}</span>
            </label>
          </div>
        </div>
      </div>

      {/* ── Section 2: Approval stages ──────────────────────────────────── */}
      <div>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 500, color: 'var(--ink-1)', margin: 0 }}>
              {locale === 'ar' ? 'مراحل الموافقة' : 'Approval stages'}
            </h3>
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', margin: '3px 0 0' }}>
              {locale === 'ar' ? `${stages.length} من 10 مراحل · استخدم ↑ ↓ لإعادة الترتيب` : `${stages.length} of 10 stages · Use ↑ ↓ to reorder`}
            </p>
          </div>
          <button
            type="button"
            onClick={addStage}
            disabled={stages.length >= 10 || pending}
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          6,
              padding:      '8px 14px',
              borderRadius: 8,
              border:       '1.5px solid var(--border)',
              background:   stages.length >= 10 ? 'var(--surface)' : 'var(--card)',
              color:        stages.length >= 10 ? 'var(--ink-4)'   : 'var(--ink-1)',
              fontSize:     'var(--text-body)',
              fontWeight:   600,
              cursor:       stages.length >= 10 || pending ? 'not-allowed' : 'pointer',
            }}
          >
            <Plus size={14} strokeWidth={2} />
            {locale === 'ar' ? 'إضافة مرحلة' : 'Add stage'}
          </button>
        </div>

        {/* Stage cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {stages.map((s, i) => {
            const approverRank = APPROVER_ROLES.find(x => x.code === s.approverRoleCode)?.rank ?? 0
            const isFirst      = i === 0
            const isLast       = i === stages.length - 1

            return (
              <div key={i} style={{
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
                borderLeftColor: "var(--accent)",
                borderRadius: 10,
                background:   'var(--card)',
                overflow:     'hidden',
              }}>
                {/* Stage card header */}
                <div style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'space-between',
                  padding:        '10px 14px',
                  borderBottom:   '1px solid var(--border)',
                  background:     'color-mix(in srgb, var(--accent) 4%, transparent)',
                }}>
                  {/* Stage number + reorder buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

                    {/* Stage number badge */}
                    <span style={{
                      display:        'inline-flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      width:          28,
                      height:         28,
                      borderRadius:   '50%',
                      background:     'var(--accent)',
                      color:          "var(--on-accent)",
                      fontSize:       'var(--text-caption)',
                      fontWeight:     700,
                      flexShrink:     0,
                    }}>
                      {s.stageOrder}
                    </span>

                    <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
                      {locale === 'ar' ? `المرحلة ${s.stageOrder}` : `Stage ${s.stageOrder}`}
                    </span>

                    {/* ── Up / Down reorder button group ── */}
                    {stages.length > 1 && (
                      <div style={{
                        display:      'inline-flex',
                        border:       '1.5px solid var(--border)',
                        borderRadius: 8,
                        overflow:     'hidden',
                        background:   'var(--card)',
                      }}>
                        <button
                          type="button"
                          onClick={() => moveStage(i, 'up')}
                          disabled={isFirst || pending}
                          title={locale === 'ar' ? 'تحريك هذه المرحلة للأعلى' : 'Move this stage up'}
                          style={{
                            display:        'flex',
                            alignItems:     'center',
                            justifyContent: 'center',
                            gap:            4,
                            padding:        '5px 10px',
                            borderTopWidth: "0px",
                            borderTopStyle: "none",
                            borderTopColor: "currentColor",
                            borderBottomWidth: "0px",
                            borderBottomStyle: "none",
                            borderBottomColor: "currentColor",
                            borderLeftWidth: "0px",
                            borderLeftStyle: "none",
                            borderLeftColor: "currentColor",
                            borderRightWidth: "1px",
                            borderRightStyle: "solid",
                            borderRightColor: "var(--border)",
                            background:     isFirst ? 'var(--surface)' : 'var(--card)',
                            color:          isFirst ? 'var(--ink-4)'   : 'var(--ink-1)',
                            fontSize:       'var(--text-caption)',
                            fontWeight:     600,
                            cursor:         isFirst || pending ? 'not-allowed' : 'pointer',
                            opacity:        isFirst ? 0.45 : 1,
                          }}
                          onMouseEnter={e => { if (!isFirst) e.currentTarget.style.background = 'var(--surface)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = isFirst ? 'var(--surface)' : 'var(--card)' }}
                        >
                          <ChevronUp size={14} strokeWidth={2.5} />
                          {locale === 'ar' ? 'للأعلى' : 'Move Up'}
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStage(i, 'down')}
                          disabled={isLast || pending}
                          title={locale === 'ar' ? 'تحريك هذه المرحلة للأسفل' : 'Move this stage down'}
                          style={{
                            display:        'flex',
                            alignItems:     'center',
                            justifyContent: 'center',
                            gap:            4,
                            padding:        '5px 10px',
                            border:         'none',
                            background:     isLast ? 'var(--surface)' : 'var(--card)',
                            color:          isLast ? 'var(--ink-4)'   : 'var(--ink-1)',
                            fontSize:       'var(--text-caption)',
                            fontWeight:     600,
                            cursor:         isLast || pending ? 'not-allowed' : 'pointer',
                            opacity:        isLast ? 0.45 : 1,
                          }}
                          onMouseEnter={e => { if (!isLast) e.currentTarget.style.background = 'var(--surface)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = isLast ? 'var(--surface)' : 'var(--card)' }}
                        >
                          <ChevronDown size={14} strokeWidth={2.5} />
                          {locale === 'ar' ? 'للأسفل' : 'Move Down'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right side: toggles + remove */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-caption)', color: 'var(--ink-3)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={s.canDelegate}
                        onChange={e => setStageField(i, { canDelegate: e.target.checked })}
                        disabled={pending}
                        style={{ width: 13, height: 13, accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                      {locale === 'ar' ? 'يمكن التفويض' : 'Can delegate'}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-caption)', color: 'var(--ink-3)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={s.isOptional}
                        onChange={e => setStageField(i, { isOptional: e.target.checked })}
                        disabled={pending}
                        style={{ width: 13, height: 13, accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                      {locale === 'ar' ? 'اختياري' : 'Optional'}
                    </label>
                    {stages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStage(i)}
                        disabled={pending}
                        title={locale === 'ar' ? 'إزالة المرحلة' : 'Remove stage'}
                        style={{
                          display:        'flex',
                          alignItems:     'center',
                          justifyContent: 'center',
                          width:          26,
                          height:         26,
                          borderRadius:   6,
                          border:         '1px solid color-mix(in srgb, var(--destructive, #ef4444) 30%, transparent)',
                          background:     'color-mix(in srgb, var(--destructive, #ef4444) 8%, transparent)',
                          color:          'var(--destructive, #dc2626)',
                          cursor:         pending ? 'not-allowed' : 'pointer',
                          padding:        0,
                        }}
                      >
                        <X size={13} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Stage fields */}
                <div data-responsive-grid="true" style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                  {/* Stage name EN */}
                  <div>
                    <label style={labelStyle}>{locale === 'ar' ? 'اسم المرحلة (إنجليزي)' : 'Stage name (EN)'}</label>
                    <input
                      type="text"
                      value={s.stageNameEn}
                      onChange={e => setStageField(i, { stageNameEn: e.target.value })}
                      placeholder="Manager review"
                      style={inputStyle}
                    />
                  </div>

                  {/* Stage name AR */}
                  <div>
                    <label style={labelStyle}>{locale === 'ar' ? 'اسم المرحلة (عربي)' : 'Stage name (AR)'}</label>
                    <input
                      type="text"
                      dir="rtl"
                      value={s.stageNameAr}
                      onChange={e => setStageField(i, { stageNameAr: e.target.value })}
                      placeholder="مراجعة المدير"
                      style={inputStyle}
                    />
                  </div>

                  {/* Approver role */}
                  <div>
                    <label style={labelStyle}>{locale === 'ar' ? 'دور المعتمد' : 'Approver role'}</label>
                    <select
                      value={s.approverRoleCode}
                      onChange={e => {
                        const newRank = APPROVER_ROLES.find(x => x.code === e.target.value)?.rank ?? 0
                        const escRank = APPROVER_ROLES.find(x => x.code === s.escalationRoleCode)?.rank ?? 0
                        setStageField(i, {
                          approverRoleCode:   e.target.value,
                          escalationRoleCode: escRank > newRank ? s.escalationRoleCode : null,
                        })
                      }}
                      style={selectStyle}
                    >
                      {APPROVER_ROLES.map(r => (
                        <option key={r.code} value={r.code}>{locale === 'ar' ? r.ar : r.en}</option>
                      ))}
                    </select>
                  </div>

                  {/* Action type */}
                  <div>
                    <label style={labelStyle}>{locale === 'ar' ? 'نوع الإجراء' : 'Action type'}</label>
                    <select
                      value={s.actionType}
                      onChange={e => setStageField(i, { actionType: e.target.value as StageDraft['actionType'] })}
                      style={selectStyle}
                    >
                      {ACTION_TYPES.map(a => (
                        <option key={a.value} value={a.value}>{locale === 'ar' ? a.labelAr : a.labelEn}</option>
                      ))}
                    </select>
                  </div>

                  {/* Stage SLA */}
                  <div>
                    <label style={labelStyle}>{locale === 'ar' ? 'مدة المرحلة (ساعات)' : 'Stage SLA (hrs)'}</label>
                    <input
                      type="number" min={1} max={720}
                      value={s.stageSlaHours}
                      onChange={e => setStageField(i, { stageSlaHours: Number(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </div>

                  {/* Escalation role */}
                  <div>
                    <label style={labelStyle}>
                      {locale === 'ar' ? 'دور التصعيد' : 'Escalation role'}
                      <span style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none', color: 'var(--ink-4)', letterSpacing: 0 }}>
                        {locale === 'ar' ? '(يجب أن يفوق المعتمد رتبةً)' : '(must outrank approver)'}
                      </span>
                    </label>
                    <select
                      value={s.escalationRoleCode ?? '__none__'}
                      onChange={e => setStageField(i, { escalationRoleCode: e.target.value === '__none__' ? null : e.target.value })}
                      style={selectStyle}
                    >
                      <option value="__none__">{locale === 'ar' ? '— بدون —' : '— None —'}</option>
                      {APPROVER_ROLES
                        .filter(r => r.rank > approverRank)
                        .map(r => (
                          <option key={r.code} value={r.code}>{locale === 'ar' ? r.ar : r.en}</option>
                        ))}
                    </select>
                  </div>

                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          8,
          padding:      '10px 14px',
          background:   'color-mix(in srgb, var(--destructive, #ef4444) 10%, transparent)',
          border:       '1px solid color-mix(in srgb, var(--destructive, #ef4444) 25%, transparent)',
          borderRadius: 8,
          fontSize:     'var(--text-body)',
          color:        'var(--destructive, #dc2626)',
        }}>
          {error}
        </div>
      )}

      {/* ── Footer actions ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          7,
            padding:      '10px 22px',
            borderRadius: 8,
            border:       'none',
            background:   pending ? 'var(--surface)' : 'var(--accent)',
            color:        pending ? 'var(--ink-4)'   : '#fff',
            fontSize:     'var(--text-body)',
            fontWeight:   600,
            cursor:       pending ? 'not-allowed' : 'pointer',
            transition:   'background 0.15s',
          }}
        >
          <Save size={15} strokeWidth={2} />
          {pending
            ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…')
            : initial
              ? (locale === 'ar' ? 'حفظ التغييرات' : 'Save changes')
              : (locale === 'ar' ? 'إنشاء القالب' : 'Create template')}
        </button>

        <button
          type="button"
          onClick={() => router.push('/settings/workflows')}
          disabled={pending}
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          7,
            padding:      '10px 18px',
            borderRadius: 8,
            border:       '1.5px solid var(--border)',
            background:   'var(--card)',
            color:        'var(--ink-2)',
            fontSize:     'var(--text-body)',
            fontWeight:   500,
            cursor:       pending ? 'not-allowed' : 'pointer',
          }}
        >
          <ArrowLeft size={14} />
          {locale === 'ar' ? 'إلغاء' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
