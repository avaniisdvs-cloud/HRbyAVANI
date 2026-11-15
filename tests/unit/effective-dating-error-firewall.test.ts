import { describe, expect, it } from 'vitest'
import { translateError } from '@/lib/app-error'

function translatedMessage(error: unknown): string {
  try {
    translateError(error, 'ed-freeze-cert')
  } catch (translated) {
    return (translated as Error).message
  }
  throw new Error('translateError unexpectedly returned')
}

describe('Core HR effective-dating error firewall', () => {
  it('maps overlap exclusion violations to a business-safe effective-dating message', () => {
    const raw = new Error('conflicting key value violates exclusion constraint "excl_worker_assignments_no_overlap"')
    ;(raw as unknown as Record<string, unknown>).code = '23P01'

    const message = translatedMessage(raw)

    expect(message).toContain('effective-dated change overlaps an existing timeline row')
    expect(message).not.toMatch(/exclusion constraint|excl_worker_assignments_no_overlap|conflicting key/i)
  })

  it('maps duplicate-current and date-order violations without leaking raw database text', () => {
    const duplicate = new Error('duplicate key value violates unique constraint "uq_worker_assignments_one_current"')
    ;(duplicate as unknown as Record<string, unknown>).code = '23505'

    const dateOrder = new Error('new row violates check constraint "chk_worker_assignments_date_order"')
    ;(dateOrder as unknown as Record<string, unknown>).code = '23514'

    expect(translatedMessage(duplicate)).toBe('This record already exists. Please check for duplicates and try again.')
    expect(translatedMessage(dateOrder)).toBe('The submitted data does not meet a validation rule. Please check your entries.')
  })
})
