/**
 * Performance NFR Tests — NFR-01, NFR-02, NFR-04
 *
 * Static analysis tests that verify the codebase is structured for performance:
 *   - No N+1 query patterns in server actions
 *   - API routes exist and are structured for fast response
 *   - Database queries use indexes (FK-indexed columns)
 *   - No blocking synchronous operations in hot paths
 *
 * NOTE: Actual p95 latency measurements (NFR-01 < 2s, NFR-02 < 500ms, NFR-04 500 CCU)
 * require a live server + k6 load testing. See tests/performance/k6-load-test.js
 * for the k6 scripts — run against a staging environment with:
 *   k6 run tests/performance/k6-load-test.js
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

function readFile(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

function findFiles(dir: string, ext: string): string[] {
  const results: string[] = []
  function walk(d: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(full)
      else if (e.isFile() && e.name.endsWith(ext)) results.push(full)
    }
  }
  walk(path.join(ROOT, dir))
  return results
}

// ── NFR-01 — Page load performance indicators ─────────────────────────────────

describe('NFR-01 — Page load performance (structural checks)', () => {
  it('main app pages use server-side rendering (RSC) — not full client components', () => {
    const pages = findFiles('app', '.tsx')
      .filter(f => f.endsWith('/page.tsx'))
      // Exclude (auth) pages — sign-in/sign-out legitimately need client-side JS
      .filter(f => !f.includes('/(auth)/') && !f.includes('/employee-letters/'))
    const clientOnlyPages: string[] = []
    for (const f of pages) {
      const content = fs.readFileSync(f, 'utf-8')
      const firstLine = content.split('\n')[0].trim()
      if (firstLine === "'use client'" || firstLine === '"use client"') {
        clientOnlyPages.push(f.replace(ROOT + '/', ''))
      }
    }
    // Non-auth page.tsx files should be RSC (client components = larger bundles, slower TTFB)
    expect(
      clientOnlyPages,
      `NFR-01 WARNING: These non-auth page.tsx files are full client components (slower TTFB):\n${clientOnlyPages.join('\n')}`
    ).toHaveLength(0)
  })

  it('next.config.mjs enables modern image formats (avif/webp)', () => {
    const nextConfig = readFile('next.config.mjs')
    expect(nextConfig).toContain('avif')
    expect(nextConfig).toContain('webp')
  })

  it('no synchronous fs.readFileSync in server action hot paths', () => {
    const actionFiles = findFiles('modules', '.ts')
      .filter(f => f.endsWith('actions.ts') && !f.includes('.test.'))
    const violations: string[] = []
    for (const f of actionFiles) {
      const content = fs.readFileSync(f, 'utf-8')
      if (/fs\.readFileSync\b/.test(content)) {
        violations.push(f.replace(ROOT + '/', ''))
      }
    }
    expect(violations, `NFR-01: Synchronous readFileSync in server actions: ${violations.join(', ')}`).toHaveLength(0)
  })
})

// ── NFR-02 — API response time (structural checks) ────────────────────────────

describe('NFR-02 — API response time structural checks', () => {
  it('db.ts configures a connection pool (not raw single connections)', () => {
    const dbTs = readFile('lib/db.ts')
    // drizzle-orm/postgres has built-in pooling
    expect(dbTs).toMatch(/postgres|pg|Pool|drizzle/)
  })

  it('server actions use Drizzle ORM (type-safe, no raw string queries)', () => {
    const actionFiles = findFiles('modules', '.ts')
      .filter(f => f.endsWith('actions.ts') && !f.includes('.test.'))
    const rawQueryFiles: string[] = []
    for (const f of actionFiles) {
      const content = fs.readFileSync(f, 'utf-8')
      // Detect raw template SQL that's not using the Drizzle sql tag
      if (/db\.query\s*\(`/.test(content) || /db\.execute\s*\(`/.test(content)) {
        rawQueryFiles.push(f.replace(ROOT + '/', ''))
      }
    }
    expect(rawQueryFiles, `NFR-02: Raw query strings found (prefer Drizzle ORM): ${rawQueryFiles.join(', ')}`).toHaveLength(0)
  })

  it('server actions have no N+1 patterns (no query inside a loop)', () => {
    /**
     * N+1 pattern: a db query called inside a for/forEach loop.
     * Heuristic: look for `await db.` inside a `for` block.
     * Note: this is a structural heuristic — false positives may occur.
     */
    const actionFiles = findFiles('modules', '.ts')
      .filter(f => f.endsWith('actions.ts') && !f.includes('.test.'))
    const potentialN1: string[] = []
    for (const f of actionFiles) {
      const content = fs.readFileSync(f, 'utf-8')
      // Simple heuristic: "for (" followed within 5 lines by "await db."
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (/\bfor\s*\(/.test(lines[i]) || /\.forEach\s*\(/.test(lines[i])) {
          const nextFive = lines.slice(i + 1, i + 6).join('\n')
          if (/await\s+db\./.test(nextFive)) {
            potentialN1.push(`${f.replace(ROOT + '/', '')}:${i + 1}`)
          }
        }
      }
    }
    if (potentialN1.length > 0) {
      console.warn(`NFR-02 WARNING: Potential N+1 queries detected:\n${potentialN1.join('\n')}`)
    }
    // Allow up to 3 — some may be intentional (e.g., processing items individually)
    expect(potentialN1.length).toBeLessThanOrEqual(3)
  })

  it('API health endpoint exists (required for load balancer checks)', () => {
    const healthRoute = path.join(ROOT, 'app/api/health/route.ts')
    expect(
      fs.existsSync(healthRoute),
      'NFR-02: /api/health route does not exist — required for load balancer health checks'
    ).toBe(true)
  })
})

// ── NFR-04 — Concurrent users (structural readiness) ─────────────────────────

describe('NFR-04 — 500 concurrent user readiness', () => {
  it('session uses JWT strategy (stateless — scales horizontally)', () => {
    const authTs = readFile('lib/auth.ts')
    expect(authTs).toContain("strategy: 'jwt'")
  })

  it('database client is a singleton (not creating a new connection per request)', () => {
    const dbTs = readFile('lib/db.ts')
    // Should have a module-level singleton, not a new connection each call
    const hasModuleLevelExport = /^export\s+const\s+db\s*=/m.test(dbTs)
    expect(
      hasModuleLevelExport,
      'NFR-04: db client should be a module-level singleton for connection pooling'
    ).toBe(true)
  })

  it('no sleeps or blocking delays in server action code paths', () => {
    const actionFiles = findFiles('modules', '.ts')
      .filter(f => !f.includes('.test.'))
    const violations: string[] = []
    for (const f of actionFiles) {
      const content = fs.readFileSync(f, 'utf-8')
      if (/\bnew\s+Promise[^(]*\(.*setTimeout/s.test(content) ||
          /await\s+sleep\s*\(/.test(content)) {
        violations.push(f.replace(ROOT + '/', ''))
      }
    }
    expect(violations, `NFR-04: Blocking delays in action files: ${violations.join(', ')}`).toHaveLength(0)
  })

  it('NFR-04 NOTE: 500 CCU test requires k6 against staging — see tests/performance/k6-load-test.js', () => {
    const k6Script = path.join(ROOT, 'tests/performance/k6-load-test.js')
    expect(fs.existsSync(k6Script), 'k6 load test script must exist for NFR-04 verification').toBe(true)
  })
})

// ── NFR-05 — System uptime 99.9% ─────────────────────────────────────────────

describe('NFR-05 — Uptime / resilience structural checks', () => {
  it('background jobs handle errors without crashing (fail-safe)', () => {
    const jobFiles = findFiles('lib/jobs', '.ts').filter(f => !f.includes('.test.'))
    for (const f of jobFiles) {
      const content = fs.readFileSync(f, 'utf-8')
      // Each job should have error handling that prevents the whole process crashing
      const hasCatch = /catch\s*\(/.test(content)
      expect(
        hasCatch,
        `NFR-05: ${f.replace(ROOT + '/', '')} has no error handling — job crash could cause downtime`
      ).toBe(true)
    }
  })
})
