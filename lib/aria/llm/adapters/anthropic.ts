/**
 * Anthropic adapter. The ONLY file permitted to import @anthropic-ai/sdk.
 * Translates the neutral LlmAdapter contract to/from the Anthropic SDK.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { LlmAdapter, LlmAdapterConfig, LlmGenerateParams, LlmResult } from '../types'
import { LlmError, normalizeProviderError } from '../errors'

export function createAnthropicAdapter(config: LlmAdapterConfig): LlmAdapter {
  return {
    provider: 'anthropic',
    async generate(params: LlmGenerateParams): Promise<LlmResult> {
      if (!config.apiKey) {
        throw new LlmError('not_configured', 'Anthropic API key not configured', { provider: 'anthropic' })
      }
      const client = new Anthropic({
        apiKey: config.apiKey,
        ...(config.apiEndpoint ? { baseURL: config.apiEndpoint } : {}),
      })
      try {
        const resp = await client.messages.create({
          model:      params.model,
          max_tokens: params.maxTokens,
          ...(params.temperature != null ? { temperature: params.temperature } : {}),
          ...(params.system ? { system: params.system } : {}),
          messages:   params.messages.map(m => ({ role: m.role, content: m.content })),
        })
        const block = resp.content[0]
        const text = block?.type === 'text' ? block.text : ''
        return {
          text,
          provider: 'anthropic',
          model:    params.model,
          usage: {
            promptTokens:     resp.usage?.input_tokens  ?? 0,
            completionTokens: resp.usage?.output_tokens ?? 0,
          },
        }
      } catch (err) {
        throw normalizeProviderError(err, 'anthropic')
      }
    },
  }
}
