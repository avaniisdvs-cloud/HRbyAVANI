/**
 * OpenAI / Azure OpenAI adapter.
 *
 * Implemented against the REST Chat Completions API via fetch() — deliberately
 * SDK-free so we add no vendor dependency and keep provider specifics fully
 * contained here. Supports provider 'openai' (api.openai.com) and
 * 'azure_openai' (apiEndpoint = the Azure resource base; model = deployment).
 */
import type { LlmAdapter, LlmAdapterConfig, LlmGenerateParams, LlmResult } from '../types'
import { LlmError, kindFromStatus } from '../errors'

const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1'
/** Default Azure OpenAI REST api-version (GA). Override per-config — see azureTarget(). */
export const AZURE_DEFAULT_API_VERSION = '2024-10-21'

/**
 * Resolve the Azure base URL + api-version from a configured endpoint.
 * api-version is configurable WITHOUT a schema change (Option B): a Super Admin
 * may append `?api-version=<ver>` to the endpoint to override the default.
 * Returns the cleaned base (origin + path, no query/trailing slash).
 */
export function azureTarget(endpoint: string): { base: string; apiVersion: string } {
  try {
    const u = new URL(endpoint)
    const override = u.searchParams.get('api-version')
    const base = `${u.origin}${u.pathname}`.replace(/\/+$/, '')
    return { base, apiVersion: override || AZURE_DEFAULT_API_VERSION }
  } catch {
    // Not a parseable URL — strip any query and trailing slash, use default version.
    return { base: endpoint.replace(/[?#].*$/, '').replace(/\/+$/, ''), apiVersion: AZURE_DEFAULT_API_VERSION }
  }
}

export function createOpenAiAdapter(
  config: LlmAdapterConfig,
  provider: 'openai' | 'azure_openai' = 'openai',
): LlmAdapter {
  const isAzure = provider === 'azure_openai'

  return {
    provider,
    async generate(params: LlmGenerateParams): Promise<LlmResult> {
      if (!config.apiKey) {
        throw new LlmError('not_configured', `${provider} API key not configured`, { provider })
      }
      if (isAzure && !config.apiEndpoint) {
        throw new LlmError('not_configured', 'Azure OpenAI requires an API endpoint', { provider })
      }

      const messages = [
        ...(params.system ? [{ role: 'system' as const, content: params.system }] : []),
        ...params.messages.map(m => ({ role: m.role, content: m.content })),
      ]

      // Request URL per surface.
      const url = isAzure
        ? (() => {
            const { base, apiVersion } = azureTarget(config.apiEndpoint!)
            return `${base}/openai/deployments/${encodeURIComponent(params.model)}/chat/completions?api-version=${apiVersion}`
          })()
        : `${(config.apiEndpoint || OPENAI_DEFAULT_BASE).replace(/\/+$/, '')}/chat/completions`

      // Auth scheme. Azure accepts the API key in the `api-key` header; public
      // OpenAI uses `Authorization: Bearer`. We pick the most likely scheme by
      // host and AUTO-FALL BACK to the other on a 401 — so an Azure key (api-key)
      // or an Entra token (Bearer) both work without the admin knowing which.
      function headersFor(scheme: 'api-key' | 'bearer'): Record<string, string> {
        return scheme === 'api-key'
          ? { 'Content-Type': 'application/json', 'api-key': config.apiKey! }
          : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` }
      }
      let host = ''
      try { host = new URL(config.apiEndpoint || OPENAI_DEFAULT_BASE).hostname } catch { /* ignore */ }
      const isAzureHost = isAzure || /\.azure\.com$/i.test(host)
      const authOrder: ('api-key' | 'bearer')[] = isAzureHost ? ['api-key', 'bearer'] : ['bearer', 'api-key']

      // Token field. Modern OpenAI / Azure v1 require `max_completion_tokens`;
      // some OpenAI-compatible vendors still require legacy `max_tokens`.
      const buildBody = (tokenField: 'max_completion_tokens' | 'max_tokens') => ({
        model:        params.model,
        [tokenField]: params.maxTokens,
        messages,
        ...(params.temperature != null ? { temperature: params.temperature } : {}),
        ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      })

      async function post(scheme: 'api-key' | 'bearer', tokenField: 'max_completion_tokens' | 'max_tokens'): Promise<Response> {
        try {
          return await fetch(url, { method: 'POST', headers: headersFor(scheme), body: JSON.stringify(buildBody(tokenField)) })
        } catch (err) {
          throw new LlmError('connection', `${provider} request failed`, { provider, cause: err })
        }
      }

      let usedAuth: 'api-key' | 'bearer' = authOrder[0]
      let resp: Response = await post(usedAuth, 'max_completion_tokens')

      // (a) 401 → retry once with the alternate auth scheme.
      if (resp.status === 401 && authOrder.length > 1) {
        usedAuth = authOrder[1]
        resp = await post(usedAuth, 'max_completion_tokens')
      }

      // (b) 400 referencing the token field → retry once with legacy max_tokens
      //     on the auth scheme currently in play.
      if (!resp.ok && resp.status === 400) {
        let detail = ''
        try { detail = (await resp.clone().text()) } catch { /* ignore */ }
        if (/max_tokens|max_completion_tokens|unsupported[_ ]?parameter|unknown[_ ]?field/i.test(detail)) {
          resp = await post(usedAuth, 'max_tokens')
        }
      }

      if (!resp.ok) {
        // Read body for server logs but NEVER include the API key; surface a
        // concise message only.
        let detail = ''
        try { detail = (await resp.text()).slice(0, 500) } catch { /* ignore */ }
        const retryHeader = resp.headers.get('retry-after')
        throw new LlmError(kindFromStatus(resp.status), `${provider} error ${resp.status}: ${detail}`, {
          provider,
          status: resp.status,
          retryAfterSec: retryHeader ? (parseInt(retryHeader, 10) || undefined) : undefined,
        })
      }

      const json = await resp.json() as {
        choices?: { message?: { content?: string } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const text = json.choices?.[0]?.message?.content ?? ''
      return {
        text,
        provider,
        model: params.model,
        usage: {
          promptTokens:     json.usage?.prompt_tokens     ?? 0,
          completionTokens: json.usage?.completion_tokens ?? 0,
        },
      }
    },
  }
}
