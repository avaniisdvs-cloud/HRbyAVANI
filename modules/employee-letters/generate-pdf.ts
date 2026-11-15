/**
 * Server-side PDF generation for employee letters via @react-pdf/renderer.
 * Universal: takes a pre-resolved HTML body string from the template engine.
 */
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import path from 'path'
import fs   from 'fs'
import { LetterPdf } from './pdf-react-template'

export interface LetterPdfData {
  letterNumber:           string
  letterDate:             string
  resolvedBodyEn:         string
  resolvedBodyAr?:        string
  language:               'en' | 'ar' | 'both'
  companyNameEn:          string
  companyNameAr?:         string
  primaryLogoUrl?:        string
  footerImageUrl?:        string
  signatoryName?:         string
  signatoryTitle?:        string
  signatorySignatureUrl?: string
}

/**
 * Converts any URL to a form react-pdf can use:
 *  - HTTP(S) → returned as-is (react-pdf fetches it)
 *  - /uploads/... (dev) → read from public/ and return base64 data URI
 *  - local://stub/... (legacy stub) → undefined (skipped gracefully)
 *  - undefined/null → undefined
 */
async function resolveImageForPdf(url: string | undefined | null): Promise<string | undefined> {
  if (!url) return undefined
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/')) {
    const filePath = path.join(process.cwd(), 'public', url)
    try {
      const buf  = fs.readFileSync(filePath)
      const ext  = url.split('.').pop()?.toLowerCase() ?? ''
      const mime = ext === 'png'  ? 'image/png'
                 : ext === 'svg'  ? 'image/svg+xml'
                 : ext === 'webp' ? 'image/webp'
                 : 'image/jpeg'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch {
      return undefined
    }
  }
  // legacy local://stub/... — skip
  return undefined
}

export async function generateLetterPdf(data: LetterPdfData): Promise<Buffer> {
  const [primaryLogoUrl, footerImageUrl, signatorySignatureUrl] = await Promise.all([
    resolveImageForPdf(data.primaryLogoUrl),
    resolveImageForPdf(data.footerImageUrl),
    resolveImageForPdf(data.signatorySignatureUrl),
  ])

  const element = createElement(LetterPdf, {
    ...data,
    primaryLogoUrl,
    footerImageUrl,
    signatorySignatureUrl,
  })
  const buffer = await renderToBuffer(element as any)
  return Buffer.from(buffer)
}

export function formatLetterDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
