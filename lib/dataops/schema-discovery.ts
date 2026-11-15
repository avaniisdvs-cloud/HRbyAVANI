/**
 * DataOps schema discovery — queries information_schema for tables, columns,
 * indexes, and FK relationships.
 */
import { rawSql } from './db'

export interface ColumnDef {
  column_name:       string
  udt_name:          string
  data_type:         string
  is_nullable:       'YES' | 'NO'
  column_default:    string | null
  character_maximum_length: number | null
  is_pk:             boolean
  fk?: {
    foreign_table_schema: string
    foreign_table_name:   string
    foreign_column_name:  string
  }
}

export interface TableMeta {
  schema:      string
  name:        string
  row_count:   number
  size_pretty: string
  columns:     ColumnDef[]
  indexes:     string[]
}

export interface SchemaTree {
  schema:   string
  tables:   TableMeta[]
}

// 60-second in-memory cache
let cache: { ts: number; data: SchemaTree[] } | null = null

export function bustCache() {
  cache = null
}

export async function discoverSchemas(): Promise<SchemaTree[]> {
  if (cache && Date.now() - cache.ts < 60_000) return cache.data

  // All non-system schemas
  const schemaRows = await rawSql<{ schema_name: string }[]>`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_catalog','pg_toast','pg_temp','information_schema')
      AND schema_name NOT LIKE 'pg_temp_%'
      AND schema_name NOT LIKE 'pg_toast_temp_%'
    ORDER BY schema_name
  `

  const result: SchemaTree[] = []

  for (const { schema_name } of schemaRows) {
    const tableRows = await rawSql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ${schema_name}
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `

    const tables: TableMeta[] = []

    for (const { table_name } of tableRows) {
      const [colRows, pkRows, fkRows, idxRows, statsRow] = await Promise.all([
        // columns
        rawSql<{
          column_name: string
          udt_name: string
          data_type: string
          is_nullable: string
          column_default: string | null
          character_maximum_length: number | null
        }[]>`
          SELECT column_name, udt_name, data_type, is_nullable,
                 column_default, character_maximum_length
          FROM information_schema.columns
          WHERE table_schema = ${schema_name} AND table_name = ${table_name}
          ORDER BY ordinal_position
        `,
        // primary keys
        rawSql<{ column_name: string }[]>`
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = ${schema_name}
            AND tc.table_name  = ${table_name}
        `,
        // foreign keys
        rawSql<{
          column_name: string
          foreign_table_schema: string
          foreign_table_name: string
          foreign_column_name: string
        }[]>`
          SELECT kcu.column_name,
                 ccu.table_schema AS foreign_table_schema,
                 ccu.table_name   AS foreign_table_name,
                 ccu.column_name  AS foreign_column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = ${schema_name}
            AND tc.table_name  = ${table_name}
        `,
        // indexes
        rawSql<{ indexname: string }[]>`
          SELECT indexname FROM pg_indexes
          WHERE schemaname = ${schema_name} AND tablename = ${table_name}
          ORDER BY indexname
        `,
        // row count + size estimate
        rawSql<{ row_count: number; size_pretty: string }[]>`
          SELECT
            (SELECT reltuples::bigint FROM pg_class
             WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = ${schema_name})
               AND relname = ${table_name}) AS row_count,
            pg_size_pretty(
              pg_total_relation_size(
                (SELECT oid FROM pg_class
                 WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = ${schema_name})
                   AND relname = ${table_name})
              )
            ) AS size_pretty
        `,
      ])

      const pkCols = new Set(pkRows.map(r => r.column_name))
      const fkMap  = new Map(fkRows.map(r => [r.column_name, r]))

      const columns: ColumnDef[] = colRows.map(c => ({
        column_name:              c.column_name,
        udt_name:                 c.udt_name,
        data_type:                c.data_type,
        is_nullable:              c.is_nullable as 'YES' | 'NO',
        column_default:           c.column_default,
        character_maximum_length: c.character_maximum_length,
        is_pk:                    pkCols.has(c.column_name),
        fk:                       fkMap.get(c.column_name),
      }))

      tables.push({
        schema:      schema_name,
        name:        table_name,
        row_count:   Number(statsRow[0]?.row_count ?? 0),
        size_pretty: statsRow[0]?.size_pretty ?? '?',
        columns,
        indexes:     idxRows.map(r => r.indexname),
      })
    }

    result.push({ schema: schema_name, tables })
  }

  cache = { ts: Date.now(), data: result }
  return result
}

export async function getTableMeta(schema: string, table: string): Promise<TableMeta | null> {
  const schemas = await discoverSchemas()
  return schemas.find(s => s.schema === schema)?.tables.find(t => t.name === table) ?? null
}
