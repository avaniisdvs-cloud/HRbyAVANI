'use client'

import { useRef, useState, useTransition } from 'react'
import { uploadLeaveMedicalCert } from '@/modules/absence'
import { type Locale } from '@/lib/i18n'

interface Props {
  requestId:           string
  certUploaded:        boolean
  uploadedFileName?:   string | null
  /** If status is not DRAFT or REJECTED the widget is read-only */
  canUpload:           boolean
  locale?:             Locale
}

export function LeaveCertUploadWidget({ requestId, certUploaded, uploadedFileName, canUpload, locale = 'en' }: Props) {
  const inputRef             = useRef<HTMLInputElement>(null)
  const [error, setError]    = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(certUploaded)
  const [fileName, setFileName] = useState<string | null>(uploadedFileName ?? null)
  const [isPending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    const fd = new FormData()
    fd.append('file', file)

    startTransition(async () => {
      const result = await uploadLeaveMedicalCert(requestId, fd)
      if (result.success) {
        setUploaded(true)
        setFileName(result.fileName)
      } else {
        setError(result.error)
        // Reset the input so the same file can be retried.
        if (inputRef.current) inputRef.current.value = ''
      }
    })
  }

  return (
    <div
      style={{
        background:   'var(--card)',
        border:       `1px solid ${uploaded ? 'var(--status-approved-dot)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        overflow:     'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding:      '14px 20px',
          borderBottom: '1px solid var(--border)',
          display:      'flex',
          alignItems:   'center',
          gap:          10,
        }}
      >
        {/* Certificate icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flexShrink: 0 }}>
          <rect x="2" y="1" width="12" height="14" rx="2" stroke="var(--ink-2)" strokeWidth="1.4" />
          <path d="M5 5h6M5 8h6M5 11h3" stroke="var(--ink-2)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', margin: 0 }}>
          {locale === 'ar' ? 'الشهادة الطبية' : 'Medical Certificate'}
        </h3>
        {uploaded && (
          <span
            style={{
              marginLeft: 'auto',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 'var(--text-caption)', fontWeight: 600,
              color: 'var(--status-approved-fg)',
              background: 'var(--status-approved-bg)',
              border: '1px solid var(--status-approved-dot)',
              borderRadius: 20, padding: '2px 10px',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <circle cx="5" cy="5" r="4.5" fill="var(--status-step-done)" />
              <path d="M2.5 5l1.5 1.5 3.5-3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {locale === 'ar' ? 'تم الرفع' : 'Uploaded'}
          </span>
        )}
        {!uploaded && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 'var(--text-caption)', fontWeight: 600,
              color: 'var(--status-warning-fg, #92400e)',
              background: 'var(--status-warning-bg, #fef3c7)',
              border: '1px solid var(--status-warning-border, #fcd34d)',
              borderRadius: 20, padding: '2px 10px',
            }}
          >
            {locale === 'ar' ? 'مطلوب' : 'Required'}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '16px 20px' }}>
        {uploaded && fileName && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '10px 14px',
              marginBottom: canUpload ? 12 : 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden style={{ flexShrink: 0 }}>
              <rect x="2" y="1" width="14" height="16" rx="2" fill="var(--accent-050)" stroke="var(--accent-200)" strokeWidth="1.2" />
              <path d="M6 6h6M6 9h6M6 12h4" stroke="var(--accent)" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileName}
            </span>
          </div>
        )}

        {canUpload && (
          <>
            <p style={{ margin: '0 0 10px', fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
              {uploaded
                ? (locale === 'ar'
                    ? 'يمكنك رفع شهادة بديلة إذا لزم الأمر.'
                    : 'Upload a replacement certificate if needed.')
                : (locale === 'ar'
                    ? 'ارفع شهادتك الطبية لتفعيل التقديم. المقبول: PDF، JPEG، PNG، WEBP (الحد الأقصى 5 MB).'
                    : 'Upload your medical certificate to enable submission. Accepted: PDF, JPEG, PNG, WEBP (max 5 MB).')}
            </p>

            <input
              ref={inputRef}
              type="file"
              id={`cert-upload-${requestId}`}
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handleChange}
              disabled={isPending}
            />

            <label
              htmlFor={`cert-upload-${requestId}`}
              style={{
                display:       'inline-flex',
                alignItems:    'center',
                gap:           8,
                cursor:        isPending ? 'not-allowed' : 'pointer',
                padding:       '8px 18px',
                borderRadius:  'var(--radius)',
                border:        '1px solid var(--accent-200)',
                background:    isPending ? 'var(--surface)' : 'var(--accent-050)',
                color:         'var(--brand-active)',
                fontSize:      'var(--text-body)',
                fontWeight:    600,
                opacity:       isPending ? 0.6 : 1,
                transition:    'background 0.15s',
              }}
            >
              {isPending ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="7" cy="7" r="5.5" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="20 14" />
                  </svg>
                  {locale === 'ar' ? 'جارٍ الرفع…' : 'Uploading…'}
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M7 1v8M4 4l3-3 3 3" stroke="var(--accent-700)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2 11h10" stroke="var(--accent-700)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {uploaded
                    ? (locale === 'ar' ? 'استبدال الشهادة' : 'Replace certificate')
                    : (locale === 'ar' ? 'رفع الشهادة' : 'Upload certificate')}
                </>
              )}
            </label>

            {error && (
              <p
                role="alert"
                style={{
                  marginTop: 10, marginBottom: 0,
                  fontSize: 'var(--text-body)', color: 'var(--org-error, #dc2626)',
                  background: 'var(--status-rejected-bg, #fef2f2)',
                  border: '1px solid var(--status-rejected-dot, #fca5a5)',
                  borderRadius: 'var(--radius)',
                  padding: '8px 12px',
                }}
              >
                {error}
              </p>
            )}
          </>
        )}

        {!canUpload && !uploaded && (
          <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
            No certificate uploaded. Certificate upload is only available while the request is in Draft or Rejected status.
          </p>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
