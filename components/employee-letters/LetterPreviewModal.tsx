'use client'

import { Download, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useLocale } from '@/components/providers/LocaleProvider'
import { LetterTemplate } from '@/modules/employee-letters/pdf-template'

interface LetterData {
  id:                    string
  letterNumber:          string
  status:                string
  language?:             string | null
  pdfUrl?:               string | null
  effectiveDate?:        Date | string | null
  resolvedBodyEn?:       string | null
  resolvedBodyAr?:       string | null
  signedAt?:             Date | string | null
  signedByName?:         string | null
  companyNameEn?:        string
  primaryLogoUrl?:       string | null
  footerImageUrl?:       string | null
  signatoryName?:        string | null
  signatoryTitle?:       string | null
  signatorySignatureUrl?: string | null
  employeeName?:         string | null
}

interface Props {
  letter:  LetterData
  onClose: () => void
}

export function LetterPreviewModal({ letter, onClose }: Props) {
  const locale = useLocale()
  const isSigned = letter.status === 'SIGNED'

  if (!letter.resolvedBodyEn) {
    return (
      <Dialog open onOpenChange={open => { if (!open) onClose() }}>
        <DialogContent style={modal} className="flex flex-col p-0">
          <DialogTitle className="sr-only">{locale === 'ar' ? 'معاينة الخطاب' : 'Letter preview'} · {letter.letterNumber}</DialogTitle>
          <DialogDescription className="sr-only">{locale === 'ar' ? 'راجع الخطاب قبل تنزيله' : 'Review the generated letter before downloading.'}</DialogDescription>

          <p style={{ color: 'var(--ink-3)', padding: 32 }}>Letter body not resolved. Please regenerate.</p>
        </DialogContent>
      </Dialog>
    )
  }

  function handleDownload() {
    if (!letter.pdfUrl) return
    const a = document.createElement('a')
    a.href = letter.pdfUrl
    a.download = `${letter.letterNumber}_${(letter.employeeName ?? 'Employee').replace(/\s+/g, '_')}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent style={modal} className="flex flex-col p-0">
          <DialogTitle className="sr-only">{locale === 'ar' ? 'معاينة الخطاب' : 'Letter preview'} · {letter.letterNumber}</DialogTitle>
          <DialogDescription className="sr-only">{locale === 'ar' ? 'راجع الخطاب قبل تنزيله' : 'Review the generated letter before downloading.'}</DialogDescription>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 48px 14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-1)' }}>
              {letter.letterNumber}
            </span>
            {letter.employeeName && (
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>— {letter.employeeName}</span>
            )}
            {isSigned && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 'var(--text-caption)', fontWeight: 600,
                color: '#2563EB', background: '#DBEAFE',
                padding: '2px 8px', borderRadius: 4,
              }}>
                <CheckCircle2 size={11} /> Signed
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {letter.pdfUrl && (
              <button
                onClick={handleDownload}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 'var(--text-caption)', fontWeight: 600,
                }}
              >
                <Download size={13} /> Download PDF
              </button>
            )}

          </div>
        </div>

        {/* Signed acknowledgement banner */}
        {isSigned && letter.signedAt && (
          <div style={{
            padding: '8px 20px', flexShrink: 0,
            background: '#EFF6FF', borderBottom: '1px solid #BFDBFE',
            fontSize: 'var(--text-caption)', color: '#1D4ED8',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <CheckCircle2 size={13} />
            Digitally acknowledged by <strong style={{ margin: '0 2px' }}>{letter.signedByName}</strong> on{' '}
            {new Date(letter.signedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
            {' '}— Ref: {letter.letterNumber}
          </div>
        )}

        {/* Letter body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 0' }}>
          <LetterTemplate
            letterNumber={letter.letterNumber}
            letterDate={letter.effectiveDate
              ? new Date(letter.effectiveDate).toLocaleDateString('en-GB')
              : new Date().toLocaleDateString('en-GB')}
            resolvedBodyEn={letter.resolvedBodyEn ?? ''}
            resolvedBodyAr={letter.resolvedBodyAr ?? undefined}
            language={(letter.language ?? 'en') as 'en' | 'ar' | 'both'}
            companyNameEn={letter.companyNameEn ?? ''}
            primaryLogoUrl={letter.primaryLogoUrl ?? undefined}
            footerImageUrl={letter.footerImageUrl ?? undefined}
            signatoryName={letter.signatoryName ?? undefined}
            signatoryTitle={letter.signatoryTitle ?? undefined}
            signatorySignatureUrl={letter.signatorySignatureUrl ?? undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
}

const modal: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: 10,
  width: '92vw',
  maxWidth: 860,
  maxHeight: '90vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
}

const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--ink-2)', padding: 4,
  display: 'flex', alignItems: 'center',
}
