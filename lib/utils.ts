import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Date formatting (DD-Mon-YYYY standard) ────────────────────────────────────
export { formatDMY, formatDMYTime, formatRelative, dateToInputValue, isExpiringSoon, isExpired } from './utils/date-format'
