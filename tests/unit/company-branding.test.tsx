import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BrandingProvider, BrandText, CompanyLogo } from '@/components/providers/BrandingProvider'
import { companyLogoSource, DEFAULT_COMPANY_BRANDING, formatBrandText } from '@/lib/branding'

const brand = { companyName: 'NESNAR', companyNameAr: 'نسنار', logoUrl: 'data:image/png;base64,dGVzdA==' }
afterEach(cleanup)
describe('configured company display identity', () => {
  it('updates explicitly branded text and logos on the first render', () => {
    render(<BrandingProvider branding={brand}><BrandText>AVANIIS HR</BrandText><CompanyLogo /></BrandingProvider>)
    expect(screen.getByText('NESNAR HR')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'NESNAR' }).getAttribute('src')).toBe(brand.logoUrl)
  })
  it('keeps uploaded artwork within explicit layout dimensions', () => {
    render(<BrandingProvider branding={brand}><CompanyLogo width={64} height={64} style={{ width: 'auto', objectFit: 'contain' }} /></BrandingProvider>)
    expect(screen.getByRole('img').style.height).toBe('64px')
    expect(screen.getByRole('img').style.width).toBe('auto')
  })
  it('handles Arabic, mixed case and literal replacement characters safely', () => {
    expect(formatBrandText('Avaniis / AVANIIS / أفانيس', brand)).toBe('NESNAR / NESNAR / نسنار')
    expect(formatBrandText('AVANIIS HR', { ...brand, companyName: 'A & B $&' })).toBe('A & B $& HR')
  })
  it('does not rewrite technical IDs, asset paths, domains or email addresses', () => {
    const technical = 'avaniis_locale /avaniis-logo.png https://avaniis.dev support@avaniis.dev'
    expect(formatBrandText(technical, brand)).toBe(technical)
  })
  it('does not show the old company logo for a newly named company without a logo', () => {
    expect(companyLogoSource({ ...brand, logoUrl: null })).toBe('/hr-mark.svg')
    expect(companyLogoSource(DEFAULT_COMPANY_BRANDING)).toBe('/avaniis-logo.png')
  })
})
