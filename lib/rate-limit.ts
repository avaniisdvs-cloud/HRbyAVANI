/**
 * Application-level rate limiting — EPRC-01 B2 (closes RATE-01).
 *
 * Architecture note (no Redis — ADR-001 rejects it):
 *   This ships a fixed-window limiter backed by an in-memory store. It is
 *   effective for the current SINGLE-INSTANCE UAT deployment and is the first
 *   defensive layer on high-risk surfaces (auth, DataOps, documents, workflow
 *   tokens). The store is pluggable via RateLimitStore so that the Azure
 *   production environment can back it with a SHARED store (or front it with
 *   Azure API Management / WAF rate limiting) without touching call sites.
 *   On a multi-instance deployment the in-memory store limits per-instance only
 *   — see docs/enterprise-review-bundle/EPRC-01-* and the Production Runbook.
 *
 * Pure & dependency-free: safe to import anywhere (no db/env import chain).
 */

export interface RateLimitOptions {
  /** Max requests permitted within the window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  /** Epoch ms when the current window resets. */
  resetAt: number
  /** Seconds until reset — for the Retry-After header. */
  retryAfterSec: number
}

interface Bucket {
  count: number
  resetAt: number
}

/**
 * A self-contained fixed-window limiter. Each instance owns its own bucket map,
 * which makes it trivially testable (no shared global state).
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>()
  // Hard cap so a flood of distinct keys can't grow memory unbounded.
  private readonly maxKeys = 50_000

  constructor(private readonly now: () => number = () => Date.now()) {}

  check(key: string, opts: RateLimitOptions): RateLimitResult {
    const t = this.now()
    let b = this.buckets.get(key)

    if (!b || t >= b.resetAt) {
      b = { count: 0, resetAt: t + opts.windowMs }
      this.buckets.set(key, b)
    }

    b.count += 1
    const allowed = b.count <= opts.limit
    const remaining = Math.max(0, opts.limit - b.count)
    const retryAfterSec = Math.max(0, Math.ceil((b.resetAt - t) / 1000))

    if (this.buckets.size > this.maxKeys) this.prune(t)

    return { allowed, limit: opts.limit, remaining, resetAt: b.resetAt, retryAfterSec }
  }

  /** Drops expired buckets. Called opportunistically when the map grows large. */
  prune(at: number = this.now()): void {
    for (const [k, b] of this.buckets) {
      if (at >= b.resetAt) this.buckets.delete(k)
    }
  }

  reset(): void {
    this.buckets.clear()
  }
}

/** Process-wide default limiter (per serverless instance). */
const defaultLimiter = new RateLimiter()

/** Convenience: rate-limit against the process-wide default limiter. */
export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  return defaultLimiter.check(key, opts)
}

/** Test hook — clears the default limiter's state. */
export function __resetDefaultLimiter(): void {
  defaultLimiter.reset()
}

/** Sensible presets for the high-risk surfaces (per-window, per-identifier). */
export const RATE_LIMITS = {
  /** Login attempts — tight, per email+IP, to blunt credential brute-force. */
  AUTH:        { limit: 10,  windowMs: 60_000 },
  /** DataOps console — SUPER_ADMIN break-glass; cap burst SQL execution. */
  DATAOPS:     { limit: 60,  windowMs: 60_000 },
  /** Document download/read. */
  DOCUMENTS:   { limit: 120, windowMs: 60_000 },
  /** Tokenised workflow action links (email approvals). */
  WORKFLOW_TOKEN: { limit: 30, windowMs: 60_000 },
  /** ARIA chat / LLM calls — protect upstream spend. */
  ARIA:        { limit: 30,  windowMs: 60_000 },
} as const

/** Extracts a best-effort client IP from request headers. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return headers.get('x-real-ip') ?? 'unknown'
}

/** Builds a namespaced limiter key, e.g. "auth:1.2.3.4:user@x.com". */
export function rateLimitKey(scope: string, ...parts: (string | null | undefined)[]): string {
  return [scope, ...parts.map(p => p || 'unknown')].join(':')
}
