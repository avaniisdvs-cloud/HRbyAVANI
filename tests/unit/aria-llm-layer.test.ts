// @vitest-environment node
/**
 * ARIA provider-independence layer tests.
 *
 * Verifies the single AI entry point (lib/aria/llm): provider dispatch,
 * neutral error taxonomy, and the SDK-free OpenAI adapter, without calling any
 * real provider.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getLlmClient, supportedProviders, getResilientLlmClient, LlmError } from '@/lib/aria/llm'

describe('getLlmClient — provider dispatch', () => {
  it('returns an anthropic adapter for provider=anthropic', () => {
    const a = getLlmClient({ provider: 'anthropic', apiKey: 'k' })
    expect(a.provider).toBe('anthropic')
  })

  it('returns an openai adapter for provider=openai', () => {
    const a = getLlmClient({ provider: 'openai', apiKey: 'k' })
    expect(a.provider).toBe('openai')
  })

  it('returns an azure adapter for provider=azure_openai', () => {
    const a = getLlmClient({ provider: 'azure_openai', apiKey: 'k', apiEndpoint: 'https://x.openai.azure.com' })
    expect(a.provider).toBe('azure_openai')
  })

  it('throws LlmError(not_configured) for an unknown provider', () => {
    expect(() => getLlmClient({ provider: 'deepseek', apiKey: 'k' })).toThrowError(LlmError)
    try { getLlmClient({ provider: 'mystery', apiKey: 'k' }) }
    catch (e) { expect((e as LlmError).kind).toBe('not_configured') }
  })

  it('exposes the supported provider list', () => {
    expect(supportedProviders()).toEqual(expect.arrayContaining(['anthropic', 'openai', 'azure_openai']))
  })
})

describe('OpenAI adapter (fetch-based)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('posts to chat/completions with a Bearer header and returns text + usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const adapter = getLlmClient({ provider: 'openai', apiKey: 'sk-test' })
    const res = await adapter.generate({ model: 'gpt-4.1', maxTokens: 50, system: 'sys', messages: [{ role: 'user', content: 'hi' }] })

    expect(res.text).toBe('hello')
    expect(res.usage).toEqual({ promptTokens: 7, completionTokens: 3 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    // system prompt is mapped into the messages array
    const body = JSON.parse(init.body)
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' })
    expect(body.model).toBe('gpt-4.1')
  })

  it('maps HTTP 429 to LlmError(rate_limit) with retryAfterSec', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 429,
      headers: { get: (k: string) => (k === 'retry-after' ? '42' : null) },
      text: async () => 'rate limited',
    }))
    const adapter = getLlmClient({ provider: 'openai', apiKey: 'sk' })
    await expect(adapter.generate({ model: 'gpt-4.1', maxTokens: 10, messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toMatchObject({ kind: 'rate_limit', retryAfterSec: 42 })
  })

  it('maps HTTP 401 to LlmError(auth)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, headers: { get: () => null }, text: async () => 'unauthorized',
    }))
    const adapter = getLlmClient({ provider: 'openai', apiKey: 'bad' })
    await expect(adapter.generate({ model: 'gpt-4.1', maxTokens: 10, messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toMatchObject({ kind: 'auth' })
  })

  it('throws LlmError(not_configured) when no API key', async () => {
    const adapter = getLlmClient({ provider: 'openai', apiKey: null })
    await expect(adapter.generate({ model: 'gpt-4.1', maxTokens: 10, messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toMatchObject({ kind: 'not_configured' })
  })

  it('never leaks the API key into the error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, headers: { get: () => null }, text: async () => 'bad request',
    }))
    const adapter = getLlmClient({ provider: 'openai', apiKey: 'sk-SECRET-123' })
    try {
      await adapter.generate({ model: 'gpt-4.1', maxTokens: 10, messages: [{ role: 'user', content: 'x' }] })
    } catch (e) {
      expect((e as Error).message).not.toContain('sk-SECRET-123')
    }
  })
})

describe('Azure OpenAI adapter (endpoint + api-version configurable)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  function ok(text: string) {
    return { ok: true, json: async () => ({ choices: [{ message: { content: text } }], usage: {} }) }
  }

  it('builds the Foundry URL with deployment + default api-version + api-key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok('hi'))
    vi.stubGlobal('fetch', fetchMock)

    const adapter = getLlmClient({
      provider: 'azure_openai',
      apiKey: 'azkey',
      apiEndpoint: 'https://hals-mke7bram-eastus2.services.ai.azure.com',
    })
    await adapter.generate({ model: 'gpt-4.1', maxTokens: 10, messages: [{ role: 'user', content: 'x' }] })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://hals-mke7bram-eastus2.services.ai.azure.com/openai/deployments/gpt-4.1/chat/completions?api-version=2024-10-21')
    expect((init.headers as Record<string, string>)['api-key']).toBe('azkey')
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('honors an api-version override appended to the endpoint (no schema change)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok('hi'))
    vi.stubGlobal('fetch', fetchMock)

    const adapter = getLlmClient({
      provider: 'azure_openai',
      apiKey: 'azkey',
      apiEndpoint: 'https://hals-mke7bram-eastus2.services.ai.azure.com/?api-version=2025-04-01-preview',
    })
    await adapter.generate({ model: 'gpt-4.1', maxTokens: 10, messages: [{ role: 'user', content: 'x' }] })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('https://hals-mke7bram-eastus2.services.ai.azure.com/openai/deployments/gpt-4.1/chat/completions?api-version=2025-04-01-preview')
  })

  it('throws not_configured when Azure endpoint is missing', async () => {
    const adapter = getLlmClient({ provider: 'azure_openai', apiKey: 'k', apiEndpoint: null })
    await expect(adapter.generate({ model: 'gpt-4.1', maxTokens: 10, messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toMatchObject({ kind: 'not_configured' })
  })
})

describe('OpenAI/Azure-v1 token field — max_completion_tokens with auto-fallback', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const ok = (text: string) => ({ ok: true, json: async () => ({ choices: [{ message: { content: text } }], usage: {} }) })

  it('sends max_completion_tokens by default (modern OpenAI / Azure v1)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok('hi'))
    vi.stubGlobal('fetch', fetchMock)
    const adapter = getLlmClient({ provider: 'openai', apiKey: 'sk' })
    await adapter.generate({ model: 'gpt-4.1', maxTokens: 50, messages: [{ role: 'user', content: 'x' }] })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.max_completion_tokens).toBe(50)
    expect(body.max_tokens).toBeUndefined()
  })

  it('auto-falls back to max_tokens when the provider rejects max_completion_tokens', async () => {
    const reject400 = {
      ok: false, status: 400, headers: { get: () => null },
      text: async () => 'Unsupported parameter: max_completion_tokens',
      clone() { return { text: async () => 'Unsupported parameter: max_completion_tokens' } },
    }
    const fetchMock = vi.fn().mockResolvedValueOnce(reject400).mockResolvedValueOnce(ok('hi'))
    vi.stubGlobal('fetch', fetchMock)
    const adapter = getLlmClient({ provider: 'openai', apiKey: 'sk' })
    const res = await adapter.generate({ model: 'gpt-4.1', maxTokens: 50, messages: [{ role: 'user', content: 'x' }] })
    expect(res.text).toBe('hi')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(body2.max_tokens).toBe(50)
    expect(body2.max_completion_tokens).toBeUndefined()
  })

  it('does NOT retry on an unrelated 400', async () => {
    const reject400 = {
      ok: false, status: 400, headers: { get: () => null },
      text: async () => 'invalid model',
      clone() { return { text: async () => 'invalid model' } },
    }
    const fetchMock = vi.fn().mockResolvedValue(reject400)
    vi.stubGlobal('fetch', fetchMock)
    const adapter = getLlmClient({ provider: 'openai', apiKey: 'sk' })
    await expect(adapter.generate({ model: 'gpt-4.1', maxTokens: 50, messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toMatchObject({ kind: 'bad_request' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('OpenAI provider against an Azure host — auth scheme', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const ok = (text: string) => ({ ok: true, json: async () => ({ choices: [{ message: { content: text } }], usage: {} }) })
  const unauth = () => ({ ok: false, status: 401, headers: { get: () => null }, text: async () => '401', clone() { return { text: async () => '401' } } })

  it('uses the api-key header first for an Azure host (the v1 fix)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok('hi'))
    vi.stubGlobal('fetch', fetchMock)
    const adapter = getLlmClient({ provider: 'openai', apiKey: 'azkey', apiEndpoint: 'https://hals-mke7bram-eastus2.services.ai.azure.com/openai/v1' })
    await adapter.generate({ model: 'gpt-4.1', maxTokens: 10, messages: [{ role: 'user', content: 'x' }] })
    const h = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(h['api-key']).toBe('azkey')
    expect(h.Authorization).toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe('https://hals-mke7bram-eastus2.services.ai.azure.com/openai/v1/chat/completions')
  })

  it('falls back to Bearer on 401 (Azure host: api-key → bearer)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(unauth()).mockResolvedValueOnce(ok('hi'))
    vi.stubGlobal('fetch', fetchMock)
    const adapter = getLlmClient({ provider: 'openai', apiKey: 'tok', apiEndpoint: 'https://r.openai.azure.com/openai/v1' })
    const res = await adapter.generate({ model: 'gpt-4.1', maxTokens: 10, messages: [{ role: 'user', content: 'x' }] })
    expect(res.text).toBe('hi')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)['api-key']).toBe('tok')
    expect((fetchMock.mock.calls[1][1].headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('public OpenAI host uses Bearer first', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok('hi'))
    vi.stubGlobal('fetch', fetchMock)
    const adapter = getLlmClient({ provider: 'openai', apiKey: 'sk' })
    await adapter.generate({ model: 'gpt-4.1', maxTokens: 10, messages: [{ role: 'user', content: 'x' }] })
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe('Bearer sk')
  })
})

describe('Runtime failover (getResilientLlmClient)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  function okResponse(text: string) {
    return { ok: true, json: async () => ({ choices: [{ message: { content: text } }], usage: {} }) }
  }
  function errResponse(status: number) {
    return { ok: false, status, headers: { get: () => null }, text: async () => 'err' }
  }

  it('fails over to the fallback provider on an availability error (503 → unknown)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errResponse(503))      // primary fails
      .mockResolvedValueOnce(okResponse('from-fallback')) // fallback succeeds
    vi.stubGlobal('fetch', fetchMock)

    const { adapter, modelId } = getResilientLlmClient({
      provider: 'openai', modelId: 'gpt-4.1', apiKey: 'sk-primary',
      fallbackProvider: 'openai', fallbackModelId: 'gpt-4.1-mini', fallbackApiKey: 'sk-fallback',
    })
    const res = await adapter.generate({ model: modelId, maxTokens: 10, messages: [{ role: 'user', content: 'x' }] })

    expect(res.text).toBe('from-fallback')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Second (fallback) call used the fallback model id
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(body2.model).toBe('gpt-4.1-mini')
  })

  it('does NOT fail over on bad_request (400) — surfaces the error, one call only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(400))
    vi.stubGlobal('fetch', fetchMock)

    const { adapter, modelId } = getResilientLlmClient({
      provider: 'openai', modelId: 'gpt-4.1', apiKey: 'sk',
      fallbackProvider: 'openai', fallbackModelId: 'gpt-4.1-mini', fallbackApiKey: 'sk2',
    })
    await expect(adapter.generate({ model: modelId, maxTokens: 10, messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toMatchObject({ kind: 'bad_request' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('with no fallback configured, the primary error propagates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(503))
    vi.stubGlobal('fetch', fetchMock)

    const { adapter, modelId } = getResilientLlmClient({ provider: 'openai', modelId: 'gpt-4.1', apiKey: 'sk' })
    await expect(adapter.generate({ model: modelId, maxTokens: 10, messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toBeInstanceOf(LlmError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
