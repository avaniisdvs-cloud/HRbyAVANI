import { act } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { Badge } from '@/components/ui/badge'

it('hydrates a badge inside descriptive paragraph text without repairing invalid HTML', async () => {
  const view = <p>Role <Badge variant="outline">ALL</Badge> applies to everyone.</p>
  const container = document.createElement('div')
  container.innerHTML = renderToString(view)
  document.body.appendChild(container)
  const errors: unknown[] = []
  let root: ReturnType<typeof hydrateRoot>
  await act(async () => { root = hydrateRoot(container, view, { onRecoverableError: error => errors.push(error) }) })
  expect(errors).toEqual([])
  expect(container.querySelector('p')?.textContent).toBe('Role ALL applies to everyone.')
  await act(async () => root.unmount())
  container.remove()
})
