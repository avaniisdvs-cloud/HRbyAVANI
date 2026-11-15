'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Permission / error state of the mic button */
export type PermState =
  | 'idle'        // no activity, ready to request
  | 'requesting'  // getUserMedia in-flight (spinner)
  | 'denied'      // browser blocked (red icon)
  | 'no-device'   // no mic hardware found (amber icon)
  | 'in-use'      // mic busy by another app (amber icon)
  | 'error'       // other / HTTPS-required / not-supported (amber icon)

/** Which guidance panel to render (null = none) */
export type MicGuideType =
  | 'denied'
  | 'no-device'
  | 'in-use'
  | 'https-required'
  | 'not-supported'
  | null

interface Options {
  /** Called when the browser revokes mic permission mid-session */
  onRevoked?: () => void
}

export interface UseMicPermissionReturn {
  permState:          PermState
  guideType:          MicGuideType
  /** True when permission state is 'prompt' — show hover tooltip */
  showHint:           boolean
  /**
   * Called by the mic button onClick.
   * - If already requesting: no-op.
   * - If denied (button shows red): shows guide without calling getUserMedia.
   * - Otherwise: calls getUserMedia and returns true if granted.
   */
  requestPermission:  () => Promise<boolean>
  /**
   * Called by the "Try again" button in the guide.
   * Always calls getUserMedia regardless of current state.
   */
  retry:              () => Promise<boolean>
  /** Dismiss the guide panel (e.g. "Use text instead") */
  dismissGuide:       () => void
}

// ─── Module-level helpers (no React deps, safe to define outside hook) ────────

type GetUserMediaOutcome =
  | 'granted'
  | 'denied'
  | 'no-device'
  | 'in-use'
  | 'aborted'
  | 'error'

async function probeUserMedia(): Promise<GetUserMediaOutcome> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
    })
    stream.getTracks().forEach(t => t.stop())
    return 'granted'
  } catch (e: unknown) {
    if (!(e instanceof DOMException)) return 'error'
    switch (e.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'denied'
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'no-device'
      case 'NotReadableError':
      case 'TrackStartError':
        return 'in-use'
      case 'OverconstrainedError': {
        // Retry with basic constraints
        try {
          const s2 = await navigator.mediaDevices.getUserMedia({ audio: true })
          s2.getTracks().forEach(t => t.stop())
          return 'granted'
        } catch {
          return 'error'
        }
      }
      case 'AbortError':
        return 'aborted'
      default:
        return 'error'
    }
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMicPermission({ onRevoked }: Options = {}): UseMicPermissionReturn {
  const [permState, _setPermState] = useState<PermState>('idle')
  const [guideType, setGuideType]  = useState<MicGuideType>(null)
  const [showHint,  setShowHint]   = useState(false)

  // Keep a ref so async callbacks always read the latest state/callback
  const permStateRef  = useRef<PermState>('idle')
  const onRevokedRef  = useRef(onRevoked)
  const grantedRef    = useRef(false)   // true once we know browser has granted mic
  onRevokedRef.current = onRevoked

  const setPermState = useCallback((s: PermState) => {
    permStateRef.current = s
    _setPermState(s)
  }, [])

  // ── Startup: API availability + HTTPS check + permission query ──────────────
  useEffect(() => {
    // Check Web Speech API support — getUserMedia alone is not enough
    const w = window as any
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) {
      setPermState('error')
      setGuideType('not-supported')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermState('error')
      setGuideType('not-supported')
      return
    }
    if (
      location.protocol !== 'https:' &&
      location.hostname !== 'localhost' &&
      location.hostname !== '127.0.0.1'
    ) {
      setPermState('error')
      setGuideType('https-required')
      return
    }

    if (!navigator.permissions) return

    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then(status => {
        // Reflect existing state in the button without showing the guide yet
        if (status.state === 'granted') {
          grantedRef.current = true
        } else if (status.state === 'denied') {
          setPermState('denied')
        } else if (status.state === 'prompt') {
          setShowHint(true)
        }

        // React to runtime permission changes (user toggles in browser settings)
        status.addEventListener('change', () => {
          if (status.state === 'denied') {
            grantedRef.current = false
            setPermState('denied')
            setGuideType('denied')   // mid-session revoke → show guide immediately
            onRevokedRef.current?.()
          } else if (status.state === 'granted') {
            grantedRef.current = true
            setPermState('idle')
            setGuideType(null)
            setShowHint(false)
          } else if (status.state === 'prompt') {
            grantedRef.current = false
            setPermState('idle')
            setGuideType(null)
            setShowHint(true)
          }
        })
      })
      .catch(() => { /* Permissions API not supported — no-op */ })
  }, [setPermState])

  // ── Shared result handler ───────────────────────────────────────────────────
  function applyOutcome(outcome: GetUserMediaOutcome): boolean {
    switch (outcome) {
      case 'granted':
        setShowHint(false)
        setPermState('idle')
        return true
      case 'denied':
        setPermState('denied')
        setGuideType('denied')
        return false
      case 'no-device':
        setPermState('no-device')
        setGuideType('no-device')
        return false
      case 'in-use':
        setPermState('in-use')
        setGuideType('in-use')
        return false
      case 'aborted':
        setPermState('idle')  // user dismissed popup — silent reset
        return false
      default:
        setPermState('error')
        return false
    }
  }

  // ── requestPermission — called by the mic button ────────────────────────────
  const requestPermission = useCallback(async (): Promise<boolean> => {
    const cur = permStateRef.current
    if (cur === 'requesting') return false
    if (cur === 'denied') {
      setGuideType('denied')
      return false
    }
    // Skip probeUserMedia if browser already granted — avoids a getUserMedia/
    // SpeechRecognition timing conflict where releasing the probe stream
    // causes SpeechRecognition to fail immediately after.
    if (grantedRef.current) return true
    setPermState('requesting')
    setGuideType(null)
    setShowHint(false)
    const outcome = await probeUserMedia()
    if (outcome === 'granted') grantedRef.current = true
    return applyOutcome(outcome)
  }, [setPermState]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── retry — called by the "Try again" button in MicPermissionGuide ──────────
  const retry = useCallback(async (): Promise<boolean> => {
    // Always attempts getUserMedia regardless of current state
    // (user should have unblocked it in browser settings by now)
    setPermState('requesting')
    setGuideType(null)
    return applyOutcome(await probeUserMedia())
  }, [setPermState]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── dismissGuide — "Use text instead" ───────────────────────────────────────
  const dismissGuide = useCallback(() => {
    setGuideType(null)
    const cur = permStateRef.current
    if (cur !== 'denied' && cur !== 'no-device' && cur !== 'in-use' && cur !== 'error') {
      setPermState('idle')
    }
  }, [setPermState])

  return { permState, guideType, showHint, requestPermission, retry, dismissGuide }
}
