/**
 * ARIA Provider-Independence Layer — neutral contracts.
 *
 * Constitutional Rule 3: no business logic may depend on a vendor SDK.
 * These types are the ONLY shapes business code (modules/aria/*) may use to
 * talk to an LLM. Provider-specific types (Anthropic.MessageParam, OpenAI
 * ChatCompletion, etc.) MUST NOT escape an adapter file under ./adapters/.
 *
 * Every adapter implements LlmAdapter and throws ONLY LlmError (see errors.ts).
 */

export type LlmRole = 'user' | 'assistant'

export interface LlmMessage {
  role: LlmRole
  content: string
}

export interface LlmGenerateParams {
  /** Optional system prompt. Adapters map this to the provider's system slot. */
  system?: string
  messages: LlmMessage[]
  /** Provider-specific model id / deployment name — comes from configuration. */
  model: string
  maxTokens: number
  temperature?: number
  /** Hint: request structured JSON output where the provider supports it. */
  jsonMode?: boolean
}

export interface LlmUsage {
  promptTokens: number
  completionTokens: number
}

/** Provider-neutral result. Telemetry is emitted from this shape. */
export interface LlmResult {
  text: string
  provider: string
  model: string
  usage?: LlmUsage
}

/** Minimal config an adapter needs — derived from AriaRuntimeConfig. */
export interface LlmAdapterConfig {
  provider: string
  apiKey: string | null
  apiEndpoint?: string | null
}

/** The single contract every provider adapter implements. */
export interface LlmAdapter {
  readonly provider: string
  generate(params: LlmGenerateParams): Promise<LlmResult>
}
