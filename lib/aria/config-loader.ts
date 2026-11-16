import { getCompanyBranding } from '@/lib/company-branding'
import { db } from '@/lib/db'
import { decryptNullable } from '@/lib/encryption'
import {
  ariaAgentConfig,
  ariaModelConfig,
  ariaBehaviourConfig,
} from '@/drizzle/schema/configuration'
import { eq } from 'drizzle-orm'
import { buildAriaSystemPrompt } from './system-prompt'

// ── Types ──────────────────────────────────────────────────────────────────

export type AriaRuntimeConfig = {
  agentName: string
  agentRole: string
  agentTone: 'professional' | 'friendly' | 'analytical' | 'executive' | 'strict'
  provider: string
  modelId: string
  apiKey: string | null
  apiEndpoint: string | null
  temperature: number
  maxTokens: number
  fallbackProvider: string | null
  fallbackModelId: string | null
  fallbackApiKey: string | null
  authorityLevel: 'advisory' | 'recommend_approve' | 'full_execution'
  promptMode: 'prepend' | 'replace' | 'append'
  systemPromptOverride: string | null
  enabledDataSources: string[]
  ragEnabled: boolean
  ragMaxChunks: number
  anomalyDetection: boolean
  predictiveInsights: boolean
  slaMonitoring: boolean
  systemPrompt: string
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_AGENT_NAME   = 'ARIA'
const DEFAULT_AGENT_ROLE   = 'HR Intelligence Assistant'
const DEFAULT_AGENT_TONE   = 'professional' as const
const DEFAULT_MODEL_ID     = 'claude-sonnet-4-6'
const DEFAULT_PROVIDER     = 'anthropic'
const DEFAULT_TEMPERATURE  = 0.3
const DEFAULT_MAX_TOKENS   = 1000
const DEFAULT_AUTHORITY    = 'advisory' as const
const DEFAULT_PROMPT_MODE  = 'prepend' as const
const DEFAULT_DATA_SOURCES = ['hr', 'absence', 'compliance']

// ── Loader ─────────────────────────────────────────────────────────────────

export async function loadAriaRuntimeConfig(): Promise<AriaRuntimeConfig> {
  const [agentRows, modelRows, behaviourRows] = await Promise.all([
    db.select().from(ariaAgentConfig).where(eq(ariaAgentConfig.isActive, true)).limit(1),
    db.select().from(ariaModelConfig).where(eq(ariaModelConfig.isActive, true)).limit(1),
    db.select().from(ariaBehaviourConfig).where(eq(ariaBehaviourConfig.isActive, true)).limit(1),
  ])

  const agent     = agentRows[0]
  const model     = modelRows[0]
  const behaviour = behaviourRows[0]

  const agentName = agent?.agentName ?? DEFAULT_AGENT_NAME
  const agentRole = agent?.agentRole ?? DEFAULT_AGENT_ROLE
  const agentTone = (agent?.agentTone ?? DEFAULT_AGENT_TONE) as AriaRuntimeConfig['agentTone']

  const provider    = model?.provider ?? DEFAULT_PROVIDER
  const modelId     = model?.modelId  ?? DEFAULT_MODEL_ID
  const temperature = model?.temperature != null ? Number(model.temperature) : DEFAULT_TEMPERATURE
  const maxTokens   = model?.maxTokens  ?? DEFAULT_MAX_TOKENS

  // DB encrypted value takes priority; env var is the provider-aware fallback
  // for local dev / UAT. Provider can be switched with zero code change by
  // setting the matching env key + flipping the ariaModelConfig.provider row.
  const envKey = provider === 'openai' || provider === 'azure_openai'
    ? (process.env.OPENAI_API_KEY ?? process.env.AZURE_OPENAI_API_KEY ?? process.env.ARIA_API_KEY)
    : (process.env.ARIA_API_KEY ?? process.env.ANTHROPIC_API_KEY)
  const apiKey = decryptNullable(model?.apiKeyEncrypted) ?? envKey ?? null
  const fallbackApiKey = decryptNullable(model?.fallbackApiKeyEncrypted)

  const authorityLevel       = (behaviour?.authorityLevel ?? DEFAULT_AUTHORITY) as AriaRuntimeConfig['authorityLevel']
  const promptMode           = (behaviour?.promptMode     ?? DEFAULT_PROMPT_MODE) as AriaRuntimeConfig['promptMode']
  const systemPromptOverride = behaviour?.systemPromptOverride ?? null
  const enabledDataSources   = (behaviour?.enabledDataSources as string[]) ?? DEFAULT_DATA_SOURCES
  const ragEnabled           = behaviour?.ragEnabled        ?? true
  const ragMaxChunks         = behaviour?.ragMaxChunks       ?? 5
  const anomalyDetection     = behaviour?.anomalyDetection   ?? true
  const predictiveInsights   = behaviour?.predictiveInsights ?? false
  const slaMonitoring        = behaviour?.slaMonitoring      ?? true

  const systemPrompt = buildAriaSystemPrompt({
    companyBranding: await getCompanyBranding(),
    agentName,
    agentRole,
    agentTone,
    override: systemPromptOverride,
    promptMode,
    authorityLevel,
    enabledDataSources,
  })

  return {
    agentName,
    agentRole,
    agentTone,
    provider,
    modelId,
    apiKey,
    apiEndpoint:      model?.apiEndpoint ?? null,
    temperature,
    maxTokens,
    fallbackProvider: model?.fallbackProvider ?? null,
    fallbackModelId:  model?.fallbackModelId  ?? null,
    fallbackApiKey,
    authorityLevel,
    promptMode,
    systemPromptOverride,
    enabledDataSources,
    ragEnabled,
    ragMaxChunks,
    anomalyDetection,
    predictiveInsights,
    slaMonitoring,
    systemPrompt,
  }
}
