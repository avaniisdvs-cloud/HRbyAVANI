'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/components/providers/LocaleProvider'
import { SectionTitle } from '@/components/ui/typography'
import { selectCompanyLogo } from '@/app/(hr-admin)/settings/branding/actions'
import { uploadBrandingLogo } from '@/modules/config/actions/page-personalization'
import { BRANDING_ENTITY_ID } from '@/lib/branding'

type LogoSlot = 'primary' | 'secondary'
type Options = { activeLogo: LogoSlot; primaryLogoUrl: string; secondaryLogoUrl: string | null }

export function CompanyLogosCard({ initial }: { initial: Options }) {
  const ar = useLocale() === 'ar'
  const router = useRouter()
  const [active, setActive] = useState(initial.activeLogo)
  const [secondaryUrl, setSecondaryUrl] = useState(initial.secondaryLogoUrl)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { setActive(initial.activeLogo); setSecondaryUrl(initial.secondaryLogoUrl) }, [initial.activeLogo, initial.secondaryLogoUrl])

  async function choose(slot: LogoSlot) {
    setBusy(true); setMessage('')
    try {
      const result = await selectCompanyLogo(slot)
      if ('error' in result) throw new Error(result.error)
      setActive(slot)
      setMessage(ar ? 'تم تغيير الشعار المعروض.' : 'Displayed logo updated.')
      router.refresh()
    } catch (error) {
      setMessage(ar ? 'تعذر تغيير الشعار. يرجى المحاولة مرة أخرى.' : error instanceof Error ? error.message : 'Unable to change logo.')
    } finally { setBusy(false) }
  }

  async function upload() {
    if (!file) return
    setBusy(true); setMessage('')
    try {
      // Persist the current choice first: uploading must not silently switch the displayed logo.
      const selection = await selectCompanyLogo(active)
      if ('error' in selection) throw new Error(selection.error)
      const data = new FormData(); data.append('file', file)
      const result = await uploadBrandingLogo(BRANDING_ENTITY_ID, data)
      if ('error' in result) throw new Error(result.error)
      setSecondaryUrl(result.logoUrl)
      setMessage(ar ? 'تم رفع الشعار الثانوي. اختره لعرضه في التطبيق.' : 'Secondary logo uploaded. Select it to display it in the application.')
      router.refresh()
    } catch (error) {
      setMessage(ar ? 'فشل الرفع. استخدم PNG أو SVG أو JPG أو WebP بحجم لا يتجاوز 2 ميجابايت، ثم حاول مرة أخرى.' : error instanceof Error ? error.message : 'Upload failed. Please try again.')
    } finally { setBusy(false) }
  }

  return <section className="company-logos-card" aria-labelledby="company-logos-title">
    <SectionTitle id="company-logos-title">{ar ? 'الشعار الأساسي والثانوي' : 'Primary and secondary logos'}</SectionTitle>
    <p>{ar ? 'احتفظ بشعار AVANIIS وشعار العميل، واختر الشعار المعروض. لا يغير هذا الاختيار اسم الشركة.' : 'Keep AVANIIS and your customer logo, then select which logo the application displays. This selection does not change the company name.'}</p>
    <div className="company-logo-options">
      {(['primary', 'secondary'] as const).map(slot => {
        const primary = slot === 'primary'
        const src = primary ? initial.primaryLogoUrl : secondaryUrl
        return <div key={slot} className="company-logo-option" data-selected={active === slot}>
          <h3>{primary ? (ar ? 'الشعار الأساسي — AVANIIS' : 'Primary logo — AVANIIS') : (ar ? 'الشعار الثانوي — العميل' : 'Secondary logo — Customer')}</h3>
          <div className="company-logo-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {src ? <img src={src} alt={primary ? 'AVANIIS' : (ar ? 'شعار العميل' : 'Customer logo')} /> : <span>{ar ? 'لم يُرفع شعار العميل بعد' : 'No customer logo uploaded yet'}</span>}
          </div>
          <button type="button" aria-pressed={active === slot} disabled={busy || !src} onClick={() => choose(slot)}>
            {active === slot ? (ar ? '✓ الشعار المعروض' : '✓ Displayed logo') : primary ? (ar ? 'استخدام الشعار الأساسي' : 'Use primary logo') : (ar ? 'استخدام الشعار الثانوي' : 'Use secondary logo')}
          </button>
        </div>
      })}
    </div>
    <div className="company-logo-upload">
      <label htmlFor="secondary-company-logo">{ar ? 'اختر ملف شعار العميل' : 'Choose customer logo file'}</label>
      <input id="secondary-company-logo" type="file" accept=".png,.svg,.jpg,.jpeg,.webp" disabled={busy} aria-describedby="company-logo-upload-help" onChange={event => { setFile(event.target.files?.[0] ?? null); setMessage('') }} />
      <p id="company-logo-upload-help">{ar ? 'اختر الملف، ثم اضغط رفع الشعار الثانوي. PNG أو SVG أو JPG أو WebP، بحد أقصى 2 ميجابايت. يُفضّل ملف شفاف.' : 'Choose a file, then click Upload secondary logo. PNG, SVG, JPG or WebP, maximum 2 MB. A transparent logo is recommended.'}</p>
      <button type="button" disabled={busy || !file} onClick={upload}>{busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'رفع الشعار الثانوي' : 'Upload secondary logo')}</button>
    </div>
    <p role="status" aria-live="polite">{message || (!file ? (ar ? 'اختر ملفاً لتفعيل زر الرفع.' : 'Choose a file to enable Upload.') : (ar ? 'الملف جاهز للرفع.' : 'File selected. Ready to upload.'))}</p>
  </section>
}
