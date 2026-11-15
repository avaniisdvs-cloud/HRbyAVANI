'use server'

/**
 * AI-powered Arabic translation for letter templates.
 * Translates an HTML letter body from English to Arabic using Claude.
 * Preserves all {{token}} placeholders, HTML tags (p, strong, br), and RTL structure.
 */
import Anthropic from '@anthropic-ai/sdk'
import { requireRole } from '@/lib/auth'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function translateTemplateToArabic(
  bodyEn: string,
): Promise<{ success: true; bodyAr: string } | { success: false; error: string }> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    if (!bodyEn.trim()) {
      return { success: false, error: 'English body is empty — nothing to translate.' }
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return { success: false, error: 'ANTHROPIC_API_KEY is not configured.' }
    }

    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role:    'user',
        content: `You are a professional HR document translator specialising in UAE employment letters.

Translate the following HTML letter body from English to formal Arabic (Modern Standard Arabic, suitable for UAE corporate letters).

Rules:
- Preserve ALL {{token}} placeholders exactly as-is (e.g. {{employee_name}}, {{joining_date}})
- Preserve HTML tags: <p>, </p>, <strong>, </strong>, <br/>, inline styles
- Output Arabic text only — no explanations, no preamble
- Use formal UAE corporate language
- Ensure the output reads naturally right-to-left

English HTML body:
${bodyEn}`,
      }],
    })

    const content = msg.content[0]
    if (content.type !== 'text') {
      return { success: false, error: 'Unexpected response from Claude.' }
    }

    return { success: true, bodyAr: content.text.trim() }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Translation failed.' }
  }
}
