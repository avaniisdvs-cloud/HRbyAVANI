import 'server-only'
import { cache } from 'react'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { policySettings } from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { BRANDING_ENTITY_ID, COMPANY_LOGO_SELECTION_KEY } from '@/lib/branding'
import { getPagePersonalization } from '@/modules/config/actions/page-personalization'

/** Preserve an existing uploaded logo until the owner explicitly selects a slot. */
export const getCompanyLogoOptions = cache(async () => {
  const artwork = await getPagePersonalization(BRANDING_ENTITY_ID)
  const secondaryLogoUrl = artwork.logoUrl?.startsWith('data:image/')
    ? `/api/branding/logo?v=${new Date(artwork.updatedAt).getTime()}` : artwork.logoUrl || null
  let selection: string | undefined
  try {
    const [row] = await db.select({ value: policySettings.settingValue }).from(policySettings)
      .where(and(eq(policySettings.tenantId, TENANT_ID), eq(policySettings.settingKey, COMPANY_LOGO_SELECTION_KEY), isNull(policySettings.legalEntityId))).limit(1)
    selection = row?.value
  } catch { /* Retain existing artwork if settings are temporarily unavailable. */ }
  const activeLogo: 'primary' | 'secondary' = secondaryLogoUrl && selection !== 'primary' ? 'secondary' : 'primary'
  return { activeLogo, primaryLogoUrl: '/avaniis-logo.png', secondaryLogoUrl }
})
