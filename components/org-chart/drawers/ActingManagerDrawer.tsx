'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Search }                                  from 'lucide-react'
import { useToast }                                   from '@/hooks/use-toast'
import { useLocale }                                  from '@/components/providers/LocaleProvider'
import { assignActingManager, searchPersons }          from '@/modules/core-hr/org-chart-actions'
import type { OrgNodeData }                            from '@/lib/org-chart/types'

interface ActingManagerDrawerProps {
  nodeId:   string
  nodeData: OrgNodeData
  onClose:  () => void
}

interface PersonResult {
  id:          string
  nameEn:      string
  jobTitleEn?: string
}

const INPUT_STYLE: React.CSSProperties = {
  width:        '100%',
  height:       36,
  border:       '1px solid var(--border)',
  borderRadius: 6,
  paddingTop: "0",
  paddingRight: "10px",
  paddingBottom: "0",
  paddingLeft: "10px",
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

export function ActingManagerDrawer({ nodeId: _nodeId, nodeData, onClose }: ActingManagerDrawerProps) {
  const { toast }    = useToast()
  const locale       = useLocale()
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef  = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  const [searchQuery,      setSearchQuery]      = useState('')
  const [searchResults,    setSearchResults]    = useState<PersonResult[]>([])
  const [showDropdown,     setShowDropdown]     = useState(false)
  const [selectedPerson,   setSelectedPerson]   = useState<PersonResult | null>(null)
  const [startDate,        setStartDate]        = useState('')
  const [endDate,          setEndDate]          = useState('')
  const [reason,           setReason]           = useState('')
  const [submitting,       setSubmitting]       = useState(false)
  const [fieldErrors,      setFieldErrors]      = useState<Record<string, string>>({})

  // Today as min date
  const today = new Date().toISOString().slice(0, 10)

  // Person search with debounce
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); setShowDropdown(false); return }
    try {
      const result = await searchPersons(q)
      if (result.success) {
        setSearchResults(result.data ?? [])
        setShowDropdown(true)
      }
    } catch {
      setSearchResults([])
    }
  }, [])

  function handleSearchChange(val: string) {
    setSearchQuery(val)
    setSelectedPerson(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void runSearch(val) }, 300)
  }

  function selectPerson(p: PersonResult) {
    setSelectedPerson(p)
    setSearchQuery(p.nameEn)
    setShowDropdown(false)
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current     && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!selectedPerson)       errors.actingPerson = locale === 'ar' ? 'اختر شخصًا' : 'Select a person'
    if (!startDate)            errors.startDate    = locale === 'ar' ? 'مطلوب' : 'Required'
    else if (startDate < today) errors.startDate   = locale === 'ar' ? 'لا يمكن أن يكون في الماضي' : 'Cannot be in the past'
    if (!endDate)              errors.endDate      = locale === 'ar' ? 'مطلوب' : 'Required'
    else if (endDate <= startDate) errors.endDate  = locale === 'ar' ? 'يجب أن يكون بعد تاريخ البدء' : 'Must be after start date'
    if (reason.trim().length < 10) errors.reason   = locale === 'ar' ? 'مطلوب 10 أحرف على الأقل' : 'At least 10 characters required'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const result = await assignActingManager({
        positionId:    nodeData.positionId,
        actingPersonId:selectedPerson!.id,
        startDate,
        endDate,
        reason,
      })
      if (result.success) {
        toast({
          title:       locale === 'ar' ? 'تم حفظ التكليف بالإنابة' : 'Acting assignment saved',
          description: locale === 'ar' ? 'سيتم تحديث العقدة عند تحميل الشجرة التالي.' : 'The node will update on next tree load.',
        })
        onClose()
      } else {
        toast({
          title:       locale === 'ar' ? 'خطأ' : 'Error',
          description: result.error ?? (locale === 'ar' ? 'تعذر حفظ التكليف.' : 'Failed to save assignment.'),
          variant:     'destructive',
        })
      }
    } catch {
      toast({
        title:       locale === 'ar' ? 'خطأ' : 'Error',
        description: locale === 'ar' ? 'تعذر حفظ التكليف. يرجى المحاولة مرة أخرى.' : 'Failed to save assignment. Please try again.',
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
        width:       440,
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
            {locale === 'ar' ? 'تعيين مدير بالإنابة' : 'Assign Acting Manager'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4 }} aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Form wraps body + footer so type="submit" works */}
        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* Position (read-only) */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'المنصب' : 'Position'}</label>
            <div style={{ ...INPUT_STYLE, display: 'flex', alignItems: 'center', background: 'var(--surface)', color: 'var(--ink-2)' }}>
              {nodeData.positionTitleEn}
            </div>
          </div>

          {/* Current Holder (read-only) */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'شاغل المنصب الحالي' : 'Current Holder'}</label>
            <div style={{ ...INPUT_STYLE, display: 'flex', alignItems: 'center', background: 'var(--surface)', color: 'var(--ink-2)' }}>
              {nodeData.fullNameEn ?? '—'}
            </div>
          </div>

          {/* Acting Person search */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'الشخص المكلّف *' : 'Acting Person *'}</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} strokeWidth={2} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }} />
                <input
                  ref={inputRef}
                  type="text"
                  style={{ ...INPUT_STYLE, paddingLeft: 32 }}
                  placeholder={locale === 'ar' ? 'البحث عن موظفين…' : 'Search employees…'}
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true) }}
                  autoComplete="off"
                />
              </div>
              {showDropdown && searchResults.length > 0 && (
                <div
                  ref={dropdownRef}
                  style={{
                    position:   'absolute',
                    top:        '100%',
                    left:       0,
                    right:      0,
                    marginTop:  4,
                    background: 'var(--card)',
                    border:     '1px solid var(--border)',
                    borderRadius:8,
                    boxShadow:  '0 4px 16px rgba(0,0,0,0.12)',
                    zIndex:     10,
                    overflowX: 'hidden',
                    maxHeight:  280,
                    overflowY:  'auto',
                  }}
                >
                  {searchResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPerson(p)}
                      style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 12px', background: 'none',
                      borderTopWidth: "0px",
                      borderTopStyle: "none",
                      borderTopColor: "currentColor",
                      borderRightWidth: "0px",
                      borderRightStyle: "none",
                      borderRightColor: "currentColor",
                      borderLeftWidth: "0px",
                      borderLeftStyle: "none",
                      borderLeftColor: "currentColor",
                      borderBottomWidth: "1px",
                      borderBottomStyle: "solid",
                      borderBottomColor: "var(--border)", cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                    >
                      <span style={{ fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>{p.nameEn}</span>
                      {p.jobTitleEn && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>{p.jobTitleEn}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {fieldErrors.actingPerson && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--error)',
            marginTop: 3 }}>{fieldErrors.actingPerson}</span>}
          </div>

          {/* Start Date */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'تاريخ البدء *' : 'Start Date *'}</label>
            <input
              type="date"
              style={INPUT_STYLE}
              min={today}
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            {fieldErrors.startDate && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--error)',
            marginTop: 3 }}>{fieldErrors.startDate}</span>}
          </div>

          {/* End Date */}
          <div style={FIELD_STYLE}>
            <label style={LABEL_STYLE}>{locale === 'ar' ? 'تاريخ الانتهاء *' : 'End Date *'}</label>
            <input
              type="date"
              style={INPUT_STYLE}
              min={startDate || today}
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
            {fieldErrors.endDate && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--error)',
            marginTop: 3 }}>{fieldErrors.endDate}</span>}
          </div>

          {/* Reason */}
          <div style={FIELD_STYLE}>
            <label style={{ ...LABEL_STYLE, display: 'flex', justifyContent: 'space-between' }}>
              <span>{locale === 'ar' ? 'السبب *' : 'Reason *'}</span>
              <span style={{ fontWeight: 400, color: reason.length < 10 ? 'var(--error)' : 'var(--ink-3)' }}>{reason.length}/10 {locale === 'ar' ? 'كحد أدنى' : 'min'}</span>
            </label>
            <textarea
              style={{ ...INPUT_STYLE, height: 80,
              paddingTop: "8px",
              paddingRight: "10px",
              paddingBottom: "8px",
              paddingLeft: "10px", resize: 'vertical', lineHeight: 1.5 }}
              placeholder={locale === 'ar' ? 'سبب التكليف بالإنابة…' : 'Reason for acting assignment…'}
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
            {fieldErrors.reason && <span style={{ fontSize: 'var(--text-caption)', color: 'var(--error)',
            marginTop: 3 }}>{fieldErrors.reason}</span>}
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
            {submitting ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ التكليف' : 'Save Assignment')}
          </button>
        </div>
        </form>{/* end form */}

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </>
  )
}
