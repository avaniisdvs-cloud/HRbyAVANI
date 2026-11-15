'use server'

/**
 * Probation Workflow Server Actions
 *
 * initiateProbationReview   — creates probation_reviews row + triggers LM→HR workflow
 * submitLmRecommendation    — LM submits CONFIRM|EXTEND|FAIL recommendation
 * applyProbationOutcome     — called by dispatchResourceCompletion on HR final decision
 * finalizeProbationAfterSigning — called after employee signs PCL letter
 *
 * BR-37: total probation cannot exceed 6 months (182 days) from hire_date.
 * BR-PW-001: only one active review per person at a time.
 * BR-NO-DELETE: records never deleted; status transitions only.
 */

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'

import { db, type DbOrTx } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import { translateError } from '@/lib/app-error'
import {
  persons,
  notificationLog,
  employeeLetters,
  letterTemplates,
  letterTemplateTypes,
  userAccounts,
} from '@/drizzle/schema'
import { probationReviews } from '@/drizzle/schema/probation'
import {
  getPersonWithDetails,
  getDefaultTemplate,
  nextLetterNumber,
} from '@/modules/employee-letters/queries'
import { resolveTemplateBilingual } from '@/modules/employee-letters/engine'
import { triggerProbationConfirmationWorkflow } from '@/modules/workflow/actions'
import { triggerTerminationApproval } from '@/modules/workflow/actions'

// ── helpers ───────────────────────────────────────────────────────────────────

function addDays(date: Date | string, days: number): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ── initiateProbationReview ───────────────────────────────────────────────────

export async function initiateProbationReview(input: {
  personId:            string
  initiatedByChannel?: 'HR_ADMIN' | 'EMPLOYEE' | 'MANAGER'
}): Promise<{ reviewId: string; workflowInstanceId: string }> {
  try {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'MANAGER', 'EMPLOYEE', 'SUPER_ADMIN'])

    const channel = input.initiatedByChannel ?? 'HR_ADMIN'

    // EMPLOYEE can only initiate for themselves
    if (channel === 'EMPLOYEE' && actor.personId !== input.personId) {
      throw new Error('FORBIDDEN: employees can only initiate probation review for themselves')
    }

    const person = await getPersonWithDetails(input.personId)
    if (!person) throw new Error('Person not found')
    if (!person.legalEntityId) throw new Error('Person has no legal entity')
    if (person.probationStatus !== 'ACTIVE') {
      throw new Error(`Cannot initiate review: probation status is ${person.probationStatus}`)
    }
    if (!person.hireDate) throw new Error('Person has no hire date')
    if (!person.probationEndDate) throw new Error('Person has no probation end date')

    const hireDate = person.hireDate
    // BR-37: max extension = hire_date + 182 days
    const maxAllowedExtensionDate = toDateStr(addDays(hireDate, 182))

    let reviewId = ''
    let workflowInstanceId = ''

    await db.transaction(async tx => {
      // BR-PW-001: check no active review already exists (partial unique index enforces this at DB level too)
      const existing = await tx
        .select({ id: probationReviews.id, reviewStatus: probationReviews.reviewStatus })
        .from(probationReviews)
        .where(
          and(
            eq(probationReviews.tenantId, TENANT_ID),
            eq(probationReviews.personId, input.personId),
          ),
        )
        .limit(1)

      if (existing.length > 0) {
        const s = existing[0].reviewStatus
        if (['PENDING_LM', 'PENDING_HR', 'PENDING_ACKNOWLEDGMENT'].includes(s)) {
          throw new Error(`An active probation review already exists (status: ${s})`)
        }
      }

      reviewId = randomUUID()
      const now = new Date()

      await tx.insert(probationReviews).values({
        id:                             reviewId,
        tenantId:                       TENANT_ID,
        personId:                       input.personId,
        legalEntityId:                  person.legalEntityId!,
        initiatedByPersonId:            actor.personId ?? actor.id,
        initiatedAt:                    now,
        initiatedByChannel:             channel,
        probationEndDateAtInitiation:   person.probationEndDate as string,
        hireDateAtInitiation:           hireDate as string,
        maxAllowedExtensionDate,
        reviewStatus:                   'PENDING_LM',
        createdBy:                      actor.id,
        createdByName:                  actor.name,
        createdDate:                    now,
      })

      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: person.legalEntityId!,
        channel:       'WEB',
        eventType:     'PROBATION.REVIEW_INITIATED',
        resourceType:  'probation_reviews',
        resourceId:    reviewId,
        entityId:      person.legalEntityId!,
        newValues:     { personId: input.personId, channel, hireDate, probationEndDate: person.probationEndDate, maxAllowedExtensionDate },
      }, tx)
    })

    // Trigger 2-step LM→HR workflow (outside transaction — it creates its own)
    const wfResult = await triggerProbationConfirmationWorkflow({
      reviewId,
      personId:       input.personId,
      personNumber:   person.personNumber ?? '',
      personFullName: person.fullNameEn ?? '',
      legalEntityId:  person.legalEntityId!,
      lineManagerId:  person.lineManagerId ?? null,
      probationEndDate: person.probationEndDate,
    })

    workflowInstanceId = wfResult.instanceId

    // Store workflow instance ID on review
    await db
      .update(probationReviews)
      .set({
        workflowInstanceId,
        updatedBy:       actor.id,
        updatedByName:   actor.name,
        updatedDate:     new Date(),
        lastUpdatedDate: new Date(),
      })
      .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))

    revalidatePath('/admin/probation')
    revalidatePath(`/persons/${input.personId}`)

    return { reviewId, workflowInstanceId }
  } catch (e) {
    translateError(e, 'initiateProbationReview')
    throw e
  }
}

// ── submitLmRecommendation ───────────────────────────────────────────────────

export async function submitLmRecommendation(input: {
  reviewId:                  string
  recommendation:            'CONFIRM' | 'EXTEND' | 'FAIL'
  comments:                  string
  requestedExtensionEndDate?: string // required when recommendation = EXTEND
}): Promise<void> {
  try {
    const actor = await requireRole(['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    if (!input.comments?.trim()) {
      throw new Error('Comments are mandatory before submitting recommendation (BR-PW-002)')
    }

    const [review] = await db
      .select()
      .from(probationReviews)
      .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, input.reviewId)))
      .limit(1)

    if (!review) throw new Error('Probation review not found')
    if (review.reviewStatus !== 'PENDING_LM') {
      throw new Error(`Review is not awaiting LM input (status: ${review.reviewStatus})`)
    }

    if (input.recommendation === 'EXTEND') {
      if (!input.requestedExtensionEndDate) {
        throw new Error('requestedExtensionEndDate is required when recommending EXTEND')
      }
      // BR-37: extension cannot exceed max_allowed_extension_date
      if (input.requestedExtensionEndDate > review.maxAllowedExtensionDate) {
        throw new Error(
          `BR-37: requested extension end date (${input.requestedExtensionEndDate}) exceeds the maximum allowed (${review.maxAllowedExtensionDate}). Total probation cannot exceed 6 months from hire date.`,
        )
      }
    }

    const now = new Date()

    await db.transaction(async tx => {
      await tx
        .update(probationReviews)
        .set({
          lmRecommendation:          input.recommendation,
          lmComments:                input.comments,
          lmRecommendedAt:           now,
          lmPersonId:                actor.personId ?? actor.id,
          requestedExtensionEndDate: input.requestedExtensionEndDate ?? null,
          reviewStatus:              'PENDING_HR',
          updatedBy:                 actor.id,
          updatedByName:             actor.name,
          updatedDate:               now,
          lastUpdatedDate:           now,
        })
        .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, input.reviewId)))

      await writeAuditLog({
        actorId:       actor.id,
        actorName:     actor.name,
        actorRole:     actor.role,
        actorEntityId: review.legalEntityId,
        channel:       'WEB',
        eventType:     'PROBATION.LM_RECOMMENDATION_SUBMITTED',
        resourceType:  'probation_reviews',
        resourceId:    input.reviewId,
        entityId:      review.legalEntityId,
        newValues:     {
          recommendation: input.recommendation,
          comments:       input.comments,
          requestedExtensionEndDate: input.requestedExtensionEndDate ?? null,
        },
      }, tx)
    })

    revalidatePath('/admin/probation')
    revalidatePath('/admin/probation/my-team-probation')
    revalidatePath(`/admin/probation/my-team-probation/${input.reviewId}`)
  } catch (e) {
    translateError(e, 'submitLmRecommendation')
    throw e
  }
}

// ── applyProbationOutcome ─────────────────────────────────────────────────────
// Called by lib/workflow-engine.ts dispatchResourceCompletion when HR approves/rejects

export async function applyProbationOutcome(params: {
  reviewId:       string
  finalStatus:    'APPROVED' | 'REJECTED'
  actorPersonId:  string
  legalEntityId:  string
  decisionNote?:  string
  /**
   * Optional outer transaction from the workflow engine's post-claim transaction.
   * When provided, all writes join the caller's transaction (COLLISION-PROBATION fix,
   * Phase 3 P6E). When omitted, each branch opens its own db.transaction (backward-
   * compatible for any standalone callers).
   */
  tx?:            DbOrTx
}): Promise<void> {
  const { reviewId, finalStatus, actorPersonId, legalEntityId, decisionNote, tx: outerTx } = params

  const [review] = await db
    .select()
    .from(probationReviews)
    .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))
    .limit(1)

  if (!review) throw new Error(`Probation review not found: ${reviewId}`)
  if (review.reviewStatus !== 'PENDING_HR') {
    throw new Error(`Review not in PENDING_HR (status: ${review.reviewStatus})`)
  }

  const [person] = await db
    .select({
      id:             persons.id,
      fullNameEn:     persons.fullNameEn,
      personNumber:   persons.personNumber,
      hireDate:       persons.hireDate,
      lineManagerId:  persons.lineManagerId,
      probationEndDate: persons.probationEndDate,
    })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, review.personId)))
    .limit(1)

  if (!person) throw new Error('Person not found for probation review')

  const now = new Date()

  if (finalStatus === 'REJECTED') {
    // HR rejects — send back to PENDING_LM or mark REJECTED.
    // COLLISION-PROBATION fix (Phase 3 P6E): when outerTx is provided, writes join
    // the caller's post-claim transaction; otherwise open an isolated db.transaction.
    const runReject = async (client: DbOrTx) => {
      await client
        .update(probationReviews)
        .set({
          hrDecision:      'REJECTED',
          hrComments:      decisionNote ?? null,
          hrDecidedAt:     now,
          hrPersonId:      actorPersonId,
          reviewStatus:    'REJECTED',
          updatedBy:       actorPersonId,
          updatedByName:   actorPersonId,
          updatedDate:     now,
          lastUpdatedDate: now,
        })
        .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))

      // Notify line manager
      if (review.lmPersonId) {
        await client.insert(notificationLog).values({
          tenantId:          TENANT_ID,
          legalEntityId,
          recipientPersonId: review.lmPersonId,
          notificationType:  'PROBATION_REVIEW_REJECTED',
          channel:           'IN_APP',
          subjectEn:         `Probation recommendation rejected — ${person.fullNameEn}`,
          bodyEn:            `HR has rejected the probation recommendation for ${person.fullNameEn} (${person.personNumber}).${decisionNote ? ` Reason: ${decisionNote}` : ''}`,
          referenceType:     'PROBATION_REVIEW',
          referenceId:       reviewId,
          status:            'PENDING',
          createdBy:         actorPersonId,
          createdByName:     actorPersonId,
        })
      }

      await writeAuditLog({
        actorId:       actorPersonId,
        actorName:     actorPersonId,
        actorRole:     'HR_ADMIN',
        actorEntityId: legalEntityId,
        channel:       'WEB',
        eventType:     'PROBATION.HR_REJECTED',
        resourceType:  'probation_reviews',
        resourceId:    reviewId,
        entityId:      legalEntityId,
        newValues:     { hrDecision: 'REJECTED', decisionNote },
      }, client)
    }
    if (outerTx) {
      await runReject(outerTx)
    } else {
      await db.transaction(async _tx => runReject(_tx as unknown as DbOrTx))
    }
    return
  }

  // APPROVED — outcome depends on LM recommendation
  const recommendation = review.lmRecommendation as 'CONFIRM' | 'EXTEND' | 'FAIL' | null

  if (recommendation === 'CONFIRM') {
    // Generate PCL letter → status stays ACTIVE → PENDING_ACKNOWLEDGMENT until signing.
    // Note: generateProbationLetter uses a bare db.insert (outside any transaction).
    // If the outer tx rolls back, the letter row is orphaned but causes no referential
    // integrity issues — accepted low risk (COLLISION-PROBATION P6E).
    const letterId = await generateProbationLetter('PCL', review, person, actorPersonId, now)

    // COLLISION-PROBATION fix (Phase 3 P6E): when outerTx provided, writes join caller's tx.
    const runConfirm = async (client: DbOrTx) => {
      await client
        .update(probationReviews)
        .set({
          hrDecision:           'APPROVED',
          hrComments:           decisionNote ?? null,
          hrDecidedAt:          now,
          hrPersonId:           actorPersonId,
          outcome:              'CONFIRMED',
          reviewStatus:         'PENDING_ACKNOWLEDGMENT',
          confirmationLetterId: letterId ?? null,
          updatedBy:            actorPersonId,
          updatedByName:        actorPersonId,
          updatedDate:          now,
          lastUpdatedDate:      now,
        })
        .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))

      // Notify employee to sign letter
      await client.insert(notificationLog).values({
        tenantId:          TENANT_ID,
        legalEntityId,
        recipientPersonId: review.personId,
        notificationType:  'PROBATION_LETTER_READY',
        channel:           'IN_APP',
        subjectEn:         'Your Probation Confirmation Letter is ready',
        subjectAr:         'خطاب تأكيد فترة التجربة جاهز للتوقيع',
        bodyEn:            'Your Probation Confirmation Letter has been issued. Please review and sign it from your profile.',
        bodyAr:            'تم إصدار خطاب تأكيد فترة التجربة الخاص بك. يرجى مراجعته والتوقيع عليه من ملفك الشخصي.',
        referenceType:     'EMPLOYEE_LETTER',
        referenceId:       letterId ?? reviewId,
        status:            'PENDING',
        createdBy:         actorPersonId,
        createdByName:     actorPersonId,
      })

      await writeAuditLog({
        actorId:       actorPersonId,
        actorName:     actorPersonId,
        actorRole:     'HR_ADMIN',
        actorEntityId: legalEntityId,
        channel:       'WEB',
        eventType:     'PROBATION.CONFIRM_APPROVED',
        resourceType:  'probation_reviews',
        resourceId:    reviewId,
        entityId:      legalEntityId,
        newValues:     { outcome: 'CONFIRMED', letterId },
      }, client)
    }
    if (outerTx) {
      await runConfirm(outerTx)
    } else {
      await db.transaction(async _tx => runConfirm(_tx as unknown as DbOrTx))
    }
  } else if (recommendation === 'EXTEND') {
    // BR-37 validated at submitLmRecommendation; update probationEndDate + generate PEL.
    // Note: generateProbationLetter uses a bare db.insert (outside any transaction) —
    // same accepted-risk pattern as CONFIRM (orphaned letter if outer tx rolls back).
    const newEndDate = review.requestedExtensionEndDate!

    const letterId = await generateProbationLetter('PEL', review, person, actorPersonId, now)

    // COLLISION-PROBATION fix (Phase 3 P6E): when outerTx provided, writes join caller's tx.
    const runExtend = async (client: DbOrTx) => {
      // Update probation end date on person
      await client
        .update(persons)
        .set({
          probationEndDate: newEndDate,
          probationStatus:  'EXTENDED',
          updatedBy:        actorPersonId,
          updatedByName:    actorPersonId,
          updatedDate:      now,
          lastUpdatedDate:  now,
        })
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, review.personId)))

      await client
        .update(probationReviews)
        .set({
          hrDecision:       'APPROVED',
          hrComments:       decisionNote ?? null,
          hrDecidedAt:      now,
          hrPersonId:       actorPersonId,
          outcome:          'EXTENDED',
          reviewStatus:     'PENDING_ACKNOWLEDGMENT',
          extensionLetterId: letterId ?? null,
          updatedBy:        actorPersonId,
          updatedByName:    actorPersonId,
          updatedDate:      now,
          lastUpdatedDate:  now,
        })
        .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))

      // Notify employee
      await client.insert(notificationLog).values({
        tenantId:          TENANT_ID,
        legalEntityId,
        recipientPersonId: review.personId,
        notificationType:  'PROBATION_EXTENDED',
        channel:           'IN_APP',
        subjectEn:         'Your probation period has been extended',
        subjectAr:         'تم تمديد فترة تجربتك',
        bodyEn:            `Your probation period has been extended to ${newEndDate}. A Probation Extension Letter has been issued for your review.`,
        bodyAr:            `تم تمديد فترة تجربتك حتى ${newEndDate}. تم إصدار خطاب تمديد فترة التجربة للمراجعة.`,
        referenceType:     'EMPLOYEE_LETTER',
        referenceId:       letterId ?? reviewId,
        status:            'PENDING',
        createdBy:         actorPersonId,
        createdByName:     actorPersonId,
      })

      await writeAuditLog({
        actorId:       actorPersonId,
        actorName:     actorPersonId,
        actorRole:     'HR_ADMIN',
        actorEntityId: legalEntityId,
        channel:       'WEB',
        eventType:     'PROBATION.EXTEND_APPROVED',
        resourceType:  'probation_reviews',
        resourceId:    reviewId,
        entityId:      legalEntityId,
        newValues:     { outcome: 'EXTENDED', newEndDate, letterId },
      }, client)
    }
    if (outerTx) {
      await runExtend(outerTx)
    } else {
      await db.transaction(async _tx => runExtend(_tx as unknown as DbOrTx))
    }
  } else if (recommendation === 'FAIL') {
    // Mark person as FAILED → trigger termination workflow.
    // COLLISION-PROBATION fix (Phase 3 P6E): when outerTx provided, writes join caller's tx.
    // triggerTerminationApproval and the terminationWorkflowInstanceId update remain
    // intentionally outside any transaction — termination trigger must not be rolled back
    // if the outer tx rolls back for an unrelated reason.
    const runFail = async (client: DbOrTx) => {
      await client
        .update(persons)
        .set({
          probationStatus: 'FAILED',
          updatedBy:       actorPersonId,
          updatedByName:   actorPersonId,
          updatedDate:     now,
          lastUpdatedDate: now,
        })
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, review.personId)))

      await client
        .update(probationReviews)
        .set({
          hrDecision:      'APPROVED',
          hrComments:      decisionNote ?? null,
          hrDecidedAt:     now,
          hrPersonId:      actorPersonId,
          outcome:         'FAILED',
          reviewStatus:    'COMPLETED',
          completedAt:     now,
          updatedBy:       actorPersonId,
          updatedByName:   actorPersonId,
          updatedDate:     now,
          lastUpdatedDate: now,
        })
        .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))

      await writeAuditLog({
        actorId:       actorPersonId,
        actorName:     actorPersonId,
        actorRole:     'HR_ADMIN',
        actorEntityId: legalEntityId,
        channel:       'WEB',
        eventType:     'PROBATION.FAIL_APPROVED',
        resourceType:  'probation_reviews',
        resourceId:    reviewId,
        entityId:      legalEntityId,
        newValues:     { outcome: 'FAILED', decisionNote },
      }, client)
    }
    if (outerTx) {
      await runFail(outerTx)
    } else {
      await db.transaction(async _tx => runFail(_tx as unknown as DbOrTx))
    }

    // Trigger termination workflow (outside transaction — intentional)
    try {
      const terminationResult = await triggerTerminationApproval({
        personId:          review.personId,
        personNumber:      person.personNumber ?? '',
        personFullName:    person.fullNameEn ?? '',
        legalEntityId,
        lineManagerId:     person.lineManagerId ?? null,
        terminationDate:   now.toISOString().split('T')[0],
        terminationReason: `Probation failed. HR decision: ${decisionNote ?? 'Probation period not passed.'}`,
        contractId:        '', // no active contract ID available at this point
      })

      await db
        .update(probationReviews)
        .set({ terminationWorkflowInstanceId: terminationResult.instanceId })
        .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, reviewId)))
    } catch {
      // Termination trigger failure should not block the probation outcome record
    }
  }

  revalidatePath('/admin/probation')
  revalidatePath(`/persons/${review.personId}`)
}

// ── finalizeProbationAfterSigning ─────────────────────────────────────────────
// Called by completeLetterSigning when the signed letter is a PCL (Probation Confirmation Letter).

export async function finalizeProbationAfterSigning(
  letterId: string,
  personId: string,
): Promise<void> {
  const now = new Date()

  // Find the linked review via confirmation_letter_id
  const [review] = await db
    .select()
    .from(probationReviews)
    .where(
      and(
        eq(probationReviews.tenantId, TENANT_ID),
        eq(probationReviews.confirmationLetterId, letterId),
      ),
    )
    .limit(1)

  if (!review) {
    // No linked review — letter may have been manually issued; do nothing
    return
  }

  await db.transaction(async tx => {
    // Update person: probation confirmed (permanent)
    await tx
      .update(persons)
      .set({
        probationStatus: 'CONFIRMED',
        updatedBy:       personId,
        updatedByName:   personId,
        updatedDate:     now,
        lastUpdatedDate: now,
      })
      .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))

    // Close out the review
    await tx
      .update(probationReviews)
      .set({
        reviewStatus:    'COMPLETED',
        completedAt:     now,
        updatedBy:       personId,
        updatedByName:   personId,
        updatedDate:     now,
        lastUpdatedDate: now,
      })
      .where(and(eq(probationReviews.tenantId, TENANT_ID), eq(probationReviews.id, review.id)))

    // Notify HR that employee has signed and is now confirmed
    const [hrAccount] = await tx
      .select({ personId: userAccounts.personId })
      .from(userAccounts)
      .where(and(eq(userAccounts.tenantId, TENANT_ID), eq(userAccounts.avaniisRole, 'HR_ADMIN'), eq(userAccounts.isActive, true)))
      .limit(1)

    if (hrAccount?.personId) {
      const [emp] = await tx
        .select({ fullNameEn: persons.fullNameEn, personNumber: persons.personNumber })
        .from(persons)
        .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, personId)))
        .limit(1)

      await tx.insert(notificationLog).values({
        tenantId:          TENANT_ID,
        legalEntityId:     review.legalEntityId,
        recipientPersonId: hrAccount.personId,
        notificationType:  'PROBATION_SIGNED',
        channel:           'IN_APP',
        subjectEn:         `Probation confirmed — ${emp?.fullNameEn ?? personId} signed`,
        bodyEn:            `${emp?.fullNameEn ?? personId} (${emp?.personNumber ?? ''}) has signed their Probation Confirmation Letter. Employee status updated to Confirmed.`,
        referenceType:     'PROBATION_REVIEW',
        referenceId:       review.id,
        status:            'PENDING',
        createdBy:         personId,
        createdByName:     personId,
      })
    }

    await writeAuditLog({
      actorId:       personId,
      actorName:     personId,
      actorRole:     'EMPLOYEE',
      actorEntityId: review.legalEntityId,
      channel:       'WEB',
      eventType:     'PROBATION.CONFIRMED_AFTER_SIGNING',
      resourceType:  'persons',
      resourceId:    personId,
      entityId:      review.legalEntityId,
      newValues:     { probationStatus: 'CONFIRMED', letterId, reviewId: review.id },
    }, tx)
  })

  revalidatePath('/admin/probation')
  revalidatePath(`/persons/${personId}`)
  revalidatePath('/me/requests/probation')
}

// ── internal: generate a probation letter (PCL or PEL) ───────────────────────

async function generateProbationLetter(
  typeCode:      'PCL' | 'PEL',
  review:        typeof probationReviews.$inferSelect,
  person:        { id: string; fullNameEn: string | null; personNumber: string | null; legalEntityId?: string | null },
  actorPersonId: string,
  now:           Date,
): Promise<string | null> {
  try {
    const legalEntityId = review.legalEntityId
    const template = await getDefaultTemplate(typeCode, legalEntityId)
    if (!template) return null

    const letterNumber = await nextLetterNumber(typeCode)

    const ctx = {
      personId:        review.personId,
      legalEntityId,
      letterId:        '',
      letterNumber,
      effectiveDate:   now,
      db:              db as any,
      // Probation-specific context fields
      confirmationDate:  review.hrDecidedAt,
      extensionEndDate:  review.requestedExtensionEndDate ? new Date(review.requestedExtensionEndDate) : null,
      hrApproverName:    actorPersonId,
    }

    const { resolvedEn, resolvedAr, snapshot } = await resolveTemplateBilingual(
      template.bodyEn,
      template.bodyAr ?? '',
      ctx as any,
    )

    const [letter] = await db.insert(employeeLetters).values({
      tenantId:       TENANT_ID,
      personId:       review.personId,
      legalEntityId,
      templateId:     template.id,
      typeCode,
      letterNumber,
      status:         'ISSUED',
      resolvedBodyEn: resolvedEn,
      resolvedBodyAr: resolvedAr,
      tokenSnapshot:  snapshot,
      generatedBy:    actorPersonId,
      generatedAt:    now,
      language:       'both',
      createdBy:      actorPersonId,
      createdByName:  actorPersonId,
    }).returning({ id: employeeLetters.id })

    return letter.id
  } catch {
    return null
  }
}
