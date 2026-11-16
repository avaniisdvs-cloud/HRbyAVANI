import 'server-only'
import { cache } from 'react'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { policySettings } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { getPagePersonalization } from '@/modules/config/actions/page-personalization'
import { BRANDING_ENTITY_ID, COMPANY_BRANDING_KEY, DEFAULT_COMPANY_BRANDING, type CompanyBranding } from './branding'

/** Only explicitly public branding is returned; no general policy settings reach the client. */
export const getCompanyBranding = cache(async (): Promise<CompanyBranding> => {
  const logo = await getPagePersonalization(BRANDING_ENTITY_ID)
  const logoUrl = logo.logoUrl?.startsWith('data:image/')
    ? `/api/branding/logo?v=${new Date(logo.updatedAt).getTime()}` : logo.logoUrl || null
  try {
    const [row] = await db.select({ value: policySettings.settingValue }).from(policySettings)
      .where(and(eq(policySettings.tenantId, TENANT_ID), eq(policySettings.settingKey, COMPANY_BRANDING_KEY), isNull(policySettings.legalEntityId)))
      .limit(1)
    const identity = row ? JSON.parse(row.value) : null
    const companyName = typeof identity?.companyName === 'string' && identity.companyName.trim()
      ? identity.companyName.trim() : DEFAULT_COMPANY_BRANDING.companyName
    return {
      companyName,
      companyNameAr: typeof identity?.companyNameAr === 'string' && identity.companyNameAr.trim()
        ? identity.companyNameAr.trim() : (row ? companyName : DEFAULT_COMPANY_BRANDING.companyNameAr),
      logoUrl,
    }
  } catch {
    return { ...DEFAULT_COMPANY_BRANDING, logoUrl }
  }
})
