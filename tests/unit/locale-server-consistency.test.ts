import { expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ session: { user: { personId: 'employee-1' } } as { user: { personId: string } } | null, resolve: vi.fn().mockResolvedValue('en') }))
vi.mock('@/lib/auth', () => ({ auth: async () => state.session }))
vi.mock('@/lib/language-preference', () => ({ resolveLocale: state.resolve }))
import { getLocale } from '@/lib/locale-server'
it('uses the same authenticated language resolver as the shell', async () => {
  expect(await getLocale()).toBe('en')
  expect(state.resolve).toHaveBeenLastCalledWith('employee-1')
})
it('uses guest fallback through the same resolver when signed out', async () => {
  state.session = null
  await getLocale()
  expect(state.resolve).toHaveBeenLastCalledWith(undefined)
})
