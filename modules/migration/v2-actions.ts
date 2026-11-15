'use server'
/**
 * Migration Framework V2 — Server Actions.
 *
 * SUPER_ADMIN only. assertBranchSafe enforced on all write actions.
 * Read-only actions (parse, validate, scorecard) are safe for any SUPER_ADMIN call.
 *
 * Action sequence:
 *   parseMigrationPackage   → V2ParsedPackage   (Step 4 — file upload)
 *   validateMigrationPackage → V2ValidationResult (Step 5 — validation)
 *   executeMigration        → V2ExecutionResult  (Step 7 — confirm & execute)
 *   getPostLoadScorecard    → PostLoadScorecard  (Step 8 — verification)
 */
import { and, eq, isNotNull, isNull, sql, inArray, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import {
  persons, departments, absenceBalances, workerAssignments, userAccounts,
} from '@/drizzle/schema'
import { TENANT_ID } from '@/lib/constants'
import { assertBranchSafe } from './branch-safety'
import { parseMigrationPackageFile } from './v2-package-parser'
import { validateMigrationPackage as _validateMigrationPackage } from './v2-validator'
import { executeMigrationV2 } from './v2-executor'
import type { V2ParsedPackage, V2ValidationResult, V2ExecutionResult, PostLoadScorecard, PostLoadScorecardRow } from './v2-types'

const SA = ['SUPER_ADMIN'] as const
const MAX_BYTES = 10 * 1024 * 1024  // 10 MB — larger than V1 (4 sheets)
const MAX_EMPLOYEE_ROWS = 1_000

// ── 1 — Parse migration package (file upload, no writes) ─────────────────────

export async function parseMigrationPackage(
  formData: FormData,
): Promise<V2ParsedPackage | { error: string }> {
  try {
    await requireRole([...SA])

    const file = formData.get('file')
    if (!(file instanceof File)) return { error: 'No file provided' }
    if (file.size > MAX_BYTES)   return { error: `File exceeds ${MAX_BYTES / 1024 / 1024} MB limit` }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'xls') return { error: 'Only .xlsx or .xls files are accepted' }

    const arrayBuffer = await file.arrayBuffer()
    const pkg = parseMigrationPackageFile(arrayBuffer)

    if (pkg.employees.length === 0) return { error: 'Employees sheet is empty — no data rows found' }
    if (pkg.employees.length > MAX_EMPLOYEE_ROWS) {
      return { error: `Employees sheet has ${pkg.employees.length} rows. Maximum is ${MAX_EMPLOYEE_ROWS} per package.` }
    }

    return pkg
  } catch (e) {
    console.error('[parseMigrationPackage]', e)
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── 2 — Validate migration package (DB reads only, no writes) ─────────────────

export async function validateMigrationPackage(
  pkg: V2ParsedPackage,
): Promise<V2ValidationResult | { error: string }> {
  try {
    await requireRole([...SA])
    return await _validateMigrationPackage(pkg)
  } catch (e) {
    console.error('[validateMigrationPackage]', e)
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── 3 — Execute migration (WRITE — 4 staged phases) ──────────────────────────

export async function executeMigration(
  validationResult: V2ValidationResult,
): Promise<V2ExecutionResult | { error: string }> {
  try {
    const user = await requireRole([...SA])
    assertBranchSafe()

    if (!validationResult.canExecute) {
      return { error: 'Migration package has blocking errors. Resolve them before executing.' }
    }
    if (validationResult.employeePreview.validRows === 0) {
      return { error: 'No valid employee rows to import.' }
    }

    const result = await executeMigrationV2(validationResult, {
      id:            user.id,
      name:          user.name,
      role:          user.role,
      personId:      user.personId,
      legalEntityId: user.legalEntityId,
    })

    return result
  } catch (e) {
    console.error('[executeMigration]', e)
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ── 4 — Post-load scorecard (self-contained, no expectedCounts needed) ───────
//
// Derives all checks from live DB state. Covers all 9 spec items:
//   employees loaded, assignments created, active workers, users created,
//   employees without users, employees without line managers,
//   departments without heads, employees without leave balances,
//   org chart / leave request / manager approval readiness.

export async function getPostLoadScorecard(): Promise<PostLoadScorecard | { error: string }> {
  try {
    await requireRole([...SA])

    // All active person IDs (for subquery-free balance check)
    const activePersonRows = await db
      .select({ id: persons.id, userAccountId: persons.userAccountId, lineManagerId: persons.lineManagerId })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true)))

    const activePersonIds = activePersonRows.map(p => p.id)
    const totalActive     = activePersonIds.length

    // Persons with ≥1 direct report (= "managers" in the hierarchy)
    const directReportRows = await db
      .select({ managerId: persons.lineManagerId })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true), isNotNull(persons.lineManagerId)))
    const managerPersonIds = [...new Set(
      (directReportRows.map(r => r.managerId).filter(Boolean) as string[])
    )]

    const [
      activeAssignments,
      totalUsers,
      deptsWithHead,
      deptsWithoutHead,
      totalDepts,
      balancePersonIds,
      managerRoleRows,
    ] = await Promise.all([
      // Active worker assignments
      db.select({ n: sql<number>`COUNT(*)::int` })
        .from(workerAssignments)
        .where(and(
          eq(workerAssignments.tenantId, TENANT_ID),
          eq(workerAssignments.assignmentStatus, 'ACTIVE'),
          eq(workerAssignments.isCurrent, true),
        )),

      // User accounts linked to active persons
      activePersonIds.length > 0
        ? db.select({ n: sql<number>`COUNT(*)::int` })
            .from(userAccounts)
            .where(and(
              eq(userAccounts.tenantId, TENANT_ID),
              eq(userAccounts.isActive, true),
              inArray(userAccounts.personId, activePersonIds),
            ))
        : Promise.resolve([{ n: 0 }]),

      // Departments with head
      db.select({ n: sql<number>`COUNT(*)::int` })
        .from(departments)
        .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true), isNotNull(departments.headPersonId))),

      // Departments without head
      db.select({ n: sql<number>`COUNT(*)::int` })
        .from(departments)
        .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true), isNull(departments.headPersonId))),

      // All active departments
      db.select({ n: sql<number>`COUNT(*)::int` })
        .from(departments)
        .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true))),

      // Distinct person IDs with at least one absence balance
      activePersonIds.length > 0
        ? db.select({ personId: absenceBalances.personId })
            .from(absenceBalances)
            .where(and(
              eq(absenceBalances.tenantId, TENANT_ID),
              inArray(absenceBalances.personId, activePersonIds),
            ))
        : Promise.resolve([]),

      // User accounts for manager persons that already have a non-EMPLOYEE role
      managerPersonIds.length > 0
        ? db.select({ personId: userAccounts.personId, avaniisRole: userAccounts.avaniisRole })
            .from(userAccounts)
            .where(and(
              eq(userAccounts.tenantId, TENANT_ID),
              eq(userAccounts.isActive, true),
              inArray(userAccounts.personId, managerPersonIds),
            ))
        : Promise.resolve([]),
    ])

    const numAssignments       = Number(activeAssignments[0]?.n ?? 0)
    const numUsers             = Number(totalUsers[0]?.n ?? 0)
    const numDeptsWithHead     = Number(deptsWithHead[0]?.n ?? 0)
    const numDeptsWithoutHead  = Number(deptsWithoutHead[0]?.n ?? 0)
    const numDepts             = Number(totalDepts[0]?.n ?? 0)

    const personsWithBalance   = new Set((balancePersonIds as { personId: string }[]).map(r => r.personId))
    const numWithBalance       = personsWithBalance.size
    const numWithoutBalance    = totalActive - numWithBalance

    const numWithoutUser       = activePersonRows.filter(p => !p.userAccountId).length
    const numWithManager       = activePersonRows.filter(p => p.lineManagerId).length
    const numWithoutManager    = totalActive - numWithManager

    // Manager role scorecard
    const MANAGER_ROLES = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER']
    const managerRoleMap = new Map(
      (managerRoleRows as { personId: string; avaniisRole: string }[]).map(r => [r.personId, r.avaniisRole])
    )
    const numManagersWithRole    = managerPersonIds.filter(id => MANAGER_ROLES.includes(managerRoleMap.get(id) ?? '')).length
    const numManagersMissingRole = managerPersonIds.filter(id => !MANAGER_ROLES.includes(managerRoleMap.get(id) ?? '')).length
    const totalManagers          = managerPersonIds.length

    // ── Readiness signals (derived) ──────────────────────────────────────────
    const orgChartReady        = numDeptsWithoutHead === 0 && numWithoutManager === 0
    const leaveRequestReady    = numWithoutBalance === 0
    const managerApprovalReady = numWithoutManager === 0

    const rows: PostLoadScorecardRow[] = [
      // ── Data completeness ──────────────────────────────────────────────────
      {
        check:  'Employees loaded',
        expected: totalActive,
        actual:   totalActive,
        pass:     totalActive > 0,
        detail:   totalActive === 0 ? 'No active employees found — was migration executed?' : undefined,
      },
      {
        check:  'Active worker assignments created',
        expected: totalActive,
        actual:   numAssignments,
        pass:     numAssignments >= totalActive,
        detail:   numAssignments < totalActive
          ? `${totalActive - numAssignments} employee(s) have no active assignment`
          : undefined,
      },
      {
        check:  'User accounts created',
        expected: totalActive,
        actual:   numUsers,
        pass:     numWithoutUser === 0,
        detail:   numWithoutUser > 0
          ? `${numWithoutUser} employee(s) have no user account — they cannot log in`
          : undefined,
      },
      {
        check:  'Line managers assigned',
        expected: totalActive,
        actual:   numWithManager,
        pass:     numWithoutManager === 0,
        detail:   numWithoutManager > 0
          ? `${numWithoutManager} employee(s) have no line manager — My Team and approvals will not work`
          : undefined,
      },
      {
        check:  'Department heads set',
        expected: numDepts,
        actual:   numDeptsWithHead,
        pass:     numDeptsWithoutHead === 0,
        detail:   numDeptsWithoutHead > 0
          ? `${numDeptsWithoutHead} of ${numDepts} department(s) have no head`
          : undefined,
      },
      {
        check:  'Leave balances loaded',
        expected: totalActive,
        actual:   numWithBalance,
        pass:     numWithoutBalance === 0,
        detail:   numWithoutBalance > 0
          ? `${numWithoutBalance} employee(s) have no leave balance — leave requests will be blocked`
          : undefined,
      },
      {
        check:  'Manager roles assigned',
        expected: totalManagers,
        actual:   numManagersWithRole,
        pass:     numManagersMissingRole === 0,
        detail:   numManagersMissingRole > 0
          ? `${numManagersMissingRole} of ${totalManagers} manager(s) still have EMPLOYEE role — re-run or promote via User Management`
          : totalManagers === 0
            ? 'No manager hierarchy detected'
            : `All ${totalManagers} manager(s) have an elevated role`,
      },
      // ── UAT readiness gates ────────────────────────────────────────────────
      {
        check:  'Org chart readiness',
        expected: 1,
        actual:   orgChartReady ? 1 : 0,
        pass:     orgChartReady,
        detail:   !orgChartReady
          ? `Blocked: ${numDeptsWithoutHead > 0 ? `${numDeptsWithoutHead} dept(s) without head` : ''}${numDeptsWithoutHead > 0 && numWithoutManager > 0 ? ', ' : ''}${numWithoutManager > 0 ? `${numWithoutManager} employee(s) without manager` : ''}`
          : 'All departments have heads; all employees have line managers',
      },
      {
        check:  'Leave request readiness',
        expected: 1,
        actual:   leaveRequestReady ? 1 : 0,
        pass:     leaveRequestReady,
        detail:   !leaveRequestReady
          ? `Blocked: ${numWithoutBalance} employee(s) missing leave balances`
          : 'All employees have leave balances',
      },
      {
        check:  'Manager approval readiness',
        expected: 1,
        actual:   managerApprovalReady ? 1 : 0,
        pass:     managerApprovalReady,
        detail:   !managerApprovalReady
          ? `Blocked: ${numWithoutManager} employee(s) have no line manager — approval routing will fail`
          : 'All employees have line managers',
      },
    ]

    const failures = rows.filter(r => !r.pass)
    const warnings = rows.filter(r => r.pass && r.detail)

    let verdict: PostLoadScorecard['verdict']
    if (failures.length === 0 && warnings.length === 0) {
      verdict = 'READY'
    } else if (failures.length === 0) {
      verdict = 'READY_WITH_RISKS'
    } else {
      verdict = 'NOT_READY'
    }

    const summary =
      verdict === 'READY'
        ? `All ${rows.length} checks passed. UAT can start.`
        : verdict === 'READY_WITH_RISKS'
          ? `${rows.length - failures.length}/${rows.length} checks passed with ${warnings.length} note(s). UAT can start with caution.`
          : `${failures.length} check(s) failed. Resolve before UAT.`

    return { rows, verdict, summary, loadedAt: new Date().toISOString() }
  } catch (e) {
    console.error('[getPostLoadScorecard]', e)
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
