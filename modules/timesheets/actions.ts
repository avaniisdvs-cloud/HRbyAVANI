'use server'

import { translateError } from '@/lib/app-error'
import { and, eq, gte, lte, sql, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/lib/audit'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { TENANT_ID } from '@/lib/constants'
import {
  attendanceRecords,
  attendanceExceptions,
  deviceSyncLog,
  devicePunchRaw,
  persons,
  workerAssignments,
  absenceEntries,
  notificationLog,
  workSchedules,
  type AttendanceRecord,
  type NewAttendanceRecord,
  type AttendanceException,
} from '@/drizzle/schema'

// ── Types ──────────────────────────────────────────────────────────────────

export type AttendanceSummaryData = {
  presentDays:  number
  absentDays:   number
  lateDays:     number
  leaveDays:    number
  totalWorked:  number   // hours
  totalOT:      number   // hours
}

export type AttendanceRecordRow = AttendanceRecord & {
  personName: string | null
}

export type TeamAttendanceResult = {
  records:  AttendanceRecordRow[]
  summary:  AttendanceSummaryData
}

export type AttendanceReportRow = {
  employeeNumber:  string | null
  personName:      string
  attendanceDate:  string
  status:          string
  timeIn:          string | null
  timeOut:         string | null
  workedHours:     string
  overtimeHours:   string
  lateMinutes:     number
  earlyLeaveMinutes: number
  source:          string | null
  approvalStatus:  string | null
}

// ── Private helpers ────────────────────────────────────────────────────────

const DAY_COLS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const

function getDayName(date: Date): typeof DAY_COLS[number] {
  return DAY_COLS[date.getDay()]
}

function parseHHMM(val: string | null | undefined): number {
  if (!val) return 0
  const [h, m] = val.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function getShiftForDate(
  schedule: Record<string, string | null | undefined>,
  date: Date,
): { shiftStart: string | null; shiftEnd: string | null } {
  const day = getDayName(date)
  return {
    shiftStart: (schedule[`${day}Start`] as string | null) ?? null,
    shiftEnd:   (schedule[`${day}End`] as string | null) ?? null,
  }
}

function calcWorkedHours(timeIn: Date | null, timeOut: Date | null): number {
  if (!timeIn || !timeOut) return 0
  return Math.max(0, (timeOut.getTime() - timeIn.getTime()) / 3_600_000)
}

function calcLate(timeIn: Date | null, shiftStart: string | null): number {
  if (!timeIn || !shiftStart) return 0
  const shiftMins = parseHHMM(shiftStart)
  const inMins = timeIn.getHours() * 60 + timeIn.getMinutes()
  return Math.max(0, inMins - shiftMins)
}

function calcEarlyLeave(timeOut: Date | null, shiftEnd: string | null): number {
  if (!timeOut || !shiftEnd) return 0
  const shiftMins = parseHHMM(shiftEnd)
  const outMins = timeOut.getHours() * 60 + timeOut.getMinutes()
  return Math.max(0, shiftMins - outMins)
}

function calcOvertime(workedHours: number, contractedHours: number): number {
  return Math.max(0, workedHours - contractedHours)
}

function deriveStatus(params: {
  timeIn: Date | null
  timeOut: Date | null
  isLate: boolean
  isEarlyLeave: boolean
  isMissPunch: boolean
  isOnLeave: boolean
  isWeekend: boolean
  isHoliday: boolean
}): string {
  if (params.isHoliday)   return 'PUBLIC_HOLIDAY'
  if (params.isWeekend)   return 'WEEKEND'
  if (params.isOnLeave)   return 'ON_LEAVE'
  if (!params.timeIn)     return 'ABSENT'
  if (params.isMissPunch) return 'MISS_PUNCH'
  if (params.isLate && params.isEarlyLeave) return 'LATE'
  if (params.isLate)      return 'LATE'
  if (params.isEarlyLeave) return 'EARLY_LEAVE'
  return 'PRESENT'
}

async function getPersonSchedule(personId: string): Promise<Record<string, string | null> | null> {
  const [assignment] = await db
    .select({ workScheduleId: workerAssignments.workScheduleId })
    .from(workerAssignments)
    .where(and(
      eq(workerAssignments.personId, personId),
      eq(workerAssignments.isCurrent, true),
    ))
    .limit(1)

  if (!assignment?.workScheduleId) return null

  const [sched] = await db
    .select()
    .from(workSchedules)
    .where(eq(workSchedules.id, assignment.workScheduleId))
    .limit(1)

  return sched as unknown as Record<string, string | null> | null
}

async function isOnApprovedLeave(personId: string, date: string): Promise<boolean> {
  const rows = await db
    .select({ id: absenceEntries.id })
    .from(absenceEntries)
    .where(and(
      eq(absenceEntries.personId, personId),
      eq(absenceEntries.status, 'APPROVED'),
      lte(absenceEntries.startDate, date),
      gte(absenceEntries.endDate, date),
    ))
    .limit(1)
  return rows.length > 0
}

async function sendNotification(params: {
  tenantId:      string
  personId:      string
  legalEntityId: string
  type:          string
  titleEn:       string
  bodyEn:        string
  refType?:      string
  refId?:        string
  actorId:       string
  actorName:     string
  tx:            Pick<typeof db, 'insert'>
}): Promise<void> {
  await params.tx.insert(notificationLog).values({
    tenantId:         params.tenantId,
    recipientPersonId: params.personId,
    legalEntityId:    params.legalEntityId,
    notificationType: params.type,
    channel:          'IN_APP',
    subjectEn:        params.titleEn,
    bodyEn:           params.bodyEn,
    referenceType:    params.refType ?? null,
    referenceId:      params.refId ?? null,
    status:           'SENT',
    sentAt:           new Date(),
    createdBy:        params.actorId,
    createdByName:    params.actorName,
    createdDate:      new Date(),
  })
}

function buildSummary(records: AttendanceRecord[]): AttendanceSummaryData {
  let presentDays = 0, absentDays = 0, lateDays = 0, leaveDays = 0
  let totalWorked = 0, totalOT = 0

  for (const r of records) {
    if (r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'EARLY_LEAVE') presentDays++
    if (r.status === 'ABSENT') absentDays++
    if (r.status === 'LATE') lateDays++
    if (r.status === 'ON_LEAVE') leaveDays++
    totalWorked += parseFloat(r.workedHours ?? '0')
    totalOT     += parseFloat(r.overtimeHours ?? '0')
  }

  return { presentDays, absentDays, lateDays, leaveDays, totalWorked, totalOT }
}

// ── 1. getMyAttendance ─────────────────────────────────────────────────────

export async function getMyAttendance(params: {
  startDate: string
  endDate:   string
}): Promise<{ records: AttendanceRecord[]; summary: AttendanceSummaryData }> {
  try {
    const user = await getCurrentUser()
    if (!user.personId) return { records: [], summary: buildSummary([]) }

    const records = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.tenantId, TENANT_ID),
        eq(attendanceRecords.personId, user.personId),
        eq(attendanceRecords.isActive, true),
        gte(attendanceRecords.attendanceDate, params.startDate),
        lte(attendanceRecords.attendanceDate, params.endDate),
      ))
      .orderBy(attendanceRecords.attendanceDate)

    return { records, summary: buildSummary(records) }
  } catch (e) { translateError(e, 'getMyAttendance') }
}

// ── 2. getTeamAttendance ───────────────────────────────────────────────────

export async function getTeamAttendance(params: {
  startDate:   string
  endDate:     string
  departmentId?: string
}): Promise<TeamAttendanceResult> {
  try {
    const user = await requireRole(['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    // Find direct reports if MANAGER
    let personIds: string[] | null = null

    if (user.role === 'MANAGER' && user.personId) {
      const directs = await db
        .select({ personId: workerAssignments.personId })
        .from(workerAssignments)
        .where(and(
          eq(workerAssignments.lineManagerId, user.personId),
          eq(workerAssignments.isCurrent, true),
        ))
      personIds = directs.map(d => d.personId)
      if (personIds.length === 0) return { records: [], summary: buildSummary([]) }
    }

    const conditions = [
      eq(attendanceRecords.tenantId, TENANT_ID),
      eq(attendanceRecords.isActive, true),
      gte(attendanceRecords.attendanceDate, params.startDate),
      lte(attendanceRecords.attendanceDate, params.endDate),
    ]
    if (personIds) conditions.push(inArray(attendanceRecords.personId, personIds))

    const rows = await db
      .select({
        record:     attendanceRecords,
        personName: persons.fullNameEn,
      })
      .from(attendanceRecords)
      .innerJoin(persons, eq(attendanceRecords.personId, persons.id))
      .where(and(...conditions))
      .orderBy(attendanceRecords.attendanceDate, persons.fullNameEn)

    const records: AttendanceRecordRow[] = rows.map(r => ({
      ...r.record,
      personName: r.personName ?? null,
    }))

    return { records, summary: buildSummary(rows.map(r => r.record)) }
  } catch (e) { translateError(e, 'getTeamAttendance') }
}

// ── 3. getFullAttendance ───────────────────────────────────────────────────

export async function getFullAttendance(params: {
  startDate:    string
  endDate:      string
  departmentId?: string
  status?:      string
  page?:        number
  pageSize?:    number
}): Promise<{ records: AttendanceRecordRow[]; total: number; summary: AttendanceSummaryData }> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const page     = params.page     ?? 1
    const pageSize = params.pageSize ?? 50
    const offset   = (page - 1) * pageSize

    const conditions = [
      eq(attendanceRecords.tenantId, TENANT_ID),
      eq(attendanceRecords.isActive, true),
      gte(attendanceRecords.attendanceDate, params.startDate),
      lte(attendanceRecords.attendanceDate, params.endDate),
    ]
    if (params.status) conditions.push(eq(attendanceRecords.status, params.status))

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(attendanceRecords)
      .where(and(...conditions))

    const rows = await db
      .select({
        record:     attendanceRecords,
        personName: persons.fullNameEn,
      })
      .from(attendanceRecords)
      .innerJoin(persons, eq(attendanceRecords.personId, persons.id))
      .where(and(...conditions))
      .orderBy(attendanceRecords.attendanceDate, persons.fullNameEn)
      .limit(pageSize)
      .offset(offset)

    const records: AttendanceRecordRow[] = rows.map(r => ({
      ...r.record,
      personName: r.personName ?? null,
    }))

    // Summary over the full result set (not just this page)
    const allRows = await db
      .select()
      .from(attendanceRecords)
      .where(and(...conditions))
    const summary = buildSummary(allRows)

    return { records, total: countRow?.count ?? 0, summary }
  } catch (e) { translateError(e, 'getFullAttendance') }
}

// ── 4. createManualAttendance ──────────────────────────────────────────────

export async function createManualAttendance(params: {
  personId:       string
  attendanceDate: string
  timeIn?:        string   // ISO datetime string
  timeOut?:       string
  notes?:         string
}): Promise<{ id: string }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'MANAGER'])

    const timeIn  = params.timeIn  ? new Date(params.timeIn)  : null
    const timeOut = params.timeOut ? new Date(params.timeOut) : null

    const schedule = await getPersonSchedule(params.personId)
    const date     = new Date(params.attendanceDate)
    const { shiftStart, shiftEnd } = schedule
      ? getShiftForDate(schedule, date)
      : { shiftStart: null, shiftEnd: null }

    const contractedHours = shiftStart && shiftEnd
      ? (parseHHMM(shiftEnd) - parseHHMM(shiftStart)) / 60
      : 8

    const workedHours   = calcWorkedHours(timeIn, timeOut)
    const lateMinutes   = calcLate(timeIn, shiftStart)
    const earlyMinutes  = calcEarlyLeave(timeOut, shiftEnd)
    const overtimeHours = calcOvertime(workedHours, contractedHours)
    const isMissPunch   = !!(timeIn && !timeOut) || !!(!timeIn && timeOut)

    const onLeave = await isOnApprovedLeave(params.personId, params.attendanceDate)

    const status = deriveStatus({
      timeIn,
      timeOut,
      isLate:      lateMinutes > 0,
      isEarlyLeave: earlyMinutes > 0,
      isMissPunch,
      isOnLeave:   onLeave,
      isWeekend:   false,
      isHoliday:   false,
    })

    const result = await db.transaction(async tx => {
      const [row] = await tx.insert(attendanceRecords).values({
        tenantId:         TENANT_ID,
        personId:         params.personId,
        attendanceDate:   params.attendanceDate,
        timeIn,
        timeOut,
        workedHours:      workedHours.toFixed(2),
        shiftStart:       shiftStart ?? undefined,
        shiftEnd:         shiftEnd ?? undefined,
        contractedHours:  contractedHours.toFixed(2),
        status,
        isLate:           lateMinutes > 0,
        lateMinutes,
        isEarlyLeave:     earlyMinutes > 0,
        earlyLeaveMinutes: earlyMinutes,
        isMissPunch,
        overtimeHours:    overtimeHours.toFixed(2),
        source:           'MANUAL',
        approvalStatus:   'PENDING',
        notes:            params.notes,
        isActive:         true,
        createdBy:        user.id,
        createdByName:    user.name,
        createdDate:      new Date(),
      }).returning({ id: attendanceRecords.id })

      await writeAuditLog({
        actorId:      user.id,
        actorName:    user.name,
        actorRole:    user.role,
        channel:      'WEB',
        eventType:    'ATTENDANCE.MANUAL_CREATE',
        resourceType: 'attendance_records',
        resourceId:   row!.id,
        metadata:     { personId: params.personId, attendanceDate: params.attendanceDate, status },
      }, tx)

      return { id: row!.id }
    })

    return result
  } catch (e) { translateError(e, 'createManualAttendance') }
}

// ── 5. approveManualAttendance ─────────────────────────────────────────────

export async function approveManualAttendance(params: {
  attendanceRecordId: string
  action:             'APPROVED' | 'REJECTED'
  notes?:             string
}): Promise<{ success: true }> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'MANAGER'])

    await db.transaction(async tx => {
      await tx
        .update(attendanceRecords)
        .set({
          approvalStatus: params.action,
          approvedById:   user.id,
          approvedByName: user.name,
          approvedDate:   new Date(),
          notes:          params.notes,
          updatedBy:      user.id,
          updatedByName:  user.name,
          lastUpdatedDate: new Date(),
        })
        .where(and(
          eq(attendanceRecords.id, params.attendanceRecordId),
          eq(attendanceRecords.tenantId, TENANT_ID),
        ))

      await writeAuditLog({
        actorId:      user.id,
        actorName:    user.name,
        actorRole:    user.role,
        channel:      'WEB',
        eventType:    `ATTENDANCE.${params.action}`,
        resourceType: 'attendance_records',
        resourceId:   params.attendanceRecordId,
        metadata:     { action: params.action },
      }, tx)
    })

    return { success: true }
  } catch (e) { translateError(e, 'approveManualAttendance') }
}

// ── 6. submitExceptionRequest ──────────────────────────────────────────────

export async function submitExceptionRequest(params: {
  attendanceRecordId?: string
  exceptionDate:       string
  exceptionType:       string
  reason:              string
  requestedTimeIn?:    string
  requestedTimeOut?:   string
}): Promise<{ id: string }> {
  try {
    const user = await getCurrentUser()
    if (!user.personId) throw new Error('No person linked to this account')

    const result = await db.transaction(async tx => {
      const [row] = await tx.insert(attendanceExceptions).values({
        tenantId:            TENANT_ID,
        personId:            user.personId!,
        attendanceRecordId:  params.attendanceRecordId ?? null,
        exceptionDate:       params.exceptionDate,
        exceptionType:       params.exceptionType,
        reason:              params.reason,
        requestedTimeIn:     params.requestedTimeIn  ? new Date(params.requestedTimeIn)  : null,
        requestedTimeOut:    params.requestedTimeOut ? new Date(params.requestedTimeOut) : null,
        status:              'PENDING',
        isActive:            true,
        createdBy:           user.id,
        createdByName:       user.name,
        createdDate:         new Date(),
      }).returning({ id: attendanceExceptions.id })

      await writeAuditLog({
        actorId:      user.id,
        actorName:    user.name,
        actorRole:    user.role,
        channel:      'WEB',
        eventType:    'ATTENDANCE.EXCEPTION_SUBMITTED',
        resourceType: 'attendance_exceptions',
        resourceId:   row!.id,
        metadata:     { exceptionType: params.exceptionType, exceptionDate: params.exceptionDate },
      }, tx)

      return { id: row!.id }
    })

    return result
  } catch (e) { translateError(e, 'submitExceptionRequest') }
}

// ── 7. reviewExceptionRequest ──────────────────────────────────────────────

export async function reviewExceptionRequest(params: {
  exceptionId:    string
  action:         'APPROVED' | 'REJECTED'
  managerComment?: string
}): Promise<{ success: true }> {
  try {
    const user = await requireRole(['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    await db.transaction(async tx => {
    const [exception] = await tx
      .select()
      .from(attendanceExceptions)
      .where(and(
        eq(attendanceExceptions.id, params.exceptionId),
        eq(attendanceExceptions.tenantId, TENANT_ID),
      ))
      .limit(1)

    if (!exception) throw new Error('Exception not found')

    await tx
      .update(attendanceExceptions)
      .set({
        status:          params.action,
        managerComment:  params.managerComment ?? null,
        reviewedById:    user.id,
        reviewedByName:  user.name,
        reviewedDate:    new Date(),
        updatedBy:       user.id,
        updatedByName:   user.name,
        lastUpdatedDate: new Date(),
      })
      .where(eq(attendanceExceptions.id, params.exceptionId))

    // If approved, update the linked attendance record
    if (params.action === 'APPROVED' && exception.attendanceRecordId) {
      const timeIn  = exception.requestedTimeIn
      const timeOut = exception.requestedTimeOut

      const schedule = await getPersonSchedule(exception.personId)
      const date     = new Date(exception.exceptionDate)
      const { shiftStart, shiftEnd } = schedule
        ? getShiftForDate(schedule, date)
        : { shiftStart: null, shiftEnd: null }

      const workedHours   = calcWorkedHours(timeIn, timeOut)
      const lateMinutes   = calcLate(timeIn, shiftStart)
      const earlyMinutes  = calcEarlyLeave(timeOut, shiftEnd)
      const contractedHours = shiftStart && shiftEnd
        ? (parseHHMM(shiftEnd) - parseHHMM(shiftStart)) / 60
        : 8
      const overtimeHours = calcOvertime(workedHours, contractedHours)

      await tx
        .update(attendanceRecords)
        .set({
          timeIn,
          timeOut,
          workedHours:      workedHours.toFixed(2),
          lateMinutes,
          isLate:           lateMinutes > 0,
          earlyLeaveMinutes: earlyMinutes,
          isEarlyLeave:     earlyMinutes > 0,
          isMissPunch:      false,
          overtimeHours:    overtimeHours.toFixed(2),
          status:           lateMinutes > 0 ? 'LATE' : earlyMinutes > 0 ? 'EARLY_LEAVE' : 'PRESENT',
          approvalStatus:   'APPROVED',
          updatedBy:        user.id,
          updatedByName:    user.name,
          lastUpdatedDate:  new Date(),
        })
        .where(eq(attendanceRecords.id, exception.attendanceRecordId))
    }

    await writeAuditLog({
      actorId:      user.id,
      actorName:    user.name,
      actorRole:    user.role,
      channel:      'WEB',
      eventType:    `ATTENDANCE.EXCEPTION_${params.action}`,
      resourceType: 'attendance_exceptions',
      resourceId:   params.exceptionId,
      metadata:     { action: params.action, personId: exception.personId },
    }, tx)

    await sendNotification({
      tenantId:      TENANT_ID,
      personId:      exception.personId,
      legalEntityId: user.legalEntityId,
      type:          'ATTENDANCE_EXCEPTION',
      titleEn:       `Attendance Exception ${params.action}`,
      bodyEn:        `Your attendance exception for ${exception.exceptionDate} has been ${params.action.toLowerCase()}.`,
      refType:       'attendance_exceptions',
      refId:         params.exceptionId,
      actorId:       user.id,
      actorName:     user.name,
      tx,
    })
    })

    return { success: true }
  } catch (e) { translateError(e, 'reviewExceptionRequest') }
}

// ── 8. processBiometricSync ────────────────────────────────────────────────

export type BiometricPunch = {
  deviceId:       string
  employeeIdRaw:  string
  employeeEmail?: string
  punchTimestamp: string   // ISO datetime
  punchType:      'IN' | 'OUT' | 'UNKNOWN'
}

export type BiometricSyncResult = {
  syncLogId:        string
  received:         number
  processed:        number
  rejected:         number
  failed:           number
}

export async function processBiometricSync(params: {
  deviceId:   string
  deviceName: string
  punches:    BiometricPunch[]
}): Promise<BiometricSyncResult> {
  try {
    // This action is called from the API route with a validated API key — no role check needed
    const systemActorId   = '00000000-0000-0000-0000-000000000000'
    const systemActorName = 'SYSTEM'

  let processed = 0, rejected = 0, failed = 0

  // Batch-insert all raw punch records in one query (avoids N+1 — NFR-02).
  // devicePunchRaw has no unique constraint so duplicate re-syncs are harmless.
  const rawIds: string[] = []
  if (params.punches.length > 0) {
    try {
      const inserted = await db
        .insert(devicePunchRaw)
        .values(params.punches.map(punch => ({
          tenantId:       TENANT_ID,
          deviceId:       params.deviceId,
          employeeIdRaw:  punch.employeeIdRaw,
          employeeEmail:  punch.employeeEmail ?? null,
          punchTimestamp: new Date(punch.punchTimestamp),
          punchType:      punch.punchType,
          processed:      false,
          rejected:       false,
          createdDate:    new Date(),
        })))
        .returning({ id: devicePunchRaw.id })
      rawIds.push(...inserted.map(r => r.id))
    } catch {
      failed += params.punches.length
    }
  }

  // Group punches by employee+date, find IN/OUT pairs
  const grouped = new Map<string, { in?: Date; out?: Date; personId?: string; email?: string }>()

  for (const punch of params.punches) {
    const ts   = new Date(punch.punchTimestamp)
    const date = ts.toISOString().slice(0, 10)
    const key  = `${punch.employeeIdRaw}::${date}`

    if (!grouped.has(key)) {
      grouped.set(key, { email: punch.employeeEmail })
    }
    const entry = grouped.get(key)!

    if (punch.punchType === 'IN') {
      if (!entry.in || ts < entry.in) entry.in = ts
    } else if (punch.punchType === 'OUT') {
      if (!entry.out || ts > entry.out) entry.out = ts
    }
  }

  // Process each employee-date pair
  for (const [key, entry] of grouped.entries()) {
    const [empId, date] = key.split('::')

    // Look up person by personNumber (employeeIdRaw) or email via userAccounts
    let personId: string | null = null
    try {
      // Try matching employeeIdRaw to personNumber
      const [byNumber] = await db
        .select({ id: persons.id })
        .from(persons)
        .where(eq(persons.personNumber, empId))
        .limit(1)
      personId = byNumber?.id ?? null

      // Fallback: match email via userAccounts
      if (!personId && entry.email) {
        const { userAccounts } = await import('@/drizzle/schema')
        const [byEmail] = await db
          .select({ personId: userAccounts.personId })
          .from(userAccounts)
          .where(eq(userAccounts.primaryEmail, entry.email!.toLowerCase()))
          .limit(1)
        personId = byEmail?.personId ?? null
      }

      if (!personId) {
        rejected++
        continue
      }

      const schedule = await getPersonSchedule(personId)
      const dt       = new Date(date)
      const { shiftStart, shiftEnd } = schedule
        ? getShiftForDate(schedule, dt)
        : { shiftStart: null, shiftEnd: null }

      const contractedHours = shiftStart && shiftEnd
        ? (parseHHMM(shiftEnd) - parseHHMM(shiftStart)) / 60
        : 8

      const workedHours   = calcWorkedHours(entry.in ?? null, entry.out ?? null)
      const lateMinutes   = calcLate(entry.in ?? null, shiftStart)
      const earlyMinutes  = calcEarlyLeave(entry.out ?? null, shiftEnd)
      const overtimeHours = calcOvertime(workedHours, contractedHours)
      const isMissPunch   = !!(entry.in && !entry.out) || !!(!entry.in && entry.out)
      const onLeave       = await isOnApprovedLeave(personId, date)

      const status = deriveStatus({
        timeIn:      entry.in ?? null,
        timeOut:     entry.out ?? null,
        isLate:      lateMinutes > 0,
        isEarlyLeave: earlyMinutes > 0,
        isMissPunch,
        isOnLeave:   onLeave,
        isWeekend:   false,
        isHoliday:   false,
      })

      await db.transaction(async tx => {
        // Upsert — delete existing device record for this person+date then insert
        await tx
          .delete(attendanceRecords)
          .where(and(
            eq(attendanceRecords.personId, personId!),
            eq(attendanceRecords.attendanceDate, date),
            eq(attendanceRecords.tenantId, TENANT_ID),
            eq(attendanceRecords.source, 'DEVICE'),
          ))

        await tx.insert(attendanceRecords).values({
          tenantId:         TENANT_ID,
          personId:         personId!,
          attendanceDate:   date,
          timeIn:           entry.in ?? null,
          timeOut:          entry.out ?? null,
          workedHours:      workedHours.toFixed(2),
          shiftStart:       shiftStart ?? undefined,
          shiftEnd:         shiftEnd ?? undefined,
          contractedHours:  contractedHours.toFixed(2),
          status,
          isLate:           lateMinutes > 0,
          lateMinutes,
          isEarlyLeave:     earlyMinutes > 0,
          earlyLeaveMinutes: earlyMinutes,
          isMissPunch,
          overtimeHours:    overtimeHours.toFixed(2),
          source:           'DEVICE',
          deviceId:         params.deviceId,
          approvalStatus:   'AUTO',
          isActive:         true,
          createdBy:        systemActorId,
          createdByName:    systemActorName,
          createdDate:      new Date(),
        })

        await writeAuditLog({
          actorId:      systemActorId,
          actorName:    systemActorName,
          actorRole:    'SYSTEM',
          channel:      'API',
          eventType:    'ATTENDANCE.BIOMETRIC_SYNC',
          resourceType: 'attendance_records',
          metadata:     { personId, date, deviceId: params.deviceId, status },
        }, tx)
      })

      processed++
    } catch {
      failed++
    }
  }

  // Write sync log
  const [syncLog] = await db.insert(deviceSyncLog).values({
    tenantId:         TENANT_ID,
    deviceId:         params.deviceId,
    deviceName:       params.deviceName,
    syncTimestamp:    new Date(),
    recordsReceived:  params.punches.length,
    recordsProcessed: processed,
    recordsRejected:  rejected,
    recordsFailed:    failed,
    status:           failed === params.punches.length ? 'FAILED' : processed > 0 ? 'SUCCESS' : 'PARTIAL',
    createdDate:      new Date(),
  }).returning({ id: deviceSyncLog.id })

    return {
      syncLogId:  syncLog!.id,
      received:   params.punches.length,
      processed,
      rejected,
      failed,
    }
  } catch (e) { translateError(e, 'processBiometricSync') }
}

// ── 9. processExcelUpload ──────────────────────────────────────────────────

export type ExcelAttendanceRow = {
  employeeNumber: string
  attendanceDate: string   // YYYY-MM-DD
  timeIn?:        string   // HH:MM or ISO
  timeOut?:       string
  notes?:         string
}

export type ExcelUploadResult = {
  processed: number
  rejected:  number
  errors:    Array<{ row: number; reason: string }>
}

export async function processExcelUpload(
  rows: ExcelAttendanceRow[],
): Promise<ExcelUploadResult> {
  try {
    const user = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])

    let processed = 0, rejected = 0
    const errors: Array<{ row: number; reason: string }> = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    try {
      // Look up person by employee number
      const [person] = await db
        .select({ id: persons.id })
        .from(persons)
        .where(eq(persons.personNumber, row.employeeNumber))
        .limit(1)

      if (!person) {
        errors.push({ row: i + 2, reason: `Employee number not found: ${row.employeeNumber}` })
        rejected++
        continue
      }

      const toDate = (val?: string): Date | null => {
        if (!val) return null
        if (val.includes('T') || val.includes(' ')) return new Date(val)
        // HH:MM — combine with attendance date
        return new Date(`${row.attendanceDate}T${val}:00`)
      }

      const timeIn  = toDate(row.timeIn)
      const timeOut = toDate(row.timeOut)

      const schedule = await getPersonSchedule(person.id)
      const date     = new Date(row.attendanceDate)
      const { shiftStart, shiftEnd } = schedule
        ? getShiftForDate(schedule, date)
        : { shiftStart: null, shiftEnd: null }

      const contractedHours = shiftStart && shiftEnd
        ? (parseHHMM(shiftEnd) - parseHHMM(shiftStart)) / 60
        : 8

      const workedHours   = calcWorkedHours(timeIn, timeOut)
      const lateMinutes   = calcLate(timeIn, shiftStart)
      const earlyMinutes  = calcEarlyLeave(timeOut, shiftEnd)
      const overtimeHours = calcOvertime(workedHours, contractedHours)
      const isMissPunch   = !!(timeIn && !timeOut) || !!(!timeIn && timeOut)
      const onLeave       = await isOnApprovedLeave(person.id, row.attendanceDate)

      const status = deriveStatus({
        timeIn,
        timeOut,
        isLate:      lateMinutes > 0,
        isEarlyLeave: earlyMinutes > 0,
        isMissPunch,
        isOnLeave:   onLeave,
        isWeekend:   false,
        isHoliday:   false,
      })

      await db.transaction(async tx => {
        const [record] = await tx.insert(attendanceRecords).values({
          tenantId:         TENANT_ID,
          personId:         person.id,
          employeeNumber:   row.employeeNumber,
          attendanceDate:   row.attendanceDate,
          timeIn,
          timeOut,
          workedHours:      workedHours.toFixed(2),
          shiftStart:       shiftStart ?? undefined,
          shiftEnd:         shiftEnd ?? undefined,
          contractedHours:  contractedHours.toFixed(2),
          status,
          isLate:           lateMinutes > 0,
          lateMinutes,
          isEarlyLeave:     earlyMinutes > 0,
          earlyLeaveMinutes: earlyMinutes,
          isMissPunch,
          overtimeHours:    overtimeHours.toFixed(2),
          source:           'EXCEL_UPLOAD',
          approvalStatus:   'PENDING',
          notes:            row.notes,
          isActive:         true,
          createdBy:        user.id,
          createdByName:    user.name,
          createdDate:      new Date(),
        }).returning({ id: attendanceRecords.id })

        await writeAuditLog({
          actorId:      user.id,
          actorName:    user.name,
          actorRole:    user.role,
          channel:      'WEB',
          eventType:    'ATTENDANCE.EXCEL_UPLOAD',
          resourceType: 'attendance_records',
          resourceId:   record!.id,
          metadata:     { personId: person.id, attendanceDate: row.attendanceDate, status },
        }, tx)
      })

      processed++
    } catch (err) {
      errors.push({ row: i + 2, reason: err instanceof Error ? err.message : 'Unknown error' })
      rejected++
    }
  }

    return { processed, rejected, errors }
  } catch (e) { translateError(e, 'processExcelUpload') }
}

// ── 10. generateAttendanceReport ───────────────────────────────────────────

export async function generateAttendanceReport(params: {
  startDate:    string
  endDate:      string
  departmentId?: string
  status?:      string
}): Promise<AttendanceReportRow[]> {
  try {
    await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN', 'PAYROLL_ADMIN'])

    const conditions = [
      eq(attendanceRecords.tenantId, TENANT_ID),
      eq(attendanceRecords.isActive, true),
      gte(attendanceRecords.attendanceDate, params.startDate),
      lte(attendanceRecords.attendanceDate, params.endDate),
    ]
    if (params.status) conditions.push(eq(attendanceRecords.status, params.status))

    const rows = await db
      .select({
        record:         attendanceRecords,
        personName:     persons.fullNameEn,
      })
      .from(attendanceRecords)
      .innerJoin(persons, eq(attendanceRecords.personId, persons.id))
      .where(and(...conditions))
      .orderBy(persons.fullNameEn, attendanceRecords.attendanceDate)

    return rows.map(r => ({
      employeeNumber:    r.record.employeeNumber,
      personName:        r.personName ?? '',
      attendanceDate:    r.record.attendanceDate,
      status:            r.record.status,
      timeIn:            r.record.timeIn?.toISOString() ?? null,
      timeOut:           r.record.timeOut?.toISOString() ?? null,
      workedHours:       r.record.workedHours ?? '0',
      overtimeHours:     r.record.overtimeHours ?? '0',
      lateMinutes:       r.record.lateMinutes ?? 0,
      earlyLeaveMinutes: r.record.earlyLeaveMinutes ?? 0,
      source:            r.record.source,
      approvalStatus:    r.record.approvalStatus,
    }))
  } catch (e) { translateError(e, 'generateAttendanceReport') }
}
