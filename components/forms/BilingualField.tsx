'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Side-by-side EN + AR text input pair.
 * Honors Hard Rule 4: every user-facing string has both name_en and name_ar.
 *
 * The AR field renders with dir="rtl" so the cursor and character order
 * match Arabic conventions, regardless of the document's current direction.
 */
export interface BilingualFieldProps {
  /** Field key — used as the form-element name (suffixed with En/Ar). */
  name:        string
  labelEn:     string
  labelAr:     string
  valueEn?:    string
  valueAr?:    string
  onChangeEn?:    (value: string) => void
  onChangeAr?:    (value: string) => void
  onBlurEn?:      () => void
  requiredEn?:    boolean
  requiredAr?:    boolean
  placeholderEn?: string
  placeholderAr?: string
  disabled?:      boolean
  disabledAr?:    boolean
  translatingAr?: boolean
  className?:     string
  /** Helper shown beneath both fields (e.g. validation hint). */
  helpText?:   string
  errorEn?:    string
  errorAr?:    string
}

export function BilingualField({
  name,
  labelEn, labelAr,
  valueEn, valueAr,
  onChangeEn, onChangeAr,
  onBlurEn,
  requiredEn, requiredAr,
  placeholderEn, placeholderAr,
  disabled,
  disabledAr,
  translatingAr,
  className,
  helpText,
  errorEn, errorAr,
}: BilingualFieldProps) {
  const enId = `${name}-en`
  const arId = `${name}-ar`

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      <div className="space-y-1.5">
        <Label htmlFor={enId} className="text-xs font-medium text-ink-2">
          {labelEn}
          {requiredEn && <span className="ms-0.5 text-destructive">*</span>}
          <span className="ms-2 text-xs uppercase tracking-wide text-ink-3">EN</span>
        </Label>
        <Input
          id={enId}
          name={`${name}En`}
          dir="ltr"
          value={valueEn ?? ''}
          onChange={e => onChangeEn?.(e.target.value)}
          onBlur={onBlurEn}
          placeholder={placeholderEn}
          disabled={disabled}
          required={requiredEn}
          aria-invalid={errorEn ? true : undefined}
        />
        {errorEn && <p className="text-xs text-destructive">{errorEn}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={arId} className="text-xs font-medium text-ink-2">
          {labelAr}
          {requiredAr && <span className="ms-0.5 text-destructive">*</span>}
          {translatingAr && <span className="ms-1.5 text-xs italic text-ink-4">جاري الترجمة…</span>}
          <span className="ms-2 text-xs uppercase tracking-wide text-ink-3">AR</span>
        </Label>
        <Input
          id={arId}
          name={`${name}Ar`}
          dir="rtl"
          lang="ar"
          value={valueAr ?? ''}
          onChange={e => onChangeAr?.(e.target.value)}
          placeholder={placeholderAr}
          disabled={disabled || disabledAr || translatingAr}
          required={requiredAr}
          aria-invalid={errorAr ? true : undefined}
          className="font-sans text-end"
          style={translatingAr ? { opacity: 0.6 } : undefined}
        />
        {errorAr && <p className="text-xs text-destructive">{errorAr}</p>}
      </div>
      {helpText && (
        <p className="col-span-full text-xs text-ink-3">{helpText}</p>
      )}
    </div>
  )
}
