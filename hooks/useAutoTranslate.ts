'use client'

/**
 * useAutoTranslate — client-side hook for English → Arabic auto-population.
 *
 * Usage in any form that has a bilingual EN/AR field pair:
 *
 *   const { translate, translating } = useAutoTranslate()
 *
 *   // On the English input, trigger translation when the field blurs:
 *   <input
 *     value={nameEn}
 *     onChange={e => setNameEn(e.target.value)}
 *     onBlur={async () => {
 *       if (nameEn.trim() && !nameAr.trim()) {
 *         const ar = await translate(nameEn)
 *         if (ar) setNameAr(ar)
 *       }
 *     }}
 *   />
 *
 * Rules enforced here:
 *   - Empty input → no API call, returns null immediately
 *   - Only calls /api/translate (server-side); API key never touches client
 *   - Returns null on any error (network, 401, etc.) — callers must decide fallback
 */

import { useState, useCallback } from 'react'

interface UseAutoTranslateResult {
  /** Translate `text` from English to Arabic. Returns null on failure. */
  translate:   (text: string) => Promise<string | null>
  /** True while a translation request is in-flight. */
  translating: boolean
}

export function useAutoTranslate(): UseAutoTranslateResult {
  const [translating, setTranslating] = useState(false)

  const translate = useCallback(async (text: string): Promise<string | null> => {
    const trimmed = text?.trim()
    if (!trimmed || trimmed.length > 500) return null

    setTranslating(true)
    try {
      const res = await fetch('/api/translate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: trimmed }),
      })
      if (!res.ok) return null
      const data = await res.json() as { translation: string | null }
      return data.translation ?? null
    } catch {
      return null
    } finally {
      setTranslating(false)
    }
  }, [])

  return { translate, translating }
}
