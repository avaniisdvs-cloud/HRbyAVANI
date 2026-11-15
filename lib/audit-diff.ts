export interface DiffLine {
  fieldKey:   string
  fieldLabel: string
  oldDisplay: string
  newDisplay: string
}

function displayValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'boolean') return val ? 'Active' : 'Inactive'
  return String(val)
}

const SKIP_KEYS = new Set([
  'id', 'tenantId',
  'createdBy', 'createdByName', 'updatedBy', 'updatedByName',
  'createdAt', 'updatedAt', 'createdDate', 'updatedDate',
  'lastUpdatedDate', 'lastModifiedDate',
  'isActive',
])

function normalise(val: unknown): unknown {
  // Treat null and undefined as identical so we never show "— → —"
  if (val === null || val === undefined) return null
  return val
}

export function computeDiff(
  oldValues:   Record<string, unknown>,
  newValues:   Record<string, unknown>,
  fieldLabels: Record<string, string>,
): DiffLine[] {
  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)])
  const lines: DiffLine[] = []

  for (const key of allKeys) {
    if (SKIP_KEYS.has(key)) continue

    const oldVal = normalise(oldValues[key])
    const newVal = normalise(newValues[key])
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue

    const label = fieldLabels[key] ?? key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim()

    lines.push({
      fieldKey:   key,
      fieldLabel: label,
      oldDisplay: displayValue(oldVal),
      newDisplay: displayValue(newVal),
    })
  }

  return lines
}
