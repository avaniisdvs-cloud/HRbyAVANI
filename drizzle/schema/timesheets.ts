/**
 * AVANIIS HR — Attendance / Timesheet Schema
 * Biometric attendance tracking, manual entries, exception handling.
 *
 * Import chain: foundation → configuration → transactions → timesheets
 * BR-AUDIT-001: All tables carry 7 audit columns.
 * BR-TENANT-001: All tables carry tenant_id.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  time,
  integer,
  numeric,
} from 'drizzle-orm/pg-core'
import { persons } from './foundation'
import { TENANT_ID } from '../../lib/constants'

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
// ATTENDANCE RECORDS — one row per employee per calendar day
// ══════════════════════════════════════════════════════════════════════════════

export const attendanceRecords = pgTable('attendance_records', {
  id:             uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:       uuid('person_id').notNull().references(() => persons.id),
  employeeNumber: varchar('employee_number', { length: 50 }),
  attendanceDate: date('attendance_date').notNull(),
  timeIn:         timestamp('time_in', { withTimezone: true }),
  timeOut:        timestamp('time_out', { withTimezone: true }),
  workedHours:    numeric('worked_hours', { precision: 5, scale: 2 }).default('0'),
  shiftStart:     time('shift_start'),
  shiftEnd:       time('shift_end'),
  contractedHours: numeric('contracted_hours', { precision: 4, scale: 2 }).default('8'),
  // PRESENT | LATE | EARLY_LEAVE | ABSENT | ON_LEAVE | PUBLIC_HOLIDAY | WEEKEND | MISS_PUNCH | PENDING_APPROVAL
  status:         varchar('status', { length: 30 }).notNull(),
  isLate:         boolean('is_late').default(false),
  lateMinutes:    integer('late_minutes').default(0),
  isEarlyLeave:   boolean('is_early_leave').default(false),
  earlyLeaveMinutes: integer('early_leave_minutes').default(0),
  isMissPunch:    boolean('is_miss_punch').default(false),
  overtimeHours:  numeric('overtime_hours', { precision: 4, scale: 2 }).default('0'),
  // DEVICE | MANUAL | EXCEL_UPLOAD | SYSTEM
  source:         varchar('source', { length: 20 }).default('DEVICE'),
  deviceId:       varchar('device_id', { length: 100 }),
  // AUTO | PENDING | APPROVED | REJECTED
  approvalStatus: varchar('approval_status', { length: 20 }).default('AUTO'),
  approvedById:   uuid('approved_by_id'),
  approvedByName: varchar('approved_by_name', { length: 200 }),
  approvedDate:   timestamp('approved_date', { withTimezone: true }),
  notes:          text('notes'),
  isActive:       boolean('is_active').default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE EXCEPTIONS — employee-raised correction requests
// ══════════════════════════════════════════════════════════════════════════════

export const attendanceExceptions = pgTable('attendance_exceptions', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  personId:            uuid('person_id').notNull().references(() => persons.id),
  attendanceRecordId:  uuid('attendance_record_id').references(() => attendanceRecords.id),
  exceptionDate:       date('exception_date').notNull(),
  // LATE_COMING | EARLY_LEAVING | MISS_PUNCH | BUSINESS_MEETING | OTHER
  exceptionType:       varchar('exception_type', { length: 30 }).notNull(),
  reason:              text('reason').notNull(),
  requestedTimeIn:     timestamp('requested_time_in', { withTimezone: true }),
  requestedTimeOut:    timestamp('requested_time_out', { withTimezone: true }),
  // PENDING | APPROVED | REJECTED
  status:              varchar('status', { length: 20 }).default('PENDING'),
  managerComment:      text('manager_comment'),
  reviewedById:        uuid('reviewed_by_id'),
  reviewedByName:      varchar('reviewed_by_name', { length: 200 }),
  reviewedDate:        timestamp('reviewed_date', { withTimezone: true }),
  workflowInstanceId:  uuid('workflow_instance_id'),
  isActive:            boolean('is_active').default(true),
  ...audit(),
})

// ══════════════════════════════════════════════════════════════════════════════
// DEVICE SYNC LOG — one row per biometric device sync call
// ══════════════════════════════════════════════════════════════════════════════

export const deviceSyncLog = pgTable('device_sync_log', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  deviceId:         varchar('device_id', { length: 100 }).notNull(),
  deviceName:       varchar('device_name', { length: 200 }),
  syncTimestamp:    timestamp('sync_timestamp', { withTimezone: true }).defaultNow().notNull(),
  recordsReceived:  integer('records_received').default(0),
  recordsProcessed: integer('records_processed').default(0),
  recordsRejected:  integer('records_rejected').default(0),
  recordsFailed:    integer('records_failed').default(0),
  // SUCCESS | PARTIAL | FAILED
  status:           varchar('status', { length: 20 }),
  errorSummary:     text('error_summary'),
  createdDate:      timestamp('created_date', { withTimezone: true }).defaultNow(),
})

// ══════════════════════════════════════════════════════════════════════════════
// DEVICE PUNCH RAW — raw punch records before processing
// ══════════════════════════════════════════════════════════════════════════════

export const devicePunchRaw = pgTable('device_punch_raw', {
  id:               uuid('id').primaryKey().defaultRandom(),
  ...tenant(),
  deviceId:         varchar('device_id', { length: 100 }),
  employeeIdRaw:    varchar('employee_id_raw', { length: 100 }),
  employeeEmail:    varchar('employee_email', { length: 255 }),
  punchTimestamp:   timestamp('punch_timestamp', { withTimezone: true }).notNull(),
  // IN | OUT | UNKNOWN
  punchType:        varchar('punch_type', { length: 10 }),
  processed:        boolean('processed').default(false),
  rejected:         boolean('rejected').default(false),
  rejectReason:     varchar('reject_reason', { length: 200 }),
  createdDate:      timestamp('created_date', { withTimezone: true }).defaultNow(),
})

// ── TypeScript types ──────────────────────────────────────────────────────

export type AttendanceRecord    = typeof attendanceRecords.$inferSelect
export type NewAttendanceRecord = typeof attendanceRecords.$inferInsert

export type AttendanceException    = typeof attendanceExceptions.$inferSelect
export type NewAttendanceException = typeof attendanceExceptions.$inferInsert

export type DeviceSyncLog    = typeof deviceSyncLog.$inferSelect
export type DevicePunchRaw   = typeof devicePunchRaw.$inferSelect
