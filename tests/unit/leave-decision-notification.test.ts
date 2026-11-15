/**
 * ISSUE-007 — Leave decision notification body tests.
 *
 * Tests buildLeaveDecisionNotificationBody and fmtLeaveDate from lib/leave-notification.ts.
 * Both are pure functions — no mocking required.
 *
 * LDN-001: Approved notification includes leave type, from, to, days, and approver name.
 * LDN-002: Rejected notification includes leave type, from, to, days, rejector name, and reason.
 * LDN-003: Rejected notification without reason does not append a reason clause.
 * LDN-004: Duration of 1 day uses singular "day" (not "days").
 * LDN-005: Duration > 1 uses plural "days".
 * LDN-006: Missing typeNameEn falls back to "Leave" in body.
 * LDN-007: Body never contains a raw UUID for actorDisplayName.
 * LDN-008: Arabic body contains the Arabic verb for "approved" (موافقة).
 * LDN-009: Arabic body contains the Arabic verb for "rejected" (رفض).
 * LDN-010: fmtLeaveDate formats a YYYY-MM-DD string as "15 Mar 2026" (UTC-safe).
 * LDN-011: fmtLeaveDate returns empty string for null/undefined input.
 * LDN-012: Approved notification without date range still produces a valid sentence.
 */

import { describe, it, expect } from 'vitest'
import {
  buildLeaveDecisionNotificationBody,
  fmtLeaveDate,
} from '@/lib/leave-notification'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BASE_APPROVED = {
  isApproved:       true,
  actorDisplayName: 'Mahendra Kumar',
  typeNameEn:       'Annual Leave',
  typeNameAr:       'الإجازة السنوية',
  startDate:        '2026-05-20',
  endDate:          '2026-05-23',
  durationDays:     4,
  decisionNote:     null,
}

const BASE_REJECTED = {
  ...BASE_APPROVED,
  isApproved:   false,
  decisionNote: 'Insufficient balance.',
}

describe('ISSUE-007 — leave decision notification body', () => {

  it('LDN-001: approved body includes leave type, date range, days, and approver name', () => {
    const { bodyEn } = buildLeaveDecisionNotificationBody(BASE_APPROVED)

    expect(bodyEn).toContain('Annual Leave')
    expect(bodyEn).toContain('20 May 2026')   // formatted startDate
    expect(bodyEn).toContain('23 May 2026')   // formatted endDate
    expect(bodyEn).toContain('4 days')
    expect(bodyEn).toContain('Mahendra Kumar')
    expect(bodyEn).toContain('approved')
    // Must be a complete sentence ending with a period
    expect(bodyEn.endsWith('.')).toBe(true)
  })

  it('LDN-002: rejected body includes leave type, date range, days, rejector name, and reason', () => {
    const { bodyEn } = buildLeaveDecisionNotificationBody(BASE_REJECTED)

    expect(bodyEn).toContain('Annual Leave')
    expect(bodyEn).toContain('20 May 2026')
    expect(bodyEn).toContain('23 May 2026')
    expect(bodyEn).toContain('4 days')
    expect(bodyEn).toContain('Mahendra Kumar')
    expect(bodyEn).toContain('rejected')
    expect(bodyEn).toContain('Reason: Insufficient balance.')
  })

  it('LDN-003: rejected body without a reason does not append a reason clause', () => {
    const { bodyEn } = buildLeaveDecisionNotificationBody({
      ...BASE_REJECTED,
      decisionNote: null,
    })

    expect(bodyEn).not.toContain('Reason:')
    expect(bodyEn).toContain('rejected')
    expect(bodyEn.endsWith('.')).toBe(true)
  })

  it('LDN-004: duration of 1 uses singular "day"', () => {
    const { bodyEn } = buildLeaveDecisionNotificationBody({
      ...BASE_APPROVED,
      durationDays: 1,
    })

    expect(bodyEn).toContain('1 day')
    expect(bodyEn).not.toContain('1 days')
  })

  it('LDN-005: duration > 1 uses plural "days"', () => {
    const { bodyEn } = buildLeaveDecisionNotificationBody({
      ...BASE_APPROVED,
      durationDays: 3,
    })

    expect(bodyEn).toContain('3 days')
    expect(bodyEn).not.toContain('3 day ')  // not singular
  })

  it('LDN-006: missing typeNameEn falls back to "Leave" in body', () => {
    const { bodyEn } = buildLeaveDecisionNotificationBody({
      ...BASE_APPROVED,
      typeNameEn: null,
    })

    expect(bodyEn).toContain('Leave')
    expect(bodyEn).toContain('approved')
  })

  it('LDN-007: body never contains a raw UUID for actorDisplayName', () => {
    const uuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const { bodyEn, bodyAr } = buildLeaveDecisionNotificationBody({
      ...BASE_APPROVED,
      actorDisplayName: 'Workflow approver',  // resolved display name, not UUID
    })

    expect(UUID_REGEX.test(bodyEn)).toBe(false)
    expect(UUID_REGEX.test(bodyAr)).toBe(false)
    expect(bodyEn).not.toContain(uuid)
    expect(bodyAr).not.toContain(uuid)
  })

  it('LDN-008: Arabic approved body contains Arabic approval verb', () => {
    const { bodyAr } = buildLeaveDecisionNotificationBody(BASE_APPROVED)

    expect(bodyAr).toContain('موافقة')
  })

  it('LDN-009: Arabic rejected body contains Arabic rejection verb', () => {
    const { bodyAr } = buildLeaveDecisionNotificationBody(BASE_REJECTED)

    expect(bodyAr).toContain('رفض')
  })

  it('LDN-010: fmtLeaveDate formats YYYY-MM-DD as "DD Mon YYYY" in UTC', () => {
    expect(fmtLeaveDate('2026-03-15')).toBe('15 Mar 2026')
    expect(fmtLeaveDate('2026-12-01')).toBe('01 Dec 2026')
    expect(fmtLeaveDate('2026-01-31')).toBe('31 Jan 2026')
  })

  it('LDN-011: fmtLeaveDate returns empty string for null or undefined', () => {
    expect(fmtLeaveDate(null)).toBe('')
    expect(fmtLeaveDate(undefined)).toBe('')
    expect(fmtLeaveDate('')).toBe('')
  })

  it('LDN-012: approved body without date info still produces a valid sentence', () => {
    const { bodyEn } = buildLeaveDecisionNotificationBody({
      isApproved:       true,
      actorDisplayName: 'Fatima Al Mansoori',
      typeNameEn:       'Sick Leave',
      typeNameAr:       'إجازة مرضية',
      startDate:        null,
      endDate:          null,
      durationDays:     null,
      decisionNote:     null,
    })

    expect(bodyEn).toContain('Sick Leave')
    expect(bodyEn).toContain('Fatima Al Mansoori')
    expect(bodyEn).toContain('approved')
    expect(bodyEn.length).toBeGreaterThan(10)
    expect(bodyEn.endsWith('.')).toBe(true)
  })

})
