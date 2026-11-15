'use client'

import { useEffect, useState } from 'react'
import { formatDate, type DateFormat } from '@/lib/format-date'

/**
 * Returns a formatter function that uses the user's saved date format preference.
 * Reads data-datefmt from <html> (set by PreferencesApplier on mount).
 * Defaults to 'DD-Mon-YYYY' if not set.
 */
export function useDateFormat(): (date: Date | string | null | undefined) => string {
  const [fmt, setFmt] = useState<DateFormat>('DD-Mon-YYYY')

  useEffect(() => {
    function read() {
      const attr = document.documentElement.dataset.datefmt as DateFormat | undefined
      if (attr && (attr === 'DD-Mon-YYYY' || attr === 'MM/DD/YYYY')) {
        setFmt(attr)
      }
    }
    read()

    // Re-read when PreferencesApplier updates the attribute
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-datefmt'] })
    return () => observer.disconnect()
  }, [])

  return (date) => formatDate(date, fmt)
}
