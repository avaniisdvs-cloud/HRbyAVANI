/**
 * i18n regression guard — prevents the recurring "hardcoded-English UI" blind spot.
 *
 * Earlier localization passes used narrow grep patterns and repeatedly missed
 * whole categories (plain `<span>/<p>/<th>` text nodes, then component prop
 * labels `label=`/`title=`, then role dashboards). Independent verification also
 * found the guard's own allowlist used broad substring matching (a sentence
 * containing "Finance" was wrongly excused). This suite locks in the hardened
 * behavior: exact value/token matching, no blanket file allowlist, and the
 * whole codebase scanning clean.
 */
import { describe, it, expect } from 'vitest'
import { runScan, scanSource } from '../../scripts/i18n-sweep-hardcoded-ui.mjs'

const F = 'components/__synthetic__.tsx'

describe('i18n guard — detection behavior (synthetic, fixture-free)', () => {
  it('flags a plain hardcoded English heading', () => {
    expect(scanSource(F, '<h2>Totally Madeup Widget Heading</h2>')).toHaveLength(1)
  })

  it('flags a sentence that merely CONTAINS an allowed word ("Finance")', () => {
    // Regression: previously excused by substring match against ALLOW_PHRASES.
    const hits = scanSource(F, '<h2>Finance Reports Overview</h2>')
    expect(hits).toHaveLength(1)
    expect(hits[0].value).toBe('Finance Reports Overview')
  })

  it('flags hardcoded aria-label / title / placeholder chrome', () => {
    expect(scanSource(F, '<button aria-label="Clear search" />').length).toBeGreaterThan(0)
    expect(scanSource(F, '<input placeholder="Enter your full name" />').length).toBeGreaterThan(0)
  })

  it('does NOT flag legitimate allowlisted values (products / language self-name / role / enum)', () => {
    expect(scanSource(F, '<span>Azure OpenAI</span>')).toHaveLength(0)
    expect(scanSource(F, '<option>English</option>')).toHaveLength(0)
    expect(scanSource(F, '<span>HR Director</span>')).toHaveLength(0)
    expect(scanSource(F, '<option value="ANNUAL">ANNUAL</option>')).toHaveLength(0)
  })

  it('does NOT flag locale-conditional or Arabic-script lines, or EN/AR markers', () => {
    expect(scanSource(F, "<span>{locale === 'ar' ? 'الإعدادات' : 'Settings'}</span>")).toHaveLength(0)
    expect(scanSource(F, '<span dir="rtl">لوحة التحكم</span>')).toHaveLength(0)
    expect(scanSource(F, '<span>EN</span>')).toHaveLength(0)
  })

  it('handles multi-line ternaries (EN branch a few lines below the locale check)', () => {
    const src = [
      "{locale === 'ar' ? (",
      '  <span>عربي</span>',
      ') : (',
      '  <span>Some English Branch</span>',
      ')}',
    ].join('\n')
    expect(scanSource(F, src)).toHaveLength(0)
  })
})

describe('i18n guard — whole codebase', () => {
  const { files, unlisted, realViolations } = runScan(process.cwd())

  it('scans a meaningful number of .tsx files', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('has ZERO hardcoded-English UI strings (no file allowlist needed)', () => {
    if (realViolations.length > 0) {
      const detail = realViolations
        .slice(0, 40)
        .map((v: { file: string; line: number; value: string }) => `  ${v.file}:${v.line}  "${v.value}"`)
        .join('\n')
      throw new Error(
        `Found ${realViolations.length} hardcoded-English UI string(s) in ${unlisted.length} file(s). ` +
        `Localize them with useLocale()/t()/tk()/pickLabel.\n${detail}`,
      )
    }
    expect(realViolations).toEqual([])
  })
})
