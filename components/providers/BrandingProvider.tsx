'use client'

import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { DEFAULT_COMPANY_BRANDING, companyLogoSource, formatBrandText, type CompanyBranding } from '@/lib/branding'

const BrandingContext = createContext<CompanyBranding>(DEFAULT_COMPANY_BRANDING)
export function BrandingProvider({ branding, children }: { branding: CompanyBranding; children: ReactNode }) {
  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>
}
export function useBranding() { return useContext(BrandingContext) }

/** Mark product copy explicitly; never globally replace customer records or user-entered text. */
export function BrandText({ children }: { children: ReactNode }) {
  const branding = useBranding()
  return <>{typeof children === 'string' ? formatBrandText(children, branding) : children}</>
}

export function CompanyLogo({ alt, priority, ...props }: ComponentProps<'img'> & { priority?: boolean }) {
  const branding = useBranding()
  // Plain img intentionally supports the existing durable DB-backed data URLs.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} loading={priority ? 'eager' : props.loading} src={companyLogoSource(branding)} alt={alt || branding.companyName} />
}

export function MobileBrandHeader() {
  const branding = useBranding()
  return <div className="mobile-brand-header"><CompanyLogo width={40} height={40} style={{ objectFit: 'contain' }} />{branding.companyName} HR</div>
}
