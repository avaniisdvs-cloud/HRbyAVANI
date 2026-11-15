/**
 * EN↔AR localization remediation — regression coverage for the pure i18n
 * helpers that enforce the enterprise model:
 *   • English mode → English only, Arabic mode → Arabic only (never both)
 *   • One key-based dictionary lookup (tk) replacing the dormant react-i18next
 *   • Correct global layout direction (RTL for Arabic, LTR for English)
 *
 * These guard the P0 menu fix (pickLabel) and the single i18n strategy (tk).
 */
import { describe, it, expect } from 'vitest'
import { pickLabel, direction, isRtl, chooseLocale } from '@/lib/i18n'
import { tk } from '@/lib/i18n-messages'

describe('pickLabel — single-language menu rendering', () => {
  const item = { labelEn: 'Dashboard', labelAr: 'لوحة التحكم' }

  it('returns ONLY English in en mode', () => {
    expect(pickLabel(item, 'en')).toBe('Dashboard')
  })

  it('returns ONLY Arabic in ar mode', () => {
    expect(pickLabel(item, 'ar')).toBe('لوحة التحكم')
  })

  it('never concatenates both languages (no "EN · AR")', () => {
    expect(pickLabel(item, 'en')).not.toContain('·')
    expect(pickLabel(item, 'ar')).not.toContain('·')
    expect(pickLabel(item, 'en')).not.toContain('لوحة')
    expect(pickLabel(item, 'ar')).not.toContain('Dashboard')
  })

  it('supports the WorkspaceNavGroup shape (label + labelAr)', () => {
    const group = { label: 'Lifecycle', labelAr: 'دورة الحياة' }
    expect(pickLabel(group, 'en')).toBe('Lifecycle')
    expect(pickLabel(group, 'ar')).toBe('دورة الحياة')
  })

  it('falls back to the other language when the active one is missing (never blank)', () => {
    expect(pickLabel({ labelEn: 'Only EN' }, 'ar')).toBe('Only EN')
    expect(pickLabel({ labelAr: 'فقط عربي' }, 'en')).toBe('فقط عربي')
  })
})

describe('tk — centralized key-based dictionary lookup', () => {
  it('resolves English chrome keys', () => {
    expect(tk('en', 'common.save')).toBe('Save')
    expect(tk('en', 'common.next')).toBe('Next')
  })

  it('resolves Arabic chrome keys (distinct from English)', () => {
    expect(tk('ar', 'common.save')).toBe('حفظ')
    expect(tk('ar', 'common.save')).not.toBe(tk('en', 'common.save'))
    expect(tk('ar', 'nav.dashboard')).toBe('لوحة المعلومات')
  })

  it('falls back to English when an Arabic key is absent', () => {
    // Force an en-only lookup path: an unknown locale resolves to en.
    expect(tk('fr' as unknown as string, 'common.save')).toBe('Save')
  })

  it('returns the key itself for a completely missing key (never blank)', () => {
    expect(tk('en', 'this.key.does.not.exist')).toBe('this.key.does.not.exist')
    expect(tk('ar', 'this.key.does.not.exist', 'Fallback')).toBe('Fallback')
  })
})

describe('chooseLocale — DB-first source-of-truth priority', () => {
  it('authenticated DB preference wins when no cookie (DB=ar)', () => {
    expect(chooseLocale('ar', null)).toBe('ar')
  })

  it('authenticated DB preference wins over a STALE cookie (DB=ar, cookie=en)', () => {
    expect(chooseLocale('ar', 'en')).toBe('ar')
  })

  it('after explicit toggle both agree (DB=en, cookie=en → en; DB=ar, cookie=ar → ar)', () => {
    expect(chooseLocale('en', 'en')).toBe('en')
    expect(chooseLocale('ar', 'ar')).toBe('ar')
  })

  it('cookie is the fallback when there is no DB preference (guest/unauth)', () => {
    expect(chooseLocale(null, 'ar')).toBe('ar')
    expect(chooseLocale(undefined, 'ar')).toBe('ar')
  })

  it('defaults to en with neither DB preference nor cookie', () => {
    expect(chooseLocale(null, null)).toBe('en')
  })

  it('ignores invalid/unsupported values at each level', () => {
    expect(chooseLocale('fr', 'ar')).toBe('ar') // invalid DB → cookie
    expect(chooseLocale(null, 'xx')).toBe('en')  // invalid cookie → default
  })
})

describe('direction / isRtl — global layout direction', () => {
  it('Arabic is RTL', () => {
    expect(direction('ar')).toBe('rtl')
    expect(isRtl('ar')).toBe(true)
  })

  it('English is LTR', () => {
    expect(direction('en')).toBe('ltr')
    expect(isRtl('en')).toBe(false)
  })
})
