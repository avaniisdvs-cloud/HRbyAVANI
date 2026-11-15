'use client'

import { useState, useEffect, useCallback } from 'react'
import { X }                                  from 'lucide-react'
import { useToast }                           from '@/hooks/use-toast'
import { useLocale }                          from '@/components/providers/LocaleProvider'
import {
  createTransferRequest,
  getVacantPositionsByDept,
} from '@/modules/core-hr/org-chart-actions'
import type { OrgNodeData }                   from '@/lib/org-chart/types'

interface TransferRequestDrawerProps {
  nodeId:             string
  nodeData:           OrgNodeData
  departments:        Array<{ id: string; nameEn: string }>
  initialRequestType?: 'TRANSFER' | 'PROMOTION'
  onClose:            () => void
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

type RequestType = 'TRANSFER' | 'PROMOTION'
type Reason      = 'CAREER_GROWTH' | 'ORG_NEED' | 'PERFORMANCE' | 'PERSONAL' | 'OTHER'

// Minimum effective date: today + 14 days
function minEffectiveDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

export function TransferRequestDrawer({ nodeId, nodeData, departments, initialRequestType = 'TRANSFER', onClose }: TransferRequestDrawerProps) {
  const { toast } = useToast()
  const locale    = useLocale()

  const [requestType,      setRequestType]      = useState<RequestType>(initialRequestType)
  const [targetDeptId,     setTargetDeptId]      = useState('')
  const [targetPositionId, setTargetPositionId]  = useState('')
  const [vacantPositions,  setVacantPositions]   = useState<Array<{ id: string; titleEn: string }>>([])
  const [loadingPositions, setLoadingPositions]  = useState(false)
  const [effectiveDate,    setEffectiveDate]      = useState(minEffectiveDate())
  const [reason,           setReason]            = useState<Reason>('CAREER_GROWTH')
  const [notes,            setNotes]             = useState('')
  const [submitting,       setSubmitting]        = useState(false)
  const [fieldErrors,      setFieldErrors]       = useState<Record<string, string>>({})

  // Fetch vacant positions when target dept changes
  const fetchPositions = useCallback(async (deptId: string) => {
    if (!deptId) { setVacantPositions([]); return }
    setLoadingPositions(true)
    try {
      const result = await getVacantPositionsByDept(deptId)
      if (result.success) setVacantPositions(result.data ?? [])
    } finally {
      setLoadingPositions(false)
    }
  }, [])

  useEffect(() => {
    setTargetPositionId('')
    void fetchPositions(targetDeptId)
  }, [targetDeptId, fetchPositions])

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!targetDeptId)     errors.targetDeptId    = locale === 'ar' ? 'مطلوب' : 'Required'
    if (!effectiveDate)    errors.effectiveDate   = locale === 'ar' ? 'مطلوب' : 'Required'
    else {
      const d = new Date(effectiveDate)
      const min = new Date(minEffectiveDate())
      if (d < min) errors.effectiveDate = locale === 'ar' ? 'يجب أن يكون بعد 14 يومًا على الأقل من اليوم' : 'Must be at least 14 days from today'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const result = await createTransferRequest({
        nodeId,
        requestType,
        targetDepartmentId:  targetDeptId,
        targetPositionId:    targetPositionId || undefined,
        effectiveDate,
        reason,
        notes:               notes || undefined,
      })
      if (result.success) {
        toast({
          title:       locale === 'ar' ? 'تم إرسال طلب النقل' : 'Transfer request submitted',
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 55 }} onClick={onClose} />
      <div style={{
        position:    'fixed',
        top:         0,
        right:       0,
        bottom:      0,
        width:       480,
        background:  'var(--card)',
        borderLeft:  '1px solid var(--border)',
        boxShadow:   '-8px 0 32px rgba(0,0,0,0.12)',
        zIndex:      56,
        display:     'flex',
        flexDirection:'column',
      }}>

        {/* Header */}
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--ink-1)' }}>
            {requestType === 'PROMOTION'
              ? (locale === 'ar' ? 'طلب ترقية' : 'Request Promotion')
              : (locale === 'ar' ? 'طلب نقل' : 'Request Transfer')}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4 }} aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Form wraps body + footer so type="submit" works */}
        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* Employee (read-only) */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'الموظف' : 'Employee'}</label>
            <div style={{ ...INPUT_STYLE, display: 'flex', alignItems: 'center', background: 'var(--surface)', color: 'var(--ink-2)' }}>
              {nodeData.fullNameEn ?? '—'}
              {nodeData.jobTitleEn && <span style={{ marginLeft: 8, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>· {nodeData.jobTitleEn}</span>}
            </div>
          </div>

          {/* Current Position (read-only) */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'المنصب الحالي' : 'Current Position'}</label>
            <div style={{ ...INPUT_STYLE, display: 'flex', alignItems: 'center', background: 'var(--surface)', color: 'var(--ink-2)' }}>
              {nodeData.positionTitleEn}
            </div>
          </div>

          {/* Request Type */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'نوع الطلب' : 'Request Type'}</label>
            <select style={{ ...INPUT_STYLE, cursor: 'pointer' }} value={requestType} onChange={e => setRequestType(e.target.value as RequestType)}>
              <option value="TRANSFER">{locale === 'ar' ? 'نقل' : 'Transfer'}</option>
              <option value="PROMOTION">{locale === 'ar' ? 'ترقية' : 'Promotion'}</option>
            </select>
          </div>

          {/* Target Department */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'القسم المستهدف *' : 'Target Department *'}</label>
            <select style={{ ...INPUT_STYLE, cursor: 'pointer' }} value={targetDeptId} onChange={e => setTargetDeptId(e.target.value)}>
              <option value="">{locale === 'ar' ? '— اختر القسم —' : '— Select department —'}</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.nameEn}</option>
              ))}
            </select>
            {fieldErrors.targetDeptId && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--error)',
            marginTop: 3 }}>{fieldErrors.targetDeptId}</span>}
          </div>

          {/* Target Position */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'المنصب المستهدف' : 'Target Position'}</label>
            <select
              style={{ ...INPUT_STYLE, cursor: 'pointer' }}
              value={targetPositionId}
              onChange={e => setTargetPositionId(e.target.value)}
              disabled={!targetDeptId || loadingPositions}
            >
              {loadingPositions
                ? <option>{locale === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</option>
                : (
                  <>
                    <option value="">{locale === 'ar' ? '— اختر المنصب (اختياري) —' : '— Select position (optional) —'}</option>
                    {vacantPositions.map(p => (
                      <option key={p.id} value={p.id}>{p.titleEn}</option>
                    ))}
                  </>
                )
              }
            </select>
          </div>

          {/* Effective Date */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'تاريخ السريان *' : 'Effective Date *'}</label>
            <input
              type="date"
              style={INPUT_STYLE}
              min={minEffectiveDate()}
              value={effectiveDate}
              onChange={e => setEffectiveDate(e.target.value)}
            />
            {fieldErrors.effectiveDate && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--error)',
            marginTop: 3 }}>{fieldErrors.effectiveDate}</span>}
          </div>

          {/* Reason */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'السبب' : 'Reason'}</label>
            <select style={{ ...INPUT_STYLE, cursor: 'pointer' }} value={reason} onChange={e => setReason(e.target.value as Reason)}>
              <option value="CAREER_GROWTH">{locale === 'ar' ? 'تطور وظيفي' : 'Career Growth'}</option>
              <option value="ORG_NEED">{locale === 'ar' ? 'حاجة تنظيمية' : 'Organisational Need'}</option>
              <option value="PERFORMANCE">{locale === 'ar' ? 'الأداء' : 'Performance'}</option>
              <option value="PERSONAL">{locale === 'ar' ? 'شخصي' : 'Personal'}</option>
              <option value="OTHER">{locale === 'ar' ? 'أخرى' : 'Other'}</option>
            </select>
          </div>

          {/* Notes */}
          <div style={FIELD_STYLE}>
            <label style={{ ...LABEL_STYLE, display: 'flex', justifyContent: 'space-between' }}>
              <span>{locale === 'ar' ? 'ملاحظات' : 'Notes'}</span>
              <span style={{ fontWeight: 400, color: notes.length > 500 ? 'var(--error)' : 'var(--ink-3)' }}>{notes.length}/500</span>
            </label>
            <textarea
              style={{ ...INPUT_STYLE, height: 80, padding: '8px 10px', resize: 'vertical', lineHeight: 1.5 }}
              maxLength={500}
              placeholder={locale === 'ar' ? 'ملاحظات إضافية اختيارية…' : 'Optional additional notes…'}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

        </div>{/* end scrollable body */}

        {/* Footer — inside <form> */}
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '0 20px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--card)' }}>
          <button type="button" onClick={onClose} style={{ height: 36, padding: '0 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', fontSize: 'var(--text-body)', fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
            {locale === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{ height: 36, padding: '0 20px', borderRadius: 6, border: 'none', background: submitting ? 'var(--accent-200)' : 'var(--accent)', color: 'white', fontSize: 'var(--text-body)', fontFamily: 'var(--font-sans)', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {submitting && <span style={{ width: 14, height: 14,
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
            borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
            {submitting ? (locale === 'ar' ? 'جارٍ الإرسال…' : 'Submitting…') : (locale === 'ar' ? 'إرسال الطلب' : 'Submit Request')}
          </button>
        </div>
        </form>{/* end form */}

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </>
  )
}
