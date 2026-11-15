/**
 * Template engine for employee letters.
 *
 * resolveTemplate() takes a body string with {{token}} placeholders,
 * resolves each token via RESOLVERS, and returns the filled string.
 * Unknown tokens are left as-is (no silent drop).
 */
import { RESOLVERS, type ResolverContext } from './resolvers'

const TOKEN_RE = /\{\{([a-z_]+)\}\}/g

/**
 * Resolve all {{tokens}} in `body` for the given context.
 * Returns both the resolved string and the token→value snapshot.
 */
export async function resolveTemplate(
  body:    string,
  context: ResolverContext,
): Promise<{ resolved: string; snapshot: Record<string, string> }> {
  const keys = [...new Set(Array.from(body.matchAll(TOKEN_RE), m => m[1]))]

  // Resolve all tokens in parallel
  const values = await Promise.all(
    keys.map(async key => {
      const fn = RESOLVERS[key]
      if (!fn) return [key, `{{${key}}}`] as const  // leave unknown tokens
      const val = await fn(context)
      return [key, val] as const
    })
  )

  const snapshot = Object.fromEntries(values)
  const resolved = body.replace(TOKEN_RE, (_, key) => snapshot[key] ?? `{{${key}}}`)

  return { resolved, snapshot }
}

/**
 * Resolve both EN and AR bodies in one call (shared context, parallel).
 */
export async function resolveTemplateBilingual(
  bodyEn:  string,
  bodyAr:  string,
  context: ResolverContext,
): Promise<{
  resolvedEn: string
  resolvedAr: string
  snapshot:   Record<string, string>
}> {
  const [en, ar] = await Promise.all([
    resolveTemplate(bodyEn, context),
    resolveTemplate(bodyAr, context),
  ])

  const snapshot = { ...en.snapshot, ...ar.snapshot }
  return { resolvedEn: en.resolved, resolvedAr: ar.resolved, snapshot }
}
