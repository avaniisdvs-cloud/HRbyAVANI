/**
 * Bootstraps the `dataops` schema and its 3 tables on first API call.
 * Idempotent — safe to call on every cold start.
 */
import { rawSql } from './db'

let bootstrapped = false

export async function bootstrapDataops(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true

  await rawSql`CREATE SCHEMA IF NOT EXISTS dataops`

  await rawSql`
    CREATE TABLE IF NOT EXISTS dataops.audit_log (
      id            BIGSERIAL PRIMARY KEY,
      ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor_id      TEXT        NOT NULL,
      actor_role    TEXT        NOT NULL,
      operation     TEXT        NOT NULL,
      schema_name   TEXT        NOT NULL,
      table_name    TEXT        NOT NULL,
      pk_value      TEXT,
      row_snapshot  JSONB,
      sql_text      TEXT,
      row_count     INT         NOT NULL DEFAULT 1
    )
  `

  await rawSql`
    CREATE TABLE IF NOT EXISTS dataops.snapshots (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
      schema_name  TEXT        NOT NULL,
      table_name   TEXT        NOT NULL,
      pk_value     TEXT        NOT NULL,
      snapshot     JSONB       NOT NULL
    )
  `

  await rawSql`
    CREATE TABLE IF NOT EXISTS dataops.saved_queries (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      name        TEXT        NOT NULL,
      description TEXT,
      sql_text    TEXT        NOT NULL,
      tags        TEXT[]      NOT NULL DEFAULT '{}'
    )
  `
}
