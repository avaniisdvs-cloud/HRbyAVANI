/** Public display identity only. Never use these values as tenant IDs or legal/payroll identity. */
export interface CompanyBranding {
  companyName: string
  companyNameAr: string
  logoUrl: string | null
}
export const BRANDING_ENTITY_ID = '11111111-1111-1111-1111-111111111111'
export const COMPANY_LOGO_SELECTION_KEY = 'COMPANY_BRANDING_LOGO_SELECTION'
export const COMPANY_BRANDING_KEY = 'COMPANY_BRANDING_IDENTITY'
export const DEFAULT_COMPANY_BRANDING: CompanyBranding = {
  companyName: 'AVANIIS', companyNameAr: 'أفانيس', logoUrl: null,
}

export function formatBrandText(text: string, branding: CompanyBranding): string {
  return text.replace(/(?<![\w@/.-])(?:AVANIIS|AVANIS)(?![\w.-])/gi, () => branding.companyName)
    .replace(/أفانييس|أفانيس/g, () => branding.companyNameAr || branding.companyName)
}

export function companyLogoSource(branding: CompanyBranding): string {
  return branding.logoUrl || (branding.companyName === DEFAULT_COMPANY_BRANDING.companyName ? '/avaniis-logo.png' : '/hr-mark.svg')
}
