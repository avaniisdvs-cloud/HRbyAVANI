import { asc, desc, type SQL } from 'drizzle-orm'
import type { Column } from 'drizzle-orm'

export type SortParam = {
  column:    string | null
  direction: 'asc' | 'desc' | null
}

export function buildOrderBy(
  sort: SortParam,
  columnMap: Record<string, Column>,
  defaultColumn: Column,
): SQL[] {
  if (!sort.column || !sort.direction || !columnMap[sort.column]) {
    return [asc(defaultColumn)]
  }
  const col = columnMap[sort.column]!
  return [sort.direction === 'asc' ? asc(col) : desc(col)]
}
