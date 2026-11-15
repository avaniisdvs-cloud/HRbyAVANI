'use client'

/**
 * ErrorAlert — standard user-facing error banner.
 *
 * Used anywhere a Server Action error must be shown inline (forms, panels,
 * decision bars). Accepts the caught error value directly and extracts the
 * human-readable message automatically.
 *
 * Props:
 *   error   — the raw caught value from a catch block (or null/undefined = hidden)
 *   title   — optional override heading (defaults to "Something went wrong")
 *   onClose — optional dismiss handler
 *
 * Usage:
 *   const [error, setError] = useState<unknown>(null)
 *   ...
 *   catch (e) { setError(e) }
 *   ...
 *   <ErrorAlert error={error} onClose={() => setError(null)} />
 *
 * Also accepts a plain string via the `message` prop for static messages.
 */

import { X } from 'lucide-react'
import { GENERIC_ERROR } from '@/lib/app-error'
import { useLocale } from '@/components/providers/LocaleProvider'

interface Props {
  /** Raw caught value — Error, string, or unknown. Pass null/undefined to hide. */
  error?: unknown
  /** Plain message string (use instead of error when you already have the text). */
  message?: string | null
  /** Heading shown above the message. */
  title?: string
  /** If provided, a dismiss button is shown. */
  onClose?: () => void
  className?: string
}

function extractMessage(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error || GENERIC_ERROR
  if (error instanceof Error) return error.message || GENERIC_ERROR
  return GENERIC_ERROR
}

export function ErrorAlert({ error, message, title, onClose, className = '' }: Props) {
  const locale = useLocale()
  const visible = error != null || (message != null && message !== '')
  if (!visible) return null

  const text = message ?? extractMessage(error)

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`rounded-md border border-destructive/30 bg-destructive/8 p-3 text-sm ${className}`}
    >
      <div className="flex items-start gap-2">
        <svg
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <div className="flex-1 space-y-0.5">
          <p className="font-semibold text-destructive">
            {title ?? (locale === 'ar' ? 'تعذّر إتمام هذا الإجراء' : 'This action could not be completed')}
          </p>
          <p className="text-destructive/90 leading-snug">{text}</p>
          <p className="text-xs text-destructive/60 mt-1">
            {locale === 'ar'
              ? 'إذا استمر حدوث ذلك، يرجى التواصل مع الدعم الفني ووصف ما كنت تقوم به.'
              : 'If this keeps happening, contact IT support and describe what you were doing.'}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={locale === 'ar' ? 'إغلاق التنبيه' : 'Dismiss error'}
            className="shrink-0 text-destructive/60 hover:text-destructive transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
