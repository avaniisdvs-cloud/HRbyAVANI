'use client'

import { SectionTitle } from '@/components/ui/typography'
import { useState, useTransition } from 'react'
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react'
import { LetterTemplate } from '@/modules/employee-letters/pdf-template'
import { completeLetterSigning } from '@/modules/employee-letters/actions'
import { useLocale } from '@/components/providers/LocaleProvider'

interface Props {
  token:             string
  letterNumber:      string
  letterTypeName:    string
  resolvedBodyEn:    string
  letterDate:        string
  companyNameEn:     string
  primaryLogoUrl:    string | null
  signatoryName:     string | null
  signatoryTitle:    string | null
  employeeFullName:  string
  backHref:          string
}

export function SigningFormClient({
  token, letterNumber, letterTypeName, resolvedBodyEn, letterDate,
  companyNameEn, primaryLogoUrl, signatoryName, signatoryTitle,
  employeeFullName, backHref,
}: Props) {
  const locale = useLocale()
  const [name,    setName]    = useState(employeeFullName)
  const [agreed,  setAgreed]  = useState(false)
  const [signed,  setSigned]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startPending] = useTransition()

  const canSubmit = agreed && name.trim().length > 0 && !pending

  function handleSubmit() {
    if (!canSubmit) return
    setError(null)
    startPending(async () => {
      try {
        const fd = new FormData()
        fd.set('token',        token)
        fd.set('signedByName', name.trim())
        fd.set('signedDevice', navigator.userAgent)
        const result = await completeLetterSigning(fd)
        if (result.success) setSigned(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Signing failed — please try again')
      }
    })
  }

  if (signed) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg)', padding: 24,
      }}>
        <div style={{
          maxWidth: 520, width: '100%', textAlign: 'center', padding: '48px 36px',
          background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>✅</div>
          <SectionTitle style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: 'var(--ink-1)', fontFamily: 'var(--font-serif)' }}>
            Document Signed Successfully
          </SectionTitle>
          <p style={{ margin: '0 0 6px', fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
            Reference: <strong style={{ fontFamily: 'var(--font-mono)' }}>{letterNumber}</strong>
          </p>
          <p style={{ margin: '0 0 28px', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
            Signed: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
            {' '}— A copy has been saved to your profile.
          </p>
          <a href={backHref} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 22px', borderRadius: 8,
            background: 'var(--accent)', color: "var(--on-accent)",
            fontSize: 'var(--text-body)', fontWeight: 600, textDecoration: 'none',
          }}>
            View in My Documents →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Breadcrumb bar */}
      <div style={{
        padding: '10px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <a
          href={backHref}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 'var(--text-caption)', color: 'var(--ink-3)', textDecoration: 'none',
            padding: '4px 8px', borderRadius: 5,
            transition: 'background 120ms, color 120ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--surface)'
            e.currentTarget.style.color = 'var(--ink-1)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--ink-3)'
          }}
        >
          <ArrowLeft size={13} /> Back
        </a>

        <span style={{ color: 'var(--border)', fontSize: 'var(--text-body)' }}>|</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>
            Document Acknowledgement
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: 10,
            background: 'var(--surface)', fontSize: 'var(--text-caption)',
            color: 'var(--ink-3)', fontFamily: 'var(--font-mono)',
          }}>
            {letterNumber}
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: 10,
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            fontSize: 'var(--text-caption)', color: 'var(--brand-active)', fontWeight: 500,
          }}>
            {letterTypeName}
          </span>
        </div>
      </div>

      {/* Two-column body — fills remaining height */}
      <div data-responsive-grid="true" style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 340px',
        minHeight: 0,
      }}>

        {/* LEFT — scrollable letter preview */}
        <div style={{
          overflowY: 'auto',
          borderRight: '1px solid var(--border)',
          background: '#F8F8F8',
        }}>
          <div style={{
            padding: '8px 16px', borderBottom: '1px solid var(--border)',
            background: 'var(--surface)', fontSize: 'var(--text-caption)', fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)',
            position: 'sticky', top: 0, zIndex: 1,
          }}>
            Read-only preview
          </div>
          <div style={{ padding: '20px 0' }}>
            <LetterTemplate
              letterNumber={letterNumber}
              letterDate={letterDate}
              resolvedBodyEn={resolvedBodyEn}
              companyNameEn={companyNameEn}
              primaryLogoUrl={primaryLogoUrl ?? undefined}
              signatoryName={signatoryName ?? undefined}
              signatoryTitle={signatoryTitle ?? undefined}
            />
          </div>
        </div>

        {/* RIGHT — signing panel */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          background: 'var(--card)',
          overflowY: 'auto',
        }}>
          <div style={{
            padding: '12px 20px', borderBottom: '1px solid var(--border)',
            background: 'var(--surface)', flexShrink: 0,
            fontSize: 'var(--text-caption)', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--ink-3)',
          }}>
            I agree and accept
          </div>

          <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>

            <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
              By signing below you confirm you have read and understood the full contents of this document.
            </p>

            {/* Full name */}
            <div>
              <label style={{
                display: 'block', fontSize: 'var(--text-caption)', fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'var(--ink-3)', marginBottom: 6,
              }}>
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={locale === 'ar' ? 'أدخل اسمك الكامل' : 'Enter your full name'}
                style={{
                  width: '100%', height: 38, borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--ink-1)', fontSize: 'var(--text-body)', padding: '0 12px',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Consent */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                style={{ marginTop: 3, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', lineHeight: 1.6 }}>
                I confirm I have read and understood the contents of this letter and I accept its terms.
              </span>
            </label>

            {/* Error */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
                borderRadius: 7, background: '#FEE2E2', color: '#991B1B', fontSize: 'var(--text-caption)',
              }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '11px 0', borderRadius: 8, border: 'none', width: '100%',
                background: canSubmit ? 'var(--accent)' : 'var(--border)',
                color:      canSubmit ? '#fff'          : 'var(--ink-4)',
                fontSize: 'var(--text-body)', fontWeight: 600,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s, color 0.15s',
                marginTop: 'auto',
              }}
            >
              {pending
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Signing…</>
                : <><CheckCircle2 size={14} /> Confirm &amp; Sign</>}
            </button>

            <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--ink-4)', textAlign: 'center', lineHeight: 1.5 }}>
              This constitutes a digital acknowledgement. A signed copy will be saved to your profile.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
