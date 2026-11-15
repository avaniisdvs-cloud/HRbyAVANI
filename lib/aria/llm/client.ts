/**
 * Provider dispatcher — the single AI entry point for ARIA.
 *
 * Business code calls getLlmClient(config) and receives a provider-neutral
 * LlmAdapter. It never knows which provider is active. Adding a provider =
 * register one factory here + ship one adapter file. No business-logic change.
 */
import type { LlmAdapter, LlmAdapterConfig, LlmGenerateParams, LlmResult } from './types'
import { LlmError } from './errors'
import type { LlmErrorKind } from './errors'
import { createAnthropicAdapter } from './adapters/anthropic'
import { createOpenAiAdapter } from './adapters/openai'

type AdapterFactory = (config: LlmAdapterConfig) => LlmAdapter

/**
 * Provider registry. Future providers (deepseek, gemini, mistral, internal)
 * are added here as one line each once their adapter exists.
 */
const ADAPTER_REGISTRY: Record<string, AdapterFactory> = {
  anthropic:    (c) => createAnthropicAdapter(c),
  openai:       (c) => createOpenAiAdapter(c, 'openai'),
  azure_openai: (c) => createOpenAiAdapter(c, 'azure_openai'),
}

export function getLlmClient(config: LlmAdapterConfig): LlmAdapter {
  const factory = ADAPTER_REGISTRY[config.provider]
  if (!factory) {
    throw new LlmError(
      'not_configured',
      `No LLM adapter registered for provider '${config.provider}'`,
      { provider: config.provider },
    )
  }
  return factory(config)
}

/** Providers with a registered adapter (for admin UI / validation). */
export function supportedProviders(): string[] {
  return Object.keys(ADAPTER_REGISTRY)
}

// ── Runtime failover ─────────────────────────────────────────────────────────
// Error kinds that indicate a provider-availability problem worth retrying on a
// different provider. bad_request is excluded — it is a deterministic request
// problem the fallback would also reject.
const FAILOVER_KINDS: LlmErrorKind[] = ['connection', 'rate_limit', 'timeout', 'not_configured', 'unknown']

export interface ResilientLlmConfig {
  provider:            string
  modelId:             string
  apiKey:              string | null
  apiEndpoint?:        string | null
  fallbackProvider?:   string | null
  fallbackModelId?:    string | null
  fallbackApiKey?:     string | null
  fallbackApiEndpoint?: string | null
}

/**
 * Build a provider-neutral adapter that tries the primary provider and, on a
 * failover-eligible LlmError, retries ONCE on the configured fallback provider
 * (using the fallback model id). Both providers failing surfaces the fallback
 * error. The returned modelId is the primary model the caller passes through.
 *
 * This is where stored fallback config (ariaModelConfig.fallback*) becomes
 * actual runtime failover. Business code calls .generate() and is unaware.
 */
export function getResilientLlmClient(cfg: ResilientLlmConfig): { adapter: LlmAdapter; modelId: string } {
  const primary = getLlmClient({ provider: cfg.provider, apiKey: cfg.apiKey, apiEndpoint: cfg.apiEndpoint })
  const hasFallback = !!(cfg.fallbackProvider && cfg.fallbackModelId)

  const adapter: LlmAdapter = {
    provider: cfg.provider,
    async generate(params: LlmGenerateParams): Promise<LlmResult> {
      try {
        return await primary.generate(params)
      } catch (err) {
        const e = err instanceof LlmError ? err : null
        if (!hasFallback || !e || !FAILOVER_KINDS.includes(e.kind)) throw err

        let fallback: LlmAdapter
        try {
          fallback = getLlmClient({
            provider:    cfg.fallbackProvider!,
            apiKey:      cfg.fallbackApiKey ?? null,
            apiEndpoint: cfg.fallbackApiEndpoint ?? null,
          })
        } catch {
          throw err // no adapter registered for the fallback provider → surface original
        }

        // Telemetry (no secrets): record the failover activation.
        console.error(`[ARIA] LLM failover: primary '${cfg.provider}' failed (${e.kind}); retrying on fallback '${cfg.fallbackProvider}'`)
        const result = await fallback.generate({ ...params, model: cfg.fallbackModelId! })
        console.error(`[ARIA] LLM failover: fallback '${cfg.fallbackProvider}' model '${cfg.fallbackModelId}' succeeded (fallbackUsed=true)`)
        return result
      }
    },
  }
  return { adapter, modelId: cfg.modelId }
}
