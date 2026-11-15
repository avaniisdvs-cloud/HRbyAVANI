'use client'
import { useState, useCallback } from 'react'

export type SortDirection = 'asc' | 'desc' | null

export type SortState = {
  column: string | null
  direction: SortDirection
}

export function useTableSort(defaultColumn?: string, defaultDir?: SortDirection) {
  const [sort, setSort] = useState<SortState>({
    column:    defaultColumn ?? null,
    direction: defaultDir    ?? null,
  })

  const handleSort = useCallback((column: string) => {
    setSort(prev => {
      if (prev.column === column) {
        if (prev.direction === 'asc')  return { column, direction: 'desc' }
        if (prev.direction === 'desc') return { column: null, direction: null }
        return { column, direction: 'asc' }
      }
      return { column, direction: 'asc' }
    })
  }, [])

  return { sort, handleSort }
}
