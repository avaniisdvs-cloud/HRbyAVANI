import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/modules/config/actions/page-personalization', () => ({ getPagePersonalization: mocks.get }))
import { GET } from '@/app/api/branding/logo/route'
import { BRANDING_ENTITY_ID } from '@/lib/branding'
describe('public company artwork endpoint', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('serves only the global logo bytes with safe image headers', async () => {
    mocks.get.mockResolvedValue({ logoUrl: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') })
    const result = await GET()
    expect(result.status).toBe(200)
    expect(mocks.get).toHaveBeenCalledWith(BRANDING_ENTITY_ID)
    expect(result.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(result.headers.get('Content-Security-Policy')).toContain('sandbox')
    expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await result.text()).toContain('<svg')
  })
  for (const logoUrl of [null, 'https://private.example.test/logo', 'data:text/html;base64,PHNjcmlwdD4=']) {
    it(`does not expose non-image settings: ${logoUrl}`, async () => {
      mocks.get.mockResolvedValue({ logoUrl })
      expect((await GET()).status).toBe(404)
    })
  }
  it('rejects artwork beyond the upload limit', async () => {
    mocks.get.mockResolvedValue({ logoUrl: 'data:image/png;base64,' + Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') })
    expect((await GET()).status).toBe(404)
  })
})
