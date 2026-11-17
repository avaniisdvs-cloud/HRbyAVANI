import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ select: vi.fn(), upload: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/components/providers/LocaleProvider', () => ({ useLocale: () => 'en' }))
vi.mock('@/app/(hr-admin)/settings/branding/actions', () => ({ selectCompanyLogo: mocks.select }))
vi.mock('@/modules/config/actions/page-personalization', () => ({ uploadBrandingLogo: mocks.upload }))
import { CompanyLogosCard } from '@/components/settings/CompanyLogosCard'
const initial = { activeLogo: 'primary' as const, primaryLogoUrl: '/avaniis-logo.png', secondaryLogoUrl: null }
afterEach(cleanup)
beforeEach(() => { vi.clearAllMocks(); mocks.select.mockResolvedValue({ success: true }); mocks.upload.mockResolvedValue({ logoUrl: 'data:image/png;base64,AAAA' }) })
describe('two retained logos and explicit upload', () => {
  it('enables Upload after browsing and retains primary while uploading a customer logo', async () => {
    render(<CompanyLogosCard initial={initial} />)
    expect(screen.getByLabelText('Choose customer logo file').getAttribute('accept')).toBe('image/*')
    const upload = screen.getByRole('button', { name: 'Upload secondary logo' }) as HTMLButtonElement
    expect(upload.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Choose customer logo file'), { target: { files: [new File(['test'], 'customer.png', { type: 'image/png' })] } })
    expect(upload.disabled).toBe(false)
    fireEvent.click(upload)
    await screen.findByText('Secondary logo uploaded. Select it to display it in the application.')
    expect(screen.getByRole('img', { name: 'AVANIIS' }).getAttribute('src')).toBe('/avaniis-logo.png')
    expect(screen.getByRole('img', { name: 'Customer logo' })).toBeTruthy()
    expect(mocks.select).toHaveBeenCalledWith('primary')
    fireEvent.click(screen.getByRole('button', { name: 'Use secondary logo' }))
    await waitFor(() => expect(mocks.select).toHaveBeenLastCalledWith('secondary'))
  })
  it('shows server upload failures and allows a retry', async () => {
    mocks.upload.mockResolvedValueOnce({ error: 'File too large (max 2 MB)' })
    render(<CompanyLogosCard initial={initial} />)
    fireEvent.change(screen.getByLabelText('Choose customer logo file'), { target: { files: [new File(['test'], 'customer.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload secondary logo' }))
    await screen.findByText('File too large (max 2 MB)')
    expect((screen.getByRole('button', { name: 'Upload secondary logo' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByRole('img', { name: 'Customer logo' })).toBeNull()
  })
})
