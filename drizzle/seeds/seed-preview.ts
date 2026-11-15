import { config } from 'dotenv'
config({ path: '.env.local' })

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { TENANT_ID } from '../../lib/constants'
import { PREVIEW_ACCOUNTS, PREVIEW_ENTITY_ID } from '../../lib/demo-accounts'

// This small seed is intentionally restricted to a local development database.
const url = new URL(process.env.DATABASE_URL ?? '')
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || process.env.DATABASE_ENV !== 'development') {
  throw new Error('Preview seed requires a local development database')
}
const client = postgres(process.env.DATABASE_URL!)
const db = drizzle(client, { schema })
const id = (prefix: string, n: number) => `${prefix}-0000-0000-0000-${String(n).padStart(12, '0')}`
const adminId = PREVIEW_ACCOUNTS[0].personId
const payrollId = '33333333-3333-3333-3333-333333333333'
const planId = '44444444-4444-4444-4444-444444444444'
const base = { tenantId: TENANT_ID, createdBy: adminId, createdByName: 'Avaniis Preview Seed' }
const period = { effectiveStartDate: '2024-01-01', effectiveEndDate: '9999-12-31', isCurrent: true }

async function main() {
  const existing = await db.select({ id: schema.persons.id }).from(schema.persons)
  const knownIds = new Set<string>(PREVIEW_ACCOUNTS.map(a => a.personId))
  if (existing.some(p => !knownIds.has(p.id))) throw new Error('Existing employee data found; refusing to modify it')
  const year = new Date().getFullYear()
  await db.transaction(async tx => {
    for (const account of PREVIEW_ACCOUNTS) {
      const n = account.number
      const department = n === 2 ? 4 : n === 3 ? 3 : n === 1 ? 5 : 1
      const position = n === 1 ? 7 : n === 2 ? 6 : n === 3 ? 5 : n === 4 ? 4 : n === 5 ? 9 : 10
      const grade = n <= 4 ? 10 : 6
      const salary = n === 1 ? '25000' : n === 2 ? '18000' : n === 3 ? '16000' : n === 4 ? '15000' : '8000'
      const lineManagerId = n === 1 ? null : n <= 4 ? adminId : PREVIEW_ACCOUNTS[3].personId
      const person = {
        ...base, id: account.personId, personNumber: `AVN-${String(n).padStart(6, '0')}`,
        employeeCode: `AVN-${String(n).padStart(3, '0')}`, legalEntityId: PREVIEW_ENTITY_ID,
        firstNameEn: account.name.split(' ')[0], lastNameEn: account.name.split(' ').slice(1).join(' '),
        fullNameEn: account.name, fullNameAr: account.nameAr, dateOfBirth: '1990-01-01',
        gender: [2, 4, 6].includes(n) ? 'FEMALE' : 'MALE', nationalityCode: 'IND', nationalityCategory: 'EXPAT',
        employmentType: 'FULL_TIME', workerCategory: 'FTE', assignmentStatus: 'ACTIVE',
        hireDate: '2024-01-01', probationStatus: 'CONFIRMED', probationEndDate: '2024-07-01',
        currentDepartmentId: id('40000000', department), currentPositionId: id('70000000', position),
        currentLocationId: id('50000000', 1), currentGradeId: id('20000000', grade),
        lineManagerId, payrollId, basicSalary: salary, totalPackage: salary,
        isSystemUser: false, isActive: true,
      }
      await tx.insert(schema.persons).values(person).onConflictDoUpdate({ target: schema.persons.id, set: person })
      await tx.insert(schema.userAccounts).values({
        ...base, id: id('eeee0001', n), personId: account.personId, primaryEmail: account.email,
        primarySsoProvider: 'LOCAL', avaniisRole: account.role,
        primaryEntityId: PREVIEW_ENTITY_ID, allowedEntityIds: [PREVIEW_ENTITY_ID], isActive: true,
      }).onConflictDoNothing()
      const assignmentId = id('aaaa1001', n)
      await tx.insert(schema.workerAssignments).values({
        ...base, ...period, id: assignmentId, personId: account.personId, legalEntityId: PREVIEW_ENTITY_ID,
        assignmentNumber: `AVN-ASG-${n}`, assignmentStatus: 'ACTIVE', departmentId: id('40000000', department),
        positionId: id('70000000', position), locationId: id('50000000', 1), gradeId: id('20000000', grade),
        lineManagerId, employmentType: 'FULL_TIME', workScheduleId: id('90000000', 1),
        actionType: 'HIRE', actionInitiatedBy: adminId,
      }).onConflictDoNothing()
      await tx.insert(schema.salaryElements).values({
        ...base, id: id('aaaa1002', n), personId: account.personId, assignmentId, legalEntityId: PREVIEW_ENTITY_ID,
        payrollId, elementCode: 'BASIC', elementNameEn: 'Basic Salary', elementNameAr: 'الراتب الأساسي',
        elementClassification: 'EARNINGS', amount: salary, isSubjectToEosb: true,
        effectiveStartDate: period.effectiveStartDate, effectiveEndDate: period.effectiveEndDate,
      }).onConflictDoNothing()
      await tx.insert(schema.leavePlanEnrolments).values({
        ...base, ...period, id: id('aaaa1003', n), personId: account.personId, legalEntityId: PREVIEW_ENTITY_ID,
        absencePlanId: planId, enrollmentReason: 'Synthetic preview data', enrolledBy: adminId,
      }).onConflictDoNothing()
      await tx.insert(schema.payrollAssignments).values({
        ...base, ...period, id: id('aaaa1004', n), personId: account.personId, legalEntityId: PREVIEW_ENTITY_ID,
        payrollId, payrollGroup: 'STANDARD', changedBy: adminId,
      }).onConflictDoNothing()
      await tx.insert(schema.workScheduleAssignments).values({
        ...base, ...period, id: id('aaaa1005', n), personId: account.personId, legalEntityId: PREVIEW_ENTITY_ID,
        workScheduleId: id('90000000', 1), assignedBy: adminId,
      }).onConflictDoNothing()
      await tx.insert(schema.personContacts).values({
        ...base, id: id('aaaa1006', n), personId: account.personId, contactType: 'WORK_EMAIL',
        contactValue: account.email, isPrimary: true,
      }).onConflictDoNothing()
      for (const [type, allowance] of [[1, '30'], [2, '90']] as const) {
        await tx.insert(schema.absenceBalances).values({
          ...base, id: id('aaaa1007', n * 10 + type), personId: account.personId,
          legalEntityId: PREVIEW_ENTITY_ID, absenceTypeId: id('80000000', type), balanceYear: year,
          openingBalanceDays: '0', accruedDays: allowance, closingBalanceDays: allowance,
        }).onConflictDoNothing()
      }
      await tx.insert(schema.auditLog).values({
        tenantId: TENANT_ID, actorId: adminId, actorName: 'Avaniis Preview Seed', actorRole: 'SUPER_ADMIN',
        channel: 'SYSTEM', eventType: 'PREVIEW.EMPLOYEE_SEEDED', resourceType: 'persons',
        resourceId: account.personId, newValues: { synthetic: true, role: account.role },
      })
    }
    // The request submission code uses v2 workflow codes, not the legacy seed's definitions.
    const workflows = [
      ['WF_ANNUAL_LEAVE', 'Annual Leave Approval', 'اعتماد الإجازة السنوية'],
      ['WF_SICK_LEAVE', 'Sick Leave Approval', 'اعتماد الإجازة المرضية'],
      ['WF_MATERNITY_LEAVE', 'Maternity Leave Approval', 'اعتماد إجازة الأمومة'],
      ['WF_HAJJ_LEAVE', 'Hajj Leave Approval', 'اعتماد إجازة الحج'],
    ]
    for (const [index, [workflowCode, workflowNameEn, workflowNameAr]] of workflows.entries()) {
      const definitionId = id('aaaa1008', index + 1)
      await tx.insert(schema.workflowDefinitionsV2).values({
        ...base, id: definitionId, legalEntityId: PREVIEW_ENTITY_ID, workflowCode,
        workflowNameEn, workflowNameAr, triggerEvent: 'LEAVE_REQUEST',
        defaultHierarchyType: 'LINE_MANAGER', onApproverNotFound: 'USE_FALLBACK',
        fallbackPersonId: PREVIEW_ACCOUNTS[1].personId,
      }).onConflictDoNothing()
      await tx.insert(schema.workflowStepsV2).values({
        ...base, id: id('aaaa1009', index + 1), workflowDefinitionId: definitionId,
        stepOrder: 1, stepCode: 'MANAGER_APPROVAL', stepNameEn: 'Line Manager Approval',
        stepNameAr: 'اعتماد المدير المباشر', hierarchyType: 'LINE_MANAGER', hierarchyLevel: 1,
      }).onConflictDoNothing()
    }
    await tx.insert(schema.auditLog).values({
      tenantId: TENANT_ID, actorId: adminId, actorName: 'Avaniis Preview Seed', actorRole: 'SUPER_ADMIN',
      channel: 'SYSTEM', eventType: 'PREVIEW.WORKFLOWS_SEEDED', resourceType: 'workflow_definitions_v2',
      newValues: { synthetic: true, definitions: workflows.length },
    })
  })
  const [{ count }] = await client`SELECT count(*)::int AS count FROM persons`
  console.info(`Avaniis preview ready: ${count} synthetic employees, six role-linked accounts.`)
}

main().catch(err => { console.error(err.cause?.message ?? err.message); process.exitCode = 1 }).finally(() => client.end())
