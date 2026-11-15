/**
 * AVANIIS HR — Probation Review Workflow Table
 * BR-37: total probation cannot exceed 6 months (182 days) from hire_date.
 * BR-PW-001: only one active review per person at a time (enforced via partial unique index).
 * BR-NO-DELETE: review records are never deleted; status transitions only.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  date,
} from 'drizzle-orm/pg-core'
import { persons, legalEntities } from './foundation'
import { employeeLetters }        from './employee-letters'
import { TENANT_ID }              from '../../lib/constants'

const tenant = () => ({
  tenantId: uuid('tenant_id').notNull().default(TENANT_ID),
})

const audit = () => ({
  createdBy:       uuid('created_by').notNull(),
  createdByName:   varchar('created_by_name', { length: 200 }).notNull(),
  createdDate:     timestamp('created_date', { withTimezone: true }).defaultNow().notNull(),
  updatedBy:       uuid('updated_by'),
  updatedByName:   varchar('updated_by_name', { length: 200 }),
  lastUpdatedDate: timestamp('last_updated_date', { withTimezone: true }),
  updatedDate:     timestamp('updated_date', { withTimezone: true }),
})

// ══════════════════════════════════════════════════════════════════════════════
// probation_reviews
// ══════════════════════════════════════════════════════════════════════════════

export const probationReviews = pgTable('probation_reviews', {
  id:                uuid('id').primaryKey().defaultRandom(),
  ...tenant(),

  personId:          uuid('person_id').notNull().references(() => persons.id),
  legalEntityId:     uuid('legal_entity_id').notNull().references(() => legalEntities.id),
  initiatedByPersonId: uuid('initiated_by_person_id').notNull().references(() => persons.id),
  initiatedAt:       timestamp('initiated_at', { withTimezone: true }).notNull().defaultNow(),
  // HR_ADMIN | EMPLOYEE | MANAGER
  initiatedByChannel: varchar('initiated_by_channel', { length: 20 }).notNull().default('HR_ADMIN'),

  // Probation state snapshot at initiation (immutable after insert)
  probationEndDateAtInitiation: date('probation_end_date_at_initiation').notNull(),
  hireDateAtInitiation:         date('hire_date_at_initiation').notNull(),
  // BR-37: computed as hire_date + 182 days, stored on insert
  maxAllowedExtensionDate:      date('max_allowed_extension_date').notNull(),

  // Line Manager step
  // CONFIRM | EXTEND | FAIL (null until LM submits)
  lmRecommendation:    varchar('lm_recommendation', { length: 10 }),
  lmComments:          text('lm_comments'),
  lmRecommendedAt:     timestamp('lm_recommended_at', { withTimezone: true }),
  lmPersonId:          uuid('lm_person_id').references(() => persons.id),
  // only when lm_recommendation = 'EXTEND'; must be <= max_allowed_extension_date (BR-37)
  requestedExtensionEndDate: date('requested_extension_end_date'),

  // HR Admin step
  // APPROVED | REJECTED (null until HR decides)
  hrDecision:   varchar('hr_decision', { length: 10 }),
  hrComments:   text('hr_comments'),
  hrDecidedAt:  timestamp('hr_decided_at', { withTimezone: true }),
  hrPersonId:   uuid('hr_person_id').references(() => persons.id),

  // Overall review status
  // PENDING_LM | PENDING_HR | PENDING_ACKNOWLEDGMENT | COMPLETED | REJECTED | CANCELLED
  reviewStatus: varchar('review_status', { length: 30 }).notNull().default('PENDING_LM'),

  // Final outcome — set only when review_status = COMPLETED
  // CONFIRMED | EXTENDED | FAILED
  outcome: varchar('outcome', { length: 10 }),

  // Links to related records
  workflowInstanceId:          uuid('workflow_instance_id'),
  confirmationLetterId:        uuid('confirmation_letter_id').references(() => employeeLetters.id),
  extensionLetterId:           uuid('extension_letter_id').references(() => employeeLetters.id),
  // FK to chained termination workflow when outcome = FAILED
  terminationWorkflowInstanceId: uuid('termination_workflow_instance_id'),
  completedAt:                 timestamp('completed_at', { withTimezone: true }),

  ...audit(),
})

export type ProbationReview    = typeof probationReviews.$inferSelect
export type NewProbationReview = typeof probationReviews.$inferInsert
