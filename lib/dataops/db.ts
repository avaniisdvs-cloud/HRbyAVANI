/**
 * DataOps raw postgres.js client — separate from Drizzle ORM.
 * Used for information_schema introspection and arbitrary SQL execution.
 */
import postgres from 'postgres'

declare global {
  // eslint-disable-next-line no-var
  var _dataopsRawSql: ReturnType<typeof postgres> | undefined
}

function createRawClient() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  // max: 5 connections — DataOps is an admin tool, not a hot path
  return postgres(url, { max: 5 })
}

export const rawSql: ReturnType<typeof postgres> =
  globalThis._dataopsRawSql ?? createRawClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis._dataopsRawSql = rawSql
}
