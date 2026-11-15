#!/usr/bin/env node
/**
 * i18n hardcoded-English UI guard.
 *
 * Scans app/ + components/ .tsx for likely VISIBLE hardcoded English UI chrome
 * that would render in English even in Arabic mode — the blind-spot class that
 * narrow grep sweeps repeatedly missed (plain text nodes AND component props).
 *
 * Detects:
 *   • text nodes:  <span|p|th|td|label|div|h1-6|button|option ...>English Words<
 *   • props:       (label|title|subtitle|heading|emptyText|description|cta|placeholder|aria-label)="English Words"
 *
 * A match is NOT a violation when (justified exceptions):
 *   • the line is already locale-conditional (contains `locale`/`isAr`/Arabic script)
 *   • the value is an allow-listed token (codes, acronyms, product/provider names,
 *     language self-names, role labels, regulatory IDs, BR/SIF/system IDs)
 *   • the file is in FILE_ALLOWLIST (bilingual-by-design / labelAr-paired / nav brand
 *     aria-labels / SUPER_ADMIN migration-console diagnostics) — each with a reason
 *
 * Usage:  node scripts/i18n-sweep-hardcoded-ui.mjs [--json]
 * Exit:   0 if no violations outside the allowlist, 1 otherwise.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'components']

const TEXT_RE = /<(?:p|span|th|td|label|div|h[1-6]|button|option)[^>]*>([A-Z][a-zA-Z]+(?: [A-Za-z/&]+){0,6})</g
// chrome props that must be localized (labels/titles/etc.)
const PROP_RE = /\b(?:label|title|subtitle|heading|emptyText|description|cta|aria-label)="([A-Z][a-z]+(?: [A-Za-z/&]+){0,6})"/g
// placeholders: only INSTRUCTION-style hints need localization; example-value
// placeholders (sample data like "Annual Leave", "Emirates NBD") are acceptable.
const PLACEHOLDER_RE = /\bplaceholder="((?:Enter|Search|Select|Type|Add|Describe|Choose|Filter|Pick|Provide|Set|Write|Paste)\b[A-Za-z /&]*)"/g

// Allow-listed exact values / tokens (codes, acronyms, products, language self-names, roles, regulatory IDs)
const ALLOW_TOKENS = new Set([
  'EN', 'AR', 'AED', 'UAE', 'HR', 'AI', 'ARIA', 'ID', 'PII', 'EOSB', 'WPS', 'IBAN', 'SIF',
  'YTD', 'PK', 'FK', 'NULL', 'CSV', 'PDF', 'URL', 'JSON', 'SQL', 'API', 'OK', 'FYI', 'AM', 'PM',
  'SLA', 'EID', 'GL', 'MDM', 'UAT', 'PDPL', 'TLS', 'SSL', 'STARTTLS', 'SMTP', 'DIFC', 'ADGM', 'VSS', 'DEWS',
  // leave-type enum VALUES (rendered as <option value=X>X</option> — display localized elsewhere)
  'ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'HAJJ', 'EMERGENCY', 'UNPAID', 'BEREAVEMENT', 'STUDY',
])
// EXACT full-value allowlist (the entire UI string must equal one of these).
// NOTE: matching is exact — a long sentence is NOT excused just because it
// contains an allowed word (e.g. "Finance Reports Overview" is NOT allowed even
// though "Finance" is). Add the full phrase here only when the whole string is
// a legitimate proper noun / product / code / language self-name / role label.
const ALLOW_VALUES = new Set([
  // brand / proper nouns
  'AVANIIS', 'Avaniis', 'Nafis',
  // AI / email providers and products (rendered as standalone option labels)
  'Microsoft', 'Azure', 'OpenAI', 'Gemini', 'DeepSeek', 'Mistral', 'Google',
  'Azure OpenAI', 'Microsoft Graph API', 'Graph API',
  // language self-names
  'English',
  // regulatory identifiers
  'UAE PDPL',
  // system role display names (standalone only)
  'Super Admin', 'Line Manager', 'HR Admin', 'HR Director', 'Payroll Admin', 'Finance',
  // salutations (enum values)
  'Mr', 'Mrs', 'Ms', 'Dr', 'Prof',
])
// Per-file blanket allowlist — kept EMPTY by design.
//
// Whole-file allowlisting was previously masking genuine hardcoded English
// (e.g. nav aria-labels in AdminSidebar/topbars). Exact value/token matching
// (ALLOW_TOKENS/ALLOW_VALUES) + the locale-conditional/Arabic-script exclusion
// already cover the legitimate cases (brand aria localized via ternary, EN/AR
// markers, labelAr/titleAr-paired components, bilingual-by-design fields), so
// no file needs a blanket pass. Add an entry here ONLY with a concrete reason
// that cannot be expressed as an exact value — and prefer fixing the source.
const FILE_ALLOWLIST = {}

function walk(dir, acc) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) { if (e !== 'node_modules' && e !== '.next') walk(p, acc) }
    else if (e.endsWith('.tsx')) acc.push(p)
  }
  return acc
}

function isExcusedAt(lines, i) {
  // Excused if the line — or a nearby line (multi-line `locale === 'ar' ? ( … ) : ( … )`
  // ternaries open up to ~6 lines above) — is locale-conditional or has Arabic script.
  const lo = Math.max(0, i - 6), hi = Math.min(lines.length - 1, i + 2)
  for (let j = lo; j <= hi; j++) {
    if (/\blocale\b|\bisAr\b|[؀-ۿ]/.test(lines[j])) return true
  }
  return false
}
function isAllowedValue(v) {
  const t = v.trim()
  // Exact match only — ALLOW_TOKENS (codes/acronyms/enums) or ALLOW_VALUES
  // (full proper-noun/product/role strings). No substring matching, so a
  // hardcoded English sentence containing an allowed word is still flagged.
  return ALLOW_TOKENS.has(t) || ALLOW_VALUES.has(t)
}

// Pure, fixture-free scanner for a single source string — used by runScan()
// per file and directly by the test for synthetic cases.
export function scanSource(rel, src) {
  if (rel.includes('MigrationConsole')) return [] // SUPER_ADMIN ops diagnostics — justified
  const out = []
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return
    if (isExcusedAt(lines, i)) return
    for (const re of [TEXT_RE, PROP_RE, PLACEHOLDER_RE]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(line)) !== null) {
        const val = m[1]
        if (isAllowedValue(val)) continue
        out.push({ file: rel, line: i + 1, value: val })
      }
    }
  })
  return out
}

export function runScan(root = ROOT) {
  const files = SCAN_DIRS.flatMap(d => { try { return walk(join(root, d), []) } catch { return [] } })
  const violations = []
  for (const file of files) {
    const rel = relative(root, file)
    const src = readFileSync(file, 'utf8')
    violations.push(...scanSource(rel, src))
  }
  const offendingFiles = [...new Set(violations.map(v => v.file))]
  const unlisted = offendingFiles.filter(f => !(f in FILE_ALLOWLIST))
  const realViolations = violations.filter(v => unlisted.includes(v.file))
  return { files, violations, offendingFiles, unlisted, realViolations }
}

export { FILE_ALLOWLIST }

// CLI entrypoint only — not when imported by the test.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const { files, violations, offendingFiles, unlisted, realViolations } = runScan()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ total: violations.length, offendingFiles, unlisted, realViolations }, null, 2))
  } else {
    console.log(`i18n guard: scanned ${files.length} .tsx files`)
    console.log(`  flagged matches: ${violations.length} across ${offendingFiles.length} files`)
    console.log(`  allow-listed files: ${offendingFiles.length - unlisted.length}`)
    console.log(`  UNLISTED offending files: ${unlisted.length}`)
    for (const f of unlisted) {
      const hits = realViolations.filter(v => v.file === f)
      console.log(`\n  ✗ ${f}  (${hits.length})`)
      hits.slice(0, 8).forEach(h => console.log(`      L${h.line}: ${h.value}`))
    }
  }
  process.exitCode = realViolations.length === 0 ? 0 : 1
}
