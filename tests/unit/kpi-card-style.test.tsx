import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { KpiCardLink } from '@/components/dashboard/KpiCardLink'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('KPI card style transitions', () => {
  it.each([false, true])('can enter and leave hover repeatedly without CSS conflicts (accent=%s)', accent => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<KpiCardLink href="/persons" accent={accent} hint="View employees">Headcount</KpiCardLink>)
    const link = screen.getByRole('link', { name: /Headcount/ })
    expect(link).toHaveAttribute('href', '/persons')
    for (let i = 0; i < 3; i++) {
      fireEvent.mouseEnter(link)
      fireEvent.mouseLeave(link)
    }
    const conflicts = errors.mock.calls.filter(args => args.some(value => typeof value === 'string' && value.includes('conflicting property')))
    expect(conflicts).toEqual([])
  })
})
