/**
 * Migration V2 — staged execution engine.
 *
 * Executes the migration in 5 phases, each in its own transaction:
 *   Phase 1: Import employees (via existing importEmployeesTx — all-or-nothing)
 *   Phase 2: Set manager links from Managers sheet
 *   Phase 3: Set department heads from DeptHeads sheet
 *   Phase 3.5: HOD auto-link — fill remaining null managers from dept head
 *   Phase 4: Insert absence_balances from LeaveBalances sheet
 *
 * HARD FAILURE POLICY (2026-06-04 fix):
 *   - No phase may silently return created=0 when input was non-empty.
 *   - If validation resolved N manager links / dept heads / leave balances
 *     and execution writes 0 of them, ok=false is set and errors[] is populated.
 *   - Phase-level skip messages are escalated to executor errors[] so they cannot
 *     mask a zero-write outcome from the ok flag.
 *   - .catch() is replaced by explicit try/catch so error handling is transparent.
 *
 * Hard Rule 1: every DB write is in a transaction with an audit log entry.
 * Hard Rule 10: tenant_id on every insert.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { persons, departments, workerAssignments, absenceBalances, userAccounts } from '@/drizzle/schema'
import { computeClosingBalance } from '@/modules/absence/services'
import { TENANT_ID } from '@/lib/constants'
import { importEmployeesTx } from '../core-hr/bulk-import/import-engine'
import type { V2ValidationResult, V2ExecutionResult, V2PhaseResult, V2ResolvedLeaveBalance } from './v2-types'
import type { RawManagerRow, RawDeptHeadRow } from './v2-types'

interface ActorContext {
  id:            string
  name:          string
  role:          string
  personId?:     string
  legalEntityId: string
}

// ── Phase 2: set manager links ────────────────────────────────────────────────

async function setManagerLinks(
  actor: ActorContext,
  links: RawManagerRow[],
  importedPersonMap: Map<string, string>,  // personNumber.lower → personId
): Promise<V2PhaseResult> {
  const phase: V2PhaseResult = { phase: 'managers', created: 0, skipped: 0, errors: [] }
  if (links.length === 0) return phase

  // Load all persons from DB (existing + newly imported)
  const allPersons = await db
    .select({ id: persons.id, personNumber: persons.personNumber })
    .from(persons)
    .where(eq(persons.tenantId, TENANT_ID))

  const personMap = new Map(allPersons.map(p => [p.personNumber.toLowerCase(), p.id]))
  // Belt-and-suspenders: include newly-committed employees (DB query may race)
  for (const [num, id] of importedPersonMap) {
    if (!personMap.has(num)) personMap.set(num, id)
  }

  await db.transaction(async tx => {
    for (const link of links) {
      const empId = personMap.get(link.employeeNumber.toLowerCase())
      const mgrId = personMap.get(link.managerEmployeeNumber.toLowerCase())

      if (!empId || !mgrId) {
        phase.skipped++
        phase.errors.push(
          `Manager link skipped: employee "${link.employeeNumber}" (${empId ? '✓ found' : '✗ NOT FOUND'})` +
          ` → manager "${link.managerEmployeeNumber}" (${mgrId ? '✓ found' : '✗ NOT FOUND'})`
        )
        continue
      }

      await tx.update(persons)
        .set({ lineManagerId: mgrId, updatedBy: actor.id, updatedByName: actor.name, updatedDate: new Date() })
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, empId)))

      await tx.update(workerAssignments)
        .set({ lineManagerId: mgrId, updatedBy: actor.id, updatedByName: actor.name })
        .where(and(
          eq(workerAssignments.tenantId, TENANT_ID),
          eq(workerAssignments.personId, empId),
          eq(workerAssignments.isCurrent, true),
        ))

      phase.created++
    }

    if (phase.created > 0) {
      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: actor.legalEntityId,
        channel:       'BATCH',
        eventType:     'MIGRATION.MANAGER_LINKS_SET',
        resourceType:  'persons',
        entityId:      actor.legalEntityId,
        metadata:      { linksSet: phase.created, skipped: phase.skipped },
        description:   `V2 migration: ${phase.created} manager link(s) set, ${phase.skipped} skipped`,
      }, tx)
    }
  })

  return phase
}

// ── Phase 3: set department heads ─────────────────────────────────────────────

async function setDeptHeads(
  actor: ActorContext,
  links: RawDeptHeadRow[],
  importedPersonMap: Map<string, string>,
): Promise<V2PhaseResult> {
  const phase: V2PhaseResult = { phase: 'deptHeads', created: 0, skipped: 0, errors: [] }
  if (links.length === 0) return phase

  const [allPersons, allDepts] = await Promise.all([
    db.select({ id: persons.id, personNumber: persons.personNumber })
      .from(persons)
      .where(eq(persons.tenantId, TENANT_ID)),
    db.select({ id: departments.id, code: departments.code })
      .from(departments)
      .where(eq(departments.tenantId, TENANT_ID)),
  ])

  const personMap = new Map(allPersons.map(p => [p.personNumber.toLowerCase(), p.id]))
  for (const [num, id] of importedPersonMap) {
    if (!personMap.has(num)) personMap.set(num, id)
  }
  const deptMap = new Map(allDepts.map(d => [(d.code ?? '').toLowerCase(), d.id]))

  await db.transaction(async tx => {
    for (const link of links) {
      const deptId = deptMap.get(link.departmentCode.toLowerCase())
      const headId = personMap.get(link.headEmployeeNumber.toLowerCase())

      if (!deptId || !headId) {
        phase.skipped++
        phase.errors.push(
          `Dept head skipped: dept "${link.departmentCode}" (${deptId ? '✓ found' : '✗ NOT FOUND'})` +
          ` → head "${link.headEmployeeNumber}" (${headId ? '✓ found' : '✗ NOT FOUND'})`
        )
        continue
      }

      await tx.update(departments)
        .set({ headPersonId: headId, updatedBy: actor.id, updatedByName: actor.name, lastUpdatedDate: new Date() })
        .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.id, deptId)))

      phase.created++
    }

    if (phase.created > 0) {
      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: actor.legalEntityId,
        channel:       'BATCH',
        eventType:     'MIGRATION.DEPT_HEADS_SET',
        resourceType:  'departments',
        entityId:      actor.legalEntityId,
        metadata:      { headsSet: phase.created, skipped: phase.skipped },
        description:   `V2 migration: ${phase.created} dept head(s) set, ${phase.skipped} skipped`,
      }, tx)
    }
  })

  return phase
}

// ── Phase 3.5: HOD auto-link — fill missing managers from dept head ───────────
// Safety net: for any active employee with no lineManagerId whose department has a head,
// assign the dept head as line manager. Runs after Phase 3 so HODs are committed.
// Skips the head themselves (avoids self-reference).
// Uses currentDepartmentId on persons (set by bulk-import if dept code resolves).
// If currentDepartmentId is null (not set by import), employee is skipped.

async function hodAutoLink(
  actor: ActorContext,
): Promise<V2PhaseResult> {
  const phase: V2PhaseResult = { phase: 'managers', created: 0, skipped: 0, errors: [] }

  // Query active employees missing a line manager AND having a department set
  const allActive = await db
    .select({
      id:                  persons.id,
      lineManagerId:       persons.lineManagerId,
      currentDepartmentId: persons.currentDepartmentId,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.isActive, true)))

  const withoutManager = allActive.filter(p => !p.lineManagerId && p.currentDepartmentId)
  if (withoutManager.length === 0) return phase

  // Load dept heads (already committed by Phase 3)
  const deptHeadRows = await db
    .select({ id: departments.id, headPersonId: departments.headPersonId })
    .from(departments)
    .where(and(eq(departments.tenantId, TENANT_ID), eq(departments.isActive, true)))

  const deptHeadMap = new Map(
    deptHeadRows.filter(d => d.headPersonId).map(d => [d.id, d.headPersonId!])
  )

  if (deptHeadMap.size === 0) return phase

  await db.transaction(async tx => {
    for (const emp of withoutManager) {
      const headId = deptHeadMap.get(emp.currentDepartmentId!)
      if (!headId || headId === emp.id) { phase.skipped++; continue }

      await tx.update(persons)
        .set({ lineManagerId: headId, updatedBy: actor.id, updatedByName: actor.name, updatedDate: new Date() })
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, emp.id)))

      await tx.update(workerAssignments)
        .set({ lineManagerId: headId, updatedBy: actor.id, updatedByName: actor.name })
        .where(and(
          eq(workerAssignments.tenantId, TENANT_ID),
          eq(workerAssignments.personId, emp.id),
          eq(workerAssignments.isCurrent, true),
        ))

      phase.created++
    }

    if (phase.created > 0) {
      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: actor.legalEntityId,
        channel:       'BATCH',
        eventType:     'MIGRATION.HOD_AUTO_LINK',
        resourceType:  'persons',
        entityId:      actor.legalEntityId,
        metadata:      { autoLinked: phase.created, skipped: phase.skipped },
        description:   `V2 migration: HOD auto-link — ${phase.created} employee(s) linked to dept head as fallback manager`,
      }, tx)
    }
  })

  return phase
}

// ── Phase 4: insert absence balances ──────────────────────────────────────────

async function insertLeaveBalances(
  actor: ActorContext,
  resolved: V2ResolvedLeaveBalance[],
  importedPersonMap: Map<string, string>,
): Promise<V2PhaseResult> {
  const phase: V2PhaseResult = { phase: 'leaveBalances', created: 0, skipped: 0, errors: [] }
  if (resolved.length === 0) return phase

  const allPersons = await db
    .select({ id: persons.id, personNumber: persons.personNumber })
    .from(persons)
    .where(eq(persons.tenantId, TENANT_ID))

  const personMap = new Map(allPersons.map(p => [p.personNumber.toLowerCase(), p.id]))
  for (const [num, id] of importedPersonMap) {
    if (!personMap.has(num)) personMap.set(num, id)
  }

  // Load existing balances for idempotency — skip exact duplicates
  const existingBalances = await db
    .select({ personId: absenceBalances.personId, absenceTypeId: absenceBalances.absenceTypeId, year: absenceBalances.balanceYear })
    .from(absenceBalances)
    .where(eq(absenceBalances.tenantId, TENANT_ID))

  const existingKeys = new Set(
    existingBalances.map(b => `${b.personId}:${b.absenceTypeId}:${b.year}`)
  )

  await db.transaction(async tx => {
    for (const r of resolved) {
      const personId = personMap.get(r.personNumber.toLowerCase())
      if (!personId) {
        phase.skipped++
        phase.errors.push(`Leave balance skipped: employee "${r.personNumber}" NOT FOUND in DB after Phase 1`)
        continue
      }

      const key = `${personId}:${r.absenceTypeId}:${r.raw.balanceYear}`
      if (existingKeys.has(key)) {
        phase.skipped++
        continue
      }

      // Insert with all required NOT NULL columns explicitly provided.
      // absence_balances schema: no is_current/effective_sequence/action_mode —
      // the table uses a flat year-keyed structure (not effective-dated rows).
      // numeric columns default to '0' in DB but we supply them explicitly for clarity.
      await tx.insert(absenceBalances).values({
        tenantId:           TENANT_ID,
        personId,
        absenceTypeId:      r.absenceTypeId,
        legalEntityId:      r.legalEntityId,
        balanceYear:        r.raw.balanceYear,
        openingBalanceDays: String(r.raw.openingBalanceDays),
        accruedDays:        '0',
        takenDays:          '0',
        pendingDays:        '0',
        adjustedDays:       '0',
        carriedForwardDays: '0',
        forfeitedDays:      '0',
        // BR-AL-002: persist the closing balance up front so reports/ESS don't
        // read NULL. With every other ledger component at 0, closing == opening.
        closingBalanceDays: String(computeClosingBalance({
          openingBalanceDays: Number(r.raw.openingBalanceDays),
          accruedDays:        0,
          takenDays:          0,
          pendingDays:        0,
          adjustedDays:       0,
          carriedForwardDays: 0,
          forfeitedDays:      0,
        })),
        createdBy:          actor.id,
        createdByName:      actor.name,
        // createdDate has DB DEFAULT now() — not required in INSERT
      })

      existingKeys.add(key)
      phase.created++
    }

    if (phase.created > 0) {
      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: actor.legalEntityId,
        channel:       'BATCH',
        eventType:     'MIGRATION.LEAVE_BALANCES_CREATED',
        resourceType:  'absence_balances',
        entityId:      actor.legalEntityId,
        metadata:      { created: phase.created, skipped: phase.skipped },
        description:   `V2 migration: ${phase.created} leave balance(s) created, ${phase.skipped} skipped`,
      }, tx)
    }
  })

  return phase
}

// ── Phase 5: auto-assign MANAGER role ────────────────────────────────────────
// Business rule: any employee with ≥1 direct report must have avaniisRole = MANAGER.
// Protected roles (SUPER_ADMIN, HR_ADMIN, HR_DIRECTOR, PAYROLL_ADMIN, FINANCE, MANAGER)
// are never downgraded. Only EMPLOYEE → MANAGER promotions are applied.
// Persons with direct reports but no user account are reported as warnings (not errors).

const PROTECTED_ROLES = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_DIRECTOR', 'PAYROLL_ADMIN', 'FINANCE', 'MANAGER']

async function assignManagerRoles(actor: ActorContext): Promise<V2PhaseResult & { missingAccount: number }> {
  const phase: V2PhaseResult & { missingAccount: number } = {
    phase: 'managerRoles', created: 0, skipped: 0, errors: [], missingAccount: 0,
  }

  // Find all distinct person IDs referenced as lineManagerId (= persons with ≥1 direct report)
  const reportRows = await db
    .select({ managerId: persons.lineManagerId })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      eq(persons.isActive, true),
      isNotNull(persons.lineManagerId),
    ))

  const managerPersonIds = [...new Set(reportRows.map(r => r.managerId).filter(Boolean) as string[])]
  if (managerPersonIds.length === 0) return phase

  // Load user accounts for manager persons
  const managerAccounts = await db
    .select({ id: userAccounts.id, personId: userAccounts.personId, avaniisRole: userAccounts.avaniisRole })
    .from(userAccounts)
    .where(and(
      eq(userAccounts.tenantId, TENANT_ID),
      eq(userAccounts.isActive, true),
      inArray(userAccounts.personId, managerPersonIds),
    ))

  const accountedPersonIds = new Set(managerAccounts.map(ua => ua.personId))

  // Warn for managers with no user account
  for (const pid of managerPersonIds) {
    if (!accountedPersonIds.has(pid)) {
      const [p] = await db
        .select({ personNumber: persons.personNumber })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, pid)))
        .limit(1)
      phase.errors.push(
        `WARNING: ${p?.personNumber ?? pid} has direct reports but no user account — MANAGER role cannot be assigned`
      )
      phase.missingAccount++
    }
  }

  // Filter to accounts that need promotion (EMPLOYEE only; skip already-elevated)
  const toPromote = managerAccounts.filter(ua => !PROTECTED_ROLES.includes(ua.avaniisRole))
  const alreadyElevated = managerAccounts.filter(ua => PROTECTED_ROLES.includes(ua.avaniisRole))
  phase.skipped = alreadyElevated.length

  if (toPromote.length === 0) return phase

  await db.transaction(async tx => {
    for (const ua of toPromote) {
      await tx.update(userAccounts)
        .set({ avaniisRole: 'MANAGER' })
        .where(and(eq(userAccounts.tenantId, TENANT_ID), eq(userAccounts.id, ua.id)))
    }

    await writeAuditLog({
      actorId:       actor.id,
      actorName:     actor.name,
      actorRole:     actor.role,
      actorEntityId: actor.legalEntityId,
      channel:       'BATCH',
      eventType:     'MIGRATION.MANAGER_ROLES_ASSIGNED',
      resourceType:  'user_accounts',
      entityId:      actor.legalEntityId,
      metadata:      {
        promoted:       toPromote.length,
        missingAccount: phase.missingAccount,
        skippedElevated: alreadyElevated.length,
      },
      description: `V2 migration: ${toPromote.length} user account(s) promoted to MANAGER role`,
    }, tx)
  })

  phase.created = toPromote.length
  return phase
}

// ── Post-execution zero-write detection ───────────────────────────────────────
// If validation resolved N entries for a phase but execution wrote 0, something
// failed silently (all skipped, wrong person numbers, serialization loss, etc.).
// This makes the failure visible in ok + errors[].

function detectZeroWriteFailure(
  phaseName: string,
  expectedCount: number,
  phase: V2PhaseResult,
  errors: string[],
): void {
  if (expectedCount === 0) return  // empty sheet is not an error
  if (phase.created > 0) return    // at least one write succeeded
  // created === 0 AND expected > 0 — escalate as hard error
  const skipDetail = phase.errors.length > 0
    ? ` First skip reason: ${phase.errors[0]}`
    : ''
  errors.push(
    `${phaseName} FAILED: 0 of ${expectedCount} expected write(s) were committed` +
    ` (${phase.skipped} skipped, ${phase.errors.length} error(s)).${skipDetail}` +
    ` Verify person numbers match the DB after Phase 1 and check serialization of validation result.`
  )
}

// ── Public: run full staged migration ─────────────────────────────────────────

export async function executeMigrationV2(
  validationResult: V2ValidationResult,
  actor: ActorContext,
): Promise<V2ExecutionResult> {
  const errors: string[] = []
  const phases: V2PhaseResult[] = []

  // Validate actor.personId against persons table
  let resolvedPersonId: string | undefined = undefined
  if (actor.personId) {
    const [found] = await db
      .select({ id: persons.id })
      .from(persons)
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, actor.personId)))
      .limit(1)
    if (found) resolvedPersonId = actor.personId
  }
  const resolvedActor = { ...actor, personId: resolvedPersonId }

  // ── Phase 1: Import employees ──────────────────────────────────────────────
  let importResult = { imported: 0, usersCreated: 0, rows: [] as { personNumber: string; personId: string }[] }
  const importedPersonMap = new Map<string, string>()

  try {
    importResult = await importEmployeesTx(resolvedActor, validationResult.employeePreview.validatedRows)
    for (const r of importResult.rows) {
      importedPersonMap.set(r.personNumber.toLowerCase(), r.personId)
    }
    phases.push({ phase: 'employees', created: importResult.imported, skipped: 0, errors: [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(`Phase 1 (employees) FAILED: ${msg}`)
    phases.push({ phase: 'employees', created: 0, skipped: 0, errors: [msg] })
    return {
      employeesCreated: 0, usersCreated: 0,
      managerLinksSet: 0, managerLinksSkipped: 0,
      deptHeadsSet: 0, deptHeadsSkipped: 0,
      leaveBalancesCreated: 0, leaveBalancesSkipped: 0,
      hodLinksSet: 0,
      managerRolesAssigned: 0, managerRolesMissingAccount: 0,
      phases, ok: false, errors,
    }
  }

  // ── Phase 2: Set manager links ─────────────────────────────────────────────
  let mgrPhase: V2PhaseResult
  try {
    mgrPhase = await setManagerLinks(resolvedActor, validationResult.managerLinks, importedPersonMap)
    detectZeroWriteFailure('Phase 2 (managers)', validationResult.managerLinks.length, mgrPhase, errors)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(`Phase 2 (managers) FAILED with exception: ${msg}`)
    mgrPhase = { phase: 'managers', created: 0, skipped: 0, errors: [msg] }
  }
  phases.push(mgrPhase)

  // ── Phase 3: Set department heads ──────────────────────────────────────────
  let deptHeadPhase: V2PhaseResult
  try {
    deptHeadPhase = await setDeptHeads(resolvedActor, validationResult.deptHeadLinks, importedPersonMap)
    detectZeroWriteFailure('Phase 3 (deptHeads)', validationResult.deptHeadLinks.length, deptHeadPhase, errors)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(`Phase 3 (deptHeads) FAILED with exception: ${msg}`)
    deptHeadPhase = { phase: 'deptHeads', created: 0, skipped: 0, errors: [msg] }
  }
  phases.push(deptHeadPhase)

  // ── Phase 3.5: HOD auto-link ───────────────────────────────────────────────
  // Warning only — HOD auto-link may produce 0 if currentDepartmentId is not set
  // by the bulk-import engine (the field is nullable). Not a hard failure.
  let hodLinkPhase: V2PhaseResult
  try {
    hodLinkPhase = await hodAutoLink(resolvedActor)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // HOD auto-link failure is a warning: manager links from Phase 2 already cover
    // most employees; HOD is a fallback for the remainder.
    errors.push(`Phase 3.5 (HOD auto-link) FAILED with exception: ${msg}`)
    hodLinkPhase = { phase: 'managers', created: 0, skipped: 0, errors: [msg] }
  }
  if (hodLinkPhase.created > 0 || hodLinkPhase.errors.length > 0) {
    phases.push(hodLinkPhase)
  }

  // ── Phase 4: Insert leave balances ─────────────────────────────────────────
  let lbPhase: V2PhaseResult
  try {
    lbPhase = await insertLeaveBalances(resolvedActor, validationResult.leaveBalances, importedPersonMap)
    detectZeroWriteFailure('Phase 4 (leaveBalances)', validationResult.leaveBalances.length, lbPhase, errors)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(`Phase 4 (leaveBalances) FAILED with exception: ${msg}`)
    lbPhase = { phase: 'leaveBalances', created: 0, skipped: 0, errors: [msg] }
  }
  phases.push(lbPhase)

  // ── Phase 5: Auto-assign MANAGER role ─────────────────────────────────────
  // Runs after hierarchy is fully set (phases 2, 3, 3.5). Persons with ≥1
  // direct report get avaniisRole = MANAGER if currently EMPLOYEE.
  // Phase 5 errors are warnings only — they do not affect ok flag.
  let mgRolePhase: V2PhaseResult & { missingAccount: number }
  try {
    mgRolePhase = await assignManagerRoles(resolvedActor)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Non-fatal: log but don't set ok=false
    mgRolePhase = { phase: 'managerRoles', created: 0, skipped: 0, errors: [msg], missingAccount: 0 }
  }
  if (mgRolePhase.created > 0 || mgRolePhase.errors.length > 0) {
    phases.push(mgRolePhase)
  }

  const ok = errors.length === 0

  return {
    employeesCreated:           importResult.imported,
    usersCreated:               importResult.usersCreated,
    managerLinksSet:            mgrPhase.created + hodLinkPhase.created,
    managerLinksSkipped:        mgrPhase.skipped,
    deptHeadsSet:               deptHeadPhase.created,
    deptHeadsSkipped:           deptHeadPhase.skipped,
    leaveBalancesCreated:       lbPhase.created,
    leaveBalancesSkipped:       lbPhase.skipped,
    hodLinksSet:                hodLinkPhase.created,
    managerRolesAssigned:       mgRolePhase.created,
    managerRolesMissingAccount: mgRolePhase.missingAccount,
    phases,
    ok,
    errors,
  }
}
