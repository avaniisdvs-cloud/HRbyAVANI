'use client'

import { useState, useTransition } from 'react'
import { PenLine, CheckCircle, Loader2 } from 'lucide-react'
import { LetterTemplate } from '@/modules/employee-letters/pdf-template'
import { completeLetterSigning } from '@/modules/employee-letters/actions'
import { useLocale } from '@/components/providers/LocaleProvider'

interface Props {
  token: string
  letter: {
    letterNumber:           string
    resolvedBodyEn:         string
    effectiveDate?:         string
    companyNameEn:          string
    primaryLogoUrl?:        string
    signatoryName?:         string
    signatoryTitle?:        string
    signatorySignatureUrl?: string
  }
}

export function SigningPageClient({ token, letter }: Props) {
  const locale = useLocale()
  const [name,      setName]      = useState('')
  const [agreed,    setAgreed]    = useState(false)
  const [done,      setDone]      = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSign() {
    if (!name.trim() || !agreed) return
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('token',        token)
        fd.set('signedByName', name.trim())
        fd.set('signedDevice', navigator.userAgent)
        await completeLetterSigning(fd)
        setDone(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Signing failed')
      }
    })
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', padding: '40px 24px', maxWidth: 400 }}>
          <CheckCircle size={52} style={{ color: '#16A34A', margin: '0 auto 16px' }} />
          <h2 style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-serif)', margin: '0 0 8px' }}>
            Letter Signed
          </h2>
          <p style={{ color: 'var(--ink-3)', fontSize: 14, margin: 0 }}>
            Thank you, {name}. Your acknowledgement has been recorded for letter {letter.letterNumber}.
          </p>
        </div>
      </div>
    )
  }

  const letterDate = letter.effectiveDate
    ? new Date(letter.effectiveDate).toLocaleDateString('en-GB')
    : new Date().toLocaleDateString('en-GB')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '32px 16px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* Letter preview */}
        <LetterTemplate
          letterNumber={letter.letterNumber}
          letterDate={letterDate}
          resolvedBodyEn={letter.resolvedBodyEn}
          companyNameEn={letter.companyNameEn}
          primaryLogoUrl={letter.primaryLogoUrl}
          signatoryName={letter.signatoryName}
          signatoryTitle={letter.signatoryTitle}
          signatorySignatureUrl={letter.signatorySignatureUrl}
        />

        {/* Signing panel */}
        <div style={{
          marginTop: 24, background: 'var(--card)',
          border: '1px solid var(--border)', borderRadius: 10,
          padding: '24px 28px', maxWidth: 540, marginInline: 'auto',
        }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--ink-1)' }}>
            Acknowledge & Sign
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
            By signing, you confirm receipt and acknowledgement of this letter.
          </p>

          <label style={{ display: 'block', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
            Full Name (as it appears on your ID)
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={locale === 'ar' ? 'اسمك الكامل' : 'Your full name'}
            style={{
              width: '100%', padding: '8px 12px', marginBottom: 16,
              border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--bg)', color: 'var(--ink-1)',
              fontSize: 'var(--text-body)', outline: 'none', boxSizing: 'border-box',
            }}
          />

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 20 }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', lineHeight: 1.5 }}>
              I confirm that I have read, understood, and acknowledge receipt of this letter.
            </span>
          </label>

          {error && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: '#FEE2E2', color: '#DC2626', fontSize: 'var(--text-body)' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSign}
            disabled={!name.trim() || !agreed || isPending}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: !name.trim() || !agreed ? 'var(--surface)' : 'var(--accent)',
              color: !name.trim() || !agreed ? 'var(--ink-4)' : '#fff',
              border: 'none', borderRadius: 6, padding: '10px',
              fontSize: 14, fontWeight: 500, cursor: !name.trim() || !agreed ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending
              ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              : <PenLine size={16} />
            }
            Sign Letter
          </button>
        </div>
      </div>
    </div>
  )
}
