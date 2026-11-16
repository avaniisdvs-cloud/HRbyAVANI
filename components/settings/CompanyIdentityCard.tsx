'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveCompanyIdentity } from '@/app/(hr-admin)/settings/branding/actions'
import { useLocale } from '@/components/providers/LocaleProvider'
import { PageTitle } from '@/components/ui/typography'
import type { CompanyBranding } from '@/lib/branding'

export function CompanyIdentityCard({ initial }: { initial: CompanyBranding }) {
  const [name, setName] = useState(initial.companyName)
  const [nameAr, setNameAr] = useState(initial.companyNameAr)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const ar = useLocale() === 'ar'
  return <section style={{ marginBottom: 24, padding: 24, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }}>
    <PageTitle>{ar ? 'هوية الشركة' : 'Company Branding'}</PageTitle>
    <p style={{ color: 'var(--ink-3)', marginBottom: 20 }}>{ar ? 'للمشرف العام فقط. يُطبّق الاسم والشعار على هوية التطبيق وصفحة تسجيل الدخول والقوائم.' : 'Super Admin only. The company name and logo apply to the application identity, sign-in page, and navigation.'}</p>
    <form onSubmit={event => { event.preventDefault(); setMessage(''); startTransition(async () => {
      try {
      const result = await saveCompanyIdentity({ companyName: name, companyNameAr: nameAr })
      setMessage('error' in result ? result.error : (ar ? 'تم حفظ هوية الشركة.' : 'Company branding saved.'))
      if ('success' in result) router.refresh()
      } catch { setMessage(ar ? 'تعذر الحفظ. يرجى المحاولة مرة أخرى.' : 'Unable to save. Please try again.') }
    }) }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 16 }}>
        <label htmlFor="branding-company-name">{ar ? 'اسم الشركة *' : 'Company display name *'}
          <input id="branding-company-name" value={name} onChange={event => { setName(event.target.value); if (nameAr === initial.companyNameAr) setNameAr('') }} maxLength={100} required disabled={pending} className="branding-name-input" />
        </label>
        <label htmlFor="branding-company-name-ar">{ar ? 'اسم الشركة بالعربية (اختياري)' : 'Arabic company name (optional)'}
          <input id="branding-company-name-ar" value={nameAr} onChange={event => setNameAr(event.target.value)} maxLength={100} disabled={pending} dir="auto" className="branding-name-input" />
        </label>
      </div>
      <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-caption)', marginTop: 12 }}>{ar ? 'اترك الاسم العربي فارغاً لاستخدام اسم الشركة باللغتين. ارفع الشعار أدناه؛ يُفضّل PNG شفاف أو SVG.' : 'Leave Arabic name blank to use the company name in both languages. Upload the logo below; a transparent PNG or SVG is recommended.'}</p>
      <button type="submit" disabled={pending} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 0, padding: '10px 16px', borderRadius: 8 }}>{pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ اسم الشركة' : 'Save company name')}</button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  </section>
}
