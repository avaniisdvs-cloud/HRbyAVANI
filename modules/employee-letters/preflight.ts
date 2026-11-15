/**
 * Pre-generation preflight validation for employee letter templates.
 *
 * Extracts all {{token}} placeholders from both EN and AR template bodies,
 * resolves each one using the RESOLVERS map, and flags:
 *   - NO_RESOLVER   — token is not in RESOLVERS (no DB mapping)
 *   - EMPTY_REQUIRED — token resolves to '' for a field marked as required
 */
import { RESOLVERS, type ResolverContext } from './resolvers'

const TOKEN_RE = /\{\{([a-z_]+)\}\}/g

/**
 * Tokens that are hard-blocked when empty (NO_RESOLVER or EMPTY_REQUIRED).
 *
 * current_job_title / job_title are intentionally excluded: for DCL/PML an
 * employee may be receiving their first formal designation, so it is valid
 * for the current title to be blank.
 *
 * Arabic variants (_ar) are excluded — Arabic data is always optional.
 */
const REQUIRED_TOKENS = new Set([
  'employee_name',
  'employee_number',
  'company_name',
  'effective_date',
  'new_job_title',
])

export type PreflightIssueType = 'NO_RESOLVER' | 'EMPTY_REQUIRED'

export interface PreflightIssue {
  token:   string
  labelEn: string
  issue:   PreflightIssueType
}

export interface PreflightResult {
  valid:    boolean
  issues:   PreflightIssue[]
  snapshot: Record<string, string>
}

function extractTokens(bodyEn: string, bodyAr: string): string[] {
  const tokens = new Set<string>()
  for (const m of bodyEn.matchAll(TOKEN_RE)) tokens.add(m[1])
  for (const m of bodyAr.matchAll(TOKEN_RE)) tokens.add(m[1])
  return Array.from(tokens)
}

function humanLabel(token: string): string {
  return token.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export async function preflightCheck(
  templateBodyEn: string,
  templateBodyAr: string,
  ctx: ResolverContext,
): Promise<PreflightResult> {
  const tokens = extractTokens(templateBodyEn, templateBodyAr)
  const issues: PreflightIssue[] = []
  const snapshot: Record<string, string> = {}

  await Promise.all(tokens.map(async token => {
    const fn = RESOLVERS[token]
    if (!fn) {
      issues.push({ token, labelEn: humanLabel(token), issue: 'NO_RESOLVER' })
      snapshot[token] = `{{${token}}}`
      return
    }
    const value = await fn(ctx)
    snapshot[token] = value
    if (!value && REQUIRED_TOKENS.has(token)) {
      issues.push({ token, labelEn: humanLabel(token), issue: 'EMPTY_REQUIRED' })
    }
  }))

  return {
    valid:    issues.length === 0,
    issues,
    snapshot,
  }
}
