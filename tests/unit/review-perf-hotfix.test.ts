import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * P1 Hotfix — Approval Review performance — RPHF-001…006
 *
 * Root cause: getLeaveRecommendationForInstance synchronously generated the ARIA
 * recommendation (≈8 queries + a blocking Claude call) on the review render path,
 * causing a 1–2 minute open. Fix: render-path fetch is READ-ONLY; generation is
 * asynchronous only; missing recommendation → instant fallback UI.
 */
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const QUERIES = read('modules/aria/approval-queries.ts')
const PAGE = read('app/(hr-admin)/approvals/[instanceId]/page.tsx')
const CARD = read('components/aria/AriaRecommendationCard.tsx')

describe('Read-only recommendation fetch (RPHF-001…004)', () => {
  it('RPHF-001: getLeaveRecommendationForInstance no longer calls generateLeaveRecommendation', () => {
    const fn = QUERIES.slice(QUERIES.indexOf('export async function getLeaveRecommendationForInstance'))
    expect(fn).not.toContain('generateLeaveRecommendation')
  })
  it('RPHF-002: generateLeaveRecommendation is not imported on the render-path query module', () => {
    expect(QUERIES).not.toContain("from './leave-recommendation'")
  })
  it('RPHF-003: missing cached recommendation returns null (→ fallback), no generation', () => {
    expect(QUERIES).toContain('if (!row.ariaRecommendationJson) return null')
  })
  it('RPHF-004: card renders an instant fallback for null (no indefinite spinner)', () => {
    expect(CARD).toContain('ARIA recommendation is unavailable. Please review the request details manually.')
    expect(CARD).not.toContain('being generated')
  })
})

describe('Timing instrumentation + no sync AI on page (RPHF-005…006)', () => {
  it('RPHF-005: review page instruments server data-fetch timing', () => {
    expect(PAGE).toContain("import { startTimer, SLOW_PAGE_MS } from '@/lib/telemetry'")
    expect(PAGE).toContain('const _t = startTimer()')
    expect(PAGE).toContain("logger.info('approvals', 'review page data loaded'")
  })
  it('RPHF-006: page does not trigger synchronous AI generation', () => {
    expect(PAGE).not.toContain('generateLeaveRecommendation')
  })
})
