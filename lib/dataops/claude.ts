/**
 * NL→SQL generation using Anthropic claude-sonnet-4-6.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { SchemaTree } from './schema-discovery'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.ARIA_API_KEY,
})

function buildSchemaContext(schemas: SchemaTree[]): string {
  return schemas.map(s =>
    s.tables.map(t => {
      const cols = t.columns.map(c =>
        `  ${c.column_name} ${c.udt_name}${c.is_pk ? ' PK' : ''}${c.fk ? ` FK→${c.fk.foreign_table_name}.${c.fk.foreign_column_name}` : ''}`
      ).join('\n')
      return `TABLE ${s.schema}.${t.name}:\n${cols}`
    }).join('\n\n')
  ).join('\n\n')
}

export interface Nl2SqlResult {
  sql:         string
  explanation: string
  risk:        'LOW' | 'MEDIUM' | 'HIGH'
  confidence:  number
}

export async function generateSql(
  prompt: string,
  schemas: SchemaTree[],
): Promise<Nl2SqlResult> {
  const schemaCtx = buildSchemaContext(schemas)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are a PostgreSQL expert assistant. Given a database schema and a natural language question, generate a safe SQL query.

Rules:
- Only generate SELECT queries (no INSERT/UPDATE/DELETE/DDL)
- Use fully-qualified table names (schema.table)
- Prefer LIMIT 1000 unless user asks for all
- Output valid JSON only, no markdown

Schema:
${schemaCtx}`,
    messages: [
      {
        role: 'user',
        content: `Generate SQL for: ${prompt}

Respond with JSON only:
{
  "sql": "...",
  "explanation": "...",
  "risk": "LOW|MEDIUM|HIGH",
  "confidence": 0.0-1.0
}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  // Extract JSON — strip markdown code fences if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text]
  const jsonText  = (jsonMatch[1] ?? text).trim()

  try {
    const parsed = JSON.parse(jsonText) as Nl2SqlResult
    return {
      sql:         parsed.sql         ?? '',
      explanation: parsed.explanation ?? '',
      risk:        (parsed.risk as 'LOW' | 'MEDIUM' | 'HIGH') ?? 'LOW',
      confidence:  Number(parsed.confidence ?? 0.8),
    }
  } catch {
    // Fallback: return the raw text as sql
    return {
      sql:         text,
      explanation: 'Could not parse structured response',
      risk:        'MEDIUM',
      confidence:  0.5,
    }
  }
}
