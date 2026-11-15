'use server'

import { db } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'
import { requireRole } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { uploadDocument } from '@/lib/blob-storage'
import { translateError } from '@/lib/app-error'
import { revalidatePath } from 'next/cache'
import {
  ariaAgentConfig,
  ariaModelConfig,
  ariaBehaviourConfig,
  ariaKnowledgeSources,
} from '@/drizzle/schema/configuration'
import { getLlmClient } from '@/lib/aria/llm'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

// ── Input schemas ──────────────────────────────────────────────────────────

const AgentIdentitySchema = z.object({
  agentName:  z.string().min(1).max(100),
  agentRole:  z.string().min(1).max(100),
  agentTone:  z.enum(['professional', 'friendly', 'analytical', 'executive', 'strict']),
  avatarUrl:  z.string().optional().nullable(),
  isActive:   z.boolean(),
})

const ModelConfigSchema = z.object({
  provider:        z.string().min(1).max(50),
  modelId:         z.string().min(1).max(100),
  apiKey:          z.string().optional(),
  apiEndpoint:     z.string().optional().nullable(),
  temperature:     z.number().min(0).max(1),
  maxTokens:       z.number().int().min(100).max(8192),
  fallbackProvider:   z.string().optional().nullable(),
  fallbackModelId:    z.string().optional().nullable(),
  fallbackApiKey:     z.string().optional().nullable(),
})

const AriaBrandingSchema = z.object({
  agentNameAr:   z.string().max(100).optional().nullable(),
  welcomeText:   z.string().max(1000).optional().nullable(),
  welcomeTextAr: z.string().max(1000).optional().nullable(),
  footerLabel:   z.string().max(200).optional().nullable(),
  footerLabelAr: z.string().max(200).optional().nullable(),
  accentColor:   z.string().max(20).regex(/^(#[0-9a-fA-F]{3,6})?$/, 'Must be a hex colour or empty').optional().nullable(),
})

const BehaviourConfigSchema = z.object({
  systemPromptOverride:       z.string().optional().nullable(),
  promptMode:                 z.enum(['prepend', 'replace', 'append']).optional(),
  authorityLevel:             z.enum(['advisory', 'recommend_approve', 'full_execution']).optional(),
  enabledDataSources:         z.array(z.string()).optional(),
  ragEnabled:                 z.boolean().optional(),
  ragMaxChunks:               z.number().int().min(1).max(20).optional(),
  anomalyDetection:           z.boolean().optional(),
  predictiveInsights:         z.boolean().optional(),
  slaMonitoring:              z.boolean().optional(),
  conversationRetentionDays:  z.number().int().min(1).max(365).optional(),
  contextDepthMessages:       z.number().int().min(1).max(100).optional(),
  personalizationEnabled:     z.boolean().optional(),
})

// ── Types ──────────────────────────────────────────────────────────────────

export type UpdateAgentIdentityInput   = z.infer<typeof AgentIdentitySchema>
export type UpdateModelConfigInput     = z.infer<typeof ModelConfigSchema>
export type UpdateBehaviourConfigInput = z.infer<typeof BehaviourConfigSchema>
export type UpdateAriaBrandingInput    = z.infer<typeof AriaBrandingSchema>

// ── getAriaConfig ──────────────────────────────────────────────────────────

export async function getAriaConfig(): Promise<{
  agent:            Record<string, unknown> | null
  model:            Record<string, unknown> | null
  behaviour:        Record<string, unknown> | null
  knowledgeSources: Record<string, unknown>[]
}> {
  try {
  await requireRole(['SUPER_ADMIN'])

  const [agentRows, modelRows, behaviourRows, ksRows] = await Promise.all([
    db.select().from(ariaAgentConfig).limit(1),
    db.select().from(ariaModelConfig).limit(1),
    db.select().from(ariaBehaviourConfig).limit(1),
    db.select().from(ariaKnowledgeSources).where(eq(ariaKnowledgeSources.isActive, true)).limit(200),
  ])

  const model = modelRows[0]
  let maskedModel: Record<string, unknown> | null = null

  if (model) {
    const { apiKeyEncrypted, fallbackApiKeyEncrypted, ...rest } = model

    let apiKeyMasked: string | null = null
    if (apiKeyEncrypted) {
      try {
        const plain = decrypt(apiKeyEncrypted)
        apiKeyMasked = '••••' + plain.slice(-4)
      } catch {
        apiKeyMasked = '••••'
      }
    }

    maskedModel = { ...rest, apiKeyMasked }
  }

  return {
    agent:            agentRows[0]     ? { ...agentRows[0] }     : null,
    model:            maskedModel,
    behaviour:        behaviourRows[0] ? { ...behaviourRows[0] } : null,
    knowledgeSources: ksRows.map(r => ({ ...r })),
  }
  } catch (e) { translateError(e, 'getAriaConfig') }
}

// ── updateAgentIdentity ───────────────────────────────────────────────────

export async function updateAgentIdentity(input: UpdateAgentIdentityInput): Promise<void> {
  try {
  const user = await requireRole(['SUPER_ADMIN'])
  const parsed = AgentIdentitySchema.parse(input)

  const existing = await db.select().from(ariaAgentConfig).limit(1)
  const prev = existing[0]

  await db.transaction(async tx => {
    if (prev) {
      await tx.update(ariaAgentConfig).set({
        agentName: parsed.agentName,
        agentRole: parsed.agentRole,
        agentTone: parsed.agentTone,
        isActive:  parsed.isActive,
        ...(parsed.avatarUrl != null && { avatarUrl: parsed.avatarUrl }),
        updatedBy:       user.id,
        updatedByName:   user.name,
        lastUpdatedDate: new Date(),
      }).where(eq(ariaAgentConfig.id, prev.id))
    } else {
      await tx.insert(ariaAgentConfig).values({
        agentName: parsed.agentName,
        agentRole: parsed.agentRole,
        agentTone: parsed.agentTone,
        isActive:  parsed.isActive,
        avatarUrl: parsed.avatarUrl ?? undefined,
        createdBy:     user.id,
        createdByName: user.name,
      })
    }

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    'ARIA.CONFIG.AGENT_UPDATED',
      resourceType: 'ARIA_AGENT_CONFIG',
      resourceId:   prev?.id,
      oldValues:    prev ? { agentName: prev.agentName, agentRole: prev.agentRole, agentTone: prev.agentTone, isActive: prev.isActive } : undefined,
      newValues:    parsed,
    }, tx)
  })
  } catch (e) { translateError(e, 'updateAgentIdentity') }
}

// ── updateModelConfig ─────────────────────────────────────────────────────

export async function updateModelConfig(input: UpdateModelConfigInput): Promise<void> {
  try {
  const user = await requireRole(['SUPER_ADMIN'])
  const parsed = ModelConfigSchema.parse(input)

  const apiKeyEncrypted         = (parsed.apiKey && !parsed.apiKey.startsWith('••••'))
    ? encrypt(parsed.apiKey) : undefined
  const fallbackApiKeyEncrypted = (parsed.fallbackApiKey && !parsed.fallbackApiKey.startsWith('••••'))
    ? encrypt(parsed.fallbackApiKey) : undefined

  const existing = await db.select().from(ariaModelConfig).limit(1)
  const prev = existing[0]

  await db.transaction(async tx => {
    if (prev) {
      await tx.update(ariaModelConfig).set({
        provider:    parsed.provider,
        modelId:     parsed.modelId,
        temperature: String(parsed.temperature),
        maxTokens:   parsed.maxTokens,
        ...(apiKeyEncrypted         !== undefined && { apiKeyEncrypted }),
        ...(parsed.apiEndpoint      !== undefined && { apiEndpoint: parsed.apiEndpoint }),
        ...(parsed.fallbackProvider !== undefined && { fallbackProvider: parsed.fallbackProvider }),
        ...(parsed.fallbackModelId  !== undefined && { fallbackModelId: parsed.fallbackModelId }),
        ...(fallbackApiKeyEncrypted !== undefined && { fallbackApiKeyEncrypted }),
        updatedBy:       user.id,
        updatedByName:   user.name,
        lastUpdatedDate: new Date(),
      }).where(eq(ariaModelConfig.id, prev.id))
    } else {
      await tx.insert(ariaModelConfig).values({
        provider:    parsed.provider,
        modelId:     parsed.modelId,
        temperature: String(parsed.temperature),
        maxTokens:   parsed.maxTokens,
        apiKeyEncrypted,
        apiEndpoint:            parsed.apiEndpoint ?? undefined,
        fallbackProvider:       parsed.fallbackProvider ?? undefined,
        fallbackModelId:        parsed.fallbackModelId ?? undefined,
        fallbackApiKeyEncrypted,
        createdBy:     user.id,
        createdByName: user.name,
      })
    }

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    'ARIA.CONFIG.MODEL_UPDATED',
      resourceType: 'ARIA_MODEL_CONFIG',
      resourceId:   prev?.id,
      oldValues:    prev ? { provider: prev.provider, modelId: prev.modelId, temperature: prev.temperature, maxTokens: prev.maxTokens } : undefined,
      newValues:    { provider: parsed.provider, modelId: parsed.modelId, temperature: parsed.temperature, maxTokens: parsed.maxTokens },
    }, tx)
  })
  // Invalidate the settings page so the server re-reads the saved config — the
  // Connection Test tab renders provider/model from that server data.
  revalidatePath('/settings/ai-agent')
  } catch (e) { translateError(e, 'updateModelConfig') }
}

// ── updateBehaviourConfig ─────────────────────────────────────────────────

export async function updateBehaviourConfig(input: UpdateBehaviourConfigInput): Promise<void> {
  try {
  const user = await requireRole(['SUPER_ADMIN'])
  const parsed = BehaviourConfigSchema.parse(input)

  const existing = await db.select().from(ariaBehaviourConfig).limit(1)
  const prev = existing[0]

  await db.transaction(async tx => {
    if (prev) {
      await tx.update(ariaBehaviourConfig).set({
        ...parsed,
        updatedBy:       user.id,
        updatedByName:   user.name,
        lastUpdatedDate: new Date(),
      }).where(eq(ariaBehaviourConfig.id, prev.id))
    } else {
      await tx.insert(ariaBehaviourConfig).values({
        ...parsed,
        createdBy:     user.id,
        createdByName: user.name,
      })
    }

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    'ARIA.CONFIG.BEHAVIOUR_UPDATED',
      resourceType: 'ARIA_BEHAVIOUR_CONFIG',
      resourceId:   prev?.id,
      oldValues:    prev ? { promptMode: prev.promptMode, authorityLevel: prev.authorityLevel, enabledDataSources: prev.enabledDataSources, ragEnabled: prev.ragEnabled } : undefined,
      newValues:    parsed,
    }, tx)
  })
  } catch (e) { translateError(e, 'updateBehaviourConfig') }
}

// ── uploadKnowledgeSource ─────────────────────────────────────────────────

export async function uploadKnowledgeSource(formData: FormData): Promise<{
  id: string
  sourceName: string
  vectorStatus: string
}> {
  try {
  const user = await requireRole(['SUPER_ADMIN'])

  const file = formData.get('file') as File | null
  if (!file) throw new Error('No file provided')

  const ALLOWED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Only PDF, DOCX, and TXT files are allowed')

  const MAX_BYTES = 25 * 1024 * 1024
  if (file.size > MAX_BYTES) throw new Error('File exceeds 25 MB limit')

  const uploaded = await uploadDocument({
    personId: 'aria-knowledge',
    file,
    fileName: file.name,
    mimeType: file.type,
  })

  let result: { id: string; sourceName: string; vectorStatus: string } | undefined

  await db.transaction(async tx => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'file'
    const sourceType = ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : 'text'

    const [row] = await tx.insert(ariaKnowledgeSources).values({
      sourceName:    file.name,
      sourceType,
      storageKey:    uploaded.storageKey,
      fileSizeBytes: file.size,
      mimeType:      file.type,
      vectorStatus:  'pending',
      isActive:      true,
      createdBy:     user.id,
      createdByName: user.name,
    }).returning()

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    'ARIA.KNOWLEDGE.UPLOADED',
      resourceType: 'ARIA_KNOWLEDGE_SOURCE',
      resourceId:   row.id,
      newValues:    { sourceName: file.name, sourceType, storageKey: uploaded.storageKey },
    }, tx)

    result = { id: row.id, sourceName: row.sourceName, vectorStatus: row.vectorStatus }
  })

  return result!
  } catch (e) { translateError(e, 'uploadKnowledgeSource') }
}

// ── deleteKnowledgeSource ─────────────────────────────────────────────────

export async function deleteKnowledgeSource(id: string): Promise<void> {
  try {
  const user = await requireRole(['SUPER_ADMIN'])

  await db.transaction(async tx => {
    await tx.update(ariaKnowledgeSources).set({
      isActive:        false,
      updatedBy:       user.id,
      updatedByName:   user.name,
      lastUpdatedDate: new Date(),
    }).where(eq(ariaKnowledgeSources.id, id))

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    'ARIA.KNOWLEDGE.DELETED',
      resourceType: 'ARIA_KNOWLEDGE_SOURCE',
      resourceId:   id,
    }, tx)
  })
  } catch (e) { translateError(e, 'deleteKnowledgeSource') }
}

// ── updateAriaBranding ────────────────────────────────────────────────────

export async function updateAriaBranding(input: UpdateAriaBrandingInput): Promise<void> {
  try {
  const user   = await requireRole(['SUPER_ADMIN'])
  const parsed = AriaBrandingSchema.parse(input)

  const existing = await db.select().from(ariaAgentConfig).limit(1)
  const prev     = existing[0]

  await db.transaction(async tx => {
    if (prev) {
      await tx.update(ariaAgentConfig).set({
        agentNameAr:   parsed.agentNameAr   ?? undefined,
        welcomeText:   parsed.welcomeText   ?? undefined,
        welcomeTextAr: parsed.welcomeTextAr ?? undefined,
        footerLabel:   parsed.footerLabel   ?? undefined,
        footerLabelAr: parsed.footerLabelAr ?? undefined,
        accentColor:   parsed.accentColor   ?? undefined,
        updatedBy:       user.id,
        updatedByName:   user.name,
        lastUpdatedDate: new Date(),
      }).where(eq(ariaAgentConfig.id, prev.id))
    } else {
      await tx.insert(ariaAgentConfig).values({
        agentName:     'ARIA',
        agentRole:     'HR Intelligence Assistant',
        agentTone:     'professional',
        agentNameAr:   parsed.agentNameAr   ?? undefined,
        welcomeText:   parsed.welcomeText   ?? undefined,
        welcomeTextAr: parsed.welcomeTextAr ?? undefined,
        footerLabel:   parsed.footerLabel   ?? undefined,
        footerLabelAr: parsed.footerLabelAr ?? undefined,
        accentColor:   parsed.accentColor   ?? undefined,
        createdBy:     user.id,
        createdByName: user.name,
      })
    }

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    'ARIA.CONFIG.BRANDING_UPDATED',
      resourceType: 'ARIA_AGENT_CONFIG',
      resourceId:   prev?.id,
      oldValues:    prev ? {
        agentNameAr:   prev.agentNameAr,
        welcomeText:   prev.welcomeText,
        footerLabel:   prev.footerLabel,
        accentColor:   prev.accentColor,
      } : undefined,
      newValues: parsed,
    }, tx)
  })
  } catch (e) { translateError(e, 'updateAriaBranding') }
}

// ── testAriaConnection ────────────────────────────────────────────────────

export async function testAriaConnection(): Promise<{
  success: boolean
  latencyMs: number
  error?: string
}> {
  try {
  await requireRole(['SUPER_ADMIN'])

  const modelRows = await db.select().from(ariaModelConfig).limit(1)
  const model = modelRows[0]

  let apiKey: string | undefined
  if (model?.apiKeyEncrypted) {
    try {
      apiKey = decrypt(model.apiKeyEncrypted)
    } catch {
      return { success: false, latencyMs: 0, error: 'Failed to decrypt API key' }
    }
  } else {
    apiKey = process.env.ARIA_API_KEY ?? process.env.ANTHROPIC_API_KEY
  }

  if (!apiKey) return { success: false, latencyMs: 0, error: 'No API key configured' }

  const modelId  = model?.modelId  ?? 'claude-sonnet-4-6'
  const provider = model?.provider ?? 'anthropic'

  // Endpoint validation (defense in depth — UI validates too):
  // Azure OpenAI requires an endpoint; any provided endpoint must be https.
  const endpoint = model?.apiEndpoint ?? null
  if (provider === 'azure_openai' && !endpoint) {
    return { success: false, latencyMs: 0, error: 'Azure OpenAI requires an API Endpoint.' }
  }
  if (endpoint) {
    try {
      if (new URL(endpoint).protocol !== 'https:') {
        return { success: false, latencyMs: 0, error: 'API Endpoint must use https://.' }
      }
    } catch {
      return { success: false, latencyMs: 0, error: 'API Endpoint is not a valid URL.' }
    }
  }

  const start = Date.now()

  try {
    // Dispatch on the CONFIGURED provider so the test validates the right vendor.
    const adapter = getLlmClient({ provider, apiKey, apiEndpoint: model?.apiEndpoint ?? null })
    await adapter.generate({
      model:     modelId,
      maxTokens: 10,
      messages:  [{ role: 'user', content: 'Respond with: OK' }],
    })
    return { success: true, latencyMs: Date.now() - start }
  } catch (err) {
    return {
      success:   false,
      latencyMs: Date.now() - start,
      error:     err instanceof Error ? err.message : 'Unknown error',
    }
  }
  } catch (e) { translateError(e, 'testAriaConnection') }
}
