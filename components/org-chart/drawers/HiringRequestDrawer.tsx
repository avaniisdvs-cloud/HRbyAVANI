'use client'

import { useState, useEffect }  from 'react'
import { X }                     from 'lucide-react'
import { useToast }              from '@/hooks/use-toast'
import { useLocale }             from '@/components/providers/LocaleProvider'
import { createHiringRequest }   from '@/modules/core-hr/org-chart-actions'
import type { OrgFlowNode }      from '@/lib/org-chart/types'

interface HiringRequestDrawerProps {
  positionId: string
  nodes:      OrgFlowNode[]
  onClose:    () => void
}

const INPUT_STYLE: React.CSSProperties = {
  width:        '100%',
  height:       36,
  border:       '1px solid var(--border)',
  borderRadius: 6,
  padding:      '0 10px',
  fontSize:     'var(--text-body)',
  fontFamily:   'var(--font-sans)',
  background:   'var(--bg)',
  color:        'var(--ink-1)',
  boxSizing:    'border-box',
}

const SELECT_STYLE: React.CSSProperties = { ...INPUT_STYLE, cursor: 'pointer' }

const LABEL_STYLE: React.CSSProperties = {
  fontSize:    'var(--text-caption)',
  fontWeight:  600,
  color:       'var(--ink-2)',
  fontFamily:  'var(--font-sans)',
  marginBottom:4,
  display:     'block',
}

const FIELD_STYLE: React.CSSProperties = { display: 'flex', flexDirection: 'column',
marginBottom: 16 }

type RequestType = 'NEW_HIRE' | 'REPLACEMENT' | 'TEMPORARY_STAFF' | 'INTERNAL_TRANSFER'
type Urgency     = 'STANDARD' | 'URGENT' | 'CRITICAL'

export function HiringRequestDrawer({ positionId, nodes, onClose }: HiringRequestDrawerProps) {
  const { toast } = useToast()
  const locale    = useLocale()

  // Find position node data
  const node          = nodes.find(n => n.data.positionId === positionId)
  const positionTitle = node?.data.positionTitleEn ?? 'Position'
  const deptName      = node?.data.deptNameEn      ?? 'Department'
  const deptId        = node?.data.deptId          ?? ''

  const [requestType,   setRequestType]   = useState<RequestType>('NEW_HIRE')
  const [replacementFor,setReplacementFor]= useState('')
  const [requiredByDate,setRequiredByDate]= useState('')
  const [budgetApproved,setBudgetApproved]= useState(false)
  const [budgetAmount,  setBudgetAmount]  = useState('')
  const [justification, setJustification] = useState('')
  const [urgency,       setUrgency]       = useState<Urgency>('STANDARD')
  const [submitting,    setSubmitting]    = useState(false)
  const [fieldErrors,   setFieldErrors]   = useState<Record<string, string>>({})

  // Char counter
  const justLen = justification.length

  // Validate
  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!requestType)                     errors.requestType    = locale === 'ar' ? 'مطلوب' : 'Required'
    if (justLen < 30)                     errors.justification  = locale === 'ar' ? `مطلوب 30 حرفًا على الأقل (${justLen}/30)` : `At least 30 characters required (${justLen}/30)`
    if (requiredByDate) {
      const d = new Date(requiredByDate)
      if (!isNaN(d.getTime()) && d < new Date(new Date().toDateString()))
        errors.requiredByDate = locale === 'ar' ? 'لا يمكن أن يكون التاريخ في الماضي' : 'Date cannot be in the past'
    }
    if (budgetApproved && !budgetAmount)  errors.budgetAmount   = locale === 'ar' ? 'مطلوب عند اعتماد الميزانية' : 'Required when budget is approved'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const result = await createHiringRequest({
        positionId,
        departmentId:   deptId,
        requestType,
        replacementFor: requestType === 'REPLACEMENT' ? replacementFor : undefined,
        requiredByDate: requiredByDate || undefined,
        budgetApproved,
        budgetAmount:   budgetApproved && budgetAmount ? budgetAmount : undefined,
        justification,
        urgency,
      })
      if (result.success) {
        toast({
          title:       locale === 'ar' ? 'تم إرسال طلب التوظيف' : 'Hiring request submitted',
          description: locale === 'ar' ? 'في انتظار الموافقة.' : 'Pending approval.',
        })
        onClose()
      } else {
        toast({
          title:       locale === 'ar' ? 'خطأ' : 'Error',
          description: result.error ?? (locale === 'ar' ? 'تعذر إرسال الطلب.' : 'Failed to submit request.'),
          variant:     'destructive',
        })
      }
    } catch {
      toast({
        title:       locale === 'ar' ? 'خطأ' : 'Error',
        description: locale === 'ar' ? 'تعذر إرسال الطلب. يرجى المحاولة مرة أخرى.' : 'Failed to submit request. Please try again.',
        variant:     'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Trap Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Overlay */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 55 }}
        onClick={onClose}
      />

      {/* Drawer — zIndex 56 keeps it above ARIA panel (40) and org chart topbar (50) */}
      <div style={{
        position:    'fixed',
        top:         0,
        right:       0,
        bottom:      0,
        width:       520,
        background:  'var(--card)',
        borderLeft:  '1px solid var(--border)',
        boxShadow:   '-8px 0 32px rgba(0,0,0,0.12)',
        zIndex:      56,
        display:     'flex',
        flexDirection:'column',
      }}>

        {/* Header */}
        <div style={{
          height:       56,
          display:      'flex',
          alignItems:   'center',
          justifyContent:'space-between',
          padding:      '0 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink:   0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--ink-1)' }}>
            {locale === 'ar' ? 'إنشاء طلب توظيف' : 'Create Hiring Request'}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4 }}
            aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Form wraps body + footer so the submit button is inside the form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* Position (read-only) */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'المنصب' : 'Position'}</label>
            <div style={{ ...INPUT_STYLE, display: 'flex', alignItems: 'center', background: 'var(--surface)', color: 'var(--ink-2)', height: 'auto', padding: '8px 10px', lineHeight: 1.4 }}>
              <div>
                <div style={{ fontWeight: 500 }}>{positionTitle}</div>
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
                marginTop: 1 }}>{deptName}</div>
              </div>
            </div>
          </div>

          {/* Request Type */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'نوع الطلب *' : 'Request Type *'}</label>
            <select
              style={SELECT_STYLE}
              value={requestType}
              onChange={e => setRequestType(e.target.value as RequestType)}
            >
              <option value="NEW_HIRE">{locale === 'ar' ? 'تعيين جديد' : 'New Hire'}</option>
              <option value="REPLACEMENT">{locale === 'ar' ? 'إحلال' : 'Replacement'}</option>
              <option value="TEMPORARY_STAFF">{locale === 'ar' ? 'موظف مؤقت' : 'Temporary Staff'}</option>
              <option value="INTERNAL_TRANSFER">{locale === 'ar' ? 'نقل داخلي' : 'Internal Transfer'}</option>
            </select>
            {fieldErrors.requestType && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--error)',
            marginTop: 3 }}>{fieldErrors.requestType}</span>}
          </div>

          {/* Replacement For — only when REPLACEMENT */}
          {requestType === 'REPLACEMENT' && (
            <div style={FIELD_STYLE}>
              <label style={LABEL_STYLE}>{locale === 'ar' ? 'بديل عن' : 'Replacement For'}</label>
              <input
                type="text"
                style={INPUT_STYLE}
                placeholder={locale === 'ar' ? 'اسم الموظف الذي سيُستبدل' : 'Name of employee being replaced'}
                value={replacementFor}
                onChange={e => setReplacementFor(e.target.value)}
              />
            </div>
          )}

          {/* Required By Date */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'مطلوب بحلول تاريخ' : 'Required By Date'}</label>
            <input
              type="date"
              style={INPUT_STYLE}
              value={requiredByDate}
              onChange={e => setRequiredByDate(e.target.value)}
            />
            {fieldErrors.requiredByDate && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--error)',
            marginTop: 3 }}>{fieldErrors.requiredByDate}</span>}
          </div>

          {/* Budget Approved toggle */}
          <div style={{ ...FIELD_STYLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ ...LABEL_STYLE, marginBottom: 0 }}>{locale === 'ar' ? 'الميزانية معتمدة' : 'Budget Approved'}</label>
            <button
              type="button"
              onClick={() => setBudgetApproved(v => !v)}
              style={{
                width:        40,
                height:       22,
                borderRadius: 11,
                border:       'none',
                background:   budgetApproved ? 'var(--accent)' : 'var(--border)',
                cursor:       'pointer',
                position:     'relative',
                transition:   'background 0.2s',
                flexShrink:   0,
              }}
              aria-pressed={budgetApproved}
            >
              <span style={{
                position:   'absolute',
                top:        2,
                left:       budgetApproved ? 20 : 2,
                width:      18,
                height:     18,
                borderRadius:'50%',
                background: 'white',
                boxShadow:  '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>

          {/* Budget Amount — only when budget approved */}
          {budgetApproved && (
            <div style={FIELD_STYLE}>
              <label style={LABEL_STYLE}>{locale === 'ar' ? 'الميزانية الشهرية (درهم) *' : 'Monthly Budget (AED) *'}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                style={INPUT_STYLE}
                placeholder="e.g. 25000.00"
                value={budgetAmount}
                onChange={e => setBudgetAmount(e.target.value)}
              />
              {fieldErrors.budgetAmount && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--error)',
              marginTop: 3 }}>{fieldErrors.budgetAmount}</span>}
            </div>
          )}

          {/* Justification */}
          <div style={FIELD_STYLE}>
            <label style={{ ...LABEL_STYLE, display: 'flex', justifyContent: 'space-between' }}>
              <span>{locale === 'ar' ? 'المبرر *' : 'Justification *'}</span>
              <span style={{ fontWeight: 400, color: justLen < 30 ? 'var(--error)' : 'var(--ink-3)' }}>
                {justLen}/30 {locale === 'ar' ? 'كحد أدنى' : 'min'}
              </span>
            </label>
            <textarea
              style={{ ...INPUT_STYLE, height: 100, padding: '8px 10px', resize: 'vertical', lineHeight: 1.5 }}
              placeholder={locale === 'ar' ? 'اذكر المبرر المهني (30 حرفًا على الأقل)…' : 'Provide business justification (minimum 30 characters)…'}
              value={justification}
              onChange={e => setJustification(e.target.value)}
            />
            {fieldErrors.justification && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--error)',
            marginTop: 3 }}>{fieldErrors.justification}</span>}
          </div>

          {/* Urgency */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'الأولوية' : 'Urgency'}</label>
            <select
              style={SELECT_STYLE}
              value={urgency}
              onChange={e => setUrgency(e.target.value as Urgency)}
            >
              <option value="STANDARD">{locale === 'ar' ? 'عادية' : 'Standard'}</option>
              <option value="URGENT">{locale === 'ar' ? 'عاجلة' : 'Urgent'}</option>
              <option value="CRITICAL">{locale === 'ar' ? 'حرجة' : 'Critical'}</option>
            </select>
          </div>

        </div>{/* end scrollable body */}

        {/* Footer — inside <form> so type="submit" works */}
        <div style={{
          height:        64,
          display:       'flex',
          alignItems:    'center',
          justifyContent:'flex-end',
          gap:           10,
          padding:       '0 20px',
          borderTop:     '1px solid var(--border)',
          flexShrink:    0,
          background:    'var(--card)',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height:       36,
              padding:      '0 16px',
              borderRadius: 6,
              border:       '1px solid var(--border)',
              background:   'transparent',
              color:        'var(--ink-2)',
              fontSize:     'var(--text-body)',
              fontFamily:   'var(--font-sans)',
              cursor:       'pointer',
            }}
          >
            {locale === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              height:       36,
              padding:      '0 20px',
              borderRadius: 6,
              border:       'none',
              background:   submitting ? 'var(--accent-200)' : 'var(--accent)',
              color:        'white',
              fontSize:     'var(--text-body)',
              fontFamily:   'var(--font-sans)',
              fontWeight:   600,
              cursor:       submitting ? 'not-allowed' : 'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          6,
            }}
          >
            {submitting && (
              <span style={{
                width:         14,
                height:        14,
                borderTopWidth: "2px",
                borderTopStyle: "solid",
                borderRightWidth: "2px",
                borderRightStyle: "solid",
                borderRightColor: "rgba(255,255,255,0.4)",
                borderBottomWidth: "2px",
                borderBottomStyle: "solid",
                borderBottomColor: "rgba(255,255,255,0.4)",
                borderLeftWidth: "2px",
                borderLeftStyle: "solid",
                borderLeftColor: "rgba(255,255,255,0.4)",
                borderTopColor: 'white',
                borderRadius:  '50%',
                display:       'inline-block',
                animation:     'spin 0.7s linear infinite',
              }} />
            )}
            {submitting ? (locale === 'ar' ? 'جارٍ الإرسال…' : 'Submitting…') : (locale === 'ar' ? 'إرسال الطلب' : 'Submit Request')}
          </button>
        </div>

        </form>{/* end form */}

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </>
  )
}
