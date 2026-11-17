import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginClient from '@/app/(auth)/sign-in/_LoginClient'
import type { AriaLoginConfig } from '@/lib/aria/login-config'

vi.mock('@/components/aria/AriaLoginWidget', () => ({ default: () => null }))

const personalization = {
  topBannerText: 'AI Driven HR System', topBannerVisible: true,
  tickerText: '', tickerVisible: false, tickerSpeed: 30,
  carouselImages: [], logoUrl: null, carouselHeightPct: 70,
}
const mount = () => render(<LoginClient personalization={personalization} ariaConfig={{} as AriaLoginConfig} />)
const active = () => document.querySelector('[aria-current="true"]')?.getAttribute('aria-label')

describe('sign-in slideshow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

  it('automatically cycles through every image and returns to the first', () => {
    mount()
    expect(active()).toBe('Slide 1')
    for (const slide of ['Slide 2', 'Slide 3', 'Slide 1']) {
      act(() => vi.advanceTimersByTime(6500))
      expect(active()).toBe(slide)
    }
  })

  it('keeps a selected slide paused until playback resumes', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Slide 3' }))
    act(() => vi.advanceTimersByTime(13000))
    expect(active()).toBe('Slide 3')
    fireEvent.click(screen.getByRole('button', { name: 'Play slideshow' }))
    act(() => vi.advanceTimersByTime(6500))
    expect(active()).toBe('Slide 1')
  })

  it('respects reduced motion while keeping manual selection available', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    mount()
    act(() => vi.advanceTimersByTime(13000))
    expect(active()).toBe('Slide 1')
    fireEvent.click(screen.getByRole('button', { name: 'Slide 2' }))
    expect(active()).toBe('Slide 2')
  })

  it('renders and animates the scrolling ticker at the configured speed', () => {
    render(
      <LoginClient
        personalization={{
          ...personalization,
          tickerText: 'Company news and announcements',
          tickerVisible: true,
          tickerSpeed: 15,
        }}
        ariaConfig={{} as AriaLoginConfig}
      />,
    )

    const tickerText = screen.getByText((content) => content.includes('Company news and announcements'))
    expect(tickerText).toHaveStyle({ animation: 'ticker-ltr 15s linear infinite' })
  })

  it('renders uploaded carousel images instead of the defaults and rotates them', () => {
    render(
      <LoginClient
        personalization={{
          ...personalization,
          carouselImages: [
            { id: 'two', url: 'data:image/png;base64,dHdv', alt: 'Second', order: 1, uploadedAt: '2026-11-17' },
            { id: 'one', url: 'data:image/png;base64,b25l', alt: 'First', order: 0, uploadedAt: '2026-11-17' },
          ],
        }}
        ariaConfig={{} as AriaLoginConfig}
      />,
    )

    expect(screen.getAllByRole('button', { name: /Slide/ })).toHaveLength(2)
    expect(active()).toBe('Slide 1')
    act(() => vi.advanceTimersByTime(6500))
    expect(active()).toBe('Slide 2')
  })
})
