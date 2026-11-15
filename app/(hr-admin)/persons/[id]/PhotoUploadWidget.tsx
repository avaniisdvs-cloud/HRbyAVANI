'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { uploadProfilePhoto } from '@/modules/core-hr'

interface Props {
  personId:        string
  /** When provided, renders as a self-contained circle with photo + camera overlay. */
  currentPhotoUrl?: string | null
  /** Fallback initials shown when no photo is available (standalone mode only). */
  initials?:       string
  /** Called after a successful upload so the parent can track the photo-saved state. */
  onSaved?:        () => void
}

export function PhotoUploadWidget({ personId, currentPhotoUrl, initials, onSaved }: Props) {
  const locale                = useLocale()
  const inputRef              = useRef<HTMLInputElement>(null)
  const [error, setError]     = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saved, setSaved]     = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setSaved(false)

    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    const form = new FormData()
    form.append('photo', file)

    startTransition(async () => {
      try {
        const result = await uploadProfilePhoto(personId, form)
        // Only mark saved when a non-empty URL/data was durably persisted.
        // result.photoUrl is cloud URL or base64 data URL — never empty on success.
        if (result.photoUrl) {
          // Update preview to the persisted value (base64 data URL if no cloud storage)
          setPreview(result.photoData || result.photoUrl)
          setSaved(true)
          onSaved?.()
        } else {
          setError(locale === 'ar' ? 'تعذّر حفظ الصورة — التخزين غير مُهيّأ. تواصل مع تقنية المعلومات.' : 'Photo could not be saved — storage not configured. Contact IT.')
          setPreview(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : (locale === 'ar' ? 'فشل الرفع' : 'Upload failed'))
        setPreview(null)
      }
    })

    e.target.value = ''
  }

  const overlayButton = (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        className="flex h-full w-full items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={locale === 'ar' ? 'تغيير الصورة الشخصية' : 'Change profile photo'}
        title={locale === 'ar' ? 'تغيير الصورة الشخصية' : 'Change profile photo'}
      >
        {isPending
          ? <Loader2 className="h-5 w-5 animate-spin text-white" />
          : <Camera   className="h-5 w-5 text-white" strokeWidth={1.75} />
        }
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={handleChange}
        aria-hidden
      />
      {error && (
        <p
          role="alert"
          className="absolute top-full mt-1 w-48 rounded bg-red-50 px-2 py-1 text-center text-xs text-red-700 ring-1 ring-red-200"
        >
          {error}
        </p>
      )}
    </>
  )

  // ── Standalone mode (edit form) — renders its own circle container ─────────
  if (currentPhotoUrl !== undefined || initials !== undefined) {
    const photoSrc = preview ?? currentPhotoUrl
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          className="group relative"
          style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, position: 'relative' }}
        >
          {photoSrc ? (
            <img
              src={photoSrc}
              alt=""
              aria-hidden
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: 'var(--accent)', color: 'var(--card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-sans)',
            }}>
              {initials ?? ''}
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            {overlayButton}
          </div>
        </div>
        <div>
          {saved ? (
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--status-approved-fg)', margin: '0 0 4px', fontWeight: 500 }}>
              {locale === 'ar' ? '✓ تم حفظ الصورة' : '✓ Photo saved'}
            </p>
          ) : (
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', margin: '0 0 4px' }}>
              {locale === 'ar' ? 'انقر على الدائرة لرفع صورة.' : 'Click the circle to upload a photo.'}
            </p>
          )}
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
            {locale === 'ar' ? 'JPEG أو PNG أو WebP أو GIF · بحد أقصى 2 ميجابايت' : 'JPEG, PNG, WebP or GIF · max 2 MB'}
          </span>
        </div>
      </div>
    )
  }

  // ── Overlay mode (profile page) — must be placed inside a `group relative` parent ──
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {overlayButton}
    </div>
  )
}
