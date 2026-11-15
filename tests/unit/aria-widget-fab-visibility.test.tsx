// @vitest-environment jsdom
/**
 * Regression guard for the ARIA floating button (FAB).
 *
 * The FAB disappeared in production because a persisted drag position
 * (localStorage 'aria_widget_pos') could place it off-screen — the button was
 * rendered but outside the viewport. These tests lock the invariant:
 *
 *   The FAB is ALWAYS rendered AND positioned within the viewport for an
 *   allowed user, regardless of any stored position or viewport size.
 *
 * If this ever fails again, it fails here — not in production.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import AriaAuthWidget from '@/components/aria/AriaAuthWidget'

// ── Mocks: isolate the widget from server actions / routing / mic hardware ──
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('@/modules/aria', () => ({ sendAriaMessage: vi.fn() }))
vi.mock('@/components/aria/useMicPermission', () => ({
  useMicPermission: () => ({
    permState: 'prompt', guideType: null, showHint: false,
    requestPermission: vi.fn().mockResolvedValue(false), retry: vi.fn(), dismissGuide: vi.fn(),
  }),
}))
vi.mock('@/components/aria/MicPermissionGuide', () => ({ default: () => null }))

const SESSION_CTX = {
  personId: 'p1', role: 'HR_ADMIN', legalEntityId: 'e1', language: 'en' as const, userName: 'Test User',
}

// In-memory localStorage polyfill (jsdom env here doesn't provide a full one).
function installLocalStorage() {
  const store = new Map<string, string>()
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  }
  Object.defineProperty(window, 'localStorage', { value: mock, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: mock, configurable: true, writable: true })
}

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth',  { value: w, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
}

function fabStyle() {
  const btn = screen.getByRole('button', { name: /Open ARIA Assistant|فتح مساعد ARIA/ })
  return btn.style
}

describe('ARIA FAB — always visible & on-screen', () => {
  beforeEach(() => {
    cleanup()
    installLocalStorage()
    setViewport(1280, 800)
  })

  it('renders the floating button with no stored position (default corner)', () => {
    render(<AriaAuthWidget sessionCtx={SESSION_CTX} />)
    const s = fabStyle()
    // Default anchored bottom-right
    expect(s.bottom).toBe('24px')
    expect(s.right).toBe('24px')
  })

  it('clamps an OFF-SCREEN stored position back into the viewport (the regression)', () => {
    localStorage.setItem('aria_widget_pos', JSON.stringify({ x: 99999, y: 99999 }))
    render(<AriaAuthWidget sessionCtx={SESSION_CTX} />)
    const s = fabStyle()
    const left = parseInt(s.left, 10)
    const top  = parseInt(s.top, 10)
    // Must be on-screen, not at 99999
    expect(left).toBeGreaterThanOrEqual(8)
    expect(left).toBeLessThanOrEqual(window.innerWidth)
    expect(top).toBeGreaterThanOrEqual(8)
    expect(top).toBeLessThanOrEqual(window.innerHeight)
  })

  it('clamps a negative stored position back into the viewport', () => {
    localStorage.setItem('aria_widget_pos', JSON.stringify({ x: -5000, y: -5000 }))
    render(<AriaAuthWidget sessionCtx={SESSION_CTX} />)
    const s = fabStyle()
    expect(parseInt(s.left, 10)).toBeGreaterThanOrEqual(8)
    expect(parseInt(s.top, 10)).toBeGreaterThanOrEqual(8)
  })

  it('keeps an in-bounds stored position visible', () => {
    localStorage.setItem('aria_widget_pos', JSON.stringify({ x: 100, y: 100 }))
    render(<AriaAuthWidget sessionCtx={SESSION_CTX} />)
    const s = fabStyle()
    expect(parseInt(s.left, 10)).toBe(100)
    expect(parseInt(s.top, 10)).toBe(100)
  })

  it('is suppressed on its own embedded routes (/aria) — by design', async () => {
    vi.resetModules()
    vi.doMock('next/navigation', () => ({ usePathname: () => '/aria' }))
    vi.doMock('@/modules/aria', () => ({ sendAriaMessage: vi.fn() }))
    vi.doMock('@/components/aria/useMicPermission', () => ({
      useMicPermission: () => ({ permState: 'prompt', guideType: null, showHint: false, requestPermission: vi.fn(), retry: vi.fn(), dismissGuide: vi.fn() }),
    }))
    vi.doMock('@/components/aria/MicPermissionGuide', () => ({ default: () => null }))
    const { default: Widget } = await import('@/components/aria/AriaAuthWidget')
    render(<Widget sessionCtx={SESSION_CTX} />)
    expect(screen.queryByRole('button', { name: /Open ARIA Assistant/ })).toBeNull()
  })
})
