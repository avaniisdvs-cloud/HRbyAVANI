'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/components/providers/LocaleProvider'
import {
  updateAgentIdentity,
  updateAriaBranding,
  updateModelConfig,
  updateBehaviourConfig,
  uploadKnowledgeSource,
  deleteKnowledgeSource,
  testAriaConnection,
} from '@/modules/aria'

// ── Prop types matching getAriaConfig() return shape ──────────────────────

type Props = {
  config: {
    agent: Record<string, unknown> | null
    model: (Record<string, unknown> & { apiKeyMasked?: string; fallbackApiKeyMasked?: string }) | null
    behaviour: Record<string, unknown> | null
    knowledgeSources: Array<Record<string, unknown>>
  }
}

// ── Shared style tokens ────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '1.5rem',
  marginBottom: '1rem',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--ink-2)',
  marginBottom: '0.375rem',
  fontFamily: 'var(--font-sans)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  background: 'var(--bg)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.875rem',
  boxSizing: 'border-box',
}

const buttonStyle: React.CSSProperties = {
  padding: '0.5rem 1.5rem',
  background: 'var(--accent)',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.875rem',
  fontWeight: 600,
}

const fieldGroupStyle: React.CSSProperties = {
  marginBottom: '1rem',
}

const sectionHeadStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 700,
  color: 'var(--ink-1)',
  fontFamily: 'var(--font-sans)',
  marginBottom: '0.75rem',
}

function isValidUrl(url: string): boolean {
  try { new URL(url); return true } catch { return false }
}

function SaveStatus({ status }: { status: string }) {
  if (!status) return null
  return (
    <span style={{
      fontSize: '0.875rem',
      color: status.startsWith('Error') ? 'var(--status-rejected-fg)' : 'var(--status-approved-fg)',
    }}>
      {status}
    </span>
  )
}

// Providers with a registered runtime adapter in lib/aria/llm/ (selectable).
// Keep in sync with ADAPTER_REGISTRY in lib/aria/llm/client.ts.
const ENABLED_PROVIDERS = ['anthropic', 'openai', 'azure_openai']

// Default Azure OpenAI api-version (kept in sync with lib/aria/llm/adapters/openai.ts).
// Override per-config by appending `?api-version=YYYY-MM-DD` to the endpoint.
const AZURE_DEFAULT_API_VERSION = '2024-10-21'

function ProviderSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
      <option value="anthropic">Anthropic (Claude)</option>
      <option value="openai">OpenAI</option>
      <option value="azure_openai">Azure OpenAI</option>
      <option value="google" disabled>Google Gemini — Coming soon</option>
      <option value="deepseek" disabled>DeepSeek — Coming soon (self-hosted only)</option>
      <option value="mistral" disabled>Mistral — Coming soon</option>
    </select>
  )
}

// Provider-specific model catalogues. Azure uses deployment names (free text).
const MODELS_BY_PROVIDER: Record<string, string[]> = {
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
  openai:    ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
}

function defaultModelFor(provider: string): string {
  return MODELS_BY_PROVIDER[provider]?.[0] ?? ''
}

/**
 * Model selector that adapts to the provider:
 *  - known providers (anthropic/openai) → dropdown of catalogued models
 *  - azure_openai / unknown → free-text input for the deployment name / model id
 */
function ModelSelect({ provider, value, onChange }: { provider: string; value: string; onChange: (v: string) => void }) {
  const catalogue = MODELS_BY_PROVIDER[provider]
  if (!catalogue) {
    return (
      <input
        style={inputStyle}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={provider === 'azure_openai' ? 'deployment name (e.g. gpt-4.1)' : 'model id'}
      />
    )
  }
  return (
    <select style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
      {catalogue.map(m => <option key={m} value={m}>{m}</option>)}
    </select>
  )
}

// ── Tone descriptions ──────────────────────────────────────────────────────

const TONE_DESCRIPTIONS: Record<string, string> = {
  professional: 'Formal and precise language, suitable for executive-level reports and HR communications.',
  friendly:     'Warm and approachable tone, encouraging open dialogue with employees.',
  analytical:   'Data-driven and structured, emphasises metrics, trends, and evidence.',
  executive:    'Concise, high-level summaries focused on strategic insights and decisions.',
  strict:       'Direct and compliance-focused, enforcing policies without ambiguity.',
}

const TONE_DESCRIPTIONS_AR: Record<string, string> = {
  professional: 'لغة رسمية ودقيقة، مناسبة للتقارير على المستوى التنفيذي ومراسلات الموارد البشرية.',
  friendly:     'نبرة ودودة وسهلة التعامل، تشجّع على الحوار المفتوح مع الموظفين.',
  analytical:   'قائمة على البيانات ومنظّمة، تركّز على المقاييس والاتجاهات والأدلة.',
  executive:    'ملخّصات موجزة عالية المستوى تركّز على الرؤى والقرارات الاستراتيجية.',
  strict:       'مباشرة وتركّز على الامتثال، وتطبّق السياسات دون أي غموض.',
}

// ── Status pill helper ─────────────────────────────────────────────────────

function statusPillStyle(status: string): React.CSSProperties {
  if (status === 'indexed')    return { background: 'var(--status-approved-bg)',  color: 'var(--status-approved-fg)' }
  if (status === 'failed')     return { background: 'var(--status-rejected-bg)',  color: 'var(--status-rejected-fg)' }
  if (status === 'processing') return { background: 'var(--status-submitted-bg)', color: 'var(--status-submitted-fg)' }
  return { background: 'var(--status-pending-bg)', color: 'var(--status-pending-fg)' }
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Tab definitions ────────────────────────────────────────────────────────

const TABS = [
  { id: 'identity',  label: 'Identity',                 labelAr: 'الهوية' },
  { id: 'branding',  label: 'Branding',                 labelAr: 'العلامة التجارية' },
  { id: 'model',     label: 'AI Model',                 labelAr: 'نموذج الذكاء الاصطناعي' },
  { id: 'behaviour', label: 'Behaviour & Intelligence', labelAr: 'السلوك والذكاء' },
  { id: 'knowledge', label: 'Knowledge Base',           labelAr: 'قاعدة المعرفة' },
  { id: 'connection',label: 'Connection Test',          labelAr: 'اختبار الاتصال' },
] as const

type TabId = typeof TABS[number]['id']

// ── Tab: Branding ──────────────────────────────────────────────────────────

const PRESET_COLORS = [
  { label: 'Teal (default)', value: '#2E6170' },
  { label: 'Deep Blue',      value: '#1E40AF' },
  { label: 'Emerald',        value: '#059669' },
  { label: 'Violet',         value: '#7C3AED' },
  { label: 'Rose',           value: '#E11D48' },
  { label: 'Slate',          value: '#475569' },
]

function BrandingTab({ config }: Props) {
  const locale = useLocale()
  const agent = config.agent

  const [agentNameAr,   setAgentNameAr]   = useState((agent?.agentNameAr   as string) ?? '')
  const [welcomeText,   setWelcomeText]   = useState((agent?.welcomeText   as string) ?? '')
  const [welcomeTextAr, setWelcomeTextAr] = useState((agent?.welcomeTextAr as string) ?? '')
  const [footerLabel,   setFooterLabel]   = useState((agent?.footerLabel   as string) ?? '')
  const [footerLabelAr, setFooterLabelAr] = useState((agent?.footerLabelAr as string) ?? '')
  const [accentColor,   setAccentColor]   = useState((agent?.accentColor   as string) ?? '#2E6170')
  const [status,        setStatus]        = useState('')
  const [saving,        setSaving]        = useState(false)

  async function handleSave() {
    setSaving(true)
    setStatus('')
    try {
      await updateAriaBranding({
        agentNameAr:   agentNameAr   || null,
        welcomeText:   welcomeText   || null,
        welcomeTextAr: welcomeTextAr || null,
        footerLabel:   footerLabel   || null,
        footerLabelAr: footerLabelAr || null,
        accentColor:   accentColor   || null,
      })
      setStatus(locale === 'ar' ? 'تم الحفظ' : 'Saved')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : (locale === 'ar' ? 'حدث خطأ ما. يرجى المحاولة مرة أخرى أو الاتصال بالدعم الفني.' : 'Something went wrong. Please try again or contact IT support.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Accent colour */}
      <div style={sectionStyle}>
        <p style={sectionHeadStyle}>{locale === 'ar' ? 'لون التمييز' : 'Accent Colour'}</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-3)',
        marginBottom: '0.75rem',
        marginTop: 0 }}>
          {locale === 'ar' ? 'يُطبَّق على رأس بطاقة المساعد وتمييز فقاعة المحادثة. الافتراضي هو لون أفانيس الفيروزي.' : 'Applied to the assistant card header and chat bubble highlight. Defaults to AVANIIS teal.'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
        marginBottom: '0.75rem' }}>
          {PRESET_COLORS.map(c => (
            <button
              key={c.value}
              title={c.label}
              onClick={() => setAccentColor(c.value)}
              style={{
                width: 28, height: 28, borderRadius: '50%', border: 'none',
                background: c.value, cursor: 'pointer', flexShrink: 0,
                outline: accentColor === c.value ? `3px solid ${c.value}` : 'none',
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="color"
            value={accentColor || '#2E6170'}
            onChange={e => setAccentColor(e.target.value)}
            style={{ width: 36, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }}
            title={locale === 'ar' ? 'منتقي لون مخصّص' : 'Custom colour picker'}
          />
          <input
            style={{ ...inputStyle, width: '9rem' }}
            type="text"
            maxLength={7}
            value={accentColor}
            onChange={e => setAccentColor(e.target.value)}
            placeholder="#2E6170"
          />
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: accentColor || '#2E6170',
            border: '1px solid var(--border)',
          }} title={locale === 'ar' ? 'معاينة' : 'Preview'} />
        </div>
      </div>

      {/* Assistant name + welcome text */}
      <div style={sectionStyle}>
        <p style={sectionHeadStyle}>{locale === 'ar' ? 'تسميات العرض' : 'Display Labels'}</p>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'اسم المساعد (بالعربية)' : 'Assistant Name (Arabic)'} <span dir="rtl" lang="ar" style={{ fontWeight: 400, color: 'var(--ink-3)' }}>اسم المساعد</span>
            </label>
            <input
              style={inputStyle}
              type="text"
              maxLength={100}
              dir="rtl"
              lang="ar"
              value={agentNameAr}
              onChange={e => setAgentNameAr(e.target.value)}
              placeholder="آريا"
            />
          </div>
        </div>

        <div data-responsive-grid="true" style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'رسالة الترحيب (بالإنجليزية)' : 'Welcome Message (English)'}</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical' }}
              rows={3}
              maxLength={1000}
              value={welcomeText}
              onChange={e => setWelcomeText(e.target.value)}
              placeholder="Hello! I'm ARIA, your HR assistant…"
            />
          </div>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'رسالة الترحيب (بالعربية)' : 'Welcome Message (Arabic)'} <span dir="rtl" lang="ar" style={{ fontWeight: 400, color: 'var(--ink-3)' }}>رسالة الترحيب</span>
            </label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical' }}
              dir="rtl"
              lang="ar"
              rows={3}
              maxLength={1000}
              value={welcomeTextAr}
              onChange={e => setWelcomeTextAr(e.target.value)}
              placeholder="مرحباً! أنا آريا، مساعدتك في الموارد البشرية…"
            />
          </div>
        </div>
      </div>

      {/* Footer label */}
      <div style={sectionStyle}>
        <p style={sectionHeadStyle}>{locale === 'ar' ? 'تسمية التذييل' : 'Footer Label'}</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-3)',
        marginBottom: '0.75rem',
        marginTop: 0 }}>
          {locale === 'ar' ? 'تظهر في أسفل لوحة محادثة آريا. اتركها فارغة لاستخدام الإعداد الافتراضي.' : 'Shown at the bottom of the ARIA chat panel. Leave blank to use the default.'}
        </p>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'تسمية التذييل (بالإنجليزية)' : 'Footer Label (English)'}</label>
            <input
              style={inputStyle}
              type="text"
              maxLength={200}
              value={footerLabel}
              onChange={e => setFooterLabel(e.target.value)}
              placeholder="Powered by ARIA · AVANIIS HR"
            />
          </div>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>
              {locale === 'ar' ? 'تسمية التذييل (بالعربية)' : 'Footer Label (Arabic)'} <span dir="rtl" lang="ar" style={{ fontWeight: 400, color: 'var(--ink-3)' }}>تذييل</span>
            </label>
            <input
              style={inputStyle}
              dir="rtl"
              lang="ar"
              type="text"
              maxLength={200}
              value={footerLabelAr}
              onChange={e => setFooterLabelAr(e.target.value)}
              placeholder="مدعوم بآريا · أفانيس للموارد البشرية"
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button style={buttonStyle} onClick={handleSave} disabled={saving}>
          {saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ العلامة التجارية' : 'Save Branding')}
        </button>
        <SaveStatus status={status} />
      </div>
    </div>
  )
}

// ── Tab: Identity ──────────────────────────────────────────────────────────

function IdentityTab({ config }: Props) {
  const locale = useLocale()
  const agent = config.agent

  const [agentName, setAgentName] = useState((agent?.agentName as string) ?? 'ARIA')
  const [agentRole, setAgentRole] = useState((agent?.agentRole as string) ?? 'HR Intelligence Assistant')
  const [agentTone, setAgentTone] = useState((agent?.agentTone as string) ?? 'professional')
  const [avatarUrl, setAvatarUrl] = useState((agent?.avatarUrl as string) ?? '')
  const [isActive,  setIsActive]  = useState((agent?.isActive as boolean) ?? true)
  const [status,    setStatus]    = useState('')
  const [saving,    setSaving]    = useState(false)

  async function handleSave() {
    setSaving(true)
    setStatus('')
    try {
      await updateAgentIdentity({ agentName, agentRole, agentTone: agentTone as 'professional' | 'friendly' | 'analytical' | 'executive' | 'strict', avatarUrl, isActive })
      setStatus(locale === 'ar' ? 'تم الحفظ' : 'Saved')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : (locale === 'ar' ? 'حدث خطأ ما. يرجى المحاولة مرة أخرى أو الاتصال بالدعم الفني.' : 'Something went wrong. Please try again or contact IT support.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={sectionStyle}>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>{locale === 'ar' ? 'اسم المساعد' : 'Agent Name'}</label>
          <input style={inputStyle} type="text" maxLength={100} value={agentName} onChange={e => setAgentName(e.target.value)} />
        </div>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>{locale === 'ar' ? 'دور المساعد' : 'Agent Role'}</label>
          <input style={inputStyle} type="text" maxLength={100} value={agentRole} onChange={e => setAgentRole(e.target.value)} />
        </div>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>{locale === 'ar' ? 'نبرة المساعد' : 'Agent Tone'}</label>
          <select style={inputStyle} value={agentTone} onChange={e => setAgentTone(e.target.value)}>
            <option value="professional">{locale === 'ar' ? 'احترافية' : 'Professional'}</option>
            <option value="friendly">{locale === 'ar' ? 'ودودة' : 'Friendly'}</option>
            <option value="analytical">{locale === 'ar' ? 'تحليلية' : 'Analytical'}</option>
            <option value="executive">{locale === 'ar' ? 'تنفيذية' : 'Executive'}</option>
            <option value="strict">{locale === 'ar' ? 'صارمة' : 'Strict'}</option>
          </select>
          {agentTone && (
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-3)',
            marginTop: '0.375rem' }}>
              {locale === 'ar' ? TONE_DESCRIPTIONS_AR[agentTone] : TONE_DESCRIPTIONS[agentTone]}
            </p>
          )}
        </div>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>{locale === 'ar' ? 'رابط الصورة الرمزية' : 'Avatar URL'}</label>
          <input style={inputStyle} type="text" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://…" />
          {avatarUrl && isValidUrl(avatarUrl) && (
            <div style={{ marginTop: '0.5rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt={locale === 'ar' ? 'صورة المساعد الرمزية' : 'Agent avatar'} width={48} height={48} style={{ borderRadius: '50%', objectFit: 'cover' }} />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem',
        marginBottom: '1rem' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>{locale === 'ar' ? 'مفعّل' : 'Active'}</label>
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: '1rem', height: '1rem', cursor: 'pointer' }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button style={buttonStyle} onClick={handleSave} disabled={saving}>
          {saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ الهوية' : 'Save Identity')}
        </button>
        <SaveStatus status={status} />
      </div>
    </div>
  )
}

// ── Tab: AI Model ──────────────────────────────────────────────────────────

function ModelTab({ config }: Props) {
  const locale = useLocale()
  const model = config.model
  const router = useRouter()

  const [provider,    setProvider]    = useState((model?.provider as string) ?? 'anthropic')
  const [modelId,     setModelId]     = useState((model?.modelId as string) ?? 'claude-sonnet-4-6')
  const [apiKey,      setApiKey]      = useState('')
  const [apiEndpoint, setApiEndpoint] = useState((model?.apiEndpoint as string) ?? '')
  const [temperature, setTemperature] = useState(Number(model?.temperature) || 0.3)
  const [maxTokens,   setMaxTokens]   = useState(Number(model?.maxTokens) || 1000)
  const [fbProvider,  setFbProvider]  = useState((model?.fallbackProvider as string) ?? 'anthropic')
  const [fbModelId,   setFbModelId]   = useState((model?.fallbackModelId as string) ?? 'claude-haiku-4-5-20251001')
  const [fbApiKey,    setFbApiKey]    = useState('')
  const [status,      setStatus]      = useState('')
  const [saving,      setSaving]      = useState(false)

  // Switching provider resets the model to that provider's default so an
  // incompatible model id (e.g. a Claude id under OpenAI) can't be saved.
  function changeProvider(p: string) {
    setProvider(p)
    const def = defaultModelFor(p)
    if (def) setModelId(def)
  }
  function changeFbProvider(p: string) {
    setFbProvider(p)
    const def = defaultModelFor(p)
    if (def) setFbModelId(def)
  }

  async function handleSave() {
    setSaving(true)
    setStatus('')
    try {
      await updateModelConfig({ provider, modelId, apiKey, apiEndpoint: apiEndpoint || null, temperature, maxTokens, fallbackProvider: fbProvider, fallbackModelId: fbModelId, fallbackApiKey: fbApiKey })
      setStatus(locale === 'ar' ? 'تم الحفظ' : 'Saved')
      // Re-fetch server config so the Connection Test tab reflects the saved provider/model.
      router.refresh()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : (locale === 'ar' ? 'حدث خطأ ما. يرجى المحاولة مرة أخرى أو الاتصال بالدعم الفني.' : 'Something went wrong. Please try again or contact IT support.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={sectionStyle}>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>{locale === 'ar' ? 'المزوّد' : 'Provider'}</label>
          <ProviderSelect value={provider} onChange={changeProvider} />
        </div>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>{locale === 'ar' ? 'النموذج' : 'Model'}</label>
          <ModelSelect provider={provider} value={modelId} onChange={setModelId} />
        </div>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>
            {locale === 'ar' ? 'نقطة نهاية API' : 'API Endpoint'}{provider === 'azure_openai' ? (locale === 'ar' ? ' (مطلوبة)' : ' (required)') : (locale === 'ar' ? ' (اختيارية)' : ' (optional)')}
          </label>
          <input
            style={inputStyle}
            type="text"
            value={apiEndpoint}
            onChange={e => setApiEndpoint(e.target.value)}
            placeholder={
              provider === 'azure_openai' ? 'https://<resource>.services.ai.azure.com'
              : provider === 'openai'     ? 'https://api.openai.com/v1 (leave blank for default)'
              : 'Leave blank for the provider default (custom base URL / proxy)'
            }
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)',
          marginTop: '0.375rem' }}>
            {provider === 'azure_openai' ? (
              locale === 'ar'
                ? <>عنوان URL الأساسي لمورد Azure (مثال: https://&lt;resource&gt;.services.ai.azure.com). حقل النموذج أعلاه هو اسم النشر (deployment name). إصدار api-version الافتراضي هو {AZURE_DEFAULT_API_VERSION}؛ للتجاوز، أضف <code>?api-version=YYYY-MM-DD</code> إلى نقطة النهاية.</>
                : <>Azure resource base URL (e.g. https://&lt;resource&gt;.services.ai.azure.com). The Model field above is the deployment name. Default api-version is {AZURE_DEFAULT_API_VERSION}; to override, append <code>?api-version=YYYY-MM-DD</code> to the endpoint.</>
            ) : provider === 'openai' ? (
              locale === 'ar'
                ? <>اختياري. اتركه فارغاً لاستخدام الإعداد الافتراضي لـ OpenAI (https://api.openai.com/v1)، أو حدّد عنوان URL أساسياً مخصّصاً متوافقاً مع OpenAI.</>
                : <>Optional. Leave blank to use OpenAI&apos;s default (https://api.openai.com/v1), or set a custom OpenAI-compatible base URL.</>
            ) : (
              locale === 'ar'
                ? <>اختياري. اتركه فارغاً لاستخدام الإعداد الافتراضي لمجموعة تطوير المزوّد (SDK)، أو حدّد عنوان URL أساسياً / وكيلاً مخصّصاً.</>
                : <>Optional. Leave blank to use the provider SDK default, or set a custom base URL / proxy.</>
            )}
          </p>
        </div>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>{locale === 'ar' ? 'مفتاح API' : 'API Key'}</label>
          <input
            style={inputStyle}
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={model?.apiKeyMasked ?? (provider === 'anthropic' ? 'sk-ant-••••' : 'sk-••••')}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)',
          marginTop: '0.375rem' }}>
            {locale === 'ar' ? 'يتم تشفير مفاتيح API باستخدام AES-256 قبل التخزين ولا تُعاد أبداً كنص صريح.' : 'API keys are encrypted with AES-256 before storage and never returned in plaintext.'}
          </p>
        </div>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>{locale === 'ar' ? 'درجة الحرارة' : 'Temperature'}: {temperature.toFixed(2)}</label>
          <input type="range" min={0} max={1} step={0.05} value={temperature} onChange={e => setTemperature(Number(e.target.value))} style={{ width: '100%' }} />
        </div>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>{locale === 'ar' ? 'الحد الأقصى للرموز (Tokens)' : 'Max Tokens'}</label>
          <input style={inputStyle} type="number" min={100} max={8192} value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))} />
        </div>
      </div>

      <details style={{ marginBottom: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)', padding: '0.5rem 0' }}>
          {locale === 'ar' ? 'إعدادات النموذج الاحتياطي' : 'Fallback model configuration'}
        </summary>
        <div style={{ ...sectionStyle, marginTop: '0.5rem' }}>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'المزوّد الاحتياطي' : 'Fallback Provider'}</label>
            <ProviderSelect value={fbProvider} onChange={changeFbProvider} />
          </div>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'النموذج الاحتياطي' : 'Fallback Model'}</label>
            <ModelSelect provider={fbProvider} value={fbModelId} onChange={setFbModelId} />
          </div>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'مفتاح API الاحتياطي' : 'Fallback API Key'}</label>
            <input style={inputStyle} type="password" value={fbApiKey} onChange={e => setFbApiKey(e.target.value)} placeholder={model?.fallbackApiKeyMasked ?? 'sk-ant-••••'} />
          </div>
        </div>
      </details>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button style={buttonStyle} onClick={handleSave} disabled={saving}>
          {saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ إعدادات النموذج' : 'Save Model Config')}
        </button>
        <SaveStatus status={status} />
      </div>
    </div>
  )
}

// ── Tab: Behaviour & Intelligence ──────────────────────────────────────────

function BehaviourTab({ config }: Props) {
  const locale = useLocale()
  const behaviour = config.behaviour
  const enabledSources = (behaviour?.enabledDataSources as string[]) ?? ['hr', 'absence', 'compliance']

  const [promptMode,        setPromptMode]        = useState((behaviour?.promptMode as string) ?? 'prepend')
  const [systemPrompt,      setSystemPrompt]      = useState((behaviour?.systemPromptOverride as string) ?? '')
  const [authorityLevel,    setAuthorityLevel]    = useState((behaviour?.authorityLevel as string) ?? 'advisory')
  const [hrEnabled,         setHrEnabled]         = useState(enabledSources.includes('hr'))
  const [absenceEnabled,    setAbsenceEnabled]    = useState(enabledSources.includes('absence'))
  const [complianceEnabled, setComplianceEnabled] = useState(enabledSources.includes('compliance'))
  const [anomalyDetection,  setAnomalyDetection]  = useState((behaviour?.anomalyDetection as boolean) ?? true)
  const [slaMonitoring,     setSlaMonitoring]     = useState((behaviour?.slaMonitoring as boolean) ?? true)
  const [retentionDays,     setRetentionDays]     = useState((behaviour?.conversationRetentionDays as number) ?? 90)
  const [contextDepth,      setContextDepth]      = useState((behaviour?.contextDepthMessages as number) ?? 20)
  const [personalization,   setPersonalization]   = useState((behaviour?.personalizationEnabled as boolean) ?? true)
  const [ragEnabled,        setRagEnabled]        = useState((behaviour?.ragEnabled as boolean) ?? true)
  const [ragMaxChunks,      setRagMaxChunks]      = useState((behaviour?.ragMaxChunks as number) ?? 5)
  const [status,            setStatus]            = useState('')
  const [saving,            setSaving]            = useState(false)

  async function handleSave() {
    setSaving(true)
    setStatus('')
    try {
      await updateBehaviourConfig({
        promptMode: promptMode as 'prepend' | 'replace' | 'append',
        systemPromptOverride: systemPrompt,
        authorityLevel: authorityLevel as 'advisory' | 'recommend_approve' | 'full_execution',
        enabledDataSources: [
          ...(hrEnabled ? ['hr'] : []),
          ...(absenceEnabled ? ['absence'] : []),
          ...(complianceEnabled ? ['compliance'] : []),
        ],
        anomalyDetection, slaMonitoring,
        conversationRetentionDays: retentionDays,
        contextDepthMessages: contextDepth,
        personalizationEnabled: personalization,
        ragEnabled, ragMaxChunks,
      })
      setStatus(locale === 'ar' ? 'تم الحفظ' : 'Saved')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : (locale === 'ar' ? 'حدث خطأ ما. يرجى المحاولة مرة أخرى أو الاتصال بالدعم الفني.' : 'Something went wrong. Please try again or contact IT support.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={sectionStyle}>
        <p style={sectionHeadStyle}>{locale === 'ar' ? 'موجّه النظام' : 'System Prompt'}</p>
        <div style={{ ...fieldGroupStyle, display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {(['prepend', 'replace', 'append'] as const).map(mode => (
            <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>
              <input type="radio" name="promptMode" value={mode} checked={promptMode === mode} onChange={() => setPromptMode(mode)} />
              {mode === 'prepend'
                ? (locale === 'ar' ? 'إضافة قبل الافتراضي' : 'Prepend to default')
                : mode === 'replace'
                  ? (locale === 'ar' ? 'استبدال الافتراضي' : 'Replace default')
                  : (locale === 'ar' ? 'إضافة بعد الافتراضي' : 'Append to default')}
            </label>
          ))}
        </div>
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>{locale === 'ar' ? 'تجاوز موجّه النظام' : 'System Prompt Override'}</label>
          <textarea
            style={{ ...inputStyle, resize: 'vertical' }}
            rows={6}
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder={locale === 'ar' ? 'أدخل تعليمات موجّه النظام المخصصة…' : 'Enter custom system prompt instructions…'}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <p style={sectionHeadStyle}>{locale === 'ar' ? 'مستوى الصلاحية' : 'Authority Level'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[
            { value: 'advisory',          label: 'Advisory only',        labelAr: 'استشاري فقط' },
            { value: 'recommend_approve', label: 'Recommend + Execute',  labelAr: 'التوصية + التنفيذ' },
            { value: 'full_execution',    label: 'Full execution',       labelAr: 'تنفيذ كامل' },
          ].map(opt => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>
              <input type="radio" name="authorityLevel" value={opt.value} checked={authorityLevel === opt.value} onChange={() => setAuthorityLevel(opt.value)} />
              {locale === 'ar' ? opt.labelAr : opt.label}
            </label>
          ))}
          {authorityLevel === 'full_execution' && (
            <div style={{ marginTop: '0.5rem', padding: '0.625rem 0.875rem', background: 'var(--status-pending-bg)', color: 'var(--status-pending-fg)', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
              {locale === 'ar' ? 'وضع الثقة العالية. ستنفّذ آريا الإجراءات بأقل قدر من التدخل.' : 'High trust mode. ARIA will execute actions with minimal friction.'}
            </div>
          )}
        </div>
      </div>

      <div style={sectionStyle}>
        <p style={sectionHeadStyle}>{locale === 'ar' ? 'مصادر البيانات' : 'Data Sources'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[
            { key: 'hr',         label: 'HR',                 labelAr: 'الموارد البشرية', enabled: hrEnabled,         setter: setHrEnabled },
            { key: 'absence',    label: 'Absence Management', labelAr: 'إدارة الغياب',     enabled: absenceEnabled,    setter: setAbsenceEnabled },
            { key: 'compliance', label: 'Compliance',         labelAr: 'الامتثال',         enabled: complianceEnabled, setter: setComplianceEnabled },
          ].map(src => (
            <label key={src.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>
              <input type="checkbox" checked={src.enabled} onChange={e => src.setter(e.target.checked)} />
              {locale === 'ar' ? src.labelAr : src.label}
            </label>
          ))}
          {[
            { key: 'payroll', label: 'Payroll', labelAr: 'الرواتب', badge: 'Sprint 12' },
            { key: 'finance', label: 'Finance', labelAr: 'المالية',  badge: 'Sprint 12' },
            { key: 'crm',     label: 'CRM',     labelAr: 'إدارة علاقات العملاء', badge: 'Sprint 12' },
          ].map(src => (
            <label key={src.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--ink-4)', fontFamily: 'var(--font-sans)', opacity: 0.5 }}>
              <input type="checkbox" disabled />
              {locale === 'ar' ? src.labelAr : src.label}
              <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'var(--status-pending-bg)', color: 'var(--status-pending-fg)', borderRadius: '4px', fontWeight: 700 }}>
                {src.badge}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <p style={sectionHeadStyle}>{locale === 'ar' ? 'ميزات الذكاء' : 'Intelligence Features'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>
            <input type="checkbox" checked={anomalyDetection} onChange={e => setAnomalyDetection(e.target.checked)} />
            {locale === 'ar' ? 'كشف الحالات الشاذة' : 'Anomaly Detection'}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>
            <input type="checkbox" checked={slaMonitoring} onChange={e => setSlaMonitoring(e.target.checked)} />
            {locale === 'ar' ? 'مراقبة اتفاقية مستوى الخدمة (SLA)' : 'SLA Monitoring'}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--ink-4)', fontFamily: 'var(--font-sans)', opacity: 0.5 }}>
            <input type="checkbox" disabled />
            {locale === 'ar' ? 'رؤى تنبؤية' : 'Predictive Insights'}
            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: 'var(--status-pending-bg)', color: 'var(--status-pending-fg)', borderRadius: '4px', fontWeight: 700 }}>{locale === 'ar' ? 'قريباً' : 'Coming Soon'}</span>
          </label>
        </div>
      </div>

      <div style={sectionStyle}>
        <p style={sectionHeadStyle}>{locale === 'ar' ? 'الذاكرة والسياق' : 'Memory & Context'}</p>
        <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'مدة الاحتفاظ بالمحادثات' : 'Conversation Retention'}</label>
            <select style={inputStyle} value={retentionDays} onChange={e => setRetentionDays(Number(e.target.value))}>
              {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{locale === 'ar' ? `${d} يوماً` : `${d} days`}</option>)}
            </select>
          </div>
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'عمق السياق (الرسائل)' : 'Context Depth (messages)'}</label>
            <select style={inputStyle} value={contextDepth} onChange={e => setContextDepth(Number(e.target.value))}>
              {[10, 20, 50].map(d => <option key={d} value={d}>{locale === 'ar' ? `${d} رسالة` : `${d} messages`}</option>)}
            </select>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>
          <input type="checkbox" checked={personalization} onChange={e => setPersonalization(e.target.checked)} />
          {locale === 'ar' ? 'تفعيل التخصيص' : 'Personalisation enabled'}
        </label>
      </div>

      <div style={sectionStyle}>
        <p style={sectionHeadStyle}>{locale === 'ar' ? 'إعدادات RAG' : 'RAG Configuration'}</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--ink-2)', fontFamily: 'var(--font-sans)',
        marginBottom: '0.75rem' }}>
          <input type="checkbox" checked={ragEnabled} onChange={e => setRagEnabled(e.target.checked)} />
          {locale === 'ar' ? 'تفعيل RAG' : 'RAG enabled'}
        </label>
        {ragEnabled && (
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>{locale === 'ar' ? 'الحد الأقصى للمقاطع لكل استعلام' : 'Max Chunks per query'}</label>
            <input style={{ ...inputStyle, width: '8rem' }} type="number" min={1} max={20} value={ragMaxChunks} onChange={e => setRagMaxChunks(Number(e.target.value))} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button style={buttonStyle} onClick={handleSave} disabled={saving}>
          {saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ إعدادات السلوك' : 'Save Behaviour Config')}
        </button>
        <SaveStatus status={status} />
      </div>
    </div>
  )
}

// ── Tab: Knowledge Base ────────────────────────────────────────────────────

function KnowledgeTab({ config }: Props) {
  const locale = useLocale()
  const [sources, setSources]   = useState(config.knowledgeSources)
  const [uploading, setUploading] = useState(false)

  const VECTOR_STATUS_LABELS: Record<string, string> = {
    indexed:    'مفهرس',
    failed:     'فشل',
    processing: 'قيد المعالجة',
    pending:    'قيد الانتظار',
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await uploadKnowledgeSource(fd)
      setSources(prev => [...prev, { id: result.id, sourceName: result.sourceName, vectorStatus: result.vectorStatus }])
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(locale === 'ar' ? 'حذف مصدر المعرفة هذا؟' : 'Delete this knowledge source?')) return
    await deleteKnowledgeSource(id)
    setSources(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div>
      <div style={sectionStyle}>
        {sources.length === 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: '0.875rem', fontFamily: 'var(--font-sans)' }}>
            {locale === 'ar' ? 'لم يتم رفع أي مصادر معرفة بعد.' : 'No knowledge sources uploaded yet.'}
          </p>
        ) : sources.map(ks => (
          <div key={ks.id as string} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: 'var(--ink-1)', fontSize: '0.875rem' }}>{ks.sourceName as string}</div>
              <div style={{ color: 'var(--ink-3)', fontSize: '0.75rem' }}>
                {formatBytes(ks.fileSizeBytes as number)} · {ks.lastIndexedAt ? new Date(ks.lastIndexedAt as string).toLocaleDateString(locale === 'ar' ? 'ar' : undefined) : (locale === 'ar' ? 'غير مفهرس' : 'Not indexed')}
              </div>
            </div>
            <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, ...statusPillStyle(ks.vectorStatus as string) }}>
              {locale === 'ar' ? (VECTOR_STATUS_LABELS[ks.vectorStatus as string] ?? (ks.vectorStatus as string)) : (ks.vectorStatus as string)}
            </span>
            <button onClick={() => handleDelete(ks.id as string)} style={{ color: 'var(--status-rejected-fg)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}>
              {locale === 'ar' ? 'حذف' : 'Delete'}
            </button>
          </div>
        ))}
      </div>

      <label htmlFor="ks-upload" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem', border: '2px dashed var(--border)', borderRadius: '8px', cursor: uploading ? 'wait' : 'pointer', color: 'var(--ink-3)', textAlign: 'center' }}>
        <input id="ks-upload" type="file" accept=".pdf,.docx,.txt" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
        <span style={{ fontSize: '2rem' }}>↑</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '0.875rem' }}>
          {uploading ? (locale === 'ar' ? 'جارٍ الرفع…' : 'Uploading…') : (locale === 'ar' ? 'أفلت الملفات هنا أو انقر للرفع' : 'Drop files here or click to upload')}
        </span>
        <span style={{ fontSize: '0.75rem',
        marginTop: '0.5rem' }}>
          {locale === 'ar' ? 'PDF، DOCX، TXT · حد أقصى 25 ميجابايت · يتم تقسيم المستندات وفهرستها لترجع إليها آريا عند الإجابة عن أسئلة السياسات.' : 'PDF, DOCX, TXT · Max 25 MB · Documents are chunked and indexed for ARIA to reference when answering policy questions.'}
        </span>
      </label>
    </div>
  )
}

// ── Tab: Connection Test ───────────────────────────────────────────────────

function ConnectionTab({ config }: Props) {
  const locale = useLocale()
  const [testing,    setTesting]    = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null)

  // Derive what the Connection Test will actually use, from the saved config.
  const provider = (config.model?.provider as string) ?? 'anthropic'
  const endpoint = (config.model?.apiEndpoint as string) ?? ''
  const apiVersion = provider === 'azure_openai'
    ? (() => { try { return new URL(endpoint).searchParams.get('api-version') || AZURE_DEFAULT_API_VERSION } catch { return AZURE_DEFAULT_API_VERSION } })()
    : '—'
  const endpointDisplay = endpoint
    || (provider === 'openai' ? (locale === 'ar' ? 'https://api.openai.com/v1 (افتراضي)' : 'https://api.openai.com/v1 (default)') : provider === 'anthropic' ? (locale === 'ar' ? 'الإعداد الافتراضي لـ SDK' : 'SDK default') : '—')

  // Validate the saved endpoint for the selected provider before a live test:
  //  - Azure OpenAI: endpoint is REQUIRED.
  //  - Any provided endpoint must be a well-formed https URL.
  //  - Non-standard Azure hosts are allowed but flagged as a warning.
  const endpointValidation: { ok: boolean; warn?: boolean; message: string } = (() => {
    if (provider === 'azure_openai' && !endpoint) {
      return { ok: false, message: locale === 'ar' ? 'يتطلّب Azure OpenAI نقطة نهاية API — اضبطها في تبويب نموذج الذكاء الاصطناعي قبل الاختبار.' : 'Azure OpenAI requires an API Endpoint — set it in the AI Model tab before testing.' }
    }
    if (endpoint) {
      let u: URL
      try { u = new URL(endpoint) } catch { return { ok: false, message: locale === 'ar' ? 'نقطة نهاية API ليست عنوان URL صالحاً.' : 'API Endpoint is not a valid URL.' } }
      if (u.protocol !== 'https:') return { ok: false, message: locale === 'ar' ? 'يجب أن تستخدم نقطة نهاية API بروتوكول https://.' : 'API Endpoint must use https://.' }
      if (provider === 'azure_openai' && !/(?:\.services\.ai\.azure\.com|\.openai\.azure\.com)$/i.test(u.hostname)) {
        return { ok: true, warn: true, message: locale === 'ar' ? `المضيف "${u.hostname}" ليس مضيف Azure قياسياً — سيتم اختباره على أي حال.` : `Host "${u.hostname}" is not a standard Azure host — it will still be tested.` }
      }
      return { ok: true, message: locale === 'ar' ? 'تنسيق نقطة النهاية يبدو صالحاً.' : 'Endpoint format looks valid.' }
    }
    return { ok: true, message: provider === 'openai' ? (locale === 'ar' ? 'يتم استخدام نقطة نهاية OpenAI الافتراضية.' : 'Using OpenAI default endpoint.') : (locale === 'ar' ? 'يتم استخدام نقطة النهاية الافتراضية للمزوّد.' : 'Using provider default endpoint.') }
  })()

  async function handleTest() {
    // Client-side endpoint validation gate — fail fast with a clear message
    // instead of a confusing provider error.
    if (!endpointValidation.ok) {
      setTestResult({ success: false, error: endpointValidation.message })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testAriaConnection()
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : (locale === 'ar' ? 'حدث خطأ ما. يرجى المحاولة مرة أخرى أو الاتصال بالدعم الفني.' : 'Something went wrong. Please try again or contact IT support.') })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      {/* Endpoint validation feedback for the selected provider/endpoint */}
      <div style={{
        marginBottom: '0.75rem', padding: '0.625rem 0.875rem', borderRadius: 8,
        fontSize: '0.8rem', fontFamily: 'var(--font-sans)',
        background: endpointValidation.ok ? (endpointValidation.warn ? 'var(--status-pending-bg)' : 'var(--surface)') : 'var(--status-rejected-bg)',
        color: endpointValidation.ok ? (endpointValidation.warn ? 'var(--status-pending-fg)' : 'var(--ink-2)') : 'var(--status-rejected-fg)',
        border: '1px solid var(--border)',
      }}>
        <strong>{provider}</strong> → {endpointDisplay}
        {provider === 'azure_openai' && <> · api-version {apiVersion}</>}
        <div style={{ marginTop: 2 }}>{endpointValidation.ok ? (endpointValidation.warn ? '⚠ ' : '✓ ') : '✕ '}{endpointValidation.message}</div>
      </div>

      <button onClick={handleTest} disabled={testing || !endpointValidation.ok} style={buttonStyle}>
        {testing ? (locale === 'ar' ? 'جارٍ الاختبار…' : 'Testing…') : (locale === 'ar' ? 'اختبار الاتصال' : 'Test Connection')}
      </button>

      {testResult && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          {testResult.success ? (
            <>
              <div style={{ color: 'var(--status-approved-fg)', fontWeight: 700, fontFamily: 'var(--font-sans)' }}>{locale === 'ar' ? 'نجح الاتصال' : 'Connection successful'}</div>
              <div style={{ color: 'var(--ink-2)', fontSize: '0.875rem',
              marginTop: '0.5rem', fontFamily: 'var(--font-sans)' }}>
                {locale === 'ar' ? 'زمن الاستجابة' : 'Response time'}: {testResult.latencyMs}ms
              </div>
            </>
          ) : (
            <>
              <div style={{ color: 'var(--status-rejected-fg)', fontWeight: 700, fontFamily: 'var(--font-sans)' }}>{locale === 'ar' ? 'فشل الاتصال' : 'Connection failed'}</div>
              <div style={{ color: 'var(--ink-3)', fontSize: '0.875rem',
              marginTop: '0.5rem', fontFamily: 'var(--font-sans)' }}>{testResult.error}</div>
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: '2rem', ...sectionStyle }}>
        <h3 style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', fontWeight: 700, margin: '0 0 1rem 0' }}>
          {locale === 'ar' ? 'الإعدادات الحالية' : 'Current Configuration'}
        </h3>
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {([
            [locale === 'ar' ? 'اسم المساعد' : 'Agent Name',    config.agent?.agentName],
            [locale === 'ar' ? 'دور المساعد' : 'Agent Role',    config.agent?.agentRole],
            [locale === 'ar' ? 'النبرة' : 'Tone',               config.agent?.agentTone],
            [locale === 'ar' ? 'المزوّد' : 'Provider',          provider],
            [locale === 'ar' ? 'النموذج / النشر' : 'Model / Deployment', config.model?.modelId],
            [locale === 'ar' ? 'نقطة النهاية' : 'Endpoint',      endpointDisplay],
            [locale === 'ar' ? 'إصدار API' : 'API Version',      apiVersion],
            [locale === 'ar' ? 'درجة الحرارة' : 'Temperature',   config.model?.temperature],
            [locale === 'ar' ? 'الحد الأقصى للرموز' : 'Max Tokens', config.model?.maxTokens],
            [locale === 'ar' ? 'الصلاحية' : 'Authority',         config.behaviour?.authorityLevel],
            [locale === 'ar' ? 'تفعيل RAG' : 'RAG Enabled',      config.behaviour?.ragEnabled ? (locale === 'ar' ? 'نعم' : 'Yes') : (locale === 'ar' ? 'لا' : 'No')],
          ] as [string, unknown][]).map(([label, value]) => (
            <div key={label}>
              <dt style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>{label}</dt>
              <dd style={{ fontSize: '0.875rem', color: 'var(--ink-1)', fontWeight: 600, fontFamily: 'var(--font-sans)', margin: 0 }}>
                {String(value ?? '—')}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

// ── Root component ─────────────────────────────────────────────────────────

export default function AriaSettingsClient({ config }: Props) {
  const locale = useLocale()
  const [activeTab, setActiveTab] = useState<TabId>('identity')

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)',
      marginBottom: '1.5rem', overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.5rem 1rem',
              background: 'none',
              borderTopWidth: "0px",
              borderTopStyle: "none",
              borderTopColor: "currentColor",
              borderRightWidth: "0px",
              borderRightStyle: "none",
              borderRightColor: "currentColor",
              borderLeftWidth: "0px",
              borderLeftStyle: "none",
              borderLeftColor: "currentColor",
              borderBottomWidth: "2px",
              borderBottomStyle: "solid",
              borderBottomColor: (activeTab === tab.id) ? "var(--accent)" : "transparent",
              cursor: 'pointer',
              color: activeTab === tab.id ? 'var(--brand-active)' : 'var(--ink-2)',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.875rem',
              fontWeight: activeTab === tab.id ? 600 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            {locale === 'ar' ? tab.labelAr : tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'identity'  && <IdentityTab   config={config} />}
      {activeTab === 'branding'  && <BrandingTab   config={config} />}
      {activeTab === 'model'     && <ModelTab       config={config} />}
      {activeTab === 'behaviour' && <BehaviourTab   config={config} />}
      {activeTab === 'knowledge' && <KnowledgeTab   config={config} />}
      {activeTab === 'connection'&& <ConnectionTab  config={config} />}
    </div>
  )
}
