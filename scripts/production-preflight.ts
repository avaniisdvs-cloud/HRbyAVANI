#!/usr/bin/env tsx
/**
 * Production configuration preflight (executable deploy/CI gate).
 *
 * SAFE: pure config inspection — NO database connection, NO network, NO secrets'
 * values are read or printed (only presence/shape). Applies nothing.
 *
 *   pnpm prod:preflight            # validate current environment
 *
 * Behaviour:
 *   - Non-production env  → advisory only; exits 0 (never breaks local/dev).
 *   - Production env      → FAILS CLOSED: any error → exit 1 (blocks deploy).
 *
 * Production is detected when DATABASE_ENV=production, or
 * NODE_ENV=production && VERCEL_ENV=production (see lib/production-preflight.ts).
 *
 * Wraps the single source of truth: validateProductionConfig() in
 * lib/production-preflight.ts (also callable from a /health readiness endpoint).
 */
import { validateProductionConfig } from '../lib/production-preflight'

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
}

const result = validateProductionConfig(process.env)

console.log(`${C.bold}${C.cyan}═══ PRODUCTION PREFLIGHT (read-only; no DB, no network) ═══${C.reset}`)
console.log(`environment : ${result.environment === 'production' ? `${C.bold}production${C.reset}` : 'non-production'}`)
console.log(`DATABASE_ENV: ${process.env.DATABASE_ENV ?? '(unset)'}   VERCEL_ENV: ${process.env.VERCEL_ENV ?? '(unset)'}   NODE_ENV: ${process.env.NODE_ENV ?? '(unset)'}`)
console.log('')

if (result.errors.length) {
  console.log(`${C.bold}${C.red}FAIL (${result.errors.length})${C.reset}`)
  for (const e of result.errors) console.log(`  ${C.red}✗${C.reset} ${e}`)
  console.log('')
}
if (result.warnings.length) {
  console.log(`${C.bold}${C.yellow}WARN (${result.warnings.length})${C.reset}`)
  for (const w of result.warnings) console.log(`  ${C.yellow}⚠${C.reset} ${w}`)
  console.log('')
}
if (!result.errors.length && !result.warnings.length) {
  console.log(`${C.green}✓ PASS — no errors, no warnings${C.reset}\n`)
}

if (result.environment === 'production') {
  if (result.ok) {
    console.log(`${C.green}${C.bold}✓ PRODUCTION CONFIG PASS${C.reset} — critical controls satisfied (warnings, if any, are advisory).`)
    console.log(`${C.dim}Note: a passing config check is NOT production go-live approval. CAB/governance sign-off still required.${C.reset}`)
    process.exit(0)
  } else {
    console.log(`${C.red}${C.bold}✗ PRODUCTION CONFIG FAIL — deploy blocked (fail-closed).${C.reset}`)
    console.log(`${C.dim}Resolve the errors above before deploying. See docs/environment/PRODUCTION-SECURITY-CONFIG-CHECKLIST.md.${C.reset}`)
    process.exit(1)
  }
} else {
  console.log(`${C.dim}Non-production: advisory only. Set DATABASE_ENV=production to enforce production controls.${C.reset}`)
  process.exit(0)
}
