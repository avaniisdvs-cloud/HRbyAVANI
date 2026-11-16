'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { policySettings } from '@/drizzle/schema'
import { requireRole } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { TENANT_ID } from '@/lib/constants'
import { COMPANY_BRANDING_KEY } from '@/lib/branding'

const identitySchema = z.object({
  companyName: z.string().trim().min(1, 'Enter a company name.').max(100).regex(/^[^<>\u0000-\u001f]+$/, 'Use a plain-text company name.'),
  companyNameAr: z.string().trim().max(100).regex(/^[^<>\u0000-\u001f]*$/, 'Use a plain-text company name.').optional().default(''),
})

export async function saveCompanyIdentity(input: unknown): Promise<{ success: true } | { error: string }> {
  const user = await requireRole(['SUPER_ADMIN'])
  const parsed = identitySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const identity = { ...parsed.data, companyNameAr: parsed.data.companyNameAr || parsed.data.companyName }
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${TENANT_ID + ':company-branding'}))`)
      const where = and(eq(policySettings.tenantId, TENANT_ID), eq(policySettings.settingKey, COMPANY_BRANDING_KEY), isNull(policySettings.legalEntityId))
      const [existing] = await tx.select({ id: policySettings.id, value: policySettings.settingValue }).from(policySettings).where(where).limit(1)
      const now = new Date()
      const actorName = user.name || user.email || 'Super Admin'
      if (existing) {
        await tx.update(policySettings).set({ settingValue: JSON.stringify(identity), updatedBy: user.id, updatedByName: actorName, lastUpdatedDate: now, updatedDate: now }).where(where)
      } else {
        await tx.insert(policySettings).values({ tenantId: TENANT_ID, legalEntityId: null, settingKey: COMPANY_BRANDING_KEY,
          settingNameEn: 'Company branding identity', settingNameAr: 'هوية الشركة', valueType: 'JSON',
          settingValue: JSON.stringify(identity), moduleCode: 'PLATFORM', isOverridable: false,
          effectiveFrom: now.toISOString().slice(0, 10), createdBy: user.id, createdByName: actorName })
      }
      await writeAuditLog({ actorId: user.id, actorName, actorRole: user.role, channel: 'WEB',
        eventType: 'COMPANY_BRANDING.IDENTITY_UPDATED', resourceType: 'policy_settings',
        oldValues: existing ? { identity: existing.value } : undefined, newValues: identity }, tx)
    })
    revalidatePath('/', 'layout')
    return { success: true }
  } catch {
    return { error: 'Could not save company branding. Please try again.' }
  }
}
