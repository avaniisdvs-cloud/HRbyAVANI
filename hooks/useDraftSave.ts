'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// Fields that must never be stored in localStorage
const PII_FIELDS = new Set([
  'emiratesId', 'passportNumber', 'iban', 'bankAccountNumber',
  'bankIban', 'password', 'secret', 'token',
])

function sanitizeForDraft<T extends object>(data: T): Partial<T> {
  const sanitized = { ...(data as Record<string, unknown>) }
  for (const field of PII_FIELDS) {
    delete sanitized[field]
  }
  return sanitized as Partial<T>
}

export function getRelativeTime(date: Date): string {
  const diffMs  = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  return `Yesterday at ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

interface StoredDraft<T extends object> {
  data:        Partial<T>
  savedAt:     string   // ISO string
  formVersion: string
  userId:      string
}

export interface DraftSaveOptions {
  debounceMs?:  number   // default 2000
  expiryHours?: number   // default 24
}

export type DraftIndicator = 'idle' | 'saving' | 'saved' | 'error'

export interface UseDraftSaveResult<T> {
  savedAt:       Date | null
  hasDraft:      boolean
  saveIndicator: DraftIndicator
  relativeTime:  string
  clearDraft:    () => void
  restoreDraft:  () => Partial<T> | null
}

const FORM_VERSION = '1'

export function useDraftSave<T extends object>(
  key:     string,        // unique per form, e.g. 'draft:new-employee'
  data:    T,             // current form state
  userId:  string,
  options: DraftSaveOptions = {},
): UseDraftSaveResult<T> {
  const { debounceMs = 2000, expiryHours = 24 } = options
  const storageKey = `avaniis_draft_${key}`

  const [savedAt,       setSavedAt]       = useState<Date | null>(null)
  const [hasDraft,      setHasDraft]      = useState(false)
  const [saveIndicator, setSaveIndicator] = useState<DraftIndicator>('idle')
  const [relativeTime,  setRelativeTime]  = useState('')

  const debounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const indicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender     = useRef(true)

  // ── Check for existing draft on mount ───────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const stored: StoredDraft<T> = JSON.parse(raw)
      if (stored.userId !== userId || stored.formVersion !== FORM_VERSION) return
      const savedDate = new Date(stored.savedAt)
      const ageHours  = (Date.now() - savedDate.getTime()) / 3_600_000
      if (ageHours >= expiryHours) {
        localStorage.removeItem(storageKey)
        return
      }
      setHasDraft(true)
      setSavedAt(savedDate)
      setRelativeTime(getRelativeTime(savedDate))
    } catch { /* corrupt storage — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])   // run once on mount

  // ── Keep relative time fresh ─────────────────────────────────────────────
  useEffect(() => {
    if (!savedAt) return
    const interval = setInterval(() => setRelativeTime(getRelativeTime(savedAt)), 60_000)
    return () => clearInterval(interval)
  }, [savedAt])

  // ── Debounced auto-save on data change ───────────────────────────────────
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    // Skip empty forms
    const hasContent = Object.values(data as Record<string, unknown>).some(v => {
      if (typeof v === 'string')  return v.trim() !== ''
      if (typeof v === 'boolean') return v
      if (typeof v === 'number')  return v !== 0
      return v != null
    })
    if (!hasContent) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSaveIndicator('saving')
      try {
        const draft: StoredDraft<T> = {
          data:        sanitizeForDraft(data),
          savedAt:     new Date().toISOString(),
          formVersion: FORM_VERSION,
          userId,
        }
        localStorage.setItem(storageKey, JSON.stringify(draft))
        const now = new Date()
        setSavedAt(now)
        setHasDraft(true)
        setRelativeTime(getRelativeTime(now))
        setSaveIndicator('saved')
        if (indicatorTimerRef.current) clearTimeout(indicatorTimerRef.current)
        indicatorTimerRef.current = setTimeout(() => setSaveIndicator('idle'), 3_000)
      } catch {
        setSaveIndicator('error')
      }
    }, debounceMs)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // data changes on every render; storageKey/userId/debounceMs are stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey)
    setHasDraft(false)
    setSavedAt(null)
    setRelativeTime('')
    setSaveIndicator('idle')
  }, [storageKey])

  const restoreDraft = useCallback((): Partial<T> | null => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const stored: StoredDraft<T> = JSON.parse(raw)
      if (stored.userId !== userId) return null
      return stored.data
    } catch {
      return null
    }
  }, [storageKey, userId])

  return { savedAt, hasDraft, saveIndicator, relativeTime, clearDraft, restoreDraft }
}
