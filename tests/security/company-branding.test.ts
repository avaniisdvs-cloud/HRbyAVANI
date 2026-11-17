import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  role: 'SUPER_ADMIN' as string | null,
  transaction: vi.fn(), audit: vi.fn(), revalidate: vi.fn(), personalization: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireRole: vi.fn(async (roles: string[]) => {
  if (!mocks.role || !roles.includes(mocks.role)) throw new Error('FORBIDDEN')
  return { id: '22222222-2222-2222-2222-222222222222', role: mocks.role, name: 'Test Admin', email: 'admin@example.test' }
}) }))
vi.mock('@/lib/db', () => ({ db: { transaction: mocks.transaction } }))
vi.mock('@/modules/config/actions/page-personalization', async importOriginal => ({
  ...await importOriginal<typeof import('@/modules/config/actions/page-personalization')>(),
  getPagePersonalization: mocks.personalization,
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.audit }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))

import { saveCompanyIdentity, selectCompanyLogo } from '@/app/(hr-admin)/settings/branding/actions'
import { uploadBrandingLogo, updatePagePersonalization, uploadCarouselImage, deleteCarouselImage, reorderCarouselImages } from '@/modules/config/actions/page-personalization'
import { BRANDING_ENTITY_ID } from '@/lib/branding'

describe('company branding server authorization', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.role = 'SUPER_ADMIN'; mocks.personalization.mockResolvedValue({ logoUrl: null }) })
  for (const role of [null, 'EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE']) {
    it(`denies every branding write to ${role || 'unauthenticated callers'} before database access`, async () => {
      mocks.role = role
      const writes = [
        () => saveCompanyIdentity({ companyName: 'NESNAR' }),
        () => selectCompanyLogo('primary'),
        () => uploadBrandingLogo(BRANDING_ENTITY_ID, new FormData()),
        () => updatePagePersonalization(BRANDING_ENTITY_ID, { logo_url: 'https://example.test/logo.png' }),
        () => uploadCarouselImage(BRANDING_ENTITY_ID, new FormData()),
        () => deleteCarouselImage(BRANDING_ENTITY_ID, 'image-id'),
        () => reorderCarouselImages(BRANDING_ENTITY_ID, []),
      ]
      for (const write of writes) await expect(write()).rejects.toThrow('FORBIDDEN')
      expect(mocks.transaction).not.toHaveBeenCalled()
    })
  }
  it('rejects invalid identity without writing', async () => {
    expect(await saveCompanyIdentity({ companyName: ' ' })).toHaveProperty('error')
    expect(await saveCompanyIdentity({ companyName: '<script>bad</script>' })).toHaveProperty('error')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('stores name and audit in one transaction and invalidates all branded layouts', async () => {
    const values = vi.fn(async (_value: unknown) => [])
    const tx = {
      execute: vi.fn(async () => []),
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: () => ({ values }),
    }
    mocks.transaction.mockImplementationOnce(async callback => callback(tx))
    expect(await saveCompanyIdentity({ companyName: '  NESNAR  ', companyNameAr: '' })).toEqual({ success: true })
    expect(values.mock.calls[0][0]).toMatchObject({ settingValue: JSON.stringify({ companyName: 'NESNAR', companyNameAr: 'NESNAR' }), isOverridable: false, legalEntityId: null })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorRole: 'SUPER_ADMIN', eventType: 'COMPANY_BRANDING.IDENTITY_UPDATED' }), tx)
    expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout')
  })
  it('rejects an invalid selection before database writes', async () => {
    expect(await selectCompanyLogo('other')).toHaveProperty('error')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('requires a stored secondary logo before it can be selected', async () => {
    expect(await selectCompanyLogo('secondary')).toEqual({ error: 'Upload the secondary logo first.' })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('persists selection with an audit event without changing either image or the name', async () => {
    const values = vi.fn(async (_value: unknown) => [])
    const tx = { execute: vi.fn(async () => []), select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }), insert: () => ({ values }) }
    mocks.transaction.mockImplementationOnce(async callback => callback(tx))
    expect(await selectCompanyLogo('primary')).toEqual({ success: true })
    expect(values.mock.calls[0][0]).toMatchObject({ settingKey: 'COMPANY_BRANDING_LOGO_SELECTION', settingValue: 'primary', legalEntityId: null, isOverridable: false })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'COMPANY_BRANDING.LOGO_SELECTED', newValues: { activeLogo: 'primary' } }), tx)
    expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout')
  })

})
