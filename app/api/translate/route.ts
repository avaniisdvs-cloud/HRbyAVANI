/**
 * POST /api/translate
 *
 * Server-side translation endpoint — English → Arabic ONLY.
 * Used by client-side form components to auto-populate Arabic fields
 * as the user types English values.
 *
 * Security:
 *   - Requires a valid session (any authenticated role)
 *   - Translation API key never leaves the server
 *   - Input capped at 500 characters to limit abuse
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { translateToArabic } from '@/lib/translation'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('text' in body) ||
    typeof (body as Record<string, unknown>).text !== 'string'
  ) {
    return NextResponse.json({ error: 'text (string) is required' }, { status: 400 })
  }

  const text = ((body as Record<string, unknown>).text as string).trim()
  if (!text) {
    return NextResponse.json({ translation: null })
  }
  if (text.length > 500) {
    return NextResponse.json({ error: 'text must be ≤ 500 characters' }, { status: 400 })
  }

  const translation = await translateToArabic(text)
  const provider = process.env.TRANSLATION_PROVIDER ?? 'anthropic'

  return NextResponse.json({ translation, provider })
}
