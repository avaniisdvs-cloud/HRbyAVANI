'use server'
/**
 * UAT Migration Load Console — master-data seed + dept-head backfill.
 *
 * SUPER_ADMIN only. Branch-only (assertBranchSafe). Every write is transactional +
 * audited. Idempotent: existing rows (by code) are skipped, not duplicated.
 * NOTHING runs without an explicit confirm token from the UI.
 */
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { eq, and, sql } from 'drizzle-orm'
import {
  legalEntities, businessUnits, grades, locations, departments, jobs, positions, persons,
} from '@/drizzle/schema'
import { assertBranchSafe, getBranchSafety } from './branch-safety'
import * as M from './manifest'
import type { MigrationStatus, MasterDataItemStatus, SeedResult, BackfillResult, ResetPreview, ResetResult } from './types'

const SA = ['SUPER_ADMIN'] as const

/** Root tables truncated for a staging clean-slate. CASCADE handles all person/org
 *  dependents (worker_assignments, person_*, absence, timesheets, workflow instances,
 *  insurance, letters, probation, audit_log, etc.). legal_entities + all configuration
 *  tables are NOT listed and have no inbound FK from these, so they are PRESERVED. */
const RESET_ROOT_TABLES = [
  'persons', 'user_accounts', 'worker_assignments', 'contracts', 'employment_actions',
  'positions', 'jobs', 'departments', 'business_units', 'grades', 'locations',
] as const
const RESET_CONFIRM = 'DELETE STAGING DATA'

function actorOf(u: { id: string; name: string; role: string; legalEntityId: string }) {
  return { actorId: u.id, actorName: u.name, actorRole: u.role, actorEntityId: u.legalEntityId, channel: 'BATCH' as const }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveEntityId(client: any): Promise<string> {
  const [e] = await client.select({ id: legalEntities.id })
    .from(legalEntities).where(eq(legalEntities.entityCode, M.ENTITY_CODE)).limit(1)
  if (!e) throw new Error(`MIGRATION_ENTITY_NOT_FOUND: legal entity "${M.ENTITY_CODE}" does not exist on this branch.`)
  return e.id
}

// ── READ-ONLY reset preview (row counts that would be deleted) ───────────────
export async function getResetPreview(): Promise<ResetPreview> {
  await requireRole([...SA])
  const counts: ResetPreview['counts'] = []
  for (const t of RESET_ROOT_TABLES) {
    try {
      const r = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM ${t}`))
      // postgres-js returns rows array-like
      const n = Number((r as unknown as { n: number }[])[0]?.n ?? 0)
      counts.push({ table: t, rows: n })
    } catch {
      counts.push({ table: t, rows: -1 }) // table missing / unreadable
    }
  }
  return { counts, totalRows: counts.reduce((a, c) => a + Math.max(0, c.rows), 0) }
}

// ── WRITE (DESTRUCTIVE): clean-slate the staging branch ──────────────────────
export async function resetStagingData(confirm: string): Promise<ResetResult> {
  const user = await requireRole([...SA])
  assertBranchSafe()
  if (confirm !== RESET_CONFIRM) {
    throw new Error(`MIGRATION_CONFIRM_REQUIRED: type "${RESET_CONFIRM}" exactly to confirm.`)
  }
  await db.transaction(async (tx) => {
    // One atomic TRUNCATE … CASCADE — wipes person/org/transactional data branch-wide.
    // legal_entities + configuration are preserved (no inbound FK). super.admin@avaniis.dev
    // is a hardcoded dev login (lib/auth.ts) and is unaffected by user_accounts truncation.
    await tx.execute(sql.raw(`TRUNCATE TABLE ${RESET_ROOT_TABLES.join(', ')} RESTART IDENTITY CASCADE`))
    await writeAuditLog({
      ...actorOf(user), eventType: 'MIGRATION.STAGING_RESET', resourceType: 'migration',
      metadata: { host: getBranchSafety().hostMasked, rootTables: [...RESET_ROOT_TABLES] },
      description: 'UAT staging clean-slate: TRUNCATE CASCADE of person/org/transactional data. legal_entities + config preserved.',
    }, tx)
  })
  return {
    ok: true, clearedTables: [...RESET_ROOT_TABLES],
    message: 'Staging data cleared (clean slate). legal_entities + configuration preserved. super.admin@avaniis.dev login unaffected (hardcoded dev account).',
  }
}

// ── READ-ONLY status ────────────────────────────────────────────────────────
export async function getMigrationStatus(): Promise<MigrationStatus> {
  await requireRole([...SA])
  const branch = getBranchSafety()

  const items: MasterDataItemStatus[] = []
  let entityId: string | null = null
  try { entityId = await resolveEntityId(db) } catch { /* entity missing — all items show absent */ }

  const has = async (table: any, codeCol: any, code: string) => {
    if (!entityId) return false
    const [r] = await db.select({ id: table.id }).from(table).where(eq(codeCol, code)).limit(1)
    return !!r
  }

  items.push({ kind: 'business_unit', code: M.BUSINESS_UNIT.code, label: M.BUSINESS_UNIT.nameEn, exists: await has(businessUnits, businessUnits.code, M.BUSINESS_UNIT.code) })
  items.push({ kind: 'grade', code: M.GRADE.code, label: M.GRADE.nameEn, exists: await has(grades, grades.gradeCode, M.GRADE.code) })
  for (const l of M.LOCATIONS) items.push({ kind: 'location', code: l.code, label: l.nameEn, exists: await has(locations, locations.code, l.code) })
  for (const d of M.DEPARTMENTS) items.push({ kind: 'department', code: d.code, label: d.nameEn, exists: await has(departments, departments.code, d.code) })
  for (const p of M.POSITIONS) {
    items.push({ kind: 'job', code: M.jobCodeForPosition(p.code), label: p.titleEn, exists: await has(jobs, jobs.jobCode, M.jobCodeForPosition(p.code)) })
    items.push({ kind: 'position', code: p.code, label: p.titleEn, exists: await has(positions, positions.positionCode, p.code) })
  }

  const alreadyPresent = items.filter(i => i.exists).length
  return { branch, summary: M.MANIFEST_SUMMARY, items, toCreate: items.length - alreadyPresent, alreadyPresent }
}

// ── WRITE: seed master data (idempotent) ──────────────────────────────────────
export async function seedMasterData(confirm: string): Promise<SeedResult> {
  const user = await requireRole([...SA])
  assertBranchSafe()
  if (confirm !== 'SEED') throw new Error('MIGRATION_CONFIRM_REQUIRED: type SEED to confirm.')

  const actor = actorOf(user)
  const created: SeedResult['created'] = []
  const skipped: SeedResult['skipped'] = []
  const failed:  SeedResult['failed']  = []

  await db.transaction(async (tx) => {
    const entityId = await resolveEntityId(tx)
    const aud = { createdBy: user.id, createdByName: user.name }

    // 1. Business Unit
    let buId: string
    {
      const [ex] = await tx.select({ id: businessUnits.id }).from(businessUnits).where(eq(businessUnits.code, M.BUSINESS_UNIT.code)).limit(1)
      if (ex) { buId = ex.id; skipped.push({ kind: 'business_unit', code: M.BUSINESS_UNIT.code }) }
      else {
        const [row] = await tx.insert(businessUnits).values({
          legalEntityId: entityId, code: M.BUSINESS_UNIT.code, nameEn: M.BUSINESS_UNIT.nameEn, nameAr: M.BUSINESS_UNIT.nameAr,
          isActive: true, ...aud,
        }).returning({ id: businessUnits.id })
        buId = row.id; created.push({ kind: 'business_unit', code: M.BUSINESS_UNIT.code })
      }
    }

    // 2. Grade
    {
      const [ex] = await tx.select({ id: grades.id }).from(grades).where(eq(grades.gradeCode, M.GRADE.code)).limit(1)
      if (ex) skipped.push({ kind: 'grade', code: M.GRADE.code })
      else {
        await tx.insert(grades).values({
          legalEntityId: entityId, gradeCode: M.GRADE.code, gradeNameEn: M.GRADE.nameEn, gradeNameAr: M.GRADE.nameAr,
          gradeLevel: M.GRADE.level, noticePeriodDays: 30, isActive: true, actionMode: 'UPDATE', ...aud,
        })
        created.push({ kind: 'grade', code: M.GRADE.code })
      }
    }
    const [gradeRow] = await tx.select({ id: grades.id }).from(grades).where(eq(grades.gradeCode, M.GRADE.code)).limit(1)
    const gradeId = gradeRow?.id

    // 3. Locations
    for (const l of M.LOCATIONS) {
      const [ex] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.code, l.code)).limit(1)
      if (ex) { skipped.push({ kind: 'location', code: l.code }); continue }
      await tx.insert(locations).values({
        legalEntityId: entityId, code: l.code, nameEn: l.nameEn, nameAr: l.nameAr,
        emirate: l.emirate, country: 'AE', timezone: 'Asia/Dubai', isActive: true, actionMode: 'UPDATE', ...aud,
      })
      created.push({ kind: 'location', code: l.code })
    }

    // 4. Departments (head_person_id left NULL — backfilled after employee load)
    const deptIdByCode: Record<string, string> = {}
    for (const d of M.DEPARTMENTS) {
      const [ex] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.code, d.code)).limit(1)
      if (ex) { deptIdByCode[d.code] = ex.id; skipped.push({ kind: 'department', code: d.code }); continue }
      const [row] = await tx.insert(departments).values({
        businessUnitId: buId, legalEntityId: entityId, code: d.code, nameEn: d.nameEn, nameAr: d.nameAr,
        approvedHeadcount: 0, headPersonId: null, isActive: true, actionMode: 'UPDATE', ...aud,
      }).returning({ id: departments.id })
      deptIdByCode[d.code] = row.id; created.push({ kind: 'department', code: d.code })
    }

    // 5. Jobs + 6. Positions
    for (const p of M.POSITIONS) {
      const jobCode = M.jobCodeForPosition(p.code)
      let jobId: string
      const [exJob] = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.jobCode, jobCode)).limit(1)
      if (exJob) { jobId = exJob.id; skipped.push({ kind: 'job', code: jobCode }) }
      else {
        const [row] = await tx.insert(jobs).values({
          legalEntityId: entityId, jobCode, jobTitleEn: p.titleEn, jobTitleAr: p.titleEn,
          isEmiratisationTarget: false, isManagementRole: p.isHod, isExemptFromOvertime: false,
          isActive: true, actionMode: 'UPDATE', ...aud,
        }).returning({ id: jobs.id })
        jobId = row.id; created.push({ kind: 'job', code: jobCode })
      }

      const [exPos] = await tx.select({ id: positions.id }).from(positions).where(eq(positions.positionCode, p.code)).limit(1)
      if (exPos) { skipped.push({ kind: 'position', code: p.code }); continue }
      await tx.insert(positions).values({
        departmentId: deptIdByCode[p.deptCode], jobId, legalEntityId: entityId,
        positionCode: p.code, positionTitleEn: p.titleEn, positionTitleAr: p.titleEn,
        gradeId: gradeId ?? null, fteCount: '1', isOccupied: false, isActive: true,
        isConfidential: false, isFrozen: false, extraData: {}, isCurrent: true, actionMode: 'UPDATE', ...aud,
      })
      created.push({ kind: 'position', code: p.code })
    }

    await writeAuditLog({
      ...actor, eventType: 'MIGRATION.MASTER_DATA_SEEDED', resourceType: 'migration', entityId,
      metadata: { created: created.length, skipped: skipped.length, branch: getBranchSafety().hostMasked },
      description: `UAT master-data seed: ${created.length} created, ${skipped.length} skipped.`,
    }, tx)
  }).catch((e) => { failed.push({ kind: 'transaction', code: '-', error: String(e instanceof Error ? e.message : e) }) })

  const ok = failed.length === 0
  return { ok, created, skipped, failed,
    message: ok ? `Seed complete: ${created.length} created, ${skipped.length} already present.`
                : `Seed FAILED and rolled back: ${failed.map(f => f.error).join('; ')}` }
}

// ── WRITE: backfill the 6 department heads (after employees exist) ────────────
export async function backfillDepartmentHeads(confirm: string): Promise<BackfillResult> {
  const user = await requireRole([...SA])
  assertBranchSafe()
  if (confirm !== 'HEADS') throw new Error('MIGRATION_CONFIRM_REQUIRED: type HEADS to confirm.')

  const updated: BackfillResult['updated'] = []
  const skipped: BackfillResult['skipped'] = []

  await db.transaction(async (tx) => {
    for (const d of M.DEPARTMENTS) {
      const [dept] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.code, d.code)).limit(1)
      if (!dept) { skipped.push({ departmentCode: d.code, reason: 'department not found' }); continue }
      const [person] = await tx.select({ id: persons.id }).from(persons).where(eq(persons.personNumber, d.headEmployeeNumber)).limit(1)
      if (!person) { skipped.push({ departmentCode: d.code, reason: `head ${d.headEmployeeNumber} not loaded yet` }); continue }
      await tx.update(departments).set({ headPersonId: person.id, updatedBy: user.id, updatedByName: user.name, lastUpdatedDate: new Date() }).where(eq(departments.id, dept.id))
      updated.push({ departmentCode: d.code, headEmployeeNumber: d.headEmployeeNumber })
    }
    await writeAuditLog({
      ...actorOf(user), eventType: 'MIGRATION.DEPT_HEADS_BACKFILLED', resourceType: 'departments',
      metadata: { updated: updated.length, skipped: skipped.length },
      description: `UAT dept-head backfill: ${updated.length} set.`,
    }, tx)
  })

  return { ok: true, updated, skipped,
    message: `Department heads: ${updated.length} set, ${skipped.length} skipped.` }
}
