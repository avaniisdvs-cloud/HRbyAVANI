import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

/** Shared presentation roles; caller content, handlers and form behavior are unchanged. */
export function PageTitle({ className, style, ...props }: ComponentPropsWithoutRef<'h1'>) {
  return <h1 {...props} className={cn('ui-page-title', className)} style={{ ...style,
    fontFamily: 'var(--font-serif)', fontSize: 'var(--text-page-title)', fontWeight: 600,
    lineHeight: 1.25, letterSpacing: 0, color: 'var(--ink-1)',
  }} />
}

export function SectionTitle({ className, style, ...props }: ComponentPropsWithoutRef<'h2'>) {
  return <h2 {...props} className={cn('ui-section-title', className)} style={{ ...style,
    fontFamily: 'var(--font-sans)', fontSize: 'var(--text-section-title)', fontWeight: 600,
    lineHeight: 1.3, color: 'var(--ink-1)',
  }} />
}

export function DialogHeading({ className, style, ...props }: ComponentPropsWithoutRef<'h2'>) {
  return <h2 {...props} className={cn('ui-dialog-title', className)} style={{ ...style,
    fontFamily: 'var(--font-serif)', fontSize: 'var(--text-dialog-title)', fontWeight: 600,
    lineHeight: 1.3, color: 'var(--ink-1)',
  }} />
}
