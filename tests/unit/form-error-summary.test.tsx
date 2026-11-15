import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FormErrorSummary } from '@/components/forms/FormErrorSummary'

afterEach(cleanup)
it('focuses validation feedback and links to its invalid field', () => {
  render(<><FormErrorSummary errors={{ firstName: 'Enter a first name' }} /><input id="firstName" aria-label="First name" /></>)
  expect(screen.getByRole('alert')).toHaveFocus()
  const field = screen.getByRole('textbox')
  field.scrollIntoView = () => {}
  fireEvent.click(screen.getByRole('link', { name: 'Enter a first name' }))
  expect(field).toHaveFocus()
})
it('does not announce an empty summary', () => {
  render(<FormErrorSummary errors={{}} />)
  expect(screen.queryByRole('alert')).toBeNull()
})
