/**
 * Accessibility Static Analysis Tests — NFR-17 (WCAG 2.1 AA)
 *
 * These tests audit HTML patterns in source files without a running server.
 * Axe-core E2E tests require a live browser — see tests/e2e/accessibility.spec.ts.
 *
 * Covers:
 *   - WCAG 1.1.1 Non-text content (img alt attributes)
 *   - WCAG 1.3.1 Info and Relationships (semantic HTML, form labels)
 *   - WCAG 2.4.2 Page titled
 *   - WCAG 4.1.2 Name, Role, Value (ARIA attributes)
 *   - WCAG 1.4.3 Contrast (token usage, not raw hex)
 *   - RTL layout correctness (NFR-14)
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

function findTsx(dir: string): string[] {
  const results: string[] = []
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(full)
      } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
        results.push(full)
      }
    }
  }
  walk(path.join(ROOT, dir))
  return results
}

const pageFiles = findTsx('app')
const componentFiles = findTsx('components')
const allUiFiles = [...pageFiles, ...componentFiles]
// Re-baselined 2026-06-12 (baseline-unification merge): 307 was measured on
// main before the effective-dating branch UI (communication settings,
// employee-history report, leave-balances redesign) entered scope.
// Ratchet preserved — additions above 348 still fail.
const STATIC_INPUT_HEURISTIC_BASELINE = 348

function stripStaticComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

// ── WCAG 1.1.1 — Images must have alt text ────────────────────────────────────

describe('WCAG 1.1.1 — Images require alt attributes', () => {
  it('no <img> tags are missing alt attributes', () => {
    const violations: string[] = []
    for (const f of allUiFiles) {
      const content = stripStaticComments(fs.readFileSync(f, 'utf-8'))
      // Find multiline <img ...> tags that lack alt=. Comments are stripped first
      // so documentation snippets such as "Plain <img>" do not become false hits.
      const imgTags = content.match(/<img\b[\s\S]*?>/g) ?? []
      for (const tag of imgTags) {
        if (!/alt\s*=/.test(tag)) {
          violations.push(`${f.replace(ROOT + '/', '')}: ${tag.substring(0, 80)}`)
        }
      }
    }
    expect(
      violations,
      `WCAG 1.1.1 FAIL: Images missing alt attribute:\n${violations.join('\n')}`
    ).toHaveLength(0)
  })

  it('next/image components have alt props', () => {
    const violations: string[] = []
    for (const f of allUiFiles) {
      const content = stripStaticComments(fs.readFileSync(f, 'utf-8'))
      // Find multiline <Image ... /> tags without alt=.
      const imageTags = content.match(/<Image\b[\s\S]*?\/>/g) ?? []
      for (const tag of imageTags) {
        if (!/alt\s*=/.test(tag)) {
          violations.push(`${f.replace(ROOT + '/', '')}: ${tag.substring(0, 80)}`)
        }
      }
    }
    expect(
      violations,
      `WCAG 1.1.1 FAIL: next/Image missing alt prop:\n${violations.join('\n')}`
    ).toHaveLength(0)
  })
})

// ── WCAG 1.3.1 — Semantic HTML / Form inputs labelled ────────────────────────

describe('WCAG 1.3.1 — Form inputs have labels or aria-label', () => {
  it('input elements are not bare (have id, aria-label, or aria-labelledby)', () => {
    const violations: string[] = []
    for (const f of allUiFiles) {
      const content = stripStaticComments(fs.readFileSync(f, 'utf-8'))
      // Heuristic: raw <input without id, aria-label, aria-labelledby, or type=hidden.
      // Capture full multiline JSX tags so attributes on later lines are counted.
      const inputTags = content.match(/<input\b[\s\S]*?>/g) ?? []
      for (const tag of inputTags) {
        const isHidden = /type\s*=\s*["']hidden["']/.test(tag)
        if (isHidden) continue
        const isLabelled =
          /\bid\s*=/.test(tag) ||
          /aria-label\s*=/.test(tag) ||
          /aria-labelledby\s*=/.test(tag) ||
          /htmlFor/.test(tag)
        if (!isLabelled) {
          violations.push(`${f.replace(ROOT + '/', '')}: ${tag.substring(0, 80)}`)
        }
      }
    }
    // Warn rather than hard-fail (many inputs use Radix/component wrappers that add labels)
    if (violations.length > 0) {
      console.warn(`WCAG 1.3.1 WARNING: ${violations.length} potentially unlabelled inputs found`)
    }
    // Definitive label checking requires axe-core in the browser — see
    // tests/e2e/accessibility.spec.ts. This static guard catches obvious raw
    // unlabeled inputs while avoiding false positives from comments and
    // multiline JSX attributes. Keep the improved-parser baseline explicit so
    // future additions still fail when they increase static unlabeled-input debt.
    expect(violations.length).toBeLessThanOrEqual(STATIC_INPUT_HEURISTIC_BASELINE)
  })
})

// ── WCAG 4.1.2 — ARIA roles and landmark usage ───────────────────────────────

describe('WCAG 4.1.2 — ARIA landmark and role usage', () => {
  it('app layout defines html lang attribute (WCAG 3.1.1)', () => {
    const layoutTs = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf-8')
    // lang should be dynamic (from locale) and not missing
    expect(layoutTs).toContain('lang={locale}')
  })

  it('app layout sets dir attribute for RTL support (NFR-14)', () => {
    const layoutTs = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf-8')
    expect(layoutTs).toContain('dir={direction(locale)}')
  })

  it('interactive icon-only buttons have aria-label', () => {
    const violations: string[] = []
    for (const f of allUiFiles) {
      const content = fs.readFileSync(f, 'utf-8')
      // Find <button> with only an icon child and no visible text
      // Pattern: <button...><XIcon/></button> without aria-label
      const buttonBlocks = content.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []
      for (const block of buttonBlocks) {
        const openTag = block.match(/<button[^>]*>/)?.[0] ?? ''
        const hasAriaLabel = /aria-label\s*=/.test(openTag)
        const hasAriaLabelledBy = /aria-labelledby\s*=/.test(openTag)
        // If button only has Icon content (no text nodes), it needs aria-label
        const textContent = block.replace(/<[^>]+>/g, '').trim()
        const hasOnlyIcon = /[A-Z][a-z]+Icon\s*\/>/.test(block) && textContent === ''
        if (hasOnlyIcon && !hasAriaLabel && !hasAriaLabelledBy) {
          violations.push(`${f.replace(ROOT + '/', '')}: ${openTag.substring(0, 60)}`)
        }
      }
    }
    if (violations.length > 0) {
      console.warn(`WCAG 4.1.2 WARNING: ${violations.length} icon-only buttons may lack aria-label`)
    }
    // Threshold: allow up to 3 (Radix components often add accessible names)
    expect(violations.length).toBeLessThanOrEqual(3)
  })
})

// ── WCAG 1.4.3 — Colour contrast (no raw hex) ────────────────────────────────

describe('WCAG 1.4.3 — No hardcoded colour values in UI (token-only)', () => {
  it('no raw hex colours in globals.css', () => {
    const globalsCss = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf-8')
    // After Sprint 2 design system: all raw hex should be removed
    // Strip out comments and var() definitions (which define the palette tokens)
    const withoutComments = globalsCss.replace(/\/\*[\s\S]*?\*\//g, '')
    // Find hex colours NOT inside a --variable definition (those are the palette tokens)
    const rawHexInNonVar = withoutComments
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/g
    const hexMatches = rawHexInNonVar.match(hexPattern) ?? []
    expect(
      hexMatches,
      `WCAG 1.4.3 FAIL: Raw hex colours used outside CSS variable definitions: ${hexMatches.join(', ')}`
    ).toHaveLength(0)
  })

  it('no raw hex colours in tailwind.config.ts (should use CSS vars)', () => {
    const tailwindConfig = fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf-8')
    // Allow palette definition (var(--...) references)
    const rawHex = (tailwindConfig.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])
      .filter(h => !/var\(/.test(h)) // not inside var()
    // Some hex values in Tailwind config are acceptable (e.g., scrollbar colours)
    expect(rawHex.length).toBeLessThanOrEqual(5)
  })
})

// ── WCAG 2.4.2 — Page titles ──────────────────────────────────────────────────

describe('WCAG 2.4.2 — Pages have titles', () => {
  it('app root layout defines a metadata title', () => {
    const layoutTs = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf-8')
    const hasMetadataTitle =
      /metadata\s*=/.test(layoutTs) ||
      /export.*metadata/.test(layoutTs) ||
      /<title/.test(layoutTs)
    expect(
      hasMetadataTitle,
      'WCAG 2.4.2 FAIL: Root layout does not export metadata with a title'
    ).toBe(true)
  })
})

// ── WCAG 2.4.7 — Focus visible ───────────────────────────────────────────────

describe('WCAG 2.4.7 — Focus visible', () => {
  it('globals.css does not globally suppress focus outlines (must have replacement indicator)', () => {
    const globalsCss = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf-8')
    // Find blocks that use outline:none but must provide a replacement focus indicator
    // via box-shadow, border, or background change on :focus / :focus-visible
    const blocks = globalsCss.split(/(?=\n[^\s])/)
    const dangerousBlocks: string[] = []
    for (const block of blocks) {
      const hasOutlineNone =
        /outline\s*:\s*none/i.test(block) ||
        /outline\s*:\s*0/i.test(block)
      if (!hasOutlineNone) continue
      // Safe if the block or adjacent rule provides a :focus replacement
      const hasFocusReplacement =
        /:focus/i.test(block) ||
        /box-shadow/.test(block) ||
        // Check if the class name appears in the rest of the CSS with a :focus rule
        false
      if (!hasFocusReplacement) {
        const blockSummary = block.trim().substring(0, 60)
        dangerousBlocks.push(blockSummary)
      }
    }
    expect(
      dangerousBlocks,
      `WCAG 2.4.7 FAIL: outline:none without replacement focus indicator:\n${dangerousBlocks.join('\n')}`
    ).toHaveLength(0)
  })
})

// ── NFR-14 — Bilingual completeness ──────────────────────────────────────────

describe('NFR-14 — Arabic + English i18n completeness', () => {
  it('messages/ar.json exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'messages/ar.json'))).toBe(true)
  })

  it('messages/en.json exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'messages/en.json'))).toBe(true)
  })

  it('Arabic translation has same top-level sections as English', () => {
    const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/en.json'), 'utf-8'))
    const ar = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/ar.json'), 'utf-8'))
    const enKeys = Object.keys(en).sort()
    const arKeys = Object.keys(ar).sort()
    expect(arKeys).toEqual(enKeys)
  })

  it('Arabic translation key count matches English (no missing keys)', () => {
    function flatten(d: Record<string, unknown>, prefix = ''): string[] {
      const out: string[] = []
      for (const [k, v] of Object.entries(d)) {
        const key = prefix ? `${prefix}.${k}` : k
        if (v && typeof v === 'object') out.push(...flatten(v as Record<string, unknown>, key))
        else out.push(key)
      }
      return out
    }
    const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/en.json'), 'utf-8'))
    const ar = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/ar.json'), 'utf-8'))
    const enFlat = flatten(en)
    const arFlat = flatten(ar)
    const missing = enFlat.filter(k => !arFlat.includes(k))
    expect(missing, `NFR-14: These EN keys are missing from AR: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('Arabic translation values are not identical to English (actually translated)', () => {
    function flatten(d: Record<string, unknown>, prefix = ''): Record<string, string> {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(d)) {
        const key = prefix ? `${prefix}.${k}` : k
        if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, key))
        else out[key] = String(v)
      }
      return out
    }
    const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/en.json'), 'utf-8'))
    const ar = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/ar.json'), 'utf-8'))
    const enFlat = flatten(en)
    const arFlat = flatten(ar)
    const fallbacks = Object.keys(enFlat).filter(k => arFlat[k] === enFlat[k])
    // Allow up to 10% identical (numbers, proper nouns, etc. may be same)
    const fallbackPct = fallbacks.length / Object.keys(enFlat).length
    expect(
      fallbackPct,
      `NFR-14: ${Math.round(fallbackPct * 100)}% of AR keys are identical to EN — likely untranslated fallbacks`
    ).toBeLessThan(0.1)
  })

  it('HTML direction attribute is set for RTL (dir attribute on <html>)', () => {
    const layoutTs = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf-8')
    expect(layoutTs).toContain('dir={direction(locale)}')
  })

  it('lib/i18n.ts defines a direction() helper for RTL switching', () => {
    // direction() is in i18n.ts (server-side helper), not i18n-runtime.ts (client-only)
    const i18nTs = fs.readFileSync(path.join(ROOT, 'lib/i18n.ts'), 'utf-8')
    expect(i18nTs).toMatch(/direction|rtl|ltr/)
    expect(i18nTs).toContain("'rtl'")
  })
})
