/**
 * AVANIIS HR — HR Action Request Tables (Task E)
 * Hiring requests, transfer/promotion requests.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  decimal,
} from 'drizzle-orm/pg-core'
import { positions }    from './foundation'
import { TENANT_ID }    from '../../lib/constants'

// ─── Shared helpers (local — can't import from foundation.ts internals) ───────

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
// hiring_requests
// ══════════════════════════════════════════════════════════════════════════════

export const hiringRequests = pgTable('hiring_requests', {
  id:              uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  positionId:      uuid('position_id').notNull().references(() => positions.id),
  departmentId:    uuid('department_id').notNull(),
  // NEW_HIRE | REPLACEMENT | TEMPORARY_STAFF | INTERNAL_TRANSFER
  requestType:     varchar('request_type', { length: 30 }).notNull(),
  replacementFor:  varchar('replacement_for', { length: 200 }),
  requiredByDate:  date('required_by_date'),
  budgetApproved:  boolean('budget_approved').default(false),
  budgetAmount:    decimal('budget_amount', { precision: 12, scale: 2 }),
  justification:   text('justification').notNull(),
  // STANDARD | URGENT | CRITICAL
  urgency:         varchar('urgency', { length: 20 }).default('STANDARD'),
  // PENDING_APPROVAL | APPROVED | REJECTED | CANCELLED | FULFILLED
  status:          varchar('status', { length: 30 }).notNull().default('PENDING_APPROVAL'),
  requestedById:   uuid('requested_by_id').notNull(),
  requestedByName: varchar('requested_by_name', { length: 200 }).notNull(),
  requestedDate:   date('requested_date').notNull().defaultNow(),
  ...audit(),
})

export type HiringRequest    = typeof hiringRequests.$inferSelect
export type NewHiringRequest = typeof hiringRequests.$inferInsert

// ══════════════════════════════════════════════════════════════════════════════
// transfer_requests
// ══════════════════════════════════════════════════════════════════════════════

export const transferRequests = pgTable('transfer_requests', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull(),
  currentPositionId:   uuid('current_position_id').notNull(),
  targetPositionId:    uuid('target_position_id'),
  targetDepartmentId:  uuid('target_department_id'),
  // Target grade for PROMOTION requests (FK to grades.id enforced in DB — migration 0062).
  targetGradeId:       uuid('target_grade_id'),
  // TRANSFER | PROMOTION
  requestType:         varchar('request_type', { length: 20 }).notNull(),
  effectiveDate:       date('effective_date').notNull(),
  // CAREER_GROWTH | ORG_NEED | PERFORMANCE | PERSONAL | OTHER
  reason:              varchar('reason', { length: 50 }).notNull(),
  notes:               text('notes'),
  // PENDING_APPROVAL | APPROVED | REJECTED | CANCELLED
  status:              varchar('status', { length: 30 }).notNull().default('PENDING_APPROVAL'),
  requestedById:       uuid('requested_by_id').notNull(),
  requestedByName:     varchar('requested_by_name', { length: 200 }).notNull(),
  ...audit(),
})

export type TransferRequest    = typeof transferRequests.$inferSelect
export type NewTransferRequest = typeof transferRequests.$inferInsert
