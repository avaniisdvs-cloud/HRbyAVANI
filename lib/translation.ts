/**
 * Server-side translation service — English → Arabic ONLY.
 *
 * Provider is configurable via TRANSLATION_PROVIDER env var:
 *   'anthropic' (default) — uses ANTHROPIC_API_KEY (already configured)
 *   'google'              — uses TRANSLATION_API_KEY + Google Cloud Translate v2
 *   'azure'               — uses TRANSLATION_API_KEY + Azure Cognitive Services
 *   'mock'                — returns a labelled placeholder (testing only)
 *
 * Design constraints:
 *   - Never translates Arabic → English (direction guard)
 *   - Skips values that are codes, IDs, emails, numbers, or very short
 *   - Returns null on any failure — callers decide the fallback
 *   - Never throws; all errors are caught and logged
 *   - In-memory cache (per warm serverless instance) avoids duplicate API calls
 */

import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/logger'

// ── Skip-pattern guard ──────────────────────────────────────────────────────
// Values matching these patterns should NOT be translated.

const SKIP_PATTERNS = [
  /^\s*$/, // empty / whitespace only
  /^[0-9\s.,'\-/]+$/, // numbers / amounts
  /^[A-Z0-9\-]{2,20}$/, // system codes like AVN-001234, HR-ADMIN, DEPT-FIN
  /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i, // email addresses
  /^\+?[0-9\s()\-]{7,}$/, // phone numbers
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUIDs
]

function shouldSkipTranslation(text: string): boolean {
  const t = text.trim()
  if (t.length < 2) return true
  return SKIP_PATTERNS.some(re => re.test(t))
}

// ── In-memory cache ──────────────────────────────────────────────────────────
// Per-process cache. Evicted when the serverless instance is recycled.
// Deterministic translations (same EN → same AR) make this safe.

const MAX_CACHE_SIZE = 500
const _cache = new Map<string, string>()

function cacheGet(key: string): string | undefined {
  return _cache.get(key)
}

function cacheSet(key: string, value: string): void {
  if (_cache.size >= MAX_CACHE_SIZE) _cache.clear()
  _cache.set(key, value)
}

// ── Public API ───────────────────────────────────────────────────────────────

type Provider = 'anthropic' | 'google' | 'azure' | 'mock'

/**
 * Translate `text` from English to Arabic.
 *
 * @returns The Arabic translation, or `null` if translation could not be
 *          performed (empty input, skip pattern matched, API failure).
 *          Never throws.
 */
export async function translateToArabic(text: string): Promise<string | null> {
  const trimmed = (text ?? '').trim()
  if (shouldSkipTranslation(trimmed)) return null

  const cached = cacheGet(trimmed)
  if (cached) return cached

  const provider = (process.env.TRANSLATION_PROVIDER ?? 'anthropic') as Provider

  try {
    let result: string | null = null

    switch (provider) {
      case 'anthropic': result = await translateWithAnthropic(trimmed); break
      case 'google':    result = await translateWithGoogle(trimmed);    break
      case 'azure':     result = await translateWithAzure(trimmed);     break
      case 'mock':      result = `[مترجم] ${trimmed}`;                 break
      default:
        logger.warn('translation', `unknown provider "${provider}", falling back to anthropic`)
        result = await translateWithAnthropic(trimmed)
    }

    if (result?.trim()) {
      const clean = result.trim()
      cacheSet(trimmed, clean)
      return clean
    }
    return null
  } catch (err) {
    logger.warn('translation', 'translateToArabic failed', {
      provider,
      textLen: trimmed.length,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ── Provider implementations ─────────────────────────────────────────────────

async function translateWithAnthropic(text: string): Promise<string | null> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content:
        'Translate the following text from English to Arabic. ' +
        'Return ONLY the Arabic translation — no explanation, no quotes, no extra text. ' +
        'For proper nouns (person names, place names), use standard phonetic transliteration to Arabic script. ' +
        'Do not translate: numbers, codes, email addresses, or identifiers.\n\n' +
        `Text: ${text}`,
    }],
  })

  const block = resp.content[0]
  if (block.type === 'text') return block.text.trim() || null
  return null
}

async function translateWithGoogle(text: string): Promise<string | null> {
  const apiKey = process.env.TRANSLATION_API_KEY
  if (!apiKey) throw new Error('TRANSLATION_API_KEY required for Google provider')

  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, target: 'ar', source: 'en', format: 'text' }),
    },
  )
  if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}`)
  const data = await res.json() as {
    data?: { translations?: Array<{ translatedText: string }> }
  }
  return data.data?.translations?.[0]?.translatedText ?? null
}

async function translateWithAzure(text: string): Promise<string | null> {
  const apiKey   = process.env.TRANSLATION_API_KEY
  const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT ?? 'https://api.cognitive.microsofttranslator.com'
  if (!apiKey) throw new Error('TRANSLATION_API_KEY required for Azure provider')

  const res = await fetch(`${endpoint}/translate?api-version=3.0&from=en&to=ar`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ Text: text }]),
  })
  if (!res.ok) throw new Error(`Azure Translator HTTP ${res.status}`)
  const data = await res.json() as Array<{
    translations?: Array<{ text: string }>
  }>
  return data[0]?.translations?.[0]?.text ?? null
}
