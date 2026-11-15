import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock heavy dependencies before dynamic imports
const mockTx = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      limit: vi.fn().mockResolvedValue([]),
    }),
  }),
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}))

vi.mock('@/lib/encryption', () => ({
  encrypt:          vi.fn((v: string) => `enc:${v}`),
  decrypt:          vi.fn((v: string) => v.replace('enc:', '')),
  decryptNullable:  vi.fn((v: string | null | undefined) => v ? v.replace('enc:', '') : null),
  encryptNullable:  vi.fn((v: string | null | undefined) => v ? `enc:${v}` : null),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

// next/cache revalidatePath only works inside a request context; mock it for unit tests.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn().mockResolvedValue({
    id:            'user-1',
    name:          'Test Admin',
    role:          'SUPER_ADMIN',
    email:         'admin@test.com',
    legalEntityId: '11111111-1111-1111-1111-111111111111',
  }),
  getCurrentUser: vi.fn().mockResolvedValue({
    id:   'user-1',
    name: 'Test Admin',
    role: 'SUPER_ADMIN',
  }),
}))

// Dynamic imports so mocks are in place when modules load
const { loadAriaRuntimeConfig }                       = await import('@/lib/aria/config-loader')
const { buildAriaSystemPrompt }                       = await import('@/lib/aria/system-prompt')
const { updateModelConfig, updateAgentIdentity, getAriaConfig } = await import('@/modules/aria')
const { encrypt }                                     = await import('@/lib/encryption')
const { requireRole }                                 = await import('@/lib/auth')
const { db }                                          = await import('@/lib/db')

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
      limit: vi.fn().mockResolvedValue([]),
    }),
  } as never)

  vi.mocked(requireRole).mockResolvedValue({
    id:            'user-1',
    name:          'Test Admin',
    role:          'SUPER_ADMIN',
    email:         'admin@test.com',
    legalEntityId: '11111111-1111-1111-1111-111111111111',
  } as never)
})

// ── loadAriaRuntimeConfig ──────────────────────────────────────────────────

describe('loadAriaRuntimeConfig', () => {
  it('returns defaults when no DB rows exist', async () => {
    const config = await loadAriaRuntimeConfig()
    expect(config.agentName).toBe('ARIA')
    expect(config.agentRole).toBe('HR Intelligence Assistant')
    expect(config.modelId).toBe('claude-sonnet-4-6')
    expect(config.authorityLevel).toBe('advisory')
    expect(config.ragEnabled).toBe(true)
  })
})

// ── updateModelConfig ──────────────────────────────────────────────────────

describe('updateModelConfig', () => {
  it('encrypts API key before storing', async () => {
    await updateModelConfig({
      provider:    'anthropic',
      modelId:     'claude-sonnet-4-6',
      apiKey:      'sk-ant-test-key-1234',
      temperature: 0.3,
      maxTokens:   1000,
    })
    expect(encrypt).toHaveBeenCalledWith('sk-ant-test-key-1234')
  })

  it('does NOT encrypt when no apiKey is provided', async () => {
    await updateModelConfig({
      provider:    'anthropic',
      modelId:     'claude-sonnet-4-6',
      temperature: 0.5,
      maxTokens:   1000,
    })
    expect(encrypt).not.toHaveBeenCalled()
  })

  it('rejects temperature > 1', async () => {
    await expect(
      updateModelConfig({
        provider:    'anthropic',
        modelId:     'claude-sonnet-4-6',
        temperature: 1.5,
        maxTokens:   1000,
      }),
    ).rejects.toThrow()
  })

  it('rejects temperature < 0', async () => {
    await expect(
      updateModelConfig({
        provider:    'anthropic',
        modelId:     'claude-sonnet-4-6',
        temperature: -0.1,
        maxTokens:   1000,
      }),
    ).rejects.toThrow()
  })

  it('rejects max_tokens > 8192', async () => {
    await expect(
      updateModelConfig({
        provider:    'anthropic',
        modelId:     'claude-sonnet-4-6',
        temperature: 0.3,
        maxTokens:   9000,
      }),
    ).rejects.toThrow()
  })
})

// ── getAriaConfig ──────────────────────────────────────────────────────────

describe('getAriaConfig', () => {
  it('never returns plaintext API key', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          limit:  vi.fn().mockResolvedValue([]),
          where:  vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      } as never)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id:                      'model-row-1',
            apiKeyEncrypted:         'enc:sk-ant-realkey',
            fallbackApiKeyEncrypted: null,
            provider:                'anthropic',
            modelId:                 'claude-sonnet-4-6',
            temperature:             '0.3',
            maxTokens:               1000,
          }]),
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      } as never)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      } as never)
      .mockReturnValueOnce({
        // knowledge sources — empty array via where().limit()
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
          limit: vi.fn().mockResolvedValue([]),
        }),
      } as never)

    const config = await getAriaConfig()
    const modelData = config.model as Record<string, unknown> | null
    expect(modelData?.apiKeyEncrypted).toBeUndefined()
  })
})

// ── buildAriaSystemPrompt ──────────────────────────────────────────────────

describe('buildAriaSystemPrompt', () => {
  const baseParams = {
    agentName:           'ARIA',
    agentRole:           'HR Intelligence Assistant',
    agentTone:           'professional' as const,
    override:            null,
    promptMode:          'prepend' as const,
    authorityLevel:      'advisory' as const,
    enabledDataSources:  ['hr', 'absence'],
  }

  it('injects agentName into the prompt', () => {
    const prompt = buildAriaSystemPrompt({ ...baseParams, agentName: 'Mr. K' })
    expect(prompt).toContain('Mr. K')
  })

  it('with promptMode=replace fully replaces default prompt body', () => {
    const override = 'Custom instructions only.'
    const prompt = buildAriaSystemPrompt({
      ...baseParams,
      promptMode: 'replace',
      override,
    })
    expect(prompt).toContain(override)
    expect(prompt).not.toContain('Adaptive Resource Intelligence Agent')
    expect(prompt.length).toBeLessThan(override.length + 500)
  })
})

// ── updateAgentIdentity ───────────────────────────────────────────────────

describe('updateAgentIdentity', () => {
  it('throws FORBIDDEN for non-SUPER_ADMIN role', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(
      new Error('FORBIDDEN: requires one of [SUPER_ADMIN], got HR_ADMIN'),
    )
    await expect(
      updateAgentIdentity({
        agentName: 'Test',
        agentRole: 'Test Role',
        agentTone: 'professional',
        isActive:  true,
      }),
    ).rejects.toThrow(/do not have permission/i)
  })
})
