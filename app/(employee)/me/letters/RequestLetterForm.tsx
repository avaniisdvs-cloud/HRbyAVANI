'use client'

import { useState, useTransition } from 'react'
import { Loader2, Send } from 'lucide-react'
import { requestLetter } from '@/modules/employee-letters/actions'
import { useLocale } from '@/components/providers/LocaleProvider'

interface LetterType {
  typeCode:         string
  nameEn:           string
  nameAr:           string
  requiresApproval: boolean
}

interface Props {
  types:    LetterType[]
  personId: string
}

export function RequestLetterForm({ types, personId }: Props) {
  const locale = useLocale()
  const [typeCode,  setTypeCode]  = useState(types[0]?.typeCode ?? '')
  const [language,  setLanguage]  = useState<'en' | 'ar'>('en')
  const [done,      setDone]      = useState(false)
  const [approvalRequired, setApprovalRequired] = useState(false)
  const [pdfGenerated, setPdfGenerated] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedType = types.find(t => t.typeCode === typeCode)

  function handleRequest() {
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('typeCode', typeCode)
        fd.set('language', language)
        fd.set('personId', personId)
        const result = await requestLetter(fd)
        if (result.success) {
          setPdfGenerated(result.pdfGenerated ?? false)
          setApprovalRequired(result.requiresApproval ?? false)
          setDone(true)
        } else {
          setError(result.error ?? (locale === 'ar' ? 'تعذّر تقديم طلب الخطاب في الوقت الحالي. يرجى المحاولة لاحقاً أو التواصل مع دعم الموارد البشرية.' : 'We could not submit your letter request right now. Please try again later or contact HR support.'))
        }
      } catch {
        setError(locale === 'ar' ? 'تعذّر تقديم طلب الخطاب في الوقت الحالي. يرجى المحاولة لاحقاً أو التواصل مع دعم الموارد البشرية.' : 'We could not submit your letter request right now. Please try again later or contact HR support.')
      }
    })
  }

  if (done) {
    const canDownload = pdfGenerated && !approvalRequired

    return (
      <div>
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 12,
          background: approvalRequired ? '#FEF9C3' : canDownload ? '#F0FDF4' : '#EFF6FF',
          border: `1px solid ${approvalRequired ? '#FDE68A' : canDownload ? '#BBF7D0' : '#BFDBFE'}`,
          fontSize: 'var(--text-body)', lineHeight: 1.6,
          color: approvalRequired ? '#92400E' : canDownload ? '#14532D' : '#1E3A5F',
        }}>
          {approvalRequired ? (
            <>
              <strong>{locale === 'ar' ? '✓ تم التقديم لموافقة الموارد البشرية' : '✓ Submitted for HR approval'}</strong>
              <p style={{ margin: '4px 0 0' }}>
                {locale === 'ar'
                  ? 'طلب الخطاب الخاص بك قيد المراجعة لدى عمليات الموارد البشرية. سيتم إشعارك بمجرد الموافقة عليه وجاهزيته للتنزيل. تابع الحالة في سجل الخطابات أدناه.'
                  : 'Your letter request is with HR Operations for review. You will be notified once it is approved and ready for download. Track the status in Letter History below.'}
              </p>
            </>
          ) : canDownload ? (
            <>
              <strong>{locale === 'ar' ? '✓ خطابك جاهز' : '✓ Your letter is ready'}</strong>
              <p style={{ margin: '4px 0 0' }}>
                {locale === 'ar'
                  ? 'تم إنشاء خطابك وهو متاح للتنزيل. راجع سجل الخطابات أدناه.'
                  : 'Your letter has been generated and is available for download. See Letter History below.'}
              </p>
            </>
          ) : (
            <>
              <strong>{locale === 'ar' ? '⏳ تم استلام الطلب — جارٍ الإنشاء' : '⏳ Request received — generation in progress'}</strong>
              <p style={{ margin: '4px 0 0' }}>
                {locale === 'ar'
                  ? 'تم تسجيل طلب الخطاب الخاص بك. جارٍ إنشاء ملف PDF — يستغرق هذا عادةً أقل من دقيقة. تحقق من سجل الخطابات أدناه للحصول على رابط التنزيل. إذا لم يظهر الخطاب خلال بضع دقائق، يرجى التواصل مع الموارد البشرية.'
                  : 'Your letter request has been registered. PDF generation is in progress — this usually takes under a minute. Check Letter History below for the download link. If the letter does not appear within a few minutes, contact HR.'}
              </p>
            </>
          )}
        </div>
        <button
          onClick={() => { setDone(false); setError(null); setPdfGenerated(false); setApprovalRequired(false) }}
          style={{
            fontSize: 'var(--text-caption)', color: 'var(--ink-3)', background: 'none',
            border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px',
            cursor: 'pointer',
          }}
        >
          {locale === 'ar' ? 'طلب خطاب آخر' : 'Request another letter'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
            {locale === 'ar' ? 'نوع الخطاب' : 'Letter Type'}
          </label>
          <select
            value={typeCode}
            onChange={e => setTypeCode(e.target.value)}
            style={{
              padding: '7px 10px', border: '1px solid var(--border)',
              borderRadius: 6, background: 'var(--bg)', color: 'var(--ink-1)',
              fontSize: 'var(--text-body)', cursor: 'pointer',
            }}
          >
            {types.map(t => (
              <option key={t.typeCode} value={t.typeCode}>{locale === 'ar' ? (t.nameAr || t.nameEn) : t.nameEn}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
            {locale === 'ar' ? 'اللغة' : 'Language'}
          </label>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value as 'en' | 'ar')}
            style={{
              padding: '7px 10px', border: '1px solid var(--border)',
              borderRadius: 6, background: 'var(--bg)', color: 'var(--ink-1)',
              fontSize: 'var(--text-body)', cursor: 'pointer',
            }}
          >
            <option value="en">{locale === 'ar' ? 'الإنجليزية' : 'English'}</option>
            <option value="ar">{locale === 'ar' ? 'العربية' : 'Arabic'}</option>
          </select>
        </div>

        <button
          onClick={handleRequest}
          disabled={isPending}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', color: "var(--on-accent)",
            border: 'none', borderRadius: 6, padding: '8px 16px',
            fontSize: 'var(--text-body)', fontWeight: 500,
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending
            ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            : <Send size={14} />
          }
          {locale === 'ar' ? 'طلب خطاب' : 'Request Letter'}
        </button>
      </div>

      {/* Approval note */}
      {selectedType?.requiresApproval && !error && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
          {locale === 'ar'
            ? 'يتطلب هذا النوع من الخطابات موافقة الموارد البشرية قبل إصداره.'
            : 'This letter type requires HR approval before it is issued.'}
        </p>
      )}

      {/* Business-friendly error — never shows stack traces */}
      {error && (
        <div style={{
          marginTop: 10, padding: '10px 14px',
          background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 6, fontSize: 'var(--text-body)', color: '#DC2626',
          lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
