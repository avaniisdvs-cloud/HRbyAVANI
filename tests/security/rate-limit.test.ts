/**
 * EPRC-01 B2 — rate limiter (RATE-01 closure) unit tests.
 */
import { describe, it, expect } from 'vitest'
import { RateLimiter, clientIp, rateLimitKey } from '@/lib/rate-limit'

describe('RateLimiter — fixed window', () => {
  it('allows requests up to the limit, then blocks', () => {
    const rl = new RateLimiter(() => 1_000)
    const opts = { limit: 3, windowMs: 60_000 }
    expect(rl.check('k', opts).allowed).toBe(true)  // 1
    expect(rl.check('k', opts).allowed).toBe(true)  // 2
    const third = rl.check('k', opts)               // 3 (last allowed)
    expect(third.allowed).toBe(true)
    expect(third.remaining).toBe(0)
    expect(rl.check('k', opts).allowed).toBe(false) // 4 — blocked
  })

  it('isolates distinct identities (one key blocked does not block another)', () => {
    const rl = new RateLimiter(() => 0)
    const opts = { limit: 1, windowMs: 60_000 }
    expect(rl.check('ip:1.1.1.1', opts).allowed).toBe(true)
    expect(rl.check('ip:1.1.1.1', opts).allowed).toBe(false) // same key blocked
    expect(rl.check('ip:2.2.2.2', opts).allowed).toBe(true)  // different key unaffected
  })

  it('resets after the window elapses', () => {
    let now = 0
    const rl = new RateLimiter(() => now)
    const opts = { limit: 1, windowMs: 1_000 }
    expect(rl.check('k', opts).allowed).toBe(true)
    expect(rl.check('k', opts).allowed).toBe(false)
    now = 1_001 // window elapsed
    expect(rl.check('k', opts).allowed).toBe(true)
  })

  it('reports a sane Retry-After', () => {
    const rl = new RateLimiter(() => 0)
    const r = rl.check('k', { limit: 1, windowMs: 30_000 })
    expect(r.retryAfterSec).toBe(30)
  })

  it('prune() drops expired buckets', () => {
    let now = 0
    const rl = new RateLimiter(() => now)
    rl.check('k', { limit: 5, windowMs: 1_000 })
    now = 2_000
    rl.prune()
    // After prune the key is gone, so a fresh window starts clean.
    expect(rl.check('k', { limit: 1, windowMs: 1_000 }).remaining).toBe(0)
  })
})

describe('helpers', () => {
  it('clientIp prefers the first x-forwarded-for hop', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9')
    expect(clientIp(new Headers({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8')
    expect(clientIp(new Headers())).toBe('unknown')
  })

  it('rateLimitKey namespaces and tolerates nullish parts', () => {
    expect(rateLimitKey('auth', '1.2.3.4', 'a@b.com')).toBe('auth:1.2.3.4:a@b.com')
    expect(rateLimitKey('auth', null, undefined)).toBe('auth:unknown:unknown')
  })
})
