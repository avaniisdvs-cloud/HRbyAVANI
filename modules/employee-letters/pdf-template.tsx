/**
 * HTML React component for browser-side live preview of any employee letter.
 * Supports language: 'en' | 'ar' | 'both'
 *
 * SEC-LETTER-001: letter body HTML is sanitized with DOMPurify before rendering
 * via dangerouslySetInnerHTML. This prevents stored XSS if an HR Admin were to
 * craft a malicious letter template body (e.g. <script> injection).
 */
import React from 'react'
import DOMPurify from 'isomorphic-dompurify'

/**
 * Allowed HTML tags for letter body content.
 * Covers all rich-text output from the Tiptap editor used in letter templates.
 * Scripts, event handlers, and iframe/object/embed are explicitly excluded.
 */
const LETTER_ALLOWED_TAGS = [
  'p', 'br', 'b', 'i', 'em', 'strong', 'u', 's', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'span', 'div', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr',
]
const LETTER_ALLOWED_ATTR = ['style', 'class', 'dir', 'align', 'colspan', 'rowspan']

function sanitizeLetterBody(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS:  LETTER_ALLOWED_TAGS,
    ALLOWED_ATTR:  LETTER_ALLOWED_ATTR,
    FORCE_BODY:    true,
    RETURN_DOM:    false,
  })
}

export interface LetterTemplateProps {
  letterNumber:           string
  letterDate:             string
  resolvedBodyEn:         string
  resolvedBodyAr?:        string
  language?:              'en' | 'ar' | 'both'
  companyNameEn:          string
  companyNameAr?:         string
  primaryLogoUrl?:        string
  footerImageUrl?:        string
  signatoryName?:         string
  signatoryTitle?:        string
  signatorySignatureUrl?: string
}

/** Returns the URL if it can be displayed in a browser <img>, otherwise undefined. */
function safeImgUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  if (url.startsWith('local://') || url.startsWith('blob://')) return undefined
  return url
}

const paperStyle: React.CSSProperties = {
  fontFamily: '"Times New Roman", serif',
  fontSize: 14,
  color: '#1a1a1a',
  background: '#fff',
  padding: '56px 60px',
  maxWidth: 780,
  margin: '0 auto',
  lineHeight: 1.8,
  boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
}

function LetterPage({
  letterNumber, letterDate, body, dir = 'ltr',
  companyNameEn, companyNameAr,
  primaryLogoUrl, footerImageUrl,
  signatoryName, signatoryTitle, signatorySignatureUrl,
  langLabel,
}: {
  letterNumber:           string
  letterDate:             string
  body:                   string
  dir?:                   'ltr' | 'rtl'
  companyNameEn:          string
  companyNameAr?:         string
  primaryLogoUrl?:        string
  footerImageUrl?:        string
  signatoryName?:         string
  signatoryTitle?:        string
  signatorySignatureUrl?: string
  langLabel?:             string
}) {
  const isRtl       = dir === 'rtl'
  const companyLabel = isRtl && companyNameAr ? companyNameAr : companyNameEn
  const logoSrc     = safeImgUrl(primaryLogoUrl)
  const sigSrc      = safeImgUrl(signatorySignatureUrl)
  const footerSrc   = safeImgUrl(footerImageUrl)
  // SEC-LETTER-001: sanitize body before injection to prevent stored XSS
  const safeBody    = sanitizeLetterBody(body)

  return (
    <div style={{ ...paperStyle, direction: dir }}>
      {langLabel && (
        <div style={{
          display: 'inline-block', fontSize: 10, color: '#6B7280',
          border: '1px solid #E5E7EB', padding: '2px 8px', borderRadius: 4,
          marginBottom: 16,
        }}>
          {langLabel}
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
        flexDirection: isRtl ? 'row-reverse' : 'row',
      }}>
        {logoSrc
          ? <img src={logoSrc} alt="Company logo"
              style={{ maxWidth: 120, maxHeight: 56, objectFit: 'contain' }} />
          : <span style={{ fontWeight: 700, fontSize: 18 }}>{companyLabel}</span>}
        <div style={{ fontSize: 12, color: '#555', textAlign: isRtl ? 'left' : 'right' }}>
          <div>{isRtl ? 'المرجع' : 'Ref'}: {letterNumber}</div>
          <div>{isRtl ? 'التاريخ' : 'Date'}: {letterDate}</div>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', marginBottom: 24 }} />

      {/* Body — SEC-LETTER-001: safeBody is DOMPurify-sanitized */}
      <div
        dangerouslySetInnerHTML={{ __html: safeBody }}
        style={{ marginBottom: 32, textAlign: isRtl ? 'right' : 'left' }}
      />

      {/* Signature block */}
      {signatoryName && (
        <div style={{ marginTop: 40, textAlign: isRtl ? 'right' : 'left' }}>
          {sigSrc && (
            <img src={sigSrc} alt="Signature"
              style={{ maxWidth: 180, maxHeight: 64, objectFit: 'contain', display: 'block', marginBottom: 8 }} />
          )}
          <div style={{ fontWeight: 700 }}>{signatoryName}</div>
          {signatoryTitle && <div style={{ fontSize: 12, color: '#555' }}>{signatoryTitle}</div>}
          <div style={{ fontSize: 12, color: '#555' }}>{companyLabel}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 48, borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
        {footerSrc
          ? <img src={footerSrc} alt="Footer"
              style={{ width: '100%', maxHeight: 80, objectFit: 'contain', display: 'block' }} />
          : <div style={{ fontSize: 10, color: '#aaa', textAlign: 'center' }}>
              {companyLabel} — {letterNumber}
            </div>}
      </div>
    </div>
  )
}

export function LetterTemplate(props: LetterTemplateProps) {
  const {
    letterNumber, letterDate,
    resolvedBodyEn, resolvedBodyAr,
    language = 'en',
    companyNameEn, companyNameAr,
    primaryLogoUrl, footerImageUrl,
    signatoryName, signatoryTitle, signatorySignatureUrl,
  } = props

  const shared = {
    letterNumber, letterDate,
    companyNameEn, companyNameAr,
    primaryLogoUrl, footerImageUrl,
    signatoryName, signatoryTitle, signatorySignatureUrl,
  }

  if (language === 'both') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <LetterPage {...shared} body={resolvedBodyEn} dir="ltr" langLabel="English" />
        {resolvedBodyAr && (
          <LetterPage {...shared} body={resolvedBodyAr} dir="rtl" langLabel="العربية" />
        )}
      </div>
    )
  }

  if (language === 'ar' && resolvedBodyAr) {
    return <LetterPage {...shared} body={resolvedBodyAr} dir="rtl" />
  }

  return <LetterPage {...shared} body={resolvedBodyEn} dir="ltr" />
}
