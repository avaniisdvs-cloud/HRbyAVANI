/**
 * Token resolver functions for the employee letters template engine.
 */
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '@/drizzle/schema'

export interface ResolverContext {
  personId:      string
  legalEntityId: string
  letterId:      string
  letterNumber:  string
  /** Provided at generation time — used by effective_date resolver */
  effectiveDate?: Date | null
  /** Job ID for the new designation — used by new_job_title resolver (DCL/PML) */
  newJobId?:     string
  /** Probation confirmation date — used by confirmation_date resolver (PCL) */
  confirmationDate?: Date | null
  /** Probation extension end date — used by extension_end_date resolver (PEL) */
  extensionEndDate?: Date | null
  /** HR approver display name — used by hr_approver_name resolver */
  hrApproverName?: string
  db:            PostgresJsDatabase<typeof schema>
}

type ResolverFn = (ctx: ResolverContext) => Promise<string>

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtCurrency(amount: string | number | null | undefined): string {
  if (!amount) return 'AED 0.00'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return `AED ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

async function fetchPerson(ctx: ResolverContext) {
  const rows = await ctx.db
    .select()
    .from(schema.persons)
    .where(eq(schema.persons.id, ctx.personId))
    .limit(1)
  return rows[0] ?? null
}

async function fetchEntity(ctx: ResolverContext) {
  const rows = await ctx.db
    .select()
    .from(schema.legalEntities)
    .where(eq(schema.legalEntities.id, ctx.legalEntityId))
    .limit(1)
  return rows[0] ?? null
}

async function fetchJobTitle(ctx: ResolverContext): Promise<{ en: string; ar: string }> {
  const person = await fetchPerson(ctx)
  if (!person?.currentJobId) return { en: '', ar: '' }
  const rows = await ctx.db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, person.currentJobId))
    .limit(1)
  const job = rows[0]
  return { en: job?.jobTitleEn ?? '', ar: job?.jobTitleAr ?? '' }
}

async function fetchDepartment(ctx: ResolverContext): Promise<{ en: string; ar: string }> {
  const person = await fetchPerson(ctx)
  if (!person?.currentDepartmentId) return { en: '', ar: '' }
  const rows = await ctx.db
    .select()
    .from(schema.departments)
    .where(eq(schema.departments.id, person.currentDepartmentId))
    .limit(1)
  const dept = rows[0]
  return { en: dept?.nameEn ?? '', ar: dept?.nameAr ?? '' }
}

async function fetchLetter(ctx: ResolverContext) {
  const rows = await ctx.db
    .select()
    .from(schema.employeeLetters)
    .where(eq(schema.employeeLetters.id, ctx.letterId))
    .limit(1)
  return rows[0] ?? null
}

export const RESOLVERS: Record<string, ResolverFn> = {
  employee_name:      async ctx => { const p = await fetchPerson(ctx); return p?.fullNameEn ?? '' },
  employee_name_ar:   async ctx => { const p = await fetchPerson(ctx); return p?.fullNameAr ?? '' },
  employee_number:    async ctx => { const p = await fetchPerson(ctx); return p?.personNumber ?? '' },
  nationality:        async ctx => { const p = await fetchPerson(ctx); return p?.nationalityCode ?? '' },
  passport_number:    async _ctx => '[MASKED]',
  emirates_id:        async _ctx => '[MASKED]',

  job_title:             async ctx => (await fetchJobTitle(ctx)).en,
  job_title_ar:          async ctx => (await fetchJobTitle(ctx)).ar,
  current_job_title:     async ctx => (await fetchJobTitle(ctx)).en,
  current_job_title_ar:  async ctx => (await fetchJobTitle(ctx)).ar,
  new_job_title: async ctx => {
    if (!ctx.newJobId) return ''
    const rows = await ctx.db.select().from(schema.jobs).where(eq(schema.jobs.id, ctx.newJobId)).limit(1)
    return rows[0]?.jobTitleEn ?? ''
  },
  new_job_title_ar: async ctx => {
    if (!ctx.newJobId) return ''
    const rows = await ctx.db.select().from(schema.jobs).where(eq(schema.jobs.id, ctx.newJobId)).limit(1)
    return rows[0]?.jobTitleAr ?? ''
  },

  department:      async ctx => (await fetchDepartment(ctx)).en,
  department_ar:   async ctx => (await fetchDepartment(ctx)).ar,
  department_name: async ctx => (await fetchDepartment(ctx)).en,
  department_name_ar: async ctx => (await fetchDepartment(ctx)).ar,

  hire_date:          async ctx => { const p = await fetchPerson(ctx); return fmtDate(p?.hireDate) },
  probation_end_date: async ctx => { const p = await fetchPerson(ctx); return fmtDate(p?.probationEndDate) },
  basic_salary:       async ctx => { const p = await fetchPerson(ctx); return fmtCurrency(p?.basicSalary) },
  effective_date: async ctx => {
    if (ctx.effectiveDate !== undefined) return fmtDate(ctx.effectiveDate)
    const l = await fetchLetter(ctx)
    return fmtDate(l?.effectiveDate)
  },

  air_ticket_entitlement: async ctx => {
    const e = await fetchEntity(ctx)
    return e?.airTicketEntitlement ?? ''
  },

  company_name:    async ctx => { const e = await fetchEntity(ctx); return e?.nameEn ?? '' },
  company_name_ar: async ctx => { const e = await fetchEntity(ctx); return e?.nameAr ?? '' },
  signatory_name:  async ctx => { const e = await fetchEntity(ctx); return e?.signatoryName ?? '' },
  signatory_title: async ctx => { const e = await fetchEntity(ctx); return e?.signatoryTitle ?? '' },

  letter_date:   async _ctx => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  letter_number: async ctx => ctx.letterNumber,

  // ── Probation-specific tokens (PCL + PEL) ───────────────────────────────────
  confirmation_date: async ctx => fmtDate(ctx.confirmationDate ?? null),
  extension_end_date: async ctx => fmtDate(ctx.extensionEndDate ?? null),

  line_manager_name: async ctx => {
    const person = await fetchPerson(ctx)
    if (!person?.lineManagerId) return ''
    const rows = await ctx.db
      .select({ fullNameEn: schema.persons.fullNameEn })
      .from(schema.persons)
      .where(eq(schema.persons.id, person.lineManagerId))
      .limit(1)
    return rows[0]?.fullNameEn ?? ''
  },

  hr_approver_name: async ctx => ctx.hrApproverName ?? '',
}
