/**
 * ARIA Provider-Independence Layer — neutral error taxonomy.
 *
 * Business code catches ONLY LlmError and switches on `kind`. It must never
 * reference Anthropic.RateLimitError / OpenAI error classes — those are
 * normalised here, inside the layer.
 */

export type LlmErrorKind =
  | 'rate_limit'
  | 'connection'
  | 'auth'
  | 'bad_request'
  | 'not_configured'
  | 'timeout'
  | 'unknown'

export class LlmError extends Error {
  readonly kind: LlmErrorKind
  readonly provider: string
  readonly status?: number
  readonly retryAfterSec?: number

  constructor(
    kind: LlmErrorKind,
    message: string,
    opts: { provider: string; status?: number; retryAfterSec?: number; cause?: unknown } ,
  ) {
    super(message)
    this.name = 'LlmError'
    this.kind = kind
    this.provider = opts.provider
    this.status = opts.status
    this.retryAfterSec = opts.retryAfterSec
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause
  }
}

/** Map an HTTP status (REST adapters such as OpenAI/Azure) to a neutral kind. */
export function kindFromStatus(status: number): LlmErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (status === 408 || status === 504) return 'timeout'
  if (status >= 400 && status < 500) return 'bad_request'
  return 'unknown'
}

/**
 * Normalise an Anthropic SDK error into LlmError without leaking SDK types to
 * callers. Uses duck-typing on `status` / constructor name so the SDK import
 * stays inside the adapter.
 */
export function normalizeProviderError(err: unknown, provider: string): LlmError {
  if (err instanceof LlmError) return err

  const anyErr = err as { status?: number; name?: string; message?: string; headers?: { get?(k: string): string | null } } | undefined
  const message = anyErr?.message ?? 'LLM provider error'
  const status = typeof anyErr?.status === 'number' ? anyErr.status : undefined
  const name = anyErr?.name ?? ''

  // retry-after header (rate limits)
  const retryHeader = anyErr?.headers?.get?.('retry-after')
  const retryAfterSec = retryHeader ? (parseInt(retryHeader, 10) || undefined) : undefined

  let kind: LlmErrorKind = 'unknown'
  if (status != null) kind = kindFromStatus(status)
  else if (/RateLimit/i.test(name)) kind = 'rate_limit'
  else if (/Authentication/i.test(name)) kind = 'auth'
  else if (/Connection|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(name + message)) kind = 'connection'
  else if (/BadRequest|NotFound/i.test(name)) kind = 'bad_request'

  return new LlmError(kind, message, { provider, status, retryAfterSec, cause: err })
}
