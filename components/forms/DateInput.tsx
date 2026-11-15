'use client'

/**
 * DateInput — a year-safe wrapper around <input type="date">.
 *
 * Problem it solves: browsers allow manual entry of 5-digit (or more) years
 * in <input type="date"> fields (e.g. typing "01/05/20256"). This component
 * intercepts every change event and clamps the year to at most 4 digits,
 * keeping all persisted values within the valid HR year range.
 *
 * Drop-in replacement for raw <input type="date"> and for the shadcn <Input>
 * component when used with type="date".
 *
 * Features:
 *  • Clamps year to 4 digits on every onChange
 *  • Sets min/max attributes so the browser's own picker stays in range
 *  • Accepts all standard HTMLInputElement props (value, onChange, disabled, …)
 *  • Forwards className / style unchanged so it blends into any existing layout
 *
 * Usage:
 *   // replaces:  <input type="date" value={x} onChange={e => setX(e.target.value)} />
 *   // with:      <DateInput value={x} onChange={e => setX(e.target.value)} />
 *
 *   // shadcn variant:
 *   //   <DateInput shadcn value={x} onChange={e => setX(e.target.value)} />
 */

import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { clampDateYear, HR_MIN_YEAR, HR_MAX_YEAR } from '@/lib/validation/date-validators'

function pad(n: number, w = 2) {
  return String(n).padStart(w, '0')
}

const HR_MIN_DATE = `${HR_MIN_YEAR}-01-01`
const HR_MAX_DATE = `${HR_MAX_YEAR}-12-31`

export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Apply shadcn Input ring/border styling (default false — raw input style) */
  shadcn?: boolean
}

/**
 * Core year-clamping handler.
 * Called from onChange; returns the clamped value (or the original if fine).
 */
function guardYear(raw: string): string {
  if (!raw) return raw
  const clamped = clampDateYear(raw)
  if (clamped === raw) return raw
  return clamped
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput(
    { shadcn = false, className, min, max, onChange, ...rest },
    ref,
  ) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      const clamped = guardYear(raw)
      if (clamped !== raw) {
        // Mutate the synthetic event value so the caller receives the clamped string
        // without needing to manage a controlled intermediate state here.
        Object.defineProperty(e, 'target', {
          writable: false,
          value: Object.assign(Object.create(e.target), { value: clamped }),
        })
      }
      onChange?.(e)
    }

    const baseClass = shadcn
      ? cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1',
          'text-sm shadow-sm transition-colors',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )
      : className

    return (
      <input
        {...rest}
        ref={ref}
        type="date"
        className={baseClass}
        min={min ?? HR_MIN_DATE}
        max={max ?? HR_MAX_DATE}
        onChange={handleChange}
      />
    )
  },
)

DateInput.displayName = 'DateInput'
