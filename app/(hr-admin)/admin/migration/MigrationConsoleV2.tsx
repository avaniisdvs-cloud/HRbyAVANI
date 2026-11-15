'use client'
/**
 * Enterprise Data Migration Factory — 11-step guided migration wizard.
 *
 * Phase C: Steps 2–5 added for source file ingestion path.
 * Existing V2 package upload preserved as fallback in Step 6 (Build Package).
 *
 * Step mapping:
 *   0  Verify Environment
 *   1  Select Migration Mode  (absorbs old Clear + Seed)
 *   2  Upload Source Files    ← NEW
 *   3  Source File Analysis   ← NEW
 *   4  Map & Transform        ← NEW
 *   5  Build Migration Package ← NEW (+ V2 upload fallback)
 *   6  Pre-Import Validation
 *   7  Dry Run
 *   8  Execute Migration
 *   9  Post-Load Verification
 *  10  Sign Off
 */
import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useTransition, useEffect, useRef } from 'react'
import { Card }   from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge }  from '@/components/ui/badge'
import { Input }  from '@/components/ui/input'
import { useLocale } from '@/components/providers/LocaleProvider'
import {
  getMigrationStatus, seedMasterData, getResetPreview, resetStagingData,
} from '@/modules/migration/seed-actions'
import {
  parseMigrationPackage, validateMigrationPackage, executeMigration, getPostLoadScorecard,
} from '@/modules/migration/v2-actions'
import {
  analyzeSourceFiles, buildMigrationPackage, getSessionPackage, clearSessionFiles,
} from '@/modules/migration/source-actions'
import type { MigrationStatus, SeedResult, ResetPreview, ResetResult } from '@/modules/migration/types'
import type {
  V2ParsedPackage, V2ValidationResult, V2ExecutionResult, DryRunSummary, PostLoadScorecard,
} from '@/modules/migration/v2-types'
import type {
  SourceFileAnalysis, TransformationSummary, MigrationMode as SourceMode,
} from '@/modules/migration/source-types'
import { buildDryRunSummary } from '@/modules/migration/v2-dry-run'

// ── Types ─────────────────────────────────────────────────────────────────────

type StepStatus = 'not-started' | 'in-progress' | 'completed' | 'warning' | 'failed' | 'skipped'
type UiMode     = 'full-reload' | 'incremental'

interface StepMeta {
  name: string; purpose: string; whatHappens: string
  expectedResult: string; failureImpact: string; proceedCriteria: string
  tooltip: string; learnMore: string
}

// ── STEP_META (11 steps) ──────────────────────────────────────────────────────

const STEP_META: StepMeta[] = [
  {
    name:            'Verify Environment',
    purpose:         'Confirm that the migration console is enabled and the correct database is targeted before any changes are made.',
    whatHappens:     'The system reads environment variables and resolves the live database host. It confirms the target is the active DEV/UAT database, not production. / يقرأ النظام إعدادات البيئة ويتأكد أن الهدف هو قاعدة DEV/UAT الحالية وليست الإنتاج.',
    expectedResult:  'Console status shows UAT/TEST WRITES ENABLED. Database host is confirmed as separate from production. / تظهر الحالة أن الكتابة مفعلة للاختبار ويتم تأكيد اختلاف قاعدة الهدف عن الإنتاج.',
    failureImpact:   'Migration cannot proceed until the environment is confirmed safe.',
    proceedCriteria: 'Status badge shows UAT/TEST WRITES ENABLED. You have read and acknowledged the database target warning. / يجب أن تظهر الحالة أن الكتابة مفعلة للاختبار مع تأكيد التحذير الخاص بقاعدة البيانات.',
    tooltip:         'Confirms migration console is enabled and you are targeting the correct database.',
    learnMore:       'This step does not write any data. It reads ENABLE_MIGRATION_CONSOLE, DATABASE_ENV, PROD_DATABASE_URL, ALLOW_NON_PROD_CLOUD_DB_WRITE, and ALLOW_UAT_RELOAD_WRITE. The database host is masked for security. / هذه الخطوة لا تكتب بيانات وتعرض اسم المضيف بشكل مخفي للحماية.',
  },
  {
    name:            'Select Migration Mode',
    purpose:         'Choose Full Reload or Incremental, optionally clear existing data (Full Reload only), and ensure master data is seeded before employee import begins.',
    whatHappens:     'You select the migration mode. For Full Reload, existing employee and org data can be removed with explicit confirmation. Master data (departments, positions, grades, locations) is checked and seeded if missing.',
    expectedResult:  'Mode selected. Database cleared if needed. All master data items exist.',
    failureImpact:   'Skipping Clear in Full Reload mode may cause duplicate-record errors. Missing master data causes import failures in Step 7.',
    proceedCriteria: 'Mode confirmed. Master data shows 0 items to create.',
    tooltip:         'Select Full Reload or Incremental. Optionally clear existing data and verify master data seeding.',
    learnMore:       'Full Reload uses TRUNCATE CASCADE to remove all employee data while preserving configuration. Seeding is idempotent — running it multiple times produces the same result. Items are matched by code, not name.',
  },
  {
    name:            'Upload Source Files',
    purpose:         'Upload the raw source files exported from your HR system. The factory will auto-detect file types and transform them into the standard migration format.',
    whatHappens:     'Uploaded files are parsed and stored in a temporary session. Column headers are inspected to classify each file. No database writes occur.',
    expectedResult:  'All files uploaded. Employee Master file detected.',
    failureImpact:   'Without an Employee Master file the package cannot be built and migration cannot proceed.',
    proceedCriteria: 'At least one file classified as EMPLOYEE_MASTER.',
    tooltip:         'Upload raw source files (.xlsx, .xls, .csv). System auto-detects Employee Master, Assignments, Leave Balances, Users, Position Mapping, and more.',
    learnMore:       'Accepted formats: .xlsx, .xls, .csv. Maximum 10 files, 50 MB each. Column header fingerprinting classifies files automatically. UNKNOWN files generate a warning — you can override the type before building.',
  },
  {
    name:            'Source File Analysis',
    purpose:         'Review the automatic classification of each uploaded file and correct any misidentified files before transformation.',
    whatHappens:     'Each file is shown with its detected type, confidence score, row count, sheet names, and any structural issues. Unknown files produce warnings but do not block the build.',
    expectedResult:  'All key files correctly identified. EMPLOYEE_MASTER detected with HIGH or MEDIUM confidence. No UNKNOWN files for critical data.',
    failureImpact:   'Misclassified files produce incorrect transformation output.',
    proceedCriteria: 'Employee Master file confirmed. No blockers. UNKNOWN files acknowledged.',
    tooltip:         'Shows detected type, confidence, row count, sheets, issues and warnings for each uploaded file.',
    learnMore:       'If a file is classified incorrectly, the type can be overridden before the build step. Unknown files are treated as warnings — they are ignored during transformation with a note in the summary.',
  },
  {
    name:            'Map & Transform',
    purpose:         'Transform raw source data into the standard V2 migration package format. UAE mobile numbers are normalised and positions are resolved from the database.',
    whatHappens:     'The system merges Employee Master with Assignments, resolves position codes via DB lookup or title matching, builds manager hierarchy from the assignments file, and generates leave balance rows for every employee.',
    expectedResult:  'canBuild = true. All employees mapped. Manager hierarchy built.',
    failureImpact:   'Blocker: no Employee Master file. Warnings: unresolved positions (dept-default used), mobile normalisation issues.',
    proceedCriteria: 'canBuild = true. No blockers listed in the transformation summary.',
    tooltip:         'Merges source files, normalises UAE mobiles, resolves positions from DB, builds manager hierarchy and leave balances.',
    learnMore:       'Transformation is pure — no database writes. The only DB calls are read-only lookups for positions, departments, grades, locations, and absence types. Missing positions use department-default fallback codes when available.',
  },
  {
    name:            'Build Migration Package',
    purpose:         'Confirm the generated package is ready for validation, or upload a pre-built V2 workbook as an alternative (fallback path).',
    whatHappens:     'The generated package is retrieved from the temporary session and shown with counts for employees, manager links, department heads, and leave balances. A pre-built 4-sheet workbook can be uploaded instead.',
    expectedResult:  'Package shows READY or READY WITH WARNINGS. Employee count matches expectation.',
    failureImpact:   'BLOCKED packages cannot proceed to validation until issues are resolved.',
    proceedCriteria: 'Package confirmed. Employee count matches your expected headcount.',
    tooltip:         'Review the generated package counts or upload a pre-built V2 workbook as a fallback.',
    learnMore:       'The generated package is held in /tmp for this session only. If you need to make corrections, re-upload the source files and rebuild. The fallback V2 workbook must contain all 4 required sheets: Employees, Managers, DeptHeads, LeaveBalances.',
  },
  {
    name:            'Pre-Import Validation',
    purpose:         'Verify every row in every sheet before any data is written. This is the quality gate that prevents bad data from entering the system.',
    whatHappens:     'All employee fields are validated, department and position codes resolved against the database, duplicates detected, manager references checked (live DB and within-batch), cycles detected, department heads verified, and leave balance types confirmed.',
    expectedResult:  'Zero ERROR-severity issues. Warnings are acceptable.',
    failureImpact:   'Any ERROR blocks execution. Rows with errors are excluded.',
    proceedCriteria: 'Validation Status = PASS. Error count = 0.',
    tooltip:         'Validates employees, managers, department heads, and leave balances. Detects duplicates, missing references, and hierarchy cycles.',
    learnMore:       'Manager validation uses within-batch resolution — a manager does not need to already exist in the database if they appear in the Employees sheet. Cycle detection uses DFS. Any circular reporting chain is flagged as an error.',
  },
  {
    name:            'Dry Run Summary',
    purpose:         'Review the exact scope of what will be written before committing to execution. Your last opportunity to verify counts without any database changes.',
    whatHappens:     'A complete summary of all data that would be created: employee count, manager links, department heads, and leave balances. No writes occur.',
    expectedResult:  'All counts match expectation. canExecute = true.',
    failureImpact:   'If blockers remain, execution is disabled.',
    proceedCriteria: 'canExecute = true. You have reviewed and accepted all warnings.',
    tooltip:         'Shows exactly what will be created — employees, managers, dept heads, leave balances — without writing.',
    learnMore:       'The dry run is computed entirely in memory from the validation result — no database queries.',
  },
  {
    name:            'Execute Migration',
    purpose:         'Write all validated data to the database in 5 sequential phases.',
    whatHappens:     'Phase 1: Employees + assignments + user accounts (atomic, all-or-nothing). Phase 2: Manager links. Phase 3: Department heads. Phase 4: HOD auto-link fallback. Phase 5: Leave balances.',
    expectedResult:  'All phases complete with 0 errors. All counts match dry run.',
    failureImpact:   'Phase 1 failure rolls back all employee writes and halts migration. Phases 2–5 failures are logged independently.',
    proceedCriteria: 'Execution result shows ok = true. All phase counts match dry run.',
    tooltip:         'Writes all data in 5 phases: employees → managers → dept heads → HOD auto-link → leave balances.',
    learnMore:       'Phase 1 uses the existing bulk-import engine with full audit trail. PII fields are AES-256-GCM encrypted. All writes include audit log entries referencing the acting SUPER_ADMIN user.',
  },
  {
    name:            'Post-Load Verification',
    purpose:         'Confirm all data was loaded correctly and the system is ready for UAT.',
    whatHappens:     'The system queries the live database and checks 9 readiness conditions: employees, assignments, users, line managers, department heads, leave balances, plus three UAT readiness gates.',
    expectedResult:  'All 9 checks pass. Three readiness gates all show PASS.',
    failureImpact:   'Failed checks indicate data gaps that will prevent specific features from working.',
    proceedCriteria: 'Scorecard verdict = READY or READY WITH RISKS. All three UAT readiness gates pass.',
    tooltip:         'Checks 9 conditions including employees, users, managers, dept heads, leave balances, and UAT feature readiness.',
    learnMore:       'The scorecard queries the live database independently of the execution result — it reflects actual committed state.',
  },
  {
    name:            'Sign Off',
    purpose:         'Formally record the migration outcome and confirm whether UAT can begin.',
    whatHappens:     'The final scorecard verdict and a complete summary of all data loaded is displayed. The HR lead makes a formal go/no-go decision for UAT.',
    expectedResult:  'Verdict = READY FOR UAT. All data counts confirmed.',
    failureImpact:   'A NOT READY verdict means UAT cannot start.',
    proceedCriteria: 'You have reviewed all scorecard results. Verdict is READY or READY WITH RISKS.',
    tooltip:         'Final review and formal sign-off. Confirms UAT can start: READY, READY WITH RISKS, or NOT READY.',
    learnMore:       'This step produces no database writes. If corrections are needed, use HR Admin screens for targeted fixes rather than a full re-run.',
  },
]

const STEP_SHORT = [
  'Verify Env', 'Mode', 'Source Files', 'Analysis',
  'Transform', 'Build Pkg', 'Validate', 'Dry Run',
  'Execute', 'Verify', 'Sign Off',
] as const

// ── Small components ──────────────────────────────────────────────────────────

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: color ?? 'var(--surface)', color: color ? '#fff' : 'var(--ink-2)' }}>
      {children}
    </span>
  )
}

function ReadinessBadge({ status }: { status: 'READY' | 'READY WITH WARNINGS' | 'BLOCKED' | 'READY WITH RISKS' | 'NOT READY' }) {
  const cfg = {
    'READY':               { bg: '#16A34A', label: 'READY' },
    'READY WITH WARNINGS': { bg: '#B45309', label: 'READY WITH WARNINGS' },
    'READY WITH RISKS':    { bg: '#B45309', label: 'READY WITH RISKS' },
    'BLOCKED':             { bg: '#EF4444', label: 'BLOCKED' },
    'NOT READY':           { bg: '#EF4444', label: 'NOT READY' },
  }[status] ?? { bg: '#6B7280', label: status }
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold tracking-wide"
      style={{ background: cfg.bg, color: '#fff' }}>{cfg.label}</span>
  )
}

function ConfidenceBadge({ level }: { level: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const cfg = { HIGH: '#16A34A', MEDIUM: '#B45309', LOW: '#6B7280' }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: cfg[level] + '20', color: cfg[level], border: `1px solid ${cfg[level]}50` }}>
      {level}
    </span>
  )
}

function TypeLabel({ type }: { type: string }) {
  const cfg: Record<string, string> = {
    EMPLOYEE_MASTER:      '#1D4ED8',
    EMPLOYEE_ASSIGNMENTS: '#7C3AED',
    LEAVE_BALANCES:       '#059669',
    USERS_DATA:           '#0891B2',
    POSITION_MAPPING:     '#D97706',
    DEPT_HEAD_MAPPING:    '#DC2626',
    MANAGER_HIERARCHY:    '#9333EA',
    UNKNOWN:              '#6B7280',
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium"
      style={{ background: (cfg[type] ?? '#6B7280') + '15', color: cfg[type] ?? '#6B7280' }}>
      {type}
    </span>
  )
}

const STATUS_COLORS: Record<StepStatus, { bg: string; border: string; text: string; dot: string }> = {
  'not-started': { bg: 'var(--surface)',  border: 'var(--border)',  text: 'var(--ink-4)', dot: '#9CA3AF' },
  'in-progress': { bg: '#EFF6FF',         border: '#2563EB',        text: '#1E40AF',      dot: '#2563EB' },
  'completed':   { bg: '#F0FDF4',         border: '#16A34A',        text: '#15803D',      dot: '#16A34A' },
  'warning':     { bg: '#FFFBEB',         border: '#B45309',        text: '#92400E',      dot: '#B45309' },
  'failed':      { bg: '#FEF2F2',         border: '#EF4444',        text: '#B91C1C',      dot: '#EF4444' },
  'skipped':     { bg: 'var(--surface)',  border: 'var(--border)',  text: 'var(--ink-4)', dot: '#D1D5DB' },
}

const STATUS_SYMBOLS: Record<StepStatus, string> = {
  'not-started': '○', 'in-progress': '●', 'completed': '✓',
  'warning': '⚠', 'failed': '✗', 'skipped': '⊘',
}

function StepStatusDot({ status }: { status: StepStatus }) {
  const cfg: Record<StepStatus, { color: string; label: string; symbol: string }> = {
    'not-started': { color: 'var(--ink-4)', label: 'Not started', symbol: '○' },
    'in-progress': { color: '#2563EB',      label: 'In progress',  symbol: '●' },
    'completed':   { color: '#16A34A',      label: 'Completed',    symbol: '✓' },
    'warning':     { color: '#B45309',      label: 'Warning',      symbol: '⚠' },
    'failed':      { color: '#EF4444',      label: 'Failed',       symbol: '✗' },
    'skipped':     { color: 'var(--ink-4)', label: 'Skipped',      symbol: '⊘' },
  }
  const c = cfg[status]
  return <span title={c.label} className="text-xs font-bold" style={{ color: c.color }}>{c.symbol}</span>
}

function StepGuide({ meta, expanded, onToggle }: { meta: StepMeta; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 text-left text-sm font-medium"
        style={{ color: 'var(--ink-2)' }}>
        <span>📖 Migration Guide — {meta.name}</span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 text-sm border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mt-3">
            <div><p className="font-semibold text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--ink-3)' }}>Purpose</p><p style={{ color: 'var(--ink-1)' }}>{meta.purpose}</p></div>
            <div><p className="font-semibold text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--ink-3)' }}>What Happens</p><p style={{ color: 'var(--ink-1)' }}>{meta.whatHappens}</p></div>
            <div><p className="font-semibold text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--ink-3)' }}>Expected Result</p><p style={{ color: '#16A34A' }}>{meta.expectedResult}</p></div>
            <div><p className="font-semibold text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--ink-3)' }}>Failure Impact</p><p style={{ color: '#B91C1C' }}>{meta.failureImpact}</p></div>
          </div>
          <div className="rounded p-3 text-xs" style={{ background: 'var(--accent-050)', color: 'var(--brand-active)', border: '1px solid var(--accent-100)' }}>
            <span className="font-semibold">Proceed Criteria: </span>{meta.proceedCriteria}
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer font-medium" style={{ color: 'var(--ink-2)' }}>Learn more (advanced)</summary>
            <p className="mt-2 leading-relaxed" style={{ color: 'var(--ink-2)' }}>{meta.learnMore}</p>
          </details>
        </div>
      )}
    </div>
  )
}

function SectionTitle({ step, meta, status }: { step: number; meta: StepMeta; status: StepStatus }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink-1)' }}>
          Step {step} — {meta.name}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ink-2)' }} title={meta.tooltip}>{meta.purpose}</p>
      </div>
      <StepStatusDot status={status} />
    </div>
  )
}

function Err({ msg }: { msg: string }) {
  return <Card className="p-3 text-sm" style={{ borderColor: '#EF4444', color: '#B91C1C' }}>⚠ {msg}</Card>
}

// ── Progress Stepper ──────────────────────────────────────────────────────────

function ProgressStepper({ currentStep, stepStatuses, onGoTo }: {
  currentStep: number; stepStatuses: StepStatus[]; onGoTo: (s: number) => void
}) {
  const n = STEP_SHORT.length
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: '2px' }}>
      {STEP_SHORT.map((label, i) => {
        const status    = stepStatuses[i]
        const isCurrent = i === currentStep
        const c         = STATUS_COLORS[status]
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="h-1.5 rounded-sm" style={{ background: c.dot }} />
            <button onClick={() => onGoTo(i)} title={STEP_META[i].tooltip}
              className="flex items-center justify-center gap-0.5 px-1 py-1 rounded text-xs font-medium w-full"
              style={{
                background: isCurrent ? c.border : c.bg,
                border: `1.5px solid ${c.border}`,
                color: isCurrent ? '#fff' : c.text,
                fontWeight: isCurrent ? 700 : 500,
                fontSize: '0.6rem',
              }}>
              <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.7 }}>{i + 1}</span>
              <span className="truncate">{label}</span>
              <span style={{ opacity: 0.8 }}>{STATUS_SYMBOLS[status]}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Migration Dashboard ───────────────────────────────────────────────────────

function MigrationDashboard({ pkg, execResult, scorecard, status, transformSummary }: {
  pkg:             V2ParsedPackage | null
  execResult:      V2ExecutionResult | null
  scorecard:       PostLoadScorecard | null
  status:          MigrationStatus
  transformSummary: TransformationSummary | null
}) {
  const pkgCards = pkg ? [
    { label: 'Employees',      value: pkg.employees.length,     icon: '👤' },
    { label: 'Manager Links',  value: pkg.managers.length,      icon: '🔗' },
    { label: 'Dept Heads',     value: pkg.deptHeads.length,     icon: '🏢' },
    { label: 'Leave Balances', value: pkg.leaveBalances.length, icon: '📅' },
  ] : null

  const masterCards = [
    { label: 'Positions',   value: status.items.filter(i => i.kind === 'position').length,   icon: '💼', exists: status.items.filter(i => i.kind === 'position' && i.exists).length },
    { label: 'Departments', value: status.items.filter(i => i.kind === 'department').length, icon: '🏛', exists: status.items.filter(i => i.kind === 'department' && i.exists).length },
    { label: 'Grades',      value: status.items.filter(i => i.kind === 'grade').length,      icon: '⭐', exists: status.items.filter(i => i.kind === 'grade' && i.exists).length },
    { label: 'Locations',   value: status.items.filter(i => i.kind === 'location').length,   icon: '📍', exists: status.items.filter(i => i.kind === 'location' && i.exists).length },
  ]

  const scorecardMap = new Map(scorecard?.rows.map(r => [r.check, r]))
  const recon: { label: string; package: number | null; loaded: number | null; pass: boolean | null }[] = [
    { label: 'Employees',     package: pkg?.employees.length ?? null,     loaded: execResult ? execResult.employeesCreated    : (scorecardMap.get('Employees loaded')?.actual ?? null),     pass: scorecardMap.get('Employees loaded')?.pass ?? null },
    { label: 'Manager Links', package: pkg?.managers.length ?? null,      loaded: execResult?.managerLinksSet ?? null,          pass: scorecardMap.get('Line managers assigned')?.pass ?? null },
    { label: 'Dept Heads',    package: pkg?.deptHeads.length ?? null,     loaded: execResult?.deptHeadsSet ?? null,             pass: scorecardMap.get('Department heads set')?.pass ?? null },
    { label: 'Leave Balances',package: pkg?.leaveBalances.length ?? null, loaded: execResult?.leaveBalancesCreated ?? null,     pass: scorecardMap.get('Leave balances loaded')?.pass ?? null },
    { label: 'User Accounts', package: pkg?.employees.length ?? null,     loaded: execResult?.usersCreated ?? null,             pass: scorecardMap.get('User accounts created')?.pass ?? null },
  ]

  if (!pkg && !execResult && !scorecard) {
    return (
      <div className="rounded-lg border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-3)' }}>
          Enterprise Data Migration Factory — Migration Dashboard
        </p>
        <div className="flex flex-wrap gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {masterCards.map(c => (
              <div key={c.label} className="rounded border p-2 text-center" style={{ background: 'var(--card)' }}>
                <p className="text-base mb-0.5">{c.icon}</p>
                <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-serif)' }}>{c.exists}/{c.value}</p>
                <p className="text-xs leading-tight" style={{ color: 'var(--ink-3)' }}>{c.label}</p>
              </div>
            ))}
          </div>
          {transformSummary && (
            <div className="flex flex-wrap gap-2 items-center pl-2 border-l" style={{ borderColor: 'var(--border)' }}>
              <Chip color="#2563EB">Source: {transformSummary.employeesIncluded} employees</Chip>
              <Chip color="#059669">Managers: {transformSummary.managersResolved}</Chip>
              <Chip color="#7C3AED">Leave: {transformSummary.leaveBalancesDetected}</Chip>
              {!transformSummary.canBuild && <ReadinessBadge status="BLOCKED" />}
              {transformSummary.canBuild && transformSummary.warnings.length > 0 && <ReadinessBadge status="READY WITH WARNINGS" />}
              {transformSummary.canBuild && transformSummary.warnings.length === 0 && <ReadinessBadge status="READY" />}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-3)' }}>
        Enterprise Data Migration Factory — Migration Dashboard
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8 mb-3">
        {pkgCards?.map(c => (
          <div key={c.label} className="rounded border p-2 text-center" style={{ background: 'var(--card)', borderColor: 'var(--accent-100)' }}>
            <p className="text-base mb-0.5">{c.icon}</p>
            <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-active)' }}>{c.value}</p>
            <p className="text-xs leading-tight" style={{ color: 'var(--ink-3)' }}>{c.label}</p>
          </div>
        ))}
        {masterCards.map(c => (
          <div key={c.label} className="rounded border p-2 text-center" style={{ background: 'var(--card)' }}>
            <p className="text-base mb-0.5">{c.icon}</p>
            <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-serif)' }}>{c.exists}/{c.value}</p>
            <p className="text-xs leading-tight" style={{ color: 'var(--ink-3)' }}>{c.label}</p>
          </div>
        ))}
      </div>
      {(execResult || scorecard) && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border rounded overflow-hidden">
            <thead><tr style={{ background: 'var(--card)' }}>
              <th className="text-left p-2 text-xs font-semibold">Data</th>
              <th className="text-right p-2 text-xs font-semibold">From Package</th>
              <th className="text-right p-2 text-xs font-semibold">Loaded</th>
              <th className="text-right p-2 text-xs font-semibold">Diff</th>
              <th className="text-center p-2 text-xs font-semibold">Status</th>
            </tr></thead>
            <tbody>
              {recon.map(row => {
                const diff = (row.package !== null && row.loaded !== null) ? row.loaded - row.package : null
                return (
                  <tr key={row.label} className="border-t">
                    <td className="p-2 font-medium">{row.label}</td>
                    <td className="p-2 text-right font-mono text-xs">{row.package ?? '—'}</td>
                    <td className="p-2 text-right font-mono text-xs">{row.loaded ?? '—'}</td>
                    <td className="p-2 text-right font-mono text-xs" style={{ color: diff !== null && diff < 0 ? '#EF4444' : diff === 0 ? '#16A34A' : 'var(--ink-2)' }}>
                      {diff !== null ? (diff >= 0 ? `+${diff}` : String(diff)) : '—'}
                    </td>
                    <td className="p-2 text-center text-xs font-semibold" style={{ color: row.pass === null ? 'var(--ink-3)' : row.pass ? '#16A34A' : '#EF4444' }}>
                      {row.pass === null ? '—' : row.pass ? '✅ OK' : '❌ Gap'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Certification Summary ─────────────────────────────────────────────────────

function CertificationSummary({ execResult, scorecard }: { execResult: V2ExecutionResult; scorecard: PostLoadScorecard }) {
  const verdictCfg = {
    READY:            { badge: 'READY FOR UAT' as const,    bg: '#16A34A', desc: 'All checks passed. UAT can start immediately.' },
    READY_WITH_RISKS: { badge: 'READY WITH RISKS' as const, bg: '#B45309', desc: 'Migration complete with accepted risks. UAT can proceed with caution.' },
    NOT_READY:        { badge: 'NOT READY' as const,        bg: '#EF4444', desc: 'Failures detected. Resolve before UAT.' },
  }[scorecard.verdict]

  const certItems = [
    { label: 'Employees Loaded',    value: execResult.employeesCreated,         icon: '👤' },
    { label: 'User Accounts',       value: execResult.usersCreated,              icon: '🔑' },
    { label: 'Mgr Links',           value: execResult.managerLinksSet,           icon: '🔗' },
    { label: 'Dept Heads',          value: execResult.deptHeadsSet,              icon: '🏢' },
    { label: 'Leave Balances',      value: execResult.leaveBalancesCreated,      icon: '📅' },
    { label: 'Mgr Roles Promoted',  value: execResult.managerRolesAssigned,      icon: '🎖️' },
    ...(execResult.hodLinksSet > 0 ? [{ label: 'HOD Auto-Links', value: execResult.hodLinksSet, icon: '🔀' }] : []),
    ...(execResult.managerRolesMissingAccount > 0 ? [{ label: 'Mgrs w/o Account', value: execResult.managerRolesMissingAccount, icon: '⚠️' }] : []),
  ]

  return (
    <div className="space-y-5">
      <div className="rounded-lg p-4 text-center" style={{ background: verdictCfg.bg + '15', border: `2px solid ${verdictCfg.bg}` }}>
        <div className="flex justify-center mb-2">
          <span className="px-4 py-1.5 rounded-full text-sm font-bold tracking-widest" style={{ background: verdictCfg.bg, color: '#fff' }}>{verdictCfg.badge}</span>
        </div>
        <p className="text-sm" style={{ color: 'var(--ink-1)' }}>{verdictCfg.desc}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>Verified: {scorecard.loadedAt}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {certItems.map(({ label, value, icon }) => (
          <div key={label} className="border rounded-lg p-3 text-center space-y-1">
            <p className="text-lg">{icon}</p>
            <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink-1)' }}>{value}</p>
            <p className="text-xs leading-tight" style={{ color: 'var(--ink-3)' }}>{label}</p>
          </div>
        ))}
      </div>
      <div className="border rounded overflow-hidden text-sm">
        <TableScrollRegion><table className="w-full">
          <thead><tr style={{ background: 'var(--surface)' }}>
            <th className="text-left p-2">Check</th>
            <th className="text-right p-2">Expected</th>
            <th className="text-right p-2">Actual</th>
            <th className="p-2 text-center">Result</th>
            <th className="text-left p-2">Notes</th>
          </tr></thead>
          <tbody>
            {scorecard.rows.map((r, i) => (
              <tr key={i} className="border-t" style={{ background: r.pass ? undefined : '#FEF2F2' }}>
                <td className="p-2">{r.check}</td>
                <td className="p-2 text-right font-mono text-xs">{r.expected}</td>
                <td className="p-2 text-right font-mono text-xs">{r.actual}</td>
                <td className="p-2 text-center">{r.pass ? '✅' : '❌'}</td>
                <td className="p-2 text-xs" style={{ color: 'var(--ink-3)' }}>{r.detail ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table></TableScrollRegion>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function MigrationConsoleV2({ initialStatus }: { initialStatus: MigrationStatus }) {
  const locale = useLocale()
  const [step, setStep] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('migration_v2_step') ?? '0', 10) || 0 } catch { return 0 }
  })
  const [pending, start] = useTransition()
  const [err, setErr]    = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState<number | null>(null)

  // Step 0 — environment
  const [status, setStatus]      = useState<MigrationStatus>(initialStatus)
  const [migrationMode, setMigrationMode] = useState<UiMode | null>(() => {
    try { return (localStorage.getItem('migration_v2_mode') as UiMode) || null } catch { return null }
  })

  // Step 1 — clear (Full Reload only)
  const [resetPreview, setResetPreview] = useState<ResetPreview | null>(null)
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetResult, setResetResult]   = useState<ResetResult | null>(null)

  // Step 1 — seed
  const [seedConfirm, setSeedConfirm] = useState('')
  const [seedResult, setSeedResult]   = useState<SeedResult | null>(null)

  // Steps 2–5 — source file path
  const fileInputRef                          = useRef<HTMLInputElement>(null)
  const [selectedFiles, setSelectedFiles]     = useState<File[]>([])
  const [sessionId, setSessionId]             = useState<string | null>(null)
  const [analyses, setAnalyses]               = useState<SourceFileAnalysis[] | null>(null)
  const [analysisErrors, setAnalysisErrors]   = useState<string[]>([])
  const [transformSummary, setTransformSummary] = useState<TransformationSummary | null>(null)
  const [buildPath, setBuildPath]             = useState<'source' | 'v2upload' | null>(null)

  // Step 6 — validation (fed from either path)
  const [pkg, setPkg]             = useState<V2ParsedPackage | null>(null)
  const [validation, setValidation] = useState<V2ValidationResult | null>(null)
  const [dryRun, setDryRun]       = useState<DryRunSummary | null>(null)

  // Step 8 — execute
  const [execConfirm, setExecConfirm] = useState('')
  const [execResult, setExecResult]   = useState<V2ExecutionResult | null>(null)

  // Step 9 — scorecard
  const [scorecard, setScorecard] = useState<PostLoadScorecard | null>(null)

  useEffect(() => {
    try { localStorage.setItem('migration_v2_step', String(step)) } catch {}
  }, [step])

  useEffect(() => {
    try {
      if (migrationMode) localStorage.setItem('migration_v2_mode', migrationMode)
      else localStorage.removeItem('migration_v2_mode')
    } catch {}
  }, [migrationMode])

  const safe = status?.branch?.safe ?? false
  const go   = (s: number) => { setErr(null); setStep(s) }
  const toggleGuide = (i: number) => setGuideOpen(prev => prev === i ? null : i)

  // ── Step status derivation (11 entries) ──────────────────────────────────────

  const stepStatuses: StepStatus[] = [
    // 0 Verify
    step === 0 ? 'in-progress' : safe ? 'completed' : 'failed',
    // 1 Mode + Seed
    step === 1 ? 'in-progress'
      : (!migrationMode) ? (step > 1 ? 'warning' : 'not-started')
      : seedResult?.ok ? 'completed'
      : (step > 1 ? 'completed' : 'not-started'),
    // 2 Upload Source Files
    step === 2 ? 'in-progress' : sessionId ? 'completed' : (step > 2 ? 'warning' : 'not-started'),
    // 3 Source File Analysis
    step === 3 ? 'in-progress' : analyses ? (analysisErrors.length ? 'warning' : 'completed') : (step > 3 ? 'warning' : 'not-started'),
    // 4 Map & Transform
    step === 4 ? 'in-progress' : transformSummary ? (transformSummary.canBuild ? (transformSummary.warnings.length ? 'warning' : 'completed') : 'failed') : (step > 4 ? 'warning' : 'not-started'),
    // 5 Build Package
    step === 5 ? 'in-progress' : pkg ? 'completed' : (step > 5 ? 'warning' : 'not-started'),
    // 6 Validate
    step === 6 ? 'in-progress' : validation ? (validation.canExecute ? 'completed' : (validation.employeePreview.errorRows > 0 ? 'failed' : 'warning')) : 'not-started',
    // 7 Dry Run
    step === 7 ? 'in-progress' : dryRun ? (dryRun.canExecute ? 'completed' : 'warning') : 'not-started',
    // 8 Execute
    step === 8 ? 'in-progress' : execResult ? (execResult.ok ? 'completed' : 'failed') : 'not-started',
    // 9 Post-Load
    step === 9 ? 'in-progress' : scorecard ? 'completed' : 'not-started',
    // 10 Sign Off
    step === 10 ? 'in-progress' : (scorecard && step >= 10) ? (scorecard.verdict === 'NOT_READY' ? 'failed' : 'completed') : 'not-started',
  ]

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const safeRefreshStatus = async () => {
    try {
      const s = await getMigrationStatus()
      if (s && typeof s === 'object' && 'branch' in s && s.branch) setStatus(s as MigrationStatus)
      else setErr('Status refresh returned unexpected response — reload to sync.')
    } catch (e) {
      console.error('[safeRefreshStatus]', e)
      setErr('Could not refresh status — reload to recover.')
    }
  }

  const loadResetPreview = () => start(async () => {
    setErr(null)
    try { setResetPreview(await getResetPreview()) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load reset preview.') }
  })

  const runReset = () => start(async () => {
    setErr(null)
    try {
      const r = await resetStagingData(resetConfirm)
      setResetResult(r)
      await safeRefreshStatus()
    } catch (e) {
      setErr((e instanceof Error ? e.message : String(e)).replace(/^MIGRATION_[A-Z_]+:\s*/, ''))
    }
  })

  const runSeed = () => start(async () => {
    setErr(null)
    try {
      const r = await seedMasterData(seedConfirm)
      setSeedResult(r)
      await safeRefreshStatus()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Seed failed.')
    }
  })

  // Source file upload → analyze → go to step 3
  const onSourceFilesUpload = () => start(async () => {
    if (selectedFiles.length === 0) { setErr('Select at least one file before uploading.'); return }
    setErr(null)
    setAnalyses(null); setAnalysisErrors([]); setTransformSummary(null); setSessionId(null)
    const fd = new FormData()
    selectedFiles.forEach(f => fd.append('files', f))
    const r = await analyzeSourceFiles(fd)
    if ('error' in r) { setErr(r.error); return }
    setSessionId(r.sessionId)
    setAnalyses(r.analyses)
    setAnalysisErrors(r.errors)
    go(3)
  })

  // Transform → build package
  const onBuildPackage = () => start(async () => {
    if (!sessionId || !migrationMode) return
    setErr(null); setTransformSummary(null)
    const mode: SourceMode = migrationMode === 'full-reload' ? 'FULL_RELOAD' : 'INCREMENTAL'
    const r = await buildMigrationPackage(sessionId, mode)
    if ('error' in r) { setErr(r.error); return }
    setTransformSummary(r.summary)
  })

  // Use generated package → set pkg → go to validation
  const onUseSourcePackage = () => start(async () => {
    if (!sessionId) return
    setErr(null)
    const r = await getSessionPackage(sessionId)
    if ('error' in r) { setErr(r.error); return }
    setPkg(r); setBuildPath('source'); setValidation(null); setDryRun(null)
    go(6)
  })

  // V2 fallback upload (existing path)
  const onV2Upload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      setErr(null); setPkg(null); setValidation(null); setDryRun(null)
      const r = await parseMigrationPackage(fd)
      if ('error' in r) { setErr(r.error); return }
      setPkg(r); setBuildPath('v2upload'); go(6)
    })
  }

  const runValidation = () => start(async () => {
    if (!pkg) return
    setErr(null); setValidation(null); setDryRun(null)
    const r = await validateMigrationPackage(pkg)
    if ('error' in r) { setErr(r.error); return }
    setValidation(r); setDryRun(buildDryRunSummary(r, pkg))
  })

  const runExecute = () => start(async () => {
    if (!validation) return
    setErr(null)
    const r = await executeMigration(validation)
    if ('error' in r) { setErr(r.error); return }
    setExecResult(r); await safeRefreshStatus()
  })

  const loadScorecard = () => start(async () => {
    if (!execResult) return
    setErr(null)
    const r = await getPostLoadScorecard()
    if ('error' in r) { setErr(r.error); return }
    setScorecard(r)
  })

  const resetAll = () => {
    setMigrationMode(null); setSessionId(null); setSelectedFiles([])
    setAnalyses(null); setAnalysisErrors([]); setTransformSummary(null); setBuildPath(null)
    setPkg(null); setValidation(null); setDryRun(null)
    setExecResult(null); setScorecard(null); setExecConfirm('')
    setResetResult(null); setResetPreview(null); setResetConfirm('')
    setSeedResult(null); setSeedConfirm('')
    setErr(null); go(0)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-full space-y-4" style={{ color: 'var(--ink-1)' }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl" style={{ fontFamily: 'var(--font-serif)' }}>{locale === 'ar' ? 'مصنع ترحيل البيانات المؤسسي' : 'Enterprise Data Migration Factory'}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-2)' }}>
            {locale === 'ar' ? 'SUPER_ADMIN · ترحيل موجَّه من ١١ خطوة · كل عملية كتابة تتطلب تأكيدًا صريحًا' : 'SUPER_ADMIN · 11-step guided migration · every write requires explicit confirmation'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {migrationMode && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: migrationMode === 'incremental' ? '#F0FDF4' : '#EFF6FF', color: migrationMode === 'incremental' ? '#15803D' : '#1E40AF', border: `1px solid ${migrationMode === 'incremental' ? '#16A34A' : '#2563EB'}` }}>
              {migrationMode === 'incremental' ? (locale === 'ar' ? '➕ تحميل تدريجي' : '➕ Incremental Load') : (locale === 'ar' ? '🔄 إعادة تحميل كاملة' : '🔄 Full Reload')}
            </span>
          )}
          {migrationMode && <button onClick={resetAll} className="text-xs underline" style={{ color: 'var(--ink-3)' }}>{locale === 'ar' ? 'إعادة تعيين' : 'Reset'}</button>}
          {execResult && scorecard && (
            <ReadinessBadge status={scorecard.verdict === 'READY' ? 'READY' : scorecard.verdict === 'READY_WITH_RISKS' ? 'READY WITH RISKS' : 'NOT READY'} />
          )}
        </div>
      </div>

      {/* Progress stepper — always visible */}
      <ProgressStepper currentStep={step} stepStatuses={stepStatuses} onGoTo={s => { setErr(null); setStep(s) }} />

      {/* Dashboard */}
      <MigrationDashboard pkg={pkg} execResult={execResult} scorecard={scorecard} status={status} transformSummary={transformSummary} />

      {err && <Err msg={err} />}

      {/* ── Step 1 — Verify Environment ────────────────────────────────────── */}
      {step === 0 && (
        <Card className="p-5 space-y-4">
          <SectionTitle step={1} meta={STEP_META[0]} status={stepStatuses[0]} />
          <StepGuide meta={STEP_META[0]} expanded={guideOpen === 0} onToggle={() => toggleGuide(0)} />

          <div className="flex items-center gap-2 flex-wrap">
            <Badge style={{ background: !safe ? '#EF4444' : status.branch.isProductionHost ? '#B45309' : '#16A34A', color: '#fff' }}>
              {!safe ? 'BLOCKED / محظور' : 'UAT/TEST WRITES ENABLED / الكتابة مفعلة للاختبار'}
            </Badge>
            <code className="text-sm">{status.branch.hostMasked}</code>
          </div>
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            {status.branch.reason}
          </p>
          <ul className="text-sm space-y-0.5 list-disc ml-5" style={{ color: 'var(--ink-2)' }}>
            <li>Console enabled / تفعيل وحدة الترحيل: <b>{String(status.branch.enabled)}</b></li>
            <li>Governance mode / وضع الحوكمة: <b>{status.branch.governanceMode}</b></li>
            <li>DATABASE_ENV / بيئة قاعدة البيانات: <b>{status.branch.databaseEnv || '(not set)'}</b></li>
            <li>Production host detected / تم رصد قاعدة الإنتاج: <b>{String(status.branch.isProductionHost)}</b></li>
            <li>Production URL configured if available / رابط الإنتاج مضبوط إن وجد: <b>{String(status.branch.prodHostConfigured)}</b></li>
            <li>Production comparison required / المقارنة مع الإنتاج مطلوبة: <b>{String(status.branch.productionComparisonRequired)}</b></li>
            <li>Target differs from production / الهدف مختلف عن الإنتاج: <b>{String(status.branch.targetDiffersFromProduction)}</b></li>
            <li>Non-production write flag / إذن الكتابة لغير الإنتاج: <b>{String(status.branch.allowNonProdCloudWrite)}</b></li>
            <li>UAT reload flag / إذن إعادة تحميل UAT: <b>{String(status.branch.allowUatReloadWrite)}</b></li>
          </ul>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => go(1)} disabled={!safe}>{locale === 'ar' ? 'لقد أكّدت الهدف — متابعة →' : 'I have confirmed the target — Continue →'}</Button>
            {!safe && <ReadinessBadge status="BLOCKED" />}
            {safe && <ReadinessBadge status="READY" />}
          </div>
        </Card>
      )}

      {/* ── Step 2 — Select Migration Mode + optional Clear + Seed ─────────── */}
      {step === 1 && (
        <Card className="p-5 space-y-5">
          <SectionTitle step={2} meta={STEP_META[1]} status={stepStatuses[1]} />
          <StepGuide meta={STEP_META[1]} expanded={guideOpen === 1} onToggle={() => toggleGuide(1)} />

          {/* Mode selector */}
          {!migrationMode ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button onClick={() => setMigrationMode('full-reload')}
                className="text-left rounded-lg border-2 p-5 transition-all duration-200 hover:border-blue-500 hover:shadow-sm space-y-2"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <div className="flex items-center gap-2"><span className="text-lg">🔄</span><span className="font-semibold text-sm">{locale === 'ar' ? 'إعادة تحميل كاملة' : 'Full Reload'}</span></div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>{locale === 'ar' ? 'استبدال بيانات الموظفين الحالية بالكامل. خطوة المسح مطلوبة.' : 'Replace existing employee data completely. Clear step required.'}</p>
                <p className="text-xs font-medium" style={{ color: '#B45309' }}>{locale === 'ar' ? '⚠ يحذف جميع سجلات الموظفين الحالية.' : '⚠ Removes all existing employee records.'}</p>
              </button>
              <button onClick={() => setMigrationMode('incremental')}
                className="text-left rounded-lg border-2 p-5 transition-all duration-200 hover:border-green-500 hover:shadow-sm space-y-2"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <div className="flex items-center gap-2"><span className="text-lg">➕</span><span className="font-semibold text-sm">{locale === 'ar' ? 'تحميل تدريجي' : 'Incremental Load'}</span></div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>{locale === 'ar' ? 'إضافة موظفين جدد أو تحديثهم. تُحفظ البيانات الحالية.' : 'Add or update new employees. Existing data preserved.'}</p>
                <p className="text-xs font-medium" style={{ color: '#15803D' }}>{locale === 'ar' ? '✓ يبقى الموظفون الحاليون دون تغيير.' : '✓ Existing employees remain untouched.'}</p>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: migrationMode === 'incremental' ? '#F0FDF4' : '#EFF6FF', color: migrationMode === 'incremental' ? '#15803D' : '#1E40AF', border: `1px solid ${migrationMode === 'incremental' ? '#16A34A' : '#2563EB'}` }}>
                {migrationMode === 'incremental' ? (locale === 'ar' ? '➕ تحميل تدريجي' : '➕ Incremental Load') : (locale === 'ar' ? '🔄 إعادة تحميل كاملة' : '🔄 Full Reload')}
              </span>
              <button onClick={() => setMigrationMode(null)} className="text-xs underline" style={{ color: 'var(--ink-3)' }}>{locale === 'ar' ? 'تغيير' : 'Change'}</button>
            </div>
          )}

          {/* Clear Data (Full Reload only) */}
          {migrationMode === 'full-reload' && !resetResult && (
            <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: '#FCA5A5', background: '#FFF5F5' }}>
              <div className="flex items-center gap-2">
                <Badge style={{ background: '#EF4444', color: '#fff' }}>{locale === 'ar' ? 'اختياري — مُدمِّر' : 'OPTIONAL — DESTRUCTIVE'}</Badge>
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{locale === 'ar' ? 'تخطَّ هذه الخطوة إذا كانت قاعدة البيانات فارغة بالفعل.' : 'Skip if database is already empty.'}</span>
              </div>
              <p className="text-sm font-medium" style={{ color: '#7F1D1D' }}>{locale === 'ar' ? 'مسح بيانات الموظفين الحالية قبل التحميل' : 'Clear existing employee data before loading'}</p>
              <Button variant="outline" onClick={loadResetPreview} disabled={pending}>
                {pending ? (locale === 'ar' ? 'جارٍ حساب الصفوف…' : 'Counting rows…') : (locale === 'ar' ? 'معاينة ما سيُحذف' : 'Preview what will be deleted')}
              </Button>
              {resetPreview && (
                <div className="text-sm border rounded p-3 max-w-sm space-y-1">
                  {resetPreview.counts.map(c => (
                    <div key={c.table} className="flex justify-between text-xs">
                      <span className="font-mono">{c.table}</span>
                      <span>{c.rows < 0 ? '—' : c.rows.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-semibold text-xs border-t pt-1">
                    <span>{locale === 'ar' ? 'إجمالي الصفوف' : 'Total rows'}</span><span>{resetPreview.totalRows.toLocaleString()}</span>
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-sm">{locale === 'ar' ? <>اكتب <b>DELETE STAGING DATA</b> للتأكيد:</> : <>Type <b>DELETE STAGING DATA</b> to confirm:</>}</p>
                <Input value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} placeholder="DELETE STAGING DATA" className="max-w-72" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={runReset} disabled={!safe || resetConfirm !== 'DELETE STAGING DATA' || pending}
                  style={{ background: '#EF4444', color: '#fff' }}>
                  {pending ? (locale === 'ar' ? 'جارٍ المسح…' : 'Clearing…') : (locale === 'ar' ? 'مسح جميع بيانات الترحيل' : 'Clear all migration data')}
                </Button>
              </div>
            </div>
          )}
          {migrationMode === 'full-reload' && resetResult && (
            <div className="text-sm p-2 rounded" style={{ background: '#F0FDF4', color: '#16A34A' }}>
              ✓ {resetResult.message}
            </div>
          )}

          {/* Seed Master Data */}
          {migrationMode && (
            <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-medium">{locale === 'ar' ? 'حالة البيانات الرئيسية' : 'Master Data Status'}</p>
              <div className="flex flex-wrap gap-2">
                <Chip color={status.toCreate > 0 ? '#B45309' : '#16A34A'}>
                  {locale === 'ar' ? `${status.toCreate} عنصر للإنشاء` : `${status.toCreate} item${status.toCreate !== 1 ? 's' : ''} to create`}
                </Chip>
                <Chip color="#16A34A">{locale === 'ar' ? `${status.alreadyPresent} موجود بالفعل` : `${status.alreadyPresent} already present`}</Chip>
              </div>
              {status.toCreate > 0 && (
                <div className="space-y-1">
                  <p className="text-sm">{locale === 'ar' ? <>اكتب <b>SEED</b> لإنشاء {status.toCreate} عنصر مفقود:</> : <>Type <b>SEED</b> to create {status.toCreate} missing item{status.toCreate !== 1 ? 's' : ''}:</>}</p>
                  <Input value={seedConfirm} onChange={e => setSeedConfirm(e.target.value)} placeholder="SEED" className="max-w-40" />
                  <Button onClick={runSeed} disabled={!safe || seedConfirm !== 'SEED' || pending}>
                    {pending ? (locale === 'ar' ? 'جارٍ الإنشاء…' : 'Creating…') : (locale === 'ar' ? 'تهيئة البيانات الرئيسية' : 'Seed master data')}
                  </Button>
                </div>
              )}
              {seedResult && (
                <p className="text-sm" style={{ color: seedResult.ok ? '#16A34A' : '#B91C1C' }}>{seedResult.message}</p>
              )}
              {status.toCreate === 0 && <ReadinessBadge status="READY" />}
            </div>
          )}

          {migrationMode && (
            <Button onClick={() => go(2)} disabled={!migrationMode}>
              {locale === 'ar' ? 'المتابعة إلى رفع الملفات المصدرية →' : 'Continue to Upload Source Files →'}
            </Button>
          )}
        </Card>
      )}

      {/* ── Step 3 — Upload Source Files ───────────────────────────────────── */}
      {step === 2 && (
        <Card className="p-5 space-y-4">
          <SectionTitle step={3} meta={STEP_META[2]} status={stepStatuses[2]} />
          <StepGuide meta={STEP_META[2]} expanded={guideOpen === 2} onToggle={() => toggleGuide(2)} />

          <div className="text-sm border rounded p-3 space-y-1.5" style={{ background: 'var(--surface)' }}>
            <p className="font-medium">Upload your raw source files. The system will auto-detect each file type.</p>
            <ul className="list-disc ml-5 text-xs space-y-0.5" style={{ color: 'var(--ink-2)' }}>
              <li><b>04 Employee Master</b> — employee demographics (required)</li>
              <li><b>02 Employee Assignments</b> — department, position, contract, line manager</li>
              <li><b>04.1 Employee Leave Balance</b> — opening leave balances</li>
              <li><b>06 Users Data</b> — system user accounts (email matching)</li>
              <li><b>05 Mapping Old Position New Position</b> — position title to code</li>
              <li><b>Department Head Mapping</b> — dept code to head employee</li>
            </ul>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Accepted: .xlsx .xls .csv · Max 10 files · 50 MB each</p>
          </div>

          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".xlsx,.xls,.csv"
              className="text-sm"
              onChange={e => setSelectedFiles(Array.from(e.target.files ?? []))}
            />
            {selectedFiles.length > 0 && (
              <div className="border rounded p-3 space-y-1 text-sm" style={{ background: 'var(--surface)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Selected files:</p>
                {selectedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span>📄</span>
                    <span className="font-medium">{f.name}</span>
                    <span style={{ color: 'var(--ink-3)' }}>({(f.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ))}
              </div>
            )}
            <Button onClick={onSourceFilesUpload} disabled={!safe || selectedFiles.length === 0 || pending}>
              {pending ? (locale === 'ar' ? 'جارٍ الرفع والتحليل…' : 'Uploading and analysing…') : (locale === 'ar' ? 'رفع الملفات وتحليلها' : 'Upload and Analyse Files')}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Step 4 — Source File Analysis ──────────────────────────────────── */}
      {step === 3 && (
        <Card className="p-5 space-y-4">
          <SectionTitle step={4} meta={STEP_META[3]} status={stepStatuses[3]} />
          <StepGuide meta={STEP_META[3]} expanded={guideOpen === 3} onToggle={() => toggleGuide(3)} />

          {!analyses ? (
            <div className="flex items-center gap-2">
              <p className="text-sm" style={{ color: '#B91C1C' }}>No files analysed — return to Step 3 and upload files first.</p>
              <Button variant="outline" onClick={() => go(2)}>{locale === 'ar' ? '← العودة إلى الرفع' : '← Back to Upload'}</Button>
            </div>
          ) : (
            <>
              {analysisErrors.length > 0 && (
                <div className="border rounded p-3 space-y-1" style={{ borderColor: '#FCA5A5', background: '#FEF2F2' }}>
                  <p className="text-xs font-semibold" style={{ color: '#B91C1C' }}>Parse errors ({analysisErrors.length}):</p>
                  {analysisErrors.map((e, i) => <p key={i} className="text-xs" style={{ color: '#B91C1C' }}>⚠ {e}</p>)}
                </div>
              )}

              <div className="overflow-x-auto border rounded text-sm">
                <table className="w-full">
                  <thead><tr style={{ background: 'var(--surface)' }}>
                    <th className="text-left p-2 text-xs">File</th>
                    <th className="text-left p-2 text-xs">Detected Type</th>
                    <th className="text-left p-2 text-xs">Confidence</th>
                    <th className="text-right p-2 text-xs">Rows</th>
                    <th className="text-left p-2 text-xs">Sheets</th>
                    <th className="text-left p-2 text-xs">Issues / Warnings</th>
                  </tr></thead>
                  <tbody>
                    {analyses.map((a, i) => (
                      <tr key={i} className="border-t" style={{ background: a.detectedType === 'UNKNOWN' ? '#FFFBEB' : undefined }}>
                        <td className="p-2 font-mono text-xs max-w-[200px] truncate" title={a.fileName}>{a.fileName}</td>
                        <td className="p-2"><TypeLabel type={a.detectedType} /></td>
                        <td className="p-2"><ConfidenceBadge level={a.confidence} /></td>
                        <td className="p-2 text-right font-mono text-xs">
                          {a.sheets.reduce((s, sh) => s + sh.rowCount, 0)}
                        </td>
                        <td className="p-2 text-xs" style={{ color: 'var(--ink-3)' }}>
                          {a.sheets.map(s => s.name).join(' · ')}
                        </td>
                        <td className="p-2 text-xs space-y-0.5">
                          {a.issues.map((msg, j) => <p key={j} style={{ color: '#B91C1C' }}>⚠ {msg}</p>)}
                          {a.warnings.map((msg, j) => <p key={j} style={{ color: '#B45309' }}>ℹ {msg}</p>)}
                          {a.issues.length === 0 && a.warnings.length === 0 && <span style={{ color: '#16A34A' }}>✓ OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {analyses.some(a => a.detectedType === 'UNKNOWN') && (
                <div className="rounded p-3 text-sm" style={{ background: '#FFFBEB', border: '1px solid #B45309' }}>
                  <span className="font-semibold" style={{ color: '#B45309' }}>⚠ Unknown files detected.</span>
                  <span style={{ color: 'var(--ink-2)' }}> These files will be ignored during transformation. Re-upload with descriptive filenames to help the classifier, or proceed and those files will produce a warning-only in the build summary.</span>
                </div>
              )}

              {analyses.some(a => a.detectedType === 'EMPLOYEE_MASTER') ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <ReadinessBadge status={analysisErrors.length > 0 ? 'READY WITH WARNINGS' : 'READY'} />
                  <Button onClick={() => go(4)}>{locale === 'ar' ? 'تم تأكيد التحليل — المتابعة إلى التحويل →' : 'Analysis confirmed — Continue to Transform →'}</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <ReadinessBadge status="BLOCKED" />
                  <p className="text-sm" style={{ color: '#B91C1C' }}>No Employee Master file detected. Re-upload with the employee demographics file.</p>
                  <Button variant="outline" onClick={() => go(2)}>{locale === 'ar' ? '← إعادة رفع الملفات' : '← Re-upload files'}</Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* ── Step 5 — Map & Transform ───────────────────────────────────────── */}
      {step === 4 && (
        <Card className="p-5 space-y-4">
          <SectionTitle step={5} meta={STEP_META[4]} status={stepStatuses[4]} />
          <StepGuide meta={STEP_META[4]} expanded={guideOpen === 4} onToggle={() => toggleGuide(4)} />

          {!sessionId ? (
            <div className="flex items-center gap-2">
              <p className="text-sm" style={{ color: '#B91C1C' }}>No source files uploaded. Return to Step 3.</p>
              <Button variant="outline" onClick={() => go(2)}>{locale === 'ar' ? '← رفع الملفات' : '← Upload Files'}</Button>
            </div>
          ) : (
            <>
              <Button onClick={onBuildPackage} disabled={!safe || pending}>
                {pending ? (locale === 'ar' ? 'جارٍ تحويل الملفات المصدرية…' : 'Transforming source files…') : transformSummary ? (locale === 'ar' ? 'إعادة تشغيل التحويل' : 'Re-run transformation') : (locale === 'ar' ? 'تشغيل التحويل' : 'Run transformation')}
              </Button>

              {transformSummary && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {transformSummary.canBuild
                      ? <ReadinessBadge status={transformSummary.warnings.length > 0 ? 'READY WITH WARNINGS' : 'READY'} />
                      : <ReadinessBadge status="BLOCKED" />}
                    <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Transformation complete</span>
                  </div>

                  {/* Summary counts */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { label: 'Employees detected',  n: transformSummary.employeesIncluded, icon: '👤' },
                      { label: 'Employees skipped',   n: transformSummary.employeesSkipped,  icon: '⊘' },
                      { label: 'Managers resolved',   n: transformSummary.managersResolved,  icon: '🔗' },
                      { label: 'Dept heads',          n: transformSummary.deptHeadsResolved, icon: '🏢' },
                      { label: 'Leave balances',      n: transformSummary.leaveBalancesDetected, icon: '📅' },
                      { label: 'Users matched',       n: transformSummary.usersMatched,      icon: '🔑' },
                      { label: 'Mobiles normalised',  n: transformSummary.mobileNormalized,  icon: '📱' },
                      { label: 'Positions from mapping', n: transformSummary.positionsFromMapping, icon: '💼' },
                    ].map(({ label, n, icon }) => (
                      <div key={label} className="border rounded-lg p-2 text-center">
                        <p className="text-sm">{icon}</p>
                        <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-serif)' }}>{n}</p>
                        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Blockers */}
                  {transformSummary.blockers.length > 0 && (
                    <div className="border rounded p-3 space-y-1" style={{ borderColor: '#FCA5A5', background: '#FEF2F2' }}>
                      <p className="text-xs font-semibold" style={{ color: '#B91C1C' }}>Blockers — must resolve before continuing:</p>
                      {transformSummary.blockers.map((b, i) => (
                        <p key={i} className="text-xs" style={{ color: '#B91C1C' }}>✗ [{b.field}] {b.message}</p>
                      ))}
                    </div>
                  )}

                  {/* Warnings */}
                  {transformSummary.warnings.length > 0 && (
                    <details>
                      <summary className="text-sm cursor-pointer font-medium" style={{ color: '#B45309' }}>
                        {transformSummary.warnings.length} warning(s) — will not block migration
                      </summary>
                      <div className="mt-1 max-h-40 overflow-auto border rounded p-2 text-xs space-y-0.5" style={{ color: '#B45309' }}>
                        {transformSummary.warnings.map((w, i) => (
                          <p key={i}>{w.employeeNumber ? `[${w.employeeNumber}] ` : ''}{w.field}: {w.message}</p>
                        ))}
                      </div>
                    </details>
                  )}

                  {transformSummary.canBuild && (
                    <Button onClick={() => go(5)}>{locale === 'ar' ? 'اكتمل التحويل — المتابعة إلى بناء الحزمة →' : 'Transformation complete — Continue to Build Package →'}</Button>
                  )}
                  {!transformSummary.canBuild && (
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => go(2)}>{locale === 'ar' ? '← إعادة رفع الملفات المصدرية' : '← Re-upload source files'}</Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* ── Step 6 — Build Migration Package ───────────────────────────────── */}
      {step === 5 && (
        <Card className="p-5 space-y-5">
          <SectionTitle step={6} meta={STEP_META[5]} status={stepStatuses[5]} />
          <StepGuide meta={STEP_META[5]} expanded={guideOpen === 5} onToggle={() => toggleGuide(5)} />

          {/* Path A — use generated package */}
          {sessionId && transformSummary?.canBuild && (
            <div className="border rounded-lg p-4 space-y-3" style={{ borderColor: '#BBF7D0', background: '#F0FDF4' }}>
              <p className="text-sm font-semibold" style={{ color: '#15803D' }}>{locale === 'ar' ? '✓ الحزمة من الملفات المصدرية جاهزة' : '✓ Source-file package ready'}</p>
              <div className="flex flex-wrap gap-2">
                <Chip color="#1D4ED8">Employees: {transformSummary.employeesIncluded}</Chip>
                <Chip color="#1D4ED8">Managers: {transformSummary.managersResolved}</Chip>
                <Chip color="#1D4ED8">Dept heads: {transformSummary.deptHeadsResolved}</Chip>
                <Chip color="#1D4ED8">Leave balances: {transformSummary.leaveBalancesDetected}</Chip>
              </div>
              {transformSummary.warnings.length > 0 && (
                <ReadinessBadge status="READY WITH WARNINGS" />
              )}
              <Button onClick={onUseSourcePackage} disabled={!safe || pending}>
                {pending ? (locale === 'ar' ? 'جارٍ استرجاع الحزمة…' : 'Retrieving package…') : (locale === 'ar' ? 'استخدام هذه الحزمة → المتابعة إلى التحقق' : 'Use this package → Continue to Validation')}
              </Button>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t" style={{ borderColor: 'var(--border)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--ink-3)' }}>
              {sessionId && transformSummary?.canBuild
                ? (locale === 'ar' ? 'أو استخدم مصنّف V2 جاهزًا بدلاً من ذلك' : 'OR use a pre-built V2 workbook instead')
                : (locale === 'ar' ? 'رفع مصنّف V2 جاهز' : 'Upload a pre-built V2 workbook')}
            </span>
            <div className="flex-1 border-t" style={{ borderColor: 'var(--border)' }} />
          </div>

          {/* Path B — V2 fallback upload (existing flow, preserved) */}
          <div className="border rounded-lg p-4 space-y-3" style={{ background: 'var(--surface)' }}>
            <p className="text-sm font-medium">{locale === 'ar' ? 'رفع مصنّف V2 جاهز (بديل)' : 'Upload Pre-Built V2 Workbook (fallback)'}</p>
            <div className="text-xs space-y-0.5" style={{ color: 'var(--ink-2)' }}>
              <p>Required sheets: <b>Employees</b> · <b>Managers</b> · <b>DeptHeads</b> · <b>LeaveBalances</b></p>
              <p style={{ color: 'var(--ink-3)' }}>Run <code>node scripts/build-full-v2-workbook.mjs</code> to generate from source files.</p>
            </div>
            <form onSubmit={onV2Upload} className="space-y-2">
              <input type="file" name="file" accept=".xlsx,.xls" required className="text-sm" />
              <div><Button type="submit" disabled={!safe || pending}>
                {pending ? (locale === 'ar' ? 'جارٍ تحليل المصنّف…' : 'Parsing workbook…') : (locale === 'ar' ? 'رفع هذا المصنّف واستخدامه' : 'Upload and use this workbook')}
              </Button></div>
            </form>
            {pkg && buildPath === 'v2upload' && (
              <div className="border rounded p-3 space-y-2 text-sm" style={{ borderColor: '#BBF7D0', background: '#F0FDF4' }}>
                <p className="font-medium" style={{ color: '#16A34A' }}>{locale === 'ar' ? '✓ تم تحليل المصنّف — الحزمة جاهزة' : '✓ Workbook parsed — package ready'}</p>
                <div className="flex flex-wrap gap-2">
                  <Chip color="#1D4ED8">Employees: {pkg.employees.length}</Chip>
                  <Chip color="#1D4ED8">Manager links: {pkg.managers.length}</Chip>
                  <Chip color="#1D4ED8">Dept heads: {pkg.deptHeads.length}</Chip>
                  <Chip color="#1D4ED8">Leave balances: {pkg.leaveBalances.length}</Chip>
                </div>
                <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Sheets: {pkg.sheetNames.join(' · ')}</p>
                <Button onClick={() => go(6)}>{locale === 'ar' ? 'المتابعة إلى التحقق →' : 'Continue to Validation →'}</Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Step 7 — Pre-Import Validation ─────────────────────────────────── */}
      {step === 6 && (
        <Card className="p-5 space-y-4">
          <SectionTitle step={7} meta={STEP_META[6]} status={stepStatuses[6]} />
          <StepGuide meta={STEP_META[6]} expanded={guideOpen === 6} onToggle={() => toggleGuide(6)} />

          {!pkg ? (
            <div className="flex items-center gap-2">
              <p className="text-sm" style={{ color: '#B91C1C' }}>No package available — return to Step 6 and build or upload a package.</p>
              <Button variant="outline" onClick={() => go(5)}>{locale === 'ar' ? '← العودة إلى بناء الحزمة' : '← Back to Build Package'}</Button>
            </div>
          ) : (
            <>
              {buildPath && (
                <p className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface)', color: 'var(--ink-3)' }}>
                  Package source: {buildPath === 'source' ? '🏭 Generated from source files' : '📄 Uploaded V2 workbook'}
                </p>
              )}
              <Button onClick={runValidation} disabled={pending}>
                {pending ? (locale === 'ar' ? 'جارٍ التحقق من جميع الأوراق…' : 'Validating all sheets…') : validation ? (locale === 'ar' ? 'إعادة تشغيل التحقق' : 'Re-run validation') : (locale === 'ar' ? 'تشغيل التحقق' : 'Run validation')}
              </Button>
              {validation && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 items-center">
                    {validation.canExecute ? <ReadinessBadge status="READY" /> : <ReadinessBadge status="BLOCKED" />}
                    <Chip>{validation.employeePreview.totalRows} employees</Chip>
                    <Chip color={validation.employeePreview.errorRows ? '#EF4444' : '#16A34A'}>{validation.employeePreview.errorRows} errors</Chip>
                    <Chip color={validation.employeePreview.warningRows ? '#B45309' : undefined}>{validation.employeePreview.warningRows} warnings</Chip>
                    {validation.cycleCount > 0 && <Chip color="#EF4444">{validation.cycleCount} cycle(s)</Chip>}
                    {validation.withinBatchManagerCount > 0 && <Chip color="#2563EB">{validation.withinBatchManagerCount} within-batch mgr(s)</Chip>}
                  </div>
                  {validation.employeePreview.issues.length > 0 && (
                    <details open={validation.employeePreview.errorRows > 0}>
                      <summary className="text-sm font-semibold cursor-pointer">Employee sheet issues ({validation.employeePreview.issues.length})</summary>
                      <div className="max-h-52 overflow-auto border rounded text-xs mt-2">
                        <table className="w-full">
                          <thead><tr style={{ background: 'var(--surface)' }}><th className="text-left p-2">Row</th><th className="text-left p-2">Field</th><th className="text-left p-2">Sev</th><th className="text-left p-2">Message</th></tr></thead>
                          <tbody>{validation.employeePreview.issues.map((is, i) => (
                            <tr key={i} className="border-t" style={{ background: is.severity === 'ERROR' ? '#FEF2F2' : undefined }}>
                              <td className="p-2">{is.rowNumber}</td><td className="p-2">{is.field}</td>
                              <td className="p-2 font-medium" style={{ color: is.severity === 'ERROR' ? '#B91C1C' : '#B45309' }}>{is.severity}</td>
                              <td className="p-2">{is.message}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </details>
                  )}
                  {[...validation.issues, ...validation.leaveIssues].length > 0 && (
                    <details open={[...validation.issues, ...validation.leaveIssues].some(i => i.severity === 'ERROR')}>
                      <summary className="text-sm font-semibold cursor-pointer">Cross-sheet issues ({[...validation.issues, ...validation.leaveIssues].length})</summary>
                      <div className="max-h-52 overflow-auto border rounded text-xs mt-2">
                        <table className="w-full">
                          <thead><tr style={{ background: 'var(--surface)' }}><th className="text-left p-2">Sheet</th><th className="text-left p-2">Row</th><th className="text-left p-2">Sev</th><th className="text-left p-2">Message</th></tr></thead>
                          <tbody>{[...validation.issues, ...validation.leaveIssues].map((is, i) => (
                            <tr key={i} className="border-t" style={{ background: is.severity === 'ERROR' ? '#FEF2F2' : undefined }}>
                              <td className="p-2">{is.sheet}</td><td className="p-2">{is.row ?? '—'}</td>
                              <td className="p-2 font-medium" style={{ color: is.severity === 'ERROR' ? '#B91C1C' : '#B45309' }}>{is.severity}</td>
                              <td className="p-2">{is.message}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </details>
                  )}
                  {validation.canExecute
                    ? <Button onClick={() => go(7)}>{locale === 'ar' ? 'نجح التحقق — المتابعة إلى التشغيل التجريبي →' : 'Validation passed — Continue to Dry Run →'}</Button>
                    : (
                      <div className="text-sm space-y-1">
                        <p style={{ color: '#B91C1C' }}>✗ {validation.employeePreview.errorRows} blocking error(s). Correct the package and re-upload.</p>
                        <Button variant="outline" onClick={() => go(5)}>{locale === 'ar' ? '← العودة إلى بناء الحزمة' : '← Back to Build Package'}</Button>
                      </div>
                    )}
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* ── Step 8 — Dry Run ────────────────────────────────────────────────── */}
      {step === 7 && (
        <Card className="p-5 space-y-4">
          <SectionTitle step={8} meta={STEP_META[7]} status={stepStatuses[7]} />
          <StepGuide meta={STEP_META[7]} expanded={guideOpen === 7} onToggle={() => toggleGuide(7)} />
          {!dryRun ? (
            <div className="flex items-center gap-2">
              <p className="text-sm" style={{ color: '#B91C1C' }}>No validation result — complete Step 7 first.</p>
              <Button variant="outline" onClick={() => go(6)}>{locale === 'ar' ? '← العودة إلى التحقق' : '← Back to Validation'}</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {dryRun.canExecute ? <ReadinessBadge status="READY" /> : <ReadinessBadge status="BLOCKED" />}
                <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{locale === 'ar' ? 'لم تتم كتابة أي بيانات.' : 'No data has been written.'}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: locale === 'ar' ? 'موظفون للإنشاء'        : 'Employees to create',   valid: dryRun.validEmployees,       errors: dryRun.errorEmployees },
                  { label: locale === 'ar' ? 'روابط مديرين للتعيين'   : 'Manager links to set',  valid: dryRun.managerLinksValid,    errors: dryRun.managerLinksErrors },
                  { label: locale === 'ar' ? 'رؤساء أقسام للتعيين'     : 'Dept heads to assign',  valid: dryRun.deptHeadLinksValid,   errors: dryRun.deptHeadLinksErrors },
                  { label: locale === 'ar' ? 'أرصدة إجازات للتحميل'    : 'Leave balances to load',valid: dryRun.leaveBalancesValid,   errors: dryRun.leaveBalancesErrors },
                ].map(({ label, valid, errors }) => (
                  <div key={label} className="border rounded-lg p-3 space-y-1 text-sm">
                    <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{label}</p>
                    <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-serif)', color: '#16A34A' }}>{valid}</p>
                    {errors > 0 && <p className="text-xs" style={{ color: '#EF4444' }}>⚠ {locale === 'ar' ? `${errors} بها أخطاء` : `${errors} with errors`}</p>}
                  </div>
                ))}
              </div>
              {dryRun.blockers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-semibold" style={{ color: '#B91C1C' }}>Blocking issues:</p>
                  <ul className="text-sm list-disc ml-5" style={{ color: '#B91C1C' }}>
                    {dryRun.blockers.map((b, i) => <li key={i}>[{b.sheet}] {b.message}</li>)}
                  </ul>
                </div>
              )}
              {dryRun.warnings.length > 0 && (
                <details>
                  <summary className="text-sm cursor-pointer font-medium" style={{ color: '#B45309' }}>{dryRun.warnings.length} warning(s)</summary>
                  <ul className="text-sm list-disc ml-5 mt-1" style={{ color: '#B45309' }}>
                    {dryRun.warnings.map((w, i) => <li key={i}>[{w.sheet}] {w.message}</li>)}
                  </ul>
                </details>
              )}
              <div className="flex gap-2 flex-wrap">
                {dryRun.canExecute
                  ? <Button onClick={() => go(8)}>{locale === 'ar' ? 'لقد راجعت الخطة — المتابعة إلى التنفيذ →' : 'I have reviewed the plan — Proceed to Execute →'}</Button>
                  : <p className="text-sm font-medium" style={{ color: '#B91C1C' }}>{locale === 'ar' ? 'عالِج العوائق قبل التنفيذ.' : 'Resolve blockers before executing.'}</p>}
                <Button variant="outline" onClick={() => go(5)}>{locale === 'ar' ? 'إعادة رفع / إعادة بناء الحزمة' : 'Re-upload / rebuild package'}</Button>
              </div>
            </>
          )}
        </Card>
      )}

      {/* ── Step 9 — Execute Migration ──────────────────────────────────────── */}
      {step === 8 && (
        <Card className="p-5 space-y-4" style={{ borderColor: dryRun?.canExecute ? '#BBF7D0' : '#FCA5A5' }}>
          <SectionTitle step={9} meta={STEP_META[8]} status={stepStatuses[8]} />
          <StepGuide meta={STEP_META[8]} expanded={guideOpen === 8} onToggle={() => toggleGuide(8)} />

          {!validation || !dryRun ? (
            <div className="flex items-center gap-2">
              <p className="text-sm" style={{ color: '#B91C1C' }}>{locale === 'ar' ? 'أكمِل الخطوتين ٧–٨ قبل التنفيذ.' : 'Complete Steps 7–8 before executing.'}</p>
              <Button variant="outline" onClick={() => go(6)}>{locale === 'ar' ? '← العودة إلى التحقق' : '← Back to Validation'}</Button>
            </div>
          ) : (
            <>
              <div className="text-sm border rounded p-3 space-y-1.5" style={{ background: 'var(--surface)' }}>
                <p className="font-medium">{locale === 'ar' ? 'سيُنفَّذ على ٥ مراحل:' : 'Execution will run in 5 phases:'}</p>
                <ol className="list-decimal ml-5 space-y-0.5" style={{ color: 'var(--ink-2)' }}>
                  <li>{locale === 'ar' ? <>إنشاء <b>{dryRun.validEmployees}</b> سجل موظف، وتعيينات، وحسابات مستخدمين</> : <>Create <b>{dryRun.validEmployees}</b> employee records, assignments, and user accounts</>}</li>
                  <li>{locale === 'ar' ? <>تعيين <b>{dryRun.managerLinksValid}</b> روابط هرمية للمديرين</> : <>Set <b>{dryRun.managerLinksValid}</b> manager hierarchy links</>}</li>
                  <li>{locale === 'ar' ? <>تعيين <b>{dryRun.deptHeadLinksValid}</b> رؤساء أقسام</> : <>Assign <b>{dryRun.deptHeadLinksValid}</b> department heads</>}</li>
                  <li>{locale === 'ar' ? 'ربط رؤساء الأقسام تلقائيًا — تعبئة المديرين المفقودين من رئيس القسم' : 'HOD auto-link — fill remaining missing managers from department head'}</li>
                  <li>{locale === 'ar' ? <>تحميل <b>{dryRun.leaveBalancesValid}</b> سجلات أرصدة إجازات</> : <>Load <b>{dryRun.leaveBalancesValid}</b> leave balance records</>}</li>
                </ol>
              </div>
              {!execResult && (
                <div className="space-y-1">
                  <p className="text-sm font-medium" style={{ color: '#B91C1C' }}>
                    {locale === 'ar'
                      ? <>⚠ ستتم كتابة البيانات إلى قاعدة البيانات الحيّة. اكتب <b>EXECUTE MIGRATION</b> للتأكيد:</>
                      : <>⚠ This writes data to the live database. Type <b>EXECUTE MIGRATION</b> to confirm:</>}
                  </p>
                  <Input value={execConfirm} onChange={e => setExecConfirm(e.target.value)} placeholder="EXECUTE MIGRATION" className="max-w-72" />
                  <Button onClick={runExecute} disabled={!safe || execConfirm !== 'EXECUTE MIGRATION' || pending}
                    style={{ background: '#16A34A', color: '#fff' }}>
                    {pending ? (locale === 'ar' ? 'جارٍ تنفيذ الترحيل…' : 'Executing migration…') : (locale === 'ar' ? 'تأكيد وتنفيذ الترحيل' : 'Confirm and execute migration')}
                  </Button>
                </div>
              )}
              {execResult && (
                <div className="space-y-3">
                  <div className="rounded-lg p-3" style={{ background: execResult.ok ? '#F0FDF4' : '#FEF2F2', border: `2px solid ${execResult.ok ? '#BBF7D0' : '#EF4444'}` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span>{execResult.ok ? '✅' : '❌'}</span>
                      <p className="text-sm font-bold" style={{ color: execResult.ok ? '#16A34A' : '#B91C1C' }}>
                        {execResult.ok
                          ? (locale === 'ar' ? 'تم تنفيذ الترحيل بنجاح — اكتملت المراحل الخمس جميعها.' : 'Migration executed successfully — all 5 phases completed.')
                          : (locale === 'ar' ? 'فشل الترحيل — لم تكتب مرحلة أو أكثر البيانات المتوقعة. لا تتابع إلى الاعتماد.' : 'MIGRATION FAILED — one or more phases did not write expected data. Do not proceed to sign-off.')}
                      </p>
                    </div>
                    {!execResult.ok && <p className="text-xs mt-1" style={{ color: '#7F1D1D' }}>{locale === 'ar' ? 'عالِج الأخطاء، وامسح قاعدة البيانات (الخطوة ٢)، وأعد التشغيل من الخطوة ٣.' : 'Resolve errors, clear the database (Step 2), and re-run from Step 3.'}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {[
                      { label: 'Employees',      n: execResult.employeesCreated },
                      { label: 'User Accounts',  n: execResult.usersCreated },
                      { label: 'Mgr Links',      n: execResult.managerLinksSet },
                      { label: 'Dept Heads',     n: execResult.deptHeadsSet },
                      { label: 'Leave Balances', n: execResult.leaveBalancesCreated },
                      { label: 'Mgr Roles',      n: execResult.managerRolesAssigned },
                    ].map(({ label, n }) => (
                      <div key={label} className="border rounded-lg p-2 text-center">
                        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{label}</p>
                        <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-serif)' }}>{n}</p>
                      </div>
                    ))}
                  </div>
                  {execResult.errors.length > 0 && (
                    <div className="rounded border p-3" style={{ borderColor: '#FCA5A5', background: '#FEF2F2' }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: '#B91C1C' }}>Execution errors ({execResult.errors.length}):</p>
                      <ul className="text-xs list-disc ml-4 space-y-0.5" style={{ color: '#B91C1C' }}>
                        {execResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                  {execResult.ok
                    ? <Button onClick={() => go(9)}>{locale === 'ar' ? 'المتابعة إلى التحقق بعد التحميل →' : 'Continue to Post-Load Verification →'}</Button>
                    : <Button variant="outline" onClick={() => go(1)}>{locale === 'ar' ? '← العودة إلى مسح البيانات وإعادة المحاولة' : '← Return to Clear Data and retry'}</Button>}
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* ── Step 10 — Post-Load Verification ───────────────────────────────── */}
      {step === 9 && (
        <Card className="p-5 space-y-4">
          <SectionTitle step={10} meta={STEP_META[9]} status={stepStatuses[9]} />
          <StepGuide meta={STEP_META[9]} expanded={guideOpen === 9} onToggle={() => toggleGuide(9)} />
          {!execResult ? (
            <div className="flex items-center gap-2">
              <p className="text-sm" style={{ color: '#B91C1C' }}>{locale === 'ar' ? 'نفّذ الترحيل أولاً (الخطوة ٩).' : 'Execute migration first (Step 9).'}</p>
              <Button variant="outline" onClick={() => go(8)}>{locale === 'ar' ? '← العودة إلى التنفيذ' : '← Back to Execute'}</Button>
            </div>
          ) : (
            <>
              <Button onClick={loadScorecard} disabled={pending}>
                {pending ? (locale === 'ar' ? 'جارٍ تشغيل الفحوصات…' : 'Running checks…') : scorecard ? (locale === 'ar' ? 'إعادة تشغيل التحقق' : 'Re-run verification') : (locale === 'ar' ? 'تشغيل التحقق بعد التحميل' : 'Run post-load verification')}
              </Button>
              {scorecard && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <ReadinessBadge status={scorecard.verdict === 'READY' ? 'READY' : scorecard.verdict === 'READY_WITH_RISKS' ? 'READY WITH RISKS' : 'NOT READY'} />
                    <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{scorecard.summary}</span>
                  </div>
                  <div className="border rounded overflow-hidden text-sm">
                    <TableScrollRegion><table className="w-full">
                      <thead><tr style={{ background: 'var(--surface)' }}>
                        <th className="text-left p-2">Check</th><th className="text-right p-2">Expected</th>
                        <th className="text-right p-2">Actual</th><th className="p-2 text-center">Result</th>
                        <th className="text-left p-2">Detail</th>
                      </tr></thead>
                      <tbody>
                        {scorecard.rows.map((r, i) => (
                          <tr key={i} className="border-t" style={{ background: r.pass ? undefined : '#FEF2F2' }}>
                            <td className="p-2">{r.check}</td>
                            <td className="p-2 text-right text-xs font-mono">{r.expected}</td>
                            <td className="p-2 text-right text-xs font-mono">{r.actual}</td>
                            <td className="p-2 text-center">{r.pass ? '✅' : '❌'}</td>
                            <td className="p-2 text-xs" style={{ color: 'var(--ink-3)' }}>{r.detail ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></TableScrollRegion>
                  </div>
                  <Button onClick={() => go(10)}>{locale === 'ar' ? 'المتابعة إلى الاعتماد →' : 'Continue to Sign Off →'}</Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* ── Step 11 — Sign Off ──────────────────────────────────────────────── */}
      {step === 10 && (
        <Card className="p-5 space-y-5">
          <SectionTitle step={11} meta={STEP_META[10]} status={stepStatuses[10]} />
          <StepGuide meta={STEP_META[10]} expanded={guideOpen === 10} onToggle={() => toggleGuide(10)} />
          {!scorecard || !execResult ? (
            <div className="flex items-center gap-2">
              <p className="text-sm" style={{ color: '#B91C1C' }}>{locale === 'ar' ? 'أكمِل التحقق بعد التحميل (الخطوة ١٠) قبل الاعتماد.' : 'Complete Post-Load Verification (Step 10) before signing off.'}</p>
              <Button variant="outline" onClick={() => go(9)}>{locale === 'ar' ? '← العودة إلى التحقق' : '← Back to Verification'}</Button>
            </div>
          ) : (
            <CertificationSummary execResult={execResult} scorecard={scorecard} />
          )}
          <div className="flex gap-2 flex-wrap pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <Button variant="outline" onClick={() => {
              setPkg(null); setValidation(null); setDryRun(null)
              setExecResult(null); setScorecard(null); setExecConfirm('')
              setSessionId(null); setAnalyses(null); setTransformSummary(null)
              setBuildPath(null); go(2)
            }}>
              {locale === 'ar' ? 'بدء ترحيل جديد →' : 'Start new migration →'}
            </Button>
          </div>
        </Card>
      )}

    </div>
  )
}
