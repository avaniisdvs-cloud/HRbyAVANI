/**
 * ARIA LLM layer — provider-independent AI entry point.
 *
 * Import ONLY from here (not from ./adapters/*). This barrel is the single
 * surface business code uses to reach any LLM provider.
 */
export type {
  LlmAdapter,
  LlmAdapterConfig,
  LlmMessage,
  LlmGenerateParams,
  LlmResult,
  LlmUsage,
  LlmRole,
} from './types'
export { LlmError } from './errors'
export type { LlmErrorKind } from './errors'
export { getLlmClient, supportedProviders, getResilientLlmClient } from './client'
export type { ResilientLlmConfig } from './client'
